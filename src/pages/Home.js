import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

const generateRandomLink = (length = 8) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
};

const Home = () => {
    const navigate = useNavigate();
    const [roomId, setRoomId] = useState('');
    const [username, setUsername] = useState('');

    const createNewRoom = (e) => {
        e.preventDefault();
        const id = generateRandomLink(8); 
        setRoomId(id);
        toast.success('Created a New Room');
    };

    const joinRoom = () => {
        if (!roomId || !username) {
            toast.error('ROOM ID & UserName are required');
            return;
        }

        navigate(`/editor/${roomId}`, {
            state: {
                username,
            },
        });
    };

    const handleInputEnter = (e) => {
        if (e.code === 'Enter') {
            joinRoom();
        }
    };

    return (
        <div className='homePageWrapper'>
            <div className='formWrapper'>
                <img className='homePageLogo' src='/proj-logo.png' alt='chat-code-logo' />
                <h4 className='mainLabel'>Paste invitation ROOM ID </h4>
                <div className='inputGroup'>
                    <input
                        type='text'
                        className='inputBox'
                        placeholder='ROOM ID'
                        onChange={(e) => setRoomId(e.target.value)}
                        value={roomId}
                        onKeyUp={handleInputEnter}
                    />
                    <input
                        type='text'
                        className='inputBox'
                        placeholder='USERNAME'
                        onChange={(e) => setUsername(e.target.value)}
                        value={username}
                        onKeyUp={handleInputEnter}
                    />
                    <button className='btn joinBtn' onClick={joinRoom}>Join</button>
                    <span className='createInfo'>
                        If you don't have an invite link, create &nbsp;
                        <a onClick={createNewRoom} href='#' className='createNewBtn'>
                            a new room
                        </a>
                    </span>
                </div>
            </div>
        </div>
    );
};

export default Home;
