"use client";

// The `bank_rule_proposal` card (Wave C-c, design v2.1 §4.3/§5/§7) — mirrors
// KbRuleProposalCard exactly (a proposed→signed/retired lifecycle; signing is
// an OWNER-floor act here, one rank above the coding-rule bookkeeper+ floor,
// design §5). Identifier-only; hydrates get_bank_rule on mount. A signed rule
// elevates ONE match/settle/coding suggestion — it waives no approval gate,
// posts nothing itself, and every confirmed suggestion still runs through
// the ordinary human verb (match_bank_line/settle_from_bank_line/a manual
// coding) — this card never posts anything.

import { useCallback, useState } from "react";
import type { BankRuleProposalPart } from "../parts";
import { getBankRule, signBankRule, retireBankRule } from "../reconApi";
import { bankRuleProposalLabel } from "../../bank/reconModel";
import { useCard } from "./cardHooks";
import { shortId } from "../fmt";
import styles from "./cards.module.css";

export function BankRuleProposalCard({ token, part }: { token: string | null; part: BankRuleProposalPart }) {
  const loader = useCallback((t: string) => getBankRule(t, part.rule_id), [part.rule_id]);
  const { data, loading, busy, err, clr, act } = useCard(token, loader);
  const [retireReason, setRetireReason] = useState("");

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Bank rule proposal</span><span className={styles.idChip}>{shortId(part.rule_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load this rule proposal.</p>
      </div>
    );
  }

  const proposed = data?.status === "proposed";
  const terminal = !!data && !proposed;

  return (
    <div className={`${styles.card} ${terminal ? styles.terminal : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Bank rule proposal</span>
        <span className={styles.idChip}>{shortId(part.rule_id)}</span>
        <span className={`${styles.badge} ${styles.badgeRule}`}>{data?.kind === "coding" ? "coding" : "match/settle"}</span>
        {data ? <span className={`${styles.badge} ${terminal ? styles.badgeTerminal : styles.badgeNew}`}>{data.status}</span> : null}
      </div>

      {loading && !data ? <p className={styles.loadingState}>Loading rule proposal…</p> : null}

      {data ? (
        <>
          <p className={styles.questionText}>{bankRuleProposalLabel(data)}</p>
          <p className={styles.muted}>
            {data.created_at ? new Date(data.created_at).toLocaleString() : ""}
          </p>
          <p className={styles.hint}>A signed rule elevates ONE suggestion (design §4.3) — it never posts on its own; every confirmed match/settle or coding act still runs through the ordinary human verb.</p>

          {terminal ? (
            <p className={styles.okText}>
              {data.status === "signed" ? `Signed${data.signed_by ? ` by ${shortId(data.signed_by)}` : ""}${data.signed_at ? ` · ${new Date(data.signed_at).toLocaleString()}` : ""}.` :
                `Retired${data.retired_reason ? `: ${data.retired_reason}` : ""}.`}
            </p>
          ) : (
            <div className={styles.section}>
              <div className={styles.actions}>
                <button className={styles.button} disabled={busy} onClick={() => void act(() => signBankRule(token, data.client_id ?? "", part.rule_id))}>
                  {busy ? "Working…" : "Sign — make live (owner)"}
                </button>
                <input className={styles.reasonInput} aria-label="Retire reason" placeholder="Retire reason" value={retireReason} onChange={(e) => setRetireReason(e.target.value)} />
                <button className={styles.buttonSecondary} disabled={busy || !retireReason.trim()} onClick={() => void act(() => retireBankRule(token, data.client_id ?? "", part.rule_id, retireReason.trim()), () => setRetireReason(""))}>
                  Retire (owner)
                </button>
              </div>
              <p className={styles.hint}>Signing/retiring is an OWNER-floor act, audited (design §5) — one rank above a coding rule&apos;s bookkeeper+ floor.</p>
            </div>
          )}
        </>
      ) : null}

      {clr ? <p className={styles.refusalNote}><span className={styles.refusalBadge}>{clr.code}{clr.reason ? ` · ${clr.reason}` : ""}</span>{clr.reason === "rule_not_proposed" || clr.reason === "rule_not_signed" ? "This rule is no longer in that state." : clr.code === "CLR03" || clr.code === "CLR04" ? "Owner only." : ""}</p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
