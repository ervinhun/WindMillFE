import './index.css'
import type {ReactNode} from "react";
import LoginPage from "./pages/LoginPage.tsx";
import OneWindMill from "./pages/OneWindMill.tsx";
import {BrowserRouter, Navigate, Route, Routes} from "react-router-dom";
import AllWindMills from "./pages/AllWindMills.tsx";
import {isAuthenticated} from "./util/auth.ts";

const ProtectedRoute = ({children}: {children: ReactNode}) => {
    if (!isAuthenticated()) {
        return <Navigate to="/" replace/>;
    }

    return children;
};

function App() {


  return (
    <>
        <BrowserRouter>
            <Routes>
                {/* The default landing page */}
                <Route path="/" element={<LoginPage/>}/>

                {/* The windmill overview */}
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <AllWindMills/>
                        </ProtectedRoute>
                    }
                />

                {/* The specific windmill */}
                <Route
                    path="/device/:deviceId"
                    element={
                        <ProtectedRoute>
                            <OneWindMill/>
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </BrowserRouter>
    </>
  )
}

export default App
