import {useEffect, useRef} from "react";
import {useDispatch, useSelector} from "react-redux";
import toast from "react-hot-toast";
import i18n from "@/shared/i18n";
import type {AppDispatch, RootState} from "@/store/store";
import {localEnd} from "@/features/call/model/slices/callSlice";
import {CALL_TIMEOUT_MS} from "@/shared/config/webrtc";

// Ends an outgoing call that is never answered/connected within CALL_TIMEOUT_MS, so the caller
// isn't stuck on a black screen indefinitely (there is no ring-then-timeout on the backend).
export function useCallTimeout() {
    const dispatch = useDispatch<AppDispatch>();
    const status = useSelector((s: RootState) => s.call.status);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        if (status === "calling" || status === "connecting") {
            timer.current = setTimeout(() => {
                toast.error(i18n.t("call.noAnswer"));
                dispatch(localEnd());
            }, CALL_TIMEOUT_MS);
        }
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [status, dispatch]);
}
