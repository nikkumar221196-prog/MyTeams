const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

// In-memory storage for Vercel serverless function
const teams = new Map();
const users = new Map();
const messages = new Map();
const directMessages = new Map();
const unreadCounts = new Map();
const userSessions = new Map();
const allTeamUsers = new Map();

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
            }
        });

        io.on('connection', (socket) => {
            console.log('User connected:', socket.id);

            socket.on('join-team', (data) => {
                const { teamCode, userName } = data;
                
                if (!teams.has(teamCode)) {
                    teams.set(teamCode, new Set());
                }
                
                const userKey = getUserKey(teamCode, userName);
                
                if (userSessions.has(userKey)) {
                    const existingSocketId = userSessions.get(userKey);
                    if (users.has(existingSocketId)) {
                        teams.get(teamCode).delete(existingSocketId);
                        users.delete(existingSocketId);
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
                
                if (messages.has(teamCode)) {
                    socket.emit('message-history', {
                        chatType: 'team',
                        chatId: teamCode,
                        messages: messages.get(teamCode)
                    });
                }
                
                const allUsersInTeam = getAllTeamUsers(teamCode);
                io.to(teamCode).emit('users-update', allUsersInTeam);
                
                socket.emit('join-success', { teamCode, userName });
            });

            socket.on('send-message', (data) => {
                const user = users.get(socket.id);
                if (!user) return;
                
                const { text, file, chatType, targetUserId, targetUserKey } = data;
                
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
                    let targetUser = null;
                    let chatId = null;
                    
                    if (targetUserId) {
                        targetUser = users.get(targetUserId);
                        if (targetUser) {
                            chatId = getDirectChatId(user.userKey, targetUser.userKey);
                        }
                    } else if (targetUserKey) {
                        chatId = getDirectChatId(user.userKey, targetUserKey);
                        
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
                    
                    if (!targetUser) return;
                    
                    if (!directMessages.has(chatId)) {
                        directMessages.set(chatId, []);
                    }
                    
                    directMessages.get(chatId).push({
                        ...message,
                        targetUserKey: targetUser.userKey || targetUserKey
                    });
                    
                    socket.emit('new-message', message);
                    
                    if (targetUser.online !== false && targetUserId) {
                        socket.to(targetUserId).emit('new-message', message);
                    }
                } else {
                    if (!messages.has(user.teamCode)) {
                        messages.set(user.teamCode, []);
                    }
                    
                    messages.get(user.teamCode).push(message);
                    io.to(user.teamCode).emit('new-message', message);
                }
            });

            socket.on('get-direct-messages', (data) => {
                const { targetUserId } = data;
                const currentUser = users.get(socket.id);
                const targetUser = users.get(targetUserId);
                
                if (!currentUser || !targetUser) return;
                
                const chatId = getDirectChatId(currentUser.userKey, targetUser.userKey);
                
                socket.emit('message-history', {
                    chatType: 'direct',
                    chatId: targetUserId,
                    messages: directMessages.get(chatId) || []
                });
            });

            socket.on('get-direct-messages-by-key', (data) => {
                const { targetUserKey } = data;
                const currentUser = users.get(socket.id);
                
                if (!currentUser) return;
                
                const chatId = getDirectChatId(currentUser.userKey, targetUserKey);
                
                socket.emit('message-history', {
                    chatType: 'direct',
                    chatId: targetUserKey,
                    messages: directMessages.get(chatId) || []
                });
            });

            socket.on('delete-message', (data) => {
                const user = users.get(socket.id);
                if (!user) return;
                
                const { messageId, deleteFor } = data;
                
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

            socket.on('disconnect', () => {
                const user = users.get(socket.id);
                if (user) {
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
                        socket.to(user.teamCode).emit('users-update', allUsersInTeam);
                    }
                    
                    teams.get(user.teamCode)?.delete(socket.id);
                    users.delete(socket.id);
                    unreadCounts.delete(socket.id);
                }
            });
        });

        res.socket.server.io = io;
    }
    
    res.end();
};