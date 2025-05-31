require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const CodeShare = require('./models/CodeShare');
const app = express();
const http = require('http');
const cors = require('cors');
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 5000;
const Room = require('./models/Room');

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch((err) => console.error('MongoDB connection error:', err));

app.use(cors({
    origin: process.env.FRONTEND_URL, 
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
const { Server } = require('socket.io');
const ACTIONS = require('./src/pages/Action');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        methods: ['GET', 'POST'],
        credentials: true,
        allowedHeaders: ['Content-Type']
    }
});

const userSocketMap = new Map(); 

async function getAllConnectedClients(roomId) {
    try {
        const room = await Room.findOne({ roomId });
        if (!room) return [];
        
        return room.users
            .filter(user => user.isConnected)
            .map(user => ({
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

const ownershipTransferTimeout = 10 * 60 * 1000; 

io.on('connection', async (socket) => {
    console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, async ({ roomId, username, role: requestedRole, readonly }) => {
        try {
            let room = await Room.findOne({ roomId });
            
            userSocketMap.set(socket.id, {
                username,
                roomId,
                role: room?.ownerId === socket.id ? 'owner' : 'editor' 
            });

            const existingUser = room?.users.find(u => u.username === username);
            
            if (!room) {
                room = new Room({
                    roomId,
                    ownerId: socket.id,
                    users: [{
                        socketId: socket.id,
                        username,
                        role: 'owner',
                        sessionId: socket.id,
                        isConnected: true
                    }],
                    roomWidePermissions: {
                        canEdit: true,
                        canExecute: true,
                        canShare: true
                    }
                });
            } else if (existingUser) {
                
                existingUser.socketId = socket.id;
                existingUser.isConnected = true;
                existingUser.lastActive = new Date();
                existingUser.role = existingUser.role === 'owner' ? 'owner' : 'editor'; 
            } else {
                room.users.push({
                    socketId: socket.id,
                    username,
                    role: 'editor', 
                    sessionId: socket.id,
                    isConnected: true
                });
            }

            await room.save();
            socket.join(roomId);

            const userRole = room.users.find(u => u.socketId === socket.id)?.role || 'editor';

            const clients = await getAllConnectedClients(roomId);

            io.to(roomId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
                role: userRole,
                permissions: {
                    canEdit: true,
                    canExecute: true,
                    canShare: true
                }
            });

        } catch (error) {
            console.error('JOIN error:', error);
        }
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    })

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


    socket.on(ACTIONS.SEND_MESSAGE, async ({ roomId, message, username }) => {
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

    socket.on(ACTIONS.UPDATE_ROLE, async ({ roomId, targetSocketId, newRole }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (!room || room.ownerId !== socket.id) {
                return;
            }

            const userIndex = room.users.findIndex(u => u.socketId === targetSocketId);
            if (userIndex === -1) {
                return;
            }

            if (room.users[userIndex].role === 'owner') {
                return;
            }

            room.users[userIndex].role = newRole;
            await room.save();

            io.in(roomId).emit(ACTIONS.ROLE_CHANGE, {
                socketId: targetSocketId,
                newRole
            });
        } catch (error) {
            console.error('Role update error:', error);
        }
    });

    socket.on(ACTIONS.UPDATE_PERMISSIONS, async ({ roomId, permissions }) => {
        try {
            const room = await Room.findOne({ roomId });
            if (!room || room.ownerId !== socket.id) {
                return;
            }

            room.roomWidePermissions = permissions;
            await room.save();

            io.in(roomId).emit(ACTIONS.PERMISSIONS_CHANGE, { permissions });
        } catch (error) {
            console.error('Permissions update error:', error);
        }
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
            const user = userSocketMap.get(socket.id);
            if (user) {
                const room = await Room.findOne({ roomId: user.roomId });
                if (room) {
                    const disconnectedUser = room.users.find(u => u.socketId === socket.id);
                    if (disconnectedUser) {
                        disconnectedUser.isConnected = false;
                        disconnectedUser.lastActive = new Date();
                    }

                    if (room.ownerId === socket.id) {
                        room.ownerDisconnectedAt = new Date();
                        
                        io.to(room.roomId).emit(ACTIONS.OWNER_DISCONNECTED, {
                            message: 'Owner disconnected. Room management is paused. Waiting up to 10 minutes before transfer.'
                        });

                        setTimeout(async () => {
                            const updatedRoom = await Room.findById(room._id);
                            if (updatedRoom && !updatedRoom.users.find(u => u.socketId === socket.id)?.isConnected) {
                                
                                const newOwner = updatedRoom.users
                                    .filter(u => u.isConnected && u.socketId !== socket.id)
                                    .sort((a, b) => a.joinedAt - b.joinedAt)[0];

                                if (newOwner) {
                                    updatedRoom.ownerId = newOwner.socketId;
                                    newOwner.role = 'owner';
                                    updatedRoom.ownerDisconnectedAt = null;
                                    await updatedRoom.save();

                                    io.to(updatedRoom.roomId).emit(ACTIONS.OWNER_TRANSFERRED, {
                                        newOwnerUsername: newOwner.username
                                    });
                                }
                            }
                        }, ownershipTransferTimeout);
                    }

                    await room.save();

                    socket.to(room.roomId).emit(ACTIONS.DISCONNECTED, {
                        socketId: socket.id,
                        username: user.username
                    });
                }
                userSocketMap.delete(socket.id);
            }
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    });

});

// Error handling middleware
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

app.post('/share', async (req, res) => {
    try {
        const { code, isProtected, password, expiryTime } = req.body;

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
            code,
            isProtected,
            password: isProtected ? await bcrypt.hash(password, 10) : null,
            expiryTimestamp
        });

        await codeShare.save();

        res.json({
            shareLink: `${process.env.FRONTEND_URL}/share/${linkId}`
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Failed to generate link' });
    }
});

app.get('/share/:linkId', async (req, res) => {
    try {
        const { linkId } = req.params;
        const codeShare = await CodeShare.findOne({ linkId });

        if (!codeShare) {
            return res.status(404).json({ error: 'Link not found' });
        }

        if (Date.now() > codeShare.expiryTimestamp) {
            return res.status(410).json({ error: 'Link expired' });
        }

        if (codeShare.isProtected) {
            return res.json({ isProtected: true });
        }

        res.json({
            code: codeShare.code,
            isProtected: false
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch Code' });
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

        res.json({ code: codeShare.code });
    } catch (error) {
        res.status(500).json({ error: 'Failed to verify password' });
    }
});

server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
