import React, { useEffect, useRef, useState } from 'react';
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
                }
            );
            editorRef.current.on('change', (instance, changes) => {
                console.log('changes', changes);
                const { origin } = changes;
                const code = instance.getValue();
                onCodeChange(code);
                if (origin !== 'setValue') {
                    socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                        roomId,
                        code,
                    });
                }
            });
        }
        init();
    }, []);

    useEffect(() => {
        if (socketRef.current) {
            socketRef.current.on(ACTIONS.CODE_CHANGE, ({ code }) => {
                if (code !== null) {
                    editorRef.current.setValue(code);
                }
            });
        }
        return () => {
            socketRef.current.off(ACTIONS.CODE_CHANGE);
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