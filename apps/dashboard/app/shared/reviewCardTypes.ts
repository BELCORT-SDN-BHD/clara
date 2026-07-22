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

// --- get_rule_post_run (WA2 §6.4: the posted-by-rule receipt) -------------------
// ASSUMED read fn (`get_rule_post_run(p_run)`) — the 0015 companion S4 pins the
// `rule_post_runs` table + `acknowledge_rule_posts` but does NOT name the hydrate
// read; see LANE-D-NOTES. Defensive by design (the toSweepRun precedent): a run may
// carry a batch of posted entries (`posts[]`) OR arrive as one flat per-entry receipt
// — the mapper accepts both so the card renders either shape without a crash.

export type RulePostEntry = {
  entry_id: string;
  posted_at: string | null;
  amount_cents: number | null;
  account_code: string | null;
  counterparty_name: string | null;
  period: string | null;
  reversed: boolean;
};
export type RulePostRun = {
  run_id: string;
  rule_id: string | null;
  direction: "purchase" | "sales" | string | null;
  posted_at: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  posts: RulePostEntry[];
};

function toRulePostEntry(raw: unknown): RulePostEntry {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    entry_id: s(o.entry_id) ?? s(o.id) ?? "",
    posted_at: s(o.posted_at) ?? s(o.created_at),
    amount_cents: numOrNull(o.amount_cents) ?? numOrNull(o.total_cents),
    account_code: s(o.account_code),
    counterparty_name: s(o.counterparty_name),
    period: s(o.period) ?? s(o.posting_date),
    reversed: b(o.reversed) || s(o.status) === "reversed",
  };
}

export function toRulePostRun(raw: unknown): RulePostRun {
  const o = (raw ?? {}) as Record<string, unknown>;
  const postsRaw = arr(o.posts).length > 0 ? arr(o.posts) : arr(o.entries);
  // Flat single-entry receipt: no `posts[]`, but the run row itself names an entry.
  const posts = postsRaw.length > 0 ? postsRaw.map(toRulePostEntry) : (s(o.entry_id) ? [toRulePostEntry(o)] : []);
  return {
    run_id: s(o.run_id) ?? s(o.id) ?? "",
    rule_id: s(o.rule_id),
    direction: s(o.direction),
    posted_at: s(o.posted_at) ?? s(o.created_at),
    acknowledged_by: s(o.acknowledged_by) ?? s(o.acked_by),
    acknowledged_at: s(o.acknowledged_at) ?? s(o.last_ack_at),
    posts,
  };
}

/** True once the receipt has been acknowledged (terminal — the action goes inert). */
function b(v: unknown): boolean {
  return v === true;
}

// --- get_coding_rule autopost tier (WA2 §6 / migration 0015 S3) -----------------
// ASSUMED read fn (`list_autopost_rules(p_scope)`) — the companion names
// sign/propose/reconcile writers + get_coding_rule (single, vendor_account tier) but
// no autopost LIST read; see LANE-D-NOTES. Defensive: bound columns degrade to null.

export type AutopostRule = {
  rule_id: string;
  client_id: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  direction: "purchase" | "sales" | string | null;
  account_code: string | null;
  account_name: string | null;
  amount_cap_cents: number | null;
  frequency_window: string | null;
  window_max_posts: number | null;
  posts_in_window: number | null;
  posts_remaining: number | null; // DB-emitted (list_autopost_rules) — the UI never recomputes it
  expires_at: string | null;
  status: "proposed" | "live" | "declined" | "retired" | "expired" | string;
  signed_by: string | null;
  signed_at: string | null;
  supersedes_rule_id: string | null;
  reason: string | null;
  created_at: string | null;
};

export function toAutopostRule(raw: unknown): AutopostRule {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    rule_id: s(o.rule_id) ?? s(o.id) ?? "",
    client_id: s(o.client_id),
    counterparty_id: s(o.counterparty_id),
    counterparty_name: s(o.counterparty_name),
    direction: s(o.direction),
    account_code: s(o.account_code),
    account_name: s(o.account_name),
    amount_cap_cents: numOrNull(o.amount_cap_cents),
    frequency_window: s(o.frequency_window),
    window_max_posts: numOrNull(o.window_max_posts),
    posts_in_window: numOrNull(o.posts_in_window) ?? numOrNull(o.window_posts),
    posts_remaining: numOrNull(o.posts_remaining),
    expires_at: s(o.expires_at),
    status: s(o.status) ?? "proposed",
    signed_by: s(o.signed_by),
    signed_at: s(o.signed_at),
    supersedes_rule_id: s(o.supersedes_rule_id),
    reason: s(o.reason),
    created_at: s(o.created_at),
  };
}

// --- notifications (WA2 §6.2/L6: the renew-or-retire nudge) ---------------------
// ASSUMED read fn (`list_notifications(p_scope, p_kinds)`) — see LANE-D-NOTES. The
// nudge is written by the reconciler via record_notification; kind is FREE in the DB.

export type Notification = {
  id: string;
  client_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string | null;
};

export function toNotification(raw: unknown): Notification {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    id: s(o.id) ?? "",
    client_id: s(o.client_id),
    kind: s(o.kind) ?? "",
    payload: (o.payload ?? {}) as Record<string, unknown>,
    created_at: s(o.created_at),
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
