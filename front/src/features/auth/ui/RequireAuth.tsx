import React, {useEffect, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import type {RootState} from "@/store/store";
import {Navigate} from "react-router-dom";
import {logger} from "@/shared/logger/logger.ts";
import {setUser} from "@/features/auth/slices/userSlice.ts";
import {isNotLogged} from "@/shared/utils/checks.ts";
import { kratos } from "../model/services/kratos.ts";


async function checkSession() {
    try {
        const { data } = await kratos.toSession();
        return data;
    } catch (err: unknown) {
        logger.error((err as Error).message);
        return null;
    }
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
    const [loading, setLoading] = useState(true);
    const dispatch = useDispatch();

    useEffect(() => {
        checkSession().then((session) => {
            if (session?.identity) {
                logger.debug("session found");

                const traits = session.identity.traits as {
                    name?: string;
                    email?: string;
                };

                dispatch(setUser({
                    id: session.identity.id,
                    name: traits.name ?? "XXX",
                }));
            }
            setLoading(false);
        });
    }, [dispatch]);

    const { initialized, name } = useSelector(
        (s: RootState) => s.user
    );

    if (!initialized || loading) {
        return <div>Loading...</div>;
    }

    if (isNotLogged(name)) {
        logger.debug("starting login flow");
        return <Navigate to="/login" replace />;
    }

    logger.debug("user found");
    return <>{children}</>;
}
