"use client";

// The /bank list pane (design part2 §4.7): bank identity (accounts + proposal
// cards) and statements per account. Detail is delegated to StatementDetail. Every
// figure here is DB-owned (accounts/statements/tie reads); this module computes
// none — grouping/labels are the pure fns in ./model.

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import {
  listBankAccounts, listBankAccountProposals, listBankStatements, getBanksInterviewAnswer,
  addBankAccount, deactivateBankAccount, reactivateBankAccount, remapBankAccountCoa,
  getBankAgencyHold, setBankAgencyHold, type BankAgencyHoldRow,
} from "../shared/bankApi";
import { listAccounts, type AccountRow } from "../accounts/api";
import {
  groupStatementsByAccount, statementStatusLabel, tieBannerState, tieVarianceCents,
  type BankAccountRow, type BankAccountProposalRow, type BankStatementRow,
} from "./model";
import { bankScreenState, describeBankRefusal, isEligibleBankCoaAccount } from "./matchModel";
import { fmtCents, fmtDeltaCents, shortId } from "../shared/fmt";
import { StatementDetail } from "./StatementDetail";
import { AddBankAccountPanel } from "./AddBankAccountPanel";
import styles from "./bank.module.css";

export function BankWorkbench({ token, clientId, clientName }: { token: string; clientId: string; clientName?: string | null }) {
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [proposals, setProposals] = useState<BankAccountProposalRow[]>([]);
  const [statements, setStatements] = useState<BankStatementRow[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<AccountRow[]>([]);
  const [banksAnswer, setBanksAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState<string | null>(null);
  const [accountErr, setAccountErr] = useState<{ id: string; message: string; reason: string | null } | null>(null);
  const [hold, setHold] = useState<BankAgencyHoldRow | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [holdBusy, setHoldBusy] = useState(false);
  const [holdErr, setHoldErr] = useState<{ message: string; reason: string | null } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [accts, props, coa] = await Promise.all([
        listBankAccounts(token, clientId),
        listBankAccountProposals(token, clientId),
        listAccounts(token, clientId),
      ]);
      setAccounts(accts);
      setProposals(props);
      setCoaAccounts(coa);
      const perAccount = await Promise.all(accts.map((a) => listBankStatements(token, clientId, a.id).catch(() => [])));
      setStatements(perAccount.flat());
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, clientId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    getBanksInterviewAnswer(token, clientId).then(setBanksAnswer).catch(() => setBanksAnswer(null));
  }, [token, clientId]);

  const reloadHold = useCallback(async () => {
    setHold(await getBankAgencyHold(token, clientId).catch(() => null));
  }, [token, clientId]);
  useEffect(() => { void reloadHold(); }, [reloadHold]);

  /** M.2 — the HOLD switch over `bank_agency_holds`, bookkeeper floor
   *  (`set_bank_agency_hold`, 0121). Releasing needs no reason (an empty
   *  string reads "released" to a human); holding does — the DB itself
   *  refuses `reason_required` on a blank one either way, so the button
   *  stays disabled client-side rather than round-tripping a refusal. */
  async function toggleHold(nextOn: boolean) {
    setHoldBusy(true);
    setHoldErr(null);
    try {
      await setBankAgencyHold(token, clientId, nextOn, nextOn ? holdReason.trim() : "released from /bank");
      setHoldReason("");
      await reloadHold();
    } catch (e) {
      const pe = e as PgrestError;
      setHoldErr({ message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setHoldBusy(false);
    }
  }

  const groups = groupStatementsByAccount(accounts, statements);
  const eligibleCoa = coaAccounts.filter(isEligibleBankCoaAccount);
  const state = bankScreenState({ loading, error: !!loadErr, totalRows: accounts.length });

  async function runAccountAction(id: string, fn: () => Promise<unknown>) {
    setAccountBusy(id);
    setAccountErr(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      const pe = e as PgrestError;
      setAccountErr({ id, message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setAccountBusy(null);
    }
  }

  return (
    <div>
      <div className={styles.section} style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <p className={styles.subtitle}>{clientName ?? `client ${clientId.slice(0, 8)}`}</p>
        {banksAnswer ? (
          <p className={styles.muted}>Interview "banks" answer (advisory only, never binding): {banksAnswer}</p>
        ) : null}
        {hold?.on_hold ? (
          <div className={styles.actions}>
            <span className={`${styles.badge} ${styles.bandReview}`}>bank agency held</span>
            <button className={styles.buttonSecondary} disabled={holdBusy} onClick={() => void toggleHold(false)}>
              {holdBusy ? "Releasing…" : "Release hold"}
            </button>
          </div>
        ) : (
          <div className={styles.actions}>
            <input
              className={styles.input} placeholder="Hold reason" value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)} aria-label="Bank agency hold reason" style={{ flex: 1 }}
            />
            <button className={styles.buttonSecondary} disabled={holdBusy || !holdReason.trim()} onClick={() => void toggleHold(true)}>
              {holdBusy ? "Holding…" : "Hold this client's bank lane"}
            </button>
          </div>
        )}
        {hold?.on_hold ? (
          <p className={styles.banner}>
            Clara will NOT reconcile {clientName ?? "this client"} tonight — the bank agency lane is held
            {hold.reason ? `: ${hold.reason}` : ""}.
          </p>
        ) : (
          <p className={styles.hint}>Clara will reconcile {clientName ?? "this client"} tonight, unless held above.</p>
        )}
        {holdErr ? <p className={styles.errorText}>{holdErr.message}{describeBankRefusal(holdErr.reason) ? ` — ${describeBankRefusal(holdErr.reason)}` : ""}</p> : null}
      </div>

      {loadErr ? <p className={styles.errorText}>{loadErr}</p> : null}

      {/* Proposal cards (design §4.1: account_unregistered → offer creation, */}
      {/* account_inactive → offer reactivation). Only after header corroboration. */}
      {proposals.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Bank account proposals ({proposals.length})</p>
          {proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              busy={accountBusy === p.id}
              err={accountErr?.id === p.id ? accountErr : null}
              eligibleCoa={eligibleCoa}
              onConfirmNew={(coaCode) =>
                runAccountAction(p.id, () =>
                  addBankAccount(token, {
                    clientId, bankCode: p.bank_code, accountNumber: p.account_number_normalized,
                    bankNameDisplay: p.bank_name ?? p.bank_code, coaAccountCode: coaCode, proposalId: p.id,
                  }),
                )
              }
              onReactivate={() =>
                p.existing_bank_account_id
                  ? runAccountAction(p.id, () => reactivateBankAccount(token, clientId, p.existing_bank_account_id!))
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}

      <AddBankAccountPanel token={token} clientId={clientId} eligibleCoa={eligibleCoa} onAdded={() => void reload()} />

      <div className={styles.layout}>
        <section className={styles.listPane}>
          <p className={styles.sectionTitle}>Accounts &amp; statements</p>
          {state === "loading" ? (
            <p className={styles.muted}>Loading…</p>
          ) : state === "empty" ? (
            <p className={styles.emptyState}>No bank accounts yet — confirm a proposal above, or add one manually.</p>
          ) : (
            groups.map((g) => (
              <div key={g.account.id} className={styles.section}>
                <div className={styles.accountRow}>
                  <div className={styles.accountMain}>
                    <span className={styles.accountName}>
                      {g.account.bank_name_display} · {g.account.account_number}
                      {!g.account.active ? <span className={`${styles.badge} ${styles.bandNeutral}`} style={{ marginLeft: "0.4rem" }}>inactive</span> : null}
                    </span>
                    <span className={styles.accountSub}>GL {g.account.coa_account_code}{g.account.coa_account_name ? ` · ${g.account.coa_account_name}` : ""}</span>
                  </div>
                  <div className={styles.actions}>
                    {g.account.active ? (
                      <button className={styles.buttonSecondary} disabled={accountBusy === g.account.id}
                        onClick={() => runAccountAction(g.account.id, () => deactivateBankAccount(token, clientId, g.account.id, "deactivated from /bank"))}>
                        Deactivate
                      </button>
                    ) : (
                      <button className={styles.buttonSecondary} disabled={accountBusy === g.account.id}
                        onClick={() => runAccountAction(g.account.id, () => reactivateBankAccount(token, clientId, g.account.id))}>
                        Reactivate
                      </button>
                    )}
                  </div>
                </div>
                {g.account.active ? (
                  <RemapControl
                    accountId={g.account.id}
                    currentCode={g.account.coa_account_code}
                    eligibleCoa={eligibleCoa}
                    busy={accountBusy === g.account.id}
                    onRemap={(code) => runAccountAction(g.account.id, () => remapBankAccountCoa(token, clientId, g.account.id, code))}
                  />
                ) : null}
                {accountErr?.id === g.account.id ? (
                  <p className={styles.errorText}>{accountErr.message}{describeBankRefusal(accountErr.reason) ? ` — ${describeBankRefusal(accountErr.reason)}` : ""}</p>
                ) : null}
                {g.statements.length === 0 ? (
                  <p className={styles.muted}>No statements ingested for this account yet.</p>
                ) : (
                  g.statements.map((st) => {
                    const tie = tieBannerState(st);
                    return (
                      <div
                        key={st.id}
                        className={`${styles.statementRow} ${st.id === selectedStatementId ? styles.statementRowActive : ""}`}
                        onClick={() => setSelectedStatementId(st.id)}
                      >
                        <div className={styles.accountMain}>
                          <span className={styles.accountName}>{st.period_start} → {st.period_end}</span>
                          <span className={styles.accountSub}>
                            {statementStatusLabel(st.status)} · {st.line_count} lines · closing {fmtCents(st.closing_cents)}
                            {tie === "variance" ? ` · variance ${fmtDeltaCents(tieVarianceCents(st))}` : tie === "tied" ? " · tied" : ""}
                          </span>
                        </div>
                        <span className={`${styles.band} ${tie === "tied" ? styles.bandReady : tie === "variance" ? styles.bandReview : styles.bandNeutral}`}>
                          {tie}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            ))
          )}
        </section>

        <section className={styles.detailPane}>
          {selectedStatementId ? (
            <StatementDetail
              token={token} clientId={clientId} statementId={selectedStatementId}
              statements={statements.filter(
                (s) => s.bank_account_id === (statements.find((x) => x.id === selectedStatementId)?.bank_account_id ?? ""),
              )}
              onChanged={() => void reload()}
            />
          ) : (
            <p className={styles.detailEmpty}>Select a statement to see its lines and the matching workspace.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ProposalCard({
  proposal, busy, err, eligibleCoa, onConfirmNew, onReactivate,
}: {
  proposal: BankAccountProposalRow;
  busy: boolean;
  err: { message: string; reason: string | null } | null;
  eligibleCoa: AccountRow[];
  onConfirmNew: (coaCode: string) => void;
  onReactivate: () => void;
}) {
  const [coaCode, setCoaCode] = useState("");
  const isInactive = proposal.reason === "account_inactive";
  return (
    <div className={styles.proposalCard}>
      <div className={styles.proposalHead}>
        <span style={{ fontWeight: 600 }}>{proposal.bank_name ?? proposal.bank_code} · {proposal.account_number_normalized}</span>
        <span className={styles.idChip}>{shortId(proposal.id)}</span>
        <span className={`${styles.band} ${isInactive ? styles.bandReview : styles.bandYou}`}>{proposal.reason}</span>
      </div>
      <p className={styles.muted}>
        {proposal.period_start ?? "—"} → {proposal.period_end ?? "—"} · opening {fmtCents(proposal.opening_cents)} · closing {fmtCents(proposal.closing_cents)}
        {proposal.currency ? ` · ${proposal.currency}` : ""}
      </p>
      {isInactive ? (
        <>
          <p className={styles.hint}>An account already exists for this institution/number but is deactivated: {proposal.existing_bank_account_display ?? shortId(proposal.existing_bank_account_id)}.</p>
          <button className={styles.button} disabled={busy} onClick={onReactivate}>{busy ? "Working…" : "Reactivate that account"}</button>
        </>
      ) : (
        <>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>COA account (name/type preview)</span>
            <select className={styles.select} value={coaCode} onChange={(e) => setCoaCode(e.target.value)} aria-label={`Target COA account for proposal ${proposal.id}`}>
              <option value="">Select…</option>
              {eligibleCoa.map((a) => <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name} ({a.account_type})</option>)}
            </select>
          </label>
          <button className={styles.button} disabled={busy || !coaCode} onClick={() => onConfirmNew(coaCode)}>
            {busy ? "Working…" : "Confirm — create this bank account"}
          </button>
          <p className={styles.hint}>No eligible account? Add one in "Add a bank account" below, then return here.</p>
        </>
      )}
      {err ? <p className={styles.errorText}>{err.message}{describeBankRefusal(err.reason) ? ` — ${describeBankRefusal(err.reason)}` : ""}</p> : null}
    </div>
  );
}

/** remap_bank_account_coa (design §4.1): refuses while any pending/live match
 *  group exists on the account — the refusal renders through the parent's
 *  accountErr banner via describeBankRefusal, same as deactivate/reactivate. */
function RemapControl({
  accountId, currentCode, eligibleCoa, busy, onRemap,
}: {
  accountId: string;
  currentCode: string;
  eligibleCoa: AccountRow[];
  busy: boolean;
  onRemap: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const options = eligibleCoa.filter((a) => a.account_code !== currentCode);
  if (options.length === 0) return null;
  return (
    <div className={styles.actions} style={{ marginTop: "0.3rem" }}>
      <select className={styles.select} value={code} onChange={(e) => setCode(e.target.value)} aria-label={`Remap ${accountId} to a different COA account`}>
        <option value="">Remap to…</option>
        {options.map((a) => <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>)}
      </select>
      <button className={styles.linkButton} disabled={busy || !code} onClick={() => onRemap(code)}>Remap</button>
    </div>
  );
}
