import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import CodeMirror from 'codemirror';
import toast from 'react-hot-toast';
import moment from 'moment';

const SharedView = () => {
    const { linkId } = useParams();
    const navigate = useNavigate();
    const [code, setCode] = useState('');
    const [isProtected, setIsProtected] = useState(false);
    const [wasProtected, setWasProtected] = useState(false);
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [showForkModal, setShowForkModal] = useState(false);
    const [forkUsername, setForkUsername] = useState('');
    const [metadata, setMetadata] = useState({
        createdAt: null,
        expiryTimestamp: null
    });
    const [timeLeft, setTimeLeft] = useState('');
    const [isExpired, setIsExpired] = useState(false); 

    useEffect(() => {
        const updateTimeLeft = () => {
            if (!metadata.expiryTimestamp) return;

            const now = moment();
            const expiry = moment(metadata.expiryTimestamp);
            const duration = moment.duration(expiry.diff(now));

            if (duration.asMilliseconds() <= 0) {
                setTimeLeft('Expired');
                setIsExpired(true); 
                toast.error('This link has expired', {
                    duration: 4000,
                    icon: '⌛',
                    style: {
                        background: 'var(--background-light)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)'
                    }
                });
                return;
            }

            if (duration.asDays() >= 1) {
                setTimeLeft(`${Math.floor(duration.asDays())}d ${duration.hours()}h remaining`);
            } else if (duration.asHours() >= 1) {
                setTimeLeft(`${Math.floor(duration.asHours())}h ${duration.minutes()}m remaining`);
            } else if (duration.asMinutes() >= 1) {
                setTimeLeft(`${Math.floor(duration.asMinutes())}m ${duration.seconds()}s remaining`);
            } else {
                setTimeLeft(`${Math.floor(duration.asSeconds())}s remaining`);
            }
        };

        updateTimeLeft();
        const timer = setInterval(updateTimeLeft, 1000);
        return () => clearInterval(timer);
    }, [metadata.expiryTimestamp]);

    useEffect(() => {
        const fetchCode = async () => {
            try {
                const response = await axios.get(
                    `${process.env.REACT_APP_BACKEND_URL}/share/${linkId}`
                );

                if (response.data.isProtected) {
                    setIsProtected(true);
                    setWasProtected(true);
                } else {
                    setCode(response.data.code);
                }
                
                setMetadata({
                    createdAt: response.data.createdAt,
                    expiryTimestamp: response.data.expiryTimestamp
                });
            } catch (error) {
                if (error.response?.status === 410) {
                    toast.error('This link has expired');
                } else {
                    toast.error('Failed to fetch code');
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchCode();
    }, [linkId]);

    useEffect(() => {
        if (code) {
            const editor = CodeMirror.fromTextArea(
                document.getElementById('sharedEditor'),
                {
                    mode: { name: 'javascript', json: true },
                    theme: 'dracula',
                    lineNumbers: true,
                    readOnly: true
                }
            );
            editor.setValue(code);
        }
    }, [code]);

    const verifyPassword = async () => {
        try {
            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_URL}/share/${linkId}/verify`,
                { password }
            );
            setCode(response.data.code);
            setIsProtected(false);
            setMetadata({
                createdAt: response.data.createdAt,
                expiryTimestamp: response.data.expiryTimestamp
            });
        } catch (error) {
            toast.error('Invalid password');
        }
    };

    const handlePasswordSubmit = (e) => {
        if (e.key === 'Enter') {
            verifyPassword();
        }
    };
    
    const handleForkSnippet = async () => {
        try {
            if (!forkUsername.trim()) {
                toast.error('Username is required');
                return;
            }

            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_URL}/fork-snippet`,
                { code }
            );

            const { roomId } = response.data;
            navigate(`/editor/${roomId}`, {
                state: {
                    username: forkUsername
                }
            });
            
            toast.success('Successfully forked snippet!');
        } catch (error) {
            console.error('Fork error:', error);
            toast.error('Failed to fork snippet');
        }
    };

    const ExpiredView = () => (
        <div className="expired-view">
            <div className="expired-content">
                <span className="expired-icon">⌛</span>
                <h2>Link Expired</h2>
                <p>This shared code snippet is no longer available</p>
                <button 
                    className="btn home-btn"
                    onClick={() => navigate('/')}
                >
                    Go Home
                </button>
            </div>
        </div>
    );

    if (isLoading) {
        return (
            <div className="loadingWrapper">
                <span>Loading<span className="loadingDots"></span></span>
            </div>
        );
    }

    if (isExpired) {
        return <ExpiredView />;
    }

    if (isProtected) {
        return (
            <div className="passwordProtected">
                <div className="formWrapper">
                    <h2>This code is password protected</h2>
                    <div className="form-group">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={handlePasswordSubmit} 
                            placeholder="Enter password"
                            autoFocus
                        />
                    </div>
                    <button onClick={verifyPassword}>
                        Submit
                    </button>
                </div>
            </div>
        );
    }

  
    return (
        <div className="sharedViewWrapper">
            {metadata.createdAt && (
                <div className="metadata-banner">
                    <div className="metadata-item">
                        <span className="metadata-label">Status:</span>
                        <span className={`metadata-value ${wasProtected ? 'protected' : 'public'}`}>
                            {wasProtected ? '🔒 Password Protected' : '🌐 Public'}
                        </span>
                    </div>
                    <div className="metadata-item">
                        <span className="metadata-label">Created:</span>
                        <span className="metadata-value">
                            {moment(metadata.createdAt).format('MMM D, YYYY h:mm A')}
                        </span>
                    </div>
                    {timeLeft && (
                        <div className="metadata-item">
                            <span className="metadata-label">Expiry:</span>
                            <span className={`metadata-value ${timeLeft === 'Expired' ? 'expired' : ''}`}>
                                {timeLeft}
                            </span>
                        </div>
                    )}
                </div>
            )}
            <div className="snippet-actions">
                <button 
                    className="btn fork-btn"
                    onClick={() => setShowForkModal(true)}
                    disabled={!code}
                >
                    <img src="/code-fork.png" alt="fork" />
                    Fork Code
                </button>
            </div>
            <textarea id="sharedEditor"></textarea>

            {showForkModal && (
                <div className="modal-overlay">
                    <div className="modal-content fork-modal">
                        <h2>Fork Code Snippet</h2>
                        <div className="form-group">
                            <input
                                type="text"
                                placeholder="Enter your username"
                                value={forkUsername}
                                onChange={(e) => setForkUsername(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleForkSnippet()}
                                autoFocus
                            />
                        </div>
                        <div className="modal-buttons">
                            <button 
                                className="btn close-btn"
                                onClick={() => {
                                    setShowForkModal(false);
                                    setForkUsername('');
                                }}
                            >
                                Cancel
                            </button>
                            <button 
                                className="btn fork-confirm-btn"
                                onClick={handleForkSnippet}
                            >
                                Create Room
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SharedView;