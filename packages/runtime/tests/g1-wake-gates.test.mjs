// Gate G1's TWO WAKE BODIES — the MECHANICAL GATES half.
//
// These cells check agreements between this code and the database that NO other instrument can
// see: the jsonb reply shapes the verbs actually return, every call's arity AND argument names
// against the live catalog, which side is at fault when a call fails, and that neither body can
// fabricate a receipt. Typecheck cannot look inside a SQL string; freeze-lint hashes bytes; a
// behavioural cell only reaches the two verbs a rig can afford to set up.
//
// EVERY CELL DRIVES ITS SUBJECT AND CARRIES ITS OWN CONTROL. Four of the defects on this PR were
// shape disagreements invisible to all four gates that existed at the time, which is why several
// of these cells pin against the LIVE prosrc rather than against a comment.
//
// The DB-containment half is g1-wake-walls.test.mjs; the lifecycle half is
// g1-wake-bodies.test.mjs; shared fixtures are g1-wake-bodies.fixtures.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as rig from "./rig.mjs";
import { skip, skip0138 } from "./g1-wake-bodies.fixtures.mjs";

const { register } = await import("tsx/esm/api");
register();

// =====================================================================================
// I · THE REPLY CLASSIFIERS, pinned against the SHAPES THE MIGRATIONS ACTUALLY RETURN.
//     Both were WRONG in an earlier draft and neither test nor typecheck could see it —
//     they are pure shape agreements with a jsonb blob, so the pin is the only instrument.
// =====================================================================================

test("G1B-I1 the close classifier reads status='acted' — the shape 0138's own cores return", { skip: skip0138 }, async () => {
  const reads = await import("../workflows/closePrep.v1.reads.ts");
  const mk = () => reads.newCloseRunRecord();

  // THE SHAPES, read out of the migration source rather than invented, so this cell fails if the
  // DB's own vocabulary ever moves: _agent_begin_close_core returns {status:'acted',receipt_id,
  // result} on success and {status:'refused',receipt_id,rung_vector} on refusal.
  const src = await rig.rootQuery(
    "select prosrc from pg_proc where oid = 'clara._agent_begin_close_core(jsonb,uuid,text,jsonb,text)'::regprocedure",
  );
  const body = String(src.rows[0].prosrc);
  assert.match(body, /'status',\s*'acted'/, "the LIVE body must still return status='acted' on the acted path");
  assert.match(body, /'status',\s*'refused'/, "and status='refused' on the refused path");
  assert.doesNotMatch(body, /'outcome',\s*'admitted'/, "the bank lane's 'admitted' vocabulary must NOT appear here");

  let rec = mk();
  reads.countIfAdmitted(rec, { status: "acted", receipt_id: randomUUID(), result: { close_run_id: randomUUID() } });
  assert.equal(rec.acts, 1, "an acted reply counts");
  rec = mk();
  reads.countIfAdmitted(rec, { status: "refused", rung_vector: [{ rung: "B3" }] });
  reads.countIfAdmitted(rec, { error: "refused (CLR03): …" });
  reads.countIfAdmitted(rec, null);
  reads.countIfAdmitted(rec, { outcome: "admitted" }); // the WRONG vocabulary must count nothing
  assert.equal(rec.acts, 0, "nothing else counts — and the bank lane's own key counts nothing here");
});

test("G1B-I2 the bank classifier counts a VERB'S OWN admitted shape — positively, never by absence", { skip }, async () => {
  const tools = await import("../workflows/bankAgent.v1.tools.ts");

  // AN EARLIER VERSION OF THIS CELL TESTED NOTHING IT WAS NAMED FOR (independent review, S7): it
  // built the tool set, asserted it was truthy, and then only grepped the prosrc. Deleting the
  // classifier's body entirely left it green. The fix is the shape I1 already had — DRIVE the
  // function, both directions — and the prosrc pin stays as the second leg, not the only one.
  //
  // 裁-44 / FOLD-5 REPLACED THE SUBJECT ITSELF. countIfAdmitted used to count any object that had
  // no `error` key and whose status was not 'refused' — absence as evidence, which review law 2
  // forbids. It is now verb-specific and POSITIVE, so this cell is rebuilt around what each verb
  // actually returns. It also drops a claim the old cell made that was simply FALSE: it asserted
  // "a pack read with no status at all counts", but production get_bank_pack never passes its
  // reply through this function at all — the pack tool records the digest and returns. Counting a
  // pack read as an act was never a live behaviour, so the cell was pinning a fiction.
  const count = (verb, reply) => {
    const rec = tools.newBankRunRecord("cell");
    tools.countIfAdmitted(rec, verb, reply);
    return rec;
  };
  // The success payloads the cores actually return: match → {match_id, status:'live'}
  // (0121:1622, and this delegate only inserts 'live' groups, :5840); exception →
  // {proposal_id, status:'open', line_id} (0121:5566); promotion → {proposal_id, status:'open',
  // counterparty_id} (0121:5643).
  assert.equal(count("match", { match_id: randomUUID(), status: "live" }).admitted, 1, "a match result counts");
  assert.equal(count("exception", { proposal_id: randomUUID(), status: "open", line_id: randomUUID() }).admitted, 1, "an exception proposal counts");
  assert.equal(count("promotion", { proposal_id: randomUUID(), status: "open", counterparty_id: randomUUID() }).admitted, 1, "a promotion proposal counts");

  // THE CROSS-VERB NEGATIVES, which are exactly what "verb-specific" means and what the old
  // absence-based test could not express: a proposal's shape is NOT a match's admission.
  assert.equal(count("match", { proposal_id: randomUUID(), status: "open" }).admitted, 0, "a proposal shape is not a match admission");
  assert.equal(count("exception", { match_id: randomUUID(), status: "live" }).admitted, 0, "and a match shape is not a proposal admission");
  assert.equal(count("match", { status: "live" }).admitted, 0, "a 'live' status with no match_id names no act");
  assert.equal(count("exception", { proposal_id: randomUUID() }).admitted, 0, "and a proposal id with no 'open' status names no open proposal");

  // THE FOURTH REPLY SHAPE THE OLD 'CLOSED WORLD OF THREE' MISSED, and it is a real one:
  // clara._reserve_op returns {"pending": true} when a reservation exists whose first attempt
  // never finished (0004:59). It has no error key and no 'refused' status, so the old classifier
  // counted it as an admitted act — a reservation nobody completed, recorded as work done.
  assert.equal(count("match", { pending: true }).admitted, 0, "a reserved-but-unfinished op is not an act");
  assert.equal(count("match", {}).admitted, 0, "an empty object counts zero");
  assert.equal(count("match", { status: "refused", rung_vector: [{ rung: "M2" }] }).admitted, 0, "a DB refusal counts nothing");
  assert.equal(count("match", { error: "refused (CLR03): …" }).admitted, 0, "a caught throw counts nothing");
  assert.equal(count("match", null).admitted, 0, "and neither does nothing");

  // 裁-44 / FOLD-3's own half of this function: everything that is NOT an admission is a REFUSAL,
  // and the count is what makes a night of them settle failed rather than green.
  assert.equal(count("match", { status: "refused" }).refusals, 1, "a refusal is counted as one");
  assert.equal(count("match", { match_id: randomUUID(), status: "live" }).refusals, 0, "and an admission is not");

  // THE SECOND LEG: pin that the live cores still have no uniform admitted key, so a future recut
  // that ADDS one makes this cell fail rather than silently leaving the classifier weaker than it
  // could be. Scoped honestly — this reads ONE core, and the other three RAISE rather than
  // returning a refusal, so the closed world is generalised from this one plus that fact.
  const src = await rig.rootQuery(
    "select prosrc from pg_proc where oid = 'clara._agent_match_bank_line_core(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,text,text)'::regprocedure",
  );
  const body = String(src.rows[0].prosrc);
  assert.match(body, /'status'\s*,\s*'refused'/, "a refusal still says status='refused'");
  assert.match(body, /return v_res;/, "and a success still returns the delegate's own result verbatim");
  assert.doesNotMatch(body, /'outcome'\s*,\s*'admitted'/, "still no uniform admitted key in the reply");
});

test("G1B-I8 N11 — a run whose reads worked but whose ACTS were all blocked by our fault FAILS, it does not report a green night", { skip: skip0138 }, async () => {
  // N11 (independent review). S9 fixed the TOTAL failure's attribution; this is the PARTIAL one,
  // and it is the shape with NO DURABLE TRACE AT ALL: reads succeed, every write is blocked by our
  // own fault, `reads > 0` takes the nothing_due branch and the task settles COMPLETED. For
  // assertTailBinding's throw the failure lands BEFORE the DB call, so not even a refused receipt
  // exists. One drifted propose_close site = every close run reads fine, proposes nothing, reports
  // green, forever. Same silent-green class as M4, one layer up, and worse — M4 at least left
  // twelve refused receipts behind.
  //
  // THE RULING: a false failure costs one wasted retry (the next wake picks the client up again);
  // a false SUCCESS costs a close that silently never gets prepared. For an unattended nightly
  // lane that asymmetry is not close, so an infra fault in a zero-act run is a failure.
  const close = await import("../workflows/closePrep.v1.impl.ts");
  const bank = await import("../workflows/bankAgent.v1.impl.ts");

  // 裁-44 added three fields to both records (writeAttempts / refusals / cancelledAs). Defaulting
  // them HERE keeps every N11/S9 case below saying exactly what it used to say — a zero-write run
  // — rather than silently drifting into FOLD-3's branch and proving something else.
  const mkClose = (o) => ({ acts: 0, reads: 0, infraFaults: 0, writeAttempts: 0, refusals: 0, cancelledAs: null, ...o });
  const mkBank = (o) => ({ admitted: 0, digest: null, infraFaults: 0, writeAttempts: 0, refusals: 0, cancelledAs: null, ...o });

  // THE DEFECT'S OWN SHAPE — this is the assertion that reds without the fix.
  const blocked = close.classifyCloseOutcome(mkClose({ acts: 0, reads: 6, infraFaults: 1 }), "I read everything and proposed nothing.");
  assert.equal(blocked.kind, "refused", "reads worked, every act was ours to lose — that is a FAILURE, not a quiet night");
  assert.equal(blocked.code, "internal", "and it is OUR code, not the model's");

  // THE CASE THAT MUST NOT FIRE, which is what stops this being a blunt instrument: a genuine
  // nothing_due — the model read, found nothing to do, and nothing broke — still settles green.
  const genuine = close.classifyCloseOutcome(mkClose({ acts: 0, reads: 6, infraFaults: 0 }), "Nothing is due for this client.");
  assert.equal(genuine.kind, "nothing_due", "a real quiet night is still a success — 'finding nothing to do is a correct outcome'");

  // A run that ACTED is unaffected even with a fault somewhere in it: infraFaults is consulted
  // only in the zero-act branches, so it can never turn a successful run into a failed one.
  assert.equal(close.classifyCloseOutcome(mkClose({ acts: 2, reads: 6, infraFaults: 3 }), "").kind, "proposed");

  // N12 — BUT THE FAULT IS NOT DISCARDED. A partial success stays a success (the acts landed with
  // durable receipts, and failing would throw real work away), yet this is precisely the run
  // nobody looks at, so the fault must still say so. It goes out through onUsageProblem, whose
  // stated purpose is that a lane which hit trouble does not look healthy. Driven, not asserted.
  // (裁-44 / FIND-4: this note used to appear TWICE, an editing artifact with no behavioural
  // consequence; the duplicate is folded away here.)
  //
  // THE SIGNAL IS A PURE FUNCTION AND THE EMISSION IS IN THE STEP, and that split was forced by
  // the BUILD, not chosen for tidiness: calling the usage module from the classifier pulled
  // `node:crypto` (via closeOpKey) into WORKFLOW scope and the WDK bundler refused the build
  // outright — "Move this function into a step function". Steps may use Node modules; workflow-
  // scope code may not. So the testable half is infraFaultNote and the emission sits in the step.
  assert.match(
    String(close.infraFaultNote({ acts: 2, infraFaults: 3 })),
    /3 tool call\(s\) never reached the database/,
    "a partial success reports its fault, and says how many and whose it was",
  );
  assert.equal(close.infraFaultNote({ acts: 2, infraFaults: 0 }), null, "a clean run stays silent — the signal has to mean something");
  assert.equal(close.infraFaultNote({ acts: 0, infraFaults: 3 }), null, "and a zero-act run is the OTHER branch's business, not this signal's");
  assert.match(String(bank.infraFaultNote({ admitted: 1, infraFaults: 4 })), /4 tool call\(s\) never reached the database/, "same on the bank lane");
  assert.equal(bank.infraFaultNote({ admitted: 1, infraFaults: 0 }), null);

  // S9's own branch, re-driven here through the extracted function so both attributions are
  // pinned in one place: zero reads + our fault = internal; zero reads + no fault = model_error.
  assert.equal(close.classifyCloseOutcome(mkClose({ acts: 0, reads: 0, infraFaults: 1 }), "").code, "internal");
  assert.equal(close.classifyCloseOutcome(mkClose({ acts: 0, reads: 0, infraFaults: 0 }), "").code, "model_error");

  // THE BANK LANE HAS THE IDENTICAL STRUCTURE and the identical four cases — `digest !== null` is
  // its "we read something" signal, exactly as `reads > 0` is close's.
  assert.equal(bank.classifyBankOutcome(mkBank({ digest: "abc", infraFaults: 1 }), "").kind, "refused");
  assert.equal(bank.classifyBankOutcome(mkBank({ digest: "abc", infraFaults: 0 }), "").kind, "nothing_due");
  assert.equal(bank.classifyBankOutcome(mkBank({ admitted: 1, digest: "abc", infraFaults: 0 }), "").kind, "acted");
  assert.equal(bank.classifyBankOutcome(mkBank({ digest: null, infraFaults: 1 }), "").code, "internal");
  assert.equal(bank.classifyBankOutcome(mkBank({ digest: null, infraFaults: 0 }), "").code, "model_error");

  // 裁-44 R3 / FOLD-16 CHANGED THIS ONE CASE ON THE BANK LANE, and the change is the fix. It used
  // to assert that a run which ACTED settles green however many faults it saw. On the bank lane
  // that is now FALSE: the pack is the EVIDENCE every write derives its amounts from, so a fault
  // while reading it means the run's own grounding failed at least once, and a later admitted
  // write must not outrank that. The CLOSE lane keeps the old rule — it has no pack, so an infra
  // fault there cannot have corrupted the evidence a later act was derived from.
  assert.equal(
    bank.classifyBankOutcome(mkBank({ admitted: 1, digest: "abc", infraFaults: 9 }), "").kind,
    "refused",
    "bank: an infra fault ANYWHERE outranks an admitted act — a corrupt read plus one more act is not a green night",
  );
  assert.equal(bank.classifyBankOutcome(mkBank({ admitted: 1, digest: "abc", infraFaults: 9 }), "").code, "internal");
  assert.equal(
    close.classifyCloseOutcome(mkClose({ acts: 2, reads: 6, infraFaults: 3 }), "").kind,
    "proposed",
    "close: the asymmetry is deliberate — no pack, so no corrupted evidence, and N12's partial-success rule stands",
  );
});

test("G1B-I9 裁-44 FOLD-3 — a night that ATTEMPTED writes and admitted none FAILS; FOLD-2 — a cancelled task settles cancelled", { skip: skip0138 }, async () => {
  // TWO RULINGS, ONE CELL, because they are the same question asked at the same seam: what does a
  // run's terminal state say about a night in which the model's acts did not land?
  //
  // FOLD-3's defect: a typed DB write refusal does not THROW on either lane — the close cores
  // RETURN {status:'refused'} (0138:1799-1800) and wake_match_bank_line returns the same
  // (0121:6008). Neither incremented acts nor infraFaults, so `reads > 0` / `digest !== null` took
  // the nothing_due branch and the task settled COMPLETED. A run in which every single act the
  // model attempted was rejected reported a green night.
  //
  // FOLD-2's defect: a cancel landing mid-pass left the task 'cancel_requested', the pass kept
  // minting credentials and writing, and the settle then stamped 'completed' over the cancel.
  const close = await import("../workflows/closePrep.v1.impl.ts");
  const bank = await import("../workflows/bankAgent.v1.impl.ts");
  const mkClose = (o) => ({ acts: 0, reads: 0, infraFaults: 0, writeAttempts: 0, refusals: 0, cancelledAs: null, ...o });
  const mkBank = (o) => ({ admitted: 0, digest: null, infraFaults: 0, writeAttempts: 0, refusals: 0, cancelledAs: null, ...o });

  // ---- FOLD-3, the assertions that RED without the fix (both lanes) -------------------------
  const closeAllRefused = close.classifyCloseOutcome(mkClose({ reads: 6, writeAttempts: 3, refusals: 3 }), "I tried three times.");
  assert.equal(closeAllRefused.kind, "refused", "reads fine + every write refused is a FAILED night, not nothing_due");
  assert.equal(closeAllRefused.code, "model_error", "and with no infra fault the verdicts were the database's on the MODEL's proposals");
  const bankAllRefused = bank.classifyBankOutcome(mkBank({ digest: "abc", writeAttempts: 2, refusals: 2 }), "");
  assert.equal(bankAllRefused.kind, "refused", "same on the bank lane");
  assert.equal(bankAllRefused.code, "model_error");

  // Our fault still outranks the model's when both are present — 'internal' is the honest code.
  assert.equal(close.classifyCloseOutcome(mkClose({ reads: 6, writeAttempts: 2, refusals: 2, infraFaults: 1 }), "").code, "internal");
  assert.equal(bank.classifyBankOutcome(mkBank({ digest: "abc", writeAttempts: 2, refusals: 2, infraFaults: 1 }), "").code, "internal");

  // THE CASES THAT MUST NOT FIRE, which is what stops FOLD-3 being a blunt instrument.
  assert.equal(close.classifyCloseOutcome(mkClose({ reads: 6 }), "nothing to do").kind, "nothing_due", "a run that attempted NO write is still a quiet night");
  assert.equal(bank.classifyBankOutcome(mkBank({ digest: "abc" }), "nothing due").kind, "nothing_due");
  const partial = close.classifyCloseOutcome(mkClose({ acts: 1, reads: 6, writeAttempts: 3, refusals: 2 }), "");
  assert.equal(partial.kind, "proposed", "a PARTIAL admit stays a success — the acts landed with durable receipts");
  assert.equal(partial.refusals, 2, "but the refusal count travels with it rather than being dropped");
  const partialBank = bank.classifyBankOutcome(mkBank({ admitted: 1, digest: "abc", writeAttempts: 3, refusals: 2 }), "");
  assert.equal(partialBank.kind, "acted");
  assert.equal(partialBank.refusals, 2);

  // ---- FOLD-2, the classifier half (the behavioural half is G1B-CANCEL-1) ------------------
  // A cancelled task outranks EVERYTHING, admitted acts included: the acts keep their own durable
  // receipts, but a task somebody cancelled did not complete.
  const c1 = close.classifyCloseOutcome(mkClose({ acts: 4, reads: 6, cancelledAs: "cancel_requested" }), "");
  assert.equal(c1.kind, "cancelled", "even a run that ACTED settles the cancellation");
  assert.equal(c1.observed, "cancel_requested", "and carries what it actually SAW, so the workflow settles on a fact");
  const b1 = bank.classifyBankOutcome(mkBank({ admitted: 4, digest: "abc", cancelledAs: "cancelled" }), "");
  assert.equal(b1.kind, "cancelled");
  assert.equal(b1.observed, "cancelled", "an ALREADY-terminal status is reported as-is — the workflow stands down on it rather than raising CLR13");
});

test("G1B-I7 a fault that never reached the database is OURS, not the model's", { skip: skip0138 }, async () => {
  // S9 (independent review): every zero-read run used to settle error_code='model_error', but the
  // causes landing there are not all the model — pools not injected, a credential mint failure, a
  // driver fault, and assertTailBinding's throw, which is a CODE DEFECT IN A FROZEN BODY being
  // recorded on a durable audit field as the model's fault. Since that guard fires on a static
  // property, ONE drifted call site would have settled EVERY close task 'model_error' until
  // somebody noticed. error_code is the first field a dead-letter triage reads.
  const reads = await import("../workflows/closePrep.v1.reads.ts");

  // A CLR-coded refusal IS the database judging the request — not our fault, not counted.
  const dbVerdict = reads.newCloseRunRecord();
  for (const code of ["CLR03", "CLR04", "CLR10", "CLR11"]) {
    const e = Object.assign(new Error("refused"), { code });
    reads.closeRefusal(dbVerdict, e);
  }
  assert.equal(dbVerdict.infraFaults, 0, "four real DB verdicts are not infrastructure faults");

  // Everything else never reached the database, whatever it carries.
  const ours = reads.newCloseRunRecord();
  reads.closeRefusal(ours, new Error("runtime pools not injected (globalThis.__claraPools)"));
  reads.closeRefusal(ours, new Error("wake_abandon_close: SQL binds 5 distinct placeholders ... drifted apart"));
  reads.closeRefusal(ours, Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
  reads.closeRefusal(ours, "a bare string, not an Error at all");
  assert.equal(ours.infraFaults, 4, "a pools failure, the tail guard, a driver fault and a non-Error are all OURS");

  // THE ORACLE-SAFETY PROPERTY MUST SURVIVE THE CHANGE: a CLR refusal's message must still be
  // identical across the four codes' families, so it cannot become an existence oracle.
  const m03 = reads.closeRefusal(reads.newCloseRunRecord(), Object.assign(new Error("x"), { code: "CLR03" })).error;
  const m11 = reads.closeRefusal(reads.newCloseRunRecord(), Object.assign(new Error("totally different"), { code: "CLR11" })).error;
  assert.equal(m03.replace("CLR03", "X"), m11.replace("CLR11", "X"), "the refusal text must not vary with the underlying message");
});

test("G1B-I6 the close helper refuses a call site whose tail numbering has drifted", { skip: skip0138 }, async () => {
  // NAMED NOTATION CLOSED THE *NAME* HALF, NOT THE *VALUE* HALF (independent review). On the close
  // lane the placeholder-to-value mapping is split across two files: each call site supplies
  // $1..$n, and callCloseVerb appends the tail three. Every site's tail numbers therefore encode
  // an assumption about that append order. Add an argument to an argsBefore array without bumping
  // the tail and the rationale lands in the new parameter's slot — same-typed, non-blank, silent.
  // assertTailBinding bounds that drift class; this cell proves it is not decorative.
  const reads = await import("../workflows/closePrep.v1.reads.ts");
  const GOOD = "select clara.wake_abandon_close(p_close_run => $1, p_reason => $2, p_rationale => $3, p_model => $4::jsonb, p_op_key => $5) as r";

  // POSITIVE CONTROL FIRST: the real, shipping SQL for this verb must pass at its real value
  // count. Without this, every negative below could be passing because the guard rejects
  // everything.
  assert.doesNotThrow(() => reads.assertTailBinding("wake_abandon_close", GOOD, 5));

  // DRIFT: a sixth value with the tail left at $3-$5. This is the exact edit the guard exists for.
  assert.throws(() => reads.assertTailBinding("wake_abandon_close", GOOD, 6), /drifted apart/);
  // The mirror: a site that renumbered the tail but did not add the value.
  const RENUMBERED = "select clara.wake_abandon_close(p_close_run => $1, p_reason => $2, p_new => $3, p_rationale => $4, p_model => $5::jsonb, p_op_key => $6) as r";
  assert.throws(() => reads.assertTailBinding("wake_abandon_close", RENUMBERED, 5), /drifted apart/);
  assert.doesNotThrow(() => reads.assertTailBinding("wake_abandon_close", RENUMBERED, 6));

  // TAIL BOUND TO THE WRONG PLACEHOLDERS at a correct count — the transposition shape itself,
  // caught by NAME rather than by arithmetic.
  const SWAPPED = "select clara.wake_abandon_close(p_close_run => $1, p_reason => $2, p_rationale => $4, p_model => $3::jsonb, p_op_key => $5) as r";
  assert.throws(() => reads.assertTailBinding("wake_abandon_close", SWAPPED, 5), /p_rationale => \$3/);
});

test("G1B-I4 NEITHER body can write a receipt — every receipt is the verb's own in-txn act", { skip: skip0138 }, async () => {
  // THE HONEST SHAPE OF "settled with the expected receipts". These two bodies write ZERO
  // receipts themselves: bank_agent_receipts is written inside _agent_bank_receipt and
  // agent_act_receipts inside _agent_close_receipt, both in the SAME transaction as their DML,
  // and the DB's own batteries prove those fire. What is THIS lane's to prove is the other half
  // — that the bodies cannot fabricate or skip one — and that is measured two ways.
  const { readFileSync, readdirSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(new URL("../workflows/", import.meta.url));

  // (1) STRUCTURAL: no member of either frozen closure contains an INSERT/UPDATE/DELETE against a
  // receipt table. A body that could write one could write a receipt for an act it never took.
  const members = readdirSync(dir).filter((f) => /^(bankAgent|closePrep)\.v1/.test(f));
  assert.ok(members.length >= 13, `expected both closures present, saw ${members.length}`);
  for (const f of members) {
    const src = readFileSync(dir + f, "utf8");
    // Comments legitimately NAME the tables; only a SQL write against one is the defect.
    const writes = src.match(/(insert\s+into|update|delete\s+from)\s+clara\.(bank_agent_receipts|agent_act_receipts)/gi);
    assert.equal(writes, null, `${f} must never write a receipt table directly, found: ${writes}`);
  }

  // (2) THE PRIVILEGE WALL — has_table_privilege, NOT information_schema.table_privileges.
  // The distinction was an independent review's finding and it is real: table_privileges reports
  // grants made to a role NAME. It resolves neither role INHERITANCE (a grant to a parent role
  // these three are members of lands under the PARENT's name) nor PUBLIC (which lands under
  // grantee='PUBLIC'). Either would return zero rows and pass a cell whose subject could still
  // write. has_table_privilege answers the question actually being asked — "can this role do
  // this?" — and resolves both in one call. Same derived-vs-behavioural discipline G1B-F1 uses
  // one screen up.
  const ROLES = ["clara_runtime", "clara_wake_bank", "clara_wake_interactive"];
  const TABLES = ["clara.bank_agent_receipts", "clara.agent_act_receipts"];
  for (const role of ROLES) {
    for (const table of TABLES) {
      const p = await rig.rootQuery(
        `select has_table_privilege($1,$2,'INSERT') as ins,
                has_table_privilege($1,$2,'UPDATE') as upd,
                has_table_privilege($1,$2,'DELETE') as del`,
        [role, table],
      );
      const { ins, upd, del } = p.rows[0];
      assert.equal(ins, false, `${role} must not INSERT ${table}`);
      assert.equal(upd, false, `${role} must not UPDATE ${table}`);
      assert.equal(del, false, `${role} must not DELETE ${table}`);
    }
  }

  // POSITIVE CONTROL on the instrument itself: has_table_privilege is not simply answering false
  // to everything (a wrong role name would throw, but a wrong TABLE name would too — what this
  // guards is the reader concluding "false everywhere" means "the query works"). The owner CAN
  // write these tables, and clara_authenticated CAN read them.
  const control = await rig.rootQuery(
    `select has_table_privilege('clara_fn_owner','clara.agent_act_receipts','INSERT') as owner_ins,
            has_table_privilege('clara_authenticated','clara.agent_act_receipts','SELECT') as human_sel`,
  );
  assert.equal(control.rows[0].owner_ins, true, "the owner CAN write — so 'false' above is a real answer, not a broken query");
  assert.equal(control.rows[0].human_sel, true, "and the human read door stays open");

  // (3) THE STRUCTURAL GUARANTEE, which does not depend on any grant census staying empty: both
  // tables carry forced RLS, so even a granted INSERT from a lane role is refused by policy.
  const rls = await rig.rootQuery(
    `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='clara' and c.relname in ('bank_agent_receipts','agent_act_receipts')`,
  );
  assert.equal(rls.rows.length, 2, "both receipt tables must exist");
  for (const row of rls.rows) {
    assert.equal(row.relrowsecurity, true, `${row.relname}: RLS enabled`);
    assert.equal(row.relforcerowsecurity, true, `${row.relname}: RLS FORCED — the owner is not exempt either`);
  }
});
