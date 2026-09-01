// SERVER-ONLY half of the DPA read — parallel split to
// `server-reads.ts`/`reads.ts`'s own, and for the identical reason: this
// resolves WHO is asking from the request's cookies (`next/headers`), which
// would drag that whole module graph into any client component that value-
// imports `./dpa-reads.ts` for its types alone.
//
// THE HONEST DEGRADE, NAMED (FS-4 C-6 Lane A / Lane B split). `dpa_documents`
// is not on `main` yet, and even landed it grants `clara_authenticated`
// nothing (dpa-reads.ts's header). `loadCurrentDpaDocumentState` therefore
// catches EVERYTHING — no session, a missing relation, a permission denial,
// a malformed row, a genuine network failure — and folds all of it into one
// `{kind:"unavailable"}` answer. This is deliberate, not a shortcut: the DPA
// step (`signup-dpa-form.tsx`) must never crash the signup journey over an
// infrastructure gap Lane A cannot close, and it must never guess at a body
// it could not read. "Unavailable" is the only honest thing to render for
// every one of those causes, and the PR that lands the read path (Lane B, or
// a later C-1 grant) needs no change here: the day the read starts
// succeeding, the same function starts returning `"ready"`.

import {
  fixedTokenAccessor,
  resolveServerSession,
  type ServerSession,
} from "@/lib/supabase/server-session";

import { loadCurrentDpaDocument } from "./dpa-reads";

export type DpaDocumentState =
  | { readonly kind: "ready"; readonly version: string; readonly body: string }
  | { readonly kind: "unavailable" };

export type DpaDocumentDeps = {
  readonly resolveSession?: () => Promise<ServerSession | null>;
  readonly signal?: AbortSignal;
};

export async function loadCurrentDpaDocumentState(
  deps: DpaDocumentDeps = {},
): Promise<DpaDocumentState> {
  try {
    const resolve = deps.resolveSession ?? resolveServerSession;
    const session = await resolve();
    if (session === null) return { kind: "unavailable" };
    const accessor = fixedTokenAccessor(session.accessToken);
    const row = await loadCurrentDpaDocument(accessor, deps.signal);
    if (row === null) return { kind: "unavailable" };
    return { kind: "ready", version: row.version, body: row.body };
  } catch {
    return { kind: "unavailable" };
  }
}
