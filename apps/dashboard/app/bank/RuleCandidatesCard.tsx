"use client";

// The client-scoped "rule candidates + owner sign card" (Wave C-c, design
// v2.1 §7), mounted once in BankWorkbench (list_bank_rule_candidates(client)
// is client-scoped, not statement-scoped — unlike the per-statement recon
// pane). Breeding is a READ (design §4.3): the ≥3-sighting floor is
// DB-derived, never caller-supplied; this card only offers to propose off an
// already-qualifying candidate, sign a just-proposed rule (owner), or retire
// one (owner). The DB's own floor/uniqueness refusal is the authority either
// way — this UI's disabled state is a preview.
//
// SESSION-LOCAL SCOPE (unchanged by the D2/D4 fix-wave pass): `list_bank_
// rules(client)` exists and reconApi.getBankRule now reads through it (D4
// fix — see shared/reconApi.ts / shared/cards/BankRuleProposalCard.tsx), but
// THIS card still tracks only rules IT minted this session (their ids come
// back from propose_bank_rule's own return value) — a rule proposed
// elsewhere (chat, a different tab, an earlier session) is invisible here.
// Wiring list_bank_rules into this card's own list is a real, separate
// enhancement, not part of this fix wave's D2 scope (label + kind selector +
// proposal builder) — recorded loudly rather than silently left stale.

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import { listBankRuleCandidates, proposeBankRule, signBankRule, retireBankRule } from "../shared/reconApi";
import {
  bankRuleProposalLabel, candidateMeetsEvidenceFloor, RULE_EVIDENCE_FLOOR,
  type BankRuleCandidateRow, type BankRuleRow, type BankRuleKind,
} from "./reconModel";
import { describeBankRefusal } from "./matchModel";
import { listCounterparties, type CounterpartyRow } from "../shared/counterpartyApi";
import { listAccounts, type AccountRow } from "../accounts/api";
import { shortId } from "../shared/fmt";
import styles from "./bank.module.css";

/** [D2/A4 fix] `list_bank_rule_candidates` carries only pattern/sighting_
 *  count/sample_line_ids (0040:3847-3849) — no kind, no proposal. The label
 *  is the pattern's own tokens/direction, never the defaulted "coding"/{}
 *  bankRuleProposalLabel would render for a candidate. */
function candidatePatternLabel(c: Pick<BankRuleCandidateRow, "pattern">): string {
  const p = (c.pattern ?? {}) as Record<string, unknown>;
  const toks = Array.isArray(p.tokens) ? p.tokens.filter((t): t is string => typeof t === "string") : [];
  const direction = typeof p.direction === "string" ? p.direction : null;
  if (toks.length === 0) return "(pattern)";
  return `${toks.join(" ")}${direction ? ` · ${direction}` : ""}`;
}

type ActionErr = { id: string; message: string; reason: string | null } | null;

export function RuleCandidatesCard({ token, clientId }: { token: string; clientId: string }) {
  const [candidates, setCandidates] = useState<BankRuleCandidateRow[]>([]);
  const [proposedThisSession, setProposedThisSession] = useState<BankRuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState<ActionErr>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      setCandidates(await listBankRuleCandidates(token, clientId));
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, clientId]);

  useEffect(() => { void reload(); }, [reload]);

  // [D2/A4 fix] kind/proposal come from the human's OWN choice in
  // CandidateProposalBuilder below — never c.kind/c.proposal (the census
  // carries neither; sending them defaulted refused 100% of the time).
  async function doPropose(c: BankRuleCandidateRow, key: string, kind: BankRuleKind, proposal: Record<string, unknown>) {
    setBusyKey(key);
    setErr(null);
    try {
      const rule = await proposeBankRule(token, { clientId, kind, pattern: c.pattern, proposal });
      // propose_bank_rule's own return is thin ({rule_id, status, sighting_
      // count} — 0040:3268-3269); echo what was actually accepted (the verb
      // canonicalizes proposal server-side, but refusal would already have
      // thrown) so this session's list shows the real kind/proposal, not the
      // mapper's defaults.
      setProposedThisSession((rows) => [{ ...rule, kind, pattern: c.pattern, proposal }, ...rows]);
      await reload();
    } catch (e) {
      const pe = e as PgrestError;
      setErr({ id: key, message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setBusyKey(null);
    }
  }

  async function doSign(rule: BankRuleRow) {
    setBusyKey(rule.id);
    setErr(null);
    try {
      await signBankRule(token, clientId, rule.id);
      setProposedThisSession((rows) => rows.map((r) => (r.id === rule.id ? { ...r, status: "signed" } : r)));
    } catch (e) {
      const pe = e as PgrestError;
      setErr({ id: rule.id, message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setBusyKey(null);
    }
  }

  async function doRetire(rule: BankRuleRow, reason: string) {
    setBusyKey(rule.id);
    setErr(null);
    try {
      await retireBankRule(token, clientId, rule.id, reason);
      setProposedThisSession((rows) => rows.map((r) => (r.id === rule.id ? { ...r, status: "retired" } : r)));
    } catch (e) {
      const pe = e as PgrestError;
      setErr({ id: rule.id, message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Bank rule candidates (learn loop)</p>
      {loadErr ? <p className={styles.errorText}>{loadErr}</p> : null}
      {loading && candidates.length === 0 ? (
        <p className={styles.muted}>Loading…</p>
      ) : candidates.length === 0 ? (
        <p className={styles.emptyState}>No candidate patterns have reached the {RULE_EVIDENCE_FLOOR}-sighting floor yet.</p>
      ) : (
        candidates.map((c, i) => {
          const key = `cand:${i}`;
          const ready = candidateMeetsEvidenceFloor(c);
          return (
            <div key={key} className={styles.candidateRow} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div className={styles.accountMain}>
                <span className={styles.accountName}>{candidatePatternLabel(c)}</span>
                <span className={styles.accountSub}>{c.sighting_count ?? 0} sighting{(c.sighting_count ?? 0) === 1 ? "" : "s"}{!ready ? ` (needs ${RULE_EVIDENCE_FLOOR})` : ""}</span>
              </div>
              {ready ? (
                <CandidateProposalBuilder
                  token={token} clientId={clientId} busy={busyKey === key}
                  onPropose={(kind, proposal) => void doPropose(c, key, kind, proposal)}
                />
              ) : null}
              {err?.id === key ? <p className={styles.errorText}>{err.message}{describeBankRefusal(err.reason) ? ` — ${describeBankRefusal(err.reason)}` : ""}</p> : null}
            </div>
          );
        })
      )}

      {proposedThisSession.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Proposed this session</p>
          {proposedThisSession.map((r) => (
            <ProposedRuleRow key={r.id} rule={r} busy={busyKey === r.id} err={err?.id === r.id ? err : null} onSign={() => void doSign(r)} onRetire={(reason) => void doRetire(r, reason)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** [D2/A4 fix] the per-candidate kind selector + proposal builder — the
 *  human, not the census, decides what the pattern breeds: match_settle
 *  needs {domain, counterparty_id} (0040:3172-3191, domain's counterparty
 *  kind must agree — ar↔customer, ap↔vendor); coding needs {account_code,
 *  narration_template} (0040:3192-3214). Nothing is ever sent defaulted —
 *  Propose stays disabled until the required fields are filled. */
function CandidateProposalBuilder({
  token, clientId, busy, onPropose,
}: {
  token: string;
  clientId: string;
  busy: boolean;
  onPropose: (kind: BankRuleKind, proposal: Record<string, unknown>) => void;
}) {
  const [kind, setKind] = useState<BankRuleKind>("match_settle");
  const [domain, setDomain] = useState<"ar" | "ap">("ar");
  const [counterparties, setCounterparties] = useState<CounterpartyRow[]>([]);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountCode, setAccountCode] = useState("");
  const [narrationTemplate, setNarrationTemplate] = useState("");

  useEffect(() => {
    if (kind !== "match_settle") return;
    setCounterpartyId("");
    listCounterparties(token, clientId, domain === "ar" ? "customer" : "vendor")
      .then(setCounterparties).catch(() => setCounterparties([]));
  }, [token, clientId, kind, domain]);

  useEffect(() => {
    if (kind !== "coding") return;
    listAccounts(token, clientId).then(setAccounts).catch(() => setAccounts([]));
  }, [token, clientId, kind]);

  const ready = kind === "match_settle"
    ? counterpartyId !== ""
    : accountCode !== "" && narrationTemplate.trim() !== "";

  function submit() {
    if (kind === "match_settle") onPropose("match_settle", { domain, counterparty_id: counterpartyId });
    else onPropose("coding", { account_code: accountCode, narration_template: narrationTemplate.trim() });
  }

  return (
    <div className={styles.actions} style={{ flexWrap: "wrap" }}>
      <select className={styles.select} value={kind} onChange={(e) => setKind(e.target.value as BankRuleKind)} aria-label="Rule kind">
        <option value="match_settle">match/settle</option>
        <option value="coding">coding</option>
      </select>
      {kind === "match_settle" ? (
        <>
          <select className={styles.select} value={domain} onChange={(e) => setDomain(e.target.value as "ar" | "ap")} aria-label="Domain">
            <option value="ar">AR (customer)</option>
            <option value="ap">AP (vendor)</option>
          </select>
          <select className={styles.select} value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)} aria-label="Counterparty">
            <option value="">Select…</option>
            {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </>
      ) : (
        <>
          <select className={styles.select} value={accountCode} onChange={(e) => setAccountCode(e.target.value)} aria-label="Account">
            <option value="">Select…</option>
            {accounts.map((a) => <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>)}
          </select>
          <input className={styles.input} placeholder="Narration template" value={narrationTemplate} onChange={(e) => setNarrationTemplate(e.target.value)} aria-label="Narration template" />
        </>
      )}
      <button className={styles.buttonSecondary} disabled={!ready || busy} onClick={submit}>
        {busy ? "Proposing…" : "Propose (bookkeeper)"}
      </button>
    </div>
  );
}

function ProposedRuleRow({
  rule, busy, err, onSign, onRetire,
}: {
  rule: BankRuleRow;
  busy: boolean;
  err: ActionErr;
  onSign: () => void;
  onRetire: (reason: string) => void;
}) {
  const [retireReason, setRetireReason] = useState("");
  return (
    <div className={styles.candidateRow}>
      <div className={styles.accountMain}>
        <span className={styles.accountName}>{bankRuleProposalLabel(rule)} <span className={styles.idChip}>{shortId(rule.id)}</span></span>
        <span className={styles.accountSub}>{rule.status}</span>
      </div>
      {rule.status === "proposed" ? (
        <div className={styles.actions}>
          <button className={styles.button} disabled={busy} onClick={onSign}>{busy ? "Signing…" : "Sign (owner)"}</button>
          <input className={styles.input} placeholder="Retire reason" value={retireReason} onChange={(e) => setRetireReason(e.target.value)} aria-label={`Retire reason for rule ${rule.id}`} />
          <button className={styles.buttonDanger} disabled={busy || !retireReason.trim()} onClick={() => onRetire(retireReason.trim())}>Retire (owner)</button>
        </div>
      ) : null}
      {err ? <p className={styles.errorText}>{err.message}{describeBankRefusal(err.reason) ? ` — ${describeBankRefusal(err.reason)}` : ""}</p> : null}
    </div>
  );
}
