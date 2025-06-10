require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const CodeShare = require('./models/CodeShare');
const app = express();
const http = require('http');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const MONGODB_URI = process.env.MONGODB_URI;
const Room = require('./models/Room');
const axios = require('axios');
const CustomLRUCache = require('./utils/CustomLRUCache');
const path = require('path');

const PORT = process.env.PORT || 5000;

const compileLimiter = rateLimit({
    windowMs: 10 * 1000, 
    max: 5, 
    message: { error: 'Too many compilation requests. Please wait 10 seconds and try again.' },
    standardHeaders: true, 
    legacyHeaders: false
});

const shareLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 10, 
    message: { error: 'Too many snippet sharing requests. Please wait an hour and try again.' },
    standardHeaders: true,
    legacyHeaders: false
});

const codeCache = new CustomLRUCache(1000, 3600000);

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    heartbeatFrequencyMS: 2000,
    maxPoolSize: 10,
    socketTimeoutMS: 45000,
    family: 4
})
.then(() => {
    console.log('Connected to MongoDB');
})
.catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1); 
});



app.use(express.json());

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

const PRODUCTION_URL = process.env.FRONTEND_URL || 'https://chatcode-6n6e.onrender.com';

const CORS_ORIGIN = process.env.NODE_ENV === 'production'
    ? [PRODUCTION_URL, 'https://chatcode-6n6e.onrender.com']
    : ['http://localhost:3000'];

const FRONTEND_URL = process.env.NODE_ENV === 'production'
    ? PRODUCTION_URL
    : 'http://localhost:3000';

const BACKEND_URL = process.env.NODE_ENV === 'production'
    ? PRODUCTION_URL
    : 'http://localhost:5000';

app.use(cors({
    origin: function(origin, callback) {
        if (!origin || CORS_ORIGIN.includes(origin)) {
            callback(null, true);
        } else {
            console.log('Blocked by CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

const { Server } = require('socket.io');
const ACTIONS = require('./src/pages/Action');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: CORS_ORIGIN,
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
    }
});

const userSocketMap = new Map(); 

async function getAllConnectedClients(roomId) {
    try {
        const room = await Room.findOne({ roomId });
        if (!room) return [];
        
        const uniqueUsers = room.users.reduce((acc, user) => {
            if (user.isConnected && (!acc[user.sessionId] || user.lastActive > acc[user.sessionId].lastActive)) {
                acc[user.sessionId] = user;
            }
            return acc;
        }, {});

        return Object.values(uniqueUsers).map(user => ({
            socketId: user.socketId,
            username: user.username,
            role: user.role
        }));
    } catch (error) {
        console.error('Error getting connected clients:', error);
        return [];
    }
}

async function getRoomById(roomId) {
    try {
        return await Room.findOne({ roomId });
    } catch (error) {
        console.error('Error getting room:', error);
        return null;
    }
}

const messageRateLimits = new Map();
const MESSAGE_POINTS = 3;
const RATE_LIMIT_RESET = 1000; 

io.on('connection', async (socket) => {
    console.log('socket connected', socket.id);

    messageRateLimits.set(socket.id, {
        points: MESSAGE_POINTS,
        lastReset: Date.now()
    });

    socket.on(ACTIONS.JOIN, async ({ roomId, username, sessionId }) => {
        try {
            const userSessionId = sessionId || socket.id;
            
            let room = await Room.findOne({ roomId });
            
            if (!room) {
                room = new Room({
                    roomId,
                    initialCode: '',
                    users: [{
                        socketId: socket.id,
                        username,
                        sessionId: userSessionId,
                        isConnected: true,
                        lastActive: new Date()
                    }]
                });
            } else {
                const existingUserIndex = room.users.findIndex(u => u.sessionId === userSessionId);
                if (existingUserIndex !== -1) {
                    room.users[existingUserIndex].socketId = socket.id;
                    room.users[existingUserIndex].isConnected = true;
                    room.users[existingUserIndex].lastActive = new Date();
                    room.users[existingUserIndex].username = username;
                } else {
                    room.users.push({
                        socketId: socket.id,
                        username,
                        sessionId: userSessionId,
                        isConnected: true,
                        lastActive: new Date()
                    });
                }
            }

            await room.save();
            socket.join(roomId);
            
            const connectedUsers = room.users.filter(u => u.isConnected && u.socketId !== socket.id);
            if (connectedUsers.length > 0) {
                socket.to(connectedUsers[0].socketId).emit(ACTIONS.SYNC_CODE, {
                    socketId: socket.id
                });
            } else if (room.initialCode) {
                socket.emit(ACTIONS.CODE_CHANGE, { code: room.initialCode });
            }

            userSocketMap.set(socket.id, { username, roomId });
            
            const clients = await getAllConnectedClients(roomId);
            io.to(roomId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id
            });
        } catch (error) {
            console.error('JOIN error:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    })

    socket.on(ACTIONS.GET_OUTPUT, ({ roomId, output }) => {
        socket.to(roomId).emit(ACTIONS.GET_OUTPUT, { output });
    });

    socket.on(ACTIONS.SEND, ({ roomId, message, currentuser }) => {
        io.in(roomId).emit(ACTIONS.RECEIVE, {
            message,
            currentuser,
        });
    })

    socket.on(ACTIONS.MENTION, ({ from, message }) => {
    toast.success(`@${from} mentioned you: "${message}"`, {
        icon: '📣'
    });
});

    const checkRateLimit = () => {
        const now = Date.now();
        const userLimit = messageRateLimits.get(socket.id);
        
        if (!userLimit) return true; 
        
        if (now - userLimit.lastReset >= RATE_LIMIT_RESET) {
            userLimit.points = MESSAGE_POINTS;
            userLimit.lastReset = now;
        }
        
        if (userLimit.points <= 0) return false;
        
        userLimit.points--;
        return true;
    };

    socket.on(ACTIONS.SEND_MESSAGE, async ({ roomId, message, username }) => {
        if (!checkRateLimit()) {
            socket.emit('rateLimitExceeded', {
                feature: 'Chat',
                message: 'You are sending messages too fast. Please slow down.'
            });
            return;
        }

        try {
            const room = await Room.findOne({ roomId });
            if (!room) return;

            const mentionRegex = /@(\w+)/g;
            const mentions = message.match(mentionRegex);
            
            if (mentions) {
                mentions.forEach(mention => {
                    const mentionedUsername = mention.slice(1);
                    const mentionedUser = room.users.find(
                        u => u.username.toLowerCase() === mentionedUsername.toLowerCase()
                    );
                    
                    if (mentionedUser) {
                        io.to(mentionedUser.socketId).emit(ACTIONS.MENTION, {
                            fromUser: username,
                            message
                        });
                    }
                });
            }

            socket.to(roomId).emit(ACTIONS.SEND_MESSAGE, { 
                message,
                username,
                mentions: mentions || [] 
            });
        } catch (error) {
            console.error('Error sending message:', error);
        }
    });

    let typingTimeouts = {};
    socket.on(ACTIONS.USER_TYPING, ({ roomId, username }) => {
        if (!username) return;
        
        const user = userSocketMap.get(socket.id);
        if (!user) return;

        if (typingTimeouts[username]) {
            clearTimeout(typingTimeouts[username]);
        }

        socket.to(roomId).emit(ACTIONS.USER_TYPING, { 
            username,
            socketId: socket.id
        });

        typingTimeouts[username] = setTimeout(() => {
            socket.to(roomId).emit(ACTIONS.USER_TYPING, { 
                username: null,
                socketId: socket.id
            });
            delete typingTimeouts[username];
        }, 2000);
    });

    socket.on(ACTIONS.CURSOR_MOVE, ({ roomId, cursor, username }) => {
        if (cursor && typeof cursor.line === 'number' && typeof cursor.ch === 'number') {
            socket.to(roomId).emit(ACTIONS.CURSOR_MOVE, {
                socketId: socket.id,
                cursor,
                username
            });
        }
    });

    socket.on('disconnect', async () => {
        try {
            messageRateLimits.delete(socket.id);
            
            const user = userSocketMap.get(socket.id);
            if (!user) return;

            const room = await Room.findOne({ roomId: user.roomId });
            if (room) {
                const userIndex = room.users.findIndex(u => u.socketId === socket.id);
                if (userIndex !== -1) {
                    room.users[userIndex].isConnected = false;
                    room.users[userIndex].lastActive = new Date();
                    await room.save();
                }
            }

            userSocketMap.delete(socket.id);
            io.to(user.roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: user.username
            });

        } catch (error) {
            console.error('Disconnect error:', error);
        }
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

function generateRandomLink(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

app.post('/run-code', compileLimiter, async (req, res) => {
    try {
        const { code, language, input } = req.body;
        const defaultInput = "Default input value";

        if (!code || !language) {
            return res.status(400).json({ 
                error: 'Code and language are required' 
            });
        }

        const cacheKey = `${code}-${language}-${input || defaultInput}`;
        const cachedResult = codeCache.get(cacheKey);
        
        if (cachedResult) {
            console.log('Cache hit:', cacheKey);
            return res.json({ output: cachedResult });
        }

        console.log('Cache miss, compiling code...');

        const encodedParams = new URLSearchParams();
        encodedParams.append("LanguageChoice", language);
        encodedParams.append("Program", code);
        encodedParams.append("Input", input || defaultInput);

        const options = {
            method: 'POST',
            url: 'https://code-compiler.p.rapidapi.com/v2',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'X-RapidAPI-Key': process.env.RAPID_API_KEY,
                'X-RapidAPI-Host': 'code-compiler.p.rapidapi.com'
            },
            data: encodedParams,
        };

        const response = await axios.request(options);
        let result = response.data.Result;
        
        if (result === null) {
            result = response.data.Errors;
        }

        codeCache.set(cacheKey, result);
        console.log('Stored in cache:', cacheKey);

        res.json({ output: result });

    } catch (error) {
        console.error('Code execution error:', error);
        res.status(500).json({ 
            error: 'Code compilation failed',
            details: error.message 
        });
    }
});

app.post('/share', shareLimiter, async (req, res) => {
    try {
        const { code, isProtected, password, expiryTime } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'Code is required!' });
        }

        const expiryMap = {
            '15min': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000
        };

        const expiryTimestamp = new Date(Date.now() + expiryMap[expiryTime]);

        let linkId;
        let isUnique = false;
        while (!isUnique) {
            linkId = generateRandomLink(8); 
            const existingShare = await CodeShare.findOne({ linkId });
            if (!existingShare) {
                isUnique = true;
            }
        }

        const codeShare = new CodeShare({
            linkId,
            code: code.trim(), 
            isProtected,
            password: isProtected ? await bcrypt.hash(password, 10) : null,
            expiryTimestamp
        });        await codeShare.save();

        res.json({
            shareLink: `${FRONTEND_URL}/share/${linkId}`
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ 
            error: 'Failed to generate link',
            details: error.message 
        });
    }
});

app.get('/share/:linkId', async (req, res, next) => {
    try {
        const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
        
        const { linkId } = req.params;
        const codeShare = await CodeShare.findOne({ linkId });

        if (!codeShare) {
            if (wantsJson) {
                return res.status(404).json({ error: 'Link not found' });
            }
            return next();
        }

        if (Date.now() > codeShare.expiryTimestamp) {
            if (wantsJson) {
                return res.status(410).json({ error: 'Link expired' });
            }
            return next();
        }

        if (!wantsJson) {
            return next();
        }

        if (codeShare.isProtected) {
            return res.json({ 
                isProtected: true,
                createdAt: codeShare.createdAt,
                expiryTimestamp: codeShare.expiryTimestamp 
            });
        }

        res.json({
            code: codeShare.code,
            isProtected: false,
            createdAt: codeShare.createdAt,
            expiryTimestamp: codeShare.expiryTimestamp
        });
    } catch (error) {
        console.error('Share route error:', error);
        if (req.headers.accept?.includes('application/json')) {
            res.status(500).json({ error: 'Failed to fetch Code' });
        } else {
            next();
        }
    }
});

app.post('/share/:linkId/verify', async (req, res) => {
    try {
        const { linkId } = req.params;
        const { password } = req.body;

        const codeShare = await CodeShare.findOne({ linkId });

        if (!codeShare) {
            return res.status(404).json({ error: 'Link not found' });
        }

        const isValid = await bcrypt.compare(password, codeShare.password);       
         if (!isValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        res.json({
            code: codeShare.code,
            createdAt: codeShare.createdAt,
            expiryTimestamp: codeShare.expiryTimestamp
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to verify password' });
    }
});

app.post('/fork-snippet', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ error: 'Code is required!' });
        }

        let isUnique = false;
        let newRoomId;
        
        while (!isUnique) {
            newRoomId = generateRandomLink(8);
            const existingRoom = await Room.findOne({ roomId: newRoomId });
            if (!existingRoom) {
                isUnique = true;
            }
        }

        const room = new Room({
            roomId: newRoomId,
            initialCode: code
        });

        await room.save();
        res.json({ roomId: newRoomId });
    } catch (error) {
        console.error('Fork error:', error);
        res.status(500).json({ error: 'Failed to fork snippet' });
    }
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'build')));

// The "catch all" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(['/', '/editor/*', '/share/*'], (req, res, next) => {
    if (req.path.startsWith('/share/') && req.path.endsWith('.json')) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Frontend URL: ${FRONTEND_URL}`);
}).on('error', (err) => {
    console.error('Server failed to start:', err);
    process.exit(1);
});
