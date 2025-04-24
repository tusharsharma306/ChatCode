require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const CodeShare = require('./models/CodeShare');
const app = express();
const http = require('http');
const cors = require('cors');
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 5000;

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

const userSocketMap = {};

function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) => {
        return {
            socketId,
            username: userSocketMap[socketId],

        };
    });

}

io.on('connection', (socket) => {

    console.log('socket connected', socket.id);
    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        // Notify about new joines users to existing users
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) =>
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            })
        )
    })

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    })

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    })

    socket.on(ACTIONS.GET_OUTPUT, ({ roomId, output }) => {
        socket.to(roomId).emit(ACTIONS.GET_OUTPUT, { output });
    });

    socket.on(ACTIONS.SEND, ({ roomId, messages, currentuser }) => {
        io.in(roomId).emit(ACTIONS.RECEIVE, {
            messages,
            currentuser,
        });
    })


    socket.on(ACTIONS.SEND_MESSAGE, ({ roomId, message }) => {
        socket.broadcast.to(roomId).emit(ACTIONS.SEND_MESSAGE, { message });
    });


    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            })
        })
        delete userSocketMap[socket.id];
        socket.leave();

    })
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.post('/share', async (req, res) => {
    try {
        const { code, isProtected, password, expiryTime } = req.body;

        const expiryMap = {
            '1h': 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000
        };

        const expiryTimestamp = new Date(Date.now() + expiryMap[expiryTime]);

        const codeShare = new CodeShare({
            linkId: uuidv4(),
            code,
            isProtected,
            password: isProtected ? await bcrypt.hash(password, 10) : null,
            expiryTimestamp
        });

        await codeShare.save();

        res.json({
            shareLink: `${process.env.FRONTEND_URL}/share/${codeShare.linkId}`
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
