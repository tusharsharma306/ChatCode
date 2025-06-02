const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        index: false 
    },
    initialCode: {
        type: String
    },
    users: [{
        socketId: String,
        username: String,
        sessionId: {
            type: String,
            required: true,
            index: false 
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
    timestamps: true,
    
    autoIndex: false
});

const Room = mongoose.model('Room', roomSchema);

async function setupIndexes() {
    try {
        await Room.collection.dropIndexes();
        console.log('Indexes dropped successfully');
    } catch (error) {
        console.error('Error dropping indexes:', error);
    }
}

setupIndexes();

module.exports = Room;