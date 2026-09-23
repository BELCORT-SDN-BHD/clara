// #939 — A PREPAYMENT POSTED WITH NO DOCUMENT CAN BE AMORTISED FROM A PERSON-STATED SERVICE
// PERIOD. Migration: 0305_prepayment_stated_term.sql. Frontier-gated on its own STABLE STEM
// (`prepayment_stated_term$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `prepayment_term_liveness$` / `accrual_correction$` idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog and the doors' behaviour.
//
// EVERY DOOR CELL RUNS AS BOB — an ordinary BOOKKEEPER, the least-privileged writer this floor
// admits — through the `humanQuery(sub, namedCall(...))` wrappers #653's own battery uses. The two
// evaluator cells call `rootQuery`, and that is not a shortcut: `clara.prepayment_schedule_v1` and
// `clara.prepayment_schedule_v2` hold NO application grant at all, so the owner is the only
// principal that can reach them and minting a grant to test one would be the defect.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  assertStatedTermLanePresent, endPool, rootQuery, CLR, assertPair, assertRaises,
  statedTermScene, recordStatedTerm, statedTermRow, statedTermsFor, roleCanExecute,
  functionsMatching, nowhereId,
  STATED_TERM_REASON, STATED_TERM_DOOR_SIG,
} from "./prepayment-stated-term-fixtures.mjs";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 1;

before(async () => {
  ready = await (async () => {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1",
      ["prepayment_stated_term$"]);
    return r.rows[0].n > 0;
  })().catch(() => false);
});

after(async () => {
  if (ready) {
    assert.equal(executed, EXPECTED_CELLS,
      `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  await endPool();
});

function cell(name, fn) {
  test(name, async (t) => {
    if (await assertStatedTermLanePresent(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ===========================================================================================
// AC1 — THE STATED-TERM CARRIER AND ITS ONE HUMAN DOOR.
// ===========================================================================================

cell("p939.stated_term.record — a bookkeeper states the service period of a MEMO-ONLY recognition with a reason, the row is live and carries who said so, a second statement SUPERSEDES the first, the machine roles cannot reach the door and no wake wrapper exists for it", async () => {
  const scene = await statedTermScene("record", { cents: 90000, termMonthsBack: 4, termMonths: 3 });

  // The door is BOOKKEEPER-FLOORED, exactly as `clara.record_document_service_period` is: stating
  // a term is the same act on the other lane, and the ticket's ruling 2 says the same floor.
  await assertRaises(CLR.authz,
    () => recordStatedTerm(scene.w.users.carol, {
      client: scene.client, sourceEntry: scene.memoEntry,
      start: scene.termStart, end: scene.termEnd }),
    "a viewer stating a prepayment term");

  const stated = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd,
  });
  assert.ok(stated.stated_term_id, "the door names the row it wrote");
  assert.equal(stated.superseded_id, null, "the first statement supersedes nothing");
  assert.equal(stated.period_start, scene.termStart);
  assert.equal(stated.period_end, scene.termEnd);

  const row = await statedTermRow(stated.stated_term_id);
  assert.equal(row.source_entry_id, scene.memoEntry, "the term is anchored to the ENTRY, not to a document");
  assert.equal(row.client_id, scene.client);
  assert.equal(row.period_start, scene.termStart);
  assert.equal(row.period_end, scene.termEnd);
  assert.ok(row.reason && row.reason.trim().length > 0, "the stated reason is stored, never defaulted");
  assert.ok(row.stated_by, "…and WHO said so");
  assert.ok(row.stated_at, "…and WHEN");
  assert.equal(row.superseded_at, null, "the row is live");

  // A REASON IS NOT OPTIONAL. The ruling is "the term must be stated by a named person with a
  // reason"; a blank one is refused BY NAME rather than stored as an unexplained judgement.
  await assertPair(CLR.badRequest, STATED_TERM_REASON.reasonMissing,
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: scene.memoEntry,
      start: scene.termStart, end: scene.termEnd, reason: "   " }),
    "a stated term with a blank reason");

  // SUPERSEDE, NEVER UPDATE — decision 3's "corrected by superseding it". The predecessor is
  // stamped with the successor's id and stays on the record.
  const corrected = await recordStatedTerm(scene.bob, {
    client: scene.client, sourceEntry: scene.memoEntry,
    start: scene.termStart, end: scene.termEnd,
    reason: "#939 battery: the client sent the policy schedule and the dates were confirmed",
  });
  assert.notEqual(corrected.stated_term_id, stated.stated_term_id, "a correction is a NEW row");
  assert.equal(corrected.superseded_id, stated.stated_term_id,
    "…and it names the row it superseded");
  const all = await statedTermsFor(scene.memoEntry);
  assert.equal(all.length, 2, "both statements are on the record — this relation is append-only");
  const first = all.find((x) => x.id === stated.stated_term_id);
  assert.equal(first.superseded_by, corrected.stated_term_id);
  assert.ok(first.superseded_at, "the predecessor carries its supersession stamp");
  assert.equal(all.filter((x) => x.superseded_at === null).length, 1,
    "exactly ONE live stated term per source entry");

  // A DOCUMENT-BOUND RECOGNITION IS NOT THIS DOOR'S BUSINESS. The two lanes share nothing: the
  // ticket's own line is "without touching the document service-period table the two lanes share".
  await assertPair(CLR.badRequest, STATED_TERM_REASON.sourceHasDocument,
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: scene.entry,
      start: scene.termStart, end: scene.termEnd }),
    "stating a term for an entry that binds a document");

  // THE 0021 RULE: absent and foreign answer with ONE refusal, so this door is not an existence
  // oracle for another client's entries.
  await assertPair(CLR.notFound, STATED_TERM_REASON.entryNotFound,
    () => recordStatedTerm(scene.bob, {
      client: scene.client, sourceEntry: nowhereId(),
      start: scene.termStart, end: scene.termEnd }),
    "stating a term for an entry that does not exist");

  // DECISION 6 — NOT OPENED TO CLARA. No agent grant, and no wake wrapper: a model may only ever
  // ask the fixed two-date question. Both halves are read POSITIVELY off the catalog.
  for (const role of ["clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive",
                      "clara_runtime"]) {
    assert.equal(await roleCanExecute(role, STATED_TERM_DOOR_SIG), false,
      `${role} must not be able to execute the stating door`);
  }
  assert.equal(await roleCanExecute("clara_authenticated", STATED_TERM_DOOR_SIG), true,
    "the human lane holds it");
  assert.deepEqual(await functionsMatching("prepayment_stated_term"),
    ["record_prepayment_stated_term"],
    "exactly one function carries this name — no wake wrapper, no agent core");
});
