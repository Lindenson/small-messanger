import "./App.css";
import {useEffect} from "react";
import {BrowserRouter, Route, Routes} from "react-router-dom";
import {initNotificationSound} from "@/shared/sound/sound.js";
import type {AppDispatch} from "@/store/store";
import {useDispatch} from "react-redux";

import {LS_ID, LS_NAME} from "@/shared/config/ls.ts";
import {clearUser, markInitialized, setUser} from "@/features/auth/slices/userSlice";
import Messenger from "@/pages/Messenger";
import LoginPage from "@/pages/LoginPage";
import LogoutPage from "@/pages/LogoutPage";
import {RequireAuth} from "@/features/auth/ui/RequireAuth";
import AddUser from "@/pages/AddUser.tsx";


function App() {

    const dispatch = useDispatch<AppDispatch>();

    useEffect(() => {
        const id = localStorage.getItem(LS_ID);
        const name = localStorage.getItem(LS_NAME);

        if (id?.trim() && name?.trim()) {
            initNotificationSound();
            dispatch(setUser({ id, name }));
        } else {
            dispatch(markInitialized());
        }
    }, [dispatch]);

    function handleLogin(name: string, id: string) {
        localStorage.setItem(LS_NAME, name);
        localStorage.setItem(LS_ID, id);
        dispatch(setUser({name, id}));
    }

    function handleLogout() {
        localStorage.removeItem(LS_NAME);
        localStorage.removeItem(LS_ID);
        dispatch(clearUser());
    }

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
                <Route path="/login" element={<LoginPage onLogin={handleLogin}/>}/>
                <Route path="/logout" element={<LogoutPage onLogout={handleLogout}/>}/>
            </Routes>
        </BrowserRouter>
    );
}

export default App;