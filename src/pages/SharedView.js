import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import CodeMirror from 'codemirror';
import toast from 'react-hot-toast';

const SharedView = () => {
    const { linkId } = useParams();
    const [code, setCode] = useState('');
    const [isProtected, setIsProtected] = useState(false);
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchCode = async () => {
            try {
                const response = await axios.get(
                    `${process.env.REACT_APP_BACKEND_URL}/api/share/${linkId}`
                );

                if (response.data.isProtected) {
                    setIsProtected(true);
                } else {
                    setCode(response.data.code);
                }
            } catch (error) {
                if (error.response?.status === 410) {
                    toast.error('This share link has expired');
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
                `${process.env.REACT_APP_BACKEND_URL}/api/share/${linkId}/verify`,
                { password }
            );
            setCode(response.data.code);
            setIsProtected(false);
        } catch (error) {
            toast.error('Invalid password');
        }
    };

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (isProtected) {
        return (
            <div className="passwordProtected">
                <h2>This code is password protected</h2>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                />
                <button onClick={verifyPassword}>Submit</button>
            </div>
        );
    }

    return (
        <div className="sharedViewWrapper">
            <textarea id="sharedEditor"></textarea>
        </div>
    );
};

export default SharedView;