// H-17 — autoDraft_v10's EXACT native-unique constraint map, and the registry repoint that makes
// it the live body. No DB, no world: the .ts closure modules (uniques/errors/prompt — none imports
// "workflow") are loaded through tsx's ESM loader, the shape s6-closure-logic.test.mjs established.
//
// WHAT THIS FILE IS FOR. v9 mapped ANY 23505 whose constraint name contained "counterpart" or
// "alias" to an untokened, question-shaped CLR23, and EVERY other 23505 to CLR21 `double_coded`,
// which is success-shaped. Both halves are over-broad. So every cell below is written to be
// DISCRIMINATING between v9 and v10 on the same input, and the v9 module is loaded beside v10 for
// exactly that: a cell that passes against both proves nothing about the fix.
//
// THE NAMES ARE MEASURED, NOT SPELLED (law 3). packages/db/tests/counterparty-alias-kind.test.mjs
// provokes three of the four uniques on a live rig and asserts the `constraint` PostgreSQL emits
// is the exact string this map is keyed on; the fourth is asserted present in the catalog under
// that exact name. This file owns the other half of the pair — that the map recognises exactly
// those four strings and nothing else.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const uniques = await import("../workflows/autoDraft.v10.uniques.ts");
const errorsV10 = await import("../workflows/autoDraft.v10.errors.ts");
const errorsV9 = await import("../workflows/autoDraft.v9.errors.ts");
const prompt = await import("../workflows/autoDraft.v9.prompt.ts");
const registryMod = await import("../workflows/registry.ts");
const v10Mod = await import("../workflows/autoDraft.v10.ts");
const v9Mod = await import("../workflows/autoDraft.v9.ts");

const map10 = errorsV10.refusalFromDbError;
const map9 = errorsV9.refusalFromDbError;
const { isQuestionShaped, isDoubleCodedReason } = prompt;

/** The four LIVE index names, written out here rather than read from the module under test — a
 *  cell that asks the map for its own keys and then checks them against those keys is a mirror,
 *  not a measurement. Provenance for each: 0011:669-670, 0015:187-192 (x2), 0017:799. */
const ALIAS = "uq_counterparty_aliases_live_name";
const UNREG_NAME = "uq_counterparties_client_unregistered_name";
const REGISTRATION = "uq_counterparties_client_registration";
const ONE_OPEN_DRAFT = "uq_journal_entries_one_open_draft_filing";

const u = (constraint) => ({ code: "23505", constraint });

// ============================================================================================
// 1. THE MAP IS EXACTLY FOUR NAMES
// ============================================================================================

test("h17.1 the recognised set is EXACTLY the four live index names — no fifth, no missing one", () => {
  assert.deepEqual(
    [...uniques.NATIVE_UNIQUE_CONSTRAINTS],
    [REGISTRATION, UNREG_NAME, ALIAS, ONE_OPEN_DRAFT].sort(),
  );
});

// ============================================================================================
// 2. EACH ARM, AND WHAT v9 SAID ABOUT THE SAME INPUT
// ============================================================================================

test("h17.2 the ALIAS unique is a RETRYABLE non-question — v9 called it an untokened CLR23", () => {
  const r = map10(u(ALIAS));
  assert.equal(r.code, uniques.COUNTERPARTY_RETRY_CODE);
  assert.equal(r.reason, "alias_collision");
  assert.equal(r.message, uniques.COUNTERPARTY_RETRY_MESSAGES.alias_collision);
  assert.equal(isQuestionShaped(r), false, "a retry must never open a durable human question");
  // The discriminator: v9's answer on the identical input.
  const nine = map9(u(ALIAS));
  assert.equal(nine.code, "CLR23");
  assert.equal(nine.reason, undefined, "v9 carried NO reason token — that is the H-17 defect");
  assert.equal(isQuestionShaped(nine), true, "v9 opened a question here; v10 must not");
});

test("h17.3 the UNREGISTERED-NAME unique is a RETRYABLE non-question with its own token", () => {
  const r = map10(u(UNREG_NAME));
  assert.equal(r.code, uniques.COUNTERPARTY_RETRY_CODE);
  assert.equal(r.reason, "name_collision");
  assert.equal(r.message, uniques.COUNTERPARTY_RETRY_MESSAGES.name_collision);
  assert.equal(isQuestionShaped(r), false);
  // v9 gave this the SAME answer it gave the alias arm — which is the readability defect stated
  // as an equality rather than as prose: two different walls, one indistinguishable sentence.
  assert.deepEqual(map9(u(UNREG_NAME)), map9(u(ALIAS)));
  assert.notDeepEqual(map10(u(UNREG_NAME)), map10(u(ALIAS)), "v10 must tell them apart");
});

test("h17.4 the REGISTRATION unique stays a HUMAN question, but now a tokened one", () => {
  const r = map10(u(REGISTRATION));
  assert.equal(r.code, "CLR23");
  assert.equal(r.reason, "registration_collision");
  assert.equal(r.message, uniques.CLR23_REASON_MESSAGES.registration_collision);
  assert.equal(isQuestionShaped(r), true, "only a person can settle whether two registrations are one party");
  assert.notEqual(r.message, map9(u(REGISTRATION)).message, "the v9 sentence named no wall at all");
});

test("h17.5 the ONE-OPEN-DRAFT unique keeps the success-shaped double_coded arm (0009:20's own mapping)", () => {
  const r = map10(u(ONE_OPEN_DRAFT));
  assert.equal(r.code, "CLR21");
  assert.equal(r.reason, "double_coded");
  assert.equal(isDoubleCodedReason(r.reason), true, "this is the one arm that may settle noop_existing");
  assert.deepEqual(r, map9(u(ONE_OPEN_DRAFT)), "byte-carried: the only arm v9 got right");
});

// ============================================================================================
// 3. THE FALL-THROUGH — the half that was recording a FALSE SUCCESS
// ============================================================================================

test("h17.6 an UNKNOWN constraint falls to internal/unnamed_unique — v9 called it double_coded", () => {
  const r = map10(u("uq_something_a_later_migration_added"));
  assert.equal(r.code, "internal");
  assert.equal(r.reason, "unnamed_unique");
  assert.equal(isQuestionShaped(r), false, "never a human question");
  assert.equal(isDoubleCodedReason(r.reason), false,
    "an unrecognised wall must NEVER reach the success-shaped noop_existing settle");
  const nine = map9(u("uq_something_a_later_migration_added"));
  assert.equal(nine.reason, "double_coded");
  assert.equal(isDoubleCodedReason(nine.reason), true,
    "v9 recorded an unknown uniqueness wall as 'already coded' — the expensive half of H-17");
});

test("h17.7 a MISSING constraint field is an unknown, not a counterparty story", () => {
  for (const err of [{ code: "23505" }, { code: "23505", constraint: "" }, { code: "23505", constraint: "   " }]) {
    const r = map10(err);
    assert.equal(r.reason, "unnamed_unique", `absent/blank constraint: ${JSON.stringify(err)}`);
  }
});

test("h17.8 THE SUBSTRING TEST IS GONE — near-miss names no longer resolve", () => {
  // Every one of these CONTAINS "counterpart" or "alias" and so became CLR23 under v9. Three of
  // them are the fictional names the pre-existing batteries were asserting against, which is how
  // a map keyed on names nobody emits stayed green for a year.
  const nearMisses = [
    "counterparty_aliases_live_uniq",
    "counterparty_alias_uq",
    "counterparties_client_reg_uniq",
    "uq_counterparty_aliases_live_names",
    "xuq_counterparty_aliases_live_name",
  ];
  for (const name of nearMisses) {
    assert.equal(map9(u(name)).code, "CLR23", `v9 accepted the near-miss ${name}`);
    const r = map10(u(name));
    assert.equal(r.code, "internal", `v10 must NOT recognise ${name}`);
    assert.equal(r.reason, "unnamed_unique");
  }
});

test("h17.9 lookup folds case and surrounding whitespace, and cannot resolve an inherited Object key", () => {
  assert.equal(map10(u(`  ${ALIAS.toUpperCase()}  `)).reason, "alias_collision");
  for (const hostile of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    assert.equal(map10(u(hostile)).reason, "unnamed_unique", `${hostile} must not resolve to an arm`);
  }
});

// ============================================================================================
// 4. THE PROPERTIES THE ARMS DEPEND ON
// ============================================================================================

test("h17.10 the retry code IS the evidence-system code — one 'transient' family, asserted not assumed", () => {
  assert.equal(uniques.COUNTERPARTY_RETRY_CODE, errorsV10.EVIDENCE_SYSTEM_CODE);
  // And that family is outside isQuestionShaped's closed test, which is WHY sharing it is safe.
  assert.equal(isQuestionShaped({ type: "refusal", code: uniques.COUNTERPARTY_RETRY_CODE, reason: "alias_collision" }), false);
});

test("h17.11 every arm carries a NON-EMPTY reason token and a message that is not the generic CLR23 line", () => {
  const generic = map9({ code: "CLR23" }).message;
  for (const name of [ALIAS, UNREG_NAME, REGISTRATION, ONE_OPEN_DRAFT]) {
    const r = map10(u(name));
    assert.ok(typeof r.reason === "string" && r.reason.length > 0, `${name} has no reason token`);
    assert.notEqual(r.message, generic, `${name} still reads as the untokened CLR23 sentence`);
  }
});

test("h17.12 the rest of the DB-error map is BYTE-CARRIED from v9 — v10 changes the 23505 arm alone", () => {
  const cases = [
    { code: "CLR21", detail: '{"reason":"currency_unsupported"}' },
    { code: "CLR21", detail: '{"reason":"direction_family_mismatch"}' },
    { code: "CLR21" },
    { code: "CLR10", detail: '{"reason":"sst_account_missing"}' },
    { code: "CLR10" },
    { code: "CLR29" },
    { code: "CLR23" },
    { code: "23503" },
    { code: "23514" },
    { code: "42501" },
    { code: "CLR25" },
    { code: "XXOTHER", message: "select * from clara.secret" },
    {},
  ];
  for (const c of cases) {
    assert.deepEqual(map10(c), map9(c), `v10 must answer identically for ${JSON.stringify(c)}`);
  }
});

test("h17.13 no refusal leaks SQL or a raw constraint name to the bookkeeper", () => {
  for (const name of [ALIAS, UNREG_NAME, REGISTRATION, ONE_OPEN_DRAFT, "uq_unknown_thing"]) {
    const r = map10({ code: "23505", constraint: name, message: "duplicate key value violates unique constraint" });
    assert.ok(!r.message.includes(name), `the ${name} message leaks the index name`);
    assert.ok(!/select |insert |duplicate key/i.test(r.message), `the ${name} message leaks SQL`);
  }
});

// ============================================================================================
// 5. THE REPOINT
// ============================================================================================

test("h17.14 repoint: `autoDraft:` IS autoDraft_v10 — object identity, not a name", () => {
  assert.equal(registryMod.workflows.autoDraft, v10Mod.autoDraft_v10);
  assert.notEqual(registryMod.workflows.autoDraft, v9Mod.autoDraft_v9, "v9 must no longer be the pointer");
  assert.equal(registryMod.workflows.autoDraft.name, "autoDraft_v10");
});

test("h17.15 repoint: autoDraft_v9 stays EXPORTED and reachable — parked runs are never stranded", () => {
  // Policy (c): a repoint must never make the old body unreachable. Read off the REGISTRY
  // module's re-exports, which is the surface policy (c) is about.
  assert.equal(typeof registryMod.autoDraft_v9, "function", "the v9 re-export must still resolve");
  assert.equal(typeof registryMod.autoDraft_v10, "function");
  assert.notEqual(v9Mod.autoDraft_v9, v10Mod.autoDraft_v10, "two distinct bodies, both reachable");
});

// ============================================================================================
// 6. THE RETRY'S SECOND HALF (review-556 item 4) — what the model DOES with a retryable arm
//
// Cells 2-13 prove the vocabulary. These two prove the consequence, through the SAME reducer the
// workflow settles from. NOTE ON A NAME: review-556 called it `parseAutoDraftOutcome`; the actual
// export is `toAutoDraftOutcome` (autoDraft.v9.prompt.ts:381), which v10 reuses unchanged —
// spelling is not identity, so this file drives the real one.
// ============================================================================================

const draftResult = (output) => ({ type: "tool-result", toolName: prompt.DRAFT_TOOL, output });
const aliasRefusal = () => map10(u(ALIAS));
const jeReview = (entryId) => ({
  type: "je_review", entry_id: entryId, revision_token: "rt-1", client_id: "c-1",
  document_id: "d-1", provenance_tier: "verified",
});

test("h17.17 an alias_collision followed by a successful draft settles DRAFTED — the retry lands", () => {
  // The whole point of making the arm retryable: the model is told to re-resolve against the
  // existing record and draft against THAT one, and when it does, the run settles `drafted`.
  const outcome = prompt.toAutoDraftOutcome([
    draftResult({ ok: false, refusal: aliasRefusal() }),
    draftResult({ ok: true, je_review: jeReview("entry-abc") }),
  ]);
  assert.equal(outcome.kind, "drafted");
  assert.equal(outcome.entryId, "entry-abc");
  // And the DISCRIMINATOR: under v9 the same first result was a question-shaped CLR23, so the
  // reducer's `refusedQuestionShaped` slot filled — yet `drafted` still outranks it. What v9
  // actually cost was the OPEN QUESTION on the give-up path below, not this ordering.
  const v9Same = prompt.toAutoDraftOutcome([
    draftResult({ ok: false, refusal: map9(u(ALIAS)) }),
    draftResult({ ok: true, je_review: jeReview("entry-abc") }),
  ]);
  assert.equal(v9Same.kind, "drafted", "precedence is byte-carried; the vocabulary is what moved");
});

test("h17.18 a GIVE-UP run settles refused and, under v10, never reaches openSweepQuestionStep", () => {
  // autoDraft.v10.ts:179-180 opens a scoped human question only when `isQuestionShaped(refusal)`.
  // The alias arm is the reason that line now stays quiet: same reducer, same outcome kind, and
  // the ONE thing that changed is whether the workflow asks a person something they cannot answer.
  const outcome = prompt.toAutoDraftOutcome([draftResult({ ok: false, refusal: aliasRefusal() })]);
  assert.equal(outcome.kind, "refused");
  assert.equal(outcome.refusal.reason, "alias_collision");
  assert.equal(isQuestionShaped(outcome.refusal), false,
    "v10: the give-up path settles failed with a durable reason and opens NO question");

  const v9Outcome = prompt.toAutoDraftOutcome([draftResult({ ok: false, refusal: map9(u(ALIAS)) })]);
  assert.equal(v9Outcome.kind, "refused");
  assert.equal(isQuestionShaped(v9Outcome.refusal), true,
    "v9: the identical give-up path DID open a question — this is the H-17 defect, one line apart");
});

test("h17.16 the v9 closure is untouched: its errors module still answers the OLD way", () => {
  // The freeze manifest is the real guard (append-only vs origin/main); this is the behavioural
  // twin of it, so a reviewer can see that "v9 is frozen" is a fact about behaviour, not only
  // about hashes.
  assert.equal(map9(u(ALIAS)).code, "CLR23");
  assert.equal(map9(u("anything_else_at_all")).reason, "double_coded");
});
