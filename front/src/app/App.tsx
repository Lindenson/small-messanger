import "./App.css";
import {BrowserRouter, Route, Routes} from "react-router-dom";
import Messenger from "@/pages/Messenger";
import LoginPage from "@/features/auth/ui/LoginPage.tsx";
import LogoutPage from "@/features/auth/ui/LogoutPage.tsx";
import {RequireAuth} from "@/features/auth/ui/RequireAuth";
import AddUser from "@/features/contacts/ui/AddUser.tsx";
import {useWebSocketConnection} from "@/infrastructure/hooks/useWebSocketConnection.ts";
import {Toaster} from "react-hot-toast";
import RegistrationPage from "@/features/auth/ui/RegistrationPage.tsx";
import {useEffect} from "react";
import {markInitialized} from "@/features/auth/slices/userSlice.ts";
import {useDispatch} from "react-redux";

function App() {


    /* ======================
    WebSocket connection
    ====================== */
    useWebSocketConnection();

    const dispatch = useDispatch();
    useEffect(() => {
        dispatch(markInitialized());
    }, [dispatch]);

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={
                    <RequireAuth>
                        <Messenger/>
                    </RequireAuth>
                }
                />
                <Route path="/add" element={
                    <RequireAuth>
                        <AddUser/>
                    </RequireAuth>
                }
                />
                <Route path="/login" element={<LoginPage/>}/>
                <Route path="/logout" element={<LogoutPage/>}/>
                <Route path="/register" element={<RegistrationPage/>}/>

            </Routes>
            <Toaster/>
        </BrowserRouter>
    );
}

export default App;