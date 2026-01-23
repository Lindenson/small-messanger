import type {
    LoginFlow,
    RegistrationFlow,
    UpdateLoginFlowBody,
    UpdateRegistrationFlowBody,
    UiNode, UiNodeInputAttributes,
} from "@ory/client";
import type { AxiosError } from "axios";
import { kratos } from "./kratos";


/* ───────────────── Session ───────────────── */

export async function requireNoSession(): Promise<boolean> {
    try {
        await kratos.toSession();
        return false;
    } catch {
        return true;
    }
}

/* ───────────────── Login ───────────────── */

export async function initLoginFlow(): Promise<LoginFlow> {
    const { data } = await kratos.createBrowserLoginFlow();
    return data;
}

export async function submitLoginFlow(
    flowId: string,
    body: UpdateLoginFlowBody
) {
    return kratos.updateLoginFlow({
        flow: flowId,
        updateLoginFlowBody: body,
    });
}

/* ───────────────── Registration ───────────────── */

export async function initRegistrationFlow(): Promise<RegistrationFlow> {
    const { data } = await kratos.createBrowserRegistrationFlow();
    return data;
}

export async function submitRegistrationFlow(
    flowId: string,
    body: UpdateRegistrationFlowBody
) {
    return kratos.updateRegistrationFlow({
        flow: flowId,
        updateRegistrationFlowBody: body,
    });
}

/* ───────────────── Logout ───────────────── */

export async function logout(): Promise<string> {
    const { data } = await kratos.createBrowserLogoutFlow();
    return data.logout_url;
}

/* ───────────────── Helpers ───────────────── */

export function extractFieldErrors(
    flow: { ui: { nodes: UiNode[] } },
    name: string
) {
    return flow.ui.nodes
        .filter(
            (n) =>
                n.type === "input" &&
                (n.attributes as UiNodeInputAttributes).name === name
        )
        .flatMap((n) => n.messages ?? []);
}


export function handleFlowError<T extends { ui:  { nodes: UiNode[] } }>(
    error: unknown,
    recreateFlow: () => Promise<T>,
    setFlow: (flow: T) => void
) {
    const err = error as AxiosError<T>;

    if (err.response?.status === 410) {
        recreateFlow().then(setFlow);
        return;
    }

    if (err.response?.data) {
        setFlow(err.response.data);
    }
}

type KratosFlow = LoginFlow | RegistrationFlow;

export function findInputNode(flow: KratosFlow, name: string): UiNode | undefined {
    return flow.ui.nodes.find(
        (n) =>
            n.type === "input" &&
            (n.attributes as UiNodeInputAttributes).name === name
    );
}

export function findHiddenNodes(flow: KratosFlow): UiNode[] {
    return flow.ui.nodes.filter(
        (n) =>
            n.type === "input" &&
            (n.attributes as UiNodeInputAttributes).type === "hidden"
    );
}

export function isInputNode(
    node: UiNode
): node is UiNode & { attributes: UiNodeInputAttributes } {
    return node.type === "input";
}