import './index.css'
import LoginPage from "./pages/LoginPage.tsx";
import OneWindMill from "./pages/OneWindMill.tsx";
import {BrowserRouter, Route, Routes} from "react-router-dom";
import AllWindMills from "./pages/AllWindMills.tsx";


function App() {


  return (
    <>
        <BrowserRouter>
            <Routes>
                {/* The default landing page */}
                <Route path="/" element={<LoginPage/>}/>

                {/* The windmill overview */}
                <Route path="/dashboard" element={<AllWindMills/>}/>

                {/* The specific windmill */}
                <Route path="/device/:deviceId" element={<OneWindMill/>}/>
            </Routes>
        </BrowserRouter>
    </>
  )
}

export default App
