// 0042 Wave D-b — the ADJUSTMENT-TEMPLATE battery, part 1b: the STRUCTURAL probes for
// the three adjustment tables (ABI §D 1–3 + the §8 tail's RLS/no-truncate law and the
// two ABI §C hot-loop partial indexes) and the DUE ORACLE (design §2.3).
//
// Split out of `x42-adjustments.test.mjs` only because the repo enforces a 500-line
// file ceiling; `node --test tests/` discovers both automatically.
//
// CONTRACT-BLIND (see the x42-adj-core.mjs header).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { truncateGuardError } from "./rig-txn.mjs";
import {
  noteLane, endPool, printLaneNotes, printSkipCount,
  x42EnsureReady, skip42, caught, refuses, T, CLR38,
  EXPA, EXPB, ACCR2, PREP, mon,
  runManual, adjustmentRunDue, adjustmentRunDueAsHuman, accrualLines, prepaymentLines,
  enrolAdvance, adjWorld, freshAdjClient, liveTemplate, approveDraft, runAndSettle,
  rlsFlagsOf, indexDefs, tableExists,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});

after(async () => {
  printLaneNotes("x42-adj-due");
  printSkipCount("x42-adj-due");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b structure + due-oracle battery");

/** The three tables 0042 adds for the adjustment family (ABI §D 1–3). */
const ADJ_TABLES = ["adjustment_templates", "adjustment_runs", "adjustment_pair_reversals"];

test("x42.t0 structure: the three adjustment tables exist with FORCED RLS, none can be truncated, and BOTH ABI §C hot-loop partial indexes are present with their predicates", async (t) => {
  if (skipHere(t)) return;
  for (const tbl of ADJ_TABLES) {
    assert.ok(await tableExists(tbl), `clara.${tbl} exists (ABI §D)`);
    const f = await rlsFlagsOf(tbl);
    assert.equal(f?.rls, true, `clara.${tbl} has row-level security ENABLED (design §2.1)`);
    assert.equal(f?.force, true, "…and FORCED (the 0041:680-685 owner/human policy pair)");
    // TRUNCATE takes ACCESS EXCLUSIVE on the table and every cascade dependent, so on a
    // shared, concurrently-written rig the attempt can lose a lock race BEFORE reaching
    // the guard — truncateGuardError retries until the GUARD's own SQLSTATE is observed.
    //
    // THE BARE FORM CANNOT REACH THE GUARD ON AN FK PARENT, so it is the wrong instrument
    // for one of these three. Postgres raises "cannot truncate a table referenced in a
    // foreign key constraint" (0A000) BEFORE firing any BEFORE TRUNCATE trigger, and
    // `adjustment_templates` is the parent of BOTH `adjustment_runs` and
    // `adjustment_pair_reversals` (ABI §D 1–3) — so the bare attempt dies on the FK
    // restriction and never reaches 0042's `_tf_no_truncate`. That is not a hole: the
    // table is refused by two independent layers. The repo's own instrument for this
    // shape is rig-isolation.test.mjs:257 on journal_entries — assert the bare form is
    // refused, then reach the guard with CASCADE and hold it to CLR08. Every one of the
    // three still has to produce the guard's own SQLSTATE; nothing is relaxed.
    const bare = await truncateGuardError(`truncate clara.${tbl}`);
    assert.ok(bare, `clara.${tbl} refuses a bare TRUNCATE (it SUCCEEDED)`);
    const err = bare.code === "CLR08" ? bare : await truncateGuardError(`truncate clara.${tbl} cascade`);
    assert.equal(err?.code, "CLR08",
      `clara.${tbl} refuses TRUNCATE at 0042's own guard (bare gave ${bare.code}; cascade gave ${err?.code ?? "(it SUCCEEDED)"})`);
  }

  // ABI §C pins BOTH hot-loop partial indexes by predicate — the D-a F10 measured law.
  // A missing WHERE clause turns the poster's outstanding-draft probe and its ramp into
  // a full scan of journal_entries on every sweep tick.
  const defs = await indexDefs("journal_entries");
  const recurring = defs.filter((d) => /recurring_adjustment/.test(d));
  const draftIx = recurring.filter((d) => /where/i.test(d) && /draft/.test(d));
  const occIx = recurring.filter((d) => /template_id/.test(d) && /period_start/.test(d));
  assert.ok(draftIx.length >= 1,
    `ix_je_adj_draft-shaped index present — (client_id) WHERE status='draft' AND flags ? 'recurring_adjustment' (recurring-index defs seen: ${recurring.join(" | ") || "none"})`);
  assert.ok(occIx.length >= 1,
    `ix_je_adj_occurrence-shaped index present — ((flags->'recurring_adjustment'->>'template_id'), (…->>'period_start')) WHERE flags ? 'recurring_adjustment' (seen: ${recurring.join(" | ") || "none"})`);
  noteLane(`x42.t0 adjustment indexes on journal_entries: ${recurring.join(" | ")}`);
});

test("x42.d1 adjustment_run_due names the OLDEST unmet (template, period) among non-blocked live templates and lists the blocked ones with reason occurrence_draft_outstanding", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("d1");
  const a = await liveTemplate({ client, label: "d1a", start: mon(-3).start, cents: 40_000 });
  const b = await liveTemplate({
    client, label: "d1b", start: mon(-2).start, cents: 30_000,
    lines: accrualLines(30_000, { debit: EXPB, credit: ACCR2 }) });

  const due1 = await adjustmentRunDue(client);
  assert.equal(due1.due, true, "with two live templates something is due");
  assert.equal(due1.template_id, a.id, "…the OLDEST unmet pair belongs to template A");
  assert.equal(due1.period_start, mon(-3).start, "…at its first eligible period");
  assert.equal(due1.period_end, mon(-3).end, "…period_end alongside it");
  assert.deepEqual(due1.blocked, [], "…and nothing is blocked yet");

  const first = await runManual(w.users.bob, {
    client, template: a.id, periodStart: mon(-3).start, periodEnd: mon(-3).end });
  const due2 = await adjustmentRunDue(client);
  assert.equal(due2.due, true, "A is blocked by its own outstanding draft, so the oracle moves to B");
  assert.equal(due2.template_id, b.id, "…naming template B");
  assert.equal(due2.blocked.length, 1, "…and blocked[] carries exactly one entry");
  assert.equal(due2.blocked[0].template_id, a.id, "…identifying template A");
  assert.equal(due2.blocked[0].reason, "occurrence_draft_outstanding",
    "…with blocked[]'s only v1 reason (design §2.3)");

  await approveDraft(w.users.alice, first.entry_id);
  const due3 = await adjustmentRunDue(client);
  assert.deepEqual(due3.blocked, [], "approving the draft unblocks A");
  assert.equal(due3.template_id, a.id, "…and A's next unmet period is oldest again");
  assert.equal(due3.period_start, mon(-2).start, "…which is the month after the one just met");

  const human = await adjustmentRunDueAsHuman(w.users.carol, client);
  assert.equal(human.due, due3.due, "the oracle reads identically for a human (it is rendered on /rules)");
  assert.equal(human.template_id, due3.template_id, "…naming the same template");

  // Draining to the frontier leaves nothing due — the sweep's own ladder converges, and
  // the month IN PROGRESS is never reachable (it has not ENDED).
  for (const p of [mon(-2), mon(-1)]) await runAndSettle({ client, template: a.id, period: p });
  for (const p of [mon(-2), mon(-1)]) await runAndSettle({ client, template: b.id, period: p });
  assert.equal((await adjustmentRunDue(client)).due, false,
    "once every ENDED period is met nothing is due — mon(0) is still in progress");
  assert.ok(await caught(() => runManual(w.users.bob, {
    client, template: a.id, periodStart: mon(0).start, periodEnd: mon(0).end })),
  "…and running the month in progress is refused rather than silently posted");
});

test("x42.d2 the oracle never advertises a period the poster is GUARANTEED to refuse: reserving a live template's line account mid-life moves it out of due and into blocked[] as template_line_ineligible — per template, not per client", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("d2");
  const p = mon(-3);
  // The template's DEBIT leg is the prepayment asset — the one line an advance enrolment or
  // an FA profile can legally claim, which is what makes this reachable at all (§2.1's
  // fifth eligibility axis, `_acct_role_reserved`).
  const tpl = await liveTemplate({
    client, label: "d2", start: p.start, cents: 55_000,
    lines: prepaymentLines(55_000, { asset: PREP, expense: EXPA }) });

  const before = await adjustmentRunDue(client);
  assert.equal(before.due, true, "the template is due before anything reserves its line account");
  assert.equal(before.template_id, tpl.id, "…naming it");
  assert.equal(before.period_start, p.start, "…at its first eligible period");
  assert.deepEqual(before.blocked, [], "…and nothing is blocked");

  // A LAWFUL act by a real verb, taken by a real admin: the enrolment floor is admin+, the
  // prepayment account's approved GL balance is still zero (so `enrolment_balance_nonzero`
  // does not bind), and the enrolment door does not — and cannot — consult template lines.
  // From this instant the poster refuses this triple forever; the question is whether the
  // ORACLE says so, or keeps handing the sweep a triple it is guaranteed to lose on.
  await enrolAdvance(w.users.hana, { client, accountCode: PREP, personLabel: "x42 d2 staff" });

  const after = await adjustmentRunDue(client);
  assert.equal(after.due, false,
    "the oracle stops advertising a period the poster would refuse (its own FY-guard doctrine, §2.3)");
  assert.equal(after.reason, "all_blocked", "…and says the live set is entirely blocked");
  assert.equal(after.blocked.length, 1, "…with exactly one blocked row");
  assert.equal(after.blocked[0].template_id, tpl.id, "…naming the newly-dead template");
  assert.equal(after.blocked[0].reason, T.templateLineIneligible,
    "…and the reason the poster itself would raise (ABI §F's own word, not a new one)");
  assert.deepEqual(Object.keys(after.blocked[0]).sort(), ["reason", "template_id"],
    "…in the ABI §A blocked-row shape, unwidened");

  // THE ORACLE AND THE VERB AGREE — the whole point of the advisory. Running the period the
  // oracle used to advertise refuses CLR38, every time, with no self-limiting state to stop
  // a daily sweep from re-attempting it forever.
  await refuses(() => runManual(w.users.bob, {
    client, template: tpl.id, periodStart: p.start, periodEnd: p.end }),
  T.templateLineIneligible, "running the period the oracle used to advertise", { code: CLR38 });

  // PER TEMPLATE, NOT PER CLIENT. A second, healthy template on the same client is still
  // reported due — the runtime belt isolates a raise per CLIENT, so a dead template that
  // stayed `due` cost every OTHER template on that client its whole sweep tick.
  const ok = await liveTemplate({
    client, label: "d2ok", start: mon(-2).start, cents: 20_000,
    lines: accrualLines(20_000, { debit: EXPB, credit: ACCR2 }) });
  const both = await adjustmentRunDue(client);
  assert.equal(both.due, true, "the HEALTHY template on the same client is still due");
  assert.equal(both.template_id, ok.id, "…naming it, not the dead one");
  assert.equal(both.blocked.length, 1, "…while the dead one stays named in blocked[]");
  assert.equal(both.blocked[0].reason, T.templateLineIneligible, "…with its terminal reason");
  noteLane("x42.d2 blocked[] reasons observed: occurrence_draft_outstanding (transient, d1) + template_line_ineligible (terminal, d2)");
});
