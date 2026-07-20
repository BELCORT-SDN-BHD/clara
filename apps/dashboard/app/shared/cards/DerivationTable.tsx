// The doc_review derivation panel (contract §5/§7 / WA-L7 / PIN-ADD-2). Pure
// presentational: renders the DB-computed get_doc_entry_diff rows — document value vs
// entry value + delta (all DB figures; the UI never sums). A field with NO captured
// region renders the honest WA-L7 marker. A field WITH a region is a page-jump button;
// when its locator is a placeable `page_polygon` the button carries a POLYGON badge and
// picking it drives the overlay. Any other locator_kind / unplaceable / absent locator
// keeps page-jump only (today's rendering). Extracted so it is unit-testable without a
// token or the async byte fetch.

import type { DocEntryField } from "../reviewTypes";
import { parsePagePolygon } from "./regionGeometry";
import { fmtDeltaCents, shortId } from "../fmt";
import styles from "./cards.module.css";

function deltaClass(cents: number | null): string {
  if (cents === null || cents === 0) return styles.deltaZero ?? "";
  return (cents > 0 ? styles.deltaPos : styles.deltaNeg) ?? "";
}

export function DerivationTable({ fields, activeIndex, onPickRegion }: {
  fields: DocEntryField[];
  activeIndex: number | null;
  onPickRegion: (field: DocEntryField, index: number) => void;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>field</th><th>document</th><th>entry</th><th className={styles.num}>delta</th></tr></thead>
        <tbody>
          {fields.map((f, i) => {
            const hasPolygon = parsePagePolygon(f.doc_region_locator_kind, f.doc_region_locator) !== null;
            const hasRegion = !f.no_region && (f.doc_page !== null || f.doc_region_id !== null);
            return (
              <tr key={i}>
                <td>{f.field}</td>
                <td>
                  {f.no_region ? (
                    <span className={styles.noRegion}>no captured region — verify against the document</span>
                  ) : hasRegion ? (
                    <button
                      type="button"
                      className={`${styles.regionButton} ${activeIndex === i ? styles.regionActive : ""}`}
                      onClick={() => onPickRegion(f, i)}
                      title={f.doc_region_id ? `region ${shortId(f.doc_region_id)}` : undefined}
                    >
                      {f.doc_value ?? "(cited)"}{f.doc_page ? ` · p${f.doc_page}` : ""}
                      {hasPolygon ? <span className={styles.polygonBadge}>polygon</span> : null}
                    </button>
                  ) : (
                    <span>{f.doc_value ?? "—"}</span>
                  )}
                </td>
                <td>{f.entry_value ?? "—"}</td>
                <td className={`${styles.num} ${deltaClass(f.delta_cents)}`}>{f.delta_cents !== null ? fmtDeltaCents(f.delta_cents) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
