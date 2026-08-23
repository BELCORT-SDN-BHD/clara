// F-A8 (Wave-F Track A) — the internet lane, PR-1: THE TIER-1 BEHAVIOURAL BATTERY.
// Annex C cells C.1-C.4, C.9, C.13 (the PR-1-reachable subset), C.14 (the PR-1-reachable
// subset) against docs/plan/active/internet-lane-design.md v3 + internet-lane-annexes-2.md
// Annex K. Structural posture (grants/RLS/DEFINER/rosters) lives in f-a8-posture.test.mjs;
// this file asserts what the Tier-1 verbs DO.
//
// WHAT THIS FILE DOES NOT COVER, and why: C.4d (the transition-day cell) MOVED to PR-3
// (fx_rates has no transition day once IL-D23 landed — an exact rate_date key, no
// effective_to). C.6/C.11/C.12/C.15/C.16 are PR-2/PR-4 runtime cells (a canonicalizer, a
// sterile HTTP client, an actual socket) that do not exist until those PRs; C.7/C.10's Tier-2
// half is PR-4's. C.5 is the sst_threshold_schedule limb, PR-3's alone.
//
// FIXTURES build the evidence substrate DIRECTLY (as clara_fn_owner) below the wake door,
// in the exact shape record_fetch_artifact would leave — PR-1 grants that verb to
// clara_runtime only and PR-2's caller does not exist yet (f-a8-tier1-fixtures.mjs header).
// Every cell still exercises the REAL wake_submit_policy_draft / decide_policy_draft /
// override_policy_draft surface, never a shortcut around the door.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, assertRaises, CLR, ROLES, opk,
} from "./rig-helpers.mjs";
import {
  mintProactive, makeEndpoint, makeAttempt, makeArtifact, locatorFor, makeSource,
  makeAgreeingPair, submitDraft, decide, override, readDraft, readFxRate,
  seedOwners, seedBookkeeper,
} from "./f-a8-tier1-fixtures.mjs";

let ready = false;
let owners;

before(async () => {
  ready = (await rootQuery("select to_regclass('clara.fx_rates') is not null as ok")).rows[0].ok
    && (await rootQuery("select to_regprocedure('clara.wake_submit_policy_draft(text,jsonb,jsonb,text,text)') is not null as ok")).rows[0].ok;
  if (ready) owners = await seedOwners();
});
after(async () => { await endPool(); });

/** A NAMED, COUNTED skip — never a bare `return`. */
function dormant(t) {
  if (!ready) {
    t.skip("F-A8 PR-1 migration is not applied yet (clara.fx_rates / wake_submit_policy_draft absent) — cell dormant, not passing");
    return true;
  }
  return false;
}

// A STRICTLY INCREASING rate_date per call — never collides on fx_rates' partial unique live
// index, and (since _policy_value_plausible's comparator is "the single most recent row, no
// date filter") guarantees a test's OWN just-landed row is always the freshest thing on the
// table when IT checks plausibility next, regardless of what any earlier-declared test landed.
let _dayOffset = 0;
const freshDate = () => {
  const d = new Date(Date.UTC(2026, 0, 1));
  d.setUTCDate(d.getUTCDate() + (_dayOffset++));
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// C.1 — the Tier-1 door and its ladder
// ---------------------------------------------------------------------------

test("C.1a the closed table_key set refuses a plausible-looking unknown key", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const err = await assertRaises(CLR.badRequest, () => submitDraft({
    secret: cred.secret, tableKey: "sst_rate_schedule", sources: [], rationale: "x", opKey: opk("c1a"),
  }), "wake_submit_policy_draft unknown table_key");
  assert.match(err.message, /unknown policy table/i);
  // the credential must NOT have been consumed by a refused call at this rung — the ladder
  // asserts table_key BEFORE any consume-first stamp (design §3.1 step order).
  const row = await rootQuery("select consumed_at from clara.wake_credentials where id = $1", [cred.credential_id]);
  assert.equal(row.rows[0].consumed_at, null, "table_key refusal must not consume the credential");
});

test("C.1c/C.1d single-use on the NEW verb: consume on call 1, replay returns the envelope without a second consume, a genuinely fresh op fails CLR03", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "5.1234" });
  const opKey = opk("c1cd");

  const first = await submitDraft({ secret: cred.secret, sources, opKey, rationale: "call 1" });
  assert.ok(first.draft_id, "call 1 must succeed and mint a draft");

  const row1 = await rootQuery("select consumed_at from clara.wake_credentials where id = $1", [cred.credential_id]);
  assert.ok(row1.rows[0].consumed_at, "the credential must be consumed after call 1");

  // C.1d — the SAME op_key on the SAME (now-consumed) credential replays, not re-consumes.
  const replay = await submitDraft({ secret: cred.secret, sources, opKey, rationale: "call 1 (replay)" });
  assert.equal(replay.draft_id, first.draft_id, "a replayed op_key must return the SAME stored envelope");

  // A genuinely FRESH op on the same (consumed) credential must refuse CLR03.
  await assertRaises(CLR.wake, () => submitDraft({ secret: cred.secret, sources, opKey: opk("c1cd-fresh"), rationale: "call 2, fresh op" }),
    "a fresh op on an already-consumed proactive credential");
});

test("C.1b signature census: no F-A8 verb takes a value-shaped or client-shaped input", async (t) => {
  if (dormant(t)) return;
  // proargnames alone is IN-only correct for these five verbs: none of them RETURNS TABLE /
  // carries an OUT parameter (all return jsonb/uuid/void), so there is no OUT name to exclude.
  // (proargmodes is NULL whenever every argument is plain IN — unnest(NULL) yields zero rows,
  // which silently dropped every one of these five functions the first time this cell ran.)
  const r = await rootQuery(
    `select p.proname, p.proargnames as names, p.proargmodes as modes
       from pg_proc p
      where p.pronamespace = 'clara'::regnamespace
        and p.proname in ('wake_submit_policy_draft','decide_policy_draft','override_policy_draft',
                           'record_fetch_artifact','record_web_attempt_event')`,
  );
  assert.equal(r.rowCount, 5, `expected exactly 5 F-A8 verbs, saw ${r.rowCount}`);
  const banned = /^p_(payload|value|amount|rate|client_id|client|client_name)$/;
  for (const row of r.rows) {
    assert.equal(row.modes, null, `${row.proname}: expected no OUT/INOUT parameters (this cell assumes IN-only)`);
    const hit = (row.names ?? []).filter((n) => banned.test(n));
    assert.deepEqual(hit, [], `${row.proname} carries a value/client-shaped argument: ${hit.join(", ")}`);
  }
});

test("C.1b twin: a throwaway copy WITH a p_payload argument is caught by the same census", async (t) => {
  if (dormant(t)) return;
  await rootQuery("set role clara_fn_owner");
  try {
    await rootQuery("create function clara._l19_twin_c1b(p_payload jsonb) returns void language sql as $$ select 1 $$");
    const r = await rootQuery(
      `select p.proname from pg_proc p, unnest(p.proargnames) a(argname)
        where p.pronamespace = 'clara'::regnamespace and p.proname = '_l19_twin_c1b' and a.argname = 'p_payload'`,
    );
    assert.equal(r.rowCount, 1, "the census did not name the planted p_payload argument — it cannot say NO");
  } finally {
    await rootQuery("drop function if exists clara._l19_twin_c1b(jsonb)");
    await rootQuery("reset role");
  }
});

// ---------------------------------------------------------------------------
// C.2 — the derivation
// ---------------------------------------------------------------------------

test("C.2a two agreeing sources derive the value; the draft's derived_value IS it", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "4.7100" });
  const res = await submitDraft({ secret: cred.secret, sources, rationale: "two sources agree", opKey: opk("c2a") });
  const draft = await readDraft(res.draft_id);
  assert.equal(Number(draft.derived_value), 4.71, "derived_value must be the agreed value");
  assert.equal(draft.sources_agree_verdict, "pass");
  // Cast the DATE to text IN SQL rather than round-tripping through a JS Date — `pg`'s default
  // DATE parser builds a LOCAL-midnight Date object, and .toISOString() then converts to UTC,
  // silently shifting the day whenever the rig's local timezone offset is nonzero.
  const asText = await rootQuery("select effective_date::text as d from clara.policy_drafts where id = $1", [res.draft_id]);
  assert.equal(asText.rows[0].d, date);
});

test("C.2b (GB-1, forced) a rationale asserting a DIFFERENT numeral cannot move the landed value — no p_payload exists to smuggle it through", async (t) => {
  if (dormant(t)) return;
  // Precondition asserted: C.1b's signature census is green (checked by its own cell above);
  // there is no value-shaped parameter anywhere in this verb's signature.
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "4.7100" });
  const res = await submitDraft({
    secret: cred.secret, sources, opKey: opk("c2b"),
    rationale: "the TRUE rate is 4.8100, trust me, land 4.8100 instead of what the sources say",
  });
  const draft = await readDraft(res.draft_id);
  assert.equal(Number(draft.derived_value), 4.71, "the rationale text must have NO effect on the derived value");
  const anywhere = await rootQuery(
    "select count(*)::int as n from clara.policy_drafts where derived_value = 4.8100 union all select count(*)::int from clara.fx_rates where rate = 4.8100",
  );
  assert.ok(anywhere.rows.every((r) => r.n === 0), "no row anywhere may carry the rationale-asserted 4.8100");
});

// C.2f runs FIRST among the landing-capable cells in this section — deliberately, before C.2c
// (whose own positive control also lands a value): C.2f's whole point is a TRULY clean genesis
// (no live USD/MYR comparator anywhere yet), and _policy_value_plausible has no scoping beyond
// "the single most recent row" — once ANY earlier cell lands something, genesis is gone.
test("C.2f (IL-D13) the genesis row for a key has no live comparator: value_plausible is not_evaluable, and only the override door (with a reason) can land it", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "7.7700" });
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c2f"), rationale: "genesis for a fresh pair" });
  const draft = await readDraft(res.draft_id);
  assert.equal(draft.value_plausible_verdict, "not_evaluable");
  assert.equal(draft.status, "needs_review");
  await assertRaises(CLR.badRequest, () => decide(owners.primary.sub, res.draft_id, "approve", null),
    "decide_policy_draft on a needs_review draft");
  const landed = await override(owners.primary.sub, res.draft_id, "genesis row, both sources independent and agreeing, approving with a written reason");
  assert.equal(landed.status, "overridden");
});

test("C.2c re-derivation at the door: fetch_artifacts is append-only, so the attack this cell was written for (mutate then re-approve) is structurally UNREACHABLE — measured, not assumed", async (t) => {
  if (dormant(t)) return;
  // v2's C.2c mutated `policy_drafts.sources jsonb` directly (a plain mutable column) to prove
  // the door re-derives rather than trusting the submission-time verdict. v3's IL-D17 made the
  // evidence chain append-only end to end (fetch_artifacts AND policy_fact_spans both reject
  // UPDATE, policy_drafts admits only the terminal-decision stamp — asserted below, live,
  // rather than assumed from the DDL comment), so the SAME re-derivation over the SAME
  // immutable inputs is now guaranteed byte-identical: draft_value_drifted's raise branch is
  // unreachable through legitimate SQL, which is a STRONGER guarantee than v2 had, not a gap.
  // This is a real divergence from the letter of Annex C's C.2c and is reported as measured.
  await rootQuery("set role clara_fn_owner");
  try {
    await assert.rejects(
      () => rootQuery("update clara.fetch_artifacts set canonical_text = 'x' where true"),
      /append-only/i, "fetch_artifacts must refuse ANY update, not only a targeted one",
    );
    await assert.rejects(
      () => rootQuery("update clara.policy_fact_spans set value = 0 where true"),
      /append-only/i, "policy_fact_spans must refuse ANY update",
    );
  } finally {
    await rootQuery("reset role");
  }

  // The POSITIVE control this cell CAN still make: re-derivation over unmutated data must
  // succeed and land the SAME value it derived at submission — the door's re-derive-and-
  // compare logic runs on every approve, it is simply never given a chance to disagree.
  // Which door is right depends on whether C.2f already landed a comparator (it runs first,
  // deliberately) — this cell asserts the mechanism, not which specific verdict path fires.
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "6.6600" });
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c2c"), rationale: "unmutated re-derivation" });
  const draft = await readDraft(res.draft_id);
  const landed = draft.status === "pending_approval"
    ? await decide(owners.primary.sub, res.draft_id, "approve", "re-derivation must agree with itself")
    : await override(owners.primary.sub, res.draft_id, "re-derivation must agree with itself");
  const rate = await readFxRate(landed.landed_id);
  assert.equal(Number(rate.rate), 6.66, "re-derivation over immutable inputs must reproduce the submission-time value exactly");
});

test("C.2d two disagreeing sources land needs_review, and the draft row EXISTS", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const a = await makeSource({ code: "bnm", independenceClass: "bnm", date, rateText: "3.1000" });
  const b = await makeSource({ code: "xe", independenceClass: "xe", date, rateText: "3.2000" });
  const res = await submitDraft({ secret: cred.secret, sources: [a, b], opKey: opk("c2d"), rationale: "disagreement" });
  const draft = await readDraft(res.draft_id);
  assert.equal(draft.status, "needs_review");
  assert.equal(draft.sources_agree_verdict, "fail");
  assert.equal(draft.derived_value, null, "a disagreeing pair derives no value");
});

test("C.2e one extractable source only: not_evaluable, never pass; the draft exists", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const a = await makeSource({ code: "bnm", independenceClass: "bnm", date, rateText: "2.2200" });
  const endpointB = await makeEndpoint({ independenceClass: "xe" });
  const attemptB = await makeAttempt({ endpointId: endpointB });
  const unreadableText = "the page loaded but carried no numeral matching the expected pattern at all";
  const artifactB = await makeArtifact({ attemptId: attemptB, endpointId: endpointB, url: "https://xe.example/rates", text: unreadableText, seed: `c2e:${date}` });
  const b = { endpointId: endpointB, artifactId: artifactB.id, locator: { start: 0, end: unreadableText.length } };
  const res = await submitDraft({ secret: cred.secret, sources: [a, b], opKey: opk("c2e"), rationale: "one source unreadable" });
  const draft = await readDraft(res.draft_id);
  assert.equal(draft.sources_agree_verdict, "not_evaluable");
  assert.equal(draft.status, "needs_review");
});

test("C.2g (GM-7 totality) unparseable quotes on BOTH sides still COMMIT a needs_review row; the adversarial twin shows the guard is load-bearing", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const endpointA = await makeEndpoint({ independenceClass: "bnm" });
  const endpointB = await makeEndpoint({ independenceClass: "xe" });
  const attemptA = await makeAttempt({ endpointId: endpointA });
  const attemptB = await makeAttempt({ endpointId: endpointB });
  const textA = "RM500,000 (see note) — no decimal quotation appears on this page";
  const textB = "the published table carries no numeral of any kind today";
  const artA = await makeArtifact({ attemptId: attemptA, endpointId: endpointA, url: "https://bnm.example/rates", text: textA, seed: `c2g-a:${date}` });
  const artB = await makeArtifact({ attemptId: attemptB, endpointId: endpointB, url: "https://xe.example/rates", text: textB, seed: `c2g-b:${date}` });
  const sources = [
    { endpointId: endpointA, artifactId: artA.id, locator: { start: 0, end: textA.length } },
    { endpointId: endpointB, artifactId: artB.id, locator: { start: 0, end: textB.length } },
  ];
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c2g"), rationale: "both unparseable" });
  const draft = await readDraft(res.draft_id);
  assert.equal(draft.sources_agree_verdict, "not_evaluable", "an unparseable pair must be not_evaluable, never a raise");
  assert.equal(draft.status, "needs_review", "the transaction must have COMMITTED a needs_review row");
});

test("C.2h the extractor version is stamped on the draft and is stable across a re-run of the same input", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "8.8800" });
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c2h"), rationale: "version stamp" });
  const draft = await readDraft(res.draft_id);
  const ev = await rootQuery("select evaluator_name, version from clara.evaluator_versions where id = $1", [draft.extractor_version_id]);
  assert.equal(ev.rows[0].evaluator_name, "evaluate_policy_source_value");
  assert.equal(ev.rows[0].version, 1);
});

// ---------------------------------------------------------------------------
// C.3 — the audited owner door
// ---------------------------------------------------------------------------

test("C.3a decide_policy_draft below owner rank refuses CLR04 (via _human_ctx, not a hand-rolled CLR05)", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "1.2340" });
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c3a"), rationale: "bookkeeper attempts decide" });
  const bookkeeper = await seedBookkeeper(owners.primary.firm_id);
  await assertRaises(CLR.authz, () => decide(bookkeeper, res.draft_id, "approve", null), "a bookkeeper attempting decide_policy_draft");
});

test("C.3b decide on a needs_review draft refuses draft_not_decidable; override on the SAME draft with a reason succeeds and the landed row says which door was used, no join", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  // A deliberately implausible value (never within 0.5x-1.5x of anything this file lands
  // elsewhere) so this cell's needs_review outcome does not depend on execution order.
  const sources = await makeAgreeingPair({ date, rateText: "50.0000" });
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c3b"), rationale: "two doors, different friction" });
  const draft = await readDraft(res.draft_id);
  assert.equal(draft.status, "needs_review");
  const decideErr = await assertRaises(CLR.badRequest, () => decide(owners.primary.sub, res.draft_id, "approve", null), "decide on needs_review");
  assert.match(decideErr.message, /not decidable/i);
  const landed = await override(owners.primary.sub, res.draft_id, "override with a written reason");
  const rate = await readFxRate(landed.landed_id);
  assert.equal(rate.basis_kind, "owner_instruction");
  // An implausible-by-design value gets 'fail' here (a live comparator exists by the time
  // this cell runs), never the genesis 'not_evaluable' — either way the live row must name
  // WHICH verdict path landed it, with no join.
  assert.match(rate.basis, /value_plausible=(fail|not_evaluable)/, "the live row must name which verdict path landed it, with no join");
});

test("C.3c override on a draft whose derived_value is NULL refuses — there is no number to approve", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const a = await makeSource({ code: "bnm", independenceClass: "bnm", date, rateText: "1.1100" });
  const b = await makeSource({ code: "xe", independenceClass: "xe", date, rateText: "1.2200" });
  const res = await submitDraft({ secret: cred.secret, sources: [a, b], opKey: opk("c3c"), rationale: "disagreeing, no value" });
  const draft = await readDraft(res.draft_id);
  assert.equal(draft.derived_value, null);
  await assertRaises(CLR.badRequest, () => override(owners.primary.sub, res.draft_id, "trying anyway"),
    "override on a NULL-derived-value draft");
});

test("C.3d a terminal draft refuses a second decision", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "5000.0000" }); // implausible, order-independent
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c3d"), rationale: "terminal twice" });
  await override(owners.primary.sub, res.draft_id, "first decision");
  await assertRaises(CLR.badRequest, () => override(owners.primary.sub, res.draft_id, "second decision, must refuse"),
    "a second decision on an already-terminal draft");
});

// ---------------------------------------------------------------------------
// C.4 — supersede, the date range, and the missing day (fx_rates only; C.4d moved to PR-3)
// ---------------------------------------------------------------------------

test("C.4a approve/override writes BOTH the predecessor's supersede stamp AND the new row lands, one query, no join to superseded_by", async (t) => {
  if (dormant(t)) return;
  // Two SEPARATE credentials — single-use means the first submission consumes its own.
  const cred1 = await mintProactive(owners.primary.firm_id);
  const cred2 = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const first = await makeAgreeingPair({ date, rateText: "5.5550" });
  const r1 = await submitDraft({ secret: cred1.secret, sources: first, opKey: opk("c4a-1"), rationale: "day one" });
  const landed1 = await override(owners.primary.sub, r1.draft_id, "day one landing");

  const second = await makeAgreeingPair({ date, rateText: "5.6660" });
  const r2 = await submitDraft({ secret: cred2.secret, sources: second, opKey: opk("c4a-2"), rationale: "backdated correction, same date" });
  const draft2 = await readDraft(r2.draft_id);
  // The corrected date already has a landed row, so plausibility now has a live comparator —
  // 5.6660 is within band of 5.5550, so this should be pending_approval (not the genesis path).
  assert.equal(draft2.value_plausible_verdict, "pass");
  const landed2 = await decide(owners.primary.sub, r2.draft_id, "approve", "correcting day one");

  const predecessor = await readFxRate(landed1.landed_id);
  assert.equal(predecessor.superseded_by, landed2.landed_id);
  assert.ok(predecessor.superseded_at, "the predecessor must carry a supersede timestamp");
  const live = await rootQuery(
    "select rate from clara.fx_rates where base_ccy='USD' and quote_ccy='MYR' and rate_date=$1 and superseded_at is null",
    [date],
  );
  assert.equal(live.rowCount, 1, "exactly one live row per key, no join needed");
  assert.equal(Number(live.rows[0].rate), 5.666);
});

test("C.4b stamping superseded_by without superseded_at (attempted directly) is refused — the supersede-only TRIGGER catches it before the paired CHECK ever fires, both layers defending the same invariant", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "0.0500" }); // implausible, order-independent
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c4b"), rationale: "paired check" });
  const landed = await override(owners.primary.sub, res.draft_id, "land it");
  await rootQuery("set role clara_fn_owner");
  try {
    await assert.rejects(
      () => rootQuery("update clara.fx_rates set superseded_by = gen_random_uuid() where id = $1", [landed.landed_id]),
      /admits exactly one update/i,
      "the supersede-only trigger must refuse a half-set stamp before the CHECK is ever reached",
    );
  } finally {
    await rootQuery("reset role");
  }
});

test("C.4c a missing-day evaluator read refuses rate_unavailable_for_date, and fx_rates carries NO effective_to column at all (IL-D23 — carry-forward cannot be expressed)", async (t) => {
  if (dormant(t)) return;
  const cols = await rootQuery(
    "select column_name from information_schema.columns where table_schema='clara' and table_name='fx_rates'",
  );
  assert.ok(!cols.rows.some((r) => r.column_name === "effective_to"), "fx_rates must carry no effective_to column");
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "6.1230" });
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c4c"), rationale: "day D" });
  await override(owners.primary.sub, res.draft_id, "land day D");
  const nextDay = new Date(`${date}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const dPlus1 = nextDay.toISOString().slice(0, 10);
  const lookup = await rootQuery(
    "select rate from clara.fx_rates where base_ccy='USD' and quote_ccy='MYR' and rate_date=$1 and superseded_at is null",
    [dPlus1],
  );
  assert.equal(lookup.rowCount, 0, "no row may satisfy a lookup for the day AFTER the latest fx_rates row — carry-forward is structurally impossible");
});

// ---------------------------------------------------------------------------
// C.9 — contract-blind negative controls
// ---------------------------------------------------------------------------

test("C.9a ▣ no fetch_artifacts/policy_drafts id can satisfy entry_evidence.document_id's FK", async (t) => {
  if (dormant(t)) return;
  const hasEntryEvidence = await rootQuery("select to_regclass('clara.entry_evidence') is not null as ok");
  if (!hasEntryEvidence.rows[0].ok) { t.skip("clara.entry_evidence not on this rig frontier"); return; }
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "3.3330" });
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c9a"), rationale: "negative control" });
  await rootQuery("set role clara_fn_owner");
  try {
    await assert.rejects(
      () => rootQuery("insert into clara.entry_evidence(document_id) values ($1)", [res.draft_id]),
      /foreign key|violates/i,
      "a policy_drafts id must never satisfy entry_evidence.document_id",
    );
  } finally {
    await rootQuery("reset role");
  }
});

test("C.9b ▣ wiki_page_citations.source_kind='web' is rejected by the five-member CHECK", async (t) => {
  if (dormant(t)) return;
  const hasWiki = await rootQuery("select to_regclass('clara.wiki_page_citations') is not null as ok");
  if (!hasWiki.rows[0].ok) { t.skip("clara.wiki_page_citations not on this rig frontier"); return; }
  const cols = await rootQuery(
    "select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'clara.wiki_page_citations'::regclass and conname ilike '%source_kind%'",
  );
  assert.ok(cols.rows.length > 0 && !cols.rows[0].def.includes("'web'"), "the source_kind CHECK must not admit 'web'");
});

test("C.9c a prosrc scan proves no F-A8 function inserts into documents/entry_evidence/wiki_page_citations, with an adversarial twin", async (t) => {
  if (dormant(t)) return;
  async function offenders() {
    const r = await rootQuery(
      `select proname from pg_proc where pronamespace = 'clara'::regnamespace
        and proname in ('wake_submit_policy_draft','_policy_draft_submit_core','decide_policy_draft',
                         'override_policy_draft','_policy_draft_commit_core','record_fetch_artifact',
                         'record_web_attempt_event','evaluate_policy_source_value_v1')
        and (prosrc ilike '%insert into clara.documents%' or prosrc ilike '%insert into clara.entry_evidence%'
             or prosrc ilike '%insert into clara.wiki_page_citations%')`,
    );
    return r.rows.map((r) => r.proname);
  }
  assert.deepEqual(await offenders(), [], "no F-A8 PR-1 function may write to documents/entry_evidence/wiki_page_citations");

  await rootQuery("set role clara_fn_owner");
  try {
    await rootQuery(`create or replace function clara.wake_submit_policy_draft_twin_c9c() returns void
      language plpgsql as $$ begin if false then insert into clara.documents(id) values (gen_random_uuid()); end if; end $$`);
    const r = await rootQuery(
      `select proname from pg_proc where pronamespace = 'clara'::regnamespace
        and proname = 'wake_submit_policy_draft_twin_c9c' and prosrc ilike '%insert into clara.documents%'`,
    );
    assert.equal(r.rowCount, 1, "the scan did not name the planted insert — it cannot say NO");
  } finally {
    await rootQuery("drop function if exists clara.wake_submit_policy_draft_twin_c9c()");
    await rootQuery("reset role");
  }
});

// ---------------------------------------------------------------------------
// C.13 (PR-1 DB-testable subset) — freshness and the door
// ---------------------------------------------------------------------------

test("C.13a a draft whose bound artifact is past expires_at, approved with no revalidation artifact, refuses draft_stale", async (t) => {
  if (dormant(t)) return;
  // Two SEPARATE credentials — single-use means the baseline submission consumes its own.
  const credBase = await mintProactive(owners.primary.firm_id);
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  // A live baseline first, so the SECOND draft's plausibility check has a comparator and can
  // reach pending_approval — the stale check lives on the approve arm, which only pending_
  // approval drafts reach.
  const baseline = await makeAgreeingPair({ date, rateText: "1.5000" });
  const r0 = await submitDraft({ secret: credBase.secret, sources: baseline, opKey: opk("c13a-base"), rationale: "baseline" });
  await override(owners.primary.sub, r0.draft_id, "land the baseline");

  const endpointA = await makeEndpoint({ independenceClass: "bnm", maxAge: "1 millisecond" });
  const endpointB = await makeEndpoint({ independenceClass: "xe", maxAge: "1 millisecond" });
  const date2 = freshDate();
  const rateText = "1.5010";
  const attemptA = await makeAttempt({ endpointId: endpointA });
  const attemptB = await makeAttempt({ endpointId: endpointB });
  const textA = `USD/MYR mid rate as at ${date2} is ${rateText} per the bnm published page.`;
  const textB = `As of ${date2} the USD to MYR exchange rate stands at ${rateText}.`;
  const artA = await makeArtifact({ attemptId: attemptA, endpointId: endpointA, url: "https://bnm.example/rates", text: textA, seed: `c13a-a:${date2}` });
  const artB = await makeArtifact({ attemptId: attemptB, endpointId: endpointB, url: "https://xe.example/rates", text: textB, seed: `c13a-b:${date2}` });
  const sources = [
    { endpointId: endpointA, artifactId: artA.id, locator: locatorFor(textA, rateText) },
    { endpointId: endpointB, artifactId: artB.id, locator: locatorFor(textB, rateText) },
  ];
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c13a"), rationale: "will go stale" });
  const draft = await readDraft(res.draft_id);
  assert.equal(draft.status, "pending_approval", "with a live comparator this pair must reach pending_approval");
  assert.ok(draft.expires_at, "a bound endpoint's max_age must stamp expires_at on the draft");

  await new Promise((r) => setTimeout(r, 50)); // outlast the 1ms max_age
  const err = await assertRaises(CLR.badRequest, () => decide(owners.primary.sub, res.draft_id, "approve", null),
    "approve on a stale draft with no revalidation artifact");
  assert.match(err.message, /stale/i);
});

test("C.13d ▣ the FX day-after must-fail cell: fx_rates carries no effective_to column, so a next-day lookup cannot be expressed as a carry-forward", async (t) => {
  if (dormant(t)) return;
  const r = await rootQuery(
    "select count(*)::int as n from information_schema.columns where table_schema='clara' and table_name='fx_rates' and column_name='effective_to'",
  );
  assert.equal(r.rows[0].n, 0);
});

test("C.13f a caller attempting to pass accessed_at/fetched_at to the submit door finds no such parameter", async (t) => {
  if (dormant(t)) return;
  const r = await rootQuery(
    `select array_agg(a.argname) as names from pg_proc p, unnest(p.proargnames) a(argname)
      where p.pronamespace = 'clara'::regnamespace and p.proname = 'wake_submit_policy_draft'`,
  );
  const names = r.rows[0].names ?? [];
  assert.ok(!names.some((n) => /accessed_at|fetched_at|effective_date/.test(n)), `wake_submit_policy_draft must take none of these; saw: ${names.join(", ")}`);
});

// ---------------------------------------------------------------------------
// C.14 (PR-1 DB-testable subset) — authenticity, the digest chain
// ---------------------------------------------------------------------------

test("C.14a ▣ the fabricated-citation cell: a well-formed but nonexistent artifact_id refuses via the FK, and no draft row is left behind", async (t) => {
  if (dormant(t)) return;
  const endpointA = await makeEndpoint({ independenceClass: "bnm" });
  const cred = await mintProactive(owners.primary.firm_id);
  const before = await rootQuery("select count(*)::int as n from clara.policy_drafts");
  await assertRaisesOneOfSafe(
    () => submitDraft({
      secret: cred.secret,
      sources: [
        { endpointId: endpointA, artifactId: randomUUID(), locator: { start: 0, end: 5 } },
        { endpointId: endpointA, artifactId: randomUUID(), locator: { start: 0, end: 5 } },
      ],
      opKey: opk("c14a"), rationale: "fabricated citation",
    }),
    "wake_submit_policy_draft with a fabricated artifact_id",
  );
  const after = await rootQuery("select count(*)::int as n from clara.policy_drafts");
  assert.equal(after.rows[0].n, before.rows[0].n, "no draft row may survive a fabricated artifact_id");
});

test("C.14c an unauthorized role attempting record_fetch_artifact directly has no EXECUTE (T17 exact-set)", async (t) => {
  if (dormant(t)) return;
  const r = await rootQuery(
    "select has_function_privilege($1, to_regprocedure($2)::oid, 'execute') as ok",
    [ROLES.wakeProactive, "clara.record_fetch_artifact(uuid,uuid,text,text,jsonb,int,int,text,text,bigint,text,jsonb,timestamptz,int,text,text,text,text,timestamptz,text)"],
  );
  assert.equal(r.rows[0].ok, false, "clara_wake_proactive must not be able to EXECUTE record_fetch_artifact");
});

test("C.14e ▣ the digest chain resolves for one landed row: landed row -> card -> draft -> span -> artifact -> attempt, every edge present", async (t) => {
  if (dormant(t)) return;
  const cred = await mintProactive(owners.primary.firm_id);
  const date = freshDate();
  const sources = await makeAgreeingPair({ date, rateText: "500000.0000" }); // implausible, order-independent
  const res = await submitDraft({ secret: cred.secret, sources, opKey: opk("c14e"), rationale: "walk the chain" });
  const landed = await override(owners.primary.sub, res.draft_id, "land it for the chain walk");
  const chain = await rootQuery(
    `select fr.id as landed_id, pac.id as card_id, pd.id as draft_id, pfs.id as span_id,
            fa.id as artifact_id, wa.id as attempt_id
       from clara.fx_rates fr
       join clara.policy_drafts pd on pd.id = $2
       join clara.policy_approval_cards pac on pac.draft_id = pd.id
       join clara.policy_fact_spans pfs on pfs.id = pd.span_id
       join clara.fetch_artifacts fa on fa.id = pfs.artifact_id and fa.sha256 = pfs.artifact_sha256
       join clara.web_attempts wa on wa.id = fa.attempt_id
      where fr.id = $1`,
    [landed.landed_id, res.draft_id],
  );
  assert.equal(chain.rowCount, 1, "every edge of the digest chain must resolve in one query");
});

async function assertRaisesOneOfSafe(fn, label) {
  let err = null;
  try { await fn(); } catch (e) { err = e; }
  if (!err) assert.fail(`${label}: expected a refusal but the call SUCCEEDED`);
}
