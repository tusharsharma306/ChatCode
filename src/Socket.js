import { io } from 'socket.io-client';

export const initSocket = async () => {
    const options = {
        'force new connection': true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
        transports: ['websocket'],
        autoConnect: true,
        withCredentials: true
    };    const BACKEND_URL = process.env.NODE_ENV === 'production'
        ? 'https://chatcode-6n6e.onrender.com'
        : process.env.REACT_APP_BACKEND_URL;

    return io(BACKEND_URL, options);
};