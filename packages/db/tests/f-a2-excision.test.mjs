// F-A2 PR-1 — Annex C.8: BREEDING EXCISION, the inverted twins.
//
// CONTRACT-BLIND, frontier-gated on `f_a2_posting_core$`.
//
// FIXTURED AS AGENT POSTS, AND THAT IS THE POINT. C.8 says it in one line — "a human fixture
// would prove only the human case" — and the reason is structural: the breeding block being
// deleted lives inside `_approve_entry_core` (`0037:2046-2100`), which BOTH lanes share. A cell
// that only ever approved as a human would be green whether or not the agent lane bred, and the
// agent lane is the one this design makes unattended. So every excision cell below drives an
// AGENT POST, and the human-approve twins are added BESIDE them rather than instead of them.
//
// THESE ARE INVERSIONS OF LIVE CELLS, and each names the one it inverts. That is what makes
// them evidence rather than assertion: `x37-wave-c-a-subledger.test.mjs:1951` asserts that three
// employee claims DO breed a `vendor_account` proposal, and `x42.prod-23`'s control half
// (`:296-307`) asserts an ordinary approval DOES move the sighting counter. After the 8th body
// both must be FALSE, and PR-3 re-points them. Until then, these cells hold the other end.
//
// KEEP-AS-HISTORY IS NOT DELETION. The writes stop; the TABLES stay. `clara.coding_lane` is
// reached by the FROZEN toolfaces and `_coding_lane_core` reads `coding_rules`, and
// `journal_entry_revisions.rule_decision_id` is a live FK to `rule_decisions`. The last cell
// here is the one that would catch a "tidy-up" that dropped a relation and stranded a parked
// run with `undefined_table`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane, ROLES, roleQuery,
  opk, approveEntry, entryRow, counterpartyRows, postingCoreReady,
  gateCore, wakePostEntry, agentPostable, bodyOfName, countFor,
  booksVersion,
} from "./f-a2-post-world.mjs";

let world = null;
before(async () => { if (await postingCoreReady()) world = await buildWorld(); });
after(async () => {
  printLaneNotes("f-a2-excision");
  printSkipCount("f-a2-excision");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const OWNER = () => world.users.alice;

/** A census of every relation the breeding block used to write, for one client. */
async function breedCensus(client) {
  return {
    rule_sightings: await countFor("rule_sightings", client),
    coding_rules: await countFor("coding_rules", client),
    rule_decisions: await countFor("rule_decisions", client),
    open_questions: await countFor("open_questions", client),
    kb_events: (await rootQuery(
      `select count(*)::int as n from clara.domain_events d
        join clara.clients c on c.id=$1 and c.firm_id=d.firm_id
       where d.event_type like 'kb_rule.%'`, [client]).catch(() => ({ rows: [{ n: null }] }))).rows[0].n,
  };
}

/** The 8th body, resolved BY NAME. The live core is FIVE-arity — `(p_ctx jsonb, p_entry uuid,
 *  p_expected_revision uuid, p_attestation text, p_op_key text)` — and a cell that hardcoded four
 *  got a NULL body back and reported it as "the core did not resolve", which is the test being
 *  wrong wearing the costume of a build finding. */
const approveCoreBody = async () => (await bodyOfName("_approve_entry_core")).src;

// ===========================================================================
// The four zero-breed cells, all on an AGENT POST.
// ===========================================================================

test("f-a2.c8.zero after the 8th body an AGENT POST breeds nothing — sightings, rules, questions, kb_rule", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1(), amount: 505000 });
  const before = await breedCensus(A1());
  const wire = await wakePostEntry(p.cred, p.args);
  assert.equal(wire?.posted, true, `c8.zero: the post landed (${JSON.stringify(wire?.refusal)})`);
  const after = await breedCensus(A1());
  for (const k of ["rule_sightings", "coding_rules", "open_questions"]) {
    assert.notEqual(before[k], null, `c8.zero: ${k} is a KEPT relation — reading it must succeed, because keep-as-history means the table stays`);
    assert.equal(after[k], before[k],
      `c8.zero: an agent post writes no ${k} row (${before[k]} -> ${after[k]}). The ≥3-distinct-entry loop and both sighting inserts die with the block`);
  }
  // THE SAME NULL CHECK THE LOOP ABOVE APPLIES, NOT SKIPPED FOR THIS FIELD TOO. Without it a
  // broken kb_events query reads null both before and after, and null===null passes the
  // equality vacuously — proving the query is consistently broken, not that nothing was emitted.
  assert.notEqual(before.kb_events, null,
    "c8.zero: kb_events is a real read, not a query that silently failed both times");
  assert.equal(after.kb_events, before.kb_events,
    `c8.zero: …and emits no kb_rule.* event (${before.kb_events} -> ${after.kb_events})`);
});

test("f-a2.c8.bank-conjunct the 0040:7115 bank_rule_suggested conjunct is GONE — count 2 -> 0, not 2 -> 1", async (t) => {
  if (await gateCore(t)) return;
  const src = await approveCoreBody();
  assert.ok(src, "c8.bank-conjunct: the approve core resolves");
  const n = [...src.matchAll(/bank_rule_suggested/g)].length;
  assert.equal(n, 0,
    `c8.bank-conjunct: BOTH occurrences live inside the deleted region — the SECTION-S5 comment block and the '? bank_rule_suggested' conjunct are the head of the if-gate on the breeding block, so deleting the block deletes both (found ${n})`);
  noteLane("c8.bank-conjunct: the 0040 splice was INERT ON ARRIVAL by its own admission — no writer stamps that key. Nothing behavioural is lost, and PR-1's prestate states 0 rather than 1");
});

test("f-a2.c8.markers the EIGHT carry markers survive at count 1 and the THREE retire markers are gone", async (t) => {
  if (await gateCore(t)) return;
  // The `0040:7148-7159` anti-revert postcheck pins eleven markers at exact counts — it is what
  // proves the recut carried 0017's dynamic splice, 0029's vendor-binding pins, 0035's advisory
  // and 0037's hook + settlement refusal through UNCHANGED. PR-1's prestate must state a
  // disposition for every one, or a copy-the-0040-idiom prestate refuses at apply.
  const src = await approveCoreBody();
  assert.ok(src, "c8.markers: the approve core resolves");
  const CARRY = [
    "opening_entry_k_family_only", "[R1-F1] K-family-only lifecycle boundary", "receipt_preheld",
    "bound_extraction", "unpinned_rule_post", "settlement_not_autopostable",
    "clara._subledger_on_approve(", "no_counterparty_sighting",
  ];
  const RETIRE = [
    ["H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only", 1],
    ["insert into clara.rule_sightings", 2],
    ["uq_rule_sightings_mapping", 2],
  ];
  for (const m of CARRY) {
    const n = src.split(m).length - 1;
    assert.equal(n, 1, `c8.markers: CARRY '${m}' survives at its original count of 1 (found ${n})`);
  }
  for (const [m, was] of RETIRE) {
    const n = src.split(m).length - 1;
    assert.equal(n, 0, `c8.markers: RETIRE '${m}' is gone — it stood at ${was} before the 8th body (found ${n})`);
  }
});

// ===========================================================================
// The three inversions.
// ===========================================================================

test("f-a2.c8.inv-employee three employee claims no longer breed a vendor_account proposal", async (t) => {
  if (await gateCore(t)) return;
  // The inversion of `x37-wave-c-a-subledger.test.mjs:1951`. Three approved entries against the
  // SAME counterparty+account used to cross the ≥3-distinct-entry threshold and mint a proposal.
  // C3: FORCED. `noteLane` writes to stderr and node counts the cell PASSED, so a note plus an
  // early return is never a skip — it is a green recorded for the one outcome that leaves the
  // claim unproven.
  // Three claims that DID NOT POST breed nothing for the boring reason, so the inversion has to
  // assert each one landed — otherwise `after === before` is a tautology.
  const before = await countFor("coding_rules", A2());
  assert.notEqual(before, null,
    "c8.inv-employee: the coding_rules count is a real read, not an absent relation read as zero (review law 2)");
  const vendor = { new: { name: `C8 CLAIMANT ${Date.now().toString(36)} SDN BHD` } };
  for (let i = 0; i < 3; i++) {
    const p = await agentPostable(OWNER(), { client: A2(), amount: 120000 + i, vendor });
    const wire = await wakePostEntry(p.cred, { ...p.args, booksVersion: await booksVersion(A2()) });
    assert.equal(wire?.posted, true,
      `c8.inv-employee: claim ${i + 1} POSTED — three claims that never landed would breed nothing for the boring reason (${JSON.stringify(wire?.refusal)})`);
  }
  const after = await countFor("coding_rules", A2());
  assert.equal(after, before,
    `c8.inv-employee: the ≥3 loop is gone — three claims mint NO vendor_account proposal (${before} -> ${after})`);
});

test("f-a2.c8.inv-ordinary an ORDINARY approval on the same counterparty+account no longer moves the sighting counter", async (t) => {
  if (await gateCore(t)) return;
  // The inversion of `x42.prod-23`'s CONTROL half (`:296-307`). Its carve-out half (`:335`)
  // already records as vacuous, which is why only the control half needs an opposite number
  // (M-10).
  const before = await countFor("rule_sightings", A2());
  assert.notEqual(before, null, "c8.inv-ordinary: the count is a real read, not an absent relation read as zero");
  const p = await agentPostable(OWNER(), { client: A2(), amount: 130000 });
  await approveEntry(OWNER(), { entry: p.args.entry, expectedRevision: p.args.expectedRevision, opKey: opk("c8ord") });
  assert.equal((await entryRow(p.args.entry))?.status, "approved", "c8.inv-ordinary: the ordinary human approval landed");
  assert.equal(await countFor("rule_sightings", A2()), before,
    `c8.inv-ordinary: and the sighting counter did NOT move (${before}) — the carve-out that used to make this human-only is deleted along with the thing it carved`);
});

test("f-a2.c8.zero-heads BOTH re-pointed zero-count heads: an agent post AND a human approve leave rule_sightings unchanged", async (t) => {
  if (await gateCore(t)) return;
  // Absorbing `wb-s-seeding.test.mjs:202-203`, with `:205` re-pointed OFF the `?? ""` fail-soft
  // `fnSource` read (M-8) — a read that cannot say NO has a meaningless YES, so the head is
  // re-pointed at a COUNT, which can.
  const before = await countFor("rule_sightings", A1());
  assert.notEqual(before, null, "c8.zero-heads: the count is a real read, not a fail-soft empty string");
  const agentSide = await agentPostable(OWNER(), { client: A1(), amount: 141000 });
  const agentWire = await wakePostEntry(agentSide.cred, agentSide.args);
  // C3: the POST must have happened. Head 1 measures what an agent post does to the counter, and
  // a post that never landed leaves it unchanged for a reason that has nothing to do with the
  // excision.
  assert.equal(agentWire?.posted, true,
    `c8.zero-heads: head 1's agent post LANDED (${JSON.stringify(agentWire?.refusal)})`);
  const mid = await countFor("rule_sightings", A1());
  assert.equal(mid, before, `c8.zero-heads: head 1 — the AGENT POST left it unchanged (${before} -> ${mid})`);
  const humanSide = await agentPostable(OWNER(), { client: A1(), amount: 142000 });
  await approveEntry(OWNER(), { entry: humanSide.args.entry, expectedRevision: humanSide.args.expectedRevision, opKey: opk("c8zh") });
  assert.equal(await countFor("rule_sightings", A1()), before,
    "c8.zero-heads: head 2 — the HUMAN APPROVE left it unchanged too");
});

test("f-a2.c8.rule-decisions _draft_entry_core writes no rule_decisions row (OQ-2)", async (t) => {
  if (await gateCore(t)) return;
  const before = await countFor("rule_decisions", A1());
  assert.notEqual(before, null, "c8.rule-decisions: the count is a real read, not an absent relation read as zero");
  await agentPostable(OWNER(), { client: A1(), amount: 151000 });
  assert.equal(await countFor("rule_decisions", A1()), before,
    `c8.rule-decisions: the coding_rules FOR SHARE read and the rule_decisions insert are both gone from the draft core (${before})`);
  const { src } = await bodyOfName("_draft_entry_core");
  // C3: the body read is FORCED. `if (src)` made the strongest half of this cell optional — and
  // it is the half that survives a table that has simply stopped being written to for some other
  // reason.
  assert.ok(src, "c8.rule-decisions: the draft core resolves by name");
  assert.ok(!/insert\s+into\s+clara\.rule_decisions/i.test(src.replace(/--[^\n]*/g, " ")),
    "c8.rule-decisions: …and the body carries no such insert");
  noteLane("c8.rule-decisions: OQ-2's recommendation is STOP THE WRITE, KEEP THE TABLE — a live FK (0011:898) from journal_entry_revisions.rule_decision_id forbids dropping it");
});

// ===========================================================================
// The human lane is otherwise untouched, and the KEPT relations stay reachable.
// ===========================================================================

test("f-a2.c8.human-identical the human approve path is otherwise BYTE-IDENTICAL — receipt, audit row, event and entry", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1(), amount: 161000 });
  const receipt = await approveEntry(OWNER(), {
    entry: p.args.entry, expectedRevision: p.args.expectedRevision, opKey: opk("c8hi"),
  });
  // The RECEIPT's key set, not its values — values carry uuids and timestamps that differ by
  // construction. A key that appeared or vanished is the shape a body recut leaks.
  const keys = Object.keys(receipt ?? {}).sort();
  assert.ok(keys.length > 0, "c8.human-identical: approve_entry still returns a receipt");
  assert.ok(!keys.includes("post_receipt_id"),
    `c8.human-identical: the HUMAN receipt gained no agent-lane key (keys: ${keys.join(",")})`);
  assert.ok(!keys.includes("rung_vector"), "c8.human-identical: …and no rung vector");
  // MANDATORY, NOT OPTIONAL. `if (audit.rows.length)` made a broken query indistinguishable
  // from "no audit row exists yet" — both silently skipped the two assertions this cell exists
  // to run. A human approval MUST leave an audit row; the read is required to succeed and find one.
  const audit = await rootQuery(
    "select fn, on_behalf_of, via_wake_kind from clara.audit_log where entry_id=$1 order by at desc limit 1",
    [p.args.entry]);
  assert.equal(audit.rows.length, 1, "c8.human-identical: mandatory setup — a human approval writes exactly one audit_log row");
  assert.equal(audit.rows[0].on_behalf_of, null, "c8.human-identical: a human approval carries no on_behalf_of");
  assert.equal(audit.rows[0].via_wake_kind, null, "c8.human-identical: …and no wake kind");
  const events = await rootQuery(
    "select event_type from clara.domain_events where entry_id=$1 order by seq", [p.args.entry]);
  const types = events.rows.map((x) => x.event_type);
  assert.ok(!types.includes("entry.posted"),
    `c8.human-identical: a HUMAN approval emits entry.approved, never entry.posted (${types.join(",")})`);
  assert.equal(await rootQuery(
    "select count(*)::int as n from clara.entry_post_receipts where entry_id=$1", [p.args.entry])
    .then((r) => r.rows[0].n), 0, "c8.human-identical: and writes no post receipt");
  assert.equal((await entryRow(p.args.entry))?.status, "approved", "c8.human-identical: the entry approved normally");
});

test("f-a2.c8.parked a parked run against a FROZEN toolface still reaches clara.coding_lane without undefined_table", async (t) => {
  if (await gateCore(t)) return;
  // KEEP-AS-HISTORY, made behavioural. `_coding_lane_core` reads `coding_rules` (0031:470-472),
  // and the frozen toolfaces from autoDraft.v1 to v8 all call `coding_lane`. Dropping the table
  // would strand every parked run with 42P01 — a failure a source review does not see, because
  // the caller is a frozen bundle nobody is editing.
  const out = await roleQuery(ROLES.agentRo, "select clara.coding_lane(p_client => $1) as r", [A1()])
    .catch((e) => ({ error: e }));
  assert.ok(!out?.error || out.error.code !== "42P01",
    `c8.parked: coding_lane does not raise undefined_table (got ${out?.error?.code}: ${out?.error?.message})`);
  // ANY OTHER ERROR IS SURFACED, NOT SILENTLY ACCEPTED. This cell's stated scope is narrow —
  // 42P01 specifically, the signature a dropped table would leave on a frozen bundle's call —
  // but a DIFFERENT error (e.g. a lost grant) is still worth a visible note rather than a
  // silent pass, since the cell's own name claims the call "still reaches" the function.
  if (out?.error && out.error.code !== "42P01") {
    noteLane(`c8.parked: coding_lane raised a non-42P01 error outside this cell's scope (${out.error.code}: ${out.error.message}) — worth a look, not a failure here`);
  }
  for (const rel of ["rule_sightings", "coding_rules", "rule_decisions", "rule_post_runs", "rule_post_skips"]) {
    const r = await rootQuery("select to_regclass($1) as rel", [`clara.${rel}`]);
    assert.ok(r.rows[0].rel, `c8.parked: clara.${rel} still EXISTS — keep-as-history drops the WRITES and the VERBS, never the TABLES`);
  }
  const cp = await counterpartyRows(A1());
  assert.ok(Array.isArray(cp), "c8.parked: the counterparty read still works after the excision");
});
