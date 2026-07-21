// Decide the (clientId, masterId) tuple for a conversation between the caller and a counterpart.
//
// A conversation is keyed server-side by the ORDERED (clientId, masterId) tuple, so both participants
// MUST arrive at the identical tuple regardless of who initiates — otherwise creating from opposite
// sides mints two conversations for the same two people ("two same-named chats"). Rules:
//   - If the roles disambiguate (exactly one client, one master), place each on its role side.
//   - Otherwise (same role on both sides, or unknown) fall back to a DETERMINISTIC id ordering —
//     never "whoever initiated" — so the tuple is stable from either direction.
export function resolveChatPair(
    myId: string,
    myRole: string | undefined,
    otherId: string,
    otherRole: string | undefined,
): { clientId: string; masterId: string } {
    const my = (myRole ?? "").toLowerCase();
    const other = (otherRole ?? "").toLowerCase();

    const myIsMaster = my === "master", myIsClient = my === "client";
    const otherIsMaster = other === "master", otherIsClient = other === "client";

    if ((myIsMaster && otherIsClient) || (myIsClient && otherIsMaster)) {
        return myIsMaster
            ? { masterId: myId, clientId: otherId }
            : { clientId: myId, masterId: otherId };
    }
    // Same role or unknown → stable ordering by id (both directions yield the same tuple).
    const [clientId, masterId] = [myId, otherId].sort();
    return { clientId, masterId };
}
