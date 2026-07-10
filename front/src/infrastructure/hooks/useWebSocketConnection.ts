import { useEffect } from "react";
import {useDispatch, useSelector} from "react-redux";
import type {RootState} from "@/store/store.ts";
import {isNotLogged} from "@/shared/utils/checks.ts";
import {MESSENGER_WS_PATH} from "@/shared/config/api.ts";

export function useWebSocketConnection() {

    const dispatch = useDispatch();
    const myId = useSelector((state: RootState) => state.user.id);

    useEffect(() => {
        if (isNotLogged(myId)) return;

        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        // Host-relative through the Ory edge (same origin as the logged-in window), which
        // authenticates the Kratos session cookie and injects X-User-* on the /ws upgrade.
        // No clientId query — the backend derives the sender from the header identity.
        const url = `${protocol}://${window.location.host}${MESSENGER_WS_PATH}`;

        dispatch({
            type: "ws/connect",
            payload: { url },
            meta: { shouldReconnect: true },
        });

        return () => {
            dispatch({ type: "ws/disconnect" });
        };
    }, [myId, dispatch]);
}
