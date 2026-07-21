"use client";

// The structured-document view for `e_invoice_xml` (MyInvois/UBL) documents (contract
// §7 / migration 0015 S6). An XML envelope has NO page geometry, so there is nothing to
// raster and nothing to place an overlay on — rendering it on a canvas or image would be
// a blank pane or a misplaced highlight. Instead this shows a PARSED-FIELD table (the
// file's own stated leaf values, a readability aid — the AUTHORITATIVE parsed facts and
// the DB-computed deltas are in the derivation table beside this) with every field
// marked `no region` (the honest WA-L7 marker), plus the RAW XML in an inert <object>
// fallback so the source is always available. Document content is inert data — never
// executed, never summed.

import { useEffect, useState } from "react";
import { extractXmlLeafFields, type XmlLeafField } from "./xmlFields";
import styles from "./cards.module.css";

export function XmlStructuredView({ blobUrl, mime }: { blobUrl: string; mime: string }) {
  const [fields, setFields] = useState<XmlLeafField[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The object URL is a local blob from already-fetched bytes — reading its text is a
    // local read (no network). Best-effort: on any trouble the raw fallback still shows.
    fetch(blobUrl)
      .then((r) => r.text())
      .then((text) => { if (!cancelled) setFields(extractXmlLeafFields(text)); })
      .catch(() => { if (!cancelled) setFields([]); });
    return () => { cancelled = true; };
  }, [blobUrl]);

  return (
    <div className={styles.docViewer}>
      <div className={styles.pageBar}><span className={styles.muted}>structured e-invoice (XML) — no page geometry</span></div>

      <p className={styles.sectionTitle}>Parsed fields (from the uploaded file)</p>
      {fields === null ? (
        <p className={styles.loadingState}>Reading the XML…</p>
      ) : fields.length === 0 ? (
        <p className={styles.emptyState}>No readable fields — see the raw XML below and the derivation table for the authoritative facts.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>field</th><th>value</th><th>region</th></tr></thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={i}>
                  <td>{f.path}</td>
                  <td>{f.value}</td>
                  <td><span className={styles.noRegion}>no captured region — verify against the document</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.sectionTitle}>Raw XML</p>
      <object key={blobUrl} className={styles.docFrame} data={blobUrl} type={mime} aria-label="Raw e-invoice XML — inert data">
        <p className={styles.muted}>
          Preview unavailable — <a href={blobUrl} target="_blank" rel="noreferrer">open the raw XML</a>.
        </p>
      </object>

      <p className={styles.inertNote}>These values are read from the uploaded file for readability — Clara never sums them. The authoritative facts and the document-vs-ledger deltas are the DB-computed derivation.</p>
    </div>
  );
}
