// T10 (port-wave plan §4 T10, §5's sharing row): `share_chat_session` attaches
// to the Clara thread surface (components/clara/ClaraFullScreenThread.tsx).
//
// GROUNDING (rig census, 2026-08-28 — instance-unique throwaway Postgres 17
// migrated to the live frontier `0140`): `clara.share_chat_session(p_session
// uuid, p_op_key text)` originates at `0006_runtime_core.sql:894` and is
// LIVE-UNTOUCHED (pg_get_functiondef on the rig matches that file's own text
// byte-for-byte) — VIEWER+ rank (the lowest human rank; any signed-in firm
// member may call it), but only the session's own author may actually share
// it: `s.created_by <> c.actor` refuses `'only the author may share a
// session'` (CLR04). Idempotent — calling it again on an already-`'firm'`
// session returns the same success shape rather than erroring. EXECUTE-
// granted to `clara_authenticated` (rig census).
//
// The read side (`clara.chat_sessions`) DOES carry a direct
// `clara_authenticated` SELECT grant (rig census — unlike `compliance_watches`
// or the vendor tables, both owner-only), so this module reads the row
// directly via `getRows` rather than composing a second RPC.
//
// The UI never pre-hides the Share trigger on a client-side "am I the
// author" guess (team-lead security note, same reasoning as vendor-bindings.
// ts's Sign door): every viewer of a private session sees the control; a
// non-author who clicks it gets the DB's own CLR04, verbatim.

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type ChatSessionVisibility = "private" | "firm" | string;

/** `clara.chat_sessions`'s own columns (0006_runtime_core.sql), verbatim. */
export type ChatSessionRow = {
  id: string;
  firm_id: string;
  client_id: string | null;
  created_by: string;
  visibility: ChatSessionVisibility;
  title: string | null;
  created_at: string;
};

/** One session, by id — `null` when RLS admits no such row (not in this
 *  firm, or it never existed), rendered by the caller as `not_found`, never
 *  as a thrown error the DB never raised (same contract as
 *  `lib/firm/reads.ts`'s `loadClientById`). */
export async function loadChatSession(session: SessionTokenAccessor, sessionId: string): Promise<ChatSessionRow | null> {
  const rows = await getRows<ChatSessionRow>("chat_sessions", {
    select: "id,firm_id,client_id,created_by,visibility,title,created_at",
    filters: { id: `eq.${sessionId}` },
    session,
  });
  return rows[0] ?? null;
}

/** clara.share_chat_session — a fresh op_key per call. */
export function shareChatSession(session: SessionTokenAccessor, sessionId: string): Promise<unknown> {
  return callDoor("share_chat_session", { p_session: sessionId, p_op_key: crypto.randomUUID() }, { session });
}
