// @frozen — judgement logic (Wave E lane zeta; design part2 §7 gate 3, "the pre-seal claim scan,
// which OBSERVES THE FINAL PDF").
//
// THE SCAN, as pure functions. The impure half — decompressing the produced PDF with a pinned
// extractor — lives in extract.mjs; everything that DECIDES lives here, so the gate can be
// exercised against fixture text with no PDF, no container and no database.
//
// WHAT THE GATE IS FOR. A raw byte scan of a PDF proves nothing: page text lives in
// FlateDecode-compressed content streams and font subsetting routinely splits a phrase across
// separate Tj operators. So the scan closes the gap between "what the renderer says it drew" and
// "what the artifact says" by extracting text FROM THE PRODUCED BYTES and reading that.
//
// ===================================================================================
// THE RULING THIS MODULE EXISTS TO ENFORCE, recorded during lane epsilon's build:
//   A LOCALE WITH NO EFFECTIVE LEXICON ROW IS A REFUSAL, NEVER A PASS.
// An empty lexicon makes every scan return "no claim phrase found", which is the same answer a
// clean document gives. That is the absence-as-evidence defect in its purest form: the gate would
// report success precisely when it had lost the ability to fail. A Malay or Chinese claim phrase
// smuggled into an English pack must not escape unmatched merely because nobody seeded ms/zh
// rows — so the scan requires effective rows for EVERY ruled locale and refuses otherwise, and
// it matches against ALL locales' phrases regardless of the document's own locale.
// ===================================================================================

import { RenderRefusal } from "./decisions.mjs";

/** The three ruled locales (clara.claim_phrase_lexicon's own CHECK). */
export const RULED_LOCALES = Object.freeze(["en", "ms", "zh"]);

/**
 * The comparison form. NFKC-fold, lowercase, drop format/zero-width characters, then remove ALL
 * whitespace.
 *
 * REMOVING WHITESPACE ENTIRELY IS DELIBERATE, and it is the one place this module trades
 * precision for safety on purpose. Extraction reflows text: a phrase can arrive with a line break
 * in its middle, doubled spaces from justification, or — for CJK, which has no word spaces at all
 * — spaces inserted between individual glyphs. Collapsing to a single space would still miss the
 * CJK case. Removing whitespace can, in principle, make a phrase match across a word boundary
 * that a human would not call a match; that error direction produces a REFUSAL of a document,
 * which a preparer can inspect and appeal. The opposite error — failing to see a compliance claim
 * that is really on the page — ships a false statutory claim to a client. Those are not
 * symmetric, and this function is tuned for the survivable one.
 */
export function normalizeForMatch(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    // Zero-width space/non-joiner/joiner, BOM, soft hyphen, bidi marks: invisible, and each one
    // is a way to break a phrase into two that a reader still sees as one.
    .replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/gu, "")
    .replace(/\s+/gu, "");
}

/**
 * THE COVERAGE GATE. Every ruled locale must contribute at least one usable phrase, and every row
 * must carry a match_kind this scanner actually implements. An unknown match_kind is a refusal
 * rather than a skip: a row the scanner silently ignored is a phrase nobody is looking for.
 */
export function assertLexiconCoverage(lexicon) {
  if (!Array.isArray(lexicon)) {
    throw new RenderRefusal("claim_lexicon_unreadable",
      "the claim-phrase lexicon is absent or is not a list; a scan with no lexicon cannot fail and must not pass");
  }
  const usable = lexicon.filter(
    (r) => r && typeof r.phrase === "string" && normalizeForMatch(r.phrase).length > 0,
  );
  const unknownKinds = [...new Set(usable.map((r) => r.match_kind).filter((k) => k !== "substring_ci"))];
  if (unknownKinds.length > 0) {
    throw new RenderRefusal("claim_lexicon_match_kind_unknown",
      "the lexicon carries a match_kind this scanner does not implement",
      { unknown_match_kinds: unknownKinds });
  }
  const missing = RULED_LOCALES.filter((loc) => !usable.some((r) => r.locale === loc));
  if (missing.length > 0) {
    throw new RenderRefusal("claim_lexicon_locale_missing",
      `the claim-phrase lexicon has no effective row for ${missing.join(", ")}; a locale with no lexicon is a refusal, never a pass`,
      { missing_locales: missing, ruled: RULED_LOCALES,
        fix: "seed effective clara.claim_phrase_lexicon rows for every ruled locale before any pack renders" });
  }
  return { usable, byLocale: Object.fromEntries(RULED_LOCALES.map((l) => [l, usable.filter((r) => r.locale === l).length])) };
}

/**
 * Every lexicon phrase found in the text, across EVERY locale. The document's own locale is not
 * a filter: a pack written in English that carries a Malay compliance phrase is the smuggle this
 * gate is named for.
 */
export function findClaimPhrases({ text, lexicon }) {
  const { usable } = assertLexiconCoverage(lexicon);
  const haystack = normalizeForMatch(text);
  const hits = [];
  for (const row of usable) {
    const needle = normalizeForMatch(row.phrase);
    if (needle && haystack.includes(needle)) {
      hits.push({ phrase_key: row.phrase_key, locale: row.locale, version: row.version, phrase: row.phrase });
    }
  }
  // Stable order so a refusal's detail is reproducible run to run.
  hits.sort((a, b) => `${a.locale}\u0000${a.phrase_key}\u0000${a.version}`
    .localeCompare(`${b.locale}\u0000${b.phrase_key}\u0000${b.version}`, "en"));
  return hits;
}

/**
 * §7(c) — THE CROSS-CHECK. Every protected placeholder the resolved layout actually BOUND must be
 * findable in the extracted text. The input is what the manifest says was drawn, not the whole
 * placeholder catalog: a note reference a pack never used was never claimed to be on the page.
 *
 * A value the manifest says was drawn and the extraction cannot find means the two disagree, and
 * disagreement refuses the seal rather than picking a winner.
 */
export function assertProtectedPlaceholdersDrawn({ text, resolvedPlaceholders }) {
  if (!Array.isArray(resolvedPlaceholders)) {
    throw new RenderRefusal("protected_placeholders_unreadable",
      "the resolved protected-placeholder list is absent; the cross-check cannot run and must not pass");
  }
  const haystack = normalizeForMatch(text);
  const missing = [];
  for (const p of resolvedPlaceholders) {
    const value = p?.value;
    // An EMPTY resolved value is itself a defect: a protected placeholder resolves from DB values
    // only, so a blank one means the resolution silently produced nothing.
    if (typeof value !== "string" || normalizeForMatch(value).length === 0) {
      throw new RenderRefusal("protected_placeholder_unresolved",
        `protected placeholder ${String(p?.key)} resolved to nothing`,
        { key: p?.key ?? null, value });
    }
    if (!haystack.includes(normalizeForMatch(value))) {
      missing.push({ key: p.key, value });
    }
  }
  if (missing.length > 0) {
    throw new RenderRefusal("protected_placeholder_not_drawn",
      `${missing.length} protected placeholder value(s) the manifest says were drawn are absent from the extracted text`,
      { missing, fix: "the manifest and the artifact disagree; refuse rather than seal one of them" });
  }
  return true;
}

/**
 * THE WHOLE GATE-3 DECISION over the produced artifact.
 *
 * `text` is the extraction over the FINAL PDF bytes; `metadata` is the uncompressed Info
 * dictionary and XMP packet (§7(d)) — scanned as text too, because a claim in Title/Subject/
 * Keywords is a claim.
 *
 * THE ONE RESIDUAL, stated here as well as in the DB's own comment: claim text rendered INSIDE AN
 * IMAGE is not reachable by text extraction, and this design does not OCR. What makes that
 * acceptable is structural rather than hopeful — images enter a render only as content-addressed
 * assets published by the firm OWNER through publish_house_style_version, every hash pinned in
 * the manifest. It is a recorded human act by the one role that could also just approve a false
 * claim directly: not a model-reachable channel, and not a user-supplied one.
 */
/**
 * §7(d) — THE METADATA CROSS-CHECK (codex M11). The manifest PINS what the document carries; the
 * PDF is supposed to carry it. Sealing an artifact whose manifest describes metadata the file does
 * not contain would make the manifest a claim about a document that does not exist — the same
 * disagreement class the protected-placeholder check refuses, one layer out.
 *
 * THE CHECKED SET IS THE STRING SET, AND SAYING SO IS THE POINT (round 2). manifest.mjs pins only
 * what the pinned engine can carry, and of those, `title` and `keywords` are values whose EXACT
 * TEXT the manifest owns, so a substring read of the extracted metadata block is real evidence.
 * The dates are deliberately NOT checked here: the engine writes them in its own formats (the Info
 * dictionary's D:YYYYMMDD form and XMP's ISO form), so matching manifest text against them would
 * be asserting the engine's formatting, not the pin. What proves the date pin is wired is the
 * double-render drill, and this sentence is load-bearing enough to be worth stating exactly: its
 * CLOCK arm changes SOURCE_DATE_EPOCH and requires the bytes to stay IDENTICAL (the document's date
 * comes from the reporting period, so the environment cannot move a sealed artifact), while its
 * CONTROL arm changes a pinned input and requires them to move. An earlier version of this comment
 * described the clock arm with the opposite polarity, from before assemble() pinned the date — the
 * kind of stale comment that teaches a future reader the wrong invariant. Both arms run in CI on
 * every code PR, and together they are a stronger instrument than a substring search.
 */
export function assertDocumentMetadataApplied({ metadata, documentMeta }) {
  const haystack = normalizeForMatch(
    typeof metadata === "string" ? metadata : JSON.stringify(metadata ?? {}),
  );
  const missing = [];
  for (const key of ["title", "keywords"]) {
    const value = documentMeta?.[key];
    if (typeof value !== "string" || value.trim() === "") continue; // legitimately empty
    if (!haystack.includes(normalizeForMatch(value))) missing.push({ key, value });
  }
  if (missing.length > 0) {
    throw new RenderRefusal("document_metadata_not_applied",
      `${missing.length} manifest-pinned metadata value(s) are absent from the produced PDF`,
      { missing, fix: "the manifest and the artifact disagree about the document's own metadata; refuse rather than seal one of them" });
  }
  return true;
}

export function scanFinalArtifact({ text, metadata, lexicon, claimPhraseAllowed, resolvedPlaceholders, documentMeta }) {
  const coverage = assertLexiconCoverage(lexicon);
  assertProtectedPlaceholdersDrawn({ text, resolvedPlaceholders });
  // FAIL-CLOSED ON ABSENCE, like every sibling arm of this gate (round-3 minor). This read
  // `if (documentMeta)`, so a caller that forgot to pass the manifest's document metadata — a
  // refactor, a new call site, a payload shape change — silently skipped §7(d) entirely and the
  // receipt below still said `scanned: true`. An absent manifest is not "nothing to check"; it is
  // "we cannot check", which is a refusal here exactly as an unreadable metadata block is.
  if (!documentMeta || typeof documentMeta !== "object") {
    throw new RenderRefusal("document_metadata_absent",
      "the artifact scan was asked to run without the manifest's document metadata; §7(d) cannot be skipped",
      { fix: "pass documentMeta from the final manifest — an unchecked artifact must not seal" });
  }
  assertDocumentMetadataApplied({ metadata, documentMeta });

  const metadataText = typeof metadata === "string" ? metadata : JSON.stringify(metadata ?? {});
  const bodyHits = findClaimPhrases({ text, lexicon });
  const metadataHits = findClaimPhrases({ text: metadataText, lexicon });
  const hits = [...bodyHits, ...metadataHits];

  if (hits.length > 0 && !claimPhraseAllowed) {
    throw new RenderRefusal("claim_phrase_present_without_eligibility",
      `${hits.length} claim phrase(s) appear in the produced artifact while the run is not eligible to claim`,
      {
        body_hits: bodyHits,
        metadata_hits: metadataHits,
        fix: "only an `eligible` assessment may carry the compliance claim; a stripped pack renders without it",
      });
  }
  return {
    scanned: true,
    claim_phrase_allowed: claimPhraseAllowed,
    body_hits: bodyHits,
    metadata_hits: metadataHits,
    // THE RECEIPT RECORDS WHICH ARMS RAN, not merely that a scan happened. `scanned: true` alone
    // could not distinguish a full pass from one that skipped §7(d), and this receipt is sealed
    // into the artifact's manifest — a reader seven years out has only what it says.
    metadata_cross_check: { ran: true, checked_keys: ["title", "keywords"] },
    lexicon_rows_by_locale: coverage.byLocale,
    // Named, not implied: what this scan does NOT cover.
    residual: "claim text baked into an image is not reachable by text extraction; images are owner-published, content-addressed assets pinned in the manifest",
  };
}
