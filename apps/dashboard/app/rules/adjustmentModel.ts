// Wave D-b — the AdjustmentTemplatePanel's pure model (design
// `wave-d-b-design.md` §2, rulings WDB-G1..G4/G13/G14; the builder ABI
// `wave-d-b-design-abi.md` §A/§C/§D.1-2/§F). PURE: zero network, zero React
// (the rules/model.ts precedent this panel sits beside on /rules). Every cents
// figure a template line carries is typed input the CALLER supplies (never a
// DB-computed figure this file invents) — propose_adjustment_template is the
// authority on balance/eligibility; this module only labels/gates/derives
// display-only predicates over what the DB has already returned.
//
// READ NAMES — RESOLVED (as-built ladder round 2). `AdjustmentTemplateRow`'s
// fields mirror ABI §D.1's DDL columns verbatim, plus the ONE derived key the
// 0042 §S2.8 projection adds: `occurrence_draft_entry_id`. That key is
// load-bearing rather than decorative — `adjustment_run_due` reports
// `occurrence_draft_outstanding` and names the remedy ("approve or withdraw the
// draft"), and without the draft's id on the row the panel could state the
// remedy but not reach it. `../shared/adjustmentApi.ts`'s header carries the
// full envelope pin for the three reads that consume these shapes.

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function bool(v: unknown): boolean {
  return v === true;
}
function rec(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// ---------------------------------------------------------------------------
// Template lines (ABI §C): ≥2 rows, exactly one of debit/credit positive per
// row, Σdebit=Σcredit — validated in-DB at propose; never balanced here.
// ---------------------------------------------------------------------------

export type AdjustmentTemplateLine = {
  account_code: string;
  debit_cents: number;
  credit_cents: number;
  description?: string | null;
};

export function toAdjustmentTemplateLine(raw: unknown): AdjustmentTemplateLine {
  const o = rec(raw);
  return {
    account_code: s(o.account_code) ?? "",
    debit_cents: numOrNull(o.debit_cents) ?? 0,
    credit_cents: numOrNull(o.credit_cents) ?? 0,
    description: s(o.description),
  };
}

/** design §2.1: ≥2 lines, exactly one of debit/credit positive per row,
 *  Σdebit=Σcredit — a client-side PREVIEW only (propose_adjustment_template
 *  re-derives and is the authority; the /bank matchGroupTiePreview precedent). */
export function templateLinesBalance(lines: readonly AdjustmentTemplateLine[]): { balanced: boolean; debitSum: number; creditSum: number } {
  const debitSum = lines.reduce((sum, l) => sum + (l.debit_cents || 0), 0);
  const creditSum = lines.reduce((sum, l) => sum + (l.credit_cents || 0), 0);
  return { balanced: lines.length >= 2 && debitSum === creditSum && debitSum > 0, debitSum, creditSum };
}

export type AdjustmentCadence = "monthly" | "annual";
export type AdjustmentTemplateStatus = "proposed" | "live" | "retired" | string;

export type AdjustmentTemplateRow = {
  template_id: string;
  status: AdjustmentTemplateStatus;
  name: string;
  cadence: AdjustmentCadence | string;
  start_date: string | null;
  end_date: string | null;
  auto_reverse: boolean;
  lines: AdjustmentTemplateLine[];
  memo_template: string | null;
  content_hash: string | null;
  proposed_by: string | null;
  signed_by: string | null;
  signed_at: string | null;
  retired_by: string | null;
  retired_at: string | null;
  retired_reason: string | null;
  created_at: string | null;
  /** The oldest OUTSTANDING occurrence draft for this template, or null — the
   *  DB's own answer, so the panel can point a bookkeeper at the entry that is
   *  blocking the sweep instead of only naming it. */
  occurrence_draft_entry_id: string | null;
  /** [round-11 XP2] The predecessor this template was PROPOSED AS THE REPLACEMENT
   *  for (`propose_adjustment_template`'s tenth arg `p_replaces`), or null when it
   *  replaces nothing. MEASURED r11 W1 finding 3 / Codex r11 finding 2: the whole
   *  lineage build — the P1 period prohibition, `replaced_generations`, the
   *  predecessor-candidate grammar — was unreachable through every shipped surface,
   *  because nothing SENT the arg and `_adj_template_json` did not project the
   *  column, so no surface could display an existing declaration either. Always
   *  present on the 0045 envelope (uuid or JSON null); an older envelope degrades to
   *  null, i.e. "declares nothing", never a crash. */
  replaces_template_id: string | null;
};

export function toAdjustmentTemplateRow(raw: unknown): AdjustmentTemplateRow {
  const o = rec(raw);
  return {
    template_id: s(o.template_id) ?? s(o.id) ?? "",
    status: s(o.status) ?? "proposed",
    name: s(o.name) ?? "",
    cadence: s(o.cadence) ?? "monthly",
    start_date: s(o.start_date),
    end_date: s(o.end_date),
    auto_reverse: bool(o.auto_reverse),
    lines: arr(o.lines).map(toAdjustmentTemplateLine),
    memo_template: s(o.memo_template),
    content_hash: s(o.content_hash),
    proposed_by: s(o.proposed_by),
    signed_by: s(o.signed_by),
    signed_at: s(o.signed_at),
    retired_by: s(o.retired_by),
    retired_at: s(o.retired_at),
    retired_reason: s(o.retired_reason),
    created_at: s(o.created_at),
    occurrence_draft_entry_id: s(o.occurrence_draft_entry_id),
    replaces_template_id: s(o.replaces_template_id),
  };
}

/** The predecessor row a template DECLARES, resolved out of the same client list the
 *  panel already holds — a lookup, never a fetch. Returns null both when nothing is
 *  declared and when the declared id is not in this list, and the caller must render
 *  those two differently: "replaces nothing" is a fact, "replaces an id we cannot
 *  name" is a lineage the reader still needs to see. */
export function predecessorOf(
  templates: readonly AdjustmentTemplateRow[],
  row: Pick<AdjustmentTemplateRow, "replaces_template_id">,
): AdjustmentTemplateRow | null {
  if (!row.replaces_template_id) return null;
  return templates.find((t) => t.template_id === row.replaces_template_id) ?? null;
}

/** The only templates a NEW proposal may declare as its predecessor. The DB refuses a
 *  LIVE one by name (`template_replaces_not_retired`), so offering one would build the
 *  walled corridor this round is closing — the picker is filtered to `retired` for that
 *  reason, not for tidiness. */
export function retiredTemplates(templates: readonly AdjustmentTemplateRow[]): AdjustmentTemplateRow[] {
  return templates.filter((t) => t.status === "retired");
}

/** list_adjustment_templates(p_client) — ONE jsonb object (0042 §S2.8). The
 *  `available` SHAPE signal follows the assetsModel law: a wrong shape reads as
 *  `unavailable`, never as a confident "no templates". */
export type ListAdjustmentTemplatesRead = {
  client_id: string | null;
  templates: AdjustmentTemplateRow[];
  live_count: number | null;
  draft_blocked_count: number | null;
  available: boolean;
};

export function toListAdjustmentTemplatesRead(raw: unknown): ListAdjustmentTemplatesRead {
  const o = rec(raw);
  const available = typeof raw === "object" && raw !== null && Array.isArray(o.templates);
  return {
    client_id: s(o.client_id),
    templates: available ? (o.templates as unknown[]).map(toAdjustmentTemplateRow) : [],
    live_count: numOrNull(o.live_count),
    draft_blocked_count: numOrNull(o.draft_blocked_count),
    available,
  };
}

export function canSignTemplate(row: Pick<AdjustmentTemplateRow, "status">): boolean {
  return row.status === "proposed";
}
export function canRetireTemplate(row: Pick<AdjustmentTemplateRow, "status">): boolean {
  return row.status === "proposed" || row.status === "live";
}

// ---------------------------------------------------------------------------
// adjustment_run_due(p_client) — ABI §A pinned read. blocked[] carries the
// v1-only reason `occurrence_draft_outstanding` (design §2.3, ABI §F).
// ---------------------------------------------------------------------------

export type AdjustmentRunBlocked = { template_id: string; reason: string };

export type AdjustmentRunDue = {
  due: boolean;
  /** [round-8 F3] The envelope's TOP-LEVEL reason (0042 §2.3: 'nothing_due' |
   *  'all_blocked' | 'client_not_found' on a due:false answer; null on due:true).
   *  Distinct from `blocked[].reason`, which is PER-TEMPLATE. Dropped entirely
   *  before this fix — a `client_not_found` answer is a well-formed
   *  `{due:false,...}` boolean, so it silently rendered as a confident "nothing
   *  is due" instead of the "we could not even resolve this client" fact it is. */
  reason: string | null;
  template_id: string | null;
  period_start: string | null;
  period_end: string | null;
  blocked: AdjustmentRunBlocked[];
  /** [round-3 fix] the same SHAPE signal every other read in this wave carries.
   *  Without it a wrong-shaped answer (a bare array, a null, a renamed key)
   *  mapped to `due:false, blocked:[]` — i.e. "nothing is due and nothing is
   *  blocked", the most reassuring possible reading of a read that failed.
   *  [round-8 F3] `reason==='client_not_found'` ALSO reads as unavailable now,
   *  even though `due` itself is a perfectly well-formed boolean — the module's
   *  existing Advisory law ("a wrong shape is unknown, never a confident
   *  empty") extended to a wrong-CLIENT answer, not only a wrong-SHAPE one. */
  available: boolean;
};

function toAdjustmentRunBlocked(raw: unknown): AdjustmentRunBlocked {
  const o = rec(raw);
  return { template_id: s(o.template_id) ?? "", reason: s(o.reason) ?? "" };
}

export function toAdjustmentRunDue(raw: unknown): AdjustmentRunDue {
  const o = rec(raw);
  const reason = s(o.reason);
  const shapedOk = typeof raw === "object" && raw !== null && typeof o.due === "boolean";
  return {
    due: bool(o.due),
    reason,
    template_id: s(o.template_id),
    period_start: s(o.period_start),
    period_end: s(o.period_end),
    blocked: arr(o.blocked).map(toAdjustmentRunBlocked),
    available: shapedOk && reason !== "client_not_found",
  };
}

/** blocked[]'s reasons, glossed for the panel. An unnamed reason still renders —
 *  verbatim via the caller's own text — just without a gloss.
 *
 *  The three reasons differ in KIND, and the wording says which: the first is
 *  transient and self-clearing once a human acts on the draft; the second is
 *  terminal for this template — the sweep will never run it again until the
 *  template is retired and re-proposed on an account nothing else has claimed;
 *  the third is terminal for this PERIOD and is the only one that is about a
 *  number rather than a configuration. A bookkeeper reading "blocked" needs to
 *  know which of those they are looking at, because only one resolves by waiting.
 *
 *  ═══ [round-11 W2 finding 4] EVERY GLOSS NAMES ONLY ACTS THE ROW OFFERS ═══
 *  Two glosses used to open with "Run the template by hand first: the refusal
 *  names …". MEASURED (W2 probes p5/p6): a blocked template's due envelope is
 *  `{due:false, reason:'all_blocked', blocked:[{template_id, reason}]}` and
 *  AdjustmentTemplatePanel renders its Run control only while the oracle names a
 *  period for THIS template — so the row that printed the instruction had no run
 *  affordance, and the whole remedy grammar the instruction promised (the ordered
 *  `remedy` list, `predecessor_candidates`, `replaced_generations`) was composed
 *  into a refusal the product could never elicit.
 *
 *  NEITHER recorded fix direction survives the 0045 ABI, and the glosses were
 *  rewritten instead — stated here because a future reader will otherwise re-derive
 *  it: (a) "offer the manual run for a blocked template" needs a period, and
 *  `run_adjustment_manual` takes p_period_start/p_period_end that only the oracle
 *  may supply — the blocked envelope carries none, and a period this panel invents
 *  is the one thing it must never send (the DB owns the period); (b) "carry
 *  blocked[]'s own detail onto the row" needs blocked[] to widen, and the 0045 ABI
 *  pins that row shape as `{template_id, reason}`, unchanged. So the reachable fix
 *  is the honest one: state the measured facts and name only retire / propose /
 *  correct-the-standing-entry, all of which a reader can actually reach. */
export function blockedReasonLabel(reason: string): string {
  if (reason === "occurrence_draft_outstanding") {
    return "an occurrence draft is still outstanding — approve or withdraw it before the next sweep can run";
  }
  if (reason === "template_line_ineligible") {
    // [round 10] This gloss NAMES A REMEDY, and the remedy leads somewhere the re-run gate cannot
    // see: a replacement on free codes is shape-DISJOINT from the charges this template already
    // booked, so a start date reaching back over them re-charges every one with blocked:[]
    // (measured RM1,000 doubled through ordinary catch-up drafts). The DB refusal now measures
    // this template's own standing charges and names the date the replacement must start after;
    // the panel must not lead a bookkeeper down that road more confidently than the DB does.
    return "one of this template's accounts has since been claimed elsewhere (a fixed-asset profile or a staff-advance enrolment) — this template can no longer run; retire it and propose a replacement on a free account, and START the replacement after the periods this template has already charged: a replacement on free codes shares no account with those charges, so the re-run gate cannot see the double. Declare this template as the replacement's predecessor when you propose it — that is what lets the DB measure the overlap instead of guessing at it";
  }
  // [as-built ladder round 5] The correct-and-re-run gate. The DB refuses to re-run a
  // period whose correction was booked outside it (or one of whose auto-reversal halves
  // is still standing), because re-running it would leave that period's own balance
  // carrying the figure twice. It is TERMINAL for this period and the gloss says so: a
  // hand entry is the right accounting act but does not re-open the automatic lane
  // (nothing re-links an already-reversed entry), so the only act that clears the badge
  // is retiring the template. Promising anything else would be a remedy the panel cannot
  // reach — the exact shape this build has already had to fix once.
  if (reason === "period_correction_unsound") {
    return "this period was corrected outside itself, so re-running it would double the period's own balance — the sweep will not run it again; finish the period by hand and retire this template";
  }
  // [as-built ladder round 6 — CROSS-SECTION, reported not silent] The generation gate. The
  // DB's re-run admission is keyed on the ACCOUNT SHAPE, not on template_id, because editing a
  // template is retire + re-propose [WDB-G13] and that mints a new id — measured driving a
  // month from RM50,000 to RM110,000 unattended. So a replacement template is blocked on every
  // period its predecessor already met. This one is TERMINAL for the period and its remedy is
  // the OPPOSITE of the row above: there is nothing wrong with the standing entry's date, so
  // correcting it inside its own period is exactly the act that releases the month — retiring
  // the new template would only throw the correction away. [round 10] The second remedy is NOT
  // conditioned on a lineage this schema does not record: the DB measured that reading a
  // standing writer's RETIRED status as "this is the generation you replace" was wrong in both
  // directions with money (a retired SIBLING whose only offered act erased RM6,000 of a
  // legitimate audit accrual; and the propose-then-retire order, where the status reads 'live'
  // and the doubling instruction printed anyway). The refusal now offers BOTH acts and carries a
  // MEASURED caution — which sibling templates already have standing charges, and for which
  // periods — so the gloss must promise no more than the DB does.
  if (reason === "period_shape_already_met") {
    // [round 10, lane P1] The DB now has TWO branches here, not one, and the gloss must not
    // promise the permissive one. Where the template RECORDED a predecessor at propose
    // (replaces_template_id, the owner's option (b)) and that generation still carries standing
    // charges, the refusal FORBIDS the distinct-codes act by name — the doubling is arithmetic,
    // not a risk — and offers three other acts instead. Where no lineage is recorded it only
    // MEASURES, exactly as lane O1 shipped it. A panel that says "distinct account codes also
    // clears it" full stop is telling half the readers to do the one thing the DB refuses.
    return "this period already carries an approved posting on this template's own accounts, booked under another authority — a second one would leave the figure standing twice; correct that entry within its own period. Giving this template distinct account codes MAY also clear it, and MAY instead book those periods a second time: where this template was PROPOSED AS THE REPLACEMENT for the generation that wrote the standing charge (a lineage this client RECORDED at propose), the DB forbids the distinct-codes act by name; where no lineage is recorded the DB only MEASURES which sibling templates already carry standing charges and for which periods, and leaves the act to you";
  }
  // [round-11, the P1 lineage prohibition's own token] The FIFTH blocked reason. It fires
  // only for a template that DECLARED a predecessor: the generation it replaces still
  // carries standing charges in periods this template would book, so booking them is
  // arithmetic doubling rather than a risk, and the DB refuses. Every act this gloss names
  // is reachable from the row it renders on or from the propose form beneath it — Retire is
  // on the row, Propose is on the panel, and correcting the predecessor's own standing
  // charges is the same act the reason above already names. It deliberately does NOT tell
  // the reader to run the template by hand: the row carries no run affordance in this state
  // (see this function's header).
  //
  // THE THREE ACTS ARE THE DB'S OWN, IN THE DB'S ORDER — the refusal's `remedy` array reads
  // ['correct_the_standing_entry_in_period', 'start_after_replaced_generation',
  // 're_propose_without_predecessor'] (MEASURED on rig clara_r11_fix, 0045 sha 17f750e5).
  // The gloss cannot show `start_after`'s actual DATE: that rides the refusal detail, and
  // blocked[] carries only {template_id, reason}, so the row genuinely does not know it.
  //
  // THE LAST SENTENCE IS A CORRIDOR GUARD, not decoration — and [round-12, Codex CXR4] the
  // FIRST version of it was measured WRONG in the direction that costs a professional an act.
  // It told the reader that the re-proposal "must NOT name the same predecessor again". That is
  // true of ONE of the two remedies and false of the other, and the DB is the authority:
  //   * START AFTER (remedy 2) MAY KEEP THE PREDECESSOR. Retiring this template first is part of
  //     the act, and a RETIRED successor is in neither lineage index — so re-proposing with the
  //     same p_replaces and a later start date is ADMITTED (measured, cell x42.r12f). It is also
  //     the better act: the lineage stays recorded, so the WALL keeps standing on the new row.
  //   * NAMING NO PREDECESSOR (remedy 3) is the "the lineage claim was wrong" case. It drops the
  //     declaration because the declaration was the mistake — not because the DB forbids it.
  // WHAT IS ACTUALLY REFUSED IS AN ORDERING, and both refusals are named so the reader meets a
  // sentence rather than a CLR10: declaring the predecessor while THIS template is still
  // unretired (`template_replaces_already_succeeded`), and declaring it while any OTHER template
  // of the same lineage is unretired (`template_lineage_root_occupied`, round-12's root law).
  if (reason === "replaced_generation_period_standing") {
    return "this template was proposed as the REPLACEMENT for a generation that still carries approved charges in the periods this one would book — booking them again would leave those figures standing twice, so the sweep will not run this template for them. The DB offers three acts, in its own order: correct the predecessor's standing charges within their own periods; start this template after the generation it replaces last charged; or propose it again naming no predecessor. The last two are done by retiring this template and proposing it afresh, in that order. Starting after MAY keep the same predecessor — a retired successor is in nothing's way, and keeping the declaration keeps the wall standing on the new template; only the case where the lineage claim itself was wrong drops it. What the DB refuses is the ORDER: declaring that predecessor while this template is still unretired (template_replaces_already_succeeded), or while any other template of the same lineage is still unretired (template_lineage_root_occupied)";
  }
  return reason;
}

/** True when THIS template appears in due.blocked[] — the per-template
 *  banner predicate the panel renders per row. */
export function templateIsBlocked(templateId: string, due: Pick<AdjustmentRunDue, "blocked">): AdjustmentRunBlocked | null {
  return due.blocked.find((b) => b.template_id === templateId) ?? null;
}

// ---------------------------------------------------------------------------
// THE PROPOSE SURFACE — [round-11 W2 finding 3 / W1 finding 3].
//
// `propose_adjustment_template`'s receipt carries an ADVISORY `warnings[]` the panel
// discarded entirely (measured: the receipt was awaited and thrown away, and the only
// thing the form set was "Proposed — an admin must sign it before it runs."). The
// advisory exists specifically to reach the human making the doubling DECISION before
// an admin signs, so dropping it is the one failure that costs exactly what the
// advisory was built to prevent. Both helpers below are LABELS only: the DB's own
// `message` / refusal token is the payload, and nothing here re-words or re-derives it.
// ---------------------------------------------------------------------------

/** A short kind-label for a propose warning's axis, so a reader can tell the three
 *  apart at a glance. The DB's `message` still carries the whole story and is rendered
 *  verbatim beside this; an axis this build does not know renders as its own token. */
export function proposeWarningAxisLabel(axis: string): string {
  if (axis === "colliding_live_sibling") return "A live template of this client already covers this shape";
  if (axis === "implausible_start_date") return "That start date looks implausible";
  // [round-11] The THIRD axis: period overlap with the generation being replaced,
  // measured WITHOUT any shape requirement — the term that closes the silent re-code
  // double, where a retire-then-re-code edit onto distinct codes drew warnings:[] because
  // both older defences were shape-scoped.
  if (axis === "replaced_period_overlap") return "The template this replaces still carries charges in periods this one would book";
  return axis;
}

/** The propose refusals a DECLARED predecessor can raise, named rather than shown as a
 *  bare PostgREST error. Each names the act that clears it, and every one of those acts
 *  is on this form or the row above it. A token this build does not know returns null,
 *  so the caller falls back to the DB's own message rather than inventing a gloss. */
export function proposeRefusalLabel(reason: string | null): string | null {
  if (reason === "template_replaces_unknown") {
    return "the predecessor you declared is not a template of this client — pick one from the list rather than typing an id";
  }
  if (reason === "template_replaces_not_retired") {
    return "a template can only replace a RETIRED predecessor — retire the one you are replacing first, then propose this again";
  }
  if (reason === "template_replaces_chain_too_long") {
    return "this lineage is already at its length cap — declare the earliest generation still relevant, or none at all";
  }
  if (reason === "template_replaces_already_succeeded") {
    return "that predecessor already has a successor — a generation is replaced once; retire that successor first, or declare the CURRENT end of the chain instead";
  }
  // [round-12, Codex CXR2] THE FIFTH LINEAGE REFUSAL. R11's law was keyed on the EDGE (one
  // successor per predecessor) and a fork could always be attached one generation further up:
  // P→A→B live, then C declaring P again passed every direct-child test and left two live
  // leaves booking the same months. The DB now keys it on the lineage ROOT. The remedy is the
  // same shape as its neighbour's and both acts are on this panel — the refusal detail names the
  // occupying template's id, which is what the reader retires.
  if (reason === "template_lineage_root_occupied") {
    return "another template of this lineage is still live or proposed — a generation has one unretired continuation at a time; retire that one first, or propose this without naming a predecessor";
  }
  return null;
}

// ---------------------------------------------------------------------------
// adjustment_runs (ABI §D.2) — the receipt row, for the panel's optional
// last-run echo and the `adjustment_run_receipt` card. [round-7 F-F1 fix] THE
// CORRECTION AFFORDANCE for a run lives on that CARD, not this panel — a
// paired occurrence's `reverse_adjustment_pair` button rides the run receipt
// row it acts on (the identifier-only card law), not a new /rules control.
// ---------------------------------------------------------------------------

export type AdjustmentRunMode = "post" | "draft" | string;

export type AdjustmentRunRow = {
  id: string;
  client_id: string | null;
  template_id: string | null;
  period_start: string | null;
  period_end: string | null;
  mode: AdjustmentRunMode;
  entry_id: string | null;
  reversal_entry_id: string | null;
  amount_cents: number | null;
  created_at: string | null;
  /** [round-8 F4] Whether THIS run can be corrected RIGHT NOW — the DB's own
   *  answer from the SAME authority that would refuse a correction
   *  (`_wdb_reversal_blocked` / the pair machine's state), not a dashboard
   *  INFERENCE from `reversal_entry_id` (which only ever proved "was ever
   *  auto-paired", never "has no outstanding correction now" — the gap round 8
   *  measured: the receipt card offered "Correct this run" on an already-
   *  corrected or already-parked pair). Absent on an envelope minted before
   *  this key existed (the dashboard-deploys-before-the-migration-merges gap,
   *  assetsApi.ts's precedent) degrades to `false` — a temporarily HIDDEN
   *  button, never a wrongly-offered one. */
  correctable: boolean;
  /** The pair CURRENTLY acting on this run, or null when none is active
   *  (uncorrected, or a prior pair was cancelled — x42.c3 leaves the
   *  occurrence correctable again, at which point the DB reports no active
   *  pair either). */
  active_pair_id: string | null;
  /** That pair's own status ('pending' | 'completed', mirroring
   *  `PairReversalResult.status`), or null exactly when `active_pair_id` is
   *  null. */
  active_pair_status: string | null;
  /** [round-9 F3] The verb that admits THIS run's occurrence today, from the DB's
   *  one correction-door authority — 'clara.reverse_entry' for a solo occurrence,
   *  'clara.reverse_adjustment_pair' for a pair, null when no door admits it.
   *  `correctable` alone can never answer WHICH act, so a surface that has only
   *  `correctable` must GUESS — and round 9 measured the guess: a solo run offered
   *  a button wired to reverse_adjustment_pair, which refuses `not_an_auto_pair`. */
  correction_verb: string | null;
  /** The entry that verb takes — the pair verb takes the OCCURRENCE, so a mirror
   *  resolves to it. Never inferred from entry_id. */
  correction_entry: string | null;
  /** The reason token that closed the door, when one did ('entry_already_reversed',
   *  'pair_already_active', 'adjustment_pair_locked', …). */
  correction_wall: string | null;
  /** [round-11 W2 finding 5] The wall-OWNING body's own followable sentence for
   *  whatever `correction_wall` names — the DB's remedy prose, never composed here.
   *  `_adj_run_json` dropped it before this fix, so round 10's followable sentence had
   *  no consumer on this path and every wall (advance_movement_unregistered,
   *  pair_half_not_approved, pair_half_already_reversed, allocated_items_present,
   *  live_bank_match_present, fa_reversal_blocked) rendered as byte-identical silence.
   *  Null on the door branches that carry no sentence, and null on an envelope minted
   *  before the key existed — the render must treat "no advice" as its own state, never
   *  print an empty remedy. */
  correction_wall_advice: string | null;
};

export function toAdjustmentRunRow(raw: unknown): AdjustmentRunRow {
  const o = rec(raw);
  return {
    id: s(o.id) ?? "",
    client_id: s(o.client_id),
    template_id: s(o.template_id),
    period_start: s(o.period_start),
    period_end: s(o.period_end),
    mode: s(o.mode) ?? "draft",
    entry_id: s(o.entry_id),
    reversal_entry_id: s(o.reversal_entry_id),
    amount_cents: numOrNull(o.amount_cents),
    created_at: s(o.created_at),
    correctable: bool(o.correctable),
    active_pair_id: s(o.active_pair_id),
    active_pair_status: s(o.active_pair_status),
    correction_verb: s(o.correction_verb),
    correction_entry: s(o.correction_entry),
    correction_wall: s(o.correction_wall),
    correction_wall_advice: s(o.correction_wall_advice),
  };
}

/** list_adjustment_runs(p_client) — ONE jsonb object (0042 §S2.8), newest
 *  period first. Same `available` SHAPE law as the template list. */
export type ListAdjustmentRunsRead = {
  client_id: string | null;
  runs: AdjustmentRunRow[];
  available: boolean;
};

export function toListAdjustmentRunsRead(raw: unknown): ListAdjustmentRunsRead {
  const o = rec(raw);
  const available = typeof raw === "object" && raw !== null && Array.isArray(o.runs);
  return {
    client_id: s(o.client_id),
    runs: available ? (o.runs as unknown[]).map(toAdjustmentRunRow) : [],
    available,
  };
}

/** The most recent run receipt for ONE template. The DB already returns the list
 *  newest-period-first, so this is a `find`, never a sort — the panel does not
 *  get to have its own opinion about which run is the latest. */
export function latestRunForTemplate(runs: readonly AdjustmentRunRow[], templateId: string): AdjustmentRunRow | null {
  return runs.find((r) => r.template_id === templateId) ?? null;
}

// ---------------------------------------------------------------------------
// ADVISORY READS — the round-3 fix.
//
// The panel treats `adjustment_run_due` and `list_adjustment_runs` as decoration
// beside the load-bearing template list, and used to swallow both with
// `.catch(() => null)`. That is a CONFIDENT WRONG ANSWER about whether the sweep
// is stuck: a failed due read rendered EVERY template as un-blocked and
// never-due, and a failed run read rendered every template as never-run. A
// bookkeeper looking for "why has this not posted" would be told, confidently,
// "nothing is wrong".
//
// The house law is assetsModel's `available` SHAPE signal: an error reads as
// UNAVAILABLE, never as a confident empty. `Advisory<T>` carries BOTH failure
// modes, because they are different facts and BOTH produce the same silent
// empty otherwise:
//   · the call THREW (404 / role refusal / network), and
//   · the call returned a WRONG SHAPE (`available === false` on the envelope).
// ---------------------------------------------------------------------------

export type Advisory<T> = { value: T | null; available: boolean; error: string | null };

export function advisoryOk<T>(value: T): Advisory<T> {
  return { value, available: true, error: null };
}
export function advisoryUnavailable<T>(error: string | null): Advisory<T> {
  return { value: null, available: false, error };
}

/** Wrap an advisory read so BOTH failure modes land in the same shape. `ok`
 *  decides whether a RESOLVED value is trustworthy (the envelope's own
 *  `available` flag); a rejection is unavailable by definition. */
export async function readAdvisory<T>(p: Promise<T>, ok: (v: T) => boolean): Promise<Advisory<T>> {
  try {
    const v = await p;
    return ok(v) ? advisoryOk(v) : advisoryUnavailable<T>("the read came back in an unexpected shape");
  } catch (e) {
    return advisoryUnavailable<T>((e as Error)?.message ?? String(e));
  }
}

/** THREE states, never two: this template IS blocked (with the reason), is
 *  NOT blocked, or the advisory that would say is UNAVAILABLE. The panel must
 *  render `unknown` as its own thing — "we could not ask" is not "all clear". */
export type TemplateBlockState =
  | { state: "blocked"; blocked: AdjustmentRunBlocked }
  | { state: "clear" }
  | { state: "unknown" };

export function templateBlockState(templateId: string, due: Advisory<AdjustmentRunDue>): TemplateBlockState {
  if (!due.available || !due.value) return { state: "unknown" };
  const hit = templateIsBlocked(templateId, due.value);
  return hit ? { state: "blocked", blocked: hit } : { state: "clear" };
}

/** Due-ness is likewise tri-state — an unavailable oracle must not read as
 *  "not due", because "not due" is what hides a stuck sweep. */
export function templateDueState(templateId: string, due: Advisory<AdjustmentRunDue>): "due" | "not_due" | "unknown" {
  if (!due.available || !due.value) return "unknown";
  return due.value.due === true && due.value.template_id === templateId ? "due" : "not_due";
}
