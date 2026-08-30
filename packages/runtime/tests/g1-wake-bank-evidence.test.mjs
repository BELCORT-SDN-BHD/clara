// 裁-44 R2/R3 — THE EVIDENCE CELLS for bankAgent_v1: the three end-to-end proofs about the pack
// a run derives its numbers from. Split from g1-wake-bank-fold.test.mjs for the 500-line module
// budget; they share its fixtures and its `armed` shape.
//
// What they have in common: FOLD-1 took the AMOUNTS out of the model's hands, and each of these
// closes a way the EVIDENCE behind those amounts could still be wrong or model-chosen — a cents
// value this process rounds, an identifier short enough to match anything, and a re-read that
// fails while the previous pack stays armed.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as rig from "./rig.mjs";
import { skip, plantHeldWakeTask } from "./g1-wake-bodies.fixtures.mjs";
import { BANK_COA, buildApprovedEntries, buildBankAccount, buildBankPrereqs, injectBankPools } from "./g1-wake-bank-fixtures.mjs";

const { register } = await import("tsx/esm/api");
register();

const tools = await import("../workflows/bankAgent.v1.tools.ts");

/** A running wake task plus the tool set bound to it — the same shape g1-wake-bank-fold.test.mjs
 *  uses. Duplicated rather than shared: a two-line helper in a third module costs more to follow
 *  than it saves. */
async function armed(w, bankAccountId, attemptKey = "attempt-1") {
  // THE PRODUCER CONTRACT, in the fixture. #437 recorded it as a RED: "the event payload must
  // carry bank_account_id (the pack is per-account and the bank role cannot enumerate accounts)".
  // G1 PR-2a makes the database read it — every bank act's own account is derived from its subject
  // and required to equal the one this run's producing event named — so a `{}` payload now yields
  // wake_task_account_unbound on the first tool call, which is the contract refusing, not a defect.
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

test("G1B-BANK-E7 裁-44 R2 / FOLD-10 — an unrepresentable cents value takes the whole pack read down, and no match row is written", { skip }, async () => {
  // CODEX'S OWN VALUES, planted in the REAL books: a candidate carrying 9007199254740993 cents of
  // debit capacity, a second carrying 5, and a line of 9007199254740997. PostgreSQL holds all
  // three exactly. JavaScript does not — the first becomes 9007199254740992 the instant
  // JSON.parse touches the pack — and in the ROUNDED arithmetic 9007199254740992 + 5 ties
  // 9007199254740997 exactly, as it does in PostgreSQL's. But they are different sums: the
  // evaluator would claim a multi-entry FULL settlement while leaving the first entry one cent
  // open, and every DB rung would pass.
  //
  // The fix is a hard gate rather than better arithmetic, so what this cell proves is that the
  // PACK READ fails — the run never arms, so there is nothing to derive an allocation from.
  const w = await rig.buildFirm("g1be7");
  await buildBankPrereqs(w);
  // DECIMAL STRINGS, not JS numbers: `9007199254740993` written as a literal is already
  // 9007199254740992 before the fixture can send it, so the values are planted as text and
  // PostgreSQL parses them exactly. That is itself the finding in miniature.
  const acct = await buildBankAccount(w, ["9007199254740997"]);
  const [big, small] = await buildApprovedEntries(w, ["9007199254740993", "5"], "a",
    "g1 bank e7: a deliberately unrepresentable capacity, attested through the estate's own high-stakes door");

  const previous = injectBankPools();
  try {
    const { rec, built } = await armed(w, acct.bankAccountId);
    const pack = await built.get_bank_pack.execute({ rationale: "reading a pack whose numbers this process cannot carry" });
    tools.beginModelStep(rec); // FOLD-20(c): the model has now SEEN this pack
    assert.ok(pack.error, `the pack read must FAIL — got ${JSON.stringify(pack)?.slice(0, 300)}`);
    assert.match(String(pack.error), /could not be read/, "and say so as OUR fault, not as an empty pack");
    assert.equal(rec.pack, null, "the record is NOT armed — there is no view to derive an amount from");
    assert.equal(rec.digest, null);
    assert.equal(rec.infraFaults, 1, "and it is counted as OURS, which is what carries the run to failed/internal rather than nothing_due");

    // THE CONSEQUENCE, which is the assertion the ruling actually asks for: the match the model
    // would have made is refused and ZERO match rows exist.
    const attempt = await built.match_bank_line.execute({
      lines: acct.lineIds,
      entries: [big, small],
      rationale: "the rounded tie that must never be written",
    });
    assert.match(String(attempt.error), /get_bank_pack first/, `the write must refuse — got ${JSON.stringify(attempt)?.slice(0, 300)}`);
    assert.equal(await memberCount(w.client), 0, "AND NOTHING WAS WRITTEN");

    // THE POSITIVE CONTROL ON THE FIXTURE: the database really did store those exact values, so
    // the refusal above is this process's limit rather than a fixture that never planted them.
    const stored = await rig.rootQuery(
      "select sum(l.debit_cents)::text as cents from clara.journal_lines l where l.entry_id = $1 and l.account_code = $2",
      [big, BANK_COA],
    );
    assert.equal(stored.rows[0].cents, "9007199254740993", "PostgreSQL holds the value exactly — it is JS that cannot");
  } finally {
    globalThis.__claraPools = previous;
  }
});

test("G1B-BANK-E8 裁-44 R2 / FOLD-11 — the model cannot supply times_seen, and what is persisted is the count from THIS pack", { skip }, async () => {
  // The model used to supply the positive integer and 0121:5634 stored it verbatim in the payload
  // a human reads to decide. Nothing could reproduce it: the pack's `learned_payers` is explicitly
  // {"not_implemented": true} (0121:5781). Hard constraint 2, the same shape as FOLD-1.
  const w = await rig.buildFirm("g1be8");
  await buildBankPrereqs(w);
  // THREE lines, TWO of which print the identifier — so a correct count is 2, and neither the
  // line count (3) nor a floor of 1 would produce it by accident.
  // 裁-44 R3 / FOLD-15 — the identifier is a real 10-digit account number, printed WITH separators
  // on one line and in a different case on another, so the cell exercises canonicalisation rather
  // than a naive substring. The third line prints an UNRELATED number that CONTAINS the first six
  // digits of it — under the old raw-substring match that would have been a false sighting; under
  // token-boundary matching it is not one.
  const acct = await buildBankAccount(w, [1000, 2000, 3000], "a", BANK_COA, [
    "TRANSFER FROM 8899-041722 ACME",
    "STANDING ORDER 8899041722 MONTHLY",
    "CHEQUE 889904172299 UNRELATED",
  ]);
  await buildApprovedEntries(w, [1000]);
  const counterparty = (await rig.humanQuery(w.owner,
    "select clara.create_counterparty(p_client=>$1,p_kind=>$2,p_name=>$3,p_registration_no=>$4,p_tin=>$5,p_op_key=>$6) as r",
    [w.client, "vendor", "G1 E8 counterparty", null, null, rig.opk("g1be8-cp")],
  )).rows[0].r;
  const cpId = counterparty.counterparty_id ?? counterparty.id;

  const previous = injectBankPools();
  try {
    const { rec, built } = await armed(w, acct.bankAccountId);

    // (1) THE SCHEMA HAS NO FIELD FOR IT. Driven through the SHIPPING schema, not a copy.
    const withCount = built.propose_identifier_promotion.inputSchema.safeParse({
      counterparty_id: cpId, identifier_kind: "bank_account", identifier_value: "8899-041722", times_seen: 99, rationale: "r",
    });
    assert.equal(withCount.success, false, "a model-supplied count must no longer parse at all");

    const pack = await built.get_bank_pack.execute({ rationale: "reading the pack the count will come from" });

    tools.beginModelStep(rec); // FOLD-20(c): the model has now SEEN this pack
    assert.equal(pack.error, undefined, `the pack read must succeed — got ${JSON.stringify(pack)?.slice(0, 300)}`);

    // (2) ZERO SIGHTINGS IS A REFUSAL, NOT A ONE. A floor would have let the model promote an
    // identifier appearing nowhere on the statement, with the tool vouching for one sighting.
    // WELL-FORMED BUT ABSENT — ten digits, so it clears FOLD-15's floor and the ONLY thing that
    // can refuse it is "this run never saw it". An ill-formed value would be refused one gate
    // earlier and prove the wrong rule.
    const unseen = await built.propose_identifier_promotion.execute({
      counterparty_id: cpId, identifier_kind: "bank_account", identifier_value: "7000123456",
      rationale: "an identifier this run never saw",
    });
    assert.match(String(unseen.error), /identifier_not_in_pack/, `an unseen identifier must be REFUSED — got ${JSON.stringify(unseen)?.slice(0, 300)}`);
    const none = await rig.rootQuery("select count(*)::int as n from clara.bank_agent_proposals where client_id=$1", [w.client]);
    assert.equal(none.rows[0].n, 0, "and nothing was written");

    // (3) THE PERSISTED COUNT IS THE PACK'S. Read back off the durable payload a human settles.
    const ok = await built.propose_identifier_promotion.execute({
      counterparty_id: cpId, identifier_kind: "bank_account", identifier_value: "8899-041722",
      rationale: "this printed account number recurs against this supplier",
    });
    assert.equal(ok?.status, "open", `the promotion must be ADMITTED — got ${JSON.stringify(ok)?.slice(0, 300)}`);
    const row = await rig.rootQuery(
      "select payload->>'times_seen' as seen, rationale from clara.bank_agent_proposals where id = $1",
      [ok.proposal_id],
    );
    assert.equal(row.rows[0].seen, "2", "TWO of the three lines print it — the count is the database's own text, not the model's claim");
    assert.match(row.rows[0].rationale, /sightings in this pack: 2/, "and the human settling it reads WHERE the number came from");
    assert.equal(rec.admitted, 1);

    // (4) 裁-44 R3 / FOLD-15 — THE SHORT-IDENTIFIER ORACLE, closed. FOLD-11 took the NUMBER out of
    // the model's hands; a one-character identifier put it straight back, because the model could
    // still choose a needle that matches every line. This is the `G1B-BANK-E8-short` case.
    const proposalsBefore = (await rig.rootQuery("select count(*)::int as n from clara.bank_agent_proposals where client_id=$1", [w.client])).rows[0].n;
    for (const value of ["1", "88", "8899", "8899041"]) {
      const short = await built.propose_identifier_promotion.execute({
        counterparty_id: cpId, identifier_kind: "bank_account", identifier_value: value,
        rationale: "a needle short enough to match anything",
      });
      assert.match(String(short.error), /identifier_too_short/, `"${value}" must be refused — got ${JSON.stringify(short)?.slice(0, 200)}`);
    }
    // Prose clears a bare character count but carries no digits, which is why the bank_account
    // floor is digit-aware rather than length-only — this is the value G1B-BANK-E2 used to admit.
    const prose = await built.propose_identifier_promotion.execute({
      counterparty_id: cpId, identifier_kind: "bank_account", identifier_value: "g1 bank line",
      rationale: "prose is not an account number",
    });
    assert.match(String(prose.error), /identifier_too_short/, `prose must be refused for kind bank_account — got ${JSON.stringify(prose)?.slice(0, 200)}`);
    const proposalsAfter = (await rig.rootQuery("select count(*)::int as n from clara.bank_agent_proposals where client_id=$1", [w.client])).rows[0].n;
    assert.equal(proposalsAfter, proposalsBefore, "and NOTHING was written by any of them");

    // (5) THE TOKEN BOUNDARY, end to end. Line 3 prints "889904172299", which CONTAINS the
    // identifier's ten digits — a raw substring match would have counted it and made times_seen 3.
    // It is not a whole token, so the count stayed 2 above. Asserted here as the reason.
    assert.equal(
      (await rig.rootQuery("select payload->>'times_seen' as seen from clara.bank_agent_proposals where id=$1", [ok.proposal_id])).rows[0].seen,
      "2",
      "a longer digit run that CONTAINS the identifier is not a sighting of it",
    );
  } finally {
    globalThis.__claraPools = previous;
  }
});

test("G1B-BANK-E9 裁-44 R3 / FOLD-16 — a malformed RE-READ disarms the run; the write is blocked and the task settles failed/internal", { skip }, async () => {
  // THE LIFECYCLE HOLE. FOLD-12 made a malformed pack an infrastructure failure — but only on the
  // FIRST read. A re-read that came back malformed left the PREVIOUS pack armed, so the run went
  // on deriving amounts from evidence it had just failed to refresh: stale evidence presented as
  // current, which is worse than none. And if a later write was then admitted, the classifier's
  // `admitted > 0` branch outranked the fault and the task settled COMPLETED with a corrupt read
  // on its record.
  //
  // THE INSTRUMENT is the pool stub: the first pack read goes to the REAL verb, the second is
  // answered with a reply the parser must refuse. Everything else in the run is real.
  const w = await rig.buildFirm("g1be9");
  await buildBankPrereqs(w);
  const acct = await buildBankAccount(w, [10000]);
  const [entry] = await buildApprovedEntries(w, [10000]);

  const previous = injectBankPools();
  const real = globalThis.__claraPools.withBankWakeScoped;
  let packReads = 0;
  globalThis.__claraPools = {
    ...globalThis.__claraPools,
    withBankWakeScoped: async (secret, fn) => {
      const out = await real(secret, fn);
      // Only the pack read returns a digest; count those and corrupt the SECOND one.
      if (out && typeof out === "object" && typeof out.digest === "string") {
        packReads += 1;
        if (packReads === 2) return { ...out, digest: "x" }; // no longer the sha-256 the verb computes
      }
      return out;
    },
  };
  try {
    const { rec, built } = await armed(w, acct.bankAccountId);

    const first = await built.get_bank_pack.execute({ rationale: "the good read" });

    tools.beginModelStep(rec); // FOLD-20(c): the model has now SEEN this pack
    assert.equal(first.error, undefined, `the first read must succeed — got ${JSON.stringify(first)?.slice(0, 300)}`);
    assert.ok(rec.pack, "and it arms the run");
    const armedDigest = rec.digest;

    const second = await built.get_bank_pack.execute({ rationale: "the re-read that comes back corrupt" });

    tools.beginModelStep(rec); // FOLD-20(c): the model has now SEEN this pack
    assert.ok(second.error, `the malformed re-read must FAIL — got ${JSON.stringify(second)?.slice(0, 300)}`);
    assert.equal(rec.pack, null, "AND IT DISARMS THE RUN — the previous pack must not survive a failed refresh");
    assert.equal(rec.digest, null, "including its digest, which every write re-presents as p_inputs_digest");
    assert.notEqual(armedDigest, null, "the run really was armed before, or this proves nothing");
    assert.equal(rec.infraFaults, 1, "and the fault is OURS");

    // THE WRITE IS BLOCKED, and by the pack guard rather than by anything the DB said.
    const blocked = await built.match_bank_line.execute({ lines: acct.lineIds, entries: [entry], rationale: "a write on stale evidence" });
    assert.match(String(blocked.error), /get_bank_pack first/, `the write must be refused — got ${JSON.stringify(blocked)?.slice(0, 300)}`);
    assert.equal(await memberCount(w.client), 0, "and nothing was written");

    // THE SETTLE. Even with an admitted act on the record, an infra fault means the run's own
    // grounding failed — on THIS lane the pack IS the evidence — so it is a failure, not a green
    // night. Driven through the shipping classifier with the run's real record.
    const bank = await import("../workflows/bankAgent.v1.impl.ts");
    const outcome = bank.classifyBankOutcome({ ...rec, admitted: 1 }, "");
    assert.equal(outcome.kind, "refused", "an infra fault anywhere outranks a later admitted act");
    assert.equal(outcome.code, "internal", "and it is OUR code, not the model's");
  } finally {
    globalThis.__claraPools = previous;
  }
});


test("G1B-E9-parallel 裁-44 R4 / FOLD-20 — sibling tool calls cannot authorise a write from a pack the model never saw", { skip }, async () => {
  // THE SCHEDULE THE REVIEW FOUND, driven rather than argued. The OpenAI provider defaults
  // parallelToolCalls to TRUE, so siblings in ONE step run concurrently against this run's single
  // mutable record:
  //   1. a WRITE reads the armed pack, then awaits its task-status round trip;
  //   2. sibling read A clears and re-arms with a NEW pack;
  //   3. sibling read B parses malformed and counts a fault WITHOUT clearing A's pack;
  //   4. the write resumes and derives from A's pack — which the model never received, because it
  //      was returned to the provider AFTER the model had already chosen this write's arguments.
  // The settle is failed/internal either way, but that does not undo a committed bank write.
  const w = await rig.buildFirm("g1bpar");
  await buildBankPrereqs(w);
  const acct = await buildBankAccount(w, [10000]);
  const [entry] = await buildApprovedEntries(w, [10000]);

  const previous = injectBankPools();
  const real = globalThis.__claraPools.withBankWakeScoped;
  let packReads = 0;
  globalThis.__claraPools = {
    ...globalThis.__claraPools,
    withBankWakeScoped: async (secret, fn) => {
      const out = await real(secret, fn);
      if (out && typeof out === "object" && typeof out.digest === "string") {
        packReads += 1;
        if (packReads === 2) return { ...out, digest: "x" }; // the FIRST sibling comes back malformed
      }
      return out;
    },
  };
  try {
    const { rec, built } = await armed(w, acct.bankAccountId);

    // Step 0 — a good read the model DOES see, so the run is armed and the hostile write below is
    // not blocked by the pack guard. The cell must fail for the epoch reason, not that one.
    const first = await built.get_bank_pack.execute({ rationale: "the read the model actually sees" });
    assert.equal(first.error, undefined);
    tools.beginModelStep(rec);
    assert.ok(rec.pack, "armed, from a strictly earlier step");

    // THE HOSTILE STEP: two reads and a write issued together, exactly as siblings would be. The
    // WRITE IS LAST so it is the one that resumes after the siblings have moved the record — which
    // is the schedule the review described. (Issued first it would legitimately use the step-0
    // pack the model DID see, and prove nothing; that ordering was the cell's own first draft.)
    const [readA, readB, write] = await Promise.all([
      built.get_bank_pack.execute({ rationale: "sibling read A, malformed" }),
      built.get_bank_pack.execute({ rationale: "sibling read B, good" }),
      built.match_bank_line.execute({ lines: acct.lineIds, entries: [entry], rationale: "the delayed write" }),
    ]);

    // THE WRITE IS REFUSED, and by the EPOCH specifically. The record is ARMED when the write runs
    // — sibling B's pack is sitting right there — so the pack-before-write guard would have let it
    // straight through. What stops it is that B's pack belongs to THIS step: the model chose this
    // write's arguments before that pack existed, so it is not evidence the model ever saw.
    assert.ok(rec.pack, "the record IS armed when the write runs — otherwise the epoch is not what refused it");
    assert.equal(rec.pack.epoch, rec.step, "and the armed pack belongs to the CURRENT step");
    assert.ok(write.error, `the sibling write must be refused — got ${JSON.stringify(write)?.slice(0, 300)}`);
    assert.match(String(write.error), /pack_same_step/, "by name, and not by the pack-before-write guard");
    assert.equal(await memberCount(w.client), 0, "AND NO BANK WRITE WAS COMMITTED — the assertion the whole ruling is about");

    assert.ok(readA.error, "sibling A came back malformed, as staged");
    assert.equal(readB.error, undefined, "and sibling B succeeded");
    assert.ok(rec.infraFaults >= 1, "the malformed sibling counted a grounding fault");

    const bank = await import("../workflows/bankAgent.v1.impl.ts");
    const outcome = bank.classifyBankOutcome(rec, "");
    assert.equal(outcome.kind, "refused", "and the settle is a failure, not a quiet night");
    assert.equal(outcome.code, "internal");

    // THE POSITIVE CONTROL — the same write in the FOLLOWING step, on a pack the model has now
    // seen, proceeds. Without it this cell would pass against a tool that refused every write.
    const good = await built.get_bank_pack.execute({ rationale: "a clean read the model sees" });
    assert.equal(good.error, undefined, `the recovery read must succeed — got ${JSON.stringify(good)?.slice(0, 200)}`);
    tools.beginModelStep(rec);
    const admitted = await built.match_bank_line.execute({ lines: acct.lineIds, entries: [entry], rationale: "the write, one step later" });
    assert.equal(admitted?.status, "live", `the following step's write must be ADMITTED — got ${JSON.stringify(admitted)?.slice(0, 300)}`);
  } finally {
    globalThis.__claraPools = previous;
  }
});
