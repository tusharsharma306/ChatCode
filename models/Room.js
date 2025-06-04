const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    initialCode: {
        type: String
    },
    users: [{
        socketId: String,
        username: String,
        sessionId: {
            type: String,
            required: true
        },
        isConnected: {
            type: Boolean,
            default: true
        },
        lastActive: {
            type: Date,
            default: Date.now
        }
    }]
}, { 
    timestamps: true
});

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;