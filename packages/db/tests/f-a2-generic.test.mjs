// F-A2 PR-1 — Annex C.14: THE GENERIC LANE, and the two cells GB-1 minted.
//
// CONTRACT-BLIND, frontier-gated on `f_a2_posting_core$`.
//
// THE GENERIC LANE IS THE THINNEST-WALLED SHAPE IN THE ESTATE, and that is the premise of every
// cell here. A NULL `coding_kind` SKIPS `0016:4020-4034`'s coded-kind preconditions, has no
// direction arm, and reaches no shape floor. Three walls are all that stand between it and an
// unanchored unattended post: B4-generic (`sum(debit_cents) = total_cents`, the weakest honest
// anchor available), B14 (no AR/AP control leg) and B15 (no directional anchor). So its cells
// are GATING, not illustrative.
//
// GB-1 IS THE SHARPEST FINDING OF PR-0, and the first cell below is the gate's own attack
// fixture. `coding_kind` is a MODEL-SUPPLIED INPUT, so the kind SELECTS WHICH WALLS BIND: a
// corroborated supplier invoice drafted `coding_kind=NULL` as `Dr Expense / Cr Bank` passed ALL
// FOURTEEN of v4's rungs — B10/B11's kind gates are inert on NULL, B14 refuses only entries that
// HAVE a control leg, and B5 is vacuous because the `amount_exception` stamp is itself
// kind-gated. No wall tied the kind to the document's DIRECTION, so the lane admitted a WRONG
// POST: a phantom payment with the payable suppressed, priced nowhere. B15 closes it, and the
// cell is written so it goes RED with B15 removed, because that is the whole finding.
//
// AND D18 MUST SURVIVE ITS OWN NEW WALL. B15 narrows the generic lane; it must not close it.
// The second GB-1 cell is a genuinely generic document — direction resolves to neither sales nor
// purchase — which still POSTS when tied. Without that twin, "B15 works" would be
// indistinguishable from "generic no longer posts at all", and the contract's ruling that EVERY
// document class enters the lane (D18, superseding 7A-R7 / ADR-063) would have been quietly
// reversed by a wall nobody meant to make total.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  endPool, buildWorld, printLaneNotes, printSkipCount, noteLane, skipHere,
  booksVersion, opk, entryRow, postingCoreReady, upsertAccountClassed,
  gateCore, wakePostEntry, agentPostable, agentDraft, autodraftCred, ensureChart,
  unwitnessedFiling, admits, nonAdmitting, assertNonAdmitting, assertVectorShape,
  genericLines, suppressedPayableLines, genericWithControlLeg, CHART,
  RUNG_TOKEN, TIER_D_TOKENS, PR2_PENDING, rootQuery, addClientIdentifier,
} from "./f-a2-post-world.mjs";

let world = null;
before(async () => { if (await postingCoreReady()) world = await buildWorld(); });
after(async () => {
  printLaneNotes("f-a2-generic");
  printSkipCount("f-a2-generic");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const OWNER = () => world.users.alice;
const post = (p, over = {}) => wakePostEntry(p.cred, { ...p.args, ...over });

// ===========================================================================
// The generic lane's own three walls.
// ===========================================================================

test("f-a2.c14.skips-yet-tied a generic JV SKIPS the coded-kind preconditions and STILL cannot post untied", async (t) => {
  if (await gateCore(t)) return;
  // Both halves matter. The skip is real — a generic JV needs no counterparty, no coded shape,
  // no direction — and it is exactly why the anchor cannot also be optional.
  const tied = await agentPostable(OWNER(), {
    client: A1(), amount: 500000, codingKind: null, lines: genericLines(500000),
  });
  const good = await post(tied);
  assert.equal(good?.posted, true,
    `c14.skips-yet-tied: a document-anchored generic JV posts — the preconditions really are skipped (${JSON.stringify(good?.refusal)})`);
  assert.equal((await entryRow(tied.args.entry))?.coding_kind ?? null, null,
    "c14.skips-yet-tied: …with a NULL coding_kind, which is what makes it the generic lane rather than a coded one wearing no label");

  const untied = await agentPostable(OWNER(), {
    client: A1(), amount: 500000, codingKind: null, lines: genericLines(310000),
  });
  const bad = await post(untied);
  assertNonAdmitting(assert, bad, "B4", "c14.skips-yet-tied untied");
  assert.equal(bad.refusal.reason, RUNG_TOKEN.B4,
    "c14.skips-yet-tied: the document total is the ONLY DB-owned figure a generic entry can be held to, so failing it is `anchor_untied` and nothing softer");
});

test("f-a2.c14.no-document a generic JV with NO document refuses at Tier B", async (t) => {
  if (await gateCore(t)) return;
  // No document ⇒ no fact state ⇒ no anchor. The refusal must be a TIER-B RECEIPT, because the
  // reason has to be durable and readable: "I could not anchor this" is the single most common
  // thing an operator needs to see, and a raise would leave it in a log.
  await ensureChart(OWNER(), A1());
  const cited = await unwitnessedFiling(OWNER(), { client: A1(), gross: 500000 });
  const cred = await autodraftCred(A1());
  const d = await agentDraft(OWNER(), cred, {
    client: A1(), cited, codingKind: null, lines: genericLines(500000),
  });
  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: d.revision_token, client: A1(), booksVersion: await booksVersion(A1()),
  });
  assert.equal(r?.posted, false, "c14.no-document: it does not post");
  assert.equal(r?.refusal?.tier, "B", `c14.no-document: as a Tier-B RECEIPT, so the reason is durable (got ${JSON.stringify(r?.refusal)})`);
  assert.ok(nonAdmitting(r.rung_vector).length > 0, "c14.no-document: with at least one named non-admitting rung");
  assert.ok(!admits(r.rung_vector, "B2") || !admits(r.rung_vector, "B3") || !admits(r.rung_vector, "B4"),
    `c14.no-document: and the failure is on the corroboration/anchor family, not somewhere incidental (${JSON.stringify(r.rung_vector)})`);
});

test("f-a2.c14.tier-d a generic JV on an ENROLLED FA or advance account ABORTS at commit and settles failed", async (t) => {
  if (await gateCore(t)) return;
  // RE-CUT from BL-1's receipt cell: Tier D is where those belts live now (GM-3). The difference
  // is evidentiary, not safety — the belts still fire, they just fire at COMMIT, so the outcome
  // is a loud task failure carrying a NAMED reason rather than a typed admission verdict.
  const cost = "150-900";
  await upsertAccountClassed(OWNER(), { client: A2(), code: cost, name: "Plant at cost (c14)", type: "asset", opKey: opk("c14fa") })
    .catch((e) => noteLane(`c14.tier-d: chart seat (${e.code}: ${e.message})`));
  const { upsertFaProfile } = await import("./x41-fa-fixtures.mjs");
  const enrolled = await upsertFaProfile(OWNER(), { client: A2(), assetAccount: cost, opKey: opk("c14faprof") })
    .then(() => true)
    .catch((e) => ({ error: e }));
  // C3: FORCED. "The abort cannot be forced this run" was a green for the run that forces
  // nothing — and this cell is the only place the FA belt's Tier-D abort is exercised.
  assert.equal(enrolled, true,
    `c14.tier-d: the FA enrolment lands, so the belt has something to refuse (${enrolled?.error?.code}: ${enrolled?.error?.message})`);
  // A movement the register never held: a CREDIT to the enrolled cost account with no disposal
  // behind it. The lawful acquisition DEBIT is the shape that must POST (c3.D-fa proves that);
  // this is the genuinely unregistered one.
  const p = await agentPostable(OWNER(), {
    client: A2(), amount: 200000, codingKind: null,
    lines: [
      { account_code: CHART.bank, debit_cents: 200000, credit_cents: 0, description: "c14 unregistered dr" },
      { account_code: cost, debit_cents: 0, credit_cents: 200000, description: "c14 unregistered cr" },
    ],
  });
  let raised = null; let receipt = null;
  try { receipt = await post(p); } catch (e) { raised = e; }
  // C3: FORCED. A movement that POSTED is precisely the failure this cell exists to catch —
  // recording it as "the register may already account for it" greens the belt being absent.
  assert.notEqual(receipt?.posted, true,
    `c14.tier-d: the unregistered movement did NOT post. If the register already accounts for it the FIXTURE is wrong, and that is a finding, not a pass (${JSON.stringify(receipt?.refusal)})`);
  assert.ok(raised || receipt?.posted === false, "c14.tier-d: the unregistered movement did not post");
  if (raised) {
    assert.equal(raised.code, "CLR40",
      `c14.tier-d: a Tier-D abort raises the belt's own errcode and CANNOT be converted — an exception block opens a subtransaction and deferred triggers fire at COMMIT, outside it (got ${raised.code}: ${raised.message})`);
    const reason = /"reason"\s*:\s*"([a-z_]+)"/.exec(raised.detail ?? "")?.[1] ?? null;
    assert.ok(TIER_D_TOKENS.includes(reason),
      `c14.tier-d: …carrying a token from the CLOSED Tier-D set (got ${JSON.stringify(reason)}; an unnamed reason is a finding)`);
  } else {
    assert.notEqual(receipt?.refusal?.tier, "C",
      "c14.tier-d: a Tier-D belt is never CONVERTED into a Tier-C receipt — that would claim a catchability the deferred timing does not have");
  }
  assert.equal((await entryRow(p.args.entry))?.status, "draft",
    "c14.tier-d: and the draft survives — the abort rolls back only the POST attempt, because the draft was written in an earlier transaction");
});

// ===========================================================================
// GB-1's two cells.
// ===========================================================================

test("f-a2.c14.gb1-suppressed the SUPPRESSED-PAYABLE fixture refuses at B15 — the cell that must go RED with B15 removed", async (t) => {
  if (await gateCore(t)) return;
  // The gate's own attack fixture, rebuilt verbatim: a CORROBORATED SUPPLIER INVOICE, drafted
  // `coding_kind = NULL`, as `Dr Expense / Cr Bank`. It ties (B4-generic passes — the debit sum
  // IS the document total), it carries no control leg (B14 passes), its kind gates are inert on
  // NULL (B10/B11 pass), and B5 is vacuous because the amount_exception stamp is kind-gated.
  // Fourteen rungs, all green, one phantom payment with the payable suppressed.
  const p = await agentPostable(OWNER(), {
    client: A1(), amount: 500000, codingKind: null, kind: "invoice", typeCode: "01",
    // DIRECTIONAL on purpose, and stated at the call site so the attack is visible: the document
    // resolves to `purchase` (a named supplier who is not this client), which is exactly the
    // shape B15 must refuse a NULL-`coding_kind` entry from anchoring to.
    direction: "purchase",
    lines: suppressedPayableLines(500000),
  });
  const r = await post(p);
  assertVectorShape(assert, r?.rung_vector, "c14.gb1-suppressed");
  // The RED-with-B15-removed proof, made explicit: every OTHER rung admits. If B15 were deleted
  // the vector would be empty and this entry would POST — which is exactly what v4 did.
  const others = nonAdmitting(r?.rung_vector).filter((x) => x !== "B15");
  assert.deepEqual(others, [],
    `c14.gb1-suppressed: every rung EXCEPT B15 admits (${others.join(",")} also failed). That is the finding: without B15 the vector is empty and the wrong post lands`);
  assertNonAdmitting(assert, r, "B15", "c14.gb1-suppressed");
  assert.equal(r.refusal.reason, RUNG_TOKEN.B15,
    "c14.gb1-suppressed: and the receipt names generic_on_directional_document — the operator is told the KIND was wrong, not that some number failed");
  assert.equal((await entryRow(p.args.entry))?.status, "draft", "c14.gb1-suppressed: the phantom payment did not land");
});

test("f-a2.c14.ssm-only-resolves an SSM-ONLY client's stated registration is now TESTABLE, both ways — and neither posts generic", async (t) => {
  if (await gateCore(t)) return;
  // C6 (owner ruling, 2026-08-22). `_document_direction`'s testability rule demanded the client
  // hold BOTH a tin and an ssm before a stated supplier registration counted — and 0049's own
  // comment concedes "a real Malaysian client typically has its ssm recorded and no LHDN TIN, so
  // this limb will usually NOT fire". When it did not fire, a stated identity fell out as
  // `evidence:"none"`, the tri-state flattened it to 'unresolved', and B15 admitted the generic
  // lane. This cell is RED against that body in BOTH directions.
  const client = A1();
  await ensureChart(OWNER(), client);
  // SSM ONLY — and the absence of the tin is ASSERTED, because it is the whole premise.
  await addClientIdentifier(OWNER(), { client, kind: "ssm", value: "200501006001" }).catch(() => {});
  const kinds = (await rootQuery(
    `select coalesce(array_agg(distinct kind order by kind), '{}') as k
       from clara.client_identifiers where client_id=$1 and kind in ('tin','ssm')`, [client])).rows[0].k;
  assert.deepEqual(kinds, ["ssm"],
    `c14.ssm-only-resolves: the client holds SSM and no TIN — the exact shape the old both-kinds rule could not test (got ${JSON.stringify(kinds)})`);

  // (a) THE CLIENT'S OWN SSM, with a matching name -> sales.
  const sales = await agentPostable(OWNER(), {
    client, amount: 310000, codingKind: null, lines: suppressedPayableLines(310000),
    direction: "ssm-sales",
  });
  assert.equal(
    (await rootQuery("select clara._direction_class($1,$2,null) as v", [sales.cited.documentId, client])).rows[0].v,
    "sales", "c14.ssm-only-resolves: an SSM-only client CAN now test its own registration — the page resolves 'sales'");
  const rs = await post(sales);
  assert.equal(rs?.posted, false, `c14.ssm-only-resolves: …and a generic JV on it does not post (${JSON.stringify(rs?.refusal)})`);
  assert.ok(!admits(rs?.rung_vector, "B15"), "c14.ssm-only-resolves: …refused at B15");

  // (b) A THIRD PARTY's ssm-shaped registration -> testable, no match, purchase.
  const purchase = await agentPostable(OWNER(), {
    client, amount: 311000, codingKind: null, lines: suppressedPayableLines(311000),
    direction: "ssm-purchase",
  });
  assert.equal(
    (await rootQuery("select clara._direction_class($1,$2,null) as v", [purchase.cited.documentId, client])).rows[0].v,
    "purchase", "c14.ssm-only-resolves: a third-party ssm is TESTED and misses — the page resolves 'purchase'");
  const rp = await post(purchase, { booksVersion: await booksVersion(client) });
  assert.equal(rp?.posted, false, `c14.ssm-only-resolves: …and that generic JV does not post either (${JSON.stringify(rp?.refusal)})`);
  assert.ok(!admits(rp?.rung_vector, "B15"), "c14.ssm-only-resolves: …refused at B15");
});

test("f-a2.c14.untestable-refuses a stated registration of a kind the client has NOT recorded refuses generic_registration_untestable", async (t) => {
  if (await gateCore(t)) return;
  // C6-rider, fail-closed. The page states a TIN-SHAPED registration; the client records only an
  // ssm, so the claim is neither a match nor a miss — it cannot be CHECKED. Under the old rule
  // that fell out as `evidence:"none"` and B15 admitted it. It now has its own evidence class and
  // its own refusal reason, because "this document is directional" and "this document states an
  // identity nobody could check" are different findings with different remedies: the second is
  // fixed by recording the client's TIN.
  const client = A2();
  await ensureChart(OWNER(), client);
  await addClientIdentifier(OWNER(), { client, kind: "ssm", value: "200501006002" }).catch(() => {});
  const kinds = (await rootQuery(
    `select coalesce(array_agg(distinct kind order by kind), '{}') as k
       from clara.client_identifiers where client_id=$1 and kind in ('tin','ssm')`, [client])).rows[0].k;
  assert.ok(kinds.includes("ssm") && !kinds.includes("tin"),
    `c14.untestable-refuses: the client records an ssm and NO tin (got ${JSON.stringify(kinds)})`);

  const p = await agentPostable(OWNER(), {
    client, amount: 312000, codingKind: null, lines: suppressedPayableLines(312000),
    direction: "untestable",
  });
  assert.equal(
    (await rootQuery("select clara._direction_class($1,$2,null) as v", [p.cited.documentId, client])).rows[0].v,
    "untestable",
    "c14.untestable-refuses: the class is UNTESTABLE — distinct from 'absent', which is the whole point");
  const r = await post(p, { booksVersion: await booksVersion(client) });
  assert.equal(r?.posted, false, `c14.untestable-refuses: it does not post (${JSON.stringify(r?.refusal)})`);
  assert.ok(!admits(r?.rung_vector, "B15"), "c14.untestable-refuses: …refused at B15");
  assert.equal(r?.refusal?.reason, "generic_registration_untestable",
    `c14.untestable-refuses: …under its OWN reason, not the directional one — an operator has to be able to tell them apart (got ${JSON.stringify(r?.refusal)})`);
});

test("f-a2.c14.gb1-contradiction a document whose PARTIES CONTRADICT refuses at B15 — the second door GB-1 left open", async (t) => {
  if (await gateCore(t)) return;
  // C1, and it is the same class of hole as the suppressed payable one cell above. 0049 raises
  // CLR30 for two entirely different reasons — "nobody is identified" (`evidence:"none"`) and
  // "the parties CONTRADICT each other" (`evidence:"contradiction"`) — and
  // `_autodraft_direction_tri` flattens both into the single string 'unresolved'. B15 passed
  // everything that was not 'sales' or 'purchase', so a CORROBORATED document with contradictory
  // parties posted as `Dr Expense / Cr Bank`: the client's own sales invoice booked as an
  // expense, plus a phantom payment. Nothing else in the ladder reads identity — corroboration
  // carries no identity term, the Tier-C identity pairs need a model-PROPOSED counterparty a
  // generic entry does not supply, and the direction-family arm is kind-gated.
  //
  // THE FIXTURE IS THE ORDINARY CASE, not an exotic one: 0049:924 is a page stating a supplier
  // REGISTRATION that IS this client's under a NAME that is not — "Rome Properties" against
  // "Rome Properties Sdn Bhd".
  await ensureChart(OWNER(), A2());
  await addClientIdentifier(OWNER(), { client: A2(), kind: "ssm", value: "200301000924" }).catch(() => {});
  await addClientIdentifier(OWNER(), { client: A2(), kind: "tin", value: "200301000924" }).catch(() => {});
  const p = await agentPostable(OWNER(), {
    client: A2(), amount: 300000, codingKind: null, lines: suppressedPayableLines(300000),
    direction: "contradiction",
  });
  const r = await post(p);

  // THE COLLAPSE IS THE CAUSE, asserted rather than described: the tri-state STILL answers
  // 'unresolved' on this very document. Without this half the cell cannot say that B15's old
  // reading was what let it through.
  const tri = (await rootQuery(
    "select clara._autodraft_direction_tri($1,$2) as v", [p.cited.documentId, A2()])).rows[0].v;
  assert.equal(tri, "unresolved",
    "c14.gb1-contradiction: _autodraft_direction_tri STILL flattens the contradiction to 'unresolved' — that collapse is exactly what B15 used to admit, and it is unchanged by this fix");
  const klass = (await rootQuery(
    "select clara._direction_class($1,$2,null) as v", [p.cited.documentId, A2()])).rows[0].v;
  assert.equal(klass, "contradiction",
    "c14.gb1-contradiction: …while the CLASS B15 now reads says 'contradiction' — the two readers disagree, and that difference is the whole fix");

  assert.equal(r?.posted, false,
    `c14.gb1-contradiction: a contradicted document NEVER posts as a generic JV (${JSON.stringify(r?.refusal)})`);
  assert.ok(!admits(r?.rung_vector, "B15"),
    `c14.gb1-contradiction: …and B15 is the rung that refuses it (vector ${JSON.stringify(r?.rung_vector)})`);
  assert.equal(r?.refusal?.reason, RUNG_TOKEN.B15,
    `c14.gb1-contradiction: …naming Annex E.2's B15 token (got ${JSON.stringify(r?.refusal)})`);
});

test("f-a2.c14.gb1-twin the DIRECTION-UNRESOLVED twin still POSTS when tied — D18 survives its own new wall", async (t) => {
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), {
    client: A2(), amount: 505000, codingKind: null, direction: "unresolved",
    lines: genericLines(505000),
  });
  const r = await post(p);
  assert.ok(admits(r?.rung_vector, "B15"),
    `c14.gb1-twin: B15 admits where the document's direction resolves to NEITHER sales nor purchase (got ${JSON.stringify(r?.rung_vector?.B15)})`);
  assert.equal(r?.posted, true,
    `c14.gb1-twin: and it POSTS. Without this twin, "B15 works" would be indistinguishable from "generic no longer posts at all" (${JSON.stringify(r?.refusal)}, non-admitting ${nonAdmitting(r?.rung_vector).join(",")})`);
});

test("f-a2.c14.silent-posts C6's CONTROL — a page that prints NO registration is still SILENT, and still posts", async (t) => {
  if (await gateCore(t)) return;
  // THE BOUNDARY C6 MUST NOT CROSS. C6 narrows D18: a stated identity that cannot be checked now
  // refuses. D18 itself stands — a document that says nothing about who supplied it is still
  // 'absent', and a tied generic JV on it still posts. Without this control, "C6 works" would be
  // indistinguishable from "the generic lane is closed", which is a different (and unruled)
  // change. `c14.gb1-twin` posts on the same silence; this cell exists to assert the PREMISE the
  // twin leaves implicit, so a fixture drift that starts printing a registration turns this red
  // instead of quietly retargeting both cells at some other shape.
  const client = A2();
  const p = await agentPostable(OWNER(), {
    client, amount: 507000, codingKind: null, direction: "unresolved", lines: genericLines(507000),
  });
  // THE PREMISE IS READ THROUGH THE RESOLVER'S OWN PROJECTION — the same `document_regions`
  // rows, reached through the same `_document_facts_extraction` selector 0049 uses — rather
  // than through some other table that merely sounds like the one it reads (law 3).
  const stated = await rootQuery(
    `select coalesce(array_agg(distinct r.field_path order by r.field_path), '{}') as f
       from clara.document_regions r
      where r.extraction_id = clara._document_facts_extraction($1)
        and r.field_path in ('invoice.vendor_registration','invoice.vendor_name')`, [p.cited.documentId]);
  assert.deepEqual(stated.rows[0].f, [],
    `c14.silent-posts: the page states NO vendor identity at all — that is the premise, and it is asserted, not assumed (got ${JSON.stringify(stated.rows[0].f)})`);
  assert.equal(
    (await rootQuery("select clara._direction_class($1,$2,null) as v", [p.cited.documentId, client])).rows[0].v,
    "absent",
    "c14.silent-posts: silence classes as ABSENT — not 'untestable', which is what C6 added and what a page with nothing to test must never be given");
  const r = await post(p, { booksVersion: await booksVersion(client) });
  assert.ok(admits(r?.rung_vector, "B15"),
    `c14.silent-posts: B15 admits it (got ${JSON.stringify(r?.rung_vector?.B15)})`);
  assert.equal(r?.posted, true,
    `c14.silent-posts: and it POSTS — D18 is narrowed by C6, not reversed (${JSON.stringify(r?.refusal)}, non-admitting ${nonAdmitting(r?.rung_vector).join(",")})`);
});

test("f-a2.c14.b14-interlock B14 and B15 are COHERENT — a directional invoice needs a control leg, and generic may carry none", async (t) => {
  if (await gateCore(t)) return;
  // "Both narrow the generic lane, and OQ-5 says so." B15 makes B14 coherent: a directional
  // invoice NEEDS a control leg and B14 forbids generic entries from carrying one, so
  // generic-on-directional was always a contradiction. The cell shows the contradiction being
  // refused from BOTH ends rather than asserting the sentence.
  const withLeg = await agentPostable(OWNER(), {
    client: A1(), amount: 506000, codingKind: null, kind: "invoice", typeCode: "01",
    direction: "purchase",
    lines: genericWithControlLeg(506000),
  });
  const r = await post(withLeg);
  const failed = nonAdmitting(r?.rung_vector);
  assert.ok(failed.includes("B14") || failed.includes("B15"),
    `c14.b14-interlock: a generic entry on a DIRECTIONAL document carrying a CONTROL LEG fails at least one of the two — it is a contradiction from both ends (non-admitting: ${failed.join(",")})`);
  assert.equal(r?.posted, false, "c14.b14-interlock: and it does not post");
  noteLane("c14: OQ-5's THREE populations §6 must report — (1) untieable generic JVs that land as drafts, (2) generic entries that would have carried a control leg (B14), (3) generic entries refused at B15 for anchoring to a directional document. These cells force one of each");
});

// ===========================================================================
// GM-10's re-admit door — PR-2's cell, recorded here so the obligation is visible in a run.
// ===========================================================================

test("f-a2.c14.readmit GM-10's re-admit door after withdrawal — a PR-2 DESIGN OBLIGATION, not authored by this lane", async (t) => {
  skipHere(t, `${PR2_PENDING} — GM-10's re-admission door does not exist yet, and this cell belongs to PR-2`);
  // WRITTEN OUT so a later reader does not have to reconstruct it. v4 claimed `entry.revised`
  // re-admitted a human-revised draft for a fresh agent read. That is FALSE at the bytes:
  // `revise_entry` does emit the event, but NO coding-lane reader keys on it — the event
  // re-admits nothing. And once the human's draft is WITHDRAWN (which the double-coding wall
  // makes a precondition for OQ-4's exit 2), a fresh sweep on that filing is refused
  // `already_done` by the gate `0053` installed ON PURPOSE to stop duplicate sweeps.
  //
  // So exit 2 has no mechanical door today, and PR-2 must build one: a deliberate, AUDITED
  // re-admission after withdrawal that does NOT weaken `0053`'s duplicate-sweep gate. The cell
  // PR-2 owes is PAIRED, and both halves are required:
  //   (a) after a withdrawal through the re-admit door, the document IS re-read by the agent;
  //   (b) an ORDINARY repeat sweep on an already-done filing is STILL refused `already_done`.
  // A door that opened (a) by weakening the gate would pass (a) and fail (b) — which is exactly
  // why the pair, and not (a) alone, is the obligation.
  //
  // The RULING is untouched by any of this. What changed at the gate is that the mechanism is
  // WORK, not an existing capability, and pretending otherwise would have shipped a ruled exit
  // nobody could take. f-a2-ladder.test.mjs's `c2.A8-exit2` proves the POST half is lawful once
  // a fresh draft exists; this cell is the missing DOOR to that draft.
});
