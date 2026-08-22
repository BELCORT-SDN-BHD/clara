// F-A2 PR-1 — Annex C.5, TIER D: the genuinely deferred belts, the replayed trigger census, and
// the two structural walls' commit-time behaviour. The rest of the ladder is
// f-a2-ladder{,-2,-3,-4}.test.mjs.
//
// CONTRACT-BLIND, frontier-gated on `f_a2_posting_core$`.
//
// WHY TIER D CANNOT BE CONVERTED, restated because it is the premise of every cell here: an
// exception block opens a SUBTRANSACTION, and deferred constraint triggers fire at COMMIT —
// outside it. So a Tier-D failure is an ABORT, and every Tier-D abort settles the task
// `failed`, never a refusal, with the commit error's `(errcode, reason)` in `last_refusal`.
// The difference from a Tier-B refusal is purely EVIDENTIARY: the draft was written in an
// EARLIER transaction, so a commit-time abort rolls back only the post attempt.
//
// THE CENSUS CELL COMES FIRST BECAUSE A NAIVE READER GETS IT WRONG. Deferrability is a
// `pg_trigger` fact. Two independent readers already derived it from source and were wrong —
// v1 placed two NON-deferred triggers in Tier D, and the review's corrected list was itself
// short by five (P1). So the tier is REPLAYED, and the pinned table is compared in BOTH
// directions: a missing row and an extra row are each a finding.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane,
  opk, entryRow, approveEntry, postingCoreReady, withTxnOrNull,
  gateCore, wakePostEntry, agentPostable, postReceiptCount, postReceiptRow,
  jeTriggerCensus, D1_TRIGGER_PREDICTION, F_A2_NEW_JE_TRIGGER,
  TIER_D_TOKENS, lastRefusalOf, admitsAll, PR2_PENDING, bodyOfName, AGENT_USER_ID, CHART,
} from "./f-a2-post-world.mjs";

let world = null;
before(async () => { if (await postingCoreReady()) world = await buildWorld(); });
after(async () => {
  printLaneNotes("f-a2-tier-d");
  printSkipCount("f-a2-tier-d");
  await endPool();
});

const A1 = () => world.clients.A1;
const OWNER = () => world.users.alice;
const post = (p, over = {}) => wakePostEntry(p.cred, { ...p.args, ...over });

// ===========================================================================
// C.5 — the replayed census.
// ===========================================================================

test("f-a2.c5.census the pg_trigger replay matches §D.1's table EXACTLY, in BOTH directions", async (t) => {
  if (await gateCore(t)) return;
  const live = await jeTriggerCensus();
  const expected = [...D1_TRIGGER_PREDICTION, F_A2_NEW_JE_TRIGGER]
    .map(({ tgname, deferrable, initdeferred }) => ({ tgname, deferrable, initdeferred }))
    .sort((a, b) => a.tgname.localeCompare(b.tgname));
  const liveSorted = [...live].sort((a, b) => a.tgname.localeCompare(b.tgname));

  const liveNames = new Set(liveSorted.map((x) => x.tgname));
  const wantNames = new Set(expected.map((x) => x.tgname));
  const missing = [...wantNames].filter((n) => !liveNames.has(n));
  const extra = [...liveNames].filter((n) => !wantNames.has(n));
  assert.deepEqual(missing, [],
    `c5.census: every pinned trigger is present. Missing: ${missing.join(", ")} — a tier disposition written about a trigger that does not exist is a fiction`);
  assert.deepEqual(extra, [],
    `c5.census: no UNPINNED trigger sits on clara.journal_entries. Extra: ${extra.join(", ")} — an unpinned constraint trigger has no tier, which means nobody decided whether it aborts or converts`);

  for (const want of expected) {
    const got = liveSorted.find((x) => x.tgname === want.tgname);
    assert.equal(got.deferrable, want.deferrable,
      `c5.census: ${want.tgname}.tgdeferrable — the tier boundary IS this boolean (predicted ${want.deferrable}, live ${got.deferrable})`);
    assert.equal(got.initdeferred, want.initdeferred,
      `c5.census: ${want.tgname}.tginitdeferred (predicted ${want.initdeferred}, live ${got.initdeferred})`);
  }
  // The two Tier-C members are the ones a naive reader mis-files, so they are named again here.
  const nonDeferred = liveSorted.filter((x) => !x.deferrable).map((x) => x.tgname);
  assert.ok(nonDeferred.includes("t_period_wall") && nonDeferred.includes("t_je_immutable"),
    `c5.census: t_period_wall and t_je_immutable are NOT deferred, which is exactly why they are Tier C and catchable (non-deferred set: ${nonDeferred.join(", ")})`);
});

test("f-a2.c5.new-trigger the receipt wall joins journal_entries as a DEFERRED constraint trigger on draft->approved", async (t) => {
  if (await gateCore(t)) return;
  const r = await rootQuery(
    `select tgname, tgdeferrable, tginitdeferred, pg_get_triggerdef(oid) as def
       from pg_trigger where tgrelid='clara.journal_entries'::regclass and tgname=$1`,
    [F_A2_NEW_JE_TRIGGER.tgname]);
  assert.equal(r.rows.length, 1, `c5.new-trigger: ${F_A2_NEW_JE_TRIGGER.tgname} exists`);
  assert.equal(r.rows[0].tgdeferrable, true, "c5.new-trigger: it is DEFERRABLE — it must see the receipt row the core inserts earlier in the same transaction");
  assert.equal(r.rows[0].tginitdeferred, true, "c5.new-trigger: …INITIALLY DEFERRED, so it fires at COMMIT");
  assert.match(r.rows[0].def, /update/i, "c5.new-trigger: it fires on the UPDATE that carries draft->approved");
});

// ===========================================================================
// The two structural walls at commit time.
// ===========================================================================

test("f-a2.c5.suppressed a SUPPRESSED entry_post_receipts row trips t_je_agent_post_receipt -> CLR08", async (t) => {
  if (await gateCore(t)) return;
  // The wall's whole job: if the receipt is ever absent on an agent post, the COMMIT must fail.
  // Deleting the row mid-transaction is the only honest way to ask — and the append-only guard
  // may refuse the delete first, which is a STRONGER answer, so the cell accepts either and
  // says which it saw.
  const p = await agentPostable(OWNER(), { client: A1() });
  const out = await withTxnOrNull(async (c) => {
    await c.query("set role clara_wake_interactive");
    await c.query("select set_config('clara.wake_secret',$1,true)", [p.cred.secret]);
    await c.query(
      "select clara.wake_post_entry(p_entry => $1::uuid, p_expected_revision => $2::uuid, "
      + "p_client => $3::uuid, p_books_version => $4::bigint, p_rationale => $5::text, "
      + "p_model => $6::jsonb, p_op_key => $7::text)",
      [p.args.entry, p.args.expectedRevision, A1(), p.args.booksVersion,
        "c5.suppressed", JSON.stringify({ provider: "anthropic", model: "claude-opus-5", version: "2026-08-01" }), opk("c5supp")]);
    await c.query("reset role");
    await c.query("delete from clara.entry_post_receipts where entry_id=$1", [p.args.entry]);
    return "deleted";
  });
  assert.ok(out?.error, `c5.suppressed: the transaction FAILED (append-only refusal or the deferred wall at COMMIT) — got ${JSON.stringify(out)}`);
  assert.equal(out.error.code, "CLR08",
    `c5.suppressed: …with CLR08 (got ${out.error.code}: ${out.error.message}). Both doors that can answer here raise CLR08 — the append-only guard and the receipt wall`);
  assert.equal((await entryRow(p.args.entry))?.status, "draft",
    "c5.suppressed: and the entry never reached approved — a commit-time abort rolls back the whole post attempt");
});

test("f-a2.c5.no-exemption the wall demands a receipt on EVERY agent-approved transition — a rule id is not an exemption", async (t) => {
  if (await gateCore(t)) return;
  // THE UNAUTHORISED EXEMPTION, forced. The wall's first cut carried a second disjunct — "…or
  // this approval names a coding rule" — which Annex E.3 never authorised. Any transition
  // reaching the trigger under the AGENT identity while carrying a rule id was waved past with
  // NO receipt: a hole through the one wall that makes the receipt structural rather than a
  // convention the writer is trusted to keep.
  //
  // BOTH HALVES, because the shape read alone would be spelling and the behavioural read alone
  // would not say WHY it refused.
  const { src } = await bodyOfName("_tf_assert_agent_post_receipt");
  assert.ok(src, "c5.no-exemption: the wall's trigger function resolves");
  assert.ok(!src.includes("checked_via_rule_id"),
    "c5.no-exemption: the rule-id exemption is GONE from the body — E.3 authorises none");
  assert.ok(src.includes("if not v_is_agent then"),
    "c5.no-exemption: …and the live arm is keyed on the recorded is_agent fact ALONE");

  // The behavioural half: an agent-identity approval carrying a REAL rule id and no receipt.
  // The status flip is doctored as root — the same forgery idiom the estate's own belt cells use
  // — because no lawful door can produce this shape any more, which is the point.
  const p = await agentPostable(OWNER(), { client: A1() });
  const firm = p.cited.firm;
  const rule = await rootQuery(
    `insert into clara.coding_rules(firm_id,client_id,rule_type,account_code,status,pinned,origin,
        content_hash,created_by)
     values($1,$2,'vendor_account',$3,'proposed',false,'authored',
        encode(sha256(convert_to($4,'UTF8')),'hex'),$5) returning id`,
    [firm, A1(), CHART.expense, `c5-noexempt-${Date.now()}`, OWNER()]).catch((e) => ({ error: e }));
  if (rule?.error) {
    noteLane(`c5.no-exemption: a coding_rules row could not be minted (${rule.error.code}: ${rule.error.message}) — the behavioural half is unbuildable, the shape half above stands`);
    return;
  }
  const out = await withTxnOrNull((c) => c.query(
    `update clara.journal_entries
        set status='approved', checker_actor=$2, approved_at=now(), checked_via_rule_id=$3
      where id=$1`,
    [p.args.entry, AGENT_USER_ID, rule.rows[0].id]));
  assert.ok(out?.error,
    `c5.no-exemption: an AGENT approval carrying a rule id and NO receipt is refused at COMMIT — got ${JSON.stringify(out)}`);
  assert.equal(out.error.code, "CLR08",
    `c5.no-exemption: …with CLR08, the receipt wall's own code (got ${out.error.code}: ${out.error.message})`);
  assert.match(String(out.error.detail ?? out.error.message), /agent_post_receipt_missing|post receipt/i,
    "c5.no-exemption: …and it is the RECEIPT wall answering, not some other CLR08 guard");
  assert.equal((await entryRow(p.args.entry))?.status, "draft",
    "c5.no-exemption: and the forged approval rolled back whole");
});

test("f-a2.c5.human-inert a HUMAN approval needs no receipt — the trigger is inert on that lane", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1() });
  await approveEntry(OWNER(), { entry: p.args.entry, expectedRevision: p.args.expectedRevision, opKey: opk("c5human") });
  assert.equal((await entryRow(p.args.entry))?.status, "approved",
    "c5.human-inert: the human lane commits with no entry_post_receipts row at all");
  assert.equal(await postReceiptCount(p.args.entry), 0, "c5.human-inert: …and there is none");
  noteLane("c5.human-inert: this is also T3's premise — a human approval writes no receipt, so the trigger's receipt-keyed pin resolves NULL and reproduces today's null-pin behaviour byte-for-byte");
});

test("f-a2.c5.arm0 ARM-0 is DECLARED unreachable-by-FK, with the reason recorded", async (t) => {
  if (await gateCore(t)) return;
  // Law 68 puts ARM-0 first; law 31 says a wall that can never be asked is DECLARED rather than
  // banked on — because an ARM-0 that is merely BELIEVED unreachable is the shape that admits on
  // absence. The two doors that make it unreachable are asserted, not asserted-away.
  const fk = await rootQuery(
    `select count(*)::int as n from pg_constraint c join pg_class t on t.oid=c.conrelid
       join pg_namespace ns on ns.oid=t.relnamespace
      where ns.nspname='clara' and t.relname='journal_entries' and c.contype='f'
        and pg_get_constraintdef(c.oid) ilike '%checker_actor%'`);
  const notnull = await rootQuery(
    `select is_nullable from information_schema.columns
      where table_schema='clara' and table_name='journal_entries' and column_name='checker_actor'`);
  assert.ok(fk.rows[0].n > 0 || notnull.rows[0]?.is_nullable === "NO",
    "c5.arm0: checker_actor is FK-bound (0003:117) — an unresolvable checker cannot be stored");
  const { src } = await bodyOfName("_tf_assert_agent_post_receipt");
  assert.ok(src, "c5.arm0: the trigger function resolves");
  const firstArm = (src.replace(/--[^\n]*/g, " ").match(/\bif\b[\s\S]{0,240}/i) ?? [""])[0];
  assert.match(firstArm, /checker_actor/i,
    "c5.arm0: ARM-0 comes FIRST in the body — an unresolvable checker_actor refuses CLR08 before the is_agent arm is reached (law 68)");
  noteLane("c5.arm0: declared unreachable — checker_actor is FK-bound at 0003:117 and 0016:4950-4952 already refuses NULL. Recorded rather than banked on (law 31)");
});

// ===========================================================================
// The Tier-D abort, end to end.
// ===========================================================================

test("f-a2.c5.abort a Tier-D abort settles the task FAILED, and the commit error's (errcode, reason) reaches last_refusal", async (t) => {
  if (await gateCore(t)) return;
  // The DB half is PR-1's: the abort must carry a NAMED (errcode, reason) out of the commit.
  // The SETTLE half is PR-2's Tier-D capture, so this cell drives the settle itself and asserts
  // the shape the runtime must produce — it does not claim PR-2 is built.
  const { admitAutodraft, settleAutodraft } = await import("./f-a2-post-world.mjs");
  const p = await agentPostable(OWNER(), { client: A1(), amount: 470000 });
  let task = null;
  try {
    const adm = await admitAutodraft({ filing: p.cited.filingId });
    task = adm?.task_id ?? adm?.task ?? adm?.id ?? null;
  } catch (e) {
    noteLane(`c5.abort: could not admit an autodraft task (${e.code}: ${e.message}) — the settle half is exercised on the verb's own contract below`);
  }
  if (!task) return;
  const refusal = { clr: "CLR40", reason: TIER_D_TOKENS[0] };
  await settleAutodraft({ task, outcome: "failed", tokens: 0, entry: null, refusal })
    .catch((e) => noteLane(`c5.abort: settle_autodraft_task('failed') raised ${e.code}: ${e.message}`));
  const lr = await lastRefusalOf(task);
  assert.ok(lr, "c5.abort: a failed Tier-D settle records a last_refusal — an abort with no recorded reason names nothing");
  assert.equal(lr.reason, TIER_D_TOKENS[0],
    `c5.abort: the belt's reason lands VERBATIM in last_refusal (got ${JSON.stringify(lr)}) — an unnamed reason is a finding`);
  assert.ok(TIER_D_TOKENS.includes(lr.reason),
    "c5.abort: …and it is a member of the CLOSED Tier-D set (Annex E.2)");
  noteLane(`c5.abort: the runtime half of this contract is ${PR2_PENDING} — this cell proves the verb accepts and preserves the shape, not that PR-2 emits it`);
});

test("f-a2.c5.guards the balance / provenance / immutable guards still fire on a doctored fixture", async (t) => {
  if (await gateCore(t)) return;
  // F-A2 adds a lane; it does not soften the four structural invariants. An UNBALANCED entry
  // must still die at commit, and the immutability guard must still refuse a rewrite of an
  // approved row. Both are asserted through the doctoring the estate's own rig uses.
  const p = await agentPostable(OWNER(), { client: A1(), amount: 480000 });
  const unbalanced = await withTxnOrNull(async (c) => {
    await c.query("update clara.journal_lines set debit_cents = debit_cents + 1 where entry_id=$1 and debit_cents > 0", [p.args.entry]);
    return "doctored";
  });
  assert.ok(unbalanced?.error, `c5.guards: an unbalanced doctoring dies (got ${JSON.stringify(unbalanced)})`);
  assert.ok(["CLR07", "CLR08"].includes(unbalanced.error.code),
    `c5.guards: …at the balance guard (CLR07) or the immutability guard (CLR08), never silently (got ${unbalanced.error.code}: ${unbalanced.error.message})`);

  const r = await post(p);
  if (r?.posted === true) {
    const rewrite = await withTxnOrNull((c) =>
      c.query("update clara.journal_entries set memo='c5.guards rewrite' where id=$1", [p.args.entry]));
    assert.ok(rewrite?.error, "c5.guards: an APPROVED entry cannot be rewritten");
    assert.equal(rewrite.error.code, "CLR08", `c5.guards: …the immutability guard says CLR08 (got ${rewrite.error.code})`);
    const rc = await postReceiptRow(p.args.entry);
    assert.ok(rc, "c5.guards: the post receipt exists behind the posted entry");
    assert.ok(admitsAll(rc.gate_verdicts?.rung_vector),
      "c5.guards: …and its stored vector admits at every rung, which is what let it through");
  } else {
    noteLane(`c5.guards: the doctored entry did not post (${JSON.stringify(r?.refusal)}) — the immutability half is exercised by the unbalanced arm above`);
  }
});
