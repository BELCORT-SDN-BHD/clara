// #647 — the counterparty-identity successor-contract carrier, tested STANDALONE.
//
// It ships no tool and no workflow: D11 gives Clara no identity write verb this wave. What it
// ships is the schema, the argument builder and the refusal map the wave's single shared
// successor will import, and the only way that is worth anything is if each is proven against the
// database's own rules NOW, while the migration that states them is in front of the reviewer.
//
// Every expectation below cites the wall it mirrors in
// packages/db/migrations/0200_counterparty_identity_provenance.sql.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RECORD_COUNTERPARTY_ALIAS_TOOL, ALIAS_ORIGINS, AGENT_ORIGINS, RECORDED_VIA,
  recordCounterpartyAliasInputSchema, aliasDoorArgs, localAliasRefusal,
  ALIAS_REFUSAL_MESSAGES, refusalKey,
} from "../lib/counterparty-identity.ts";

const CP = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const EXT = "33333333-3333-4333-8333-333333333333";
const RGN = "44444444-4444-4444-8444-444444444444";

const proposal = (over = {}) => ({
  counterparty_id: CP,
  alias: "Acme Trading",
  origin: "agent_proposed",
  basis: "the bank narration on three payments spells it this way",
  ...over,
});

test("ci.1 the vocabulary matches 0200's own CHECK constraints, value for value", () => {
  assert.deepEqual([...ALIAS_ORIGINS],
    ["former_name", "trade_name", "human", "extracted", "agent_proposed"],
    "counterparty_aliases_origin_check, as 0200 §1 widened it");
  assert.deepEqual([...RECORDED_VIA], ["human_ui", "agent", "seeding", "legacy_unknown"],
    "ck_counterparty_aliases_recorded_via — four values, not knowledge_records' two");
  // An AGENT lane may say where it read a name, or that it is proposing one. It may never say a
  // person said so: that is AC1's "without labelling agent writes human", expressed as a type.
  assert.deepEqual([...AGENT_ORIGINS], ["extracted", "agent_proposed"]);
  assert.equal(AGENT_ORIGINS.includes("human"), false);
  assert.equal(AGENT_ORIGINS.includes("former_name"), false);
  assert.equal(RECORD_COUNTERPARTY_ALIAS_TOOL, "record_counterparty_alias");
});

test("ci.2 the input schema is .strict() — an invented key is a refusal, never a silently dropped field", () => {
  const ok = recordCounterpartyAliasInputSchema.safeParse(proposal());
  assert.equal(ok.success, true, ok.success ? "" : JSON.stringify(ok.error.issues));

  const extra = recordCounterpartyAliasInputSchema.safeParse({ ...proposal(), confidence: 0.9 });
  assert.equal(extra.success, false,
    "a dropped key is how a 'source' nobody stored becomes a provenance claim nobody can check");

  // A human lane's own origins are not in this schema at all.
  assert.equal(recordCounterpartyAliasInputSchema.safeParse(proposal({ origin: "human" })).success, false);
  // …and neither is an unstated basis: a machine-written identity fact with no reason is exactly
  // what a reviewer cannot act on.
  const noBasis = { ...proposal() };
  delete noBasis.basis;
  assert.equal(recordCounterpartyAliasInputSchema.safeParse(noBasis).success, false);
  assert.equal(recordCounterpartyAliasInputSchema.safeParse(proposal({ basis: "   " })).success, false);
  assert.equal(recordCounterpartyAliasInputSchema.safeParse(proposal({ counterparty_id: "not-a-uuid" })).success, false);
});

test("ci.3 the door arguments are built in 0200's own parameter spelling, and NEVER carry a lane", () => {
  const args = aliasDoorArgs(
    recordCounterpartyAliasInputSchema.parse(proposal({
      origin: "extracted", source_document_id: DOC, source_extraction_id: EXT,
      source_region_id: RGN, source_field_path: " invoice.vendor_name ",
    })),
    { clientId: "c-1", opKey: "op-1" },
  );
  assert.deepEqual(args, {
    p_client: "c-1",
    p_counterparty: CP,
    p_alias: "Acme Trading",
    p_origin: "extracted",
    p_op_key: "op-1",
    p_basis: "the bank narration on three payments spells it this way",
    p_source_document: DOC,
    p_source_extraction: EXT,
    p_source_region: RGN,
    p_source_field_path: "invoice.vendor_name",
  });
  // THE ASSERTION THAT MATTERS: no `recorded_via`, under any spelling. The door stamps the lane
  // from itself, and a caller that could state it could state 'human_ui'.
  assert.equal(Object.keys(args).some((k) => k.includes("recorded")), false);

  // An absent pin travels as an explicit null rather than an omitted key — the same discipline
  // the web door follows, so the argument list is the same shape on every call.
  const bare = aliasDoorArgs(recordCounterpartyAliasInputSchema.parse(proposal()), { clientId: "c-1", opKey: "op-2" });
  assert.deepEqual(
    [bare.p_source_document, bare.p_source_extraction, bare.p_source_region, bare.p_source_field_path],
    [null, null, null, null],
  );
  // The alias is sent AS TYPED (trimmed only). Normalisation is the database's
  // (`lower(regexp_replace(...))`, 0200 §7.1) and a client-side copy is exactly the drift the
  // house rule forbids.
  assert.equal(
    aliasDoorArgs(recordCounterpartyAliasInputSchema.parse(proposal({ alias: "  Acme  Trading  " })), { clientId: "c", opKey: "o" }).p_alias,
    "Acme  Trading",
  );
});

test("ci.4 every local refusal MIRRORS a 0200 wall and uses the database's own reason token", () => {
  // ck_counterparty_aliases_extraction_required / CLR10 source_incomplete.
  const halfPin = localAliasRefusal({ ...proposal({ origin: "extracted", source_document_id: DOC }) });
  assert.equal(halfPin?.reason, "source_incomplete");

  // ck_counterparty_aliases_extraction_pins / CLR10 source_not_extracted.
  const strayPin = localAliasRefusal({ ...proposal({ source_extraction_id: EXT }) });
  assert.equal(strayPin?.reason, "source_not_extracted");
  // …but a DOCUMENT-only pin on a non-extracted origin is NOT refused, because the door does not
  // refuse it either: 0200 section 7.1 tests only the extraction/region/field pins, and
  // ck_counterparty_aliases_extraction_pins names the same three columns. A carrier stricter than
  // the wall it claims to mirror would refuse locally what the door would admit.
  const strayDoc = localAliasRefusal({ ...proposal({ source_document_id: DOC }) });
  assert.equal(strayDoc, null);

  // ck_counterparty_aliases_region_needs_extraction — a deeper pin needs the one above it.
  const orphanRegion = localAliasRefusal({
    ...proposal({ origin: "extracted", source_document_id: DOC, source_region_id: RGN }),
  });
  assert.equal(orphanRegion?.reason, "source_incomplete");

  // The normalisation must leave something: 0200 §7.1 raises CLR10 on an alias of punctuation.
  assert.equal(localAliasRefusal({ ...proposal({ alias: "--- ---" }) })?.reason, "alias_unusable");

  // …and the two LAWFUL shapes pass through untouched, which is what makes the four above
  // discriminating rather than a wall that refuses everything.
  assert.equal(localAliasRefusal({ ...proposal() }), null);
  assert.equal(localAliasRefusal({
    ...proposal({ origin: "extracted", source_document_id: DOC, source_extraction_id: EXT }),
  }), null);
});

test("ci.5 the refusal map keys on (code, reason) and leaves an unmapped pair to the database's own words", () => {
  assert.equal(refusalKey("CLR23", "alias_collision"), "CLR23:alias_collision");
  assert.equal(refusalKey("CLR04", null), "CLR04:", "a refusal with no reason token keys on its code alone");

  for (const key of ["CLR23:target_retired", "CLR23:alias_collision", "CLR23:source_not_this_client",
    "CLR10:source_incomplete", "CLR10:source_not_extracted",
    "CLR10:source_extraction_not_of_document", "CLR10:source_region_not_of_extraction", "CLR04:"]) {
    assert.equal(typeof ALIAS_REFUSAL_MESSAGES[key], "string", `${key} is mapped`);
    assert.ok(ALIAS_REFUSAL_MESSAGES[key].length > 20, `${key} says something a human can act on`);
  }
  // The #646 hole, named in the map because it is the one refusal a model would otherwise have no
  // idea how to answer: the document is real and in the firm, just filed to a different client.
  assert.match(ALIAS_REFUSAL_MESSAGES["CLR23:source_not_this_client"], /not filed to this client/);

  // An UNMAPPED pair resolves to undefined ON PURPOSE — the caller falls through to the door's
  // own message verbatim rather than inventing one (the estate's verbatim-refusal law).
  assert.equal(ALIAS_REFUSAL_MESSAGES[refusalKey("CLR23", "cross_kind_merge")], undefined);
  assert.equal(Object.isFrozen(ALIAS_REFUSAL_MESSAGES), true, "the map cannot be edited at runtime");
});
