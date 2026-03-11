import './index.css'
import LoginPage from "./pages/LoginPage.tsx";
import {BrowserRouter, Route, Routes} from "react-router-dom";


function App() {


  return (
    <>
        <BrowserRouter>
            <Routes>
                {/* The default landing page */}
                <Route path="/" element={<LoginPage/>}/>

                {/* The windmill overview */}
                <Route path="/rooms" element={<AllWindMills/>}/>

                {/* The specific windmill */}
                <Route path="/chat/:roomName" element={<OneWindMill/>}/>
            </Routes>
        </BrowserRouter>
    </>
  )
}

export default App
