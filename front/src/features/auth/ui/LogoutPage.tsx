import {useNavigate} from "react-router-dom";
import {useDispatch} from "react-redux";
import type {AppDispatch} from "@/store/store.ts";
import {useState} from "react";
import {clearUser} from "@/features/auth/slices/userSlice.ts";
import {logout} from "@/features/auth/model/services/kratosFlows.ts";


export default function LogoutPage() {
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const [loading, setLoading] = useState(false);

    function onLogoutEvents() {
        dispatch({type: "ws/disconnect"});
        dispatch(clearUser());
    }

    const handleLogout = async () => {
        setLoading(true);

        try {
            // Kratos returns the full public logout URL (…/.ory/kratos/public/self-service/logout?token=…).
            // Keep its path/query, just pin to the current origin (handles an internal kratos host).
            const logoutUrl = new URL(await logout());
            const target = `${window.location.origin}${logoutUrl.pathname}${logoutUrl.search}`;
            onLogoutEvents();
            // Invalidate the Kratos session in the background instead of navigating the browser
            // to Kratos (which would bounce to Kratos' default post-logout page). redirect:"manual"
            // means we don't follow Kratos' redirect; the Set-Cookie that clears the session still
            // applies (same-origin), so the session is dead and we control the destination.
            await fetch(target, {credentials: "include", redirect: "manual"}).catch(() => {});
            navigate("/login", {replace: true});

        } catch (err) {
            console.error("Logout error:", err);
            // Even if the flow call failed, send the user to login rather than leaving them stuck.
            navigate("/login", {replace: true});
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        navigate(-1);
    };

    return (
        <div className="min-h-dvh flex items-center justify-center bg-gray-200">
            <div className="bg-white p-6 rounded-xl shadow w-80 text-center">
                <h1 className="text-xl font-semibold mb-4">Cerrar sesión</h1>
                <p className="text-gray-600 mb-6">¿Seguro que quieres salir?</p>

                <div className="flex gap-3">
                    <button
                        onClick={handleCancel}
                        className="w-full border py-2 rounded hover:bg-gray-100"
                        disabled={loading}
                    >
                        Cancelar
                    </button>

                    <button
                        onClick={handleLogout}
                        className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700"
                        disabled={loading}
                    >
                        {loading ? "Saliendo…" : "Salir"}
                    </button>
                </div>
            </div>
        </div>
    );
}
