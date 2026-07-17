import {useSelector} from "react-redux";
import {useTranslation} from "react-i18next";
import type {RootState} from "@/store/store";

// Thin top bar reflecting the WebSocket connection state (nothing surfaced ws.status before, so the
// user had no way to tell they were offline / reconnecting — queued messages just sat on 🕐).
export function ConnectionBanner() {
    const {t} = useTranslation();
    const status = useSelector((s: RootState) => s.ws.status);
    if (status === "connected") return null;
    return (
        <div className="absolute top-0 inset-x-0 z-40 text-center text-xs py-1 bg-amber-500 text-white">
            {status === "connecting" ? t("chat.connecting") : t("chat.noConnection")}
        </div>
    );
}
