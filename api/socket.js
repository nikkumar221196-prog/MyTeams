const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

// Global storage that persists across serverless invocations
let globalIO = null;
const teams = global.teams || (global.teams = new Map());
const users = global.users || (global.users = new Map());
const messages = global.messages || (global.messages = new Map());
const directMessages = global.directMessages || (global.directMessages = new Map());
const unreadCounts = global.unreadCounts || (global.unreadCounts = new Map());
const userSessions = global.userSessions || (global.userSessions = new Map());
const allTeamUsers = global.allTeamUsers || (global.allTeamUsers = new Map());

// Helper functions
function getUserKey(teamCode, userName) {
    return `${teamCode}:${userName}`.toLowerCase();
}

function getDirectChatId(userKey1, userKey2) {
    return [userKey1, userKey2].sort().join('|');
}

function getAllTeamUsers(teamCode) {
    const allUsers = [];
    const seenUsers = new Set();
    
    if (allTeamUsers.has(teamCode)) {
        const teamUserData = allTeamUsers.get(teamCode);
        
        teamUserData.forEach((userData, userKey) => {
            if (seenUsers.has(userKey)) return;
            seenUsers.add(userKey);
            
            const onlineUser = Array.from(users.values()).find(u => u.userKey === userKey);
            
            if (onlineUser) {
                allUsers.push({
                    id: onlineUser.id,
                    userKey: userKey,
                    name: userData.name,
                    online: true,
                    lastSeen: Date.now()
                });
            } else {
                allUsers.push({
                    id: null,
                    userKey: userKey,
                    name: userData.name,
                    online: false,
                    lastSeen: userData.lastSeen
                });
            }
        });
    }
    
    return allUsers;
}

module.exports = function handler(req, res) {
    if (!res.socket.server.io) {
        console.log('Initializing Socket.io for Vercel...');
        
        const io = new Server(res.socket.server, {
            path: '/api/socket',
            addTrailingSlash: false,
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
            transports: ['polling', 'websocket'],
            allowEIO3: true,
            pingTimeout: 120000,
            pingInterval: 25000,
            upgradeTimeout: 30000,
            maxHttpBufferSize: 1e6
        });

        // Store the IO instance globally
        globalIO = io;
        res.socket.server.io = io;

        io.on('connection', (socket) => {
            console.log('User connected:', socket.id);

            socket.on('join-team', (data) => {
                const { teamCode, userName } = data;
                console.log(`\n=== JOIN TEAM REQUEST ===`);
                console.log(`User: ${userName}, Team: ${teamCode}, Socket: ${socket.id}`);
                
                if (!teams.has(teamCode)) {
                    teams.set(teamCode, new Set());
                    console.log(`Created new team: ${teamCode}`);
                }
                
                const userKey = getUserKey(teamCode, userName);
                console.log(`User key: ${userKey}`);
                
                // Clean up any existing session for this user
                if (userSessions.has(userKey)) {
                    const existingSocketId = userSessions.get(userKey);
                    console.log(`Found existing session for ${userName}: ${existingSocketId}`);
                    
                    if (users.has(existingSocketId) && existingSocketId !== socket.id) {
                        const oldTeamCode = users.get(existingSocketId).teamCode;
                        teams.get(oldTeamCode)?.delete(existingSocketId);
                        users.delete(existingSocketId);
                        console.log(`Cleaned up old session: ${existingSocketId}`);
                    }
                }
                
                const user = {
                    id: socket.id,
                    userKey: userKey,
                    name: userName,
                    teamCode: teamCode,
                    online: true,
                    lastSeen: Date.now()
                };
                
                // Store user in all maps
                users.set(socket.id, user);
                teams.get(teamCode).add(socket.id);
                userSessions.set(userKey, socket.id);
                socket.join(teamCode);
                
                // Update persistent user data
                if (!allTeamUsers.has(teamCode)) {
                    allTeamUsers.set(teamCode, new Map());
                }
                allTeamUsers.get(teamCode).set(userKey, {
                    name: userName,
                    userKey: userKey,
                    lastSeen: Date.now(),
                    online: true
                });
                
                if (!unreadCounts.has(socket.id)) {
                    unreadCounts.set(socket.id, new Map());
                }
                
                console.log(`✓ User ${userName} joined team ${teamCode}`);
                console.log(`Team size: ${teams.get(teamCode).size}`);
                console.log(`Total online users: ${users.size}`);
                
                // Send message history immediately
                if (messages.has(teamCode)) {
                    const teamMessages = messages.get(teamCode);
                    socket.emit('message-history', {
                        chatType: 'team',
                        chatId: teamCode,
                        messages: teamMessages
                    });
                    console.log(`✓ Sent ${teamMessages.length} team messages to ${userName}`);
                }
                
                // Get and broadcast updated user list
                const allUsersInTeam = getAllTeamUsers(teamCode);
                console.log(`Broadcasting user list to team ${teamCode}: ${allUsersInTeam.length} users`);
                console.log('Users:', allUsersInTeam.map(u => `${u.name}(${u.online ? 'online' : 'offline'})`));
                
                // Send to all team members including the new user
                io.to(teamCode).emit('users-update', allUsersInTeam);
                
                // Send join success to new user
                socket.emit('join-success', { teamCode, userName });
                
                // Also send a separate status update to ensure online status is visible
                setTimeout(() => {
                    const refreshedUserList = getAllTeamUsers(teamCode);
                    io.to(teamCode).emit('users-update', refreshedUserList);
                    console.log(`✓ Sent refreshed user list to team ${teamCode}`);
                }, 1000);
                
                console.log(`=== JOIN COMPLETE ===\n`);
            });

            socket.on('send-message', (data) => {
                console.log(`\n=== SEND MESSAGE REQUEST ===`);
                console.log(`Socket ID: ${socket.id}`);
                console.log(`Available users: ${Array.from(users.keys()).join(', ')}`);
                
                const user = users.get(socket.id);
                if (!user) {
                    console.log(`❌ ERROR: User not found for socket ${socket.id}`);
                    console.log(`Available users: ${Array.from(users.entries()).map(([id, u]) => `${id}:${u.name}`).join(', ')}`);
                    
                    // Try to find user by checking if this socket might be in a different state
                    let foundUser = null;
                    for (const [socketId, userData] of users.entries()) {
                        if (socketId === socket.id) {
                            foundUser = userData;
                            break;
                        }
                    }
                    
                    if (!foundUser) {
                        console.log(`❌ No user found anywhere, requesting rejoin`);
                        socket.emit('session-expired');
                        return;
                    } else {
                        console.log(`✓ Found user data, continuing with message`);
                    }
                }
                
                const actualUser = user || foundUser;
                const { text, file, chatType, targetUserId, targetUserKey } = data;
                console.log(`Message from ${actualUser.name}:`, { text, chatType, targetUserId, targetUserKey });
                
                const message = {
                    id: uuidv4(),
                    userId: socket.id,
                    userKey: actualUser.userKey,
                    userName: actualUser.name,
                    text: text || '',
                    file: file || null,
                    timestamp: Date.now(),
                    teamCode: actualUser.teamCode,
                    chatType: chatType || 'team',
                    targetUserId: targetUserId,
                    targetUserKey: targetUserKey
                };
                
                if (chatType === 'direct' && (targetUserId || targetUserKey)) {
                    // DIRECT MESSAGE HANDLING
                    let targetUser = null;
                    let chatId = null;
                    let actualTargetSocketId = null;
                    
                    if (targetUserId) {
                        // Check if targetUserId is a socket ID (online user)
                        if (users.has(targetUserId)) {
                            targetUser = users.get(targetUserId);
                            chatId = getDirectChatId(actualUser.userKey, targetUser.userKey);
                            actualTargetSocketId = targetUserId;
                            console.log(`✓ Direct message to ONLINE user: ${targetUser.name} (${targetUserId})`);
                        } else {
                            // targetUserId might be a userKey (offline user reference)
                            console.log('Target not found as online user, checking offline users...');
                            if (allTeamUsers.has(actualUser.teamCode)) {
                                const teamUserData = allTeamUsers.get(actualUser.teamCode);
                                if (teamUserData.has(targetUserId)) {
                                    const offlineUserData = teamUserData.get(targetUserId);
                                    targetUser = {
                                        userKey: targetUserId,
                                        name: offlineUserData.name,
                                        online: false
                                    };
                                    chatId = getDirectChatId(actualUser.userKey, targetUserId);
                                    
                                    // Check if user is actually online with different socket ID
                                    actualTargetSocketId = userSessions.get(targetUserId);
                                    if (actualTargetSocketId && users.has(actualTargetSocketId)) {
                                        console.log(`✓ User is actually online: ${actualTargetSocketId}`);
                                        targetUser.online = true;
                                        targetUser.id = actualTargetSocketId;
                                    }
                                }
                            }
                        }
                    } else if (targetUserKey) {
                        chatId = getDirectChatId(actualUser.userKey, targetUserKey);
                        console.log(`Direct message to user key: ${targetUserKey}`);
                        
                        if (allTeamUsers.has(actualUser.teamCode)) {
                            const teamUserData = allTeamUsers.get(actualUser.teamCode);
                            if (teamUserData.has(targetUserKey)) {
                                const offlineUserData = teamUserData.get(targetUserKey);
                                targetUser = {
                                    userKey: targetUserKey,
                                    name: offlineUserData.name,
                                    online: false
                                };
                                
                                // Check if user is online
                                actualTargetSocketId = userSessions.get(targetUserKey);
                                if (actualTargetSocketId && users.has(actualTargetSocketId)) {
                                    console.log(`✓ User is online: ${actualTargetSocketId}`);
                                    targetUser.online = true;
                                    targetUser.id = actualTargetSocketId;
                                }
                            }
                        }
                    }
                    
                    if (!targetUser) {
                        console.log('❌ ERROR: Could not identify target user');
                        socket.emit('error', { message: 'Target user not found' });
                        return;
                    }
                    
                    if (!directMessages.has(chatId)) {
                        directMessages.set(chatId, []);
                    }
                    
                    // Store message with persistence
                    const storedMessage = {
                        ...message,
                        targetUserKey: targetUser.userKey || targetUserKey
                    };
                    directMessages.get(chatId).push(storedMessage);
                    console.log(`✓ Stored message in chat ${chatId}. Total messages: ${directMessages.get(chatId).length}`);
                    
                    // ALWAYS send to sender first (immediate feedback)
                    console.log('✓ Sending message confirmation to sender...');
                    socket.emit('new-message', message);
                    
                    // Send to target user
                    if (actualTargetSocketId && users.has(actualTargetSocketId)) {
                        console.log(`✓ Sending message to target user: ${actualTargetSocketId} (${targetUser.name})`);
                        io.to(actualTargetSocketId).emit('new-message', message);
                        
                        // Update unread counts for target
                        if (!unreadCounts.has(actualTargetSocketId)) {
                            unreadCounts.set(actualTargetSocketId, new Map());
                        }
                        const targetUnreads = unreadCounts.get(actualTargetSocketId);
                        const currentCount = targetUnreads.get(socket.id) || 0;
                        targetUnreads.set(socket.id, currentCount + 1);
                        
                        // Send unread notification to target
                        io.to(actualTargetSocketId).emit('unread-update', {
                            fromUserId: socket.id,
                            fromUserName: actualUser.name,
                            count: currentCount + 1
                        });
                        
                        console.log(`✓ Updated unread count for ${targetUser.name}: ${currentCount + 1}`);
                    } else {
                        console.log('⚠ Target user offline, message saved for later delivery');
                    }
                    
                } else {
                    // TEAM MESSAGE HANDLING
                    console.log(`Team message in ${actualUser.teamCode}`);
                    
                    if (!messages.has(actualUser.teamCode)) {
                        messages.set(actualUser.teamCode, []);
                    }
                    
                    messages.get(actualUser.teamCode).push(message);
                    console.log(`✓ Stored team message. Total: ${messages.get(actualUser.teamCode).length}`);
                    
                    // Broadcast to ALL team members including sender
                    console.log(`✓ Broadcasting to team ${actualUser.teamCode}`);
                    io.to(actualUser.teamCode).emit('new-message', message);
                }
                
                console.log('=== MESSAGE PROCESSING COMPLETE ===\n');
            });

            socket.on('get-direct-messages', (data) => {
                const { targetUserId } = data;
                const currentUser = users.get(socket.id);
                
                console.log(`Direct message history request: ${currentUser?.name} -> target: ${targetUserId}`);
                
                if (!currentUser) {
                    console.log('ERROR: Current user not found');
                    socket.emit('session-expired');
                    return;
                }
                
                let targetUser = users.get(targetUserId);
                let chatId = null;
                
                if (targetUser) {
                    // Target is online
                    chatId = getDirectChatId(currentUser.userKey, targetUser.userKey);
                    console.log(`Target online: ${targetUser.name}`);
                } else {
                    // Target might be offline, search by userKey or name
                    if (allTeamUsers.has(currentUser.teamCode)) {
                        const teamUserData = allTeamUsers.get(currentUser.teamCode);
                        
                        // Try to find by targetUserId as userKey
                        if (teamUserData.has(targetUserId)) {
                            const offlineUserData = teamUserData.get(targetUserId);
                            targetUser = {
                                userKey: targetUserId,
                                name: offlineUserData.name,
                                online: false
                            };
                            chatId = getDirectChatId(currentUser.userKey, targetUserId);
                            console.log(`Found offline user by userKey: ${targetUser.name}`);
                        } else {
                            // Search by name or partial match
                            for (const [userKey, userData] of teamUserData) {
                                if (userData.name === targetUserId || userKey.includes(targetUserId)) {
                                    targetUser = {
                                        userKey: userKey,
                                        name: userData.name,
                                        online: false
                                    };
                                    chatId = getDirectChatId(currentUser.userKey, userKey);
                                    console.log(`Found user by search: ${targetUser.name}`);
                                    break;
                                }
                            }
                        }
                    }
                }
                
                if (!targetUser || !chatId) {
                    console.log('ERROR: Target user not found anywhere');
                    socket.emit('message-history', {
                        chatType: 'direct',
                        chatId: targetUserId,
                        messages: []
                    });
                    return;
                }
                
                const chatMessages = directMessages.get(chatId) || [];
                console.log(`Sending ${chatMessages.length} direct messages for chat ${chatId}`);
                
                socket.emit('message-history', {
                    chatType: 'direct',
                    chatId: targetUserId,
                    messages: chatMessages
                });
            });

            socket.on('get-direct-messages-by-key', (data) => {
                const { targetUserKey } = data;
                const currentUser = users.get(socket.id);
                
                console.log(`Direct message history by key: ${currentUser?.name} -> ${targetUserKey}`);
                
                if (!currentUser) {
                    console.log('ERROR: Current user not found');
                    return;
                }
                
                const chatId = getDirectChatId(currentUser.userKey, targetUserKey);
                const chatMessages = directMessages.get(chatId) || [];
                
                console.log(`Sending ${chatMessages.length} direct messages for chat ${chatId}`);
                
                socket.emit('message-history', {
                    chatType: 'direct',
                    chatId: targetUserKey,
                    messages: chatMessages
                });
            });

            socket.on('delete-message', (data) => {
                const user = users.get(socket.id);
                if (!user) return;
                
                const { messageId, deleteFor } = data;
                console.log(`Delete message: ${messageId} by ${user.name} (${deleteFor})`);
                
                // Check team messages
                if (messages.has(user.teamCode)) {
                    const teamMessages = messages.get(user.teamCode);
                    const messageIndex = teamMessages.findIndex(msg => msg.id === messageId);
                    
                    if (messageIndex !== -1) {
                        const message = teamMessages[messageIndex];
                        
                        if (message.userKey === user.userKey) {
                            if (deleteFor === 'everyone') {
                                teamMessages.splice(messageIndex, 1);
                                io.to(user.teamCode).emit('message-deleted', { messageId, deleteFor });
                            } else {
                                socket.emit('message-deleted', { messageId, deleteFor: 'me' });
                            }
                            return;
                        }
                    }
                }
                
                // Check direct messages
                directMessages.forEach((chatMessages, chatId) => {
                    const messageIndex = chatMessages.findIndex(msg => msg.id === messageId);
                    if (messageIndex !== -1) {
                        const message = chatMessages[messageIndex];
                        
                        if (message.userKey === user.userKey) {
                            if (deleteFor === 'everyone') {
                                chatMessages.splice(messageIndex, 1);
                                io.to(user.teamCode).emit('message-deleted', { messageId, deleteFor });
                            } else {
                                socket.emit('message-deleted', { messageId, deleteFor: 'me' });
                            }
                        }
                    }
                });
            });

            socket.on('delete-conversation', (data) => {
                const user = users.get(socket.id);
                if (!user) return;
                
                const { chatType, teamCode, targetId } = data;
                console.log(`Delete conversation: ${chatType} by ${user.name}`);
                
                if (chatType === 'team' && teamCode === user.teamCode) {
                    if (messages.has(teamCode)) {
                        messages.set(teamCode, []);
                        io.to(teamCode).emit('conversation-deleted', { chatType: 'team' });
                    }
                } else if (chatType === 'direct') {
                    let chatId = null;
                    
                    if (targetId && targetId.includes(':')) {
                        chatId = getDirectChatId(user.userKey, targetId);
                    } else {
                        const targetUser = users.get(targetId);
                        if (targetUser) {
                            chatId = getDirectChatId(user.userKey, targetUser.userKey);
                        }
                    }
                    
                    if (chatId && directMessages.has(chatId)) {
                        directMessages.set(chatId, []);
                        socket.emit('conversation-deleted', { chatType: 'direct', targetId: targetId });
                        if (targetId && !targetId.includes(':')) {
                            socket.to(targetId).emit('conversation-deleted', { chatType: 'direct', targetId: socket.id });
                        }
                    }
                }
            });

            socket.on('refresh-users', () => {
                const user = users.get(socket.id);
                if (user) {
                    console.log(`Refresh users request from ${user.name}`);
                    const allUsersInTeam = getAllTeamUsers(user.teamCode);
                    socket.emit('users-update', allUsersInTeam);
                    console.log(`Sent refreshed user list: ${allUsersInTeam.length} users`);
                }
            });

            socket.on('disconnect', (reason) => {
                console.log(`User disconnected: ${socket.id}, reason: ${reason}`);
                const user = users.get(socket.id);
                if (user) {
                    console.log(`Cleaning up user: ${user.name}`);
                    
                    if (allTeamUsers.has(user.teamCode)) {
                        const teamUserData = allTeamUsers.get(user.teamCode);
                        if (teamUserData.has(user.userKey)) {
                            const userData = teamUserData.get(user.userKey);
                            userData.online = false;
                            userData.lastSeen = Date.now();
                            teamUserData.set(user.userKey, userData);
                        }
                    }
                    
                    userSessions.delete(user.userKey);
                    
                    if (teams.has(user.teamCode)) {
                        const allUsersInTeam = getAllTeamUsers(user.teamCode);
                        socket.broadcast.to(user.teamCode).emit('users-update', allUsersInTeam);
                    }
                    
                    teams.get(user.teamCode)?.delete(socket.id);
                    users.delete(socket.id);
                    unreadCounts.delete(socket.id);
                }
            });
        });
    } else {
        // Reuse existing IO instance
        globalIO = res.socket.server.io;
    }
    
    res.end();
};