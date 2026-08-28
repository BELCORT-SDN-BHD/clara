// Opening balances & carry-down — T2. The seed-LIFECYCLE governed writes
// (create/approve/approve-correction/cancel/reopen). Item-level writes
// (draft/target/keyed-resolution/supersede/seed_fixed_asset) live in
// ./opening-item-doors.ts — the same file-size discipline
// write-off-form.tsx's own header names, applied per-domain rather than
// per-file-length alone: lifecycle vs. item authorship are genuinely
// different concerns here. Every call mints its own fresh op_key
// (crypto.randomUUID()), never reused across a retry (doors.ts's "never
// retry a refusal" law).

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

/** clara.create_opening_seed(p_client, p_plan, p_as_of, p_tie_document,
 *  p_tie_sha256, p_op_key) — bookkeeper+. `tieDocumentId`/`tieSha256` must be
 *  BOTH set or BOTH null (CLR10 otherwise, live body's own XOR guard) — the
 *  dialog enforces the same pairing before it ever confirms. CLR31
 *  `duplicate_seed` if the client already carries a live (non-cancelled) seed
 *  — `uq_opening_seed_registry_once`. */
export function createOpeningSeed(
  session: SessionTokenAccessor,
  args: { client: string; plan: string; asOf: string; tieDocumentId: string | null; tieSha256: string | null },
): Promise<unknown> {
  return callDoor(
    "create_opening_seed",
    {
      p_client: args.client,
      p_plan: args.plan,
      p_as_of: args.asOf,
      p_tie_document: args.tieDocumentId,
      p_tie_sha256: args.tieSha256,
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}

/** clara.approve_opening_seed(p_seed, p_expected_plan_revision,
 *  p_tie_document_sha256, p_entry_revisions, p_attestation, p_op_key) —
 *  admin+. Runs at SERIALIZABLE isolation on the server; refuses CLR31
 *  `not_serializable` if the session isolation is not already serializable —
 *  surfaced verbatim like any other refusal, never worked around
 *  client-side. `entryRevisions` is the `{ [entry_id]: revision_token }` map
 *  from `./opening.ts`'s `buildEntryRevisionsMap`. `attestation` is required
 *  ONLY when the same human both last-edited AND is approving a draft with
 *  fewer than two other eligible checkers (CLR05 `self_attestation`) — the
 *  door decides; this wrapper always sends whatever the dialog collected. */
export function approveOpeningSeed(
  session: SessionTokenAccessor,
  args: {
    seed: string;
    expectedPlanRevision: string;
    tieDocumentSha256: string | null;
    entryRevisions: Record<string, string>;
    attestation: string;
  },
): Promise<unknown> {
  return callDoor(
    "approve_opening_seed",
    {
      p_seed: args.seed,
      p_expected_plan_revision: args.expectedPlanRevision,
      p_tie_document_sha256: args.tieDocumentSha256,
      p_entry_revisions: args.entryRevisions,
      p_attestation: args.attestation || null,
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}

/** clara.approve_opening_correction(p_seed, p_entry_revisions, p_attestation,
 *  p_op_key) — admin+. Same SERIALIZABLE / self-attestation semantics as
 *  approve_opening_seed, scoped to the seed's own correction drafts — the
 *  door itself selects which drafts qualify; this wrapper sends every draft
 *  revision the caller gathered and lets the door decide relevance. */
export function approveOpeningCorrection(
  session: SessionTokenAccessor,
  args: { seed: string; entryRevisions: Record<string, string>; attestation: string },
): Promise<unknown> {
  return callDoor(
    "approve_opening_correction",
    {
      p_seed: args.seed,
      p_entry_revisions: args.entryRevisions,
      p_attestation: args.attestation || null,
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}

/** clara.cancel_opening_seed(p_seed, p_reason, p_op_key) — admin+. Only an
 *  EMPTY open seed (no opening_items rows yet) may be cancelled — CLR31
 *  `registry_not_open` otherwise; the workbench gates the control on the same
 *  read it already has (seed.state === "open" && zero items), never hides it
 *  outright (gating SHAPES, never HIDES — the door stays the wall either
 *  way). */
export function cancelOpeningSeed(session: SessionTokenAccessor, args: { seed: string; reason: string }): Promise<unknown> {
  return callDoor(
    "cancel_opening_seed",
    { p_seed: args.seed, p_reason: args.reason, p_op_key: crypto.randomUUID() },
    { session },
  );
}

/** clara.reopen_opening_seed(p_seed, p_reason, p_op_key) — admin+. Only a
 *  FINALIZED seed may reopen — CLR31 `registry_not_open` otherwise. */
export function reopenOpeningSeed(session: SessionTokenAccessor, args: { seed: string; reason: string }): Promise<unknown> {
  return callDoor(
    "reopen_opening_seed",
    { p_seed: args.seed, p_reason: args.reason, p_op_key: crypto.randomUUID() },
    { session },
  );
}
