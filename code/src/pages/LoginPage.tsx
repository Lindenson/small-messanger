import {type FormEvent, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useLazyCheckLoginQuery} from "@/features/chat/rest/chatApi.ts";
import {logger} from "@/shared/logger/logger.ts";

interface LoginPageProps {
  onLogin: (name: string, id: string) => void;
}

type LoginUser = {
  id: string;
  name: string;
};

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [userName, setUserName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const [checkLogin] = useLazyCheckLoginQuery();
  const navigate = useNavigate();

  async function handleLogin() {
    const user = userName.trim();
    if (!user) return;

    setLoading(true);

    try {
      const userFound: LoginUser | null =  await checkLogin(user).unwrap();

      if (!userFound) {
        alert("Usuario no encontrado en contactos.");
        return;
      }

      onLogin(userFound.name, userFound.id);
      navigate("/", { replace: true });
    } catch (error) {
        logger.error("Login error:", error);
        alert("Error al conectar con el servidor.");
    } finally {
        setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!loading) {
      handleLogin().catch((err: Error) => {
        logger.error("Login error:", err);});
    }
  }

  return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-200">
        <form
            onSubmit={handleSubmit}
            className="bg-white p-6 rounded-xl shadow w-80"
        >
          <h1 className="text-xl font-semibold mb-4">Login</h1>

          <input
              type="text"
              placeholder="Tu ID (ej: user1)"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-4"
              disabled={loading}
              autoFocus
          />

          <button
              type="submit"
              disabled={loading}
              className={`w-full py-2 rounded text-white ${
                  loading
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-teal-950 hover:bg-teal-900"
              }`}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
  );
}
