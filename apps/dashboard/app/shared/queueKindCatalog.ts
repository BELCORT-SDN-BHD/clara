// The queue row_kind catalog (wave-b dashboard-lanes-plan §3.6 / F1/F2): the ONE
// dispatch table from a `list_review_queue` row_kind literal to its row title, its
// row-level accessory chip (if any), its detail-pane renderer, and a representative
// fixture. QueueRowView/QueueDetail dispatch THROUGH this catalog — no per-kind
// switch lives in either file. A row_kind with no catalog entry degrades honestly
// (FallbackDetail / the generic id-only title) rather than crashing; the
// queueKindCatalog.test.tsx parity probe asserts every literal the DEPLOYED
// `clara.list_review_queue` emits is a key here.
//
// This file (not .tsx) still builds React elements via `createElement` — no JSX
// literal syntax is needed for that, so a plain .ts module works. Doing so here
// (rather than in QueueRowView.tsx/QueueDetail.tsx) is deliberate: those two files
// need to import the catalog to dispatch through it, so the per-kind renderers must
// live upstream of both to avoid a circular import.

import { createElement, useCallback, type ReactElement, type ComponentType } from "react";
import type { QueueRow, ReviewCompliance } from "./reviewTypes";
import type { CodingLane } from "./reviewCardTypes";
import { getCodingLane } from "./reviewApi";
import { laneReasonCopy } from "./reviewCardTypes";
import { useCard } from "./cards/cardHooks";
import { shortId } from "./fmt";
import { DocReviewCard } from "./cards/DocReviewCard";
import { DiffCard } from "./cards/DiffCard";
import { OpenQuestionCard } from "./cards/OpenQuestionCard";
import { ComplianceWatchCard } from "./cards/ComplianceWatchCard";
import { tierBand, matchComplianceClient, parseServiceGroup } from "./cards/complianceWatch";
import { LintFindingCard, severityBand } from "./cards/LintFindingCard";
import queueStyles from "../queue/queue.module.css";

// --- the catalog's shape ---------------------------------------------------------

export type QueueDetailProps = {
  token: string;
  row: QueueRow;
  compliance: ReviewCompliance | null;
  onChanged: () => void;
};

export type QueueKindEntry = {
  row_kind: string;
  /** The row's title text (DIRECTION §4.3 list model). Verbatim where the DB gives
   *  a `question_text` — never a re-derived summary. */
  title: (row: QueueRow) => string;
  /** A kind-specific row accessory (a tier/severity chip today); null when the
   *  generic accessories (auto/rule/high-stakes/band/amount/period/evidence) are
   *  the whole story for this kind. */
  RowAccessory: ComponentType<{ row: QueueRow }> | null;
  /** The detail-pane renderer for this kind. */
  Detail: ComponentType<QueueDetailProps>;
  /** A representative row for tests/dev fixtures — `fixture.row_kind` always equals
   *  this entry's own catalog key. */
  fixture: QueueRow;
};

// --- fixtures ---------------------------------------------------------------------

const FIXTURE_BASE: QueueRow = {
  row_kind: "draft", section: "needs_review", sort: [],
  client_id: "c1000000-0000-4000-8000-000000000001", counterparty_id: null,
  filing_id: null, entry_id: null, question_id: null, task_id: null, document_id: null,
  lane: null, auto: false, rule_backed: false, high_stakes: false, aged_since: null,
  amount_cents: null, period: null, question_text: null, created_at: null,
  id: "fixture-row", coding_kind: null, watch_id: null, tier: null, finding_id: null,
  asset_id: null,
};

function fx(overrides: Partial<QueueRow>): QueueRow {
  return { ...FIXTURE_BASE, ...overrides };
}

const FIXTURES = {
  draft: fx({
    row_kind: "draft", id: "fixture-draft", entry_id: "e1000000-0000-4000-8000-000000000001",
    counterparty_id: "cp100000-0000-4000-8000-000000000001", lane: "needs_review", amount_cents: 150000,
  }),
  uncoded_filing: fx({
    row_kind: "uncoded_filing", id: "fixture-filing", filing_id: "f1000000-0000-4000-8000-000000000001",
    lane: "needs_review",
  }),
  open_question: fx({
    row_kind: "open_question", section: "needs_you", id: "fixture-question",
    question_id: "q1000000-0000-4000-8000-000000000001", question_text: "Which vendor is this invoice from?",
  }),
  coding_task: fx({ row_kind: "coding_task", id: "fixture-task", task_id: "t1000000-0000-4000-8000-000000000001" }),
  compliance_watch: fx({
    row_kind: "compliance_watch", section: "needs_you", id: "fixture-watch",
    watch_id: "w1000000-0000-4000-8000-000000000001", tier: "crossed",
    question_text: "SST registration threshold watch (G)",
  }),
  lint_finding: fx({
    row_kind: "lint_finding", section: "needs_you", id: "fixture-lint",
    finding_id: "l1000000-0000-4000-8000-000000000001", tier: "critical",
    question_text: "Lint: contradiction", aged_since: "2026-07-01T00:00:00Z",
  }),
  // 0041 (Wave D-a, design v2.1 §6): one row per register row with incomplete
  // particulars whose status is pending/active (disposed/superseded/unwound
  // rows never chase). Title rides the DB's placeholder description, exactly
  // like open_question/compliance_watch ride question_text (pin sheet §6).
  fixed_asset_incomplete: fx({
    row_kind: "fixed_asset_incomplete", id: "fixture-asset",
    asset_id: "a1000000-0000-4000-8000-000000000001",
    question_text: "Fixed asset (particulars pending) — 170-000 RM12,000.00",
  }),
} as const;

/** NOT a catalog key — proves the honest degrade path for a row_kind the catalog
 *  (and this build of the dashboard) does not recognise. */
export const UNKNOWN_KIND_FIXTURE: QueueRow = fx({ row_kind: "future_unknown_kind", id: "fixture-unknown" });

// --- row titles (verbatim question_text where the DB gives one) -----------------

// A literal-keyed object (not `Record<string, …>`) so dot-access below is typed
// precisely — `noUncheckedIndexedAccess` would otherwise widen every lookup to
// `… | undefined`.
const TITLES = {
  draft: (row: QueueRow) => `Draft · ${shortId(row.entry_id)}`,
  uncoded_filing: (row: QueueRow) => `Uncoded filing · ${shortId(row.filing_id)}`,
  open_question: (row: QueueRow) => row.question_text ?? "Open question",
  coding_task: (row: QueueRow) => `Coding task · ${shortId(row.task_id)}`,
  compliance_watch: (row: QueueRow) => row.question_text ?? "SST registration watch",
  // F1: the row uses the DB-authored question_text verbatim ('Lint: '||finding_kind)
  // — the plain-language mapping (findingKindCopy) is the DETAIL card's job, not the
  // row's.
  lint_finding: (row: QueueRow) => row.question_text ?? "Lint finding",
  // 0041: the DB's own placeholder description rides question_text, exactly
  // like open_question/compliance_watch above (pin sheet §6).
  fixed_asset_incomplete: (row: QueueRow) => row.question_text ?? "Fixed asset (particulars pending)",
} as const satisfies Record<string, (row: QueueRow) => string>;

/** The honest fallback title for a row_kind with no catalog entry — the id-only
 *  label QueueRowView's old switch used for its `default` branch. */
export function degradeTitle(row: QueueRow): string {
  return `${row.row_kind} · ${shortId(row.id)}`;
}

// --- row-level accessory chips (shape+label, never hue-only) ---------------------

function ComplianceTierAccessory({ row }: { row: QueueRow }): ReactElement {
  const tb = tierBand(row.tier);
  const cls = tb.tone === "alarm" ? queueStyles.bandYou : tb.tone === "warn" ? queueStyles.bandReview : "";
  return createElement("span", { className: `${queueStyles.band} ${cls ?? ""}` }, tb.label);
}

function LintSeverityAccessory({ row }: { row: QueueRow }): ReactElement {
  const sb = severityBand(row.tier);
  const cls = sb.tone === "alarm" ? queueStyles.bandYou : sb.tone === "warn" ? queueStyles.bandReview : "";
  return createElement("span", { className: `${queueStyles.band} ${cls ?? ""}` }, sb.label);
}

// --- detail-pane renderers --------------------------------------------------------

/** The honest minimal panel (coding_task's ONLY detail today, and every
 *  unrecognised/id-incomplete row's degrade). */
function FallbackPanel({ row }: { row: QueueRow }): ReactElement {
  const sub = (row.client_id ? `client ${shortId(row.client_id)}` : "")
    + (row.document_id ? ` · document ${shortId(row.document_id)}` : "")
    + (row.task_id ? ` · task ${shortId(row.task_id)}` : "");
  return createElement(
    "div", null,
    createElement("div", { className: queueStyles.sectionHeader }, `${row.row_kind.replace(/_/g, " ")} · ${shortId(row.id)}`),
    createElement("p", { className: queueStyles.muted }, sub),
    createElement("p", { className: queueStyles.detailEmpty }, "Work this item from the documents workspace — no inline detail surface yet."),
  );
}

/** The catalog-typed adapter over FallbackPanel — usable directly as a `Detail`. */
export function FallbackDetail({ row }: QueueDetailProps): ReactElement {
  return createElement(FallbackPanel, { row });
}

function DraftDetail({ token, row }: QueueDetailProps): ReactElement {
  if (!row.entry_id) return createElement(FallbackPanel, { row });
  if (row.document_id) {
    return createElement(DocReviewCard, {
      token, part: { type: "doc_review", document_id: row.document_id, entry_id: row.entry_id, client_id: row.client_id ?? "" },
    });
  }
  return createElement(DiffCard, { token, part: { type: "diff", entry_id: row.entry_id, client_id: row.client_id ?? "" } });
}

function OpenQuestionDetail({ token, row }: QueueDetailProps): ReactElement {
  if (!row.question_id) return createElement(FallbackPanel, { row });
  return createElement(OpenQuestionCard, { token, part: { type: "open_question", question_id: row.question_id, client_id: row.client_id ?? "" } });
}

function ComplianceWatchDetail({ token, row, compliance, onChanged }: QueueDetailProps): ReactElement {
  if (!row.watch_id) return createElement(FallbackPanel, { row });
  const client = compliance
    ? matchComplianceClient(compliance.clients, { clientId: row.client_id, serviceGroup: parseServiceGroup(row.question_text), tier: row.tier })
    : null;
  return createElement(ComplianceWatchCard, { token, row, client, watchId: row.watch_id, onChanged });
}

function LintFindingDetail({ token, row, onChanged }: QueueDetailProps): ReactElement {
  if (!row.finding_id) return createElement(FallbackPanel, { row });
  return createElement(LintFindingCard, { token, findingId: row.finding_id, row, onChanged });
}

/** The uncoded_filing lane summary (ported verbatim from the old QueueDetail.tsx
 *  local `LaneSummary`) — hydrates get_coding_lane and renders the DB-computed
 *  lane + reasons. An uncoded filing carries no coding_kind, so lane copy keeps the
 *  AP-loop wording (§6.2: never guess a direction). */
function LaneSummaryInner({ token, clientId, filingId }: { token: string; clientId: string; filingId: string }): ReactElement {
  const loader = useCallback((t: string): Promise<CodingLane> => getCodingLane(t, clientId, filingId), [clientId, filingId]);
  const { data, loading, err } = useCard(token, loader);
  const band = data?.lane === "ready" ? queueStyles.bandReady : data?.lane === "needs_you" ? queueStyles.bandYou : queueStyles.bandReview;
  const children: ReactElement[] = [
    createElement("div", { className: queueStyles.sectionHeader, key: "h" }, `Uncoded filing · ${shortId(filingId)}`),
  ];
  if (loading && !data) children.push(createElement("p", { className: queueStyles.muted, key: "loading" }, "Loading lane…"));
  if (data) {
    children.push(createElement("p", { key: "band" }, createElement("span", { className: `${queueStyles.band} ${band}` }, data.lane ?? "—")));
    if (data.reasons.length > 0) {
      children.push(createElement(
        "ul", { key: "reasons" },
        data.reasons.map((r, i) => createElement("li", { key: i, className: queueStyles.muted }, laneReasonCopy(r, null))),
      ));
    } else {
      children.push(createElement("p", { className: queueStyles.muted, key: "none" }, "No blocking reasons — eligible to draft."));
    }
  }
  if (err) children.push(createElement("p", { className: queueStyles.errorText, key: "err" }, err));
  return createElement("div", null, ...children);
}

function UncodedFilingDetail({ token, row }: QueueDetailProps): ReactElement {
  if (!row.client_id || !row.filing_id) return createElement(FallbackPanel, { row });
  return createElement(LaneSummaryInner, { token, clientId: row.client_id, filingId: row.filing_id });
}

/** 0041 (Wave D-a, design v2.1 §6): a LIGHT panel only — the full completion
 *  form/schedule/dispose surfaces live on the /assets workbench, not inline
 *  here (pin sheet: "Detail = a light asset panel linking to /assets"). */
function FixedAssetIncompleteDetail({ row }: QueueDetailProps): ReactElement {
  if (!row.asset_id) return createElement(FallbackPanel, { row });
  const qs = new URLSearchParams();
  if (row.client_id) qs.set("client_id", row.client_id);
  qs.set("asset_id", row.asset_id);
  const href = `/assets?${qs.toString()}`;
  return createElement(
    "div", null,
    createElement("div", { className: queueStyles.sectionHeader }, TITLES.fixed_asset_incomplete(row)),
    createElement("p", { className: queueStyles.muted }, row.client_id ? `client ${shortId(row.client_id)}` : ""),
    createElement(
      "p", { className: queueStyles.detailEmpty },
      "This asset's particulars are incomplete — complete them on the assets workbench (no inline completion form here).",
    ),
    createElement("a", { className: queueStyles.linkButton, href }, "Open in the assets workbench →"),
  );
}

// --- the catalog ------------------------------------------------------------------

/** Every row_kind `clara.list_review_queue` emits (0011 base + 0016 compliance_watch
 *  + 0017 lint_finding + 0041 fixed_asset_incomplete). The queueKindCatalog.test.tsx
 *  parity probe asserts the DEPLOYED function never emits a literal outside this set. */
export const QUEUE_KIND_CATALOG: Record<string, QueueKindEntry> = {
  draft: { row_kind: "draft", title: TITLES.draft, RowAccessory: null, Detail: DraftDetail, fixture: FIXTURES.draft },
  uncoded_filing: {
    row_kind: "uncoded_filing", title: TITLES.uncoded_filing, RowAccessory: null,
    Detail: UncodedFilingDetail, fixture: FIXTURES.uncoded_filing,
  },
  open_question: {
    row_kind: "open_question", title: TITLES.open_question, RowAccessory: null,
    Detail: OpenQuestionDetail, fixture: FIXTURES.open_question,
  },
  coding_task: { row_kind: "coding_task", title: TITLES.coding_task, RowAccessory: null, Detail: FallbackDetail, fixture: FIXTURES.coding_task },
  compliance_watch: {
    row_kind: "compliance_watch", title: TITLES.compliance_watch, RowAccessory: ComplianceTierAccessory,
    Detail: ComplianceWatchDetail, fixture: FIXTURES.compliance_watch,
  },
  lint_finding: {
    row_kind: "lint_finding", title: TITLES.lint_finding, RowAccessory: LintSeverityAccessory,
    Detail: LintFindingDetail, fixture: FIXTURES.lint_finding,
  },
  fixed_asset_incomplete: {
    row_kind: "fixed_asset_incomplete", title: TITLES.fixed_asset_incomplete, RowAccessory: null,
    Detail: FixedAssetIncompleteDetail, fixture: FIXTURES.fixed_asset_incomplete,
  },
};

export const QUEUE_KIND_KEYS: string[] = Object.keys(QUEUE_KIND_CATALOG);

/** Look up a row_kind's catalog entry — null (never a crash, never a prototype-
 *  pollution surprise on keys like `__proto__`/`constructor`) when unrecognised. */
export function catalogEntryFor(rowKind: string): QueueKindEntry | null {
  return Object.prototype.hasOwnProperty.call(QUEUE_KIND_CATALOG, rowKind)
    ? QUEUE_KIND_CATALOG[rowKind]!
    : null;
}
