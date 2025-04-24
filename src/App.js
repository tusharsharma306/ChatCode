import './App.css';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import Home from './pages/Home';
import EditorPage from './pages/EditorPage';
import SharedView from './pages/SharedView';
import {Toaster} from 'react-hot-toast'
function App() {
  return (
   <>
    <div>
      <Toaster position='top-right'
      toastOptions={{
        success:{
          time:{
            primary:'#4aed88',

            
          },
        },
      }}>
      </Toaster>
    </div>

    
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home/>}></Route>
          <Route path="/editor/:roomId"
           element={<EditorPage/>}>

           </Route>
           <Route path="/share/:linkId"
           element={<SharedView/>}>
           </Route>

        </Routes>
      
      
      </BrowserRouter>
   
   
   
   </>
    
     
  );
}

export default App;
