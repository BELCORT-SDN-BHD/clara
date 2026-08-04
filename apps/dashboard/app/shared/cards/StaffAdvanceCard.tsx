"use client";

// The `staff_advance` card (Wave D-b, design `wave-d-b-design.md` §3.2/§3.4).
// Identifier-only (advance_id + client_id); hydrates get_staff_advance on
// mount — which itself reads THROUGH staff_advance_summary and picks the row
// by id (advancesApi.ts's own D4-precedent note: there is no single-row
// getter in the ABI). READ-ONLY here — every outstanding/cents figure is
// DB-derived; particulars completion and applications stay the /advances
// workbench's job, the same "receipt vs editor" split FixedAssetCard/
// BankReconReceiptCard draw between an inert card and the workbench that
// produced it.

import { useCallback } from "react";
import type { StaffAdvancePart } from "../parts";
import { getStaffAdvance, type GetStaffAdvanceRead } from "../advancesApi";
import { advanceRowHasOutstanding } from "../../advances/advancesModel";
import { useCard } from "./cardHooks";
import { fmtCents, shortId } from "../fmt";
import styles from "./cards.module.css";

export function StaffAdvanceCard({ token, part }: { token: string | null; part: StaffAdvancePart }) {
  const loader = useCallback(
    (t: string): Promise<GetStaffAdvanceRead> => getStaffAdvance(t, part.client_id, part.advance_id),
    [part.client_id, part.advance_id],
  );
  const { data: read, loading, err } = useCard(token, loader);

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Staff advance</span><span className={styles.idChip}>{shortId(part.advance_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load this advance.</p>
      </div>
    );
  }

  return <StaffAdvanceCardView part={part} read={read} loading={loading} err={err} />;
}

/** The card's rendered body, PURE and exported so all four of its states —
 *  loaded / unavailable / not-on-the-register / not-yet-loaded — can be
 *  rendered and asserted directly. Round 3's lesson: a state only reachable
 *  through a network effect is a state no cell can ask about, and the blank
 *  body it used to paint is exactly the state nobody asked about. */
export function StaffAdvanceCardView({
  part, read, loading, err,
}: {
  part: StaffAdvancePart;
  read: GetStaffAdvanceRead | null;
  loading: boolean;
  err: string | null;
}) {
  const data = read?.advance ?? null;
  const settled = data ? !advanceRowHasOutstanding(data) : false;

  return (
    <div className={`${styles.card} ${data?.voided || settled ? styles.terminal : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Staff advance</span>
        <span className={styles.idChip}>{shortId(part.advance_id)}</span>
        {data ? (
          <span className={`${styles.badge} ${data.voided ? styles.badgeTerminal : settled ? styles.badgeNew : styles.badgeWarn}`}>
            {data.voided ? "voided" : settled ? "settled" : "outstanding"}
          </span>
        ) : null}
      </div>

      {loading && !data ? <p className={styles.loadingState}>Loading advance…</p> : null}

      {data ? (
        <>
          <p className={styles.muted}>
            {part.label ?? data.person_label}{data.account_code ? ` · ${data.account_code}` : ""}
            {data.issue_date ? ` · issued ${data.issue_date}` : ""}
          </p>
          <div className={styles.countGrid}>
            <div className={styles.countTile}><div className={styles.countNum}>{fmtCents(data.amount_cents)}</div><div className={styles.countLabel}>issued</div></div>
            <div className={styles.countTile}><div className={styles.countNum}>{fmtCents(data.outstanding_cents)}</div><div className={styles.countLabel}>outstanding</div></div>
            <div className={styles.countTile}><div className={styles.countNum}>{data.days_outstanding ?? "—"}</div><div className={styles.countLabel}>days</div></div>
          </div>
          {data.purpose ? <p className={styles.muted}>{data.purpose}</p> : <p className={styles.hint}>Particulars incomplete — complete them on the /advances workbench.</p>}
          <p className={styles.hint}>
            Every figure above is the DB&apos;s (design §3.2 the outstanding equation) — this card renders it
            verbatim, as of the DB&apos;s own register date{read?.as_of ? ` (${read.as_of})` : ""}. Applications and
            enrolment acts happen on the /advances workbench.
          </p>
        </>
      ) : null}

      {/* [round-3 fix] THE THREE HONEST EMPTIES. This card used to render title +
          id chip and NOTHING else on a null read — no error, no "not found" —
          and null was reachable for an advance that genuinely exists (the
          browser-UTC as-of bug, now fixed in advancesApi). A card that shows
          nothing is a card that says "everything is fine". */}
      {!loading && !data && read && !read.available ? (
        <p className={styles.errorText}>
          The staff-advance register could not be read, so nothing can be said about this advance — this is
          UNAVAILABLE, not &ldquo;no such advance&rdquo;.
        </p>
      ) : null}
      {!loading && !data && read?.available ? (
        <p className={styles.muted}>
          Not on the register as of the DB&apos;s own date{read.as_of ? ` (${read.as_of})` : ""} — an advance is
          listed from its issue date onward, so a future-dated one appears when it is issued. Check the
          /advances workbench if you expected it here.
        </p>
      ) : null}
      {!loading && !data && !read && !err ? (
        <p className={styles.muted}>This advance has not been loaded.</p>
      ) : null}

      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
