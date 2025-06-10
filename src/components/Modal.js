import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const Modal = ({ onClose, code }) => {
    const [isProtected, setIsProtected] = useState(false);
    const [password, setPassword] = useState('');
    const [expiryTime, setExpiryTime] = useState('15min'); 
    const [generatedLink, setGeneratedLink] = useState('');

    const generateLink = async () => {
        try {
            if (!code) {
                toast.error('No code to share!');
                return;
            }

            const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/share`, {
                code: code.trim(), 
                isProtected,
                password: isProtected ? password : null,
                expiryTime
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                withCredentials: true
            });

            if (response.data.shareLink) {
                setGeneratedLink(response.data.shareLink);
                
                try {
                    await navigator.clipboard.writeText(response.data.shareLink);
                    toast.success('Link generated and copied to clipboard!', {
                        icon: '📋',
                        style: {
                            background: 'var(--background-light)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--success-color)',
                            padding: '12px 16px',
                            boxShadow: 'var(--shadow-md)'
                        }
                    });
                } catch (clipboardError) {
                    toast.success('Link generated! Click to copy.');
                    console.error('Clipboard error:', clipboardError);
                }
            }
        } catch (error) {
            if (error.response) {
                if (error.response.status === 429) {
                    toast.error(
                        'Share limit reached! Please wait 1 hour before sharing more code.', 
                        {
                            duration: 4000,
                            icon: '🕒',
                            style: {
                                background: 'var(--background-light)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                padding: '12px 16px',
                                boxShadow: 'var(--shadow-md)'
                            }
                        }
                    );
                } else {
                    toast.error(error.response.data.error || 'Failed to generate share link');
                }
            } else {
                toast.error('Failed to generate share link');
            }
        }
    };

    const copyToClipboard = async () => {
        if (!generatedLink) return;
        
        try {
            await navigator.clipboard.writeText(generatedLink);
            toast.success('Link copied to clipboard!', {
                icon: '📋',
                duration: 2000
            });
        } catch (error) {
            toast.error('Failed to copy link');
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>Share Code</h2>
                <div className="form-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={isProtected}
                            onChange={(e) => setIsProtected(e.target.checked)}
                        />
                        Password Protected
                    </label>
                </div>
                {isProtected && (
                    <div className="form-group">
                        <input
                            type="password"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                )}
                <div className="form-group">
                    <label>Expiry Time</label>
                    <select
                        value={expiryTime}
                        onChange={(e) => setExpiryTime(e.target.value)}
                    >
                        <option value="15min">15 Minutes</option>
                        <option value="1h">1 Hour</option>
                        <option value="24h">24 Hours</option>
                        <option value="7d">7 Days</option>
                    </select>
                </div>
                {generatedLink && (
                    <div className="generated-link">
                        <input
                            type="text"
                            value={generatedLink}
                            readOnly
                            onClick={copyToClipboard}
                            title="Click to copy"
                            className="copy-input"
                        />
                    </div>
                )}
                <div className="modal-buttons">
                    <button className="btn close-btn" onClick={onClose}>
                        Close
                    </button>
                    <button className="btn share-btn" onClick={generateLink}>
                        Generate Link
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Modal;