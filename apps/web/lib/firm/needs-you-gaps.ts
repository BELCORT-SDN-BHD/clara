// lib/firm/needs-you-gaps.ts — the two human read/act surfaces the 磨合
// (frontend integration) window found missing and PROGRESS.md logged as
// "Backend gaps found and honestly not-built (Track-A debt, pre-P6)". BOTH
// gaps closed at the DB by migration 0137 (verb-coverage census, 2026-08-28):
// zero live bodies replaced, three additive masked views, tail-proven —
// clara.firm_open_questions_visible (14 cols) and
// clara.client_identifier_promotions_visible (15 cols), each bookkeeper+,
// clara_authenticated-select-only, zero agent/wake/runtime reach
// (0137_debt_human_read_surfaces.sql:313-315, :418).
//
// The four act doors below were already LIVE before 0137 — 0137 only added
// the READ half; the write half (resolve_firm_question/dismiss_firm_question/
// confirm_identifier_promotion/decline_identifier_promotion) shipped in
// 0103_f_a7_pi_additive.sql, granted at :1046-1049 — see
// docs/plan/active/frontend-handoff-addendum-2026-08-24.md §2 for the build
// spec these wrappers follow.
//
// Same mechanism as lib/firm/needs-you.ts's own review-queue doors: callDoor
// for the write, a caller-owned op_key passed through byte-for-byte, a
// governed DoorRefusal surfaces verbatim and is never retried, and every
// caller re-reads afterward (hydrate-never-trust) — lib/firm/use-async-read.ts's
// `act()` is the intended caller.

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

// --- clara.firm_open_questions_visible (0137:248-261, 14 cols) --------------

/** The closed 6-value CHECK, read from the live table itself
 *  (0103_f_a7_pi_additive.sql:563-565). Extend this array (never a standalone
 *  string literal) the day a seventh kind ships — the same discipline
 *  lib/firm/needs-you.ts's REVIEW_QUEUE_ROW_KINDS already applies. */
export const FIRM_QUESTION_KINDS = [
  "unattributed",
  "collision",
  "contradiction",
  "identity_document",
  "correction_proposed",
  "promotion_proposed",
] as const;

export type FirmQuestionKind = (typeof FIRM_QUESTION_KINDS)[number];

export function isKnownFirmQuestionKind(kind: string): kind is FirmQuestionKind {
  return (FIRM_QUESTION_KINDS as readonly string[]).includes(kind);
}

export type FirmOpenQuestionRow = {
  id: string;
  firm_id: string;
  document_id: string;
  kind: FirmQuestionKind | string;
  question_text: string;
  /** Caller-shaped jsonb array — the DB enforces only `jsonb_typeof = 'array'`,
   *  no per-kind schema. The B10 'collision' shape (client_id,
   *  existing_filing_client_id, failing_rungs, the anchoring identifier) is
   *  documented for that ONE kind (frontend-handoff-addendum-2026-08-24.md §2);
   *  every other kind's shape is undocumented. Rendered generically — this
   *  module invents no per-kind semantics a live body has not committed to. */
  candidates: unknown[];
  status: "open" | "resolved" | "dismissed" | string;
  opened_by: string;
  opened_at: string;
  settled_by: string | null;
  settled_at: string | null;
  settlement_text: string | null;
  named_client: string | null;
  receipt_id: string | null;
};

const FIRM_OPEN_QUESTION_COLS =
  "id,firm_id,document_id,kind,question_text,candidates,status,opened_by,opened_at," +
  "settled_by,settled_at,settlement_text,named_client,receipt_id";

/** Every OPEN firm-level question for the caller's own firm (RLS + the view's
 *  own bookkeeper+ floor scope it; no explicit firm filter is sent — same
 *  idiom as lib/firm/reads.ts's loadClientRegister). Settled rows (resolved/
 *  dismissed) are not this panel's concern — the settlement itself is the
 *  durable record, and clara.agent_receipts_visible/audit_log already carry
 *  the history. Ordered newest-first, mirroring the view's own partial index
 *  (0137:597-598, `where status = 'open'` order `opened_at desc`). */
export function loadFirmOpenQuestions(session: SessionTokenAccessor): Promise<FirmOpenQuestionRow[]> {
  return getRows<FirmOpenQuestionRow>("firm_open_questions_visible", {
    select: FIRM_OPEN_QUESTION_COLS,
    filters: { status: "eq.open" },
    order: "opened_at.desc",
    session,
  });
}

/** ONE firm question by id, IN ANY STATUS — the hydrate behind the
 *  `firm_question` transcript card (P6-2).
 *
 *  DELIBERATELY UNFILTERED ON `status`, unlike `loadFirmOpenQuestions` above.
 *  The queue only ever wants what still awaits a human, so filtering there is
 *  correct. A transcript card is the opposite case: Clara raised the question in
 *  a conversation that stays on screen forever, and the single most useful thing
 *  the card can say once someone settles it is that it IS settled, by whom, with
 *  what text. Re-reading with `status=eq.open` would make an answered question
 *  render as "not visible" — a card that goes blank the moment it succeeds, and
 *  the exact "vanishing row on refusal" class this module's own
 *  `isActingRowPresent` helpers exist to defend against, arriving through the
 *  read instead of the write. The view carries the settled columns
 *  (`settled_by`, `settled_at`, `settlement_text`, `named_client`) precisely so
 *  a settled row can be READ; nothing here re-derives that verdict.
 *
 *  `null` when RLS admits no such row — rendered as "not visible", never as an
 *  invented question. */
export async function getFirmOpenQuestionById(
  session: SessionTokenAccessor,
  questionId: string,
): Promise<FirmOpenQuestionRow | null> {
  const rows = await getRows<FirmOpenQuestionRow>("firm_open_questions_visible", {
    select: FIRM_OPEN_QUESTION_COLS,
    filters: { id: `eq.${questionId}` },
    session,
  });
  return rows[0] ?? null;
}

/** clara.resolve_firm_question(p_question, p_resolution, p_client, p_op_key)
 *  — bookkeeper+ governed write (0103_f_a7_pi_additive.sql:637-677). Marks the
 *  row resolved and stamps `named_client` — the human's own attribution.
 *  `clientId` is genuinely optional at the door (nullable `p_client`); pass
 *  `null` when the human is not naming a client. Per the addendum's own rule
 *  (§2, "never compose two verbs into one that implies atomicity the DB
 *  doesn't give"): for the B10 collision case, this call alone does NOT file
 *  the document — that is the existing `file_document` door, on the
 *  Documents tab, a separate human step. */
export function resolveFirmQuestion(
  session: SessionTokenAccessor,
  questionId: string,
  resolution: string,
  clientId: string | null,
  opKey: string,
): Promise<unknown> {
  return callDoor(
    "resolve_firm_question",
    { p_question: questionId, p_resolution: resolution, p_client: clientId, p_op_key: opKey },
    { session },
  );
}

/** clara.dismiss_firm_question(p_question, p_reason, p_op_key) — bookkeeper+
 *  governed write (0103_f_a7_pi_additive.sql:679-712). Structurally CANNOT
 *  carry a named_client (`ck_firm_open_questions_dismissed_names_nobody`,
 *  0103:591-592) — dismissing means "this was never a real question," never
 *  an attribution, so this wrapper takes no clientId parameter at all. */
export function dismissFirmQuestion(
  session: SessionTokenAccessor,
  questionId: string,
  reason: string,
  opKey: string,
): Promise<unknown> {
  return callDoor(
    "dismiss_firm_question",
    { p_question: questionId, p_reason: reason, p_op_key: opKey },
    { session },
  );
}

// --- clara.client_identifier_promotions_visible (0137:266-280, 15 cols) -----

/** The closed 3-value CHECK (0103_f_a7_pi_additive.sql:800). Shared across two
 *  producers — the F-A7 identity-anchor path (tin/ssm) and the F-A3 bank path
 *  (bank_account) — one table, one shared human door (addendum §2: "Build ONE
 *  promotion-confirm card, not two"). VERIFIED against the live body directly
 *  (0103:866-904, :906-...): `confirm_identifier_promotion`/
 *  `decline_identifier_promotion` carry NO kind-based branch or restriction —
 *  both operate uniformly on whatever `kind` the row already carries, via the
 *  generic `clara.add_client_identifier` door. An earlier design note
 *  (bank-agency-design.md §3.9, TA-P8 B, dated 2026-08-22 — pre-dates 0103's
 *  shared door) scoped the F-A3-SPECIFIC confirming half to bank_account-only
 *  payer resolution; that shape was never built as such and is superseded by
 *  0103's generic door, which the more recent frontend-handoff-addendum
 *  (2026-08-24) confirms is the one to build against. This module surfaces
 *  exactly what the LIVE door supports: all three kinds, uniformly. */
export const IDENTIFIER_PROMOTION_KINDS = ["tin", "ssm", "bank_account"] as const;
export type IdentifierPromotionKind = (typeof IDENTIFIER_PROMOTION_KINDS)[number];

export function isKnownIdentifierPromotionKind(kind: string): kind is IdentifierPromotionKind {
  return (IDENTIFIER_PROMOTION_KINDS as readonly string[]).includes(kind);
}

export type IdentifierPromotionModel = { provider?: string; model?: string; version?: string };

export type IdentifierPromotionRow = {
  id: string;
  firm_id: string;
  client_id: string;
  kind: IdentifierPromotionKind | string;
  value_normalized: string;
  sightings: number;
  /** jsonb array, `jsonb_array_length >= 1` — the DB guarantees at least one
   *  citation exists but not its shape; rendered as a count only. */
  citations: unknown[];
  rationale: string;
  model: IdentifierPromotionModel | null;
  status: "proposed" | "confirmed" | "declined" | string;
  proposed_by: string;
  proposed_at: string;
  settled_by: string | null;
  settled_at: string | null;
  identifier_id: string | null;
};

const IDENTIFIER_PROMOTION_COLS =
  "id,firm_id,client_id,kind,value_normalized,sightings,citations,rationale,model,status," +
  "proposed_by,proposed_at,settled_by,settled_at,identifier_id";

/** Every PROPOSED identifier promotion for the caller's own firm — mirrors
 *  the view's own partial index (0137:830-831, `where status = 'proposed'`
 *  order `proposed_at desc`). Settled rows (confirmed/declined) are not this
 *  panel's concern; a confirmed row's identifier already lives on the
 *  client's own identifier register. */
export function loadIdentifierPromotions(session: SessionTokenAccessor): Promise<IdentifierPromotionRow[]> {
  return getRows<IdentifierPromotionRow>("client_identifier_promotions_visible", {
    select: IDENTIFIER_PROMOTION_COLS,
    filters: { status: "eq.proposed" },
    order: "proposed_at.desc",
    session,
  });
}

/** clara.confirm_identifier_promotion(p_proposal, p_op_key) — bookkeeper+
 *  governed write (0103_f_a7_pi_additive.sql:866-904). ONE click, no other
 *  argument: internally calls `clara.add_client_identifier` and flips the
 *  proposal to `confirmed`. */
export function confirmIdentifierPromotion(session: SessionTokenAccessor, proposalId: string): Promise<unknown> {
  return callDoor("confirm_identifier_promotion", { p_proposal: proposalId, p_op_key: crypto.randomUUID() }, { session });
}

/** clara.decline_identifier_promotion(p_proposal, p_reason, p_op_key) —
 *  bookkeeper+ governed write (0103_f_a7_pi_additive.sql:906-...). Writes NO
 *  identifier, ever — declining leaves `identifier_id` null by construction. */
export function declineIdentifierPromotion(
  session: SessionTokenAccessor,
  proposalId: string,
  reason: string,
): Promise<unknown> {
  return callDoor(
    "decline_identifier_promotion",
    { p_proposal: proposalId, p_reason: reason, p_op_key: crypto.randomUUID() },
    { session },
  );
}

// --- shared row-vanish-on-refusal helpers ------------------------------------
// The SAME class of bug lib/firm/needs-you.ts's R1 fixed (independent review,
// 2026-08-27): the most common refusal on a settle-style door is "someone else
// already settled it" (CLR10, "question/promotion is not open"), which makes
// the acted-on row VANISH from the very re-read `act()` triggers — a per-row-
// only error attachment goes dark for exactly that case. Built correctly from
// the start here rather than shipping the known-bad shape once more.
//
// Simpler than needs-you.ts's `reviewQueueRowKey` (a compound `row_kind:id`
// key, needed there because that queue merges eight different row kinds into
// one list): each list here is already homogeneous, so the row's own `id` is
// the whole key.

export function isActingRowPresent<T extends { id: string }>(rows: T[], actingId: string | null): boolean {
  if (actingId === null) return false;
  return rows.some((r) => r.id === actingId);
}

/** Same decision lib/firm/needs-you.ts's `shouldShowQueueErrorBanner` makes,
 *  generalized over the plain-`id` row shape both lists here share.
 *  `hasData`: has this list EVER loaded successfully (its useAsyncRead `data`
 *  is non-null) — that case is DataState's own full-page error, never a
 *  banner over nothing. */
export function shouldShowGapErrorBanner<T extends { id: string }>(
  hasData: boolean,
  error: unknown,
  rows: T[],
  actingId: string | null,
): boolean {
  if (!hasData || !error) return false;
  return actingId === null || !isActingRowPresent(rows, actingId);
}
