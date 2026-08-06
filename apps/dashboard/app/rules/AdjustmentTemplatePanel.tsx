"use client";

// The AdjustmentTemplatePanel — recurring/reversing adjustment templates on
// /rules (Wave D-b, design `wave-d-b-design.md` §2, rulings WDB-G1..G4/G13;
// the builder ABI `wave-d-b-design-abi.md` §A/§C/§F). Plumbing-grade,
// consistent with AutopostRulePanel: dev auth is the page's own pasted
// session JWT; lists a client's templates, offers sign (admin+) / retire
// (bookkeeper+/admin+, both via the DB's own role floor — this UI does not
// gate on a local role guess) / a human-author propose form, and surfaces
// the due/blocked state from `adjustment_run_due` per template. The agent
// NEVER signs; the signature is the posting authority. Every amount is
// DB-owned — lines carry typed cents the CALLER supplies (the DB validates
// balance/eligibility, never this UI).

import { useCallback, useEffect, useState } from "react";
import {
  listAdjustmentTemplates, listAdjustmentRuns, adjustmentRunDue, proposeAdjustmentTemplate,
  signAdjustmentTemplate, retireAdjustmentTemplate, runAdjustmentManual,
} from "../shared/adjustmentApi";
import type { AdjustmentTemplateWarning } from "../shared/adjustmentApi";
import {
  canSignTemplate, canRetireTemplate, blockedReasonLabel, templateLinesBalance,
  latestRunForTemplate, readAdvisory, advisoryUnavailable, templateBlockState, templateDueState,
  predecessorOf, retiredTemplates, proposeWarningAxisLabel, proposeRefusalLabel,
  type Advisory, type AdjustmentTemplateRow, type AdjustmentTemplateLine, type AdjustmentCadence,
  type AdjustmentRunDue, type AdjustmentRunRow, type ListAdjustmentTemplatesRead,
  type ListAdjustmentRunsRead,
} from "./adjustmentModel";
import type { PgrestError } from "../shared/wire";
import { fmtCents, fmtDeltaCents, shortId } from "../shared/fmt";
import styles from "./rules.module.css";

export function AdjustmentTemplatePanel({ token, clientId }: { token: string; clientId: string }) {
  const [read, setRead] = useState<ListAdjustmentTemplatesRead | null>(null);
  const [due, setDue] = useState<Advisory<AdjustmentRunDue>>(advisoryUnavailable(null));
  const [runs, setRuns] = useState<Advisory<ListAdjustmentRunsRead>>(advisoryUnavailable(null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The template LIST is the load-bearing read; the due advisory and the run
      // receipts are decoration, so a failure in either must not blank the panel.
      //
      // [round-3 fix] "must not blank the panel" is NOT "must be swallowed". Both
      // advisories used to be `.catch(() => null)`, which rendered every template
      // as un-blocked, never-due and never-run — a confident wrong answer about
      // whether the sweep is stuck. `readAdvisory` keeps the panel alive AND
      // keeps the failure visible, and it catches the second failure mode too:
      // a well-formed promise that resolves to a WRONG-SHAPED envelope
      // (`available === false`), which `r?.runs ?? []` also collapsed to "never
      // run".
      const [t, d, r] = await Promise.all([
        listAdjustmentTemplates(token, clientId),
        readAdvisory(adjustmentRunDue(token, clientId), (v) => v.available),
        readAdvisory(listAdjustmentRuns(token, clientId), (v) => v.available),
      ]);
      setRead(t);
      setDue(d);
      setRuns(r);
    } catch (e) {
      setError((e as PgrestError).message ?? String(e));
      setRead(null);
    } finally {
      setLoading(false);
    }
  }, [token, clientId]);

  useEffect(() => { void load(); }, [load]);

  const list = read?.templates ?? [];

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>
        Adjustment templates (recurring / reversing)
        {read?.live_count ? <span className={styles.badge}>{read.live_count} live</span> : null}
      </p>
      {error ? <p className={styles.banner}>Could not load adjustment templates: {error}. The 0045 fns may not be deployed yet.</p> : null}
      {loading && !read ? <p className={styles.muted}>Loading adjustment templates…</p> : null}
      {read && !read.available ? (
        <p className={styles.banner}>
          The template registry came back in an unexpected shape — showing nothing rather than an
          empty list, because an empty list would read as &ldquo;this client has no templates&rdquo;.
        </p>
      ) : null}
      {read?.available && list.length === 0 && !loading ? <p className={styles.muted}>No adjustment templates for this client yet. Propose one, then an admin signs it live.</p> : null}

      {read ? <AdvisoryBanners due={due} runs={runs} /> : null}

      <div className={styles.ruleList}>
        {list.map((t) => (
          <TemplateRow
            key={t.template_id} token={token} clientId={clientId} template={t} due={due}
            runsAvailable={runs.available}
            lastRun={runs.value ? latestRunForTemplate(runs.value.runs, t.template_id) : null}
            predecessor={predecessorOf(list, t)}
            onChanged={() => void load()}
          />
        ))}
      </div>

      <ProposeTemplateForm token={token} clientId={clientId} templates={list} onProposed={() => void load()} />
    </div>
  );
}

/** [round-3 fix] The advisories announce their OWN failure. Silence here used to
 *  mean "nothing is due, nothing is blocked, nothing has ever run" — the reading
 *  most likely to hide a stuck sweep. EXPORTED so both banners can be rendered
 *  and asserted without driving the panel's network effects.
 *
 *  [round-8 F3] A well-formed `due:false` answer is not ONE fact — the DB's own
 *  top-level `reason` distinguishes 'nothing_due' (ordinary, quiet, no banner
 *  needed) from 'all_blocked' (every live template is stuck; the sweep can never
 *  clear it unassisted, the same operationally-different fact reconciler-
 *  adjustments.mjs's `adjBlockedClients` counts on the runtime side). Rendering
 *  both as silence is the ABI as-built note this fix closes: they are different
 *  facts and the header must say so. */
export function AdvisoryBanners({
  due, runs,
}: { due: Advisory<AdjustmentRunDue>; runs: Advisory<ListAdjustmentRunsRead> }) {
  return (
    <>
      {!due.available ? (
        <p className={styles.banner}>
          The due/blocked advisory (`adjustment_run_due`) is UNAVAILABLE{due.error ? `: ${due.error}` : ""}. No
          template below can be shown as due or as blocked — that is unknown, not clear.
        </p>
      ) : null}
      {due.available && due.value?.reason === "all_blocked" ? (
        <p className={styles.banner}>
          Every live template is blocked — the sweep has nothing it CAN run until at least one
          blocking reason below clears. This is different from &ldquo;nothing due&rdquo;: templates
          exist and are stuck, not merely caught up.
        </p>
      ) : null}
      {!runs.available ? (
        <p className={styles.banner}>
          The run receipts (`list_adjustment_runs`) are UNAVAILABLE{runs.error ? `: ${runs.error}` : ""}. &ldquo;Last
          run&rdquo; below is unknown for every template — not &ldquo;never run&rdquo;.
        </p>
      ) : null}
    </>
  );
}

/** [round-11 W2 finding 3] The propose receipt's ADVISORY warnings, on a pixel.
 *
 *  THE DEFECT: `ProposeTemplateForm` awaited the receipt and threw it away, setting only
 *  "Proposed — an admin must sign it before it runs." The DB measures the collision the
 *  professional is about to sign off on — in the propose-BEFORE-retire order, the natural
 *  one, it hands back the single pre-run warning that exists — and no pixel carried it, so
 *  the doubling DECISION was made with its mitigation invisible. The run gate stays
 *  fail-closed either way; what was lost is the only advisory built to stop the decision.
 *
 *  Rendered with the AdvisoryBanners idiom this file already uses (`styles.banner`, one
 *  paragraph per fact) rather than a second banner grammar. Every field is the DB's own —
 *  the axis label is a KIND label, the sentence beneath it is `message` verbatim. An axis
 *  this build does not know still renders, keyed by its own token. */
export function ProposeWarningBanners({ warnings, moment = "propose" }: {
  warnings: readonly AdjustmentTemplateWarning[];
  /** [round-12] WHICH DOOR RAISED THEM. The DB re-asks the same advisory at SIGN, and the
   *  two moments need different sentences: at propose the reader still has a signature to
   *  withhold, at sign the template is already live and the remaining acts are retire /
   *  correct. Defaults to "propose" so the existing call site is unchanged. */
  moment?: "propose" | "sign";
}) {
  if (warnings.length === 0) return null;
  return (
    <>
      <p className={styles.hint}>
        {moment === "sign" ? (
          <>
            It is now LIVE — the DB raised {warnings.length} advisor{warnings.length === 1 ? "y" : "ies"} at signing.
            Nothing has posted yet: weigh {warnings.length === 1 ? "it" : "them"} before the sweep runs, and retire or correct rather than letting a period book twice.
          </>
        ) : (
          <>
            The proposal was ADMITTED — the DB raised {warnings.length} advisor{warnings.length === 1 ? "y" : "ies"} about it.
            An admin must weigh {warnings.length === 1 ? "it" : "them"} before signing; signing is what makes it post.
          </>
        )}
      </p>
      {warnings.map((w, i) => (
        <p className={styles.banner} key={`${w.axis}-${i}`}>
          <strong>{proposeWarningAxisLabel(w.axis)}</strong>
          {w.name ? <> · {w.name}{w.status ? ` (${w.status})` : ""}</> : null}
          {typeof w.standing_charges === "number" ? <> · {w.standing_charges} standing charge{w.standing_charges === 1 ? "" : "s"}</> : null}
          {w.first_period || w.last_period ? <> · {w.first_period ?? "—"} → {w.last_period ?? "—"}</> : null}
          {w.colliding_elements?.length ? <> · {w.colliding_elements.join(" ")}</> : null}
          <br />
          {w.message}
        </p>
      ))}
    </>
  );
}

export function TemplateRow({
  token, clientId, template, due, runsAvailable, lastRun, predecessor, onChanged,
}: {
  token: string; clientId: string; template: AdjustmentTemplateRow;
  due: Advisory<AdjustmentRunDue>; runsAvailable: boolean;
  lastRun: AdjustmentRunRow | null;
  /** [round-11 XP2] The row this template DECLARES it replaces, already resolved out of
   *  the client's own list by the panel — null both when nothing is declared and when the
   *  declared id is not in the list, which the render tells apart. */
  predecessor: AdjustmentTemplateRow | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [retireReason, setRetireReason] = useState("");
  /** [round-12] The SIGN receipt's advisories. sign_adjustment_template re-asks the
   *  period-overlap question at the last human moment and the wrapper used to return void —
   *  which is exactly how a DB advisory reaches zero pixels. Kept per row, cleared by the
   *  reload the act triggers. */
  const [signWarnings, setSignWarnings] = useState<AdjustmentTemplateWarning[]>([]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      const pe = e as PgrestError;
      setErr(`${pe.message ?? String(e)}${pe.reason ? ` — ${pe.reason}` : ""}`);
    } finally {
      setBusy(false);
    }
  };

  const dueState = templateDueState(template.template_id, due);
  const isDue = dueState === "due";
  const blockState = templateBlockState(template.template_id, due);
  const oracle = due.value;
  const band = template.status === "live" ? styles.bandReady : template.status === "proposed" ? styles.bandReview : styles.bandTerminal;

  return (
    <div className={`${styles.rule} ${template.status === "retired" ? styles.terminal : ""}`}>
      <div className={styles.ruleHead}>
        <span className={styles.ruleTitle}>{template.name}</span>
        <span className={styles.idChip}>{shortId(template.template_id)}</span>
        <span className={styles.badge}>{template.cadence}</span>
        {template.auto_reverse ? <span className={styles.badge}>auto-reverse</span> : null}
        <span className={`${styles.band} ${band}`}>{template.status}</span>
        {isDue ? <span className={styles.staleBadge}>due</span> : null}
        {dueState === "unknown" ? <span className={styles.badge} title="adjustment_run_due could not be read">due? unknown</span> : null}
      </div>

      <div className={styles.bounds}>
        <span className={styles.bound}>{template.start_date ?? "—"} → {template.end_date ?? "no end"}</span>
        <span className={styles.bound}>{template.lines.length} line{template.lines.length === 1 ? "" : "s"}</span>
        {template.signed_by ? <span className={styles.bound}>signed by {shortId(template.signed_by)}</span> : null}
        {/* [round-11 XP2] THE LINEAGE, ON A PIXEL. A declaration is what turns the DB's
            period prohibition on for this template, so a reader who cannot see it cannot
            explain why the row is blocked. The two null cases are NOT the same fact and do
            not render the same: nothing declared prints nothing at all, while a declared id
            this client's list cannot name still prints the id — a lineage we cannot resolve
            is exactly the state a reader most needs told about. */}
        {template.replaces_template_id ? (
          <span className={styles.bound} title={template.replaces_template_id}>
            replaces {predecessor ? `«${predecessor.name}» (${predecessor.status})` : shortId(template.replaces_template_id)}
          </span>
        ) : null}
      </div>

      {blockState.state === "unknown" ? (
        <p className={styles.hint}>
          Blocked? <strong>unknown</strong> — the due/blocked advisory could not be read for this client, so this
          row cannot say whether the sweep is stuck on this template. It is NOT a clean bill of health.
        </p>
      ) : null}
      {blockState.state === "blocked" ? (
        <p className={styles.hint}>
          Blocked: {blockedReasonLabel(blockState.blocked.reason)}
          {/* THE REMEDY MUST BE REACHABLE, not merely named: blocked[]'s transient
              reason tells the reader to approve or withdraw "the draft", so the row
              names WHICH draft — the DB's own `occurrence_draft_entry_id`. */}
          {template.occurrence_draft_entry_id ? (
            <> — the outstanding draft is entry <span className={styles.idChip} title={template.occurrence_draft_entry_id}>{shortId(template.occurrence_draft_entry_id)}</span>; approve or withdraw it in the review queue.</>
          ) : null}
        </p>
      ) : null}
      {template.status === "retired" ? <p className={styles.muted}>retired{template.retired_reason ? `: ${template.retired_reason}` : ""}.</p> : null}

      {/* The last run receipt for this template — DB-owned amount and mode, rendered
          verbatim (list_adjustment_runs returns newest period first, so this is the
          head of that list, never a client-side sort). */}
      {!runsAvailable ? (
        <p className={styles.hint}>last run <strong>unknown</strong> — the run receipts could not be read.</p>
      ) : lastRun ? (
        <p className={styles.muted}>
          last run {lastRun.period_start ?? "—"} → {lastRun.period_end ?? "—"} · {lastRun.mode} · {fmtCents(lastRun.amount_cents)}
          {lastRun.reversal_entry_id ? " · auto-reversed" : ""}
        </p>
      ) : (
        <p className={styles.muted}>no run receipt for this template yet.</p>
      )}

      {(canSignTemplate(template) || canRetireTemplate(template) || isDue) ? (
        <div className={styles.actions}>
          {/* RUN THIS PERIOD — the human twin of the sweep (run_adjustment_manual,
              bookkeeper+). The period is the DB's OWN oldest-unmet answer from
              adjustment_run_due; this panel never derives a period, and the button
              only exists while the oracle is naming one for THIS template. `mode`
              (post vs draft) is decided in-verb, never sent from here. */}
          {isDue && oracle?.period_start && oracle?.period_end ? (
            <button
              className={styles.button}
              disabled={busy}
              onClick={() => void run(() => runAdjustmentManual(token, clientId, template.template_id, oracle.period_start as string, oracle.period_end as string))}
            >
              {busy ? "Working…" : `Run ${oracle.period_start} → ${oracle.period_end}`}
            </button>
          ) : null}
          {canSignTemplate(template) ? (
            <button className={styles.button} disabled={busy} onClick={() => void run(async () => {
              const receipt = await signAdjustmentTemplate(token, clientId, template.template_id);
              setSignWarnings(receipt.warnings);
            })}>
              {busy ? "Working…" : "Sign — make live (admin+)"}
            </button>
          ) : null}
          {canRetireTemplate(template) ? (
            <>
              <input className={styles.reasonInput} aria-label={`Retire reason for ${template.name}`} placeholder="Retire reason" value={retireReason} onChange={(e) => setRetireReason(e.target.value)} />
              <button
                className={styles.buttonSecondary}
                disabled={busy || !retireReason.trim()}
                onClick={() => void run(() => retireAdjustmentTemplate(token, clientId, template.template_id, retireReason.trim()))}
              >
                Retire
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
      <ProposeWarningBanners warnings={signWarnings} moment="sign" />
    </div>
  );
}

const EMPTY_LINE: AdjustmentTemplateLine = { account_code: "", debit_cents: 0, credit_cents: 0, description: "" };

/** A compact human-author proposal (bookkeeper+ — only admin+ signs, mirroring
 *  /rules' own autopost ProposeForm). Lines are ≥2 rows, exactly one of
 *  debit/credit positive per row (ABI §C) — cents are typed integers this
 *  form sends directly (never a raw-string cap like the autopost proposal;
 *  there is no DB-side normalization step for template lines). */
function ProposeTemplateForm({
  token, clientId, templates, onProposed,
}: { token: string; clientId: string; templates: readonly AdjustmentTemplateRow[]; onProposed: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgIsRefusal, setMsgIsRefusal] = useState(false);
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<AdjustmentCadence>("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [autoReverse, setAutoReverse] = useState(true);
  const [memoTemplate, setMemoTemplate] = useState("");
  const [lines, setLines] = useState<AdjustmentTemplateLine[]>([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
  /** "" is REPLACES NOTHING — the explicit default, not an absence. */
  const [replaces, setReplaces] = useState("");
  /** The propose receipt's advisories, held until the next submit so the reader can act on
   *  them after `onProposed()` reloads the list underneath the form. */
  const [warnings, setWarnings] = useState<AdjustmentTemplateWarning[]>([]);
  const predecessorChoices = retiredTemplates(templates);

  const preview = templateLinesBalance(lines);

  const setLine = (i: number, patch: Partial<AdjustmentTemplateLine>) => {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((ls) => [...ls, { ...EMPTY_LINE }]);
  const removeLine = (i: number) => setLines((ls) => (ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls));

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    setMsgIsRefusal(false);
    setWarnings([]);
    try {
      // [round-11 W2 finding 3] The receipt is READ, not discarded — its advisories are the
      // only pre-run warning the DB emits, and they exist to reach the human deciding
      // whether to sign.
      const receipt = await proposeAdjustmentTemplate(token, {
        clientId, name: name.trim(), cadence, startDate, endDate: endDate || null,
        autoReverse, lines, memoTemplate: memoTemplate.trim(), replaces: replaces || null,
      });
      setWarnings(receipt.warnings);
      setMsg("Proposed — an admin must sign it before it runs.");
      onProposed();
      setName(""); setStartDate(""); setEndDate(""); setMemoTemplate(""); setReplaces("");
      setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
    } catch (e) {
      const pe = e as PgrestError;
      // [round-11 XP2] A lineage refusal is named and glossed, not left as a bare PostgREST
      // line: the four `template_replaces_*` tokens each have a different act behind them,
      // and a reader who sees only "propose_adjustment_template failed (400)" cannot pick it.
      const named = proposeRefusalLabel(pe.reason ?? null);
      setMsg(`${pe.message ?? String(e)}${pe.reason ? ` — ${pe.reason}` : ""}${named ? `: ${named}` : ""}`);
      setMsgIsRefusal(true);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return <button className={styles.linkButton} onClick={() => setOpen(true)}>+ Propose an adjustment template</button>;
  return (
    <div className={styles.propose}>
      <p className={styles.sectionTitle}>Propose an adjustment template (bookkeeper+ — an admin signs)</p>
      <div className={styles.proposeGrid}>
        <input className={styles.input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name" />
        <select className={styles.input} value={cadence} onChange={(e) => setCadence(e.target.value as AdjustmentCadence)} aria-label="Cadence">
          <option value="monthly">monthly</option>
          <option value="annual">annual</option>
        </select>
        <input type="date" className={styles.input} value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Start date (cadence period-start)" />
        <input type="date" className={styles.input} value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="End date (cadence period-end, optional)" />
        <input className={styles.input} placeholder="Memo template" value={memoTemplate} onChange={(e) => setMemoTemplate(e.target.value)} aria-label="Memo template" />
      </div>
      <label className={styles.field} style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem", marginTop: "0.3rem" }}>
        <input type="checkbox" checked={autoReverse} onChange={(e) => setAutoReverse(e.target.checked)} aria-label="Auto-reverse next period" />
        <span>Auto-reverse next period (WDB-G1 — dated day 1, one act births the pair)</span>
      </label>

      {/* ═══ [round-11 XP2] DECLARE THE PREDECESSOR ═══
          Editing a recurring template is retire + re-propose (WDB-G13), which mints a NEW
          id — so without a declaration the DB cannot tell a replacement from an unrelated
          new template, and the whole P1 lineage build (the period prohibition, the
          replaced-generation grammar, the third propose advisory) never engages. Before
          this control existed nothing in the product sent `p_replaces` at all.

          The picker offers RETIRED templates only, and that is a correctness constraint
          rather than a filter: the DB refuses a live predecessor by name
          (`template_replaces_not_retired`), so offering one would put a walled corridor
          back on the very form this round is un-walling. "Replaces nothing" is the
          explicit default — a blank is a decision here, not an omission. */}
      <label className={styles.field} style={{ marginTop: "0.4rem" }}>
        <span className={styles.fieldLabel}>Replaces (predecessor)</span>
        <select
          className={styles.input} value={replaces} onChange={(e) => setReplaces(e.target.value)}
          aria-label="Predecessor this template replaces"
          disabled={predecessorChoices.length === 0}
        >
          <option value="">— replaces nothing —</option>
          {predecessorChoices.map((t) => (
            <option key={t.template_id} value={t.template_id}>{t.name} · {shortId(t.template_id)}</option>
          ))}
        </select>
      </label>
      <p className={styles.hint}>
        {predecessorChoices.length === 0
          ? "This client has no RETIRED template to replace. A LIVE one cannot be declared — the DB refuses it (`template_replaces_not_retired`) — so retire the template you are replacing first, then propose this one."
          : "Declaring the template this one replaces is what lets the DB measure the periods that generation already charged, instead of leaving the overlap to be discovered as a doubled figure."}
      </p>

      <p className={styles.sectionTitle} style={{ marginTop: "0.5rem" }}>Lines (≥2, exactly one of debit/credit per row, Σdebit=Σcredit)</p>
      {lines.map((l, i) => (
        <div className={styles.proposeGrid} key={i}>
          <input className={styles.input} placeholder="Account code" value={l.account_code} onChange={(e) => setLine(i, { account_code: e.target.value })} aria-label={`Line ${i + 1} account code`} />
          <input className={styles.input} placeholder="Debit cents" value={l.debit_cents || ""} onChange={(e) => setLine(i, { debit_cents: Number(e.target.value) || 0, credit_cents: 0 })} aria-label={`Line ${i + 1} debit cents`} />
          <input className={styles.input} placeholder="Credit cents" value={l.credit_cents || ""} onChange={(e) => setLine(i, { credit_cents: Number(e.target.value) || 0, debit_cents: 0 })} aria-label={`Line ${i + 1} credit cents`} />
          <input className={styles.input} placeholder="Description" value={l.description ?? ""} onChange={(e) => setLine(i, { description: e.target.value })} aria-label={`Line ${i + 1} description`} />
          <button className={styles.buttonSecondary} disabled={lines.length <= 2} onClick={() => removeLine(i)}>Remove</button>
        </div>
      ))}
      <div className={styles.actions}>
        <button className={styles.buttonSecondary} onClick={addLine}>+ Add line</button>
        <span className={preview.balanced ? styles.okText : styles.hint}>
          debit {fmtDeltaCents(preview.debitSum)} · credit {fmtDeltaCents(preview.creditSum)}{preview.balanced ? " — balanced" : " — not balanced yet"}
        </span>
      </div>

      <div className={styles.actions}>
        <button className={styles.button} disabled={busy || !name.trim() || !startDate || !memoTemplate.trim() || !preview.balanced} onClick={() => void submit()}>
          {busy ? "Proposing…" : "Propose"}
        </button>
        <button className={styles.buttonSecondary} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        {msg ? <span className={msgIsRefusal ? styles.errorText : styles.muted}>{msg}</span> : null}
      </div>
      <ProposeWarningBanners warnings={warnings} />
      <p className={styles.hint}>start_date must be a cadence period-START; the DB validates alignment + balance and re-checks the current FYE at sign time (`template_fy_stale`).</p>
    </div>
  );
}
