// F-A2 PR-1 — THE LADDER, part 4: Annex C.4, TIER C — the delegated walls, converted to a
// receipt on `(errcode, reason)` PAIRS ONLY. C.5 (Tier D) is f-a2-tier-d.test.mjs.
//
// CONTRACT-BLIND, frontier-gated on `f_a2_posting_core$`.
//
// WHY PAIRS AND NOT ERRCODES, restated because half these cells only make sense with it in
// hand: v1's classifier could not have worked, because most named raises carry NO `detail` at
// all — so `(CLR25, currency)` would have swallowed the corroboration-bound contradiction,
// *a money wall*, and reported it as a currency problem. Hence: no wildcards, no errcode-only
// members, and an unlisted pair PROPAGATES as a task failure rather than being guessed at.
//
// TWO KINDS OF CELL LIVE HERE, and the difference is deliberate. The STRUCTURAL cell reads the
// core's own live body and pins the pair set exactly, in both directions — that is the cheap,
// total instrument. The BEHAVIOURAL cells drive real fixtures into real walls. Where a fixture
// cannot be built on the rig, the cell says so through `noteLane` and still asserts the half it
// CAN reach; it never reports a fixture gap as a proven wall (review law 2).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane,
  booksVersion, opk, entryRow, counterpartyRows, postingCoreReady, holdThenContend, sawDeadlock,
  concurrentTwoSession, withTxnOrNull,
  gateCore, wakePostEntry, agentPostable, agentDraft, autodraftCred, ensureChart,
  witnessedFiling, postReceiptCount, supplierLines, bodyOfName, fnPresent,
  TIER_C_PAIRS, TIER_C_EXCLUDED, MODEL, RATIONALE,
  landWitnessPair, witnessShape, doctorLines, CHART, resolveOpenQuestion, salesLines,
} from "./f-a2-post-world.mjs";

let world = null;
let nameOnlyClient = null;
before(async () => {
  if (!(await postingCoreReady())) return;
  world = await buildWorld();
  // A THIRD CLIENT, ARMED UNDER HARD CONSTRAINT 12'S POLICY, THROUGH THE AUDITED DOOR.
  // `0062`'s wall is a BEFORE-row trigger on `clara.counterparties` that fires only for a client
  // whose `customer_identity_policy` fact says `name_only` — uuid-pinned to ROME SECRETARY in
  // production, and settable on any client through `record_client_fact`, which is the one
  // audited door 0063 leaves open. Without this the c4.name-only cell had NO behavioural proof
  // at all: it recorded a lane note and fell back to asserting that a constant appeared in a
  // constant, which is a tautology, not evidence — on the ONE wall that enforces a hard
  // constraint.
  const { createClient } = await import("./f-a2-post-world.mjs");
  const { recordPolicy } = await import("./name-only-guard-fixtures.mjs");
  nameOnlyClient = await createClient(world.users.alice, {
    name: `F-A2 NAMEONLY ${Date.now().toString(36)}`, opKey: opk("c4nameonlycli"),
  });
  await recordPolicy(world.users.alice, {
    client: nameOnlyClient, value: "name_only",
    basis: "f-a2 c4.name-only: constraint 12's wall needs a client under the policy to fire at all",
  });
});
after(async () => {
  printLaneNotes("f-a2-ladder-4");
  printSkipCount("f-a2-ladder-4");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const OWNER = () => world.users.alice;
const post = (p, over = {}) => wakePostEntry(p.cred, { ...p.args, ...over });

/** A Tier-C conversion: a RECEIPT (not a raise) whose refusal names tier C and the pair's
 *  reason, with ZERO entry_post_receipts rows behind it — the insert rolls back with the
 *  delegate inside the subtransaction (C.7b). */
function assertConverted(receipt, reason, label) {
  assert.equal(receipt?.posted, false, `${label}: the post did not happen`);
  assert.equal(receipt?.refusal?.tier, "C", `${label}: converted to a Tier-C receipt (got ${JSON.stringify(receipt?.refusal)})`);
  assert.equal(receipt?.refusal?.reason, reason, `${label}: …naming '${reason}'`);
}

// ===========================================================================
// The structural backbone.
// ===========================================================================

test("f-a2.c4.set the Tier-C pair set is EXACT in both directions — no wildcard, no errcode-only member", async (t) => {
  if (await gateCore(t)) return;
  // BY NAME. The core carries acting identity through the ctx bag (§3.1), so its arity is the
  // wrapper's PLUS the ctx — which is exactly the kind of thing a test must READ, not assume.
  const { src, args } = await bodyOfName("_agent_post_entry_core");
  assert.ok(src, "c4.set: the ungranted core resolves");
  noteLane(`c4.set: live core signature = clara._agent_post_entry_core(${args})`);
  const bare = src.replace(/--[^\n]*/g, " ");
  for (const [clr, reason] of TIER_C_PAIRS) {
    assert.ok(bare.includes(reason),
      `c4.set: the conversion table carries '${reason}' (the ${clr} pair)`);
  }
  for (const [clr, reason, ground] of TIER_C_EXCLUDED) {
    assert.ok(!bare.includes(reason),
      `c4.set: '${reason}' (${clr}) is NOT a member — ${ground} (law 31 forbids listing a wall that can never be asked)`);
  }
  // The wildcard is DELETED: eight bare CLR23 raises inside `_assert_supplier_bill_shape_at`
  // plus the sales analog are reachable through the delegate, and converting them would give
  // one defect two settle outcomes decided by nothing an operator can see.
  assert.ok(!/when\s+sqlstate\s+'CLR23'\s+then\s*$/im.test(bare),
    "c4.set: there is no bare `when sqlstate 'CLR23'` arm — the wildcard is deleted");
  assert.ok(!/when\s+sqlstate\s+'CLR08'/i.test(bare),
    "c4.set: the immutability guard never converts");
});

// ===========================================================================
// CLR25 — and the cell that proves the conversion names the RIGHT wall.
// ===========================================================================

test("f-a2.c4.currency (CLR25, currency_unsupported) converts", async (t) => {
  if (await gateCore(t)) return;
  await ensureChart(OWNER(), A1());
  // THE CURRENCY MOVES AFTER THE DRAFT, and it has to. Drafting straight onto an SGD page is
  // refused by the DRAFT floor (CLR21, "explicit non-MYR currency is unsupported") — a
  // PRE-EXISTING wall, stronger than the Tier-C conversion under test. And the landed region
  // cannot be patched: clara.document_regions is append-only (CLR08). So the draft binds a
  // lawful MYR generation and an SGD SUCCESSOR pair is landed on top of it.
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: 500000 });
  const cred = await autodraftCred(A1());
  const d = await agentDraft(OWNER(), cred, { client: A1(), cited, codingKind: "supplier_bill", lines: supplierLines(500000) });
  await landWitnessPair(cited.documentId, {
    ...witnessShape({
      fields: { "invoice.total": 500000, "invoice.currency": "SGD", "invoice.type_code": "01" },
    }),
    versionN: 2,
  });
  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: (await entryRow(d.entry_id))?.revision_token ?? d.revision_token,
    client: A1(), booksVersion: await booksVersion(A1()),
  });
  // THE CONVERSION IS UNREACHABLE FROM THIS LANE, and that is a FINDING about E.2's pair set
  // rather than a fixture that needs more work. It is DECLARED here with its ground asserted
  // positively (law 31), never noted-and-passed: `noteLane` writes to stderr and node counts the
  // cell PASSED, so the old else-branch turned "the pair never fired" into a green.
  //
  //   THE GROUND. Reaching the delegate at all requires EVERY Tier-B rung to admit, and B2
  //   requires the fact state to be CORROBORATED. The witness predicate refuses corroboration on
  //   any page whose currency is not MYR (the `v_tmyr = 'myr' and v_vmyr = 'myr'` conjunct), so a
  //   document that could trigger `(CLR25, currency_unsupported)` in the delegate can never get
  //   past B2 to be handed to it. The two conditions are mutually exclusive by construction.
  //
  // WHAT IS PROVABLE IS FORCED: the post does not happen, and it refuses with a TYPED Tier-B
  // token rather than a raise. Both asserted unconditionally.
  assert.equal(r?.posted, false, "c4.currency: an SGD successor generation never posts");
  assert.equal(r?.refusal?.tier, "B",
    `c4.currency: …and it is a typed Tier-B admission verdict, not a raise (got ${JSON.stringify(r?.refusal)})`);
  assert.equal(r?.refusal?.reason, "not_corroborated",
    `c4.currency: …specifically B2 — the rung that makes the currency pair unreachable (got ${JSON.stringify(r?.refusal)})`);
  // THE GROUND, MEASURED rather than argued: this document really does fail to corroborate, and
  // it is the CURRENCY that stops it.
  const st = (await rootQuery("select clara._invoice_fact_state($1) as s", [cited.documentId])).rows[0].s;
  assert.equal(st?.corroborated, false, "c4.currency ground: the SGD generation does not corroborate");
  assert.equal(st?.explicit_non_myr, true, "c4.currency ground: …because its currency is explicitly not MYR");
  assert.equal(await postReceiptCount(d.entry_id), 0,
    "c4.currency: and ZERO entry_post_receipts rows behind the refusal (C.7b)");
  noteLane("c4.currency: `(CLR25, currency_unsupported)` is DECLARED UNREACHABLE from the posting lane — B2 requires corroboration and the witness predicate refuses corroboration on a non-MYR page, so the delegate's currency wall can never be asked. Law 31 says a wall that cannot be asked leaves the pair set; E.2 still lists it. REPORTED to the lead as a design question, not decided here.");
});

test("f-a2.c4.money-wall a corroboration-bound contradiction is NEVER reported as a currency refusal", async (t) => {
  if (await gateCore(t)) return;
  // THE cell that proves the conversion names the RIGHT wall. `(CLR25, currency_unsupported)`
  // and `(CLR25, corroboration_contradicted)` share an errcode, and the second is the MONEY
  // wall. An errcode-only classifier would swallow it and tell an operator the currency was
  // wrong — a wrong number wearing a plausible label.
  // The anchor moves by LANDING A SUCCESSOR PAIR, never by rewriting the bound one:
  // clara.document_regions is append-only, and a witness row is not a scratchpad.
  const p = await agentPostable(OWNER(), { client: A1(), amount: 500000 });
  await landWitnessPair(p.cited.documentId, {
    ...witnessShape({
      fields: { "invoice.total": 600000, "invoice.currency": "RM", "invoice.type_code": "01" },
    }),
    // version_n 2, or `_document_facts_extraction` keeps resolving G1 and the anchor never
    // moves — it orders by the llm_witness TASK's version_n desc, id desc.
    versionN: 2,
  });
  const r = await post(p);
  assert.equal(r?.posted, false, "c4.money-wall: a contradicted anchor never posts");
  assert.notEqual(r?.refusal?.reason, "currency_unsupported",
    `c4.money-wall: the money wall is NOT reported as a currency refusal (got ${JSON.stringify(r?.refusal)})`);
  // …AND THE CONVERSION IS UNREACHABLE HERE TOO, for the sibling reason, declared with its
  // ground rather than noted: the delegate's contradiction check asks whether the newer machine
  // facts contradict the draft's bound evidence — which is exactly what B3
  // (`_corroboration_bound`) asks one tier earlier, on the same STABLE resolver in the same
  // snapshot. B3 therefore pre-empts it structurally, and no fixture can put the delegate's copy
  // of the question first.
  //
  // THE CELL'S OWN CLAIM SURVIVES INTACT and is what stays forced: the money wall is NEVER
  // reported as a currency refusal. That is asserted above, unconditionally.
  assert.equal(r?.refusal?.tier, "B",
    `c4.money-wall: the contradiction is caught one tier EARLIER, as a typed Tier-B verdict (got ${JSON.stringify(r?.refusal)})`);
  assert.ok(["not_corroborated", "anchor_unbound"].includes(r?.refusal?.reason),
    `c4.money-wall: …at B2 or B3, the two rungs that read the moved generation (got ${JSON.stringify(r?.refusal)})`);
  noteLane("c4.money-wall: `(CLR25, corroboration_contradicted)` is DECLARED UNREACHABLE from the posting lane — B3 asks the delegate's own question one tier earlier, off the same STABLE resolver in the same snapshot. The cell's load-bearing claim (never reported as a currency refusal) is forced above. REPORTED to the lead with c4.currency.");
});

// ===========================================================================
// CLR23 — three pairs, and the one that PRE-EMPTS another.
// ===========================================================================

test("f-a2.c4.registration-conflict (CLR23, registration_conflict) converts, and PRE-EMPTS counterparty_landscape_moved", async (t) => {
  if (await gateCore(t)) return;
  // GM-5's cell. `_resolve_counterparty` hits the registration conflict ONE CALL BELOW
  // `0037:1853`, so it fires FIRST — v4 listed only the site above it, and an ordinary business
  // refusal therefore settled as a task FAILURE. The cell forces it and refuses to accept
  // `counterparty_landscape_moved` as the answer.
  //
  // THE COLLISION IS THE OTHER WAY ROUND, and it took a rig read of `_resolve_counterparty` to
  // see it. `registration_conflict` fires when a stated registration finds NO registration match
  // and a counterparty with the SAME NAME (or alias) already holds a DIFFERENT registration. The
  // first cut of this fixture presented the SAME registration under a different name, which is a
  // `registration_match` -- the resolver's happy path -- so the second bill posted cleanly and
  // the cell reported the wall missing when the fixture had simply asked the other question.
  //
  // AND THE COLLIDING DRAFT IS BORN FIRST. `_resolve_counterparty` runs at DRAFT too (it is how
  // the stored `match_fingerprint` is computed), so a fixture that births the registered
  // counterparty before drafting is refused CLR23 at the DRAFT door and never reaches the
  // conversion this cell is about. Drafting first leaves a clean `birth` fingerprint; the
  // landscape then moves under it, and the POST is where the resolver meets the collision --
  // which is also what makes the PRE-EMPTION claim real, since the fingerprint moved too.
  const name = `CONFLICT CO ${Date.now().toString(36)} SDN BHD`;
  const second = await agentPostable(OWNER(), {
    client: A2(), amount: 400000, vendor: { new: { name, registration_no: "201801009902" } },
  });
  const first = await agentPostable(OWNER(), {
    client: A2(), amount: 400000, vendor: { new: { name, registration_no: "201801009901" } },
  });
  const r1 = await post(first);
  assert.equal(r1?.posted, true,
    `c4.registration-conflict: mandatory setup -- the first bill posts and BIRTHS the counterparty under registration ...9901 (${JSON.stringify(r1?.refusal)})`);
  const r = await post(second, { booksVersion: await booksVersion(A2()) });
  assert.equal(r?.posted, false, "c4.registration-conflict: a registration collision never posts");
  assert.notEqual(r?.refusal?.reason, "counterparty_landscape_moved",
    `c4.registration-conflict: it is NOT reported as the landscape having moved (got ${JSON.stringify(r?.refusal)})`);
  // FORCED: GM-5's whole finding is that this settles as a TASK FAILURE instead of a typed
  // refusal. A cell that noted that outcome and passed would be reporting the defect as normal.
  assertConverted(r, "registration_conflict", "c4.registration-conflict");
});

test("f-a2.c4.landscape-moved (CLR23, counterparty_landscape_moved) converts", async (t) => {
  if (await gateCore(t)) return;
  // A COUNTERPARTY IS BORN AT APPROVE, NOT AT DRAFT — it is stamped inside the delegate
  // (`0037:1884-1888`), which is the same fact GB-2's projected-state predicate exists for. So a
  // draft on its own leaves nothing to move, and the fixture APPROVES a first bill for the vendor
  // to bring it into being before drafting the second one whose landscape then shifts.
  //
  // THE ORDER IS THE FIXTURE, and the first cut had it backwards. The wall compares the
  // fingerprint `_resolve_counterparty` returns AT APPROVE against the `match_fingerprint`
  // stored AT DRAFT, so the landscape has to move BETWEEN those two moments. Birthing the
  // counterparty first and then drafting produces the SAME fingerprint on both sides
  // (`name_match_unregistered` twice) and the entry posts -- which is what this cell reported.
  // A merge is not needed at all: a `birth` fingerprint that becomes a NAME MATCH is exactly a
  // landscape that moved, it is the commonest live shape, and it is deterministic.
  const name = `LANDSCAPE ${Date.now().toString(36)} SDN BHD`;
  const p = await agentPostable(OWNER(), { client: A2(), amount: 410000, vendor: { new: { name } } });
  assert.equal((await entryRow(p.args.entry))?.match_fingerprint?.decision, "birth",
    "c4.landscape-moved: mandatory setup -- the draft's stored fingerprint is a BIRTH, which is the value the landscape then moves away from");
  // A SECOND entry births the counterparty under that name, through the ordinary door.
  const first = await agentPostable(OWNER(), { client: A2(), amount: 409000, vendor: { new: { name } } });
  const r1 = await post(first);
  assert.equal(r1?.posted, true,
    `c4.landscape-moved: mandatory setup -- the birthing post lands (${JSON.stringify(r1?.refusal)})`);
  const r = await post(p, { booksVersion: await booksVersion(A2()) });
  assert.equal(r?.posted, false, "c4.landscape-moved: a moved counterparty landscape never posts silently");
  // FORCED. The old note blamed "the merge fixture may not reproduce the live race" — and the
  // fixture no longer uses a merge at all: a `birth` fingerprint that becomes a NAME MATCH is
  // deterministic, so there is nothing left to excuse.
  assertConverted(r, "counterparty_landscape_moved", "c4.landscape-moved");
});

test("f-a2.c4.birth-race (CLR23, counterparty_birth_race) converts — two sessions birthing one counterparty", async (t) => {
  if (await gateCore(t)) return;
  const name = `BIRTHRACE ${Date.now().toString(36)} SDN BHD`;
  const a = await agentPostable(OWNER(), { client: A2(), amount: 420000, vendor: { new: { name } } });
  const b = await agentPostable(OWNER(), { client: A2(), amount: 420000, vendor: { new: { name } } });
  const sql =
    "select clara.wake_post_entry(p_entry => $1::uuid, p_expected_revision => $2::uuid, "
    + "p_client => $3::uuid, p_books_version => $4::bigint, p_rationale => $5::text, "
    + "p_model => $6::jsonb, p_op_key => $7::text) as r";
  // THE BOOKS TOKEN IS READ HERE, NOT AT DRAFT TIME. `agentPostable` captures it when the draft
  // is made, and every cell above this one commits a post in between -- so by now both sides
  // carry a STALE token and Tier A refuses CLR12 before a single lock is taken. Measured: that
  // is exactly what happened, and the old disjunction hid it because the other side posted. The
  // c4.clr26 cell already reads the token immediately before its race for the same reason.
  const bv = await booksVersion(A2());
  const side = (p, key) => ({
    role: ROLES.wakeInteractive, wakeSecret: p.cred.secret,
    run: (c) => c.query(sql, [p.args.entry, p.args.expectedRevision, A2(), bv,
      RATIONALE, JSON.stringify(MODEL), key]).then((x) => x.rows[0].r),
  });
  const out = await holdThenContend({ a: side(a, opk("c4raceA")), b: side(b, opk("c4raceB")) });
  const receipts = [out.a, out.b].map((s) => s?.receipt).filter(Boolean);
  const converted = receipts.filter((x) => x?.refusal?.tier === "C" && x.refusal.reason === "counterparty_birth_race");

  // THE OLD DISJUNCTION ACCEPTED THE WINNER ALONE. `provedBlocked || converted || someone
  // posted` is satisfied by a run in which the birth-race conversion has been DELETED, one side
  // posts and the other fails raw — `receipts.some(posted)` is true and nothing else is even
  // consulted. Forcing the parts separately is what revealed the finding below.
  assert.equal(out.provedBlocked, true,
    `c4.birth-race: the two sides really SERIALISED — read from pg_blocking_pids, not inferred from an outcome (got ${JSON.stringify(out)})`);

  // THE CONVERSION IS NOT REACHABLE FROM THIS LANE, AND THAT IS A MEASUREMENT, NOT A GUESS.
  // Forcing `out.b.ok === true` turned this cell RED: the loser comes back CLR12, "the books
  // moved past token N". It is structural, not timing. `assert_books_current` (0005:493-516) is
  // a TIER-A gate, so it runs before any lock is taken, and under this schedule side A COMMITS
  // before side B proceeds — which moves the books token B is holding. Two agent posts on one
  // client therefore always collide on freshness BEFORE they can collide on the birth, so
  // `(CLR23, counterparty_birth_race)` joins the two CLR25 pairs as DECLARED UNREACHABLE from
  // the posting lane (law 31). The pair stays in E.2's set and its presence in the classifier is
  // asserted structurally in `c4.unlisted`; a reachable producer for it, if one exists, is a
  // rule-post or human-lane pairing, which is REPORTED to the lead rather than invented here.
  assert.equal(out.a?.ok, true,
    `c4.birth-race: the FIRST side completes — it holds the fresh token (got ${JSON.stringify(out.a)})`);
  assert.equal(out.b?.ok, false,
    `c4.birth-race: the second side does NOT complete (got ${JSON.stringify(out.b)})`);
  assert.equal(out.b?.code, "CLR12",
    `c4.birth-race: …and it is the TIER-A books-freshness gate that stops it, before any lock is taken — which is WHY the birth-race conversion cannot be reached from this lane. If this ever stops being CLR12, the declaration above must be revisited (got ${out.b?.code}: ${out.b?.message})`);

  // WHAT REMAINS PROVABLE IS FORCED: one post, one birth, and no untyped receipt.
  assert.equal(receipts.filter((x) => x?.posted === true).length, 1,
    `c4.birth-race: exactly ONE side posts (got ${JSON.stringify(receipts.map((x) => x?.posted))})`);
  const born = await rootQuery(
    `select count(*)::int as n from clara.counterparties
      where client_id=$1 and name_normalized=lower(regexp_replace($2,'[^a-zA-Z0-9]','','g'))`,
    [A2(), name]);
  assert.equal(born.rows[0].n, 1,
    `c4.birth-race: …and exactly ONE counterparty exists for the contested name (got ${born.rows[0].n})`);
  for (const x of receipts.filter((y) => y?.posted === false)) {
    assert.ok(typeof x?.refusal?.tier === "string" && x.refusal.tier.length > 0,
      `c4.birth-race: any non-posting RECEIPT carries a typed refusal (got ${JSON.stringify(x?.refusal)})`);
    if (x.refusal.tier === "C") {
      assert.equal(x.refusal.reason, "counterparty_birth_race",
        `c4.birth-race: …and a Tier-C conversion here is THE birth-race pair (got ${JSON.stringify(x.refusal)})`);
    }
  }
  noteLane(`c4.birth-race: serialised=${out.provedBlocked}, converted=${converted.length}, loser=${out.b?.code} — (CLR23, counterparty_birth_race) is DECLARED UNREACHABLE from this lane: the Tier-A books-freshness gate pre-empts it. REPORTED with the two CLR25 pairs.`);
});

test("f-a2.c4.birth-race-human a HUMAN approve racing an agent post on ONE new counterparty (R5-B3)", async (t) => {
  if (await gateCore(t)) return;
  // WHAT THE §E BIRTH LOCK IS FOR. Both sides of `c4.birth-race` are agent posts, and both take
  // vendor(203005003) then client(203005004) before entering the delegate — a consistent order,
  // so they serialize. The HUMAN lane takes NEITHER advisory: `approve_entry` goes straight into
  // the delegate and serializes inside `uq_counterparties_identity` while holding row locks the
  // agent side needs. §E now takes 203005004 INSIDE the delegate's birth branch, before the
  // insert, so every caller of the delegate is serialized rather than this lane's own two.
  //
  // WHAT THIS CELL CAN AND CANNOT PROVE — MEASURED, NOT ASSUMED, because the difference is the
  // whole value of the cell. A mutation probe on the rig stripped the advisory from the
  // INSTALLED ninth body and re-ran this race twelve times in both orderings: ZERO deadlocks,
  // with the lock and without it, and the agent side refused CLR12 every single time. The reason
  // is asserted below rather than described: `assert_books_current` (0005:493-516) is a TIER-A
  // gate, so it fires before the agent lane takes any advisory at all, and the human side's
  // commit moves the books token first. This pairing therefore CANNOT exhibit the cycle on this
  // branch, and a cell claiming otherwise would be green for a reason unrelated to the fix.
  //
  // So the deadlock arm is DECLARED with its ground asserted positively (law 31), the durable
  // protection is §J's order guard on the installed body — the advisory must appear BEFORE the
  // insert it serializes — and what this cell forces is everything that IS reachable: no raw
  // 40P01, exactly one birth, and a typed outcome on each side.
  const name = `BIRTHRACEH ${Date.now().toString(36)} SDN BHD`;
  const agent = await agentPostable(OWNER(), { client: A2(), amount: 421000, vendor: { new: { name } } });
  const human = await agentPostable(OWNER(), { client: A2(), amount: 421500, vendor: { new: { name } } });

  const humanSide = {
    role: ROLES.authenticated, jwtSub: OWNER(),
    run: (c) => c.query(
      "select clara.approve_entry(p_entry => $1::uuid, p_expected_revision => $2::uuid, "
      + "p_attestation => $3::text, p_op_key => $4::text) as r",
      [human.args.entry, human.args.expectedRevision, "rig", opk("c4rhH")]).then((x) => x.rows[0].r),
  };
  const agentSide = {
    role: ROLES.wakeInteractive, wakeSecret: agent.cred.secret,
    run: (c) => c.query(
      "select clara.wake_post_entry(p_entry => $1::uuid, p_expected_revision => $2::uuid, "
      + "p_client => $3::uuid, p_books_version => $4::bigint, p_rationale => $5::text, "
      + "p_model => $6::jsonb, p_op_key => $7::text) as r",
      [agent.args.entry, agent.args.expectedRevision, A2(), agent.args.booksVersion,
        RATIONALE, JSON.stringify(MODEL), opk("c4rhA")]).then((x) => x.rows[0].r),
  };

  // THE DRIVER IS THE CONCURRENT ONE. `holdThenContend` runs side A to completion before B is
  // fired, so A never waits on B and the schedule cannot produce a cycle at all — `sawDeadlock`
  // under it is a question with one possible answer. `concurrentTwoSession` opens both
  // transactions and fires both statements, which is the only shape an ABBA can appear in.
  const out = await concurrentTwoSession({ a: humanSide, b: agentSide });
  assert.equal(sawDeadlock(out), false,
    `c4.birth-race-human: NEITHER side observes 40P01/40001 — a raw deadlock is not a refusal, and the wake lane has no arm for one (a=${JSON.stringify(out.a)}, b=${JSON.stringify(out.b)})`);

  // THE GROUND FOR THE DECLARATION, ASSERTED. If the agent side ever stops being pre-empted here
  // — a reordering that moved the freshness gate below the locks, say — this assertion goes RED
  // and the declaration above has to be revisited rather than quietly outliving its reason.
  assert.equal(out.b?.ok, false,
    `c4.birth-race-human: the agent side does not complete against a concurrent human approve (got ${JSON.stringify(out.b)})`);
  assert.equal(out.b?.code, "CLR12",
    `c4.birth-race-human: …and it is the TIER-A books-freshness gate that stops it, BEFORE any advisory is taken — which is why this pairing cannot reach the birth contention (got ${out.b?.code}: ${out.b?.message})`);

  // EXACTLY ONE BIRTH, which is the outcome the serialization exists to produce.
  const born = await rootQuery(
    `select count(*)::int as n from clara.counterparties
      where client_id=$1 and name_normalized=lower(regexp_replace($2,'[^a-zA-Z0-9]','','g'))`,
    [A2(), name]);
  assert.equal(born.rows[0].n, 1,
    `c4.birth-race-human: exactly ONE counterparty was born for the contested name (got ${born.rows[0].n})`);

  // AND THE HUMAN SIDE ANSWERS IN ITS OWN VOCABULARY — completed, or a typed CLR. "Some untyped
  // error" is the outcome this cell exists to forbid, so it is named rather than tolerated.
  if (out.a?.ok === false) {
    assert.match(String(out.a.code ?? ""), /^CLR\d\d$/,
      `c4.birth-race-human: the HUMAN side's failure is a typed CLR (got ${out.a.code}: ${out.a.message})`);
  }
});

test("f-a2.c4.name-only (CLR10, customer_identity_name_only) — hard constraint 12's own wall, ZERO body edits", async (t) => {
  if (await gateCore(t)) return;
  // GM-6, FORCED. The wall already carries `detail.reason`, so PR-1 edits no body — but "edits
  // no body" is not the same as "works", and the first cut of this cell proved neither: it
  // recorded a lane note when the refusal was not Tier C and fell back to asserting that
  // `customer_identity_name_only` appears in `TIER_C_PAIRS`, a constant this file also declares.
  // That is a tautology. On the one wall that enforces a HARD CONSTRAINT, the behavioural proof
  // is the whole point, so the client is now ARMED under the policy in before() and the pair is
  // asserted unconditionally.
  assert.ok(nameOnlyClient, "c4.name-only: the policy-armed client exists (mandatory setup)");
  const policy = await rootQuery(
    `select fact_value from clara.client_facts
      where client_id=$1 and fact_key='customer_identity_policy'
      order by recorded_at desc limit 1`, [nameOnlyClient]).catch(() => ({ rows: [] }));
  assert.match(JSON.stringify(policy.rows[0]?.fact_value ?? null), /name_only/,
    "c4.name-only: …and it really carries the policy, read back from the fact the trigger reads");

  const wall = await rootQuery(
    `select count(*)::int as n from pg_trigger t join pg_class c on c.oid=t.tgrelid
       join pg_namespace ns on ns.oid=c.relnamespace
      where ns.nspname='clara' and c.relname='counterparties' and not t.tgisinternal`);
  assert.ok(wall.rows[0].n > 0, "c4.name-only: the counterparties BEFORE-row wall exists in the catalog");

  // An identifier-bearing CUSTOMER birth on a client whose customers are NAME-ONLY. The coding
  // kind follows the counterparty kind: a customer on a supplier_bill is refused at the draft
  // door, one wall before the trigger this cell is aiming at.
  await ensureChart(OWNER(), nameOnlyClient);
  // The document STATES its net and its (zero) tax: B4-sales reports `not_evaluable` where the
  // components are withheld, and a Tier-B refusal never reaches the delegate the pair lives in.
  const p = await agentPostable(OWNER(), {
    client: nameOnlyClient, amount: 430000, net: 430000, tax: 0, codingKind: "sales_invoice",
    lines: salesLines(430000, 430000, 0, 0),
    vendor: { new: { name: "NAME ONLY BUYER SDN BHD", registration_no: "201901000123" }, kind: "customer" },
  });
  const r = await post(p, { booksVersion: await booksVersion(nameOnlyClient) });
  assertConverted(r, "customer_identity_name_only", "c4.name-only");
  assert.equal(await postReceiptCount(p.args.entry), 0,
    "c4.name-only: a Tier-C conversion leaves ZERO entry_post_receipts rows (C.7b)");
  assert.equal(
    (await rootQuery(
      "select count(*)::int as n from clara.counterparties where client_id=$1 and registration_normalized is not null",
      [nameOnlyClient])).rows[0].n,
    0, "c4.name-only: …and NO identifier-bearing counterparty survived the attempt — constraint 12 holds at the row, not just at the receipt");

  // THE CONTROL. Without it the refusal is indistinguishable from a client that cannot post at
  // all: the SAME shape, minus the identifier, posts.
  const clean = await agentPostable(OWNER(), {
    client: nameOnlyClient, amount: 431000, net: 431000, tax: 0, codingKind: "sales_invoice",
    lines: salesLines(431000, 431000, 0, 0),
    vendor: { new: { name: "NAME ONLY BUYER TWO SDN BHD" }, kind: "customer" },
  });
  const ok = await post(clean, { booksVersion: await booksVersion(nameOnlyClient) });
  assert.equal(ok?.posted, true,
    `c4.name-only CONTROL: a NAME-ONLY customer on the same client posts — the wall refuses the ENRICHMENT, never the customer (${JSON.stringify(ok?.refusal)})`);
});

test("f-a2.c4.clr26 the two-session race on ALL THREE Tier-A locks — the post WAITS or refuses at B9, and never reaches the delegate's CLR26 re-check", async (t) => {
  if (await gateCore(t)) return;
  // GM-7. Tier A takes THREE acquisitions before B9 — the filing `FOR SHARE`, the vendor
  // advisory 203005003 and the client advisory 203005004 — and it is all three together that
  // make the delegate's CLR26 re-check provably unreachable, which is why law 31 excludes the
  // pair. D40 is the evidence for that exclusion.
  //
  // THE FIRST CUT RACED ONE LOCK. Its contender was a DOCUMENT-scope question, which serialises
  // on the filing row and says nothing about either advisory — so two thirds of the claim was
  // resting on a cell that could not have observed them. `_open_question_blocks` takes all three
  // scope kinds, and each one contends against a DIFFERENT acquisition, so the cell now runs all
  // three contenders and asserts the same property of each.
  const sql =
    "select clara.wake_post_entry(p_entry => $1::uuid, p_expected_revision => $2::uuid, "
    + "p_client => $3::uuid, p_books_version => $4::bigint, p_rationale => $5::text, "
    + "p_model => $6::jsonb, p_op_key => $7::text) as r";

  // The VENDOR contender needs a counterparty that already EXISTS, so it is born through the
  // ordinary door first and the racing draft is then pointed at it explicitly — otherwise the
  // projection resolves `birth`, the advisory is taken on a sentinel, and the contender would be
  // racing a lock nobody else holds.
  const seedName = `C4 CLR26 VENDOR ${Date.now().toString(36)} SDN BHD`;
  const seed = await agentPostable(OWNER(), { client: A1(), vendor: { new: { name: seedName } } });
  const seeded = await post(seed);
  assert.equal(seeded?.posted, true,
    `c4.clr26: mandatory setup — the vendor-birthing post lands (${JSON.stringify(seeded?.refusal)})`);
  const cps = await counterpartyRows(A1());
  const vendorId = cps.find((c) => (c.name_display ?? c.name ?? "").includes("C4 CLR26 VENDOR"))?.id ?? null;
  assert.ok(vendorId, "c4.clr26: mandatory setup — the racing vendor exists");

  const scopes = [
    ["document", (pp) => pp.cited.documentId, "the filing row taken FOR SHARE", undefined],
    ["client", () => A1(), "the client advisory 203005004", undefined],
    ["vendor", () => vendorId, "the vendor advisory 203005003", { existing_id: vendorId }],
  ];
  for (const [scope, scopeId, lock, vendor] of scopes) {
    const p = await agentPostable(OWNER(), { client: A1(), ...(vendor ? { vendor } : {}) });
    // Read BEFORE the race: the contending session is a write, and a stale books token would
    // refuse CLR12 at Tier A before any lock is taken at all.
    const bv = await booksVersion(A1());
    const out = await holdThenContend({
      a: {
        role: ROLES.wakeInteractive, wakeSecret: p.cred.secret,
        run: (c) => c.query(sql, [p.args.entry, p.args.expectedRevision, A1(), bv,
          RATIONALE, JSON.stringify(MODEL), opk(`c4clr26post-${scope}`)]).then((x) => x.rows[0].r),
      },
      b: {
        role: ROLES.authenticated, jwtSub: OWNER(),
        run: (c) => c.query(
          "select clara.open_question(p_client => $1, p_scope_kind => $2, p_scope_id => $3, p_question => $4, p_op_key => $5) as r",
          [A1(), scope, scopeId(p), `c4.clr26 racing ${scope} question`, opk(`c4clr26q-${scope}`)]).then((x) => x.rows[0].r),
      },
    });
    const post_ = out.a;
    // THE SERIALISATION IS THE CLAIM, SO IT IS ASSERTED. `holdThenContend` already computes
    // `provedBlocked` from `pg_blocking_pids` — the first cut simply never read it, and that one
    // omission is what let all three lock-deletion mutations through: with any of the three
    // acquisitions removed the contender stops blocking, the race stops being a race, and every
    // remaining assertion below is still satisfied by a post that never contended with anything.
    assert.equal(out.provedBlocked, true,
      `c4.clr26 ${scope}: the contender BLOCKED on ${lock} — proven from pg_blocking_pids, not inferred from the outcome (got ${JSON.stringify(out)})`);
    // THE CONTENDER MUST HAVE RUN, AND SUCCEEDED. "Did not fail with a code" also accepts a
    // contender that never produced a receipt at all; the question's own success is the premise
    // that makes this a race, so it is required outright.
    assert.equal(out.b?.ok, true,
      `c4.clr26 ${scope}: the contending question really ran and SUCCEEDED (got ${JSON.stringify(out.b)}) — an unbuilt contender proves nothing about ${lock}`);
    // AND THE POST'S OUTCOME IS PINNED, NOT MERELY “not CLR26”. `post_?.ok || post_?.code !==
    // "CLR26"` is satisfied by ANY other failure — a CLR12, a timeout, a raw error — so the lane
    // could stop working entirely and this cell would still be green while reporting the absence
    // of a CLR26 nobody was in a position to raise.
    assert.equal(post_?.ok, true,
      `c4.clr26 ${scope}: the post COMPLETES while contending on ${lock} — any failure here, CLR26 or not, means the cell measured something other than the race (got ${JSON.stringify(post_)})`);
    const rec = post_.receipt;
    if (rec?.posted !== true) {
      assert.equal(rec?.refusal?.reason, "open_question_blocks",
        `c4.clr26 ${scope}: a non-posting outcome is B9's OWN token — the question won the race — and never a bare CLR26 (got ${JSON.stringify(rec?.refusal)}). If a bare CLR26 ever appears, the fallback pair (CLR26, open_question_race) becomes REQUIRED and E.2's disposition must be reopened`);
    }
    noteLane(`c4.clr26 ${scope}: contended on ${lock} — post ${post_?.ok ? JSON.stringify(post_.receipt?.posted === true ? "posted" : post_.receipt?.refusal?.reason) : post_?.code}`);
    // THE CONTENDER IS CLEANED UP, and this is not tidiness. A CLIENT-scope question left open
    // blocks B9 for EVERY later post on this client — in this file and in every file that shares
    // the database — so a cell that opened one and walked away would turn its own evidence into
    // the next cell's unexplained refusal. (Measured: it did exactly that.) The x37 idiom.
    // `holdThenContend` returns `{ ok, receipt }`; the question verb answers its own id.
    const raw = out.b?.receipt;
    const qid = typeof raw === "string" ? raw : (raw?.question_id ?? raw?.id ?? null);
    assert.ok(qid,
      `c4.clr26 ${scope}: the contending question returned an id to clean up (got ${JSON.stringify(raw)})`);
    await resolveOpenQuestion(OWNER(), {
      question: qid, resolution: `c4.clr26 ${scope}: the race is over`, opKey: opk(`c4clr26r-${scope}`),
    });
    assert.equal(
      (await rootQuery("select status from clara.open_questions where id=$1", [qid])).rows[0]?.status,
      "resolved", `c4.clr26 ${scope}: …and it really is closed, so it cannot block the next cell's B9`);
  }
});

test("f-a2.c4.dup-bill / c4.dup-sales both duplicate pairs convert", async (t) => {
  if (await gateCore(t)) return;
  // THE SALES ARM STATES ITS COMPONENTS. B4-sales reports `not_evaluable` where the fact side
  // withholds net and tax (0100:553-554), so a sales fixture that states neither never posts and
  // the duplicate it is supposed to be the first half of never exists. Measured, first run.
  for (const [kind, reason, lines, parts] of [
    ["supplier_bill", "duplicate_bill", null, {}],
    ["sales_invoice", "duplicate_sales", salesLines(440000, 440000, 0, 0), { net: 440000, tax: 0 }],
  ]) {
    // THE GRAIN IS (client, counterparty, INVOICE NUMBER), and the invoice number has to be
    // STATED on both pages for the wall to see one invoice twice. Both walls read
    // `_invoice_fact_state(document)->>'invoice_id'` and skip entirely when it is null, which is
    // what every `witnessedFiling` produced before: the first cut of this cell built two
    // documents that stated no number at all, so the duplicate simply posted.
    const invoiceId = `DUP-${kind}-${Date.now().toString(36)}`;
    const first = await agentPostable(OWNER(), { client: A2(), amount: 440000, codingKind: kind, lines, invoiceId, ...parts });
    const r1 = await post(first);
    assert.equal(r1?.posted, true,
      `c4.${reason}: mandatory setup — the FIRST ${kind} posts, or there is no duplicate to detect (${JSON.stringify(r1?.refusal)})`);
    // A second entry against the SAME (client, counterparty, invoice_id) tuple.
    const second = await agentPostable(OWNER(), { client: A2(), amount: 440000, codingKind: kind, lines, invoiceId, ...parts });
    assert.equal(
      (await rootQuery("select clara._invoice_fact_state($1)->>'invoice_id' as v", [second.cited.documentId])).rows[0].v,
      invoiceId, `c4.${reason}: mandatory setup — the second document STATES the same invoice number the first did`);
    const r2 = await post(second, { booksVersion: await booksVersion(A2()) });
    assert.equal(r2?.posted, false, `c4.${reason}: the duplicate does not post`);
    // FORCED. The cell asserts above that the second document states the SAME invoice number,
    // so "the grain the fixture built may differ from the wall's" is no longer a live doubt.
    assertConverted(r2, reason, `c4.${reason}`);
  }
});

test("f-a2.c4.closed-period (CLR19, write_into_closed_period) converts via the NON-DEFERRED t_period_wall", async (t) => {
  if (await gateCore(t)) return;
  // `t_period_wall` is `before insert or update` and therefore CATCHABLE — which is the whole
  // reason it is Tier C and not Tier D. §D.1's census cell pins that fact; this one spends it.
  const census = await rootQuery(
    `select tgdeferrable from pg_trigger where tgrelid='clara.journal_entries'::regclass and tgname='t_period_wall'`);
  assert.equal(census.rows[0]?.tgdeferrable, false,
    "c4.closed-period precondition: t_period_wall is NOT deferred — if it ever becomes deferred this pair moves to Tier D");
  // THE WALL READS `clara.fiscal_years.status`, not a `reporting_periods.state` column — there is
  // no such column, and a cell that invented one reported "could not close a period" when it had
  // simply written to the wrong relation. `_tf_period_wall` selects the FY containing the row's
  // posting_date and refuses the approved-class touch when its status is 'closing' or 'closed'.
  const p = await agentPostable(OWNER(), { client: A2(), amount: 450000 });
  const closed = await withTxnOrNull((c) => c.query(
    `insert into clara.fiscal_years(firm_id,client_id,label,starts_on,ends_on,ordinal,status,
        fy_end_source,opened_by)
     values((select firm_id from clara.clients where id=$1),$1,'c4 closed FY',
        '2026-01-01','2026-12-31',1,'closed','asserted',
        (select user_id from clara.firm_memberships fm
          join clara.clients cl on cl.firm_id=fm.firm_id and cl.id=$1 limit 1))`, [A2()]));
  assert.ok(!closed.error,
    `c4.closed-period: mandatory setup — the fiscal year is CLOSED (${closed.error?.code}: ${closed.error?.message}). Without it the pair is unproven, and a note here would green exactly that`);
  const r = await post(p);
  assertConverted(r, "write_into_closed_period", "c4.closed-period");
});

// ===========================================================================
// The three NEGATIVE contract cells.
// ===========================================================================

test("f-a2.c4.bare-clr23 a bare CLR23 from inside _assert_supplier_bill_shape_at does NOT convert — it propagates", async (t) => {
  if (await gateCore(t)) return;
  // The anti-wildcard cell. Eight bare CLR23 raises live in that body (0036:625, 654, 657, 660,
  // 675, 692, 710, 845) plus the sales analog. Converting them would give one defect two settle
  // outcomes decided by nothing an operator can see.
  //
  // WHERE THE BODY LIVES IS ITSELF A MOVING TARGET, so the cell FINDS it rather than naming it.
  // D31 splits the supplier floor: the prologue becomes the callable projected-state predicate
  // and the body moves into an `_at_projected` function, leaving the public `_at` a thin
  // delegate. A cell pinned to `_at` would then scan a two-line delegate, count ZERO bare raises,
  // and pass — the vacuous-green shape this whole battery exists to refuse. So it walks the
  // candidates newest-first and asserts it found a body with real raises in it.
  const CANDIDATES = ["_assert_supplier_bill_shape_at_projected", "_assert_supplier_bill_shape_at"];
  let floor = null;
  for (const name of CANDIDATES) {
    if (!(await fnPresent(name))) continue;
    const { src, sig } = await bodyOfName(name);
    const bare = (src ?? "").replace(/--[^\n]*/g, " ");
    const raises = [...bare.matchAll(/errcode\s*=\s*'CLR23'/g)].length;
    if (raises > 0) { floor = { name, sig, bare, raises }; break; }
  }
  assert.ok(floor,
    `c4.bare-clr23: the supplier floor's REAL body was found among ${CANDIDATES.join(" / ")} — a delegate with no raises in it means the scan is looking at the wrong function`);
  const detailed = [...floor.bare.matchAll(/errcode\s*=\s*'CLR23'[^;]*detail/g)].length;
  assert.ok(floor.raises > detailed,
    `c4.bare-clr23: ${floor.sig} still holds BARE CLR23 raises (${floor.raises} total, ${detailed} carrying a detail) — if every one grew a reason, the anti-wildcard cell would be testing nothing`);
  noteLane(`c4.bare-clr23: scanned ${floor.sig} — ${floor.raises} CLR23 raise(s), ${detailed} detailed`);

  // The BEHAVIOURAL half needs a mis-shaped entry that reached `draft`. N1 moves the shape floor
  // to draft ON THE AGENT LANE, so an agent draft of this shape is refused before it exists —
  // which is a stronger wall, not a weaker one. The lawful way to put the shape in front of the
  // POST is therefore to draft it CLEAN and doctor the lines afterwards, the rig-txn idiom for
  // forcing a deliberately-redundant wall.
  const p = await agentPostable(OWNER(), { client: A1(), codingKind: "supplier_bill" });
  const doctored = await doctorLines(p.args.entry, [
    { account_code: CHART.payable, debit_cents: 500000, credit_cents: 0, description: "c4 bare ap-dr" },
    { account_code: CHART.expense, debit_cents: 0, credit_cents: 500000, description: "c4 bare exp-cr" },
  ]);
  assert.equal(doctored.ok, true,
    `c4.bare-clr23: mandatory setup — the draft's lines are doctored into the mis-shaped form (${doctored.code}: ${doctored.message}); the behavioural half is the half that matters here`);
  // THE TOKEN MUST BE THE DOCTORED ONE. Posting with `p.args.expectedRevision` — the token read
  // BEFORE the lines were rewritten — means the post can refuse CLR06 (stale revision) and never
  // reach the shape floor at all, so a Tier-C conversion of the bare CLR23 could be sitting there
  // undetected behind a revision check. `doctorLines` hands back the current token; use it.
  const r = await post(p, { expectedRevision: doctored.revisionToken })
    .catch((e) => ({ raised: e.code, detail: e.detail, message: e.message }));
  assert.notEqual(r?.raised, "CLR06",
    `c4.bare-clr23: the post is NOT refused for a stale revision — that would mask the wall under test (got ${JSON.stringify(r)})`);
  assert.notEqual(r?.refusal?.tier, "C",
    `c4.bare-clr23: a bare CLR23 is NOT converted into a Tier-C receipt (got ${JSON.stringify(r)})`);
  // AND THE BARE RAISE REALLY PROPAGATED. "Not Tier C" is also true of a clean post, so the
  // outcome is pinned: the mis-shaped entry never posts, and nothing durable is behind it.
  assert.notEqual(r?.posted, true,
    `c4.bare-clr23: the mis-shaped entry never posts (got ${JSON.stringify(r)})`);
  assert.equal(await postReceiptCount(p.args.entry), 0,
    "c4.bare-clr23: …and no post receipt was written behind the bare raise");
});

test("f-a2.c4.unlisted an UNLISTED (errcode, reason) propagates as a task FAILURE", async (t) => {
  if (await gateCore(t)) return;
  const { src } = await bodyOfName("_agent_post_entry_core");
  assert.ok(src, "c4.unlisted: the ungranted core resolves");
  const bare = src.replace(/--[^\n]*/g, " ");
  // SCOPED TO THE HANDLER, because the whole body is not the claim. `_agent_post_entry_core`
  // carries eleven-plus unrelated `raise exception`s in its Tier-A prologue alone, so a
  // whole-body `/raise/` test stays true even if the terminal bare `raise;` this cell is named
  // for were converted into a graceful `return <receipt>` — which is exactly the fail-open the
  // cell exists to catch.
  const at = bare.search(/exception\s+when\s+others\s+then/i);
  assert.ok(at > 0,
    "c4.unlisted: the core's `exception when others then` handler is found — without it there is nothing to scope to");
  const handler = bare.slice(at);
  assert.match(handler, /if\s+not\s+v_pair\s+then\s+raise\s*;/i,
    "c4.unlisted: the handler RE-RAISES on an unlisted pair (`if not v_pair then raise;`) rather than falling through to a default receipt");
  assert.ok(!/when\s+others\s+then\s+return/i.test(bare),
    "c4.unlisted: there is no `when others then return <receipt>` arm — that would be the wildcard by another name");

  // THE PAIR SET ITSELF, AS A CLOSED SET. Two of its nine members — both CLR25s — are DECLARED
  // unreachable from this lane (B2/B3 pre-empt them, proven in c4.currency and c4.money-wall),
  // so no behavioural cell can notice if they are deleted from the classifier. The literal is
  // the only evidence available for those two, and that is stated rather than dressed up as a
  // behavioural proof: this asserts the set the CLASSIFIER tests against, which is a different
  // site from the delegate's raises the §J tail censuses.
  for (const pair of [
    "('CLR25','currency_unsupported')", "('CLR25','corroboration_contradicted')",
    "('CLR23','counterparty_landscape_moved')", "('CLR23','registration_conflict')",
    "('CLR23','counterparty_birth_race')", "('CLR10','customer_identity_name_only')",
    "('CLR21','duplicate_bill')", "('CLR21','duplicate_sales')",
    "('CLR19','write_into_closed_period')",
  ]) {
    assert.ok(src.includes(pair),
      `c4.unlisted: the classifier still admits ${pair} — E.2's closed set may only GROW, and the two CLR25 members have no behavioural cell that could notice their removal`);
  }
  noteLane("c4.unlisted: the SET MAY ONLY GROW. A new wall that arrives without joining the pair set surfaces as a task failure, which is loud and fail-closed — never a silently mis-labelled refusal");
});

test("f-a2.c4.subtxn the subtransaction rolls back the delegate's partial writes — no orphaned counterparty birth", async (t) => {
  if (await gateCore(t)) return;
  // THE FIRST CUT COULD NOT REACH A CONVERSION AT ALL, so its only live assertion was the
  // else-branch note. It leaned on `(CLR23, registration_conflict)` — which raises inside
  // `_resolve_counterparty`, BEFORE any birth — so there was never a partial write to roll back
  // and the cell proved nothing about the subtransaction.
  //
  // THE PAIR HAS TO FIRE **AFTER** THE BIRTH, and which pairs do is a measurement, not a guess.
  // Read off the live approve body by position: the birth sits at ~7.5k, the corroboration
  // contradiction at ~10.7k, the duplicate walls at ~12.1k and the approve UPDATE — where the
  // non-deferred `t_period_wall` fires — at ~15.3k. Of those, only the period wall is reachable
  // DETERMINISTICALLY behind a birth: the duplicate walls key on a counterparty that must
  // already hold an approved bill (a freshly born one holds none, by definition), and the
  // corroboration contradiction is re-read from the same STABLE resolver B3 already passed on,
  // in the same snapshot, so it cannot disagree with B3 inside one transaction.
  //
  // THE FISCAL YEAR IS 2027 AND THE CLIENT IS A1, deliberately. `c4.closed-period` above closes
  // A2's 2026, and every other fixture in the estate posts into 2026 — closing a year anything
  // else uses would make this cell a landmine for whatever runs next on the same database. 2027
  // is a year no other fixture touches, and the FY row does not exist until after the draft.
  // ORDINAL 1, because the estate enforces predecessor continuity ("fiscal year ordinal 2
  // requires its predecessor named") and A1 holds no fiscal year at all — measured, not assumed.
  const before = (await counterpartyRows(A1())).length;
  const name = `ORPHAN ${Date.now().toString(36)} SDN BHD`;
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: 460000 });
  const cred = await autodraftCred(A1());
  const d = await agentDraft(OWNER(), cred, {
    client: A1(), cited, codingKind: "supplier_bill", lines: supplierLines(460000),
    vendor: { new: { name } }, postingDate: "2027-03-15",
  });
  assert.ok(d?.entry_id, "c4.subtxn: mandatory setup — the draft naming a NEW vendor exists");
  assert.equal((await counterpartyRows(A1())).length, before,
    "c4.subtxn: mandatory setup — DRAFTING births nothing; the birth is the delegate's own write (0037:1884-1888)");

  const closed = await withTxnOrNull((c) => c.query(
    `insert into clara.fiscal_years(firm_id,client_id,label,starts_on,ends_on,ordinal,status,
        fy_end_source,opened_by)
     values((select firm_id from clara.clients where id=$1),$1,'c4 subtxn closed FY',
        '2027-01-01','2027-12-31',1,'closed','asserted',
        (select user_id from clara.firm_memberships fm
          join clara.clients cl on cl.firm_id=fm.firm_id and cl.id=$1 limit 1))`, [A1()]));
  assert.ok(!closed.error,
    `c4.subtxn: mandatory setup — the 2027 fiscal year is CLOSED (${closed.error?.code}: ${closed.error?.message})`);

  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: (await entryRow(d.entry_id))?.revision_token ?? d.revision_token,
    client: A1(), booksVersion: await booksVersion(A1()),
  });
  assertConverted(r, "write_into_closed_period", "c4.subtxn");
  const after = await counterpartyRows(A1());
  assert.equal(after.length, before,
    `c4.subtxn: a converted refusal left NO new counterparty (before=${before}, after=${after.length}) — the exception block's subtransaction took the delegate's partial writes with it`);
  assert.ok(!after.some((c) => (c.name_display ?? c.name ?? "").includes(name.split(" ")[1])),
    "c4.subtxn: …and specifically not the one the delegate had started to birth");
  assert.equal(await postReceiptCount(d.entry_id), 0, "c4.subtxn: and ZERO post-receipt rows (C.7b)");
  assert.equal((await entryRow(d.entry_id))?.status, "draft", "c4.subtxn: the entry is still a draft");

  // THE CONTROL OF THE CONTROL. Without it, "no counterparty was born" is indistinguishable from
  // a fixture whose vendor would never have been born in the first place — the absence-as-
  // evidence shape. The SAME vendor name, on a period nobody closed, must birth it.
  const ok = await agentPostable(OWNER(), { client: A1(), amount: 461000, vendor: { new: { name } } });
  const posted = await post(ok, { booksVersion: await booksVersion(A1()) });
  assert.equal(posted?.posted, true,
    `c4.subtxn CONTROL: the same vendor name posts cleanly outside the closed year (${JSON.stringify(posted?.refusal)})`);
  assert.ok((await counterpartyRows(A1())).some((c) => (c.name_display ?? c.name ?? "").includes(name.split(" ")[1])),
    "c4.subtxn CONTROL: …and THEN the counterparty exists — so the rollback above really did undo a birth that was otherwise going to happen");
});
