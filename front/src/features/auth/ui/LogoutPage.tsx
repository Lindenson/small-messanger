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
            const logoutUrl = new URL(await logout());
            const proxiedUrl = `${window.location.origin}/kratos${logoutUrl.pathname}${logoutUrl.search}`;
            onLogoutEvents();
            window.location.href = proxiedUrl;

        } catch (err) {
            console.error("Logout error:", err);
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
