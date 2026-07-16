import {createListenerMiddleware, isRejectedWithValue} from "@reduxjs/toolkit";
import toast from "react-hot-toast";
import i18n from "@/shared/i18n";
import {clearUser} from "@/features/auth/slices/userSlice.ts";
import {isNotLogged} from "@/shared/utils/checks.ts";

// Global re-auth on 401. Any RTK Query call (chat / ids / contacts) that fails with 401 — a stale
// or expired Kratos session cookie mid-session — triggers a single re-auth flow:
//   toast → clearUser → ws/disconnect.
// clearUser makes RequireAuth redirect to /login on the next render (protected routes) and stops
// the WS reconnect loop (connect() guards on isNotLogged). Guarded so a burst of 401s fires once.
export const authErrorListener = createListenerMiddleware();

authErrorListener.startListening({
    matcher: isRejectedWithValue,
    effect: (action, api) => {
        const status = (action.payload as { status?: number | string } | undefined)?.status;
        if (status !== 401) return;

        // Already logged out → don't re-fire the toast/redirect on subsequent 401s.
        const userId = (api.getState() as { user?: { id?: string } })?.user?.id ?? "";
        if (isNotLogged(userId)) return;

        toast.error(i18n.t("auth.sessionExpired"));
        api.dispatch(clearUser());
        api.dispatch({type: "ws/disconnect"});
    },
});
