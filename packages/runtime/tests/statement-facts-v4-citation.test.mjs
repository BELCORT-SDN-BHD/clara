// #1037 — statementFacts_v4: THE PRODUCER HALF of #990's per-line source citation.
//
// #990 (migration 0291) shipped the RECEIVING half: `clara.bank_statement_lines` carries
// `citation_extraction_id` / `citation_page` / `citation_region`, the persist core banks them off
// reader1's raw payload lines, and the Matching tab renders the three-state sentence. No live
// producer could state one, because `statementFacts.v3.prompts.mjs`'s `lineShape` declares five
// keys and `toWriterLines` rebuilds every line from six named keys — both frozen. So every real
// machine-lane line showed "No source citation was recorded for this line."
//
// THIS FILE IS THE UNIT HALF of the successor. The seams are the v4 prompt closure's own exports
// and the pure citation mapper; the LIVE seam (the persist door, and that the region reaches
// `clara.document_regions`) is `statement-facts-v4-citation-db.test.mjs` beside this file.
//
// WHY THE TEXT CHANNEL AND NOT THE VISION ONE. `docs/plan/active/riders-2026-09-20/CUT-PLAN.md`
// §3.2 and `reports/wave3-lane08-ticket990.md`'s successor contract both say "the vision-channel
// prompt". That is the one thing in the contract that cannot be built as written, and the reason
// is measured, not argued: the numbered region list is shown ONLY to the TEXT channel
// (`buildStatementWitnessTextPrompt`; the vision channel gets `buildStatementWitnessVisionPrompt`,
// which carries no regions at all), and 0291's splice reads the citation off `v_r1->'lines'` —
// reader1, which `persistStatementWitnessPair` fills from the TEXT read. A vision-side idx would
// have nothing to resolve against and would land in reader2, which the core never reads. So the
// stanza goes to the channel that can honour it.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  statementWitnessPromptHash as promptHashV4,
  STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT as TEXT_SYSTEM_V4,
  STATEMENT_WITNESS_VISION_SYSTEM_PROMPT as VISION_SYSTEM_V4,
  STATEMENT_LINE_CITATION_FIELDS,
  statementWitnessTextSchema,
  statementWitnessSchema as statementWitnessVisionSchemaV4,
} from "../workflows/statementFacts.v4.prompts.mjs";
import {
  attachStatementLineCitations,
  indexStatementRegionCitations,
} from "../workflows/statementFacts.v4.citations.mjs";
import {
  statementWitnessPromptHash as promptHashV3,
  STATEMENT_HEADER_FIELDS,
  STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT as TEXT_SYSTEM_V3,
  STATEMENT_WITNESS_VISION_SYSTEM_PROMPT as VISION_SYSTEM_V3,
} from "../workflows/statementFacts.v3.prompts.mjs";

/** A wire header every field of which the model answered null — the shape both schemas require
 *  (each header field is nullable but PRESENT; see statementFacts.v3.prompts.mjs's "no
 *  discriminated union" note). Built from the module's own field roster, never re-typed. */
const wireHeader = () => Object.fromEntries(STATEMENT_HEADER_FIELDS.map((f) => [f, null]));

/** One wire line as the model answers it, with only the keys the cell under test cares about. */
const wireLine = (over = {}) => ({
  entry_date: "2026-04-02",
  value_date: null,
  description: "TRANSFER",
  amount_cents: -12500,
  running_balance_cents: 87500,
  ...over,
});

test("1037.p1 the v4 TEXT channel is asked to name the region index it read each line from — and the VISION channel, which is shown no regions, is not", () => {
  // The instruction reaches the model through the prompt (the ADV-S-1 lesson recorded in
  // CUT-PLAN §4.5: an identifier the harness supplies out of band is not a capability).
  assert.match(TEXT_SYSTEM_V4, /region_idx/, "the v4 text system prompt names the answer key");
  assert.ok(
    TEXT_SYSTEM_V4.startsWith(TEXT_SYSTEM_V3),
    "v4's text system prompt is v3's, extended — the seven shared rules are carried, not re-cut",
  );
  assert.equal(VISION_SYSTEM_V4, VISION_SYSTEM_V3, "the vision system prompt is unchanged by this cut");
  assert.doesNotMatch(VISION_SYSTEM_V4, /region_idx/, "the vision channel sees no numbered regions, so it is never asked to cite one");

  // The wire vocabulary moves with the prompt: the text schema admits the key, the vision one
  // refuses it, so a vision answer can never smuggle a citation into reader2.
  assert.deepEqual([...STATEMENT_LINE_CITATION_FIELDS], ["region_idx"]);
  const text = statementWitnessTextSchema.parse({
    header: wireHeader(), lines: [wireLine({ region_idx: 7 }), wireLine({ region_idx: null })],
  });
  assert.equal(text.lines[0].region_idx, 7);
  assert.equal(text.lines[1].region_idx, null, "an honest null is an admissible answer, not a parse failure");
  const vision = statementWitnessVisionSchemaV4.parse({ header: wireHeader(), lines: [wireLine({ region_idx: 7 })] });
  assert.equal("region_idx" in vision.lines[0], false, "the vision schema strips a region_idx the model volunteered");
});

test("1037.p2 the prompt hash names v4 on BOTH channels — including the one whose prompt text did not change", () => {
  // v3's own rule (3): the hash exists to say WHICH prompt version produced a stored read, so it
  // moves with the version. The vision text is byte-identical to v3's (cell 1037.p1 asserts that
  // above), which is exactly why a hash that did NOT move would be the defect: two different
  // bodies would stamp the same receipt on `clara.llm_usage_events.prompt_hash`.
  for (const channel of ["text", "vision"]) {
    assert.match(promptHashV4(channel), /^[0-9a-f]{64}$/, `the ${channel} hash is a sha256 hex digest`);
    assert.notEqual(
      promptHashV4(channel),
      promptHashV3(channel),
      `the ${channel} channel's v4 hash must differ from v3's, or a v4 read is indistinguishable from a v3 one`,
    );
  }
  assert.notEqual(promptHashV4("text"), promptHashV4("vision"), "the two channels stay distinguishable from each other");
});

// ---------------------------------------------------------------------------------------
// The pure mapper. `region_idx` is an index into the PROMPT; what the DB stores is the region's
// own `clara.document_regions.locator` and the page `clara.witness_citation_regions` published
// for it. The mapper is what turns the first into the second, and it is the piece that has to
// guarantee 0291's table CHECK — `(citation_page is null) = (citation_region is null)` — can
// never be reached in a broken state by a payload this body builds.
// ---------------------------------------------------------------------------------------

/** One row as `select w.idx, w.page, r.locator from clara.witness_citation_regions($1) w join
 *  clara.document_regions r on r.id = w.region_id` returns it. */
const regionRow = (idx, page, locator) => ({ idx, page, locator });

test("1037.c1 a region row is usable only if it can satisfy the column CHECK — a citation is both page and region, or it is nothing", () => {
  const good = { page: 3, polygon: [0.1, 0.2, 0.9, 0.3] };
  const byIdx = indexStatementRegionCitations([
    regionRow(1, 3, good),
    regionRow(2, null, { polygon: [0, 0, 1, 1] }),   // the region prints no page — nothing to cite
    regionRow(3, 0, { polygon: [0, 0, 1, 1] }),      // 0291: citation_page >= 1
    regionRow(4, 2, null),                            // no locator — nothing to point at
    regionRow(5, 2, [0, 0, 1, 1]),                    // a jsonb ARRAY is not an object (0291's ck)
    regionRow(null, 2, good),                         // an unnumbered row cannot be cited
  ]);
  assert.deepEqual([...byIdx.keys()], [1], "only the one row that can satisfy the CHECK is citable");
  assert.deepEqual(byIdx.get(1), { page: 3, region: good }, "the region IS the document_regions locator, relayed whole");
});

test("1037.c2 the mapper attaches page AND region together or neither, and region_idx never reaches the writer", () => {
  const locator = { page: 2, polygon: [0.1, 0.4, 0.8, 0.5] };
  const byIdx = indexStatementRegionCitations([regionRow(11, 2, locator)]);
  const wire = [
    wireLine({ region_idx: 11 }),    // cited
    wireLine({ region_idx: null }),  // honestly uncited
    wireLine({ region_idx: 99 }),    // an index that names no region the reader was shown
    wireLine(),                      // no key at all
  ];
  const writer = wire.map((l, i) => ({
    line_no: i + 1,
    entry_date: l.entry_date, value_date: l.value_date, description: l.description,
    amount_cents: l.amount_cents, running_balance_cents: l.running_balance_cents,
  }));
  const out = attachStatementLineCitations(writer, wire, byIdx);

  assert.equal(out.length, 4, "every line survives — an uncitable row is never dropped");
  assert.deepEqual(
    { page: out[0].page, region: out[0].region },
    { page: 2, region: locator },
    "the cited line carries the region's own page and locator",
  );
  for (const i of [1, 2, 3]) {
    assert.equal("page" in out[i], false, `line ${i + 1} carries no page`);
    assert.equal("region" in out[i], false, `line ${i + 1} carries no region`);
  }
  for (const line of out) {
    assert.equal("region_idx" in line, false, "region_idx is an index into the prompt, never a payload field");
    assert.equal(("page" in line), ("region" in line), "0291's shape guard can never be reached broken");
  }
  assert.deepEqual(out.map((l) => l.line_no), [1, 2, 3, 4], "line_no, the writer's own positional key, is untouched");
});
