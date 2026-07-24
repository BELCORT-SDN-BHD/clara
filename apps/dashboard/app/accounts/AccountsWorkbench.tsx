"use client";

// The per-client chart-of-accounts workbench (closes live-gate-run-2026-07-24 finding 1:
// "no dashboard page references upsert_account", so a freshly onboarded client has an
// empty CoA and cannot receive any posting at all). Three panels: (1) the existing
// accounts read, with an empty state that names the problem; (2) "Apply the template" —
// COA_TEMPLATE blocks, standard pre-selected, optional not, applied SEQUENTIALLY through the
// governed upsert_account with a stable per-account op_key (WB-R19) so a retry after a
// partial failure replays rather than duplicates; (3) an ad-hoc single-account add form.
// Every figure/count here is either a DB row (the accounts list) or read straight off the
// fixed template (../shared/coaTemplate) — this module computes no accounting figure.

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import { listAccounts, upsertAccount, type AccountRow } from "./api";
import {
  COA_TEMPLATE,
  ACCOUNT_TYPES,
  ACCOUNT_CLASSES,
  SPECIAL_ACC_TYPES,
  ACCOUNT_CODE_HINT,
  validateAccountCode,
  defaultSelectedBlockKeys,
  toggleBlockKey,
  selectionAccountCount,
  templateAccounts,
  coaSeedOpKey,
  initApplyResults,
  withResult,
  applySummary,
  buildMpersLookup,
  type ApplyResult,
} from "./accountsModel";
import styles from "./accounts.module.css";

const MPERS = buildMpersLookup();

export function AccountsWorkbench({
  token,
  clientId,
  clientName,
}: {
  token: string;
  clientId: string;
  clientName?: string | null;
}) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // --- Apply-the-template panel -------------------------------------------------
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>(defaultSelectedBlockKeys());
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [results, setResults] = useState<ApplyResult[]>([]);

  // --- Add-a-single-account form --------------------------------------------------
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("asset");
  const [accountClass, setAccountClass] = useState("");
  const [special, setSpecial] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [addClr, setAddClr] = useState<{ code: string; reason: string | null } | null>(null);
  const [addOk, setAddOk] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      setAccounts(await listAccounts(token, clientId));
    } catch (e) {
      setLoadErr((e as Error).message);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [token, clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function applyTemplate() {
    const toApply = templateAccounts(selectedBlocks);
    if (toApply.length === 0) return;
    setApplying(true);
    setResults(initApplyResults(toApply));
    setProgress({ current: 0, total: toApply.length });
    for (let i = 0; i < toApply.length; i++) {
      const acct = toApply[i]!;
      setProgress({ current: i + 1, total: toApply.length });
      setResults((prev) => withResult(prev, i, { status: "applying" }));
      try {
        // SEQUENTIAL, on purpose — upsert_account is a live audited governed verb, not
        // a bulk endpoint. The op_key is DETERMINISTIC (client + code only) so pressing
        // "Apply selected accounts" again after any failure replays every already-landed
        // account byte-identically (upsert_account's own request-hash dedupe) and only
        // genuinely retries the ones that did not land.
        await upsertAccount(token, {
          clientId,
          code: acct.code,
          name: acct.name,
          type: acct.type,
          special: acct.special ?? null,
          accountClass: acct.accountClass ?? null,
          opKeyOverride: coaSeedOpKey(clientId, acct.code),
        });
        setResults((prev) => withResult(prev, i, { status: "ok" }));
      } catch (e) {
        const pe = e as PgrestError;
        // NEVER suppress the DB's verbatim message behind a CLR badge (the established
        // pattern) — and keep going: one refusal must not abort the rest of the batch.
        setResults((prev) =>
          withResult(prev, i, {
            status: "error",
            message: pe.message ?? String(e),
            clr: pe.clr ?? null,
            reason: pe.reason ?? null,
          }),
        );
      }
    }
    setApplying(false);
    await reload();
  }

  async function addAccount() {
    setAddErr(null);
    setAddClr(null);
    setAddOk(null);
    const v = validateAccountCode(code);
    if (!v.ok) {
      setAddErr(v.error);
      return;
    }
    if (!name.trim()) {
      setAddErr("An account name is required.");
      return;
    }
    setAddBusy(true);
    try {
      const out = await upsertAccount(token, {
        clientId,
        code: code.trim(),
        name: name.trim(),
        type,
        special: special || null,
        accountClass: accountClass || null,
      });
      setAddOk(`${out.account_code} saved.`);
      setCode("");
      setName("");
      setAccountClass("");
      setSpecial("");
      await reload();
    } catch (e) {
      const pe = e as PgrestError;
      setAddErr(pe.message ?? String(e));
      if (pe.clr) setAddClr({ code: pe.clr, reason: pe.reason ?? null });
    } finally {
      setAddBusy(false);
    }
  }

  const selectedCount = selectionAccountCount(selectedBlocks);
  const summary = applySummary(results);

  return (
    <div>
      <div className={styles.section} style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <p className={styles.subtitle}>{clientName ?? `client ${clientId.slice(0, 8)}`}</p>
      </div>

      {/* Panel 1 — existing accounts. */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Existing chart of accounts ({accounts.length})</p>
        {loadErr ? <p className={styles.errorText}>{loadErr}</p> : null}
        {loading ? (
          <p className={styles.muted}>Loading…</p>
        ) : accounts.length === 0 ? (
          <p className={styles.gapBanner}>
            This client has no chart of accounts yet — it cannot receive any posting until one exists. Apply the
            template below, or add accounts one at a time.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>code</th>
                  <th>name</th>
                  <th>type</th>
                  <th>class</th>
                  <th>special</th>
                  <th>active</th>
                  <th>MPERS roll-up</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.account_code}>
                    <td className={styles.num}>{a.account_code}</td>
                    <td>{a.name}</td>
                    <td>{a.account_type}</td>
                    <td>{a.account_class ?? "—"}</td>
                    <td>{a.special_acc_type ?? "—"}</td>
                    <td>
                      <span className={`${styles.badge} ${a.is_active ? styles.badgeDoc : styles.bandNeutral}`}>
                        {a.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className={styles.mpers}>{MPERS.get(a.account_code) ?? "not in template"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Panel 2 — apply the template. */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Apply the template</p>
        <p className={styles.muted}>
          Core blocks are pre-selected; optional blocks are for entities that need them (inventory, investments).
          <code> upsert_account</code> is an upsert, so re-applying is always safe — pressing "Apply selected
          accounts" again after a partial failure resumes it, never duplicates a landed account.
        </p>
        {COA_TEMPLATE.map((block) => {
          const checked = selectedBlocks.includes(block.key);
          return (
            <div key={block.key} className={styles.blockCard}>
              <div className={styles.blockHead}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={applying}
                    onChange={() => setSelectedBlocks((s) => toggleBlockKey(s, block.key))}
                    aria-label={`Include ${block.title}`}
                  />
                  <span className={styles.blockTitle}>{block.title}</span>
                </label>
                <span className={`${styles.band} ${block.tier === "standard" ? styles.bandReady : styles.bandReview}`}>
                  {block.tier}
                </span>
                <span className={styles.blockCount}>{block.accounts.length} account(s)</span>
              </div>
              <p className={styles.blockBlurb}>{block.blurb}</p>
            </div>
          );
        })}
        <p className={styles.selectionSummary}>{selectedCount} account(s) selected</p>
        <div className={styles.actions}>
          <button className={styles.button} disabled={applying || selectedCount === 0} onClick={() => void applyTemplate()}>
            {applying ? "Applying…" : "Apply selected accounts"}
          </button>
          {progress ? (
            <span className={styles.progressText}>
              {progress.current} of {progress.total}
            </span>
          ) : null}
          {results.length > 0 ? (
            <span className={styles.muted}>
              {summary.ok} landed · {summary.error} failed{summary.pending > 0 ? ` · ${summary.pending} pending` : ""}
            </span>
          ) : null}
        </div>
        {results.length > 0 ? (
          <div className={styles.tableWrap} style={{ marginTop: "0.4rem" }}>
            {results.map((r, i) => (
              <div key={`${r.code}-${i}`} className={styles.resultRow}>
                <span className={styles.resultCode}>{r.code}</span>
                <span>{r.name}</span>
                <span
                  className={
                    r.status === "ok"
                      ? styles.statusOk
                      : r.status === "error"
                        ? styles.statusError
                        : r.status === "applying"
                          ? styles.statusApplying
                          : styles.statusPending
                  }
                >
                  {r.status}
                </span>
                {/* NEVER suppress the DB's verbatim message behind a CLR badge — both render. */}
                {r.status === "error" ? (
                  <span className={styles.errorText}>
                    {r.clr ? <span className={styles.refusalBadge}>{r.clr}</span> : null}
                    {r.message}
                    {r.reason ? ` (${r.reason})` : ""}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Panel 3 — add a single account. */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Add a single account</p>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>code</span>
            <input className={styles.input} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Account code" placeholder="900-A01" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>name</span>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} aria-label="Account name" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>type</span>
            <select className={styles.select} value={type} onChange={(e) => setType(e.target.value)} aria-label="Account type">
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>class (optional)</span>
            <select className={styles.select} value={accountClass} onChange={(e) => setAccountClass(e.target.value)} aria-label="Account class">
              <option value="">—</option>
              {ACCOUNT_CLASSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>special (optional)</span>
            <select className={styles.select} value={special} onChange={(e) => setSpecial(e.target.value)} aria-label="Special account marker">
              <option value="">—</option>
              {SPECIAL_ACC_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.muted}>Code format: {ACCOUNT_CODE_HINT}</p>
        <div className={styles.actions}>
          <button className={styles.button} disabled={addBusy} onClick={() => void addAccount()}>
            {addBusy ? "Saving…" : "Add account"}
          </button>
        </div>
        {addOk ? <p className={styles.okText}>{addOk}</p> : null}
        {/* Same house idiom: the CLR badge (when the DB set one) rides ALONGSIDE the
            verbatim message, never in place of it. */}
        {addClr ? (
          <p className={styles.refusalNote}>
            <span className={styles.refusalBadge}>{addClr.code}{addClr.reason ? ` · ${addClr.reason}` : ""}</span>
          </p>
        ) : null}
        {addErr ? <p className={styles.errorText}>{addErr}</p> : null}
      </div>
    </div>
  );
}
