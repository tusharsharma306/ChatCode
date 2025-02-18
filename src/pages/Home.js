import React, { useState } from 'react'
import uuidV4 from 'uuid4'
import toast from 'react-hot-toast'
import {useNavigate} from 'react-router-dom'
const Home = () => {
    const navigate = useNavigate();
    const [roomId,setRoomId] = useState('');
    const [username,setUsername] = useState('');

    const createNewRoom = (e) =>{
        e.preventDefault();
        const id = uuidV4();
        setRoomId(id);
        toast.success('Created a New Room');
        
    };
    const joinRoom = () => {
      if(!roomId || !username){
        toast.error('ROOM ID & UserName is required');
        return;
      }
      // redirect
      navigate(`/editor/${roomId}`, {
        state:{
          username,
        },
      });
    }

    const handleInputEnter = (e) =>{
      if(e.code === 'Enter'){
        joinRoom();
      }
    };
  return (
  <div className='homePageWrapper'>
    <div className='formWrapper'>
       <img className='homePageLogo' src='/proj-logo.png' alt='chat-code-logo'/>
        <h4 className='mainLabel'>Paste invitation ROOM ID </h4>
        <div className='inputGroup'>
            <input 
            type='text' 
            className='inputBox' 
            placeholder='ROOM ID'
            onChange = {(e) => setRoomId(e.target.value)}
            value = {roomId}
            onKeyUp={handleInputEnter}
            >
            </input>
            <input 
            type='text' 
            className='inputBox' 
            placeholder='USERNAME'
            onChange = {(e) => setUsername(e.target.value)}
            value = {username}
            onKeyUp={handleInputEnter}
            
            >
                
            </input>
            <button className='btn joinBtn' onClick={joinRoom}>join</button>
            <span className='crateInfo'>
                If you don't have an invite link create &nbsp;
                <a onClick={createNewRoom} href='' className='createNewBtn'> 
                new room
                </a>

            </span>

        </div>
    </div>
  </div>
  )
}

export default Home


