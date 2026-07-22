"use client";

// The structured-document view for `e_invoice_xml` (MyInvois/UBL) documents (contract
// §7 / migration 0015 S6). An XML envelope has NO page geometry, so there is nothing to
// raster and nothing to place an overlay on — rendering it on a canvas or image would be
// a blank pane or a misplaced highlight. Instead this shows a PARSED-FIELD table (the
// file's own stated leaf values, a readability aid — the AUTHORITATIVE parsed facts and
// the DB-computed deltas are in the derivation table beside this) with every field
// marked `no region` (the honest WA-L7 marker), plus the RAW XML as ESCAPED, INERT text.
//
// SECURITY (defence-in-depth): the raw XML is NEVER placed in an <object>/<iframe> or
// opened in a new tab. An uploaded XML/SVG can carry <script> or an active XSLT
// stylesheet, so loading it as a same-origin browsing context under the app origin would
// be stored XSS. We render the bytes as a TEXT NODE inside a <pre> (React escapes a
// string child — no dangerouslySetInnerHTML) and offer ONLY a forced-attachment download
// (the `download` attribute — not an inline-render target). A strict Content-Security-
// Policy is the backstop; this render discipline is the first wall. Document content is
// inert data — never executed, never summed.

import { useEffect, useState } from "react";
import { extractXmlLeafFields, type XmlLeafField } from "./xmlFields";
import styles from "./cards.module.css";

export function XmlStructuredView({ blobUrl }: { blobUrl: string }) {
  const [fields, setFields] = useState<XmlLeafField[] | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The object URL is a local blob from already-fetched bytes — reading its text is a
    // local read (no network). Best-effort: on any trouble the empty states still show.
    fetch(blobUrl)
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return;
        setRawText(text);
        setFields(extractXmlLeafFields(text));
      })
      .catch(() => {
        if (cancelled) return;
        setRawText("");
        setFields([]);
      });
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

      <RawXmlBlock text={rawText} blobUrl={blobUrl} />

      <p className={styles.inertNote}>These values are read from the uploaded file for readability — Clara never sums them. The authoritative facts and the document-vs-ledger deltas are the DB-computed derivation.</p>
    </div>
  );
}

/** The raw source shown as ESCAPED text + a download-only link (never an <object>,
 *  <iframe>, or new tab — see the security note above). Exported so the render
 *  discipline is unit-testable in isolation: given hostile bytes the output must carry
 *  no active-embed element and no new-tab target, only escaped text and a `download`. */
export function RawXmlBlock({ text, blobUrl }: { text: string | null; blobUrl: string }) {
  return (
    <>
      <p className={styles.sectionTitle}>Raw XML (inert text)</p>
      {text === null ? (
        <p className={styles.loadingState}>Reading the XML…</p>
      ) : (
        // React escapes this string child to a text node — the XML is displayed, never
        // parsed into an active document. No dangerouslySetInnerHTML; no embed element.
        <pre className={styles.rawXml}>{text}</pre>
      )}
      <p className={styles.muted}>
        The raw XML is shown above as inert text.{" "}
        <a href={blobUrl} download="e-invoice.xml">Download the file</a> to open it in your own tools.
      </p>
    </>
  );
}
