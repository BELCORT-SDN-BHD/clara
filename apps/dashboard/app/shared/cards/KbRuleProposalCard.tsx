"use client";

// The `kb_rule_proposal` card (contract §6 / WA-R9): a proposed vendor→account
// coding rule (auto-proposed after 3 congruent approvals, or directly authored),
// with its originating question. Identifier-only; hydrates get_coding_rule +
// get_open_question. Going LIVE requires a human signature (bookkeeper+, audited);
// decline records a reason. A signed rule resolves the ACCOUNT-CHOICE dimension ONLY
// (WA-D4) — it waives no approval gate. Terminal (live/declined/retired) is inert.

import { useCallback, useState } from "react";
import type { KbRuleProposalPart } from "../parts";
import { getCodingRule, getOpenQuestion, signCodingRule, declineCodingRule } from "../reviewApi";
import { useCard } from "./cardHooks";
import { shortId } from "../fmt";
import type { CodingRule, OpenQuestion } from "../reviewCardTypes";
import styles from "./cards.module.css";

type RuleBundle = { rule: CodingRule; question: OpenQuestion | null };

export function KbRuleProposalCard({ token, part }: { token: string | null; part: KbRuleProposalPart }) {
  const loader = useCallback(
    async (t: string): Promise<RuleBundle> => ({
      rule: await getCodingRule(t, part.rule_id),
      question: part.question_id ? await getOpenQuestion(t, part.question_id).catch(() => null) : null,
    }),
    [part.rule_id, part.question_id],
  );
  const { data, loading, busy, err, clr, act } = useCard(token, loader);
  const [declineReason, setDeclineReason] = useState("");

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Coding rule proposal</span><span className={styles.idChip}>{shortId(part.rule_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load this rule proposal.</p>
      </div>
    );
  }

  const rule = data?.rule ?? null;
  const proposed = rule?.status === "proposed";
  const terminal = !!rule && !proposed;

  return (
    <div className={`${styles.card} ${terminal ? styles.terminal : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Coding rule proposal</span>
        <span className={styles.idChip}>{shortId(part.rule_id)}</span>
        <span className={`${styles.badge} ${styles.badgeRule}`}>rule</span>
        {rule ? <span className={`${styles.badge} ${terminal ? styles.badgeTerminal : styles.badgeNew}`}>{rule.status}</span> : null}
      </div>

      {loading && !data ? <p className={styles.loadingState}>Loading rule proposal…</p> : null}

      {rule ? (
        <>
          <p className={styles.questionText}>
            {rule.counterparty_name ?? "This vendor"} → {rule.account_code ?? "(account)"}{rule.account_name ? ` · ${rule.account_name}` : ""}
          </p>
          <p className={styles.muted}>
            {rule.origin ? `${rule.origin} · ` : ""}
            {rule.sighting_count !== null ? `${rule.sighting_count} congruent approval${rule.sighting_count === 1 ? "" : "s"} · ` : ""}
            {rule.created_at ? new Date(rule.created_at).toLocaleString() : ""}
          </p>
          {data?.question ? <p className={styles.muted}>Question: {data.question.question}</p> : null}
          <p className={styles.hint}>A signed rule elevates the ACCOUNT choice only — it never waives duplicate, amount, currency, consent, high-stakes, or attribution checks.</p>

          {terminal ? (
            <p className={styles.okText}>
              {rule.status === "live" ? `Signed live${rule.signed_by ? ` by ${shortId(rule.signed_by)}` : ""}${rule.signed_at ? ` · ${new Date(rule.signed_at).toLocaleString()}` : ""}.` :
               rule.status === "declined" ? `Declined${rule.reason ? `: ${rule.reason}` : ""}.` :
               `Retired${rule.reason ? `: ${rule.reason}` : ""}.`}
            </p>
          ) : (
            <div className={styles.section}>
              <div className={styles.actions}>
                <button className={styles.button} disabled={busy} onClick={() => void act(() => signCodingRule(token, part.rule_id))}>
                  {busy ? "Working…" : "Sign — make live"}
                </button>
                <input className={styles.reasonInput} aria-label="Decline reason" placeholder="Decline reason" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
                <button className={styles.buttonSecondary} disabled={busy || !declineReason.trim()} onClick={() => void act(() => declineCodingRule(token, part.rule_id, declineReason.trim()), () => setDeclineReason(""))}>
                  Decline
                </button>
              </div>
              <p className={styles.hint}>Signing is a bookkeeper+ act, audited. Pinned rules never auto-retire — a contradicting approval opens a conflict question.</p>
            </div>
          )}
        </>
      ) : null}

      {clr ? <p className={styles.refusalNote}><span className={styles.refusalBadge}>{clr.code}{clr.reason ? ` · ${clr.reason}` : ""}</span>{clr.reason === "duplicate_live" ? "A live rule already exists for this vendor." : clr.reason === "role_floor" ? "Owner/bookkeeper only." : ""}</p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
