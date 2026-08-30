// 裁-44 — the BANK lane's fold cells, each driven end to end through the real wrapper stack.
//
// Every cell here exists because an independent adversarial pass found the defect on a rig, not
// because a document said so. They share g1-wake-bank-fixtures.mjs's books with the E2 cell next
// door; what is different is that each one drives a SEQUENCE — a split, a retry, a refuse-then-
// correct, a cross-account read — which is the only shape in which these four defects are visible.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as rig from "./rig.mjs";
import { skip, plantHeldWakeTask } from "./g1-wake-bodies.fixtures.mjs";
import { buildApprovedEntries, buildBankAccount, buildBankPrereqs, injectBankPools } from "./g1-wake-bank-fixtures.mjs";

const { register } = await import("tsx/esm/api");
register();

const tools = await import("../workflows/bankAgent.v1.tools.ts");

/** A running wake task plus the tool set bound to it, ready to drive. */
async function armed(w, bankAccountId, attemptKey = "attempt-1") {
  // THE PRODUCER CONTRACT, in the fixture (#437's own RED, now enforced by G1 PR-2a's §F): the
  // event payload must carry bank_account_id, because the pack is per-account and the bank role
  // cannot enumerate accounts. A `{}` payload now yields wake_task_account_unbound on the first
  // tool call.
  const { taskId } = await plantHeldWakeTask({
    owner: w.owner, client: w.client, payload: { bank_account_id: bankAccountId } });
  await rig.rootQuery("update clara.agent_tasks set status='running' where id=$1", [taskId]);
  const rec = tools.newBankRunRecord(attemptKey);
  const ctx = { taskId, firmId: w.firm, clientId: w.client, bankAccountId, dueReason: null };
  return { taskId, rec, ctx, built: tools.buildBankAgentTools(ctx, rig.DEFAULT_MODEL, rec) };
}

const memberCount = (client) =>
  rig
    .rootQuery(
      `select count(*)::int as n from clara.bank_match_entry_members em
         join clara.bank_matches bm on bm.id = em.match_id where bm.client_id = $1`,
      [client],
    )
    .then((r) => r.rows[0].n);

test("G1B-BANK-E3 裁-44 FOLD-1 — a split the model would have invented is REFUSED locally with zero members; the two shapes the database owns are ADMITTED", { skip }, async () => {
  // THE ATTACK, in the reviewer's own words: for a 10,000-cent line and two selected entries each
  // having sufficient debit capacity, submit 4,999 + 5,001. tie_nonzero sees only the aggregate
  // (0121:5897), capacity_exhausted bounds each amount by its own entry's cap (:5955), and
  // same_amount_ambiguous searches unselected entries against the aggregate (:5911) — all three
  // pass, and the model's invented split becomes a durable bank_match_entry_members row.
  //
  // It is no longer expressible: the tool takes entry IDS. What this cell proves end to end is the
  // consequence — the two-entry case with spare capacity is refused BEFORE the database, with zero
  // members written, and the two shapes the database genuinely owns still go through.
  const w = await rig.buildFirm("g1be3");
  await buildBankPrereqs(w);
  const acct = await buildBankAccount(w, [10000, 9000]);
  // 25,000 / 25,000 are the "spare capacity" pair the attack needs; 4,000 + 5,000 are the pair
  // whose FULL capacities tie the second line exactly. None of the four has a gross capacity equal
  // to either aggregate, so same_amount_ambiguous cannot fire and mask a verdict.
  const [spareA, spareB, exactA, exactB] = await buildApprovedEntries(w, [25000, 25000, 4000, 5000]);
  const [line1, line2] = acct.lineIds;

  const previous = injectBankPools();
  try {
    const { rec, built } = await armed(w, acct.bankAccountId);
    const pack = await built.get_bank_pack.execute({ rationale: "reading the pack before acting" });
    tools.beginModelStep(rec); // FOLD-20(c): the model has now SEEN this pack
    assert.equal(pack.error, undefined, `the pack read must succeed — got ${JSON.stringify(pack)?.slice(0, 300)}`);
    assert.equal(await memberCount(w.client), 0, "the books start with no matched members — the baseline this cell measures against");

    // (a) THE SPLIT CASE. Two entries with spare capacity against one line: their FULL capacities
    // are 50,000 against a 10,000 line, so there is no division available and the tool refuses
    // locally. Nothing reaches the database.
    const split = await built.match_bank_line.execute({
      lines: [line1],
      entries: [spareA, spareB],
      rationale: "two candidates, both with room — this is where an invented split used to live",
    });
    assert.match(String(split.error), /entries_do_not_tie/, `the split must be refused LOCALLY, by name — got ${JSON.stringify(split)?.slice(0, 300)}`);
    assert.equal(await memberCount(w.client), 0, "AND NOTHING WAS WRITTEN — the assertion the whole ruling is about");
    assert.equal(rec.admitted, 0, "a local refusal is not an act");
    assert.equal(rec.refusals, 1, "it is a refusal");
    assert.equal(rec.writeAttempts, 1, "and it is counted as an ATTEMPT, which is what makes a night of these settle failed");
    assert.equal(rec.infraFaults, 0, "the fault is the model's proposal, never ours");

    // (b) THE SINGLE-ENTRY PARTIAL CASE — one entry whose capacity EXCEEDS the line. The line
    // settles in full and the entry is partly consumed; the amount is the pack's, not the model's.
    const single = await built.match_bank_line.execute({
      lines: [line1],
      entries: [spareA],
      rationale: "one candidate with room to spare — the line settles in full against it",
    });
    assert.equal(single?.status, "live", `the single-entry partial match must be ADMITTED — got ${JSON.stringify(single)?.slice(0, 300)}`);
    const m1 = await rig.rootQuery("select matched_cents from clara.bank_match_entry_members where match_id=$1", [single.match_id]);
    assert.equal(m1.rowCount, 1);
    assert.equal(Number(m1.rows[0].matched_cents), 10000, "the LINE's amount, read out of the pack — min(line, capacity)");

    // (c) THE FULL-SETTLEMENT TWO-ENTRY CASE — two entries whose FULL remaining capacities add up
    // to the line exactly. This is the only multi-entry shape that exists now.
    const pair = await built.match_bank_line.execute({
      lines: [line2],
      entries: [exactA, exactB],
      rationale: "two candidates whose full capacities tie this line between them",
    });
    assert.equal(pair?.status, "live", `the full-settlement pair must be ADMITTED — got ${JSON.stringify(pair)?.slice(0, 300)}`);
    const m2 = await rig.rootQuery(
      "select entry_id, matched_cents from clara.bank_match_entry_members where match_id=$1 order by matched_cents",
      [pair.match_id],
    );
    assert.equal(m2.rowCount, 2, "one member row per entry named");
    assert.deepEqual(
      m2.rows.map((r) => Number(r.matched_cents)),
      [4000, 5000],
      "each entry settled at its OWN full remaining capacity, both numbers the database's",
    );
    assert.equal(rec.admitted, 2);
  } finally {
    globalThis.__claraPools = previous;
  }
});

test("G1B-BANK-E4 裁-44 FOLD-8 — a STEP RETRY after an admitted act can still re-read the pack", { skip }, async () => {
  // THE DEFECT, measured on a rig: newBankRunRecord() restarted the pack counter at 1, so a retried
  // step's FIRST pack read reused attempt 1's op key while the digest had MOVED (the first attempt
  // acted). clara._agent_bank_receipt's replay-identity check then raised CLR10
  // op_key_identity_mismatch, rec.digest stayed null, the pack-before-write guard blocked every
  // write, and the run settled failed/model_error — CLR10 is a DB verdict, so the infra-fault
  // branch never fired. One retry after one admitted act killed the rest of the night AND blamed
  // the model for it. The comment that called this "harmless for a read" was false.
  //
  // A FRESH RECORD IS EXACTLY WHAT A RETRY BUILDS, which is why this cell can drive the defect
  // without a WDK: the retry's observable difference is the record, and the fix is that the
  // record now carries the step attempt's own identity into the key.
  const w = await rig.buildFirm("g1be4");
  await buildBankPrereqs(w);
  const acct = await buildBankAccount(w, [10000]);
  const [entry] = await buildApprovedEntries(w, [10000]);

  const previous = injectBankPools();
  try {
    const { taskId, ctx, built, rec } = await armed(w, acct.bankAccountId, "step-abc#1");
    const pack1 = await built.get_bank_pack.execute({ rationale: "attempt 1 reads the pack" });
    tools.beginModelStep(rec); // FOLD-20(c): the model has now SEEN this pack
    assert.equal(pack1.error, undefined);
    const match = await built.match_bank_line.execute({ lines: acct.lineIds, entries: [entry], rationale: "attempt 1 acts" });
    assert.equal(match?.status, "live", `attempt 1's act must land, or the retry has no moved digest to collide with — got ${JSON.stringify(match)?.slice(0, 300)}`);
    assert.equal(rec.admitted, 1, "attempt 1 really acted — this is the precondition the whole cell rests on");

    // THE RETRY. Same task, same account, a FRESH record — and a different step attempt identity,
    // which is the whole fix.
    const retryRec = tools.newBankRunRecord("step-abc#2");
    const retryTools = tools.buildBankAgentTools(ctx, rig.DEFAULT_MODEL, retryRec);
    const pack2 = await retryTools.get_bank_pack.execute({ rationale: "the retried step re-reads the pack" });
    assert.equal(
      pack2.error,
      undefined,
      `the RETRY's first pack read must be ADMITTED — got ${JSON.stringify(pack2)?.slice(0, 300)}. A refusal here IS the FOLD-8 defect: the reused op key colliding with a moved digest.`,
    );
    assert.match(pack2.digest, /^[0-9a-f]{64}$/);
    assert.notEqual(pack2.digest, pack1.digest, "and the digest genuinely moved — otherwise this cell proves nothing about the collision it exists for");
    assert.equal(retryRec.pack !== null, true, "the retry can act again: rec.pack is populated, so the write gate is open");

    // THE POSITIVE CONTROL ON THE MECHANISM ITSELF: the attempt key is what distinguishes them, so
    // two records built with the SAME key are the colliding shape. Driven rather than asserted —
    // this is the pre-fix behaviour, produced on purpose.
    const collidingRec = tools.newBankRunRecord("step-abc#1");
    const collidingTools = tools.buildBankAgentTools(ctx, rig.DEFAULT_MODEL, collidingRec);
    const collided = await collidingTools.get_bank_pack.execute({ rationale: "the pre-fix shape: attempt 1's key, reused" });
    assert.ok(collided.error, `re-using attempt 1's key with a moved digest MUST refuse — got ${JSON.stringify(collided)?.slice(0, 300)}`);
    assert.equal(collidingRec.pack, null, "and leaves the record unarmed, which is how the defect went on to block every write");
    assert.equal(collidingRec.infraFaults, 0, "the refusal is a DB verdict (CLR10), which is exactly why S9's infra branch never caught this");
    assert.ok(taskId);
  } finally {
    globalThis.__claraPools = previous;
  }
});

test("G1B-BANK-E5 裁-44 FOLD-9 — a refused pick does not poison the line, and the identity belt names what a re-read cannot make new", { skip }, async () => {
  // THE DEFECT: the match op key was derived from the SORTED LINE SET alone. A refused attempt
  // writes its receipt with subject_id = the line (0121:6006); a later corrected attempt on the
  // same line writes subject_id = the new match (0121:6025). Same key, different subject ->
  // clara._agent_bank_receipt raises CLR10, so one bad pick made that line un-matchable for the
  // rest of the task — and the run still settled COMPLETED, because admitted stayed 0 and the
  // classifier took nothing_due.
  //
  // THE FIX is that the key's subject is the lines AND the entries. Under FOLD-1 the model's only
  // remaining freedom on a match is WHICH entry, so a corrected proposal IS a different entry set
  // and gets its own key. The belt in (b) covers what the key does not.
  const w = await rig.buildFirm("g1be5");
  await buildBankPrereqs(w);
  const acct = await buildBankAccount(w, [10000, 6000]);
  // 10,000 ties the line; 7,000 does not. Neither gross capacity equals the other's aggregate, so
  // same_amount_ambiguous cannot fire and mask the verdict this cell reads.
  const [right, wrong] = await buildApprovedEntries(w, [10000, 7000]);
  const [line1, line2] = acct.lineIds;

  const previous = injectBankPools();
  try {
    const { rec, built } = await armed(w, acct.bankAccountId);
    const pack1 = await built.get_bank_pack.execute({ rationale: "reading the pack" });
    tools.beginModelStep(rec); // FOLD-20(c): the model has now SEEN this pack
    assert.equal(pack1.error, undefined);

    // (1) THE WRONG ENTRY PICK. Its derived amount (7,000, the entry's own capacity) cannot tie a
    // 10,000 line. The rung is REPORTED rather than pinned: which rung speaks is the database's
    // business and this cell is about what happens NEXT.
    const wrongPick = await built.match_bank_line.execute({ lines: [line1], entries: [wrong], rationale: "the wrong candidate" });
    assert.equal(wrongPick?.status, "refused", `an under-capacity pick must be refused — got ${JSON.stringify(wrongPick)?.slice(0, 300)}`);
    console.log(`      G1B-BANK-E5 first refusal rung_vector: ${JSON.stringify(wrongPick.rung_vector)}`);

    // (2) THE IDENTICAL RE-SUBMISSION, with NO intervening pack read, is a clean REPLAY: same key,
    // same digest, same subject, so the receipt's identity check passes and no second receipt row
    // is written.
    const before = await rig.rootQuery(
      "select count(*)::int as n from clara.bank_agent_receipts where client_id=$1 and act_kind='match'",
      [w.client],
    );
    const replay = await built.match_bank_line.execute({ lines: [line1], entries: [wrong], rationale: "the wrong candidate" });
    assert.equal(replay?.status, "refused", "the replay returns the same verdict");
    const after = await rig.rootQuery(
      "select count(*)::int as n from clara.bank_agent_receipts where client_id=$1 and act_kind='match'",
      [w.client],
    );
    assert.equal(after.rows[0].n, before.rows[0].n, "and writes NO second receipt — one op key, one act");

    // (3) THE SAME RE-SUBMISSION AFTER A PACK RE-READ is the other order, and it is the likelier
    // one in production because the prompt encourages the re-read. rec.digest moves with the pack,
    // and every write sends it as p_inputs_digest — so the receipt's identity check now sees a
    // DIFFERENT digest under the same key and raises CLR10. A PRE-EXISTING _agent_bank_receipt
    // property, not something this PR introduces; what this PR adds is that the model is told
    // something it can act on instead of the oracle-safe sentence.
    const proposal = await built.propose_line_exception.execute({
      line_id: line2,
      kind: "disputed",
      reason: "nothing on this statement identifies the payer",
      rationale: "an open proposal is what moves the pack digest without touching the line under test",
    });
    assert.equal(proposal?.status, "open", `the digest-moving act must be admitted — got ${JSON.stringify(proposal)?.slice(0, 300)}`);
    const pack2 = await built.get_bank_pack.execute({ rationale: "re-reading after acting" });
    tools.beginModelStep(rec); // FOLD-20(c): the model has now SEEN this pack
    assert.equal(pack2.error, undefined);
    assert.notEqual(pack2.digest, pack1.digest, "the digest genuinely moved, or the belt below has nothing to catch");

    const afterReread = await built.match_bank_line.execute({ lines: [line1], entries: [wrong], rationale: "the wrong candidate" });
    assert.match(
      String(afterReread.error),
      /already attempted in this run/,
      `the identity mismatch must reach the model as something it can ACT on — got ${JSON.stringify(afterReread)?.slice(0, 300)}`,
    );
    assert.match(String(afterReread.error), /re-reading the pack does not make it new/, "and it must say why retrying is not the answer");

    // (4) THE CORRECTION, which is the whole point: a DIFFERENT entry set is a different operation
    // and goes straight through. Pre-fix this was the CLR10 that poisoned the line.
    const corrected = await built.match_bank_line.execute({ lines: [line1], entries: [right], rationale: "the candidate that ties" });
    assert.equal(corrected?.status, "live", `the corrected pick must be ADMITTED — got ${JSON.stringify(corrected)?.slice(0, 300)}`);
    assert.ok(corrected.match_id);
    assert.equal(rec.admitted, 2, "the exception proposal and the corrected match");
  } finally {
    globalThis.__claraPools = previous;
  }
});

test("G1B-BANK-E6 裁-44 FOLD-4 — a line from ANOTHER account of the same client is refused, with no proposal and no match", { skip }, async () => {
  // 0129's digest freshness is bound to the task and the CLIENT, never to the bank ACCOUNT
  // (:1048), and the exception wrapper checks only the line's client against the credential
  // (0121:5578-5581). Two accounts under one client therefore share everything the database
  // checks: read account A's pack, then act on a line of account B, and the write is admitted.
  const w = await rig.buildFirm("g1be6");
  await buildBankPrereqs(w);
  const a = await buildBankAccount(w, [10000], "a");
  const b = await buildBankAccount(w, [10000], "b", "1061");
  const [entry] = await buildApprovedEntries(w, [10000]);
  assert.notEqual(a.bankAccountId, b.bankAccountId, "two real accounts, one client");

  const previous = injectBankPools();
  try {
    const { rec, built } = await armed(w, a.bankAccountId);
    const packA = await built.get_bank_pack.execute({ rationale: "reading account A's pack" });
    tools.beginModelStep(rec); // FOLD-20(c): the model has now SEEN this pack
    assert.equal(packA.error, undefined);
    // THE POSITIVE CONTROL FIRST: the pack this run read really is account A's and really does
    // exclude B's line. Without it, "B's line was refused" could just mean the pack was empty.
    assert.ok(packA.lines?.some((l) => l.line_id === a.lineIds[0]), "account A's own line IS in the pack");
    assert.ok(!packA.lines?.some((l) => l.line_id === b.lineIds[0]), "and account B's is NOT — the pack is account-scoped (0121:5725)");

    // THE EXCEPTION PROPOSAL IS ASSERTED FIRST, and the order is evidence rather than taste: it is
    // the path the write gate is the ONLY guard on. A cross-account MATCH is additionally stopped
    // by the allocation itself — deriveMatchAllocation reads its amounts out of the pack, so a line
    // the pack does not carry has no amount to derive — which is defence in depth, not the wall
    // under test. Measured by mutation: with the gate removed the exception is admitted, while the
    // match falls through to the allocation's own refusal.
    const crossedException = await built.propose_line_exception.execute({
      line_id: b.lineIds[0],
      kind: "disputed",
      reason: "a line this run never read",
      rationale: "a line this run never read",
    });
    assert.match(String(crossedException.error), /not one of the unmatched lines in the pack this run read/, `the exception proposal must refuse — got ${JSON.stringify(crossedException)?.slice(0, 300)}`);

    const crossedMatch = await built.match_bank_line.execute({
      lines: [b.lineIds[0]],
      entries: [entry],
      rationale: "a line this run never read",
    });
    assert.match(String(crossedMatch.error), /not one of the unmatched lines in the pack this run read/, `and so must the match — got ${JSON.stringify(crossedMatch)?.slice(0, 300)}`);

    assert.equal(await memberCount(w.client), 0, "no match member exists");
    const proposals = await rig.rootQuery("select count(*)::int as n from clara.bank_agent_proposals where client_id=$1", [w.client]);
    assert.equal(proposals.rows[0].n, 0, "and no proposal was written");
    assert.equal(rec.admitted, 0);
    assert.equal(rec.refusals, 2);

    // THE POSITIVE CONTROL ON THE GUARD ITSELF: account A's own line, same run, same record, goes
    // through — so the two refusals above are the binding speaking, not a tool that refuses
    // everything.
    const own = await built.match_bank_line.execute({ lines: [a.lineIds[0]], entries: [entry], rationale: "account A's own line" });
    assert.equal(own?.status, "live", `account A's own line must still match — got ${JSON.stringify(own)?.slice(0, 300)}`);
  } finally {
    globalThis.__claraPools = previous;
  }
});
