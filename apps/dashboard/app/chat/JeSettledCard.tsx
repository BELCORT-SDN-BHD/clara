// The je_review terminal surfaces (Wave A2.1 contract §6.1). A settled entry renders
// a TRUE receipt — the same visual block the in-session outcome shows — keyed on the
// DB-reported status (hydrated from the future 0016 slim payload, or learned via the
// get_entry_diff bridge). When even the bridge yields nothing, the honest shell.
// NEVER the fabricated unknown/RM 0.00 shell. No figure is computed here — the only
// values rendered are DB-returned strings.

import type { DraftReview } from "./review";
import { settledReceiptCopy, SETTLED_GONE_COPY, type SettledState } from "../shared/settledState";
import styles from "./chat.module.css";

/** The terminal receipt: approved/withdrawn wording (in-session copy, verbatim) plus
 *  whatever the DB reported about the settling revision (bridge) or the slim payload
 *  (posting date / memo, when present). */
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
      {settled.at || settled.actor_kind || settled.reason ? (
        <p className={styles.muted}>
          settled{settled.actor_kind ? ` by ${settled.actor_kind}` : ""}
          {settled.at ? ` · ${new Date(settled.at).toLocaleString()}` : ""}
          {settled.reason ? ` — ${settled.reason}` : ""}
        </p>
      ) : null}
    </div>
  );
}

/** The honest shell — hydration returned null and the bridge could not say why. */
export function JeSettledShell({ entryId }: { entryId: string }) {
  return (
    <div className={styles.jeCard}>
      <div className={styles.jeHead}>
        <strong>Journal entry review</strong>
        <span className={styles.muted}>{entryId.slice(0, 8)}</span>
      </div>
      <p className={styles.muted}>{SETTLED_GONE_COPY}</p>
    </div>
  );
}
