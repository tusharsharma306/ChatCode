const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true
    },
    ownerId: {
        type: String,
        required: true
    },
    ownerDisconnectedAt: {
        type: Date
    },
    code: {
        type: String,
        default: ''
    },
    roomWidePermissions: {
        canEdit: { type: Boolean, default: true },
        canExecute: { type: Boolean, default: true },
        canShare: { type: Boolean, default: true }
    },
    users: [{
        socketId: String,
        username: String,
        role: {
            type: String,
            enum: ['owner', 'editor', 'viewer'],
            default: 'editor'
        },
        sessionId: String,
        isConnected: { type: Boolean, default: true },
        lastActive: {
            type: Date,
            default: Date.now
        }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Room', roomSchema);