import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";

import type {AppDispatch, RootState} from "@/store/store.ts";
import type {Contact} from "@/features/chat/model/types";

import {useLookupUserMutation} from "@/features/chat/rest/contactsApi.ts";
import {chatApi} from "@/features/chat/rest/chatApi";
import {useTranslation} from "react-i18next";
import {logger} from "@/shared/logger/logger";
import toast from "react-hot-toast";

export default function AddContactPage() {

    const myId = useSelector((state: RootState) => state.user.id);

    const [identifier, setIdentifier] = useState("");
    const [user, setUser] = useState<Contact | null>(null);
    const [error, setError] = useState<string | null>(null);

    const dispatch = useDispatch<AppDispatch>();
    const [lookupUser, {isLoading}] = useLookupUserMutation();

    const navigate = useNavigate();

    const {t} = useTranslation();

    const handleSearch = async () => {
        if (!identifier.trim()) return;
        setUser(null);
        try {
            const res = await lookupUser(identifier.trim()).unwrap();

            if (res.found && res.user) {
                setUser(res.user);
                setError(null);
            } else {
                setError(t("addUser.notFound"));
            }
        } catch (e) {
            logger.error("Find user error", e);
            toast.error(t("addUser.error"));
        }
    };

    const handleAdd = () => {
        if (!user) return;
        dispatch(
            chatApi.util.updateQueryData(
                "getChats",
                {myId},
                (draft = []) => {
                    if (!draft.includes(user.id)) {
                        draft.push(user.id);
                    }
                }
            )
        );
        navigate("/");
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center
        justify-center bg-gray-200/80 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 flex flex-col gap-4">
                <h2 className="text-xl font-semibold text-center">
                    {t("addUser.title")}
                </h2>

                <input
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t("addUser.placeholder")}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2
                    focus:outline-none focus:ring-2 focus:ring-teal-600"
                />

                {!user && (
                    <button
                        onClick={handleSearch}
                        disabled={isLoading}
                        className="w-full bg-blue-600 text-white rounded-lg
                        py-2 hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                        {isLoading ? t("common.loading") : t("common.search")}
                    </button>
                )}

                {error && (<p className="text-red-600 text-center text-sm min-h-[1.5rem]">{error}</p>)}

                {user && (
                    <div className="border rounded-lg p-4 bg-gray-50 shadow-sm flex flex-col items-center gap-2">
                        <div className="text-lg font-medium">{user.name}</div>
                        <div className="text-sm text-gray-500">
                            {user.email ?? user.id}
                        </div>

                        <button
                            onClick={handleAdd}
                            className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition"
                        >
                            {t("addUser.confirm")}
                        </button>
                    </div>
                )}

                <button
                    onClick={() => navigate(-1)}
                    className="w-full border border-gray-300 py-2 rounded-lg hover:bg-gray-100 transition"
                >
                    {t("common.cancel")}
                </button>
            </div>
        </div>
    );
}
