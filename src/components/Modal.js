import React, { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const Modal = ({ onClose, code }) => {
    const [isProtected, setIsProtected] = useState(false);
    const [password, setPassword] = useState('');
    const [expiryTime, setExpiryTime] = useState('1h');
    const [generatedLink, setGeneratedLink] = useState('');

    const generateLink = async () => {
        try {
            const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/share`, {
                code,
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
                await navigator.clipboard.writeText(response.data.shareLink);
                toast.success('Link generated and copied to clipboard!');
            } else {
                throw new Error('Invalid response from server');
            }
        } catch (error) {
            console.error('Error generating link:', error);
            toast.error(error.response?.data?.error || 'Failed to generate share link');
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
                    <select
                        value={expiryTime}
                        onChange={(e) => setExpiryTime(e.target.value)}
                    >
                        <option value="1h">1 Hour</option>
                        <option value="24h">24 Hours</option>
                        <option value="7d">7 Days</option>
                    </select>
                </div>
                <button className="btn share-btn" onClick={generateLink}>Generate Link</button>
                {generatedLink && (
                    <div className="generated-link">
                        <input
                            type="text"
                            value={generatedLink}
                            readOnly
                        />
                    </div>
                )}
                <button className="btn" onClick={onClose}>Close</button>
            </div>
        </div>
    );
};

export default Modal;