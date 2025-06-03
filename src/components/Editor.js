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
import { toast } from 'react-hot-toast';

const Editor = ({ 
    socketRef, 
    roomId, 
    onCodeChange,
    copyRoomId,
    leaveRoom
}) => {
    const editorRef = useRef(null);
    const [showModal, setShowModal] = useState(false);
    const location = useLocation();
    const cursorsRef = useRef({});
    const cursorTimeoutsRef = useRef({});
    const [editorReady, setEditorReady] = useState(false);

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
                    styleActiveLine: true,
                    matchBrackets: true,
                    tabSize: 2,
                    indentUnit: 2,
                    viewportMargin: Infinity,
                    extraKeys: {
                        'Ctrl-S': function(cm) {
                            
                            return false;
                        }
                    }
                }
            );
            editorRef.current.setSize('100%', '100%');
            editorRef.current.refresh();
            setEditorReady(true);

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

            editorRef.current.on('cursorActivity', () => {
                if (!socketRef.current) return;
                
                const cursor = editorRef.current.getCursor();
                
                socketRef.current.emit(ACTIONS.CURSOR_MOVE, {
                    roomId,
                    cursor,
                    username: location.state?.username
                });
            });
        }
        init();

        return () => {
            if (editorRef.current) {
                
                Object.values(cursorsRef.current).forEach(cursor => cursor.clear());
                cursorsRef.current = {};
                
                Object.values(cursorTimeoutsRef.current).forEach(timeout => clearTimeout(timeout));
                cursorTimeoutsRef.current = {};
               
                editorRef.current.toTextArea();
            }
        };
    }, []);

    useEffect(() => {
        if (socketRef.current && editorReady) {
            socketRef.current.on(ACTIONS.CODE_CHANGE, ({ code }) => {
                if (code !== null && editorRef.current) {
                    const cursor = editorRef.current.getCursor();
                    const scrollInfo = editorRef.current.getScrollInfo();
                    editorRef.current.setValue(code);
                    editorRef.current.setCursor(cursor);
                    editorRef.current.scrollTo(scrollInfo.left, scrollInfo.top);
                }
            });

            socketRef.current.on(ACTIONS.CURSOR_MOVE, ({ socketId, cursor,  username }) => {
                if (!cursor || socketId === socketRef.current.id) return;

                if (cursorTimeoutsRef.current[socketId]) {
                    clearTimeout(cursorTimeoutsRef.current[socketId]);
                }

              
                if (cursorsRef.current[socketId]) {
                    cursorsRef.current[socketId].clear();
                }

                const cursorElement = document.createElement('span');
                cursorElement.className = 'remote-cursor';
                cursorElement.style.borderLeftColor = `hsl(${hashCode(username) % 360}, 70%, 50%)`;
                cursorElement.setAttribute('data-username', username);

                cursorsRef.current[socketId] = editorRef.current.setBookmark(
                    { line: cursor.line, ch: cursor.ch },
                    { widget: cursorElement }
                );

                cursorTimeoutsRef.current[socketId] = setTimeout(() => {
                    if (cursorsRef.current[socketId]) {
                        cursorsRef.current[socketId].clear();
                        delete cursorsRef.current[socketId];
                    }
                }, 3000);
            });

            return () => {
                socketRef.current.off(ACTIONS.CODE_CHANGE);
                socketRef.current.off(ACTIONS.CURSOR_MOVE);
            };
        }
    }, [socketRef.current, editorReady]);

    const runCode = async () => {
        try {
            const lang = document.querySelector(".header-select").value;
            const inputArea = document.querySelector(".inputArea");
            const code = editorRef.current.getValue();
            
            toast.loading("Running Code....");

            const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/run-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    code,
                    language: lang,
                    input: inputArea?.value
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to compile code');
            }

            if (inputArea) {
                inputArea.value = data.output;
            }

            socketRef.current?.emit(ACTIONS.GET_OUTPUT, { 
                roomId, 
                output: data.output 
            });

            toast.dismiss();
            toast.success("Code compilation complete");

        } catch (error) {
            console.error('Run code error:', error);
            toast.dismiss();
            toast.error(error.message || "Code compilation unsuccessful");
            
            const inputArea = document.querySelector(".inputArea");
            if (inputArea) {
                inputArea.value = "Something went wrong, Please check your code and input.";
            }
        }
    };

    const hashCode = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash);
    };

    return (
        <div className="editor-container">
            <div className="editor-header">
                <select className="header-select" defaultValue="7">
                <option value="1">C#</option>
                <option value="4">Java</option>
                <option value="5">Python</option>
                <option value="6">C (gcc)</option>
                <option value="7">C++ (gcc)</option>
                <option value="8">PHP</option>
                <option value="11">Haskell</option>
                <option value="12">Ruby</option>
                <option value="13">Perl</option>
                <option value="17">Javascript</option>
                <option value="20">Golang</option>
                <option value="21">Scala</option>
                <option value="37">Swift</option>
                <option value="38">Bash</option>
                <option value="43">Kotlin</option>
                <option value="60">TypeScript</option>
                </select>
                
                <div className="editor-header-buttons">
                    <button 
                        className="icon-btn run-code btn-tooltip" 
                        onClick={runCode}
                        data-tooltip="Run Code"
                    >
                        <img src="/run-icon.png" alt="run" />
                    </button>
                    <button 
                        className="icon-btn share-code btn-tooltip"
                        onClick={() => setShowModal(true)}
                        data-tooltip="Share Code"
                    >
                        <img src="/share-icon.png" alt="share" />
                    </button>
                    <button 
                        className="icon-btn copy-id btn-tooltip" 
                        onClick={copyRoomId}
                        data-tooltip="Copy Room ID"
                    >
                        <img src="/copy-icon.png" alt="copy" />
                    </button>
                    <button 
                        className="icon-btn leave-room btn-tooltip" 
                        onClick={leaveRoom}
                        data-tooltip="Leave Room"
                    >
                        <img src="/leave-icon.png" alt="leave" />
                    </button>
                </div>
            </div>
            <div className="editor-content">
                <textarea id="realtimeEditor"></textarea>
            </div>
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