// SERVER-ONLY half of the legal read — the same split `server-reads.ts`/
// `reads.ts` uses, and for the identical reason: this resolves WHO is asking
// from the request's cookies (`next/headers`), which would drag that whole
// module graph into any client component that value-imports `./legal-reads.ts`
// for its types alone.
//
// ONE DERIVATION OF "WHAT DOES THIS DOCUMENT LOOK LIKE RIGHT NOW", AND IT IS
// NOT IN THIS FILE. `legalFaces()` and `allLegalAccepted()` live in
// `./legal-reads.ts`, which is isomorphic by construction — the LEGAL STAGE IS
// A CLIENT COMPONENT and value-importing anything from here would drag
// `next/headers` into the browser bundle (measured: `next build` refuses it
// outright). This module is only the server-side loader that resolves WHO is
// asking and hands the rows to that derivation.
//
// THE HONEST DEGRADE. Every failure — no session, a missing function, a
// permission denial, a malformed row, a network fault — folds into one
// `{kind:"unavailable"}` answer. The legal stage renders that as "we could not
// read the agreements", offers a support route, and shows NO acceptance
// control and NO continue control: an unreadable agreement is never an
// accepted one.

import {
  fixedTokenAccessor,
  resolveServerSession,
  type ServerSession,
} from "@/lib/supabase/server-session";

import {
  legalFaces,
  loadCurrentLegalDocuments,
  type LegalStageState,
} from "./legal-reads";

export type LegalStateDeps = {
  readonly resolveSession?: () => Promise<ServerSession | null>;
  readonly signal?: AbortSignal;
};

export async function loadLegalStageState(
  deps: LegalStateDeps = {},
): Promise<LegalStageState> {
  try {
    const resolve = deps.resolveSession ?? resolveServerSession;
    const session = await resolve();
    if (session === null) return { kind: "unavailable" };
    const accessor = fixedTokenAccessor(session.accessToken);
    const rows = await loadCurrentLegalDocuments(accessor, deps.signal);
    return { kind: "ready", documents: legalFaces(rows) };
  } catch {
    return { kind: "unavailable" };
  }
}
