"use client";

// The `doc_review` card (contract §5 / WA-R8 / WA-L7): the split-view evidence
// surface — the document bytes beside the entry, with the DB-computed doc↔entry
// derivation. Also the /queue detail pane. Identifier-only; hydrates get_doc_entry_diff
// + get_draft_review (+ the bytes route, in DocViewer). READ-ONLY (approval is the
// je_review card's job). The UI NEVER sums — every delta is a DB figure. A field with
// NO captured region renders the honest WA-L7 marker; a region row is a page-jump
// button into the viewer. Document text is inert data everywhere.

import { useCallback, useState } from "react";
import type { DocReviewPart } from "../parts";
import { getDocEntryDiff } from "../reviewApi";
import { getDraftReview, type DraftReview } from "../../chat/review";
import { useCard } from "./cardHooks";
import { fmtCents, shortId } from "../fmt";
import type { DocEntryDiff, DocEntryField } from "../reviewTypes";
import { DocViewer } from "./DocViewer";
import { DerivationTable } from "./DerivationTable";
import { parsePagePolygon, type Pt } from "./regionGeometry";
import styles from "./cards.module.css";

type DocReviewData = { diff: DocEntryDiff; review: DraftReview | null };
type ActiveRegion = { index: number; page: number | null; overlay: Pt[] | null };

export function DocReviewCard({ token, part }: { token: string | null; part: DocReviewPart }) {
  const loader = useCallback(
    async (t: string): Promise<DocReviewData> => ({
      diff: await getDocEntryDiff(t, part.entry_id, part.client_id),
      review: await getDraftReview(t, part.entry_id, part.client_id).catch(() => null),
    }),
    [part.entry_id, part.client_id],
  );
  const { data, loading, err, clr } = useCard(token, loader);
  const [activeRegion, setActiveRegion] = useState<ActiveRegion | null>(null);

  // PIN-ADD-2: a page_polygon locator becomes an image overlay; any other kind (or an
  // absent/unplaceable locator) drives page-jump only — the honest degradation.
  const pickRegion = (f: DocEntryField, index: number) => {
    const poly = parsePagePolygon(f.doc_region_locator_kind, f.doc_region_locator);
    setActiveRegion({ index, page: f.doc_page ?? poly?.page ?? null, overlay: poly?.points ?? null });
  };

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Document review</span><span className={styles.idChip}>{shortId(part.document_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load the document and its derivation.</p>
      </div>
    );
  }

  const review = data?.review ?? null;

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Document review</span>
        <span className={styles.idChip}>doc {shortId(part.document_id)}</span>
        <span className={styles.idChip}>entry {shortId(part.entry_id)}</span>
        {review ? <span className={styles.muted}>{review.status}</span> : null}
      </div>

      {loading && !data ? <p className={styles.loadingState}>Loading document review…</p> : null}

      <div className={styles.docReviewGrid}>
        <DocViewer token={token} documentId={part.document_id} page={activeRegion?.page ?? null} overlay={activeRegion?.overlay ?? null} />

        <div>
          {review ? (
            <div className={styles.entrySummary}>
              <div className={styles.cardHead}>
                <span className={styles.cardTitle}>Entry</span>
                {review.vendor ? <span className={styles.muted}>{review.vendor.name}</span> : null}
                {review.posting_date ? <span className={styles.muted}>· posting {review.posting_date}</span> : null}
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>account</th><th className={styles.num}>debit</th><th className={styles.num}>credit</th></tr></thead>
                  <tbody>
                    {review.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.account_code}{l.account_name ? ` · ${l.account_name}` : ""}</td>
                        <td className={styles.num}>{l.debit_cents ? fmtCents(l.debit_cents) : ""}</td>
                        <td className={styles.num}>{l.credit_cents ? fmtCents(l.credit_cents) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className={styles.derivation}>
            <p className={styles.sectionTitle}>Derivation — document vs entry (DB-computed)</p>
            {data && data.diff.fields.length === 0 && !loading ? <p className={styles.emptyState}>No corroborated fields to compare.</p> : null}
            {data ? <DerivationTable fields={data.diff.fields} activeIndex={activeRegion?.index ?? null} onPickRegion={pickRegion} /> : null}
            <p className={styles.inertNote}>A document-vs-ledger divergence is evidence FOR document-grounded coding — Clara never sums these figures. A cited region opens on its page; a polygon region also highlights on the image or PDF page.</p>
          </div>

          {review && review.evidence.length > 0 ? (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>Cited evidence</p>
              <ul className={styles.evidenceList}>
                {review.evidence.map((e, i) => (
                  <li key={i} className={styles.evidenceRow}>
                    <span className={`${styles.cite} ${e.provenance_tier === "verified" ? styles.citeVerified : styles.citeRead}`}>{e.provenance_tier === "verified" ? "corroborated" : "read"}</span>
                    <span className={styles.muted}>{e.field_path ?? "fact"}{e.region_id ? ` · region ${shortId(e.region_id)}` : ""}:</span>
                    <span>&ldquo;{e.quote}&rdquo;</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {clr ? <p className={styles.refusalNote}><span className={styles.refusalBadge}>{clr.code}{clr.reason ? ` · ${clr.reason}` : ""}</span></p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
