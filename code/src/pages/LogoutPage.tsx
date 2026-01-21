import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/store/store";

interface LogoutPageProps {
    onLogout: () => void;
}

export default function LogoutPage({ onLogout }: LogoutPageProps) {
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();

    const handleLogout = () => {
        onLogout();
        dispatch({ type: "ws/disconnect" });
        navigate("/login", { replace: true });
    };

    const handleCancel = () => {
        navigate(-1);
    };

    return (
        <div className="min-h-dvh flex items-center justify-center bg-gray-200">
            <div className="bg-white p-6 rounded-xl shadow w-80 text-center">
                <h1 className="text-xl font-semibold mb-4">Cerrar sesión</h1>

                <p className="text-gray-600 mb-6">
                    ¿Seguro que quieres salir?
                </p>

                <div className="flex gap-3">
                    <button
                        onClick={handleCancel}
                        className="w-full border py-2 rounded hover:bg-gray-100"
                    >
                        Cancelar
                    </button>

                    <button
                        onClick={handleLogout}
                        className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700"
                    >
                        Salir
                    </button>
                </div>
            </div>
        </div>
    );
}
