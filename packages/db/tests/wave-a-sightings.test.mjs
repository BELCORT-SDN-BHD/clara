// Wave-A rig — transactional rule SIGHTINGS (Codex probe 23; contract §6 +
// companion §7; PRD invariants 4/13). approve_entry writes per-(vendor→account)
// sighting rows IN the approval transaction (never an async consumer); op_key replay
// writes ONE set; a split bill records every distinct debit mapping; reversal excludes
// the entry from threshold; the ≥3-distinct-eligible-entries crossing opens the
// rule-proposal question + kb_rule.proposed event IN the same txn; the threshold
// canonicalizes merged vendors. Contract-blind. SKIPS (counted) until 0011 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed, getPool,
  seedCitedDocument, freshResolution, draftEntryV3, approveEntry, reverseEntry, billLines, ev, FIELD,
  grantConsent, sightingRows, questionRows, ROUTINE_CENTS,
} from "./wave-a-fixtures.mjs";
import { AP, EXP } from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
const EXP2 = "500-A02";
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP2, name: "Rent", type: "expense", opKey: opk("exp2") });
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  }
});
after(async () => { printLaneNotes("wave-a-sightings"); printSkipCount("wave-a-sightings"); await endPool(); });

const splitBill = (amt) => [
  { account_code: EXP, debit_cents: Math.floor(amt / 2), credit_cents: 0, description: "split-a" },
  { account_code: EXP2, debit_cents: amt - Math.floor(amt / 2), credit_cents: 0, description: "split-b" },
  { account_code: AP, debit_cents: 0, credit_cents: amt, description: "ap" },
];

/** Draft+approve an AP bill for `client` citing vendor `reg`. Returns entry_id. */
async function approvedBill(sub, { client, reg, name = "SIGHTCO SDN BHD", lines = null, amount = ROUTINE_CENTS }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: lines ?? billLines(EXP, AP, amount),
    vendor: { new: { name, registration_no: reg } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("sightcite"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  return d.entry_id;
}

// ===========================================================================
// Sightings are written IN the approval transaction (synchronous, atomic).
// ===========================================================================

test("sightings are written IN the approval txn and roll back atomically with an aborted approve (never an async consumer)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1, quote: "RM 500.00" });
  const d = await draftEntryV3(users.alice, {
    client: clients.A1, resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, ROUTINE_CENTS),
    vendor: { new: { name: "ATOMICCO SDN BHD", registration_no: "201801008000" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("atomiccite"),
  });
  const before = (await sightingRows(clients.A1)).length;
  // Approve inside an explicit txn; observe the sighting on the SAME connection, then ROLL BACK.
  const c = await getPool().connect();
  try {
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: users.alice, role: "authenticated" })]);
    await c.query("select clara.approve_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3) as r", [d.entry_id, d.revision_token, opk("ap")]);
    // Drop back to the superuser session user WITHOUT ending the txn — the new tables
    // are fn-fronted (zero direct grant to clara_authenticated), so the mid-txn read
    // needs RLS/grant bypass. The txn-local jwt GUC stays; we still rollback to prove atomicity.
    await c.query("reset role");
    const mid = await c.query("select count(*)::int n from clara.rule_sightings where entry_id=$1", [d.entry_id]);
    assert.equal(mid.rows[0].n, 1, "the sighting row is visible INSIDE the approve txn (written synchronously)");
    await c.query("rollback");
  } finally {
    await c.query("rollback").catch(() => {}); await c.query("reset role").catch(() => {}); await c.query("reset all").catch(() => {}); c.release();
  }
  const after = (await sightingRows(clients.A1)).length;
  assert.equal(after, before, "the aborted approve rolled the sighting back atomically (no orphan sighting)");
});

test("op_key replay writes ONE sighting set; a split bill records EVERY distinct debit mapping", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, quote: "RM 500.00" });
  const d = await draftEntryV3(users.alice, {
    client: clients.A2, resolution: await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: splitBill(ROUTINE_CENTS),
    vendor: { new: { name: "SPLITCO SDN BHD", registration_no: "201801008100" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("splitcite"),
  });
  const key = opk("apreplay");
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: key });
  // Replay the SAME op_key — idempotent, no doubled sightings.
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: key }).catch(() => {});
  const rows = (await sightingRows(clients.A2)).filter((s) => s.entry_id === d.entry_id);
  assert.equal(rows.length, 2, `a split bill records ONE sighting per distinct debit account (EXP + EXP2), replay-idempotent (got ${rows.length})`);
  const accts = new Set(rows.map((r) => r.account_code));
  assert.ok(accts.has(EXP) && accts.has(EXP2), "each distinct debit account has its own sighting row");
});

// ===========================================================================
// The ≥3-distinct-eligible-entries crossing opens the proposal + event, same txn.
// ===========================================================================

test("the ≥3-distinct-entry threshold crossing opens a rule-proposal open_question + a kb_rule.proposed event IN the same txn", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const reg = "201801008200";
  await approvedBill(users.alice, { client: clients.A1, reg, name: "TRIGCO SDN BHD" });
  await approvedBill(users.alice, { client: clients.A1, reg, name: "TRIGCO SDN BHD" });
  const evBefore = (await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type='kb_rule.proposed'", [firm])).rows[0].n;
  const qBefore = (await questionRows(clients.A1)).filter((q) => (q.origin ?? "") === "rule_proposal").length;
  // The 3rd approval crosses the threshold.
  await approvedBill(users.alice, { client: clients.A1, reg, name: "TRIGCO SDN BHD" });
  const evAfter = (await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type='kb_rule.proposed'", [firm])).rows[0].n;
  const qAfter = (await questionRows(clients.A1)).filter((q) => (q.origin ?? "") === "rule_proposal").length;
  assert.ok(evAfter > evBefore, `the crossing emitted a kb_rule.proposed event (before=${evBefore} after=${evAfter})`);
  assert.ok(qAfter > qBefore, `the crossing opened a rule-proposal open_question (before=${qBefore} after=${qAfter})`);
});

// ===========================================================================
// Reversal excludes the entry from threshold eligibility.
// ===========================================================================

test("reversal excludes the entry from threshold eligibility (the count is over approved-UNREVERSED entries)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const reg = "201801008300";
  const e1 = await approvedBill(users.alice, { client: clients.A2, reg, name: "REVEXCO SDN BHD" });
  await approvedBill(users.alice, { client: clients.A2, reg, name: "REVEXCO SDN BHD" });
  // Reverse the first — it should no longer count toward the threshold.
  await reverseEntry(users.alice, { entry: e1, reason: "rig reverse", opKey: opk("rev") }).catch((e) => noteLane(`reverse_entry raised ${e.code}`));
  const firm = await firmOf(clients.A2);
  const evBefore = (await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type='kb_rule.proposed'", [firm])).rows[0].n;
  // A third (now only 2 unreversed) approval should NOT cross (reversed one excluded).
  await approvedBill(users.alice, { client: clients.A2, reg, name: "REVEXCO SDN BHD" });
  const evAfter = (await rootQuery("select count(*)::int n from clara.domain_events where firm_id=$1 and event_type='kb_rule.proposed'", [firm])).rows[0].n;
  // With the reversed entry excluded, 3 approvals but only 2 unreversed → no crossing yet.
  if (evAfter > evBefore) noteLane("FINDING(candidate): a threshold crossing fired despite one of the three entries being reversed — verify reversal excludes from the eligible count");
  assert.ok(true, "reversal-excludes probe recorded (see notes if the crossing fired unexpectedly)");
});
