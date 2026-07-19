// Slice-6 rig — DELTA PROBES (2) + (4): forced approval/correction/revise/reversal
// schedules with lock snapshots and a HARD deadlock timeout, and the
// facts-completion/approval race (mismatching late facts + transaction abort after
// line stamping). Contract-blind: contract §4 + companion §2/§3 (NEW-1) + §11 +
// INTERFACE-PINS — NEVER from 0009.
//
// NEW-1 serialization: the ACTIVE FILING row is the single serialization point.
// approve takes FOR SHARE on it (_active_document_filing(..,lock)); persist takes
// FOR UPDATE — the two CONFLICT (the approve↔persist serialization), while
// approve↔approve stays uncontended (entry FOR UPDATE serializes those). Both
// winning orders are exercised. A hard statement_timeout in every session is the
// deadlock guard: a genuine deadlock surfaces as 40P01 / 57014 rather than hanging.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  ROUTINE_CENTS,
  opk,
  s6EnsureReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  CLR,
  CLR23,
  CLR25,
  CODING_KIND,
  firmOf,
  upsertPayableAccount,
  upsertAccountClassed,
  seedCitedDocument,
  billLines,
  ev,
  freshResolution,
  mintInteractive,
  wakeDraftEntry,
  approveEntry,
  entryRow,
  enqueueInvoiceFacts,
  invoiceFactsTask,
  claimTask,
  setDocLimits,
  FIELD,
} from "./s6-fixtures.mjs";
import { holdThenContend, concurrentTwoSession, sawDeadlock } from "./rig-docs-race.mjs";

let ready = false;
let world = null;
const AP = "400-000";
const EXP = "500-A01";
const GUARD = "set local statement_timeout = '5000ms'";

before(async () => {
  ready = await s6EnsureReady();
  if (ready) {
    world = await buildWorld();
    // The facts lane now counts toward the OCR concurrency cap (N-F1). These
    // schedules leave several facts tasks claimed-running, so give the firm ample
    // headroom — the cap itself is exercised in s6-metering.test.mjs.
    for (const f of Object.values(world.firms)) await setDocLimits(f, { ocrConcurrency: 100 });
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
    }
  }
});
after(async () => {
  printLaneNotes("s6-locks");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-6 coding floor not present — 0009 not yet applied"); return true; }
  return false;
}

/** A Tier-B wake supplier bill (amount cents) on a cited doc + a claimed running
 *  invoice_facts task ready to persist. Returns { draft, cited, task }. */
async function billWithClaimedFacts(sub, { client, amount = 500000 }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 5,000.00" });
  const cred = await mintInteractive(firm);
  const res = await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId });
  const draft = await wakeDraftEntry(cred, {
    client, resolution: res, lines: billLines(EXP, AP, amount),
    document: cited.documentId, sha256: cited.sha256, vendor: { new: { name: "LOCKCO SDN BHD", registration_no: "201801000700" } },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)], codingKind: CODING_KIND,
    opKey: `code-doc:${cited.filingId}:${cited.documentId}`,
  });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  return { draft, cited, task };
}

const approveRun = (entry, tok) => async (c) => {
  await c.query(GUARD);
  return c.query("select clara.approve_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3) as r", [entry, tok, opk("ap")]);
};
const persistRun = (task, totalRaw) => async (c) => {
  await c.query(GUARD);
  return c.query(
    "select clara.persist_invoice_facts(p_task => $1, p_fields => $2::jsonb, p_raw_sha256 => $3, p_normalization_version => $4, p_pages_used => 1) as r",
    [task, JSON.stringify([{ field_path: FIELD.total, value_raw: totalRaw, page: 1, polygon: [0, 0, 1, 1], confidence: 0.98 }, { field_path: FIELD.currency, value_raw: "MYR", page: 1, polygon: [0, 0, 1, 1], confidence: 0.99 }]), "a".repeat(64), "norm-2026-01"],
  );
};

// ===========================================================================
// PROBE (4) + NEW-1 — facts↔approval race, BOTH winning orders + late mismatch.
// ===========================================================================

test("NEW-1 order A (facts-first, MISMATCHING late facts): persist holds the filing FOR UPDATE; approve BLOCKS (proven), then loses — never a silent approve; no deadlock", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const { draft, task } = await billWithClaimedFacts(users.alice, { client: clients.A1, amount: 500000 });
  const out = await holdThenContend({
    a: { role: ROLES.runtime, run: persistRun(task.id, "RM 6,000.00") }, // contradicting 600000
    b: { role: ROLES.authenticated, jwtSub: users.alice, run: approveRun(draft.entry_id, draft.revision_token) },
  });
  assert.ok(out.provedBlocked, "approve BLOCKED on persist's FOR UPDATE of the active filing (FOR SHARE vs FOR UPDATE serialization proven)");
  assert.ok(!sawDeadlock(out), "no deadlock (40P01/40001) in the facts-first schedule");
  assert.equal(out.a.ok, true, "persist committed first");
  assert.equal(out.b.ok, false, "approve did NOT silently succeed against the contradicting late facts");
  assert.ok([CLR.revision, CLR25, CLR23].includes(out.b.code), `approve lost with a lawful refusal (got ${out.b.code}) — CLR06 rotated / CLR25 stale-evidence / CLR23 gross-mismatch`);
  assert.equal((await entryRow(draft.entry_id)).status, "draft", "the entry stays a DRAFT — the aborted approve rolled back atomically (no partial line stamping)");
  noteLane(`facts-first: approve refused with ${out.b.code}`);
});

test("NEW-1 order B (approve-first): approve holds the filing FOR SHARE; persist BLOCKS (proven) then commits harmlessly (no open draft to rotate); no deadlock", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  // Amount matches (500000) so approve succeeds when it wins.
  const { draft, task } = await billWithClaimedFacts(users.alice, { client: clients.A2, amount: 500000 });
  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: users.alice, run: approveRun(draft.entry_id, draft.revision_token) },
    b: { role: ROLES.runtime, run: persistRun(task.id, "RM 5,000.00") },
  });
  assert.ok(out.provedBlocked, "persist BLOCKED on approve's FOR SHARE of the active filing");
  assert.ok(!sawDeadlock(out), "no deadlock in the approve-first schedule");
  assert.equal(out.a.ok, true, "approve committed first (Tier-B, matching amount)");
  assert.equal(out.b.ok, true, "persist then committed harmlessly (nothing open to rotate)");
  assert.equal((await entryRow(draft.entry_id)).status, "approved", "the entry is approved");
});

// ===========================================================================
// PROBE (2) — approve/reverse/revise schedules, consistent lock order, no deadlock.
// ===========================================================================

test("C-2 two concurrent approves of the SAME draft → exactly one wins, the other refuses (CLR06/CLR10); no deadlock", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const { draft } = await billWithClaimedFacts(users.alice, { client: clients.A1, amount: ROUTINE_CENTS });
  const out = await concurrentTwoSession({
    a: { role: ROLES.authenticated, jwtSub: users.alice, run: approveRun(draft.entry_id, draft.revision_token) },
    b: { role: ROLES.authenticated, jwtSub: users.bob, run: approveRun(draft.entry_id, draft.revision_token) },
  });
  assert.ok(!sawDeadlock(out), "concurrent same-draft approves do NOT deadlock (entry FOR UPDATE serializes them)");
  const wins = [out.a, out.b].filter((s) => s.ok).length;
  assert.equal(wins, 1, "exactly ONE approve wins");
  const loser = [out.a, out.b].find((s) => !s.ok);
  assert.ok([CLR.revision, CLR.badRequest].includes(loser.code), `the loser refuses with CLR06 (stale token) or CLR10 (already approved) — got ${loser.code}`);
});

test("C-2 approve of one draft || reverse of an unrelated approved entry on the SAME client → no deadlock (consistent global lock order)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  // An approved entry to reverse.
  const { draft: approved } = await billWithClaimedFacts(users.alice, { client: clients.A1, amount: ROUTINE_CENTS });
  await approveEntry(users.alice, { entry: approved.entry_id, expectedRevision: approved.revision_token, opKey: opk("ap") });
  // A fresh draft to approve concurrently.
  const { draft: fresh } = await billWithClaimedFacts(users.alice, { client: clients.A1, amount: ROUTINE_CENTS });
  const out = await concurrentTwoSession({
    a: { role: ROLES.authenticated, jwtSub: users.alice, run: approveRun(fresh.entry_id, fresh.revision_token) },
    b: { role: ROLES.authenticated, jwtSub: users.bob, run: async (c) => { await c.query(GUARD); return c.query("select clara.reverse_entry(p_entry => $1, p_reason => $2, p_op_key => $3) as r", [approved.entry_id, "concurrent reversal", opk("rev")]); } },
  });
  assert.ok(!sawDeadlock(out), "approve || reverse on the same client do not deadlock");
  assert.ok(out.a.ok || out.b.ok, "at least one of the two independent operations committed");
});
