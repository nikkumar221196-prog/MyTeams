// Socket.io connection for Vercel with initialization
let socket;

// Initialize Socket.io connection
function initializeSocket() {
    console.log('Initializing Socket.io connection...');
    
    socket = io({
        path: '/api/socket',
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true
    });

    socket.on('connect', () => {
        console.log('Socket.io connected successfully!');
        if (connectionStatus) {
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'connection-status connected';
        }
    });

    socket.on('disconnect', () => {
        console.log('Socket.io disconnected');
        if (connectionStatus) {
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.className = 'connection-status disconnected';
        }
    });

    socket.on('connect_error', (error) => {
        console.error('Socket.io connection error:', error);
        if (connectionStatus) {
            connectionStatus.textContent = 'Connection Error';
            connectionStatus.className = 'connection-status error';
        }
    });

    setupSocketEventListeners();
    return socket;
}

// Setup all Socket.io event listeners
function setupSocketEventListeners() {
    // Socket event listeners
    socket.on('join-success', (data) => {
        currentUser = data.userName;
        currentTeam = data.teamCode;
        currentChatType = 'team';
        currentChatId = currentTeam;
        
        showMainScreen();
        if (teamInfo) teamInfo.textContent = `Team: ${currentTeam}`;
        if (userInitial) userInitial.textContent = currentUser.charAt(0).toUpperCase();
        
        // Set default chat header to team chat
        const chatUserInitial = document.getElementById('chat-user-initial');
        const chatUserName = document.getElementById('chat-user-name');
        const chatUserStatus = document.getElementById('chat-user-status');
        
        if (chatUserInitial) chatUserInitial.textContent = 'T';
        if (chatUserName) chatUserName.textContent = 'Team Chat';
        if (chatUserStatus) chatUserStatus.textContent = 'Team Channel';
    });

    socket.on('users-update', (updatedUsers) => {
        console.log('Users updated:', updatedUsers.length, 'users');
        users = updatedUsers;
        renderUsersList();
    });

    socket.on('message-history', (data) => {
        console.log('Message history received:', data);
        if (data.chatId === currentChatId && data.chatType === currentChatType) {
            messages = data.messages || [];
            renderMessages();
            console.log(`Loaded ${messages.length} messages for ${data.chatType} chat`);
        }
    });

    socket.on('new-message', (message) => {
        console.log('New message received:', message);
        
        // Check if this message belongs to the current chat
        const belongsToCurrentChat = 
            (message.chatType === 'team' && currentChatType === 'team' && message.teamCode === currentChatId) ||
            (message.chatType === 'direct' && currentChatType === 'direct' && 
             (message.userId === currentChatId || message.targetUserId === currentChatId || 
              message.userKey === currentChatId || message.targetUserKey === currentChatId));
        
        if (belongsToCurrentChat) {
            // Prevent duplicate messages
            if (!messages.find(m => m.id === message.id)) {
                messages.push(message);
                renderMessages();
                scrollToBottom();
                console.log(`Added new message to current chat. Total: ${messages.length}`);
            }
        } else {
            console.log('Message not for current chat, ignoring');
        }
    });

    socket.on('unread-update', (data) => {
        console.log('Unread update received:', data);
        
        // Map socket ID to user name for display
        const senderUser = users.find(u => u.id === data.fromUserId);
        if (senderUser) {
            unreadCounts.set(senderUser.id, data.count);
            console.log(`Unread count for ${senderUser.name}: ${data.count}`);
        } else {
            // If sender user not found, just store by socket ID
            unreadCounts.set(data.fromUserId, data.count);
        }
        
        renderUsersList();
    });

    socket.on('conversation-deleted', (data) => {
        if (data.chatType === currentChatType) {
            messages = [];
            renderMessages();
            
            if (data.chatType === 'team') {
                alert('Team conversation has been deleted.');
            } else {
                alert('Conversation has been deleted.');
            }
        }
    });

    socket.on('message-deleted', (data) => {
        if (data.deleteFor === 'everyone') {
            messages = messages.filter(msg => msg.id !== data.messageId);
            renderMessages();
        } else {
            // Hide message for current user only
            const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
            if (messageElement) {
                messageElement.style.display = 'none';
            }
        }
    });

    socket.on('incoming-call', (data) => {
        currentCallData = data;
        showIncomingCall(data);
    });

    socket.on('call-answered', (data) => {
        if (data.accepted) {
            alert('Call accepted! Video calling functionality would be implemented here.');
        } else {
            alert('Call declined.');
        }
    });
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM elements
    loginScreen = document.getElementById('login-screen');
    mainScreen = document.getElementById('main-screen');
    loginForm = document.getElementById('login-form');
    teamCodeInput = document.getElementById('team-code');
    userNameInput = document.getElementById('user-name');
    teamInfo = document.getElementById('team-info');
    userInitial = document.getElementById('user-initial');
    usersList = document.getElementById('users-list');
    messagesContainer = document.getElementById('messages-container');
    messageInput = document.getElementById('message-input');
    sendBtn = document.getElementById('send-btn');
    userMenuBtn = document.getElementById('user-menu-btn');
    userDropdown = document.getElementById('user-dropdown');
    emojiPicker = document.getElementById('emoji-picker');
    settingsModal = document.getElementById('settings-modal');
    callModal = document.getElementById('call-modal');
    menuToggle = document.getElementById('menu-toggle');
    backBtn = document.getElementById('back-btn');
    sidebar = document.querySelector('.sidebar');
    conversationOptions = document.getElementById('conversation-options');
    fileInput = document.getElementById('file-input');
    
    // Add connection status indicator
    connectionStatus = document.createElement('div');
    connectionStatus.id = 'connection-status';
    connectionStatus.className = 'connection-status connecting';
    connectionStatus.textContent = 'Connecting...';
    document.body.appendChild(connectionStatus);
    
    // Set up DOM event listeners
    setupDOMEventListeners();
    
    // Initialize socket connection
    initializeSocket();
    
    // Auto-login if session exists
    handleAutoLogin();
});

// Setup DOM event listeners
function setupDOMEventListeners() {
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        messageInput.addEventListener('input', () => {
            if (sendBtn) {
                sendBtn.disabled = messageInput.value.trim() === '';
            }
        });
    }
    if (userMenuBtn) {
        userMenuBtn.addEventListener('click', () => {
            if (userDropdown) {
                userDropdown.classList.toggle('hidden');
            }
        });
    }
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            if (sidebar) {
                sidebar.classList.toggle('open');
            }
        });
    }
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (sidebar) {
                sidebar.classList.add('open');
            }
        });
    }
    
    // Set up file input event listener
    const fileInputElement = document.getElementById('file-input');
    if (fileInputElement) {
        fileInputElement.addEventListener('change', handleFileSelect);
    }
    
    // Set up paperclip button
    const paperclipButtons = document.querySelectorAll('.input-btn');
    paperclipButtons.forEach(btn => {
        if (btn.innerHTML.includes('fa-paperclip')) {
            btn.addEventListener('click', () => {
                if (fileInputElement) {
                    fileInputElement.click();
                }
            });
        }
    });
    
    // Set up emoji click handlers
    const emojiGrid = document.querySelector('.emoji-grid');
    if (emojiGrid) {
        emojiGrid.addEventListener('click', (e) => {
            if (e.target.textContent.trim()) {
                insertEmoji(e.target.textContent);
            }
        });
    }
    
    // Global click handlers
    document.addEventListener('click', (e) => {
        if (userMenuBtn && userDropdown && !userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.add('hidden');
        }
        
        // Close conversation options when clicking outside
        if (conversationOptions && !conversationOptions.contains(e.target) && 
            !e.target.closest('.action-btn')) {
            conversationOptions.classList.add('hidden');
        }
        
        // Close sidebar when clicking outside on mobile
        if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open') && 
            !sidebar.contains(e.target) && menuToggle && !menuToggle.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });
}

// Handle auto-login
function handleAutoLogin() {
    const savedSession = localStorage.getItem('myteams-session');
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            if (session.teamCode && session.userName) {
                if (teamCodeInput) teamCodeInput.value = session.teamCode;
                if (userNameInput) userNameInput.value = session.userName;
                
                // Wait for socket connection before auto-login
                setTimeout(() => {
                    if (socket && socket.connected) {
                        socket.emit('join-team', { teamCode: session.teamCode, userName: session.userName });
                    } else {
                        console.log('Socket not ready for auto-login, user will need to login manually');
                    }
                }, 2000);
            }
        } catch (error) {
            console.error('Error parsing saved session:', error);
            localStorage.removeItem('myteams-session');
        }
    }
}

// Global variables
let currentUser = null;
let currentTeam = null;
let users = [];
let messages = [];
let currentChatType = 'team'; // 'team' or 'direct'
let currentChatId = null; // team code for team chat, user id for direct chat
let currentCallData = null;
let unreadCounts = new Map(); // Track unread messages

// DOM elements - will be initialized after DOM loads
let loginScreen, mainScreen, loginForm, teamCodeInput, userNameInput;
let teamInfo, userInitial, usersList, messagesContainer, messageInput, sendBtn;
let userMenuBtn, userDropdown, emojiPicker, settingsModal, callModal;
let menuToggle, backBtn, sidebar, conversationOptions, fileInput, connectionStatus;



// Handle login
function handleLogin(e) {
    e.preventDefault();
    const teamCode = teamCodeInput?.value.trim();
    const userName = userNameInput?.value.trim();
    
    if (teamCode && userName && socket) {
        if (socket.connected) {
            // Save session to localStorage
            localStorage.setItem('myteams-session', JSON.stringify({
                teamCode: teamCode,
                userName: userName
            }));
            
            socket.emit('join-team', { teamCode, userName });
        } else {
            alert('Connection not ready. Please wait and try again.');
            console.log('Socket not connected, cannot join team');
        }
    } else if (!socket) {
        alert('Socket not initialized. Please refresh the page.');
    } else {
        alert('Please enter both team code and name.');
    }
}



// Functions
function handleLogin(e) {
    e.preventDefault();
    const teamCode = teamCodeInput.value.trim();
    const userName = userNameInput.value.trim();
    
    if (teamCode && userName) {
        // Save session to localStorage
        localStorage.setItem('myteams-session', JSON.stringify({
            teamCode: teamCode,
            userName: userName
        }));
        
        socket.emit('join-team', { teamCode, userName });
    }
}

function showMainScreen() {
    loginScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
}

function renderUsersList() {
    console.log('Rendering users list. Unread counts:', Array.from(unreadCounts.entries()));
    usersList.innerHTML = '';
    
    users.forEach(user => {
        if (user.name === currentUser) return; // Don't show current user
        
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.onclick = () => selectUser(user);
        
        const lastSeen = user.online ? 'Online' : `Last seen ${formatTime(user.lastSeen)}`;
        const unreadCount = unreadCounts.get(user.id) || 0;
        
        console.log(`User ${user.name} (${user.id}): ${unreadCount} unread`);
        
        userItem.innerHTML = `
            <div class="user-avatar-small">
                <span>${user.name.charAt(0).toUpperCase()}</span>
                <div class="status-indicator ${user.online ? 'online' : 'offline'}"></div>
            </div>
            <div class="user-info">
                <h4>${user.name}</h4>
                <p>${lastSeen}</p>
            </div>
            ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</div>` : ''}
        `;
        
        usersList.appendChild(userItem);
    });
    
    // Add team chat option
    const teamChatItem = document.createElement('div');
    teamChatItem.className = `user-item ${currentChatType === 'team' ? 'active' : ''}`;
    teamChatItem.onclick = () => selectTeamChat();
    
    teamChatItem.innerHTML = `
        <div class="user-avatar-small team-avatar">
            <span>T</span>
        </div>
        <div class="user-info">
            <h4>Team Chat</h4>
            <p>Team Channel</p>
        </div>
    `;
    
    usersList.insertBefore(teamChatItem, usersList.firstChild);
}

function selectUser(user) {
    // For offline users, we need to find an online user to get their current socket ID
    // Or handle offline users differently
    let targetUserId = user.id;
    
    if (!user.online || !user.id) {
        // User is offline, find if they have any direct message history
        console.log(`Attempting to chat with offline user: ${user.name}`);
        
        // For offline users, we'll use their userKey to identify them
        // When they come online, messages will still be associated correctly
        targetUserId = user.userKey; // Use userKey for offline users
    }
    
    // Switch to direct chat
    currentChatType = 'direct';
    currentChatId = targetUserId;
    
    // Update chat header
    document.getElementById('chat-user-initial').textContent = user.name.charAt(0).toUpperCase();
    document.getElementById('chat-user-name').textContent = user.name;
    document.getElementById('chat-user-status').textContent = user.online ? 'Online' : `Last seen ${formatTime(user.lastSeen)}`;
    
    // Update active state
    document.querySelectorAll('.user-item').forEach(item => item.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    // Clear messages and request direct message history
    messages = [];
    messagesContainer.innerHTML = '';
    
    if (user.online && user.id) {
        // User is online, request normally
        socket.emit('get-direct-messages', { targetUserId: user.id });
    } else {
        // User is offline, we can still show old message history
        // The server will use userKey to find message history
        socket.emit('get-direct-messages-by-key', { targetUserKey: user.userKey });
    }
    
    // Mark as read if user is online
    if (user.online && user.id) {
        unreadCounts.set(user.id, 0);
        renderUsersList();
    }
    
    // Hide sidebar on mobile
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('open');
    }
}

function selectTeamChat() {
    // Switch to team chat
    currentChatType = 'team';
    currentChatId = currentTeam;
    
    // Update chat header
    document.getElementById('chat-user-initial').textContent = 'T';
    document.getElementById('chat-user-name').textContent = 'Team Chat';
    document.getElementById('chat-user-status').textContent = 'Team Channel';
    
    // Update active state
    document.querySelectorAll('.user-item').forEach(item => item.classList.remove('active'));
    document.querySelector('.team-avatar').parentElement.classList.add('active');
    
    // Clear messages and show team messages
    messages = [];
    messagesContainer.innerHTML = '';
    
    // Request team message history
    socket.emit('join-team', { teamCode: currentTeam, userName: currentUser });
    
    // Hide sidebar on mobile
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('open');
    }
}

function sendMessage() {
    const text = messageInput.value.trim();
    console.log('Send message clicked, text:', text);
    
    if (text) {
        const messageData = {
            text: text,
            chatType: currentChatType
        };
        
        if (currentChatType === 'direct') {
            // Check if target is a userKey (offline user) or socket ID (online user)
            if (currentChatId && currentChatId.includes(':')) {
                // This is a userKey (offline user)
                messageData.targetUserKey = currentChatId;
                console.log('Sending to offline user:', currentChatId);
            } else {
                // This is a socket ID (online user)
                messageData.targetUserId = currentChatId;
                console.log('Sending to online user:', currentChatId);
            }
        }
        
        console.log('Sending message data:', messageData);
        socket.emit('send-message', messageData);
        messageInput.value = '';
        sendBtn.disabled = true;
    } else {
        console.log('No text to send');
    }
}

function renderMessages() {
    messagesContainer.innerHTML = '';
    
    let lastDate = '';
    
    messages.forEach(message => {
        const messageDate = new Date(message.timestamp).toDateString();
        
        if (messageDate !== lastDate) {
            const dateSeparator = document.createElement('div');
            dateSeparator.className = 'date-separator';
            dateSeparator.innerHTML = `<span>${formatDate(message.timestamp)}</span>`;
            messagesContainer.appendChild(dateSeparator);
            lastDate = messageDate;
        }
        
        const messageElement = document.createElement('div');
        
        // Check if message is from current user by comparing usernames (since socket ID changes)
        const isOwn = message.userName === currentUser;
        messageElement.className = `message ${isOwn ? 'own' : ''}`;
        messageElement.setAttribute('data-message-id', message.id);
        
        let messageContent = '';
        
        if (message.file) {
            // File attachment message
            const fileIconClass = getFileIconClass(message.file.name, message.file.type);
            const fileIcon = getFileIcon(message.file.name, message.file.type);
            
            if (message.file.type.startsWith('image/')) {
                // Image preview with both preview and download options
                messageContent = `
                    <div class="file-message">
                        <div class="file-preview-container">
                            <img src="${message.file.data}" class="file-preview-image" onclick="openImagePreview('${message.file.data}', '${escapeHtml(message.file.name)}')" alt="${escapeHtml(message.file.name)}">
                        </div>
                        <div class="file-actions">
                            <button class="file-action-btn" onclick="openImagePreview('${message.file.data}', '${escapeHtml(message.file.name)}')" title="Preview">
                                <i class="fas fa-eye"></i> Preview
                            </button>
                            <button class="file-action-btn" onclick="downloadFile('${escapeHtml(message.file.name)}', '${message.file.data}')" title="Download">
                                <i class="fas fa-download"></i> Download
                            </button>
                        </div>
                        <div class="file-info">
                            <div class="file-name">${escapeHtml(message.file.name)}</div>
                            <div class="file-size">${formatFileSize(message.file.size)}</div>
                        </div>
                    </div>
                `;
            } else if (message.file.type === 'application/pdf') {
                // PDF with preview and download options
                messageContent = `
                    <div class="file-message">
                        <div class="file-attachment">
                            <div class="file-icon ${fileIconClass}">
                                ${fileIcon}
                            </div>
                            <div class="file-info">
                                <div class="file-name">${escapeHtml(message.file.name)}</div>
                                <div class="file-size">${formatFileSize(message.file.size)}</div>
                            </div>
                        </div>
                        <div class="file-actions">
                            <button class="file-action-btn" onclick="previewPDF('${message.file.data}', '${escapeHtml(message.file.name)}')" title="Preview PDF">
                                <i class="fas fa-eye"></i> Preview
                            </button>
                            <button class="file-action-btn" onclick="downloadFile('${escapeHtml(message.file.name)}', '${message.file.data}')" title="Download">
                                <i class="fas fa-download"></i> Download
                            </button>
                        </div>
                    </div>
                `;
            } else {
                // Other file types with download option
                messageContent = `
                    <div class="file-message">
                        <div class="file-attachment">
                            <div class="file-icon ${fileIconClass}">
                                ${fileIcon}
                            </div>
                            <div class="file-info">
                                <div class="file-name">${escapeHtml(message.file.name)}</div>
                                <div class="file-size">${formatFileSize(message.file.size)}</div>
                            </div>
                        </div>
                        <div class="file-actions">
                            <button class="file-action-btn" onclick="downloadFile('${escapeHtml(message.file.name)}', '${message.file.data}')" title="Download">
                                <i class="fas fa-download"></i> Download
                            </button>
                        </div>
                    </div>
                `;
            }
        } else {
            // Regular text message
            messageContent = `<div class="message-text">${escapeHtml(message.text)}</div>`;
        }
        
        messageElement.innerHTML = `
            <div class="message-avatar">
                <span>${message.userName.charAt(0).toUpperCase()}</span>
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">${message.userName}</span>
                    <span class="message-time">${formatTime(message.timestamp)}</span>
                </div>
                ${messageContent}
                ${isOwn ? `
                    <div class="message-actions">
                        <button class="message-action-btn" onclick="deleteMessage('${message.id}', 'me')" title="Delete for me">
                            <i class="fas fa-trash"></i>
                        </button>
                        <button class="message-action-btn" onclick="deleteMessage('${message.id}', 'everyone')" title="Delete for everyone">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
        
        messagesContainer.appendChild(messageElement);
    });
    
    scrollToBottom();
}

function deleteMessage(messageId, deleteFor) {
    socket.emit('delete-message', { messageId, deleteFor });
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toggleEmojiPicker() {
    emojiPicker.classList.toggle('hidden');
}

function insertEmoji(emoji) {
    messageInput.value += emoji;
    messageInput.focus();
    emojiPicker.classList.add('hidden');
    sendBtn.disabled = messageInput.value.trim() === '';
}

// Conversation options
function showConversationOptions() {
    if (conversationOptions) {
        conversationOptions.classList.toggle('hidden');
    }
}

function deleteEntireConversation() {
    if (currentChatType === 'team') {
        if (confirm('Are you sure you want to delete the entire team conversation? This cannot be undone.')) {
            socket.emit('delete-conversation', { 
                chatType: 'team', 
                teamCode: currentTeam 
            });
        }
    } else if (currentChatType === 'direct') {
        if (confirm('Are you sure you want to delete this entire conversation? This cannot be undone.')) {
            socket.emit('delete-conversation', { 
                chatType: 'direct', 
                targetId: currentChatId 
            });
        }
    }
    
    conversationOptions.classList.add('hidden');
}

// File handling
function handleFileSelect(event) {
    console.log('File select triggered:', event);
    const files = event.target.files;
    console.log('Files selected:', files.length);
    
    if (files.length === 0) return;
    
    for (let file of files) {
        console.log('Processing file:', file.name, file.size, file.type);
        
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            alert(`File "${file.name}" is too large. Maximum size is 10MB.`);
            continue;
        }
        
        uploadFile(file);
    }
    
    // Clear the input
    event.target.value = '';
}

function uploadFile(file) {
    console.log('Uploading file:', file.name);
    
    const reader = new FileReader();
    reader.onload = function(e) {
        console.log('File read complete, sending message...');
        
        const fileData = {
            name: file.name,
            size: file.size,
            type: file.type,
            data: e.target.result // Base64 data
        };
        
        const messageData = {
            text: `📎 ${file.name}`, // Include text for file messages
            file: fileData,
            chatType: currentChatType
        };
        
        if (currentChatType === 'direct') {
            if (currentChatId && currentChatId.includes(':')) {
                messageData.targetUserKey = currentChatId;
            } else {
                messageData.targetUserId = currentChatId;
            }
        }
        
        console.log('Sending file message:', messageData);
        socket.emit('send-message', messageData);
    };
    
    reader.onerror = function(error) {
        console.error('Error reading file:', error);
        alert('Error reading file: ' + file.name);
    };
    
    reader.readAsDataURL(file);
}

function getFileIcon(fileName, fileType) {
    if (fileType.startsWith('image/')) {
        return '<i class="fas fa-image"></i>';
    } else if (fileType === 'application/pdf') {
        return '<i class="fas fa-file-pdf"></i>';
    } else if (fileType.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
        return '<i class="fas fa-file-word"></i>';
    } else if (fileType.includes('text')) {
        return '<i class="fas fa-file-alt"></i>';
    } else {
        return '<i class="fas fa-file"></i>';
    }
}

function getFileIconClass(fileName, fileType) {
    if (fileType.startsWith('image/')) {
        return 'image';
    } else if (fileType === 'application/pdf') {
        return 'pdf';
    } else if (fileType.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
        return 'document';
    } else {
        return 'other';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function downloadFile(fileName, fileData) {
    try {
        const link = document.createElement('a');
        link.href = fileData;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log('File download initiated:', fileName);
    } catch (error) {
        console.error('Error downloading file:', error);
        alert('Error downloading file: ' + fileName);
    }
}

// Image preview functions
function openImagePreview(imageData, fileName) {
    // Create modal for image preview
    const modal = document.createElement('div');
    modal.className = 'image-preview-modal';
    modal.innerHTML = `
        <div class="image-preview-content">
            <div class="image-preview-header">
                <h3>${escapeHtml(fileName)}</h3>
                <button class="close-preview" onclick="closeImagePreview()">&times;</button>
            </div>
            <div class="image-preview-body">
                <img src="${imageData}" alt="${escapeHtml(fileName)}" class="preview-image">
            </div>
            <div class="image-preview-footer">
                <button class="btn-secondary" onclick="downloadFile('${escapeHtml(fileName)}', '${imageData}')">
                    <i class="fas fa-download"></i> Download
                </button>
                <button class="btn-secondary" onclick="closeImagePreview()">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeImagePreview();
        }
    });
}

function closeImagePreview() {
    const modal = document.querySelector('.image-preview-modal');
    if (modal) {
        document.body.removeChild(modal);
    }
}

// PDF preview function
function previewPDF(pdfData, fileName) {
    try {
        // Open PDF in new tab for preview
        const newWindow = window.open();
        newWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${escapeHtml(fileName)} - Preview</title>
                <style>
                    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
                    .header { background: #f3f2f1; padding: 1rem; margin: -20px -20px 20px -20px; }
                    .actions { margin-bottom: 20px; }
                    .btn { background: #6264a7; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; margin-right: 10px; }
                    .btn:hover { background: #464775; }
                    embed { width: 100%; height: 80vh; border: 1px solid #ddd; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>📄 ${escapeHtml(fileName)}</h2>
                </div>
                <div class="actions">
                    <button class="btn" onclick="downloadFile()">
                        <i class="fas fa-download"></i> Download
                    </button>
                    <button class="btn" onclick="window.close()">Close Preview</button>
                </div>
                <embed src="${pdfData}" type="application/pdf">
                <script>
                    function downloadFile() {
                        const link = document.createElement('a');
                        link.href = '${pdfData}';
                        link.download = '${escapeHtml(fileName)}';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error previewing PDF:', error);
        alert('Error previewing PDF. You can still download it.');
    }
}



function initiateCall(callType) {
    const activeUser = document.querySelector('.user-item.active');
    if (activeUser) {
        const userName = activeUser.querySelector('.user-info h4').textContent;
        const targetUser = users.find(u => u.name === userName);
        
        if (targetUser) {
            socket.emit('initiate-call', {
                targetUserId: targetUser.id,
                callType: callType
            });
            alert(`Calling ${userName}...`);
        }
    } else {
        alert('Please select a user to call.');
    }
}

function showIncomingCall(data) {
    document.getElementById('caller-initial').textContent = data.callerName.charAt(0).toUpperCase();
    document.getElementById('caller-name').textContent = data.callerName;
    document.getElementById('call-type').textContent = data.callType === 'video' ? 'Video Call' : 'Voice Call';
    
    callModal.classList.remove('hidden');
}

function acceptCall() {
    if (currentCallData) {
        socket.emit('call-response', {
            callerId: currentCallData.callerId,
            accepted: true
        });
        callModal.classList.add('hidden');
        alert('Call accepted! Video calling functionality would be implemented here.');
    }
}

function declineCall() {
    if (currentCallData) {
        socket.emit('call-response', {
            callerId: currentCallData.callerId,
            accepted: false
        });
        callModal.classList.add('hidden');
    }
}

function openSettings() {
    userDropdown.classList.add('hidden');
    settingsModal.classList.remove('hidden');
}

function closeSettings() {
    settingsModal.classList.add('hidden');
}

function updateAutoDelete() {
    const hours = parseInt(document.getElementById('auto-delete-hours').value);
    if (hours >= 1 && hours <= 24) {
        fetch('/api/settings/auto-delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ hours })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert(`Auto-delete time updated to ${hours} hours`);
                closeSettings();
            }
        })
        .catch(error => {
            alert('Failed to update setting');
        });
    } else {
        alert('Please enter a valid number of hours (1-24)');
    }
}

function logout() {
    if (confirm('Are you sure you want to sign out?')) {
        // Clear session from localStorage
        localStorage.removeItem('myteams-session');
        socket.disconnect();
        location.reload();
    }
}

// Handle page visibility change for user status
document.addEventListener('visibilitychange', () => {
    if (currentUser && socket && document.visibilityState === 'visible') {
        // Page became visible, user is active
        socket.emit('update-status', {
            online: true
        });
    }
});

// Close modals when clicking outside
window.addEventListener('click', (e) => {
    if (settingsModal && e.target === settingsModal) {
        closeSettings();
    }
    if (callModal && e.target === callModal) {
        declineCall();
    }
    if (emojiPicker && !document.querySelector('.message-input').contains(e.target)) {
        emojiPicker.classList.add('hidden');
    }
});