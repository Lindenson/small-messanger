import {describe, it, expect} from "vitest";
import {resolveChatPair} from "../resolveChatPair";

const A = "aaaa-1111"; // sorts before B
const B = "bbbb-2222";

describe("resolveChatPair", () => {
    it("places each user on its role side when roles disambiguate", () => {
        expect(resolveChatPair(A, "master", B, "client")).toEqual({masterId: A, clientId: B});
        expect(resolveChatPair(A, "client", B, "master")).toEqual({clientId: A, masterId: B});
    });

    it("is direction-independent: both participants compute the SAME tuple (roles disambiguate)", () => {
        const fromMaster = resolveChatPair(A, "master", B, "client");
        const fromClient = resolveChatPair(B, "client", A, "master");
        expect(fromMaster).toEqual(fromClient); // same conversation key from either side
    });

    it("is direction-independent when BOTH are master (falls back to id order)", () => {
        const x = resolveChatPair(A, "master", B, "master");
        const y = resolveChatPair(B, "master", A, "master");
        expect(x).toEqual(y);
        expect(x).toEqual({clientId: A, masterId: B}); // sorted → stable
    });

    it("is direction-independent when roles are unknown/empty", () => {
        expect(resolveChatPair(B, undefined, A, undefined))
            .toEqual(resolveChatPair(A, "", B, ""));
        expect(resolveChatPair(B, undefined, A, undefined)).toEqual({clientId: A, masterId: B});
    });

    it("is case-insensitive on roles", () => {
        expect(resolveChatPair(A, "MASTER", B, "Client")).toEqual({masterId: A, clientId: B});
    });
});
