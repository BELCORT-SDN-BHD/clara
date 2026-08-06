"use client";

// One autopost rule on the management surface (contract §6 / §7 / WA2-R7..R10). Shows
// the rule's frozen bounds (cap, count-window, hard expiry, direction, account) + its
// lifecycle band, and offers the human acts: SIGN → live (admin+ — the signature IS the
// posting authority, WA2-R7/R8) and RETIRE (proposed or live; widening is retire + a
// fresh signed successor, never an edit — WA2-R9). Bounds are immutable once live, so
// there is no edit affordance. Every figure is a DB bigint (fmtCents) — the UI computes
// none. Refusals render verbatim (CLR27 rule lifecycle / CLR04 role floor).

import { useEffect, useState } from "react";
import type { AutopostRule } from "../shared/reviewCardTypes";
import { signAutopostRule, retireAutopostRule, narrowRuleWrite, previewOcrSalesEvidence } from "../shared/reviewApi";
import type { PgrestError } from "../shared/wire";
import { fmtCents, shortId } from "../shared/fmt";
import {
  ruleUrgency, windowLabel, postsRemaining, canSign, canRetire, daysUntil,
  salesEvidenceNotApplicableLabel, taxSilentGapLabel, type SalesEvidencePreviewFetch,
} from "./model";
import styles from "./rules.module.css";

/** §7-A(b) — the signing-time evidence floor preview, rendered for sales-
 *  direction rules only (the DB answers `not_sales` for anything else, but
 *  there is no reason to ask a purchase rule to prove that on every render —
 *  `AutopostRulePanel` gates the FETCH the same way). EXPORTED so the three
 *  render states (ready / not-applicable / unavailable) can be asserted
 *  directly, the `AdjustmentTemplatePanel`'s `AdvisoryBanners`/`TemplateRow`
 *  precedent. Every count below is an INTEGER rendered verbatim from the DB —
 *  `fmtCents` (money-only, `:73-80`) never touches this block. */
export function EvidencePreview({ state }: { state: SalesEvidencePreviewFetch }) {
  if (state.kind === "loading") return null;
  if (state.kind === "unavailable") {
    return <p className={styles.muted}>evidence preview unavailable{state.error ? `: ${state.error}` : ""}.</p>;
  }
  const { preview } = state;
  if (!preview.applicable) {
    return <p className={styles.muted}>{salesEvidenceNotApplicableLabel(preview)}</p>;
  }
  const req = preview.required;
  const gap = taxSilentGapLabel(preview);
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Sales evidence floor (signing preview)</p>
      <div className={styles.bounds}>
        <span className={styles.bound}>qualifying {preview.qualifying}/{req.qualifying}</span>
        <span className={styles.bound}>distinct invoices {preview.distinct_invoices}/{req.distinct_invoices}</span>
        <span className={styles.bound}>corroborated {preview.corroborated}/{req.corroborated}</span>
        <span className={styles.bound}>span {preview.span_days ?? "—"}/{req.span_days} days</span>
        <span className={`${styles.band} ${preview.floor_met ? styles.bandReady : styles.bandReview}`}>
          {preview.floor_met ? "floor met" : "floor not yet met"}
        </span>
      </div>
      {gap ? <p className={styles.hint}>{gap}</p> : null}
      <p className={styles.hint}>
        Advisory — the sign act re-checks the live floor.
        {preview.evaluated_at ? ` Evaluated ${new Date(preview.evaluated_at).toLocaleString()}.` : ""}
      </p>
    </div>
  );
}

const BAND: Record<string, string | undefined> = {
  proposed: styles.bandReview, live: styles.bandReady, expiring: styles.bandReview,
  expired: styles.bandYou, terminal: styles.bandTerminal,
};

export function AutopostRulePanel({ token, rule, now, onChanged }: {
  token: string; rule: AutopostRule; now: Date; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clr, setClr] = useState<{ code: string; reason: string | null } | null>(null);
  const [retireReason, setRetireReason] = useState("");
  // CLR04 is the GENERIC authorization refusal (clara._human_ctx — no actor / no
  // membership / insufficient role). This panel mixes floors: signing is admin+, but
  // retiring is bookkeeper+ — so only a sign refusal may name admin.
  const [adminFloor, setAdminFloor] = useState(false);
  // §7-A(b) signing-time evidence preview — fetched (and rendered) for
  // sales-direction rules only; the DB verb answers `not_sales` for anything
  // else, but a purchase rule has no reason to spend the round trip proving
  // that. The verb ships in this same wave, so an absent-verb 404 is expected
  // during rollout and must not block the row — it degrades through the SAME
  // "unavailable" state a network failure does.
  const [preview, setPreview] = useState<SalesEvidencePreviewFetch>({ kind: "loading" });

  useEffect(() => {
    if (rule.direction !== "sales") return;
    let live = true;
    setPreview({ kind: "loading" });
    void (async () => {
      try {
        const p = await previewOcrSalesEvidence(token, rule.rule_id);
        if (live) setPreview(p ? { kind: "ready", preview: p } : { kind: "unavailable", error: null });
      } catch (e) {
        if (live) setPreview({ kind: "unavailable", error: (e as PgrestError).message ?? String(e) });
      }
    })();
    return () => { live = false; };
  }, [token, rule.rule_id, rule.direction]);

  const run = async (fn: () => Promise<unknown>, adminOnly = false) => {
    setBusy(true); setErr(null); setClr(null); setAdminFloor(adminOnly);
    try {
      // ADV-R3#6: a typed HTTP-200 refusal is NEVER success. The API layer
      // throws it error-shaped; this narrow is the belt should any caller
      // return the raw union — either way it renders through the refusal UI
      // and onChanged() never fires.
      const out = narrowRuleWrite(await fn());
      if (out.status === "refused") {
        setErr(`refused: ${out.reason}`);
        setClr({ code: "CLR27", reason: out.reason });
        return;
      }
      onChanged();
    } catch (e) {
      const pe = e as PgrestError;
      setErr(pe.message ?? String(e));
      if (pe.clr) setClr({ code: pe.clr, reason: pe.reason ?? null });
    } finally {
      setBusy(false);
    }
  };

  const urgency = ruleUrgency(rule, now);
  const remaining = postsRemaining(rule);
  const dToExpiry = daysUntil(rule.expires_at, now);

  return (
    <div className={`${styles.rule} ${urgency === "terminal" ? styles.terminal : ""}`}>
      <div className={styles.ruleHead}>
        <span className={styles.ruleTitle}>{rule.counterparty_name ?? "(counterparty)"} → {rule.account_code ?? "(account)"}{rule.account_name ? ` · ${rule.account_name}` : ""}</span>
        <span className={styles.idChip}>{shortId(rule.rule_id)}</span>
        {rule.direction ? <span className={styles.badge}>{rule.direction}</span> : null}
        <span className={`${styles.band} ${BAND[urgency] ?? ""}`}>{urgency}</span>
        {rule.supersedes_rule_id ? <span className={styles.muted}>supersedes {shortId(rule.supersedes_rule_id)}</span> : null}
      </div>

      <div className={styles.bounds}>
        <span className={styles.bound}>cap {fmtCents(rule.amount_cap_cents)}</span>
        <span className={styles.bound}>{windowLabel(rule)}{remaining !== null ? ` · ${remaining} left this window` : ""}</span>
        <span className={styles.bound}>
          {rule.expires_at ? `expires ${new Date(rule.expires_at).toLocaleDateString()}` : "no expiry set"}
          {dToExpiry !== null ? (dToExpiry < 0 ? " · expired" : ` · ${dToExpiry}d left`) : ""}
        </span>
        {rule.signed_by ? <span className={styles.bound}>signed by {shortId(rule.signed_by)}</span> : null}
      </div>

      {rule.status === "retired" || rule.status === "declined" ? (
        <p className={styles.muted}>{rule.status}{rule.reason ? `: ${rule.reason}` : ""}.</p>
      ) : null}

      {rule.direction === "sales" ? <EvidencePreview state={preview} /> : null}

      {(canSign(rule) || canRetire(rule)) ? (
        <div className={styles.actions}>
          {canSign(rule) ? (
            <button className={styles.button} disabled={busy} onClick={() => void run(() => signAutopostRule(token, rule.rule_id), true)}>
              {busy ? "Working…" : "Sign — make live (admin+)"}
            </button>
          ) : null}
          {canRetire(rule) ? (
            <>
              <input className={styles.reasonInput} aria-label="Retire reason" placeholder="Retire reason" value={retireReason} onChange={(e) => setRetireReason(e.target.value)} />
              <button className={styles.buttonSecondary} disabled={busy || !retireReason.trim()} onClick={() => void run(() => retireAutopostRule(token, rule.rule_id, retireReason.trim()))}>
                Retire
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      <p className={styles.hint}>Bounds are frozen once live — widening a cap means retiring this rule and signing a fresh successor (append-only genealogy). Signing is the posting authority; the agent never signs.</p>

      {clr ? <p className={styles.refusalNote}><span className={styles.refusalBadge}>{clr.code}{clr.reason ? ` · ${clr.reason}` : ""}</span>{clr.code === "CLR04" && adminFloor ? "Signing a rule live requires admin." : ""}</p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
