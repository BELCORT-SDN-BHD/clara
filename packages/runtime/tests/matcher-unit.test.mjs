// Slice-5 matcher — PURE lane-2 candidate matching (no DB). Proves the exact
// name/alias hit logic + conflict abstention that the handler feeds into
// record_attribution_attempt. Contract §0 S5-D2 / companion §3.4.

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchCandidates } from "../lib/matcher.mjs";

test("a UNIQUE exact registered-name hit → one name_exact candidate, no conflict", () => {
  const r = matchCandidates({
    regions: [{ regionId: "rg1", text: "  Acme Sdn Bhd " }, { regionId: "rg2", text: "widgets" }],
    clients: [{ clientId: "c1", name: "Acme Sdn Bhd" }],
    aliases: [],
  });
  assert.equal(r.candidates.length, 1);
  assert.deepEqual(
    { ...r.candidates[0], region_ids: r.candidates[0].region_ids.sort() },
    { client_id: "c1", rank: 1, rule_kind: "name_exact", region_ids: ["rg1"] },
  );
  assert.equal(r.conflictReason, null);
});

test("a UNIQUE alias hit → one alias_exact candidate (grouping input only)", () => {
  const r = matchCandidates({
    regions: [{ regionId: "r", text: "ACME" }],
    clients: [{ clientId: "c9", name: "Beta Holdings" }],
    aliases: [{ clientId: "c9", alias: "acme" }],
  });
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].rule_kind, "alias_exact");
  assert.equal(r.candidates[0].client_id, "c9");
  assert.equal(r.conflictReason, null);
});

test("two distinct clients matched (name collision) → ABSTAIN with the conflict represented", () => {
  const r = matchCandidates({
    regions: [{ regionId: "r", text: "x" }],
    clients: [{ clientId: "a", name: "X" }, { clientId: "b", name: "x" }],
  });
  assert.equal(r.candidates.length, 2, "both competing clients are recorded as candidates");
  assert.equal(new Set(r.candidates.map((c) => c.client_id)).size, 2);
  assert.deepEqual(r.candidates.map((c) => c.rank).sort(), [1, 2], "distinct ranks (attribution_candidates unique (attempt,rank))");
  assert.equal(r.conflictReason, "ambiguous-name-or-alias");
});

test("name_exact evidence is never downgraded by an alias for the same client; region_ids merge", () => {
  const r = matchCandidates({
    regions: [{ regionId: "r1", text: "acme" }, { regionId: "r2", text: "acme" }],
    clients: [{ clientId: "c1", name: "Acme" }],
    aliases: [{ clientId: "c1", alias: "acme" }],
  });
  assert.equal(r.candidates.length, 1, "one client ⇒ one candidate even with a name+alias double hit");
  assert.equal(r.candidates[0].rule_kind, "name_exact");
  assert.deepEqual(r.candidates[0].region_ids.sort(), ["r1", "r2"], "evidence regions are merged, de-duplicated");
});

test("no hit → empty candidate set, no conflict", () => {
  const r = matchCandidates({ regions: [{ regionId: "r", text: "zzz" }], clients: [{ clientId: "c1", name: "Acme" }] });
  assert.equal(r.candidates.length, 0);
  assert.equal(r.conflictReason, null);
});

test("blank/whitespace region text and empty registry are safely ignored", () => {
  assert.deepEqual(matchCandidates({}), { candidates: [], conflictReason: null });
  const r = matchCandidates({ regions: [{ regionId: "r", text: "   " }], clients: [{ clientId: "c", name: "Acme" }] });
  assert.equal(r.candidates.length, 0);
});

// ADV-R2 (R1#12): the matcher rides the resolver's EXACT strip-normalization —
// a CANONICALIZED stored alias must match its display form on the document.
test("a canonical stored alias matches the punctuated display form (strip-normalization)", () => {
  const r = matchCandidates({
    regions: [{ regionId: "r", text: "Acme Sdn. Bhd." }],
    clients: [{ clientId: "c9", name: "Beta Holdings" }],
    aliases: [{ clientId: "c9", alias: "acmesdnbhd" }], // the 0016 canonical storage form
  });
  assert.equal(r.candidates.length, 1, "the repaired canonical alias still matches its display form");
  assert.equal(r.candidates[0].rule_kind, "alias_exact");
  assert.equal(r.candidates[0].client_id, "c9");
  assert.equal(r.conflictReason, null);
});

test("punctuation/spacing variants of a registered NAME match (both sides share the norm)", () => {
  const r = matchCandidates({
    regions: [{ regionId: "r", text: "ACME   SDN-BHD" }],
    clients: [{ clientId: "c1", name: "Acme Sdn. Bhd." }],
  });
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].rule_kind, "name_exact");
});

test("strip-normalization PRESERVES ambiguity: two clients colliding on the canonical form abstain", () => {
  const r = matchCandidates({
    regions: [{ regionId: "r", text: "Acme Sdn Bhd" }],
    clients: [{ clientId: "a", name: "Acme Sdn. Bhd." }, { clientId: "b", name: "ACME SDN BHD" }],
  });
  assert.equal(r.candidates.length, 2, "the collision is represented, never first-wins-suppressed");
  assert.equal(r.conflictReason, "ambiguous-name-or-alias");
});
