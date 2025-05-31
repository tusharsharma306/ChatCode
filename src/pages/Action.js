const ACTIONS = {
    JOIN: 'join',
    JOINED: 'joined',
    DISCONNECTED: 'disconnected',
    CODE_CHANGE: 'code-change',
    SYNC_CODE: 'sync-code',
    LEAVE: 'leave',
    GET_OUTPUT: 'get-output',
    SEND_MESSAGE: 'send-message',
    
    ROLE_CHANGE: 'role-change',
    PERMISSIONS_CHANGE: 'permissions-change',
    USER_KICKED: 'user-kicked',
    OWNER_DISCONNECTED: 'owner-disconnected',
    OWNER_TRANSFERRED: 'owner-transferred',
    CURSOR_MOVE: 'cursor-move',
    USER_TYPING: 'user-typing',
    MENTION: '@mention',
    UPDATE_ROLE: 'update-role',
    UPDATE_PERMISSIONS: 'update-permissions',
    KICK_USER: 'kick-user'
};

module.exports = ACTIONS;