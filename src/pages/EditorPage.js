import React,{useEffect, useRef, useState} from 'react'
import Client from '../components/Client';
import Editor from '../components/Editor';
import { initSocket } from '../Socket';
import ACTIONS from './Action';
import { useLocation,useNavigate,Navigate,useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

const TypingIndicator = ({ typingUsers, currentUser }) => {
    const typingUsersArray = Array.from(typingUsers);
    const otherTypingUsers = typingUsersArray.filter(user => user !== currentUser);
    
    if (otherTypingUsers.length === 0) return null;
    
    return (
        <div className="typing-indicator">
            {otherTypingUsers.length === 1 
                ? `${otherTypingUsers[0]} is typing...`
                : `${otherTypingUsers.join(', ')} are typing...`}
        </div>
    );
};



function EditorPage() {
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const typingTimeoutRef = useRef({});  
    const [clients, setClients] = useState([]);
    const [typingUsers, setTypingUsers] = useState(new Set());
    const [mentionTimeouts, setMentionTimeouts] = useState({});
    const [sessionId] = useState(() => {
        const stored = localStorage.getItem('sessionId');
        if (stored) return stored;
        const newId = Math.random().toString(36).substr(2, 9);
        localStorage.setItem('sessionId', newId);
        return newId;
    });
    const reconnectingRef = useRef(false);
    
    useEffect(() => {
        if (location.state?.forkedCode) {
            codeRef.current = location.state.forkedCode;
        }
    }, [location.state]);

    const navigate = useNavigate();

    useEffect(() => {
        const init = async () => {
            socketRef.current = await initSocket();
            
            socketRef.current.on('connect', () => {
                if (reconnectingRef.current) {
                    toast.dismiss('reconnect-toast');
                    toast.success('Reconnected successfully', {
                        duration: 3000,
                        icon: '🔄'
                    });
                }
                socketRef.current.emit(ACTIONS.JOIN, {
                    roomId,
                    username: location.state?.username,
                    sessionId,
                    isReconnecting: reconnectingRef.current
                });
                
                reconnectingRef.current = false;
            });

            socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
                if (username !== location.state?.username) {
                    toast.success(`${username} joined the room`, {
                        id: `join-${username}`, 
                        duration: 2000
                    });
                }
                setClients(clients);
                
                if (!reconnectingRef.current) {
                    socketRef.current.emit(ACTIONS.SYNC_CODE, {
                        code: codeRef.current,
                        socketId,
                    });
                }
            });

            socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username, clients }) => {
                toast.success(`${username} left the room`, {
                    id: `leave-${username}`,
                    duration: 2000
                });
                setClients(clients);
            });

            //Listening for message
            // socketRef.current.on(ACTIONS.SEND_MESSAGE, ({ message, username }) => {
            //     const chatWindow = document.getElementById("chatWindow");
            //     const formattedMessage = `> ${username}:\n${message}\n`;
            //     chatWindow.value += formattedMessage;
            //     chatWindow.scrollTop = chatWindow.scrollHeight;
            // });

            socketRef.current.on(ACTIONS.SEND_MESSAGE, ({ message, username, mentions }) => {
                const chatWindow = document.getElementById("chatWindow");
                const currentUser = location.state?.username;

                let formattedMessage = message;
                if (mentions) {
                    mentions.forEach(mention => {
                        const mentionRegex = new RegExp(mention, 'g');
                        const isSelfMention = mention.slice(1).toLowerCase() === currentUser.toLowerCase();
                        const cssClass = isSelfMention ? 'highlight-mention' : 'mention';
                        formattedMessage = formattedMessage.replace(
                            mentionRegex, 
                            `<span class="${cssClass}">${mention}</span>`
                        );
                    });
                }

                const messageHtml = `> ${username}:\n${formattedMessage}\n`;
                
                const messageDiv = document.createElement('div');
                messageDiv.innerHTML = messageHtml;
                chatWindow.appendChild(messageDiv);
                chatWindow.scrollTop = chatWindow.scrollHeight;
            });


            socketRef.current.on(ACTIONS.MENTION, ({ fromUser, message }) => {
                const timeoutKey = `${fromUser}-${Date.now()}`;
                
                if (!mentionTimeouts[timeoutKey]) {
                    toast.success(`@${fromUser} mentioned you: "${message}"`, {
                        icon: '📣',
                        duration: 4000
                    });

                    setMentionTimeouts(prev => ({
                        ...prev,
                        [timeoutKey]: true
                    }));

                    setTimeout(() => {
                        setMentionTimeouts(prev => {
                            const newTimeouts = { ...prev };
                            delete newTimeouts[timeoutKey];
                            return newTimeouts;
                        });
                    }, 10000);
                }
            });

            socketRef.current.on(ACTIONS.USER_TYPING, ({ username }) => {
                if (!username) return;
                
                setTypingUsers(prev => {
                    const newSet = new Set(prev);
                    newSet.add(username);
                    return newSet;
                });

                if (typingTimeoutRef.current[username]) {
                    clearTimeout(typingTimeoutRef.current[username]);
                }

                typingTimeoutRef.current[username] = setTimeout(() => {
                    setTypingUsers(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(username);
                        return newSet;
                    });
                    delete typingTimeoutRef.current[username];
                }, 2000);
            });

            socketRef.current.on('connect_error', (err) => {
                reconnectingRef.current = true;
                toast.error('Connection error, attempting to reconnect...', {
                    id: 'reconnect-toast',
                    duration: 3000
                });
            });

            socketRef.current.on('error', ({ message }) => {
                toast.error(message);
            });

            socketRef.current.on('rateLimitExceeded', ({ feature, message }) => {
                toast.error(
                    `${feature} limit exceeded! Please slow down and try again in a moment.`, 
                    {
                        duration: 4000,
                        icon: '⚠️',
                        style: {
                            background: 'var(--background-light)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--text-secondary)',
                            padding: '12px 16px',
                            boxShadow: 'var(--shadow-md)',
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: '500'
                        }
                    }
                );
            });
        };
        init();

        return () => {
            toast.dismiss('reconnect-toast');
            toast.dismiss('disconnect-toast');
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current.off('connect');
                socketRef.current.off('connect_error');
            }
        };
    }, []);

    useEffect(() => {
        if (socketRef.current) {
            socketRef.current.on(ACTIONS.GET_OUTPUT, ({ output }) => {
                const inputArea = document.getElementById("input");
                if (inputArea) {
                    inputArea.value = output;
                }
                
                const inputLabel = document.getElementById("inputLabel");
                const outputLabel = document.getElementById("outputLabel");
                if (inputLabel && outputLabel) {
                    inputLabel.classList.remove("clickedLabel");
                    inputLabel.classList.add("notClickedLabel");
                    outputLabel.classList.remove("notClickedLabel");
                    outputLabel.classList.add("clickedLabel");
                }
            });

            return () => {
                socketRef.current.off(ACTIONS.GET_OUTPUT);
            };
        }
    }, []);


    const handleMessageInput = (e) => {
        if (!socketRef.current) return;
        
        const username = location.state?.username;
        if (!username) return;

        socketRef.current.emit(ACTIONS.USER_TYPING, {
            roomId,
            username
        });
    };


    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID has been copied');

        } catch (err) {
            toast.error('Could not copy the Room ID');
            console.error(err);
        }
    }

    function leaveRoom() {
        navigate('/');
    }
 


    if (!location.state) {
        return <navigate to="/"></navigate>;
    }


    const inputClicked = () => {
        const inputArea = document.getElementById("input");
        inputArea.placeholder = "Enter your input here";
        inputArea.value = "";
        inputArea.disabled = false;
        const inputLabel = document.getElementById("inputLabel");
        const outputLabel = document.getElementById("outputLabel");
        inputLabel.classList.remove("notClickedLabel");
        inputLabel.classList.add("clickedLabel");
        outputLabel.classList.remove("clickedLabel");
        outputLabel.classList.add("notClickedLabel");
    };

    const outputClicked = () => {
        const inputArea = document.getElementById("input");
        inputArea.placeholder =
          "Code output will appear here...";
    
        inputArea.disabled = false;
    
        const inputLabel = document.getElementById("inputLabel");
        const outputLabel = document.getElementById("outputLabel");
    
        inputLabel.classList.remove("clickedLabel");
        inputLabel.classList.add("notClickedLabel");
        outputLabel.classList.remove("notClickedLabel");
        outputLabel.classList.add("clickedLabel");
    
        
      };
      
      


    const sendMessage = () => {
      const inputBox = document.getElementById("inputBox");
      const message = inputBox.value.trim();

      if (!message || !socketRef.current) return;

      const username = location.state?.username;
      const currentUser = location.state?.username;
      
      inputBox.value = "";

      const mentionRegex = /@(\w+)/g;
      const mentions = message.match(mentionRegex);

      let formattedMessage = message;
      if (mentions) {
          mentions.forEach(mention => {
              const mentionRegex = new RegExp(mention, 'g');
              const isSelfMention = mention.slice(1).toLowerCase() === currentUser.toLowerCase();
              const cssClass = isSelfMention ? 'highlight-mention' : 'mention';
              formattedMessage = formattedMessage.replace(
                  mentionRegex, 
                  `<span class="${cssClass}">${mention}</span>`
              );
          });
      }

      const chatWindow = document.getElementById("chatWindow");
      const messageDiv = document.createElement('div');
      messageDiv.innerHTML = `> ${username}:\n${formattedMessage}\n`;
      chatWindow.appendChild(messageDiv);
      chatWindow.scrollTop = chatWindow.scrollHeight;

      socketRef.current.emit(ACTIONS.SEND_MESSAGE, { 
          roomId, 
          message, 
          username,
          mentions: mentions || [] 
      });
    };


    const handleInputEnter = (key) => {
      if (key.code === "Enter") {
        sendMessage();
      }
    };


    return (
        <div className='mainWrap'>
            <div className='aside'>
                <div className='asideInner'>
                    <div className='logo'>
                        <img
                            className='logoImage'
                            src='/proj-logo.png'
                            alt='chat-code-logo'
                        />

                    </div>
                    <h3>Connected</h3>
                    <div className='clientsList'>
                        {clients.map((client) => (
                            <Client
                                key={client.socketId}
                                username={client.username}
                                socketId={client.socketId}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className='editorWrap'>
                <Editor
                    socketRef={socketRef}
                    roomId={roomId}
                    onCodeChange={(code) => {
                        codeRef.current = code;
                    }}
                    copyRoomId={copyRoomId}
                    leaveRoom={leaveRoom}
                />
                <div className="IO-container">
                    <label
                        id="inputLabel"
                        className="clickedLabel"
                        onClick={inputClicked}
                    >
                        Input
                    </label>
                    <label
                        id="outputLabel"
                        className="notClickedLabel"
                        onClick={outputClicked}
                    >
                        Output
                    </label>
                </div>
                <textarea
                    id="input"
                    className="inputArea textarea-style"
                    placeholder="Enter your input here"
                ></textarea>
            </div>

            <div className="chatWrap">
                <div
                    id="chatWindow"
                    className="chatArea textarea-style"
                    style={{ 
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                    }}
                />
                {typingUsers.size > 0 && (
                    <TypingIndicator 
                        typingUsers={typingUsers} 
                        currentUser={location.state?.username}
                    />
                )}
                <div className="sendChatWrap">
                    <input
                        id="inputBox"
                        type="text"
                        placeholder="Type your message here"
                        className="inputField"
                        onKeyUp={handleInputEnter}
                        onChange={handleMessageInput}
                    />
                    <button className="btn sendBtn" onClick={sendMessage}>
                        <img src="/send-button.png" alt="send" className="send" />
                    </button>
                </div>
            </div>

        </div>
      );
}

export default EditorPage
