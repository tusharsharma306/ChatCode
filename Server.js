const express = require('express')
const app = express();
const http = require('http');
const cors = require('cors');
app.use(cors())
const { socket } = require('socket.io-client');
const {Server} = require('socket.io');
const ACTIONS = require('./src/pages/Action');

const server = http.createServer(app);
const io = new Server(server);
const userSocketMap = {};

function getAllConnectedClients(roomId){
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) =>{
        return{
            socketId,
            username : userSocketMap[socketId],

        };
    }); 

}

io.on('connection',(socket) =>{

    console.log('socket connected',socket.id);
    socket.on(ACTIONS.JOIN,({roomId,username})=>{
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        // Notify about new joines users to existing users
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({socketId}) =>
        io.to(socketId).emit(ACTIONS.JOINED,{
            clients,
            username,
            socketId:socket.id,
        })
        )
    })

    socket.on(ACTIONS.CODE_CHANGE ,({roomId,code}) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE , {code});
    })

    socket.on(ACTIONS.SYNC_CODE ,({socketId,code}) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE , {code});
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


    socket.on('disconnecting',() =>{
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED , {
                socketId : socket.id,
                username : userSocketMap[socket.id],
            })
        })
       delete userSocketMap[socket.id];
       socket.leave();

    })
});





const PORT = process.env.PORT || 5000;
server.listen(PORT,() => console.log(`Listening on port ${PORT}`));