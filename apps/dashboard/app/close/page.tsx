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

import { useCallback, useEffect, useMemo, useState } from "react";
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
  2: "A failing check here clears with a named, reasoned attestation on the specific outstanding item.",
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

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (token && supabaseBase()) listClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  useEffect(() => {
    if (!token || !clientId) { setFiscalYears([]); setFyId(""); return; }
    listFiscalYears(token, clientId).then((rows) => {
      setFiscalYears(rows);
      setFyId((cur) => (rows.some((r) => r.fiscal_year_id === cur) ? cur : (rows[0]?.fiscal_year_id ?? "")));
    }).catch(() => setFiscalYears([]));
  }, [token, clientId]);

  const loadPlan = useCallback(async () => {
    if (!token || !fyId) { setPlan(null); return; }
    setLoading(true); setError(null);
    try {
      setPlan(await getClosePlan(token, fyId));
    } catch (e) {
      setError((e as Error).message); setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [token, fyId]);

  useEffect(() => { void loadPlan(); }, [loadPlan]);

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t); setToken(t); setPlan(null); setFiscalYears([]); setFyId("");
  };

  const readinessCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of plan?.checks ?? []) {
      const k = c.result.state;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [plan]);

  const byDrawer = useMemo(() => {
    const g: Record<1 | 2 | 3, ClosePlanCheck[]> = { 1: [], 2: [], 3: [] };
    for (const c of plan?.checks ?? []) g[c.drawer].push(c);
    return g;
  }, [plan]);

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

          {plan ? (
            <>
              <section className={styles.fySummary}>
                <div className={styles.fyHead}>
                  <span className={styles.fyTitle}>{plan.fiscal_year.label}</span>
                  <span className={styles.idChip}>{plan.fiscal_year.status}</span>
                  <span className={styles.idChip}>ordinal {plan.fiscal_year.ordinal}</span>
                  <span className={styles.idChip}>{plan.fiscal_year.fy_end_source}</span>
                </div>
                <div className={styles.bounds}>
                  <span className={styles.bound}>{plan.fiscal_year.starts_on} &ndash; {plan.fiscal_year.ends_on}</span>
                  <span className={styles.bound}>
                    close run: {plan.close_run.state === "absent" ? "not started" : plan.close_run.run_state}
                  </span>
                  {plan.close_run.state === "present" ? (
                    <span className={styles.bound}>run id {shortId(plan.close_run.close_run_id)}</span>
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
                      <GateRow key={c.check_key} check={c} closeRunId={plan.close_run.state === "present" ? plan.close_run.close_run_id : null}
                        token={token} onAttested={() => void loadPlan()} />
                    ))}
                  </div>
                </section>
              ))}

              <section className={styles.section}>
                <p className={styles.sectionTitle}>Close receipt</p>
                {plan.receipt.state === "absent" ? (
                  <p className={styles.muted}>No close receipt yet -- this fiscal year has not been finalized.</p>
                ) : (
                  <>
                    <div className={styles.receiptGrid}>
                      <Field label="Receipt" value={shortId(plan.receipt.receipt_id)} />
                      <Field label="Kind / status" value={`${plan.receipt.kind} / ${plan.receipt.status}`} />
                      <Field label="Closed by" value={shortId(plan.receipt.closed_by)} />
                      <Field label="Closed at" value={plan.receipt.closed_at} />
                      <Field label="Segregation" value={plan.receipt.segregation_mode ?? "—"} />
                      <Field label="P&amp;L net" value={fmtCents(plan.receipt.pl_net_cents)} />
                      <Field label="Retained earnings account" value={plan.receipt.retained_earnings_account} />
                      <Field label="Closing entry" value={shortId(plan.receipt.close_entry_id)} />
                      <Field label="Closing TB digest" value={plan.receipt.closing_tb_digest} mono />
                      <Field label="Gate digest" value={plan.receipt.gate_digest} mono />
                      <Field label="Dataset sha256" value={plan.receipt.dataset_sha256} mono />
                    </div>
                    {plan.receipt.closing_position ? (
                      <table className={styles.positionTable}>
                        <thead><tr><th>Account</th><th>Closing balance</th></tr></thead>
                        <tbody>
                          {Object.entries(plan.receipt.closing_position).map(([code, cents]) => (
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
  const canAttest = check.drawer === 2 && closeRunId !== null;
  return (
    <div className={styles.gateRow}>
      <div className={styles.gateHead}>
        <GateBadge state={state} />
        <span className={styles.gateTitle}>{check.title}</span>
        <span className={styles.gateKey}>{check.check_key}</span>
        {check.drawer === 3 ? <span className={styles.nonBlocking}>never blocks the close</span> : null}
      </div>
      {check.items.length > 0 && !(
        state !== "fail"
        && check.items.every((it) => it.item_key === "__gate__" && it.attestation.state === "absent")
      ) ? (
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
