import React,{useEffect, useRef, useState} from 'react'
import Client from '../components/Client';
import Editor from '../components/Editor';
import { initSocket } from '../Socket';
import ACTIONS from './Action';
import { useLocation,useNavigate,Navigate,useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import axios from "axios";


function EditorPage() {
  const socketRef = useRef(null);
  const codeRef = useRef(null);
  const location = useLocation();
  const reactNavigator = useNavigate();
  const { roomId } = useParams();


  const [clients, SetClients] = useState([]);


  useEffect(() => {
    const init = async () => {
      socketRef.current = await initSocket();
      socketRef.current.on('connect_error', (err) => handleErrors(err));
      socketRef.current.on('connect_failed', (err) => handleErrors(err));

      function handleErrors(e) {
        console.log('socket error', e);
        toast.error('socket connection failed,try again later.');
        reactNavigator('/');
      }
      socketRef.current.emit(ACTIONS.JOIN, {
        roomId,
        username: location.state?.username,
      });

      // listening for joined events
      socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
        if (username !== location.state?.username) {
          toast.success(`${username} Joined the room`);
        }
        SetClients(clients);
        socketRef.current.emit(ACTIONS.SYNC_CODE, {
          code: codeRef.current,
          socketId,
        });
      });

      // listning for disconnected
      socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
        toast.success(`${username} left the room.`);
        SetClients((prev) => {
          return prev.filter(client => client.socketId !== socketId);
        });
      });

       //Listening for message
       socketRef.current.on(ACTIONS.SEND_MESSAGE, ({ message }) => {
        const chatWindow = document.getElementById("chatWindow");
        var currText = chatWindow.value;
        currText += message;
        chatWindow.value = currText;
        chatWindow.scrollTop = chatWindow.scrollHeight;
      });
     
    };
    init();
    return () => {
      socketRef.current.disconnect();
      socketRef.current.off(ACTIONS.JOINED);
      socketRef.current.off(ACTIONS.DISCONNECTED);
      socketRef.current.off(ACTIONS.SEND_MESSAGE);
    };
  }, []);


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
    reactNavigator('/');
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
  
  

  
  const runCode = () => {
    const lang = document.getElementById("languageOptions").value;
    const input = document.getElementById("input").value;
    const code = codeRef.current;
    const defaultInput = "Default input value";
    toast.loading("Running Code....");

    const encodedParams = new URLSearchParams();
    encodedParams.append("LanguageChoice", lang);
    encodedParams.append("Program", code);
    encodedParams.append("Input", input || defaultInput);
    
  

const options = {
  method: 'POST',
  url: 'https://code-compiler.p.rapidapi.com/v2',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    'X-RapidAPI-Key': process.env.REACT_APP_API_KEY,
    'X-RapidAPI-Host': 'code-compiler.p.rapidapi.com'
  },
  data: encodedParams,
};

console.log(options);

axios
  .request(options)
  .then(function (response) {
    let message = response.data.Result;
    if (message === null) {
      message = response.data.Errors;
    }
    

     document.getElementById("input").value = message;
    socketRef.current.emit(ACTIONS.GET_OUTPUT, { roomId, output: message });
    toast.dismiss();
    toast.success("Code compilation complete");
  })
  .catch(function (_error) {
    toast.dismiss();
    toast.error("Code compilation unsuccessful");
    document.getElementById("input").value =
      "Something went wrong, Please check your code and input.";
  });
};



const sendMessage = () => {
  console.log("sendMessage function called");
  const inputBox = document.getElementById("inputBox");
  const message = inputBox.value;

  if (message.trim() === "") {
    console.log("Message is empty");
    return;
  }

  

  console.log("Sending message:", message);

  const formattedMessage = `> ${location.state.username}:\n${message}\n`;
  const chatWindow = document.getElementById("chatWindow");
  chatWindow.value += formattedMessage;
  chatWindow.scrollTop = chatWindow.scrollHeight;
  inputBox.value = "";
  console.log("Emitting message to server:", formattedMessage);
  socketRef.current.emit(ACTIONS.SEND_MESSAGE, { roomId, message: formattedMessage });
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
              src='/proj-logo.png' alt='chat-code-logo' />

          </div>
          <h3>Connected</h3>
          <div className='clientsList'>
            {clients.map((client) => (
              <Client
                key={client.socketId}
                username={client.username} />
            ))}
          </div>
        </div>

        <label>
          Select Language:
          <select id="languageOptions" className="seLang" defaultValue="17">
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
        </label>
        <button className="btn runBtn" onClick={runCode}>
          Run Code
        </button>

        <button className='btn copyBtn' onClick={copyRoomId}>
          Copy ROOM ID</button>
        <button className='btn leaveBtn' onClick={leaveRoom}>
          Leave</button>
        
      </div>
      <div className='editorWrap'>
        <Editor socketRef={socketRef} roomId={roomId} onCodeChange={(code) => {
          codeRef.current = code;
        } } />
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
        <textarea
          id="chatWindow"
          className="chatArea textarea-style"
          placeholder="Chat messages will appear here"
          disabled
        ></textarea>
        <div className="sendChatWrap">
          <input
            id="inputBox"
            type="text"
            placeholder="Type your message here"
            className="inputField"
            onKeyUp={handleInputEnter}
          ></input>
          <button className="btn sendBtn" onClick={sendMessage}>
            <img src = '/send-button.png' alt='send' className='send'></img>
          </button>
        </div>
      </div>

    </div>
  );
}

export default EditorPage
