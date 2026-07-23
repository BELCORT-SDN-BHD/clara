"use client";

// The `lint_finding` card (0017 L1/P18 / wave-b dashboard-lanes-plan §3.6 F1/F16): a
// first-class wiki/opening-consistency finding. Identifier-only; hydrates
// get_lint_finding on mount and after every action (useCard discipline — the
// ComplianceWatchCard/OpenQuestionCard precedent). `finding_kind` maps to plain-
// language copy; every figure/delta the card shows is a DB-owned value out of
// `detail`/`figures` — this file only SELECTS and LABELS, never computes one.
// Resolve is bookkeeper+ (0017 resolve_lint_finding): a typed conclusion + a
// mandatory note, a fresh op_key per call. Structured wiki citations (IF the
// finding's `detail` carries a `citations` array — no shipped finding_kind emits
// one yet) render as layered-disclosure chips; a memo/dedupe_key is NEVER parsed.

import { useCallback, useState } from "react";
import type { QueueRow, LintFinding, LintFindingEvent } from "../reviewTypes";
import { getLintFinding, resolveLintFinding } from "../reviewApi";
import { useCard, type Clr } from "./cardHooks";
import { fmtCents, fmtDeltaCents, shortId } from "../fmt";
import styles from "./cards.module.css";

// --- pure helpers (exported for LintFindingCard.test.tsx) -----------------------

/** finding_kind → plain-language copy (0017's 8 kinds); an unknown future kind
 *  degrades to its own spaced-out text, never a raw crash. */
export const FINDING_KIND_COPY: Record<string, string> = {
  contradiction: "Two wiki pages contradict each other",
  stale_claim: "A wiki claim has gone stale",
  orphan_page: "A wiki page has no citations left",
  cap_pages: "This client wiki is nearing its page cap",
  cap_page_size: "A wiki page is nearing its size cap",
  wiki_synthesis_held: "Wiki synthesis is being held back",
  opening_tb_tie_broken: "The opening trial balance no longer ties",
  opening_doc_unfiled: "An opening tie document was never filed",
};

export function findingKindCopy(kind: string): string {
  return FINDING_KIND_COPY[kind] ?? kind.replace(/_/g, " ");
}

export type SeverityTone = "alarm" | "warn" | "neutral";

/** severity → chip label + tone (shape+label, never hue-only — the tierBand
 *  precedent). Shared with queueKindCatalog's row-level severity chip. */
export function severityBand(severity: string | null): { label: string; tone: SeverityTone } {
  switch (severity) {
    case "critical": return { label: "critical", tone: "alarm" };
    case "warn": return { label: "warn", tone: "warn" };
    case "info": return { label: "info", tone: "neutral" };
    default: return { label: severity ?? "finding", tone: "neutral" };
  }
}

export function isTerminalFinding(state: string | null): boolean {
  return state === "resolved" || state === "superseded";
}

export const RESOLVE_CONCLUSIONS = ["corrected", "accepted_revision", "false_positive", "superseded_by_edit"] as const;
export type ResolveConclusionOpt = (typeof RESOLVE_CONCLUSIONS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDetailValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (key.endsWith("_cents")) return key === "obe_net_cents" ? fmtDeltaCents(v) : fmtCents(v);
    return v.toLocaleString("en-MY");
  }
  if (typeof v === "string") return UUID_RE.test(v) ? shortId(v) : v;
  if (typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** Every `detail` key (except the specially-rendered `deltas`/`citations` arrays)
 *  as a label+value row — a cents-suffixed key renders via fmtCents (a signed
 *  `obe_net_cents` via fmtDeltaCents); a UUID-shaped string shortens for display
 *  (still the DB's own value, just truncated — the shortId house idiom); anything
 *  else renders as its verbatim value. Never a computed figure. */
export function figureRows(detail: Record<string, unknown>): { label: string; value: string }[] {
  const skip = new Set(["deltas", "citations"]);
  return Object.entries(detail)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => ({ label: k.replace(/_/g, " "), value: formatDetailValue(k, v) }));
}

export type DeltaRow = {
  account_code: string | null; target_debit: number | null; target_credit: number | null;
  actual_debit: number | null; actual_credit: number | null; delta_debit: number | null; delta_credit: number | null;
};

/** The opening_tb_tie_broken `detail.deltas` array (0017 `_opening_seed_deltas`
 *  shape) — defensive: a missing/malformed array degrades to []. */
export function deltaRows(detail: Record<string, unknown>): DeltaRow[] {
  const raw = detail.deltas;
  if (!Array.isArray(raw)) return [];
  const n = (x: unknown) => (typeof x === "number" ? x : null);
  return raw.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return {
      account_code: typeof o.account_code === "string" ? o.account_code : null,
      target_debit: n(o.target_debit), target_credit: n(o.target_credit),
      actual_debit: n(o.actual_debit), actual_credit: n(o.actual_credit),
      delta_debit: n(o.delta_debit), delta_credit: n(o.delta_credit),
    };
  });
}

export type CitationChip = { key: string; label: string; raw: Record<string, unknown> };

/** Structured wiki citations, IF the finding's `detail` carries a `citations` array
 *  (F16: scoped to STRUCTURED citations — never a parsed memo/dedupe_key). No
 *  shipped finding_kind emits one today; a missing/malformed array degrades to []
 *  — this is a forward-defensive render path, not a live one. */
export function citationChips(detail: Record<string, unknown>): CitationChip[] {
  const raw = detail.citations;
  if (!Array.isArray(raw)) return [];
  return raw.map((c, i) => {
    const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const bits = [o.subject_key, o.source_at, o.page_id].filter((x): x is string => typeof x === "string");
    return { key: String(i), label: bits.length > 0 ? bits.join(" · ") : `citation ${i + 1}`, raw: o };
  });
}

const EVENT_KIND_COPY: Record<string, string> = {
  created: "opened", superseded: "superseded", resolved: "resolved",
  recheck_opened: "reopened (recheck)", evaluation: "re-evaluated",
};
export function eventKindCopy(kind: string): string {
  return EVENT_KIND_COPY[kind] ?? kind.replace(/_/g, " ");
}

// --- the card --------------------------------------------------------------------

// Layered disclosure (F16 / the research digest's Perplexity precedent): a compact
// chip that expands inline to the raw structured fields on click. renderToStatic
// tests can only assert the collapsed state (no event simulation) — see the test
// file's comment.
function CitationChipRow({ chip }: { chip: CitationChip }) {
  const [open, setOpen] = useState(false);
  return (
    <span>
      <button type="button" className={styles.regionButton} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {chip.label}
      </button>
      {open ? <span className={styles.muted}> {JSON.stringify(chip.raw)}</span> : null}
    </span>
  );
}

// Pure, prop-driven render (the ComplianceWatchCard precedent — testable via
// renderToStaticMarkup with no network, exactly like that card's `client` prop).
// `LintFindingCard` below is the thin hydrating wrapper the queueKindCatalog uses.
export function LintFindingCardView({ findingId, row, finding, events, loading, loaded, busy, err, clr, onResolve }: {
  findingId: string;
  row: QueueRow | null;
  finding: LintFinding | null;
  events: LintFindingEvent[];
  loading: boolean;
  /** True once the hydrate has resolved at least once (whether or not a finding
   *  was found) — distinguishes "still loading" from "loaded, and there's nothing
   *  there" so the not-found state never flashes before the first load settles. */
  loaded: boolean;
  busy: boolean;
  err: string | null;
  clr: Clr;
  onResolve: (conclusion: ResolveConclusionOpt, note: string) => void;
}) {
  const [conclusion, setConclusion] = useState<ResolveConclusionOpt>("corrected");
  const [note, setNote] = useState("");
  const sb = severityBand(finding?.severity ?? row?.tier ?? null);
  const toneCls = sb.tone === "alarm" ? styles.bandYou : sb.tone === "warn" ? styles.bandReview : "";
  const terminal = isTerminalFinding(finding?.state ?? null);
  const kind = finding?.finding_kind ?? "";
  const figs = finding ? figureRows(finding.detail) : [];
  const deltas = finding ? deltaRows(finding.detail) : [];
  const chips = finding ? citationChips(finding.detail) : [];

  return (
    <div className={`${styles.card} ${terminal ? styles.terminal : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Lint finding</span>
        <span className={styles.idChip}>{shortId(findingId)}</span>
        <span className={`${styles.band} ${toneCls ?? ""}`}>{sb.label}</span>
        {finding?.state ? <span className={styles.badge}>{finding.state}</span> : null}
      </div>

      {loading && !loaded ? <p className={styles.loadingState}>Loading finding…</p> : null}

      <p className={styles.questionText}>{kind ? findingKindCopy(kind) : (row?.question_text ?? "Lint finding")}</p>
      <p className={styles.muted}>
        {finding?.opened_at ? `opened ${new Date(finding.opened_at).toLocaleString()}` : ""}
        {finding?.page_id ? ` · wiki page ${shortId(finding.page_id)}` : ""}
        {finding?.seed_id ? ` · opening seed ${shortId(finding.seed_id)}` : ""}
      </p>
      {finding?.prior_finding_id ? <p className={styles.muted}>recheck of a prior finding · {shortId(finding.prior_finding_id)}</p> : null}
      {loaded && !loading && !finding ? <p className={styles.emptyState}>This finding could not be found — it may belong to a different firm.</p> : null}

      {figs.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              {figs.map((f, i) => <tr key={i}><td>{f.label}</td><td className={styles.num}>{f.value}</td></tr>)}
            </tbody>
          </table>
        </div>
      ) : null}

      {deltas.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Opening deltas vs target</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>account</th><th className={styles.num}>target dr</th><th className={styles.num}>target cr</th>
                  <th className={styles.num}>actual dr</th><th className={styles.num}>actual cr</th>
                  <th className={styles.num}>Δ dr</th><th className={styles.num}>Δ cr</th>
                </tr>
              </thead>
              <tbody>
                {deltas.map((d, i) => (
                  <tr key={i}>
                    <td>{d.account_code ?? "—"}</td>
                    <td className={styles.num}>{fmtCents(d.target_debit)}</td>
                    <td className={styles.num}>{fmtCents(d.target_credit)}</td>
                    <td className={styles.num}>{fmtCents(d.actual_debit)}</td>
                    <td className={styles.num}>{fmtCents(d.actual_credit)}</td>
                    <td className={styles.num}>{fmtDeltaCents(d.delta_debit)}</td>
                    <td className={styles.num}>{fmtDeltaCents(d.delta_credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Wiki citations</p>
          <div className={styles.evidenceList}>
            {chips.map((c) => <CitationChipRow key={c.key} chip={c} />)}
          </div>
        </div>
      ) : null}

      {events.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Episode lifecycle</p>
          <ul className={styles.evidenceList}>
            {events.map((e) => (
              <li key={e.id} className={styles.evidenceRow}>
                <span className={styles.muted}>{e.created_at ? new Date(e.created_at).toLocaleString() : "—"}</span>
                <span>{eventKindCopy(e.event_kind)}</span>
                {e.state_before || e.state_after ? <span className={styles.muted}>({e.state_before ?? "∅"} → {e.state_after ?? "∅"})</span> : null}
                {e.rationale ? <span className={styles.muted}>— {e.rationale}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {terminal ? (
        <p className={styles.okText}>
          {finding?.state === "resolved"
            ? `Resolved: ${finding.resolved_conclusion ? finding.resolved_conclusion.replace(/_/g, " ") : "—"}${finding.resolved_note ? ` — ${finding.resolved_note}` : ""}`
            : "Superseded — the condition it tracked is no longer present."}
        </p>
      ) : finding ? (
        <div className={styles.section}>
          <div className={styles.actions}>
            <select className={styles.input} aria-label="Resolution conclusion" value={conclusion} onChange={(e) => setConclusion(e.target.value as ResolveConclusionOpt)}>
              <option value="corrected">corrected</option>
              <option value="accepted_revision">accepted revision</option>
              <option value="false_positive">false positive</option>
              <option value="superseded_by_edit">superseded by edit</option>
            </select>
            <input className={styles.reasonInput} aria-label="Resolution note" placeholder="Note (required)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className={styles.button} disabled={busy || !note.trim()} onClick={() => { onResolve(conclusion, note.trim()); setNote(""); }}>
              {busy ? "Working…" : "Resolve"}
            </button>
          </div>
          <p className={styles.hint}>Resolving is a bookkeeper+ act — pick the conclusion that actually happened; the note is kept verbatim on the record.</p>
        </div>
      ) : null}

      {clr ? <p className={styles.refusalNote}><span className={styles.refusalBadge}>{clr.code}{clr.reason ? ` · ${clr.reason}` : ""}</span></p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}

// The hydrating wrapper — this is what queueKindCatalog.ts renders. Hydrates
// get_lint_finding on mount and after every action (useCard discipline); resolve is
// bookkeeper+ via resolve_lint_finding with a fresh op_key per call.
export function LintFindingCard({ token, findingId, row, onChanged }: {
  token: string | null;
  findingId: string;
  row: QueueRow | null;
  onChanged: () => void;
}) {
  const loader = useCallback((t: string) => getLintFinding(t, findingId), [findingId]);
  const { data, loading, busy, err, clr, act } = useCard(token, loader);

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Lint finding</span><span className={styles.idChip}>{shortId(findingId)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load this finding.</p>
      </div>
    );
  }

  return (
    <LintFindingCardView
      findingId={findingId}
      row={row}
      finding={data?.finding ?? null}
      events={data?.events ?? []}
      loading={loading}
      loaded={data !== null}
      busy={busy}
      err={err}
      clr={clr}
      onResolve={(conclusion, note) => {
        void act(() => resolveLintFinding(token, findingId, conclusion, note), onChanged);
      }}
    />
  );
}
