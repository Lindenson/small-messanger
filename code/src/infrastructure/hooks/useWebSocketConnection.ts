import { useEffect } from "react";
import {useDispatch, useSelector} from "react-redux";
import type {RootState} from "@/store/store.ts";
import {isNotLogged} from "@/shared/utils/checks.ts";

export function useWebSocketConnection() {

    const dispatch = useDispatch();
    const myId = useSelector((state: RootState) => state.user.id);

    useEffect(() => {
        if (isNotLogged(myId)) return;

        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const url = `${protocol}://${window.location.host}/ws?clientId=${encodeURIComponent(myId)}`;

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
