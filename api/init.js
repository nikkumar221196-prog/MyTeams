// Initialize Socket.io connection for Vercel
module.exports = function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // Initialize the socket.io handler to set up the server
    if (!res.socket.server.io) {
        console.log('Initializing Socket.io server via init endpoint...');
        const socketHandler = require('./socket.js');
        socketHandler(req, res);
    }
    
    res.status(200).json({ 
        status: 'Socket.io server initialized',
        timestamp: new Date().toISOString()
    });
};