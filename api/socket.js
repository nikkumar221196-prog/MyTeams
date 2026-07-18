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
                console.log(`Join request: ${userName} joining ${teamCode}`);
                
                if (!teams.has(teamCode)) {
                    teams.set(teamCode, new Set());
                }
                
                const userKey = getUserKey(teamCode, userName);
                
                // Remove existing session for this user
                if (userSessions.has(userKey)) {
                    const existingSocketId = userSessions.get(userKey);
                    if (users.has(existingSocketId)) {
                        const oldTeamCode = users.get(existingSocketId).teamCode;
                        teams.get(oldTeamCode)?.delete(existingSocketId);
                        users.delete(existingSocketId);
                        console.log(`Removed old session for ${userName}`);
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
                
                users.set(socket.id, user);
                teams.get(teamCode).add(socket.id);
                userSessions.set(userKey, socket.id);
                socket.join(teamCode);
                
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
                
                // Send message history immediately
                if (messages.has(teamCode)) {
                    const teamMessages = messages.get(teamCode);
                    socket.emit('message-history', {
                        chatType: 'team',
                        chatId: teamCode,
                        messages: teamMessages
                    });
                    console.log(`Sent ${teamMessages.length} team messages to ${userName}`);
                }
                
                const allUsersInTeam = getAllTeamUsers(teamCode);
                console.log(`Broadcasting user list update to team ${teamCode}: ${allUsersInTeam.length} users`);
                io.to(teamCode).emit('users-update', allUsersInTeam);
                
                socket.emit('join-success', { teamCode, userName });
                console.log(`${userName} successfully joined ${teamCode}`);
            });

            socket.on('send-message', (data) => {
                const user = users.get(socket.id);
                if (!user) {
                    console.log('ERROR: User not found for socket:', socket.id);
                    socket.emit('error', { message: 'User session not found' });
                    return;
                }
                
                const { text, file, chatType, targetUserId, targetUserKey } = data;
                console.log(`\n=== MESSAGE FROM ${user.name} ===`);
                console.log('Message data:', { text, chatType, targetUserId, targetUserKey });
                
                const message = {
                    id: uuidv4(),
                    userId: socket.id,
                    userKey: user.userKey,
                    userName: user.name,
                    text: text || '',
                    file: file || null,
                    timestamp: Date.now(),
                    teamCode: user.teamCode,
                    chatType: chatType || 'team',
                    targetUserId: targetUserId,
                    targetUserKey: targetUserKey
                };
                
                if (chatType === 'direct' && (targetUserId || targetUserKey)) {
                    // DIRECT MESSAGE HANDLING
                    let targetUser = null;
                    let chatId = null;
                    
                    if (targetUserId) {
                        targetUser = users.get(targetUserId);
                        if (targetUser) {
                            chatId = getDirectChatId(user.userKey, targetUser.userKey);
                            console.log(`Direct message to ONLINE user: ${targetUser.name} (${targetUserId})`);
                        } else {
                            console.log('ERROR: Target user ID not found:', targetUserId);
                        }
                    } else if (targetUserKey) {
                        chatId = getDirectChatId(user.userKey, targetUserKey);
                        console.log(`Direct message to OFFLINE user: ${targetUserKey}`);
                        
                        if (allTeamUsers.has(user.teamCode)) {
                            const teamUserData = allTeamUsers.get(user.teamCode);
                            if (teamUserData.has(targetUserKey)) {
                                const offlineUserData = teamUserData.get(targetUserKey);
                                targetUser = {
                                    userKey: targetUserKey,
                                    name: offlineUserData.name,
                                    online: false
                                };
                            }
                        }
                    }
                    
                    if (!targetUser) {
                        console.log('ERROR: Could not identify target user');
                        socket.emit('error', { message: 'Target user not found' });
                        return;
                    }
                    
                    if (!directMessages.has(chatId)) {
                        directMessages.set(chatId, []);
                    }
                    
                    // Store message
                    const storedMessage = {
                        ...message,
                        targetUserKey: targetUser.userKey || targetUserKey
                    };
                    directMessages.get(chatId).push(storedMessage);
                    console.log(`Stored message in chat ${chatId}. Total messages: ${directMessages.get(chatId).length}`);
                    
                    // Send to sender (should appear immediately on sender's screen)
                    console.log('Sending message back to sender...');
                    socket.emit('new-message', message);
                    
                    // Send to target if online
                    if (targetUser.online !== false && targetUserId) {
                        console.log(`Sending message to online target: ${targetUserId}`);
                        socket.to(targetUserId).emit('new-message', message);
                        
                        // Verify the target socket exists
                        const targetSocket = io.sockets.sockets.get(targetUserId);
                        if (targetSocket) {
                            console.log(`Target socket confirmed: ${targetUserId}`);
                        } else {
                            console.log(`WARNING: Target socket not found: ${targetUserId}`);
                        }
                    } else {
                        console.log('Target user offline, message saved for later delivery');
                    }
                    
                } else {
                    // TEAM MESSAGE HANDLING
                    console.log(`Team message in ${user.teamCode}`);
                    
                    if (!messages.has(user.teamCode)) {
                        messages.set(user.teamCode, []);
                    }
                    
                    messages.get(user.teamCode).push(message);
                    console.log(`Stored team message. Total: ${messages.get(user.teamCode).length}`);
                    
                    // Send to all team members INCLUDING sender
                    console.log(`Broadcasting to team ${user.teamCode}`);
                    io.to(user.teamCode).emit('new-message', message);
                    
                    // Also send directly to sender to ensure they see it
                    socket.emit('new-message', message);
                }
                
                console.log('=== MESSAGE PROCESSING COMPLETE ===\n');
            });

            socket.on('get-direct-messages', (data) => {
                const { targetUserId } = data;
                const currentUser = users.get(socket.id);
                const targetUser = users.get(targetUserId);
                
                console.log(`Direct message history request: ${currentUser?.name} -> ${targetUser?.name}`);
                
                if (!currentUser) {
                    console.log('ERROR: Current user not found');
                    return;
                }
                
                if (!targetUser) {
                    console.log('ERROR: Target user not found for ID:', targetUserId);
                    return;
                }
                
                const chatId = getDirectChatId(currentUser.userKey, targetUser.userKey);
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