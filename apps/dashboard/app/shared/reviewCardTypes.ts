// Card-hydration object types (INTERFACE-PINS §5: get_sweep_run · get_open_question
// · get_coding_rule · coding_lane). These jsonb shapes are Lane A's internal shapes
// (not fully pinned in §5a), so the mappers are DEFENSIVE — a key rename degrades a
// field, never crashes the card; this is the single place to reconcile key names at
// integration (the toDraftReview precedent). coding_lane's reason vocabulary IS
// pinned (§5a) and is transcribed exactly for the label map.

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function numOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function strArr(v: unknown): string[] {
  return arr(v).map((x) => (typeof x === "string" ? x : String(x)));
}

// --- get_sweep_run (WA-R5 / WA-L6: honest DB counts, never a live progress bar) --

export type SweepOutcomeCounts = {
  drafted: number; skipped_lane: number; refused_budget: number; refused_attempts: number; noop_existing: number;
};
export type SweepRun = {
  run_id: string;
  state: "open" | "finalized" | string;
  expected: number | null;
  opened_at: string | null;
  finalized_at: string | null;
  last_ack_at: string | null;
  acked_by: string | null;
  counts: SweepOutcomeCounts;
  tokens_reserved: number | null;
  tokens_actual: number | null;
};

export function toSweepRun(raw: unknown): SweepRun {
  const o = (raw ?? {}) as Record<string, unknown>;
  const c = (o.counts ?? o.outcomes ?? {}) as Record<string, unknown>;
  return {
    run_id: s(o.run_id) ?? s(o.id) ?? "",
    state: s(o.state) ?? "open",
    expected: numOrNull(o.expected) ?? numOrNull(o.expected_items),
    opened_at: s(o.opened_at) ?? s(o.created_at),
    finalized_at: s(o.finalized_at),
    last_ack_at: s(o.last_ack_at),
    acked_by: s(o.acked_by),
    counts: {
      drafted: numOrNull(c.drafted) ?? 0,
      skipped_lane: numOrNull(c.skipped_lane) ?? 0,
      refused_budget: numOrNull(c.refused_budget) ?? 0,
      refused_attempts: numOrNull(c.refused_attempts) ?? 0,
      noop_existing: numOrNull(c.noop_existing) ?? 0,
    },
    tokens_reserved: numOrNull(o.tokens_reserved),
    tokens_actual: numOrNull(o.tokens_actual),
  };
}

/** True when a run is finalized — only then is acknowledgement lawful (CLR29 not_finalized). */
export function sweepIsFinalized(run: SweepRun): boolean {
  return run.state === "finalized" || run.finalized_at !== null;
}

// --- get_open_question (WA-R10 scope ∈ {document, vendor, client}) --------------

export type OpenQuestion = {
  question_id: string;
  client_id: string | null;
  scope_kind: "document" | "vendor" | "client" | string | null;
  scope_id: string | null;
  question: string;
  status: "open" | "resolved" | "dismissed" | string;
  origin: string | null;
  created_at: string | null;
  resolved_at: string | null;
  resolution: string | null;
};

export function toOpenQuestion(raw: unknown): OpenQuestion {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    question_id: s(o.question_id) ?? s(o.id) ?? "",
    client_id: s(o.client_id),
    scope_kind: s(o.scope_kind),
    scope_id: s(o.scope_id),
    question: s(o.question) ?? s(o.question_text) ?? "",
    status: s(o.status) ?? "open",
    origin: s(o.origin),
    created_at: s(o.created_at),
    resolved_at: s(o.resolved_at),
    resolution: s(o.resolution),
  };
}

// --- get_coding_rule (WA-R9 dual-source sticky rules) --------------------------

export type CodingRule = {
  rule_id: string;
  client_id: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  account_code: string | null;
  account_name: string | null;
  status: "proposed" | "live" | "declined" | "retired" | string;
  origin: string | null;
  created_at: string | null;
  signed_by: string | null;
  signed_at: string | null;
  reason: string | null;
  sighting_count: number | null;
};

export function toCodingRule(raw: unknown): CodingRule {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    rule_id: s(o.rule_id) ?? s(o.id) ?? "",
    client_id: s(o.client_id),
    counterparty_id: s(o.counterparty_id),
    counterparty_name: s(o.counterparty_name),
    account_code: s(o.account_code),
    account_name: s(o.account_name),
    status: s(o.status) ?? "proposed",
    origin: s(o.origin),
    created_at: s(o.created_at),
    signed_by: s(o.signed_by),
    signed_at: s(o.signed_at),
    reason: s(o.reason),
    sighting_count: numOrNull(o.sighting_count) ?? numOrNull(o.sightings),
  };
}

// --- coding_lane (FINAL reason vocabulary, §5a) --------------------------------

export type CodingLane = { lane: "ready" | "needs_review" | "needs_you" | string | null; reasons: string[] };

export function toCodingLane(raw: unknown): CodingLane {
  const o = (raw ?? {}) as Record<string, unknown>;
  return { lane: s(o.lane), reasons: strArr(o.reasons) };
}

/** The FINAL coding_lane reason tokens → human copy (INTERFACE-PINS §5a). */
export const LANE_REASON_COPY: Record<string, string> = {
  no_active_filing: "no active filing",
  open_draft: "an open draft already binds this filing",
  already_coded: "already coded",
  vendor_unresolved: "vendor not resolved",
  vendor_ambiguous: "vendor is ambiguous — confirm identity",
  tier_a_fails: "the machine total is not corroborated",
  amount_exception: "amount exception",
  near_duplicate: "possible duplicate bill",
  high_stakes: "high-stakes — review individually",
  non_myr: "not MYR (multi-currency is a later wave)",
  open_question: "an open question blocks this",
  no_consent: "processing paused — client consent required",
  multi_doc: "multi-document bundle",
  facts_pending: "extraction still in progress",
  parked: "parked after repeated auto-draft failures",
  rule_backed: "a signed rule backs the account choice",
};
