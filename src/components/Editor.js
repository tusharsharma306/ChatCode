import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Codemirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';
import ACTIONS from '../pages/Action';
import Modal from './Modal'; 

const Editor = ({ socketRef, roomId, onCodeChange }) => {
    const editorRef = useRef(null);
    const [showModal, setShowModal] = useState(false);
    const cursorsRef = useRef({});
    const cursorTimeoutsRef = useRef({});
    const location = useLocation();
    
    const getColorForUser = (userId) => {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
            '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB'
        ];
        const hash = Array.from(userId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[Math.abs(hash) % colors.length];
    };

    const updateCursorPosition = (socketId, cursor, username) => {
        
        if (cursorsRef.current[socketId]?.marker) {
            cursorsRef.current[socketId].marker.clear();
        }

        const cursorElement = document.createElement('div');
        cursorElement.className = 'remote-cursor';
        cursorElement.style.backgroundColor = getColorForUser(socketId);
        cursorElement.setAttribute('data-username', username);

        const cursorPos = { line: cursor.line, ch: cursor.ch };
        const marker = editorRef.current.setBookmark(cursorPos, { widget: cursorElement });

        cursorsRef.current[socketId] = {
            marker,
            element: cursorElement,
            username
        };

        if (cursorTimeoutsRef.current[socketId]) {
            clearTimeout(cursorTimeoutsRef.current[socketId]);
        }

        cursorTimeoutsRef.current[socketId] = setTimeout(() => {
            cursorElement.classList.add('cursor-inactive');
        }, 5000);
    };

    useEffect(() => {
        async function init() {
            editorRef.current = Codemirror.fromTextArea(
                document.getElementById('realtimeEditor'),
                {
                    mode: { name: 'javascript', json: true },
                    theme: 'dracula',
                    autoCloseTags: true,
                    autoCloseBrackets: true,
                    lineNumbers: true,
                    lineWrapping: true,
                    readOnly: false  
                }
            );

            editorRef.current.on('cursorActivity', () => {
                if (!socketRef.current) return;

                const cursor = editorRef.current.getCursor();
                const username = location.state?.username;

                if (cursor && typeof cursor.line === 'number' && typeof cursor.ch === 'number') {
                    socketRef.current.emit(ACTIONS.CURSOR_MOVE, {
                        roomId,
                        cursor: {
                            line: cursor.line,
                            ch: cursor.ch
                        },
                        username
                    });
                }
            });

            editorRef.current.on('change', (instance, changes) => {
                const { origin } = changes;
                const code = instance.getValue();
                onCodeChange(code);
                if (origin !== 'setValue') {
                    socketRef.current?.emit(ACTIONS.CODE_CHANGE, {
                        roomId,
                        code,
                    });
                }
            });
        }
        init();

        return () => {
            if (editorRef.current) {
                Object.values(cursorTimeoutsRef.current).forEach(clearTimeout);
                Object.values(cursorsRef.current).forEach(({ marker }) => marker?.clear());
                editorRef.current.toTextArea();
            }
        };
    }, []); 

    useEffect(() => {
        if (!socketRef.current) return;

        socketRef.current.on(ACTIONS.CURSOR_MOVE, ({ socketId, cursor, username }) => {
            if (socketId !== socketRef.current.id) {
                updateCursorPosition(socketId, cursor, username);
            }
        });

        socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId }) => {
            if (cursorsRef.current[socketId]?.marker) {
                cursorsRef.current[socketId].marker.clear();
                delete cursorsRef.current[socketId];
            }
            if (cursorTimeoutsRef.current[socketId]) {
                clearTimeout(cursorTimeoutsRef.current[socketId]);
                delete cursorTimeoutsRef.current[socketId];
            }
        });

        return () => {
            socketRef.current.off(ACTIONS.CURSOR_MOVE);
            socketRef.current.off(ACTIONS.DISCONNECTED);
        };
    }, [socketRef.current]);

    useEffect(() => {
        if (socketRef.current) {
            socketRef.current.on(ACTIONS.CODE_CHANGE, ({ code }) => {
                if (code !== null) {
                    editorRef.current.setValue(code);
                }
            });
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.off(ACTIONS.CODE_CHANGE);
                socketRef.current.off(ACTIONS.CURSOR_MOVE);
            }
        };
    }, [socketRef.current]);

    const generateShareLink = () => {
        setShowModal(true);
    };

    return (
        <div className="editor-container">
            <button 
                className="share-btn"
                onClick={generateShareLink}
                style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    zIndex: 1000
                }}
            >
                Share Code
            </button>
            <textarea id='realtimeEditor'></textarea>
            {showModal && (
                <Modal 
                    onClose={() => setShowModal(false)}
                    code={editorRef.current.getValue()}
                />
            )}
        </div>
    );
};

export default Editor;