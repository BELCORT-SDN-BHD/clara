// Lane ζ unit battery — the §7 gate-3 claim scan. NO database, NO PDF, NO container.
//
// The headline case is the RULING: a locale with no effective lexicon row is a REFUSAL, never a
// pass. Everything else in this file exists to make that refusal meaningful — a scan that cannot
// find a phrase it was given would make the coverage gate theatre.

import { ok, strictEqual } from "node:assert/strict";
import { test } from "node:test";

import { RenderRefusal } from "../lib/decisions.mjs";
import {
  RULED_LOCALES,
  assertDocumentMetadataApplied,
  assertLexiconCoverage,
  assertProtectedPlaceholdersDrawn,
  findClaimPhrases,
  normalizeForMatch,
  scanFinalArtifact,
} from "../lib/lexicon.mjs";

const EN = { phrase_key: "mpers_compliance", locale: "en", version: 1, match_kind: "substring_ci",
  phrase: "in accordance with the Malaysian Private Entities Reporting Standard" };
const MS = { phrase_key: "mpers_compliance", locale: "ms", version: 1, match_kind: "substring_ci",
  phrase: "mematuhi Piawaian Pelaporan Entiti Persendirian Malaysia" };
const ZH = { phrase_key: "mpers_compliance", locale: "zh", version: 1, match_kind: "substring_ci",
  phrase: "符合马来西亚私人实体报告准则" };
const FULL = [EN, MS, ZH];

function refusalReason(fn) {
  try {
    fn();
  } catch (err) {
    ok(err instanceof RenderRefusal, `expected a RenderRefusal, got ${err?.name}: ${err?.message}`);
    return err.reason;
  }
  throw new Error("expected a refusal, got success");
}

// === THE RULING ==============================================================================

test("RULING: a locale with no effective lexicon row is a REFUSAL, never a pass", () => {
  for (const drop of RULED_LOCALES) {
    const partial = FULL.filter((r) => r.locale !== drop);
    const reason = refusalReason(() => assertLexiconCoverage(partial));
    strictEqual(reason, "claim_lexicon_locale_missing", `dropping ${drop} must refuse`);
  }
});

test("an EMPTY lexicon refuses — a scan that cannot fail must not pass", () => {
  strictEqual(refusalReason(() => assertLexiconCoverage([])), "claim_lexicon_locale_missing");
  strictEqual(refusalReason(() => assertLexiconCoverage(null)), "claim_lexicon_unreadable");
  strictEqual(refusalReason(() => assertLexiconCoverage(undefined)), "claim_lexicon_unreadable");
});

test("a row present but BLANK does not count as coverage", () => {
  const blanked = [{ ...MS, phrase: "   " }, EN, ZH];
  strictEqual(refusalReason(() => assertLexiconCoverage(blanked)), "claim_lexicon_locale_missing");
});

test("an unimplemented match_kind refuses rather than being silently skipped", () => {
  const exotic = [...FULL, { phrase_key: "x", locale: "en", version: 2, match_kind: "regex", phrase: "abc" }];
  strictEqual(refusalReason(() => assertLexiconCoverage(exotic)), "claim_lexicon_match_kind_unknown");
});

test("full coverage reports its row counts per locale", () => {
  const c = assertLexiconCoverage(FULL);
  strictEqual(c.byLocale.en, 1);
  strictEqual(c.byLocale.ms, 1);
  strictEqual(c.byLocale.zh, 1);
});

// === THE SMUGGLE THE RULING EXISTS FOR ========================================================

test("a MALAY claim phrase inside an English pack is caught", () => {
  const text = "Notes to the financial statements. Penyata ini mematuhi Piawaian Pelaporan Entiti Persendirian Malaysia.";
  const hits = findClaimPhrases({ text, lexicon: FULL });
  strictEqual(hits.length, 1);
  strictEqual(hits[0].locale, "ms");
});

test("a CHINESE claim phrase is caught even with glyph-spacing from extraction", () => {
  const text = "附注 符 合 马 来 西 亚 私 人 实 体 报 告 准 则 。";
  const hits = findClaimPhrases({ text, lexicon: FULL });
  strictEqual(hits.length, 1);
  strictEqual(hits[0].locale, "zh");
});

test("a phrase broken across a line break is still caught", () => {
  const text = "The statements are prepared in accordance with\nthe Malaysian Private Entities\nReporting Standard.";
  strictEqual(findClaimPhrases({ text, lexicon: FULL }).length, 1);
});

test("a phrase broken by zero-width characters is still caught", () => {
  // The invisible characters are written as ESCAPES, not pasted: a source file carrying literal
  // zero-width codepoints reads as binary to grep and to review tooling, which is a poor place
  // to hide the one test that is about hiding things.
  const zwsp = "\u200B";
  const shy = "\u00AD";
  const smuggled = `in accordance with the Malaysian${zwsp}Private Entities Reporting${shy}Standard`;
  strictEqual(findClaimPhrases({ text: smuggled, lexicon: FULL }).length, 1);
});

test("clean text produces no hits", () => {
  strictEqual(findClaimPhrases({ text: "Statement of financial position as at 31 December 2025.", lexicon: FULL }).length, 0);
});

test("normalisation is case-, width- and whitespace-insensitive", () => {
  strictEqual(normalizeForMatch("  True  And\tFair\nVIEW "), "trueandfairview");
  strictEqual(normalizeForMatch("ｆｕｌｌｗｉｄｔｈ"), "fullwidth");
});

// === THE PROTECTED-PLACEHOLDER CROSS-CHECK =====================================================

test("a protected placeholder the manifest says was drawn but the extraction cannot find refuses", () => {
  const reason = refusalReason(() => assertProtectedPlaceholdersDrawn({
    text: "ACME SDN BHD\nStatement of financial position",
    resolvedPlaceholders: [{ key: "entity_legal_name", value: "ACME SDN BHD" },
      { key: "registration_number", value: "202301234567" }],
  }));
  strictEqual(reason, "protected_placeholder_not_drawn");
});

test("a protected placeholder that resolved to nothing refuses before any matching happens", () => {
  strictEqual(
    refusalReason(() => assertProtectedPlaceholdersDrawn({
      text: "anything", resolvedPlaceholders: [{ key: "entity_legal_name", value: "" }],
    })),
    "protected_placeholder_unresolved",
  );
  strictEqual(
    refusalReason(() => assertProtectedPlaceholdersDrawn({
      text: "anything", resolvedPlaceholders: [{ key: "entity_legal_name", value: null }],
    })),
    "protected_placeholder_unresolved",
  );
});

test("an absent placeholder list refuses — the cross-check cannot run and must not pass", () => {
  strictEqual(
    refusalReason(() => assertProtectedPlaceholdersDrawn({ text: "x", resolvedPlaceholders: undefined })),
    "protected_placeholders_unreadable",
  );
});

test("every drawn placeholder present passes", () => {
  ok(assertProtectedPlaceholdersDrawn({
    text: "ACME SDN BHD (202301234567)\nFor the year ended 31 December 2025",
    resolvedPlaceholders: [{ key: "entity_legal_name", value: "ACME SDN BHD" },
      { key: "registration_number", value: "202301234567" },
      { key: "reporting_period", value: "For the year ended 31 December 2025" }],
  }));
});

// === THE WHOLE GATE ============================================================================

const drawn = [{ key: "entity_legal_name", value: "ACME SDN BHD" }];

test("a claim phrase in an INELIGIBLE artifact refuses, and names where it was found", () => {
  try {
    scanFinalArtifact({
      text: "ACME SDN BHD prepared in accordance with the Malaysian Private Entities Reporting Standard",
      metadata: "Title: ACME",
      lexicon: FULL,
      claimPhraseAllowed: false,
      resolvedPlaceholders: drawn,
    });
    throw new Error("expected a refusal");
  } catch (err) {
    strictEqual(err.reason, "claim_phrase_present_without_eligibility");
    strictEqual(err.detail.body_hits.length, 1);
    strictEqual(err.detail.metadata_hits.length, 0);
  }
});

test("a claim phrase hidden in the METADATA is caught — a claim in Title/Subject/Keywords is a claim", () => {
  try {
    scanFinalArtifact({
      text: "ACME SDN BHD\nStatement of financial position",
      metadata: { Title: "ACME", Keywords: "in accordance with the Malaysian Private Entities Reporting Standard" },
      lexicon: FULL,
      claimPhraseAllowed: false,
      resolvedPlaceholders: drawn,
    });
    throw new Error("expected a refusal");
  } catch (err) {
    strictEqual(err.reason, "claim_phrase_present_without_eligibility");
    strictEqual(err.detail.metadata_hits.length, 1);
  }
});

test("the same claim phrase in an ELIGIBLE artifact passes and is reported", () => {
  const r = scanFinalArtifact({
    text: "ACME SDN BHD prepared in accordance with the Malaysian Private Entities Reporting Standard",
    metadata: "Title: ACME",
    lexicon: FULL,
    claimPhraseAllowed: true,
    resolvedPlaceholders: drawn,
  });
  strictEqual(r.scanned, true);
  strictEqual(r.body_hits.length, 1);
  ok(r.residual.includes("image"), "the scan reports its own residual rather than implying none");
});

test("§7(d): manifest-pinned metadata ABSENT from the PDF refuses (codex M11)", () => {
  // The checked set is title + keywords: the two values whose EXACT text the manifest owns and the
  // pinned engine actually writes. The dates are emitted but not substring-checked (the engine
  // chooses their format); the drill's control arm is what proves that pin is wired.
  const documentMeta = {
    title: "ACME FS 2025", keywords: "report_run:abc",
    creation_date_utc: "2025-12-31T00:00:00Z", source_date_epoch: 1767139200,
  };
  // Present in the extracted metadata block -> passes.
  ok(assertDocumentMetadataApplied({
    metadata: "Title: ACME FS 2025\nKeywords: report_run:abc\nCreationDate: D:20251231000000Z",
    documentMeta,
  }));
  // The manifest pins keywords the PDF never carried -> the two disagree, so refuse.
  try {
    assertDocumentMetadataApplied({ metadata: "Title: ACME FS 2025", documentMeta });
    throw new Error("expected a refusal");
  } catch (err) {
    strictEqual(err.reason, "document_metadata_not_applied");
    strictEqual(err.detail.missing.length, 1);
    strictEqual(err.detail.missing[0].key, "keywords");
  }
  // A date-format difference is NOT a refusal, and this cell says so out loud: the manifest's ISO
  // date and the Info dictionary's D: form are the same instant written two ways, so checking one
  // against the other would refuse every real document.
  ok(assertDocumentMetadataApplied({
    metadata: "Title: ACME FS 2025\nKeywords: report_run:abc\nCreationDate: Wed Dec 31 00:00:00 2025 UTC",
    documentMeta,
  }));
});

test("the gate refuses on a partial lexicon EVEN IF the document is clean", () => {
  strictEqual(
    refusalReason(() => scanFinalArtifact({
      text: "ACME SDN BHD\nnothing to see here",
      metadata: "Title: ACME",
      lexicon: [EN],
      claimPhraseAllowed: false,
      resolvedPlaceholders: drawn,
    })),
    "claim_lexicon_locale_missing",
  );
});
