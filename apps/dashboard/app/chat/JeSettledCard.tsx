// The je_review terminal surfaces (Wave A2.1 contract §6.1). A settled entry renders
// a TRUE receipt — the same visual block the in-session outcome shows — keyed on the
// DB-reported status from the 0016 slim settled payload (a hydrated non-draft
// status; there is no client-side bridge — a terminal state is unprovable from a
// null hydration). When hydration returns null, the honest shell: it claims nothing
// it cannot prove. NEVER the fabricated unknown/RM 0.00 shell. No figure is computed
// here — the only values rendered are DB-returned strings.

import type { DraftReview } from "./review";
import { settledReceiptCopy, REVIEW_GONE_COPY, type SettledState } from "../shared/settledState";
import styles from "./chat.module.css";

/** The terminal receipt: approved/withdrawn wording (settledReceiptCopy — the single
 *  source, shared with the in-session outcome) plus the DB's terminal metadata from
 *  the slim payload (approved_at/withdrawn_at, checker_actor/withdrawn_by,
 *  withdrawal_reason) and posting date / memo, when present. */
export function JeSettledReceipt({ entryId, settled, review }: { entryId: string; settled: SettledState; review: DraftReview | null }) {
  return (
    <div className={styles.jeCard}>
      <div className={styles.jeHead}>
        <strong>Journal entry review</strong>
        <span className={styles.muted}>{entryId.slice(0, 8)} · {settled.status}</span>
      </div>
      <p className={styles.okText}>{settledReceiptCopy(settled.status)}</p>
      {review?.posting_date || review?.memo ? (
        <div className={styles.jeMeta}>
          <span>posting {review?.posting_date ?? "—"}</span>
          {review?.memo ? <span>· {review.memo}</span> : null}
        </div>
      ) : null}
      {settled.at || settled.actor || settled.reason ? (
        <p className={styles.muted}>
          settled{settled.actor ? ` by ${settled.actor.slice(0, 8)}` : ""}
          {settled.at ? ` · ${new Date(settled.at).toLocaleString()}` : ""}
          {settled.reason ? ` — ${settled.reason}` : ""}
        </p>
      ) : null}
    </div>
  );
}

/** The honest shell — hydration returned null (a settled entry pre-0016, or a
 *  scope/visibility miss). No status claim: neither is provable from here. */
export function JeReviewGoneShell({ entryId }: { entryId: string }) {
  return (
    <div className={styles.jeCard}>
      <div className={styles.jeHead}>
        <strong>Journal entry review</strong>
        <span className={styles.muted}>{entryId.slice(0, 8)}</span>
      </div>
      <p className={styles.muted}>{REVIEW_GONE_COPY}</p>
    </div>
  );
}
