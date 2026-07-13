const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data persistence
const DATA_DIR = './data';
const TEAMS_FILE = path.join(DATA_DIR, 'teams.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const DIRECT_MESSAGES_FILE = path.join(DATA_DIR, 'directMessages.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ALL_USERS_FILE = path.join(DATA_DIR, 'allTeamUsers.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Load data from files
function loadData() {
    try {
        if (fs.existsSync(MESSAGES_FILE)) {
            const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
            const messagesData = JSON.parse(data);
            messagesData.forEach(([key, value]) => {
                messages.set(key, value);
            });
        }
        
        if (fs.existsSync(DIRECT_MESSAGES_FILE)) {
            const data = fs.readFileSync(DIRECT_MESSAGES_FILE, 'utf8');
            const directMessagesData = JSON.parse(data);
            directMessagesData.forEach(([key, value]) => {
                directMessages.set(key, value);
            });
        }
        
        // Load persistent unread counts
        const UNREAD_FILE = path.join(DATA_DIR, 'unreadCounts.json');
        if (fs.existsSync(UNREAD_FILE)) {
            const data = fs.readFileSync(UNREAD_FILE, 'utf8');
            const unreadData = JSON.parse(data);
            unreadData.forEach(([key, value]) => {
                persistentUnreadCounts.set(key, new Map(value));
            });
        }
        
        // Load all team users (persistent user history)
        if (fs.existsSync(ALL_USERS_FILE)) {
            const data = fs.readFileSync(ALL_USERS_FILE, 'utf8');
            const allUsersData = JSON.parse(data);
            allUsersData.forEach(([teamCode, users]) => {
                allTeamUsers.set(teamCode, new Map(users.map(([userKey, userData]) => [userKey, userData])));
            });
        }
        
        console.log('Data loaded successfully');
    } catch (error) {
        console.log('No existing data found, starting fresh');
    }
}

// Save data to files
function saveMessages() {
    try {
        const messagesData = Array.from(messages.entries());
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messagesData, null, 2));
        
        const directMessagesData = Array.from(directMessages.entries());
        fs.writeFileSync(DIRECT_MESSAGES_FILE, JSON.stringify(directMessagesData, null, 2));
        
        // Save persistent unread counts
        const UNREAD_FILE = path.join(DATA_DIR, 'unreadCounts.json');
        const unreadData = Array.from(persistentUnreadCounts.entries()).map(([key, value]) => [
            key, Array.from(value.entries())
        ]);
        fs.writeFileSync(UNREAD_FILE, JSON.stringify(unreadData, null, 2));
        
        // Save all team users
        const allUsersData = Array.from(allTeamUsers.entries()).map(([teamCode, users]) => [
            teamCode, Array.from(users.entries())
        ]);
        fs.writeFileSync(ALL_USERS_FILE, JSON.stringify(allUsersData, null, 2));
        
        console.log('Messages and user data saved to disk');
    } catch (error) {
        console.error('Error saving messages:', error);
    }
}

// Get unique user ID based on team and name
function getUserKey(teamCode, userName) {
    return `${teamCode}:${userName}`.toLowerCase();
}

// Get direct message chat ID using user keys instead of socket IDs
function getDirectChatId(userKey1, userKey2) {
    return [userKey1, userKey2].sort().join('|');
}

// Get all users for a team (online + offline with chat history)
function getAllTeamUsers(teamCode) {
    const allUsers = [];
    const seenUsers = new Set();
    
    if (allTeamUsers.has(teamCode)) {
        const teamUserData = allTeamUsers.get(teamCode);
        
        teamUserData.forEach((userData, userKey) => {
            if (seenUsers.has(userKey)) return;
            seenUsers.add(userKey);
            
            // Check if user is currently online
            const onlineUser = Array.from(users.values()).find(u => u.userKey === userKey);
            
            if (onlineUser) {
                // User is online, use current data
                allUsers.push({
                    id: onlineUser.id,
                    userKey: userKey,
                    name: userData.name,
                    online: true,
                    lastSeen: Date.now()
                });
            } else {
                // User is offline, use persistent data
                allUsers.push({
                    id: null, // No socket ID when offline
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

// In-memory storage (with persistence)
const teams = new Map();
const users = new Map();
const messages = new Map();
const directMessages = new Map(); // For 1-on-1 chats
const unreadCounts = new Map(); // Track unread message counts
const persistentUnreadCounts = new Map(); // Persistent unread counts by userKey
const userSessions = new Map(); // Track active users by userKey to prevent duplicates
const allTeamUsers = new Map(); // Track all users who have ever been in each team (persistent)

// Load existing data on startup
loadData();

// Auto-delete messages after 24 hours instead of 2 hours (for testing)
let AUTO_DELETE_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Clean up messages periodically (disabled for testing)
/*
setInterval(() => {
  const now = Date.now();
  let hasChanges = false;
  
  messages.forEach((teamMessages, teamCode) => {
    const filteredMessages = teamMessages.filter(msg => 
      (now - msg.timestamp) < AUTO_DELETE_TIME
    );
    if (filteredMessages.length !== teamMessages.length) {
      messages.set(teamCode, filteredMessages);
      hasChanges = true;
    }
  });
  
  directMessages.forEach((chatMessages, chatId) => {
    const filteredMessages = chatMessages.filter(msg => 
      (now - msg.timestamp) < AUTO_DELETE_TIME
    );
    if (filteredMessages.length !== chatMessages.length) {
      directMessages.set(chatId, filteredMessages);
      hasChanges = true;
    }
  });
  
  if (hasChanges) {
    saveMessages();
  }
}, 60000); // Check every minute
*/

// Socket connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join team
  socket.on('join-team', (data) => {
    const { teamCode, userName } = data;
    
    if (!teams.has(teamCode)) {
      teams.set(teamCode, new Set());
    }
    
    const userKey = getUserKey(teamCode, userName);
    
    // Remove existing session for this user to prevent duplicates
    if (userSessions.has(userKey)) {
      const existingSocketId = userSessions.get(userKey);
      if (users.has(existingSocketId)) {
        const existingUser = users.get(existingSocketId);
        teams.get(teamCode).delete(existingSocketId);
        users.delete(existingSocketId);
        console.log(`Removed duplicate session for ${userName}`);
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
    userSessions.set(userKey, socket.id); // Track current session
    socket.join(teamCode);
    
    // Add user to persistent team user list
    if (!allTeamUsers.has(teamCode)) {
      allTeamUsers.set(teamCode, new Map());
    }
    allTeamUsers.get(teamCode).set(userKey, {
      name: userName,
      userKey: userKey,
      lastSeen: Date.now(),
      online: true
    });
    
    console.log(`User ${userName} joined team ${teamCode} with key ${userKey}`);
    
    // Initialize unread counts for this user
    if (!unreadCounts.has(socket.id)) {
      unreadCounts.set(socket.id, new Map());
    }
    
    // Load persistent unread counts for this user
    if (persistentUnreadCounts.has(userKey)) {
      const savedUnreads = persistentUnreadCounts.get(userKey);
      const currentUnreads = new Map();
      
      // Convert saved unread counts to current socket IDs
      savedUnreads.forEach((count, senderUserKey) => {
        // Find current socket ID for the sender
        const senderSocketId = Array.from(users.values())
          .find(u => u.userKey === senderUserKey)?.id;
        if (senderSocketId && count > 0) {
          currentUnreads.set(senderSocketId, count);
        }
      });
      
      unreadCounts.set(socket.id, currentUnreads);
    }
    
    // Send existing team messages to the user
    if (messages.has(teamCode)) {
      socket.emit('message-history', {
        chatType: 'team',
        chatId: teamCode,
        messages: messages.get(teamCode)
      });
      console.log(`Sent ${messages.get(teamCode).length} team messages to ${userName}`);
    }
    
    // Send unread counts to user
    if (unreadCounts.has(socket.id)) {
      const userUnreads = unreadCounts.get(socket.id);
      userUnreads.forEach((count, senderSocketId) => {
        if (count > 0) {
          socket.emit('unread-update', {
            fromUserId: senderSocketId,
            count: count
          });
        }
      });
    }
    
    // Notify team members about new user
    socket.to(teamCode).emit('user-joined', {
      userId: socket.id,
      userName: userName
    });
    
    // Send updated user list to all team members (including offline users)
    const allUsersInTeam = getAllTeamUsers(teamCode);
    io.to(teamCode).emit('users-update', allUsersInTeam);
    
    socket.emit('join-success', { teamCode, userName });
  });

  // Handle chat messages
  socket.on('send-message', (data) => {
    const user = users.get(socket.id);
    if (!user) {
      console.log('User not found for message sending');
      return;
    }
    
    const { text, file, chatType, targetUserId, targetUserKey } = data;
    console.log(`Processing message from ${user.name}:`, { 
      hasText: !!text, 
      hasFile: !!file, 
      chatType, 
      targetUserId, 
      targetUserKey 
    });
    
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
        // Target user is online
        targetUser = users.get(targetUserId);
        if (targetUser) {
          chatId = getDirectChatId(user.userKey, targetUser.userKey);
        }
      } else if (targetUserKey) {
        // Target user is offline, use their userKey
        chatId = getDirectChatId(user.userKey, targetUserKey);
        
        // Create a mock user object for offline user
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
        console.log('Target user not found');
        return;
      }
      
      if (!directMessages.has(chatId)) {
        directMessages.set(chatId, []);
      }
      
      // Store with user keys for persistence
      const persistentMessage = {
        ...message,
        targetUserKey: targetUser.userKey || targetUserKey
      };
      
      directMessages.get(chatId).push(persistentMessage);
      
      console.log(`Direct message saved: ${chatId}, total: ${directMessages.get(chatId).length}`);
      
      // Save messages to file
      saveMessages();
      
      // Send to sender immediately
      console.log('Sending message back to sender');
      socket.emit('new-message', message);
      
      // Send to target if online
      if (targetUser.online !== false && targetUserId) {
        console.log('Sending message to online target user');
        socket.to(targetUserId).emit('new-message', message);
        
        // Update unread count for target user (both in-memory and persistent)
        if (unreadCounts.has(targetUserId)) {
          const userUnreadCounts = unreadCounts.get(targetUserId);
          const currentCount = userUnreadCounts.get(socket.id) || 0;
          userUnreadCounts.set(socket.id, currentCount + 1);
          
          // Update persistent unread counts
          if (!persistentUnreadCounts.has(targetUser.userKey)) {
            persistentUnreadCounts.set(targetUser.userKey, new Map());
          }
          const persistentUserUnreads = persistentUnreadCounts.get(targetUser.userKey);
          persistentUserUnreads.set(user.userKey, currentCount + 1);
          
          // Save unread counts
          saveMessages();
          
          // Notify target user of unread count update
          socket.to(targetUserId).emit('unread-update', {
            fromUserId: socket.id,
            count: currentCount + 1
          });
        }
      } else {
        // User is offline, save to persistent unread counts
        const finalTargetUserKey = targetUser.userKey || targetUserKey;
        if (!persistentUnreadCounts.has(finalTargetUserKey)) {
          persistentUnreadCounts.set(finalTargetUserKey, new Map());
        }
        const persistentUserUnreads = persistentUnreadCounts.get(finalTargetUserKey);
        const currentCount = persistentUserUnreads.get(user.userKey) || 0;
        persistentUserUnreads.set(user.userKey, currentCount + 1);
        
        // Save unread counts
        saveMessages();
        console.log(`Saved offline unread for ${targetUser.name || 'offline user'}: ${currentCount + 1}`);
      }
    } else {
      // Team message
      if (!messages.has(user.teamCode)) {
        messages.set(user.teamCode, []);
      }
      
      messages.get(user.teamCode).push(message);
      
      console.log(`Team message saved: ${user.teamCode}, total: ${messages.get(user.teamCode).length}`);
      
      // Save messages to file
      saveMessages();
      
      // Broadcast message to team members
      console.log('Broadcasting team message');
      io.to(user.teamCode).emit('new-message', message);
    }
  });

  // Get direct message history
  socket.on('get-direct-messages', (data) => {
    const { targetUserId } = data;
    const currentUser = users.get(socket.id);
    const targetUser = users.get(targetUserId);
    
    if (!currentUser || !targetUser) {
      console.log('User not found for direct messages');
      return;
    }
    
    // Create chat ID using user keys for persistence
    const chatId = getDirectChatId(currentUser.userKey, targetUser.userKey);
    
    console.log(`Loading direct messages for chat: ${chatId}`);
    
    if (directMessages.has(chatId)) {
      const chatMessages = directMessages.get(chatId);
      console.log(`Found ${chatMessages.length} direct messages`);
      
      socket.emit('message-history', {
        chatType: 'direct',
        chatId: targetUserId,
        messages: chatMessages
      });
    } else {
      console.log('No direct messages found');
      socket.emit('message-history', {
        chatType: 'direct',
        chatId: targetUserId,
        messages: []
      });
    }
    
    // Mark messages as read (both in-memory and persistent)
    if (unreadCounts.has(socket.id)) {
      unreadCounts.get(socket.id).set(targetUserId, 0);
      socket.emit('unread-update', {
        fromUserId: targetUserId,
        count: 0
      });
    }
    
    // Clear persistent unread counts
    const currentUserData = users.get(socket.id);
    const targetUserData = users.get(targetUserId);
    if (currentUserData && targetUserData) {
      if (persistentUnreadCounts.has(currentUserData.userKey)) {
        persistentUnreadCounts.get(currentUserData.userKey).set(targetUserData.userKey, 0);
        saveMessages();
      }
    }
  });

  // Get direct message history by user key (for offline users)
  socket.on('get-direct-messages-by-key', (data) => {
    const { targetUserKey } = data;
    const currentUser = users.get(socket.id);
    
    if (!currentUser) {
      console.log('Current user not found for direct messages by key');
      return;
    }
    
    // Create chat ID using user keys for persistence
    const chatId = getDirectChatId(currentUser.userKey, targetUserKey);
    
    console.log(`Loading direct messages by key for chat: ${chatId}`);
    
    if (directMessages.has(chatId)) {
      const chatMessages = directMessages.get(chatId);
      console.log(`Found ${chatMessages.length} direct messages by key`);
      
      socket.emit('message-history', {
        chatType: 'direct',
        chatId: targetUserKey, // Use userKey as chatId for offline users
        messages: chatMessages
      });
    } else {
      console.log('No direct messages found by key');
      socket.emit('message-history', {
        chatType: 'direct',
        chatId: targetUserKey,
        messages: []
      });
    }
  });

  // Handle delete message
  socket.on('delete-message', (data) => {
    const user = users.get(socket.id);
    if (!user) return;
    
    const { messageId, deleteFor } = data;
    let messageFound = false;
    
    // Check team messages
    if (messages.has(user.teamCode)) {
      const teamMessages = messages.get(user.teamCode);
      const messageIndex = teamMessages.findIndex(msg => msg.id === messageId);
      
      if (messageIndex !== -1) {
        const message = teamMessages[messageIndex];
        
        if (message.userKey === user.userKey) { // Check by userKey for persistence
          if (deleteFor === 'everyone') {
            teamMessages.splice(messageIndex, 1);
            saveMessages();
            io.to(user.teamCode).emit('message-deleted', { messageId, deleteFor });
          } else {
            socket.emit('message-deleted', { messageId, deleteFor: 'me' });
          }
          messageFound = true;
        }
      }
    }
    
    // Check direct messages if not found in team messages
    if (!messageFound) {
      directMessages.forEach((chatMessages, chatId) => {
        const messageIndex = chatMessages.findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          const message = chatMessages[messageIndex];
          
          if (message.userKey === user.userKey) { // Check by userKey for persistence
            if (deleteFor === 'everyone') {
              chatMessages.splice(messageIndex, 1);
              saveMessages();
              
              // Notify all online users in this team about the deletion
              // Since we can't reliably map old socket IDs, broadcast to team
              io.to(user.teamCode).emit('message-deleted', { messageId, deleteFor });
            } else {
              socket.emit('message-deleted', { messageId, deleteFor: 'me' });
            }
          }
        }
      });
    }
  });

  // Handle voice call initiation
  socket.on('initiate-call', (data) => {
    const user = users.get(socket.id);
    if (!user) return;
    
    const { targetUserId, callType } = data;
    socket.to(targetUserId).emit('incoming-call', {
      callerId: socket.id,
      callerName: user.name,
      callType: callType
    });
  });

  // Handle call response
  socket.on('call-response', (data) => {
    const { callerId, accepted } = data;
    socket.to(callerId).emit('call-answered', {
      accepted: accepted,
      answeredBy: socket.id
    });
  });

  // Update user status
  socket.on('update-status', (data) => {
    const user = users.get(socket.id);
    if (!user) return;
    
    user.online = data.online;
    user.lastSeen = Date.now();
    
    if (teams.has(user.teamCode)) {
      const teamUsers = Array.from(teams.get(user.teamCode)).map(id => users.get(id));
      io.to(user.teamCode).emit('users-update', teamUsers);
    }
  });

  // Handle delete conversation
  socket.on('delete-conversation', (data) => {
    const user = users.get(socket.id);
    if (!user) return;
    
    const { chatType, teamCode, targetId } = data;
    
    if (chatType === 'team' && teamCode === user.teamCode) {
      // Delete team conversation
      if (messages.has(teamCode)) {
        messages.set(teamCode, []);
        saveMessages();
        io.to(teamCode).emit('conversation-deleted', { chatType: 'team' });
        console.log(`Team conversation deleted for ${teamCode}`);
      }
    } else if (chatType === 'direct') {
      // Delete direct conversation
      let chatId = null;
      
      if (targetId && targetId.includes(':')) {
        // Target is offline (userKey)
        chatId = getDirectChatId(user.userKey, targetId);
      } else {
        // Target is online (socket ID)
        const targetUser = users.get(targetId);
        if (targetUser) {
          chatId = getDirectChatId(user.userKey, targetUser.userKey);
        }
      }
      
      if (chatId && directMessages.has(chatId)) {
        directMessages.set(chatId, []);
        saveMessages();
        
        // Notify both users
        socket.emit('conversation-deleted', { chatType: 'direct', targetId: targetId });
        if (targetId && !targetId.includes(':')) {
          socket.to(targetId).emit('conversation-deleted', { chatType: 'direct', targetId: socket.id });
        }
        
        console.log(`Direct conversation deleted: ${chatId}`);
      }
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      // Update last seen time in persistent storage
      if (allTeamUsers.has(user.teamCode)) {
        const teamUserData = allTeamUsers.get(user.teamCode);
        if (teamUserData.has(user.userKey)) {
          const userData = teamUserData.get(user.userKey);
          userData.online = false;
          userData.lastSeen = Date.now();
          teamUserData.set(user.userKey, userData);
        }
      }
      
      // Save user data
      saveMessages();
      
      // Remove from user sessions to allow reconnection
      userSessions.delete(user.userKey);
      
      if (teams.has(user.teamCode)) {
        // Send updated user list (including offline users)
        const allUsersInTeam = getAllTeamUsers(user.teamCode);
        socket.to(user.teamCode).emit('users-update', allUsersInTeam);
      }
      
      // Clean up active session data
      teams.get(user.teamCode)?.delete(socket.id);
      users.delete(socket.id);
      unreadCounts.delete(socket.id);
    }
    
    console.log('User disconnected:', socket.id);
  });
});

// API endpoint to update auto-delete time
app.post('/api/settings/auto-delete', (req, res) => {
  const { hours } = req.body;
  AUTO_DELETE_TIME = hours * 60 * 60 * 1000;
  
  // Clean up existing messages with new time limit
  const now = Date.now();
  let hasChanges = false;
  
  messages.forEach((teamMessages, teamCode) => {
    const filteredMessages = teamMessages.filter(msg => 
      (now - msg.timestamp) < AUTO_DELETE_TIME
    );
    if (filteredMessages.length !== teamMessages.length) {
      messages.set(teamCode, filteredMessages);
      hasChanges = true;
    }
  });
  
  directMessages.forEach((chatMessages, chatId) => {
    const filteredMessages = chatMessages.filter(msg => 
      (now - msg.timestamp) < AUTO_DELETE_TIME
    );
    if (filteredMessages.length !== chatMessages.length) {
      directMessages.set(chatId, filteredMessages);
      hasChanges = true;
    }
  });
  
  if (hasChanges) {
    saveMessages();
  }
  
  res.json({ success: true, autoDeleteHours: hours });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});