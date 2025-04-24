const mongoose = require('mongoose');

const codeShareSchema = new mongoose.Schema({
    linkId: {
        type: String,
        required: true,
        unique: true
    },
    code: {
        type: String,
        required: true
    },
    isProtected: {
        type: Boolean,
        default: false
    },
    password: {
        type: String
    },
    expiryTimestamp: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('CodeShare', codeShareSchema);