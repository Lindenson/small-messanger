import "./App.css";
import {BrowserRouter, Route, Routes} from "react-router-dom";
import {lazy, Suspense, useEffect} from "react";
import {useDispatch} from "react-redux";
import {Toaster} from "react-hot-toast";

import {RequireAuth} from "@/features/auth/ui/RequireAuth";
import {useWebSocketConnection} from "@/infrastructure/hooks/useWebSocketConnection.ts";
import {markInitialized} from "@/features/auth/slices/userSlice.ts";
import {ErrorBoundary} from "@/shared/ui/ErrorBoundary.tsx";
import {armNotificationPermissionOnGesture, requestNotificationPermission} from "@/shared/sound/notify.ts";

// Route-level code splitting: keep the initial bundle small (each screen loads on demand).
const Messenger = lazy(() => import("@/pages/Messenger"));
const AddUser = lazy(() => import("@/features/contacts/ui/AddUser.tsx"));
const LoginPage = lazy(() => import("@/features/auth/ui/LoginPage.tsx"));
const LogoutPage = lazy(() => import("@/features/auth/ui/LogoutPage.tsx"));
const RegistrationPage = lazy(() => import("@/features/auth/ui/RegistrationPage.tsx"));

function Fallback() {
    return <div className="min-h-dvh flex items-center justify-center bg-gray-200 text-gray-500">…</div>;
}

function App() {
    /* WebSocket connection */
    useWebSocketConnection();

    const dispatch = useDispatch();
    useEffect(() => {
        dispatch(markInitialized());
        requestNotificationPermission();           // desktop: mount-time request is honored
        armNotificationPermissionOnGesture();      // mobile: request on first tap (mount-time is ignored there)
    }, [dispatch]);

    return (
        <ErrorBoundary>
            <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Suspense fallback={<Fallback/>}>
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
                </Suspense>
                <Toaster/>
            </BrowserRouter>
        </ErrorBoundary>
    );
}

export default App;
