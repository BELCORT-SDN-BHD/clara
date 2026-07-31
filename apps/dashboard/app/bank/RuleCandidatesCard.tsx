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
// SUBSTRATE GAP, RECORDED LOUDLY (see build-0040/u1-notes.md): the design's
// §6 read table names NO `list_bank_rules(client)` — only the breeding
// census. So a rule this card just proposed (or one proposed in an earlier
// session) cannot be RE-LISTED here; this card tracks only rules IT minted
// THIS SESSION (their ids came back from propose_bank_rule's own return
// value) and offers sign/retire on those. A rule proposed elsewhere (chat, a
// different tab) is invisible to this card until a list RPC exists.

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import { listBankRuleCandidates, proposeBankRule, signBankRule, retireBankRule } from "../shared/reconApi";
import {
  bankRuleProposalLabel, candidateMeetsEvidenceFloor, RULE_EVIDENCE_FLOOR,
  type BankRuleCandidateRow, type BankRuleRow,
} from "./reconModel";
import { describeBankRefusal } from "./matchModel";
import { shortId } from "../shared/fmt";
import styles from "./bank.module.css";

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

  async function doPropose(c: BankRuleCandidateRow, key: string) {
    setBusyKey(key);
    setErr(null);
    try {
      const rule = await proposeBankRule(token, { clientId, kind: c.kind as "match_settle" | "coding", pattern: c.pattern, proposal: c.proposal });
      setProposedThisSession((rows) => [rule, ...rows]);
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
            <div key={key} className={styles.candidateRow}>
              <div className={styles.accountMain}>
                <span className={styles.accountName}>{bankRuleProposalLabel(c)}</span>
                <span className={styles.accountSub}>{c.sighting_count ?? 0} sighting{(c.sighting_count ?? 0) === 1 ? "" : "s"}{!ready ? ` (needs ${RULE_EVIDENCE_FLOOR})` : ""}</span>
              </div>
              <button className={styles.buttonSecondary} disabled={!ready || busyKey === key} onClick={() => void doPropose(c, key)}>
                {busyKey === key ? "Proposing…" : "Propose (bookkeeper)"}
              </button>
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
