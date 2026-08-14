"use client";

// /close -- the plan-as-document view + readiness panel (Wave E lane theta,
// design skeleton part4 §4). Plumbing grade: dev auth is the pasted session
// JWT (sessionStorage, the shared clara_dev_jwt key -- the same key /rules,
// /chat, /documents and /queue already use), reads are clara.list_fiscal_years
// + clara.get_close_plan (PostgREST rpc()), the attest action is an
// object-level verb on the gate row wired to the EXISTING audited door
// clara.attest_close_exception (0056) -- theta invents no new writer. Every
// gate row renders shape + label (a glyph plus a text word), never hue-only
// and never a raw digit; drawer-3 rows are visibly marked non-blocking. The
// UI computes no cents -- pl_net_cents and every other figure ride straight
// from the plan document via the shared fmtCents helper.
//
// CLIENT-SWITCH RACE (fix-docket finding 1, BLOCKER): a fast client-A then
// client-B selection can leave client A's fiscal-year list or plan resolving
// AFTER B is already selected. Two independent layers close it: (1) every
// async fetch here carries an AbortController tied to the effect's own
// dependencies (React's cleanup aborts the PREVIOUS request the instant the
// selection changes) PLUS a monotonically-bumped generation ref checked
// before any setState, so even a response that raced past the abort is
// discarded; (2) a render-time belt -- `visiblePlan` below never exposes a
// fetched plan whose OWN `fiscal_year.client_id`/`id` (carried on the plan
// document itself, not tracked side-band) fails to match the CURRENTLY
// selected client/FY. The attest action's payload is read only from
// `visiblePlan`, so it can never fire against a plan that belongs to an
// abandoned selection.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listClients, type ClientRow } from "../documents/api";
import { supabaseBase, runtimeBase } from "../shared/wire";
import { fmtCents, shortId } from "../shared/fmt";
import {
  listFiscalYears, getClosePlan, attestCloseException,
  type FiscalYearRow, type ClosePlan, type ClosePlanCheck, type GateState,
} from "./closeApi";
import styles from "./close.module.css";

const TOKEN_KEY = "clara_dev_jwt"; // shared with /chat + /documents + /queue + /rules

const GATE_GLYPH: Record<GateState | "not_yet_measured", string> = {
  pass: "✓", // check mark
  fail: "✗", // ballot x
  unknown: "?",
  error: "!",
  advisory: "ⓘ", // circled i
  not_yet_measured: "·", // middle dot
};

const GATE_BAND: Record<GateState | "not_yet_measured", string> = {
  pass: "bandPass",
  fail: "bandFail",
  unknown: "bandUnknown",
  error: "bandError",
  advisory: "bandAdvisory",
  not_yet_measured: "bandNotMeasured",
};

// The states a drawer-2 gate can legitimately be attested FROM -- exactly the
// states clara.attest_close_exception accepts a call against (fail/unknown/
// error are all "not passing", and the door does not special-case any of the
// three). pass/advisory/not_yet_measured have nothing to attest.
const ATTESTABLE_STATES: ReadonlySet<GateState> = new Set(["fail", "unknown", "error"]);

function GateBadge({ state }: { state: GateState | "not_yet_measured" }) {
  const band = (styles as Record<string, string>)[GATE_BAND[state]] ?? styles.bandNotMeasured;
  return (
    <span className={`${styles.band} ${band}`}>
      <span className={styles.glyph} aria-hidden="true">{GATE_GLYPH[state]}</span>
      {state.replace(/_/g, " ")}
    </span>
  );
}

function AttestBadge({ attestation }: { attestation: ClosePlanCheck["items"][number]["attestation"] }) {
  if (attestation.state === "absent") {
    return <span className={`${styles.band} ${styles.bandNotMeasured}`}><span className={styles.glyph} aria-hidden="true">&middot;</span>absent</span>;
  }
  const band = attestation.state === "live" ? styles.bandPass : styles.bandUnknown;
  const glyph = attestation.state === "live" ? "✓" : "↻"; // check / refresh (stale)
  return <span className={`${styles.band} ${band}`}><span className={styles.glyph} aria-hidden="true">{glyph}</span>{attestation.state}</span>;
}

const DRAWER_LABEL: Record<1 | 2 | 3, string> = {
  1: "Drawer 1 -- absolute",
  2: "Drawer 2 -- attestable",
  3: "Drawer 3 -- advisory (non-blocking)",
};
const DRAWER_BLURB: Record<1 | 2 | 3, string> = {
  1: "No attestation path exists for these checks -- they must pass on their own evidence.",
  2: "A failing, unknown or errored check here clears with a named, reasoned attestation on the specific outstanding item.",
  3: "Informational only. These checks render but never block a close.",
};

export default function ClosePage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [fiscalYears, setFiscalYears] = useState<FiscalYearRow[]>([]);
  const [fyId, setFyId] = useState("");
  const [plan, setPlan] = useState<ClosePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generation counters (the belt alongside AbortController): bumped every
  // time the thing they guard is superseded, checked before any setState from
  // a resolved/rejected promise so a response that raced past the abort still
  // cannot land.
  const fyListEpoch = useRef(0);
  const planEpoch = useRef(0);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (token && supabaseBase()) listClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  // Client selection changed: abort any in-flight FY-list fetch for the PRIOR
  // client, bump the generation, and clear everything downstream immediately
  // (never leave a stale FY list or plan visible under a new client while the
  // fresh fetch is still in flight).
  useEffect(() => {
    fyListEpoch.current += 1;
    const epoch = fyListEpoch.current;
    setFiscalYears([]);
    setFyId("");
    setPlan(null);
    if (!token || !clientId) return;
    const controller = new AbortController();
    listFiscalYears(token, clientId, controller.signal)
      .then((rows) => {
        if (fyListEpoch.current !== epoch) return; // a later selection already superseded this
        setFiscalYears(rows);
        setFyId(rows[0]?.fiscal_year_id ?? "");
      })
      .catch(() => {
        if (controller.signal.aborted || fyListEpoch.current !== epoch) return;
        setFiscalYears([]);
      });
    return () => controller.abort();
  }, [token, clientId]);

  // ONE fetch implementation for both the automatic (effect-driven) and manual
  // (Refresh button) paths, so the epoch/abort discipline can never drift
  // between two copies of the same logic. `signal` is omitted on a manual
  // click (nothing else is racing it); the epoch check still applies either
  // way, since a click during an in-flight automatic fetch must still let the
  // NEWER request win.
  const loadPlan = useCallback(async (signal?: AbortSignal) => {
    if (!token || !fyId) { setPlan(null); return; }
    planEpoch.current += 1;
    const epoch = planEpoch.current;
    setLoading(true); setError(null);
    try {
      const p = await getClosePlan(token, fyId, signal);
      if (planEpoch.current !== epoch) return; // superseded by a later selection
      setPlan(p);
    } catch (e) {
      if (signal?.aborted) return; // cancelled, not a real failure
      if (planEpoch.current !== epoch) return;
      setError((e as Error).message); setPlan(null);
    } finally {
      if (planEpoch.current === epoch) setLoading(false);
    }
  }, [token, fyId]);

  // fyId changing (including a client-switch's reset) re-triggers this effect;
  // the cleanup aborts the previous fyId's in-flight request the instant a new
  // one starts, and loadPlan's own epoch check is the belt underneath that.
  useEffect(() => {
    const controller = new AbortController();
    void loadPlan(controller.signal);
    return () => controller.abort();
  }, [loadPlan]);

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t); setToken(t); setPlan(null); setFiscalYears([]); setFyId("");
  };

  // THE RENDER-TIME BELT (finding 1's second layer): a plan is only ever
  // shown, and only ever feeds an attest action, when its OWN client_id/id
  // (carried on the plan document, never a side-tracked assumption) matches
  // the currently selected client/FY. Anything else renders as "no plan yet"
  // rather than stale-but-plausible data.
  const visiblePlan = plan && plan.fiscal_year.client_id === clientId && plan.fiscal_year.id === fyId ? plan : null;

  const readinessCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of visiblePlan?.checks ?? []) {
      const k = c.result.state;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [visiblePlan]);

  const byDrawer = useMemo(() => {
    const g: Record<1 | 2 | 3, ClosePlanCheck[]> = { 1: [], 2: [], 3: [] };
    for (const c of visiblePlan?.checks ?? []) g[c.drawer].push(c);
    return g;
  }, [visiblePlan]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Close -- plan &amp; readiness</h1>
        <div className={styles.tokenBar}>
          <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT" value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
          <button className={styles.button} onClick={saveToken}>Use token</button>
        </div>
        <p className={styles.muted}>runtime: {runtimeBase() || "same-origin proxy"} &middot; PostgREST: {supabaseBase() ?? "not configured"}</p>
      </header>

      {!token ? (
        <p className={styles.muted}>Paste a JWT above to load a client&rsquo;s fiscal years.</p>
      ) : !supabaseBase() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read the close model on the human lane.</p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <select className={styles.input} value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
              <option value="">Select client&hellip;</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>)}
            </select>
            <select className={styles.input} value={fyId} onChange={(e) => setFyId(e.target.value)} aria-label="Fiscal year" disabled={!clientId || fiscalYears.length === 0}>
              <option value="">Select fiscal year&hellip;</option>
              {fiscalYears.map((fy) => (
                <option key={fy.fiscal_year_id} value={fy.fiscal_year_id}>
                  {fy.label} ({fy.starts_on} -- {fy.ends_on}) [{fy.status}]
                </option>
              ))}
            </select>
            <button className={styles.buttonSecondary} disabled={!fyId || loading} onClick={() => void loadPlan()}>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {clientId && fiscalYears.length === 0 ? (
            <p className={styles.muted}>This client has no fiscal years yet -- open one first (propose_fiscal_year / open_fiscal_year).</p>
          ) : null}
          {error ? <p className={styles.banner}>Could not load the close plan: {error}</p> : null}

          {visiblePlan ? (
            <>
              <section className={styles.fySummary}>
                <div className={styles.fyHead}>
                  <span className={styles.fyTitle}>{visiblePlan.fiscal_year.label}</span>
                  <span className={styles.idChip}>{visiblePlan.fiscal_year.status}</span>
                  <span className={styles.idChip}>ordinal {visiblePlan.fiscal_year.ordinal}</span>
                  <span className={styles.idChip}>{visiblePlan.fiscal_year.fy_end_source}</span>
                </div>
                <div className={styles.bounds}>
                  <span className={styles.bound}>{visiblePlan.fiscal_year.starts_on} &ndash; {visiblePlan.fiscal_year.ends_on}</span>
                  <span className={styles.bound}>
                    close run: {visiblePlan.close_run.state === "absent" ? "not started" : visiblePlan.close_run.run_state}
                  </span>
                  {visiblePlan.close_run.state === "present" ? (
                    <span className={styles.bound}>run id {shortId(visiblePlan.close_run.close_run_id)}</span>
                  ) : null}
                </div>
                <div className={styles.readiness}>
                  {(["pass", "fail", "unknown", "error", "advisory", "not_yet_measured"] as const)
                    .filter((k) => (readinessCounts[k] ?? 0) > 0)
                    .map((k) => (
                      <span key={k} className={`${styles.readinessTile} ${(styles as Record<string, string>)[GATE_BAND[k]]}`}>
                        {readinessCounts[k]} {k.replace(/_/g, " ")}
                      </span>
                    ))}
                </div>
              </section>

              {([1, 2, 3] as const).map((drawer) => (
                <section key={drawer} className={styles.section}>
                  <p className={styles.sectionTitle}>{DRAWER_LABEL[drawer]}</p>
                  <p className={styles.drawerBlurb}>{DRAWER_BLURB[drawer]}</p>
                  <div className={styles.gateList}>
                    {byDrawer[drawer].map((c) => (
                      <GateRow key={c.check_key} check={c} closeRunId={visiblePlan.close_run.state === "present" ? visiblePlan.close_run.close_run_id : null}
                        token={token} onAttested={() => void loadPlan()} />
                    ))}
                  </div>
                </section>
              ))}

              <section className={styles.section}>
                <p className={styles.sectionTitle}>Close receipt</p>
                {visiblePlan.receipt.state === "absent" ? (
                  <p className={styles.muted}>No close receipt yet -- this fiscal year has not been finalized.</p>
                ) : (
                  <>
                    <div className={styles.receiptGrid}>
                      <Field label="Receipt" value={shortId(visiblePlan.receipt.receipt_id)} />
                      <Field label="Kind / status" value={`${visiblePlan.receipt.kind} / ${visiblePlan.receipt.status}`} />
                      <Field label="Closed by" value={shortId(visiblePlan.receipt.closed_by)} />
                      <Field label="Closed at" value={visiblePlan.receipt.closed_at} />
                      <Field label="Segregation" value={visiblePlan.receipt.segregation_mode ?? "—"} />
                      <Field label="P&amp;L net" value={fmtCents(visiblePlan.receipt.pl_net_cents)} />
                      <Field label="Retained earnings account" value={visiblePlan.receipt.retained_earnings_account} />
                      <Field label="Closing entry" value={shortId(visiblePlan.receipt.close_entry_id)} />
                      <Field label="Closing TB digest" value={visiblePlan.receipt.closing_tb_digest} mono />
                      <Field label="Gate digest" value={visiblePlan.receipt.gate_digest} mono />
                      <Field label="Dataset sha256" value={visiblePlan.receipt.dataset_sha256} mono />
                    </div>
                    {visiblePlan.receipt.closing_position ? (
                      <table className={styles.positionTable}>
                        <thead><tr><th>Account</th><th>Closing balance</th></tr></thead>
                        <tbody>
                          {Object.entries(visiblePlan.receipt.closing_position).map(([code, cents]) => (
                            <tr key={code}><td>{code}</td><td>{fmtCents(cents)}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                  </>
                )}
              </section>
            </>
          ) : (fyId && !loading && !error ? <p className={styles.muted}>No plan returned.</p> : null)}
        </>
      )}
    </main>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.receiptField}>
      <div className={styles.receiptLabel}>{label}</div>
      <div className={styles.receiptValue} style={mono ? { fontFamily: "ui-monospace, monospace", fontSize: "0.72rem" } : undefined}>{value}</div>
    </div>
  );
}

function GateRow({ check, closeRunId, token, onAttested }: {
  check: ClosePlanCheck; closeRunId: string | null; token: string; onAttested: () => void;
}) {
  const state = check.result.state;
  // Finding 2: unknown/error are lawfully attestable (attest_close_exception
  // accepts a call for any not-passing state), so the item list -- and the
  // attest action inside it -- must render for them too, not only 'fail'.
  const attestable = state !== "not_yet_measured" && ATTESTABLE_STATES.has(state);
  const canAttest = check.drawer === 2 && closeRunId !== null && attestable;
  const hasNonAbsentAttestation = check.items.some((it) => it.attestation.state !== "absent");
  const showItems = check.items.length > 0 && (attestable || hasNonAbsentAttestation);
  return (
    <div className={styles.gateRow}>
      <div className={styles.gateHead}>
        <GateBadge state={state} />
        <span className={styles.gateTitle}>{check.title}</span>
        <span className={styles.gateKey}>{check.check_key}</span>
        {check.drawer === 3 ? <span className={styles.nonBlocking}>never blocks the close</span> : null}
      </div>
      {showItems ? (
        <div className={styles.itemList}>
          {check.items.map((item) => (
            <div key={item.item_key} className={styles.itemRow}>
              <span className={styles.itemKey}>{item.item_key}</span>
              <AttestBadge attestation={item.attestation} />
              {item.attestation.state === "live" ? (
                <span className={styles.attestNote}>by {shortId(item.attestation.attested_by)} &mdash; {item.attestation.reason}</span>
              ) : null}
              {canAttest && item.attestation.state !== "live" ? (
                <AttestAction token={token} closeRunId={closeRunId as string} checkKey={check.check_key}
                  itemKey={item.item_key} onDone={onAttested} />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AttestAction({ token, closeRunId, checkKey, itemKey, onDone }: {
  token: string; closeRunId: string; checkKey: string; itemKey: string; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) { setMsg("A reason is required."); return; }
    setBusy(true); setMsg(null);
    try {
      await attestCloseException(token, {
        closeRunId, checkKey, reason: reason.trim(),
        itemKey: itemKey === "__gate__" ? null : itemKey,
      });
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return <button className={styles.buttonSecondary} onClick={() => setOpen(true)}>Attest this exception</button>;
  }
  return (
    <div className={styles.attestForm}>
      <input className={styles.reasonInput} placeholder="Reason (required)" value={reason}
        onChange={(e) => setReason(e.target.value)} aria-label={`Attestation reason for ${itemKey}`} />
      <button className={styles.button} disabled={busy} onClick={() => void submit()}>{busy ? "Attesting…" : "Confirm attest"}</button>
      <button className={styles.buttonSecondary} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      {msg ? <span className={styles.errorText}>{msg}</span> : null}
    </div>
  );
}
