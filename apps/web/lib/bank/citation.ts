// #990 — the OPTIONAL per-line source citation a bank statement line can carry: which page and
// region it was read from, on the OCR/witness intake lane only. Owner ruling 2026-09-20: "the
// two lanes that honestly have no page, the CSV import and the hand-keyed month, must say so in
// words rather than leave a person wondering whether a citation is missing or simply absent" —
// nothing dark, no blank control.
//
// THREE STATES, NOT TWO. "present" (a machine lane captured a citation for this line) and
// "lane_none" (a structured/human line, which structurally never has one) are the two the ruling
// names. "not_recorded" is a third, narrower state this module adds: a machine-lane line that has
// not (yet) had its citation populated — legitimately possible today (no live producer states one
// yet, packages/db/README.md's #990/0291 section names it a residual closed as a successor
// contract), and a state distinct enough from "lane_none" that collapsing the two would misreport
// a CSV import as a machine read that merely missed its citation.

export type CitationState = "present" | "lane_none" | "not_recorded";

const LANES_WITH_NO_CITATION = new Set(["structured", "human"]);

/** Which of the three states a line's own (ingest_mode, citation_page) pair is in. Pure and
 *  ingest_mode-driven only — this module never reasons about the raw region locator, which it
 *  does not render (out of scope for #990's surfaces: a polygon is not something a human reads).
 *  An unrecognised or absent ingest_mode is treated as a machine lane's own silence rather than
 *  as "no citation possible" — only the two NAMED lanes structurally lack one. */
export function citationState(ingestMode: string | null, citationPage: number | null): CitationState {
  if (ingestMode !== null && LANES_WITH_NO_CITATION.has(ingestMode)) return "lane_none";
  return citationPage === null ? "not_recorded" : "present";
}

/** The rendered sentence for one line's source-citation cell, from the app's own message
 *  catalogue (never a hardcoded string, per the owner ruling) — shared by the Matching tab's
 *  detail pane and its outcome block so the two surfaces can never drift apart. */
export function citationLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  ingestMode: string | null,
  citationPage: number | null,
): string {
  const state = citationState(ingestMode, citationPage);
  if (state === "present") return t("citationPage", { page: citationPage as number });
  if (state === "lane_none") return t("citationLaneNone");
  return t("citationNotRecorded");
}
