// T6 (port-wave plan §4/§5) — the two "diff IS the decision" read RPCs behind
// the drafts workbench's entry-diff / doc-entry-diff panels. Grounded at the
// LIVE catalog (instance-unique throwaway rig, migrate 0001..0140,
// `pg_get_functiondef`, 2026-08-28) — both are STABLE, SECURITY DEFINER,
// dual-lane (human viewer+ via `_human_ctx`, or agent via `wake_context` when
// `clara.wake_secret` is set — this workbench only ever exercises the human
// path). Read RPCs — transport via callDoor, NOT a governed act: no
// confirmation UI, no refusal-verbatim-never-retry posture beyond an ordinary
// failed read, no re-read-after semantics of their own (the caller's own
// `useHydratedPart` reload already covers that).

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type { DocEntryDiffResult, EntryDiffResult } from "./types";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** clara.get_entry_diff(p_entry uuid, p_client uuid) -> jsonb, STABLE — every
 *  `journal_entry_revisions` row for this entry, oldest-first, each carrying
 *  its own delta vs. the prior revision (DB-computed, never client-side).
 *  Always returns `{entry_id, revisions: []}` — never null (unlike
 *  `getDocEntryDiff`, which legitimately has "no source document" as an
 *  outcome; an entry with zero revisions is simply a draft that has never
 *  been revised — an empty list, not an absent one). */
export async function getEntryDiff(entryId: string, clientId: string, opts: Opts = {}): Promise<EntryDiffResult> {
  return (await callDoor<EntryDiffResult>(
    "get_entry_diff",
    { p_entry: entryId, p_client: clientId },
    opts,
  ))!;
}

/** clara.get_doc_entry_diff(p_entry uuid, p_client uuid) -> jsonb, STABLE —
 *  the entry's own booked figures vs. its SOURCE DOCUMENT's extracted
 *  regions, field by field. Returns `null` when the entry cannot be read (a
 *  bad id, a wake-scoped agent reading a foreign client) OR when the entry
 *  carries no `document_id` (a manual entry has no document to diff against)
 *  — both fold into ONE honest "no document-sourced diff for this entry"
 *  state; the caller must not distinguish them (the DB itself does not). */
export async function getDocEntryDiff(entryId: string, clientId: string, opts: Opts = {}): Promise<DocEntryDiffResult | null> {
  return callDoor<DocEntryDiffResult | null>(
    "get_doc_entry_diff",
    { p_entry: entryId, p_client: clientId },
    opts,
  );
}
