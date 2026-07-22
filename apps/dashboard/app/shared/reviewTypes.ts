// Envelope types + defensive mappers for the Wave-A daily-loop read surfaces
// (INTERFACE-PINS §5a; Lane A produces, Lane D consumes). The fully-pinned shapes
// (list_review_queue / get_entry_diff / get_doc_entry_diff / coding_lane reasons)
// are transcribed EXACTLY; the card-hydration shapes (get_sweep_run /
// get_open_question / get_coding_rule) are Lane A's internal jsonb — the mappers are
// defensive (a key rename degrades a field, never crashes the card), the ONE place
// to reconcile key names at integration (the toDraftReview precedent). Cents values
// stay raw here; the render layer applies the safe-integer guard (fmt.ts).

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function b(v: unknown): boolean {
  return v === true;
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

// --- list_review_queue (FINAL pin) --------------------------------------------

export type QueueRowKind = "draft" | "uncoded_filing" | "open_question" | "coding_task" | "compliance_watch";
export type QueueSection = "needs_review" | "needs_you";
export type QueueLane = "ready" | "needs_review" | "needs_you" | null;

export type QueueRow = {
  row_kind: QueueRowKind | string;
  section: QueueSection | string;
  sort: string[];
  client_id: string | null;
  counterparty_id: string | null;
  filing_id: string | null;
  entry_id: string | null;
  question_id: string | null;
  task_id: string | null;
  document_id: string | null;
  lane: QueueLane;
  auto: boolean;
  rule_backed: boolean;
  high_stakes: boolean;
  aged_since: string | null;
  amount_cents: number | null;
  period: string | null;
  question_text: string | null;
  created_at: string | null;
  id: string;
  // 0016 additive keys — a pre-0016 envelope degrades each to null (§6.2 direction
  // vocabulary + the compliance_watch row). Never crashes an existing row shape.
  coding_kind: string | null;
  watch_id: string | null;
  tier: string | null;
};

export type QueueCounts = {
  ready: number; needs_review: number; needs_you: number;
  open_drafts: number; open_questions: number; open_tasks: number;
  compliance_watches: number;
};

export type QueueSweep = { open_run: boolean; last_finalized_at: string | null; last_ack_at: string | null };

// 0016 §2.3: the top-level `compliance` summary — per-(client, service_group) watch
// figures + a `stale_evaluator` flag. Every field defensively nullable; an absent
// block degrades to {stale_evaluator:false, clients:[]} (the mapper never crashes).
export type ComplianceClient = {
  client_id: string | null;
  service_group: string | null;
  state: string | null;
  confirmed_included_cents: number | null;
  unknown_or_mixed_cents: number | null;
  screening_proxy_cents: number | null;
  earliest_crossing_month: string | null;
  application_due: string | null;
  future_method_status: string | null;
};
export type ReviewCompliance = { stale_evaluator: boolean; clients: ComplianceClient[] };

export type ReviewQueue = {
  watermark: string | null;
  counts: QueueCounts;
  sweep: QueueSweep;
  compliance: ReviewCompliance;
  rows: QueueRow[];
  next_cursor: { tuple: string[] } | null;
};

function toQueueRow(raw: unknown): QueueRow {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    row_kind: s(o.row_kind) ?? "draft",
    section: s(o.section) ?? "needs_review",
    sort: strArr(o.sort),
    client_id: s(o.client_id),
    counterparty_id: s(o.counterparty_id),
    filing_id: s(o.filing_id),
    entry_id: s(o.entry_id),
    question_id: s(o.question_id),
    task_id: s(o.task_id),
    document_id: s(o.document_id),
    lane: (s(o.lane) as QueueLane) ?? null,
    auto: b(o.auto),
    rule_backed: b(o.rule_backed),
    high_stakes: b(o.high_stakes),
    aged_since: s(o.aged_since),
    amount_cents: numOrNull(o.amount_cents),
    period: s(o.period),
    question_text: s(o.question_text),
    created_at: s(o.created_at),
    id: s(o.id) ?? "",
    coding_kind: s(o.coding_kind),
    watch_id: s(o.watch_id),
    tier: s(o.tier),
  };
}

function toComplianceClient(raw: unknown): ComplianceClient {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    client_id: s(o.client_id),
    service_group: s(o.service_group),
    state: s(o.state),
    confirmed_included_cents: numOrNull(o.confirmed_included_cents),
    unknown_or_mixed_cents: numOrNull(o.unknown_or_mixed_cents),
    screening_proxy_cents: numOrNull(o.screening_proxy_cents),
    earliest_crossing_month: s(o.earliest_crossing_month),
    application_due: s(o.application_due),
    future_method_status: s(o.future_method_status),
  };
}

export function toReviewQueue(raw: unknown): ReviewQueue {
  const o = (raw ?? {}) as Record<string, unknown>;
  const c = (o.counts ?? {}) as Record<string, unknown>;
  const sw = (o.sweep ?? {}) as Record<string, unknown>;
  const cur = (o.next_cursor ?? null) as Record<string, unknown> | null;
  const cursorTuple = cur ? strArr(cur.tuple) : [];
  const counts: QueueCounts = {
    ready: numOrNull(c.ready) ?? 0,
    needs_review: numOrNull(c.needs_review) ?? 0,
    needs_you: numOrNull(c.needs_you) ?? 0,
    open_drafts: numOrNull(c.open_drafts) ?? 0,
    open_questions: numOrNull(c.open_questions) ?? 0,
    open_tasks: numOrNull(c.open_tasks) ?? 0,
    compliance_watches: numOrNull(c.compliance_watches) ?? 0,
  };
  const comp = (o.compliance ?? {}) as Record<string, unknown>;
  const compliance: ReviewCompliance = {
    stale_evaluator: b(comp.stale_evaluator),
    clients: arr(comp.clients).map(toComplianceClient),
  };
  return {
    watermark: s(o.watermark),
    counts,
    sweep: { open_run: b(sw.open_run), last_finalized_at: s(sw.last_finalized_at), last_ack_at: s(sw.last_ack_at) },
    compliance,
    rows: arr(o.rows).map(toQueueRow),
    next_cursor: cursorTuple.length > 0 ? { tuple: cursorTuple } : null,
  };
}

// --- get_entry_diff (FINAL pin) -----------------------------------------------

export type EntryDiffDelta = { field: string; before: string | null; after: string | null; delta_cents: number | null };
export type EntryDiffLeg = { account_code: string | null; account_name: string | null; debit_cents: number | null; credit_cents: number | null; description: string | null };
export type EntryRevision = {
  revision_no: number | null;
  actor_kind: string | null;
  actor: string | null;
  reason: string | null;
  created_at: string | null;
  header: Record<string, unknown> | null;
  legs: EntryDiffLeg[];
  rule_decision_id: string | null;
  deltas_vs_prev: EntryDiffDelta[];
};
export type EntryDiff = { entry_id: string; revisions: EntryRevision[] };

function toLeg(raw: unknown): EntryDiffLeg {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    account_code: s(o.account_code),
    account_name: s(o.account_name),
    debit_cents: numOrNull(o.debit_cents),
    credit_cents: numOrNull(o.credit_cents),
    description: s(o.description),
  };
}

export function toEntryDiff(raw: unknown): EntryDiff {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    entry_id: s(o.entry_id) ?? "",
    revisions: arr(o.revisions).map((rraw) => {
      const r = (rraw ?? {}) as Record<string, unknown>;
      return {
        revision_no: numOrNull(r.revision_no),
        actor_kind: s(r.actor_kind),
        actor: s(r.actor),
        reason: s(r.reason),
        created_at: s(r.created_at),
        header: (r.header ?? null) as Record<string, unknown> | null,
        legs: arr(r.legs).map(toLeg),
        rule_decision_id: s(r.rule_decision_id),
        deltas_vs_prev: arr(r.deltas_vs_prev).map((draw) => {
          const d = (draw ?? {}) as Record<string, unknown>;
          return { field: s(d.field) ?? "", before: s(d.before), after: s(d.after), delta_cents: numOrNull(d.delta_cents) };
        }),
      };
    }),
  };
}

// --- get_doc_entry_diff (FINAL pin; no_region rows drive the WA-L7 marker) -----

export type DocEntryField = {
  field: string;
  doc_value: string | null;
  doc_region_id: string | null;
  doc_page: number | null;
  // PIN-ADD-2: the region's as-built document_regions.locator_kind/locator (verbatim
  // jsonb). Both OPTIONAL — the envelope may predate the fields until Lane A lands
  // them, so an absent locator degrades to page-jump + chip (today's rendering).
  doc_region_locator_kind: string | null;
  doc_region_locator: unknown;
  entry_value: string | null;
  delta_cents: number | null;
  no_region: boolean;
};
export type DocEntryDiff = { entry_id: string; document_id: string | null; fields: DocEntryField[] };

export function toDocEntryDiff(raw: unknown): DocEntryDiff {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    entry_id: s(o.entry_id) ?? "",
    document_id: s(o.document_id),
    fields: arr(o.fields).map((fraw) => {
      const f = (fraw ?? {}) as Record<string, unknown>;
      return {
        field: s(f.field) ?? "",
        doc_value: s(f.doc_value),
        doc_region_id: s(f.doc_region_id),
        doc_page: numOrNull(f.doc_page),
        doc_region_locator_kind: s(f.doc_region_locator_kind),
        doc_region_locator: f.doc_region_locator ?? null,
        entry_value: s(f.entry_value),
        delta_cents: numOrNull(f.delta_cents),
        no_region: b(f.no_region),
      };
    }),
  };
}
