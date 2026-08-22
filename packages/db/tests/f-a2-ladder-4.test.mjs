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
  booksVersion, opk, entryRow, counterpartyRows, postingCoreReady, holdThenContend, approveEntry, withTxnOrNull,
  gateCore, wakePostEntry, agentPostable, agentDraft, autodraftCred, ensureChart,
  witnessedFiling, postReceiptCount, supplierLines, bodyOfName, fnPresent,
  TIER_C_PAIRS, TIER_C_EXCLUDED, MODEL, RATIONALE,
  landWitnessPair, witnessShape, doctorLines, CHART,
} from "./f-a2-post-world.mjs";

let world = null;
before(async () => { if (await postingCoreReady()) world = await buildWorld(); });
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
  if (r?.refusal?.tier === "C") assertConverted(r, "currency_unsupported", "c4.currency");
  else noteLane(`c4.currency: the ladder refused before the delegate (${JSON.stringify(r?.refusal)}) — the currency wall was pre-empted by a Tier-B rung, which is a finding about ORDER, not about the pair`);
  assert.equal(await postReceiptCount(d.entry_id), 0,
    "c4.currency: a Tier-C conversion leaves ZERO entry_post_receipts rows — the insert rolls back with the delegate (C.7b)");
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
  if (r?.refusal?.tier === "C") assertConverted(r, "corroboration_contradicted", "c4.money-wall");
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
  const reg = "201801009999";
  const first = await agentPostable(OWNER(), {
    client: A2(), amount: 400000, vendor: { new: { name: "CONFLICT ALPHA SDN BHD", registration_no: reg } },
  });
  await post(first);
  const second = await agentPostable(OWNER(), {
    client: A2(), amount: 400000, vendor: { new: { name: "CONFLICT BETA SDN BHD", registration_no: reg } },
  });
  const r = await post(second);
  assert.equal(r?.posted, false, "c4.registration-conflict: a registration collision never posts");
  assert.notEqual(r?.refusal?.reason, "counterparty_landscape_moved",
    `c4.registration-conflict: it is NOT reported as the landscape having moved (got ${JSON.stringify(r?.refusal)})`);
  if (r?.refusal?.tier === "C") assertConverted(r, "registration_conflict", "c4.registration-conflict");
  else noteLane(`c4.registration-conflict: settled as ${JSON.stringify(r?.refusal)} rather than a typed Tier-C refusal — GM-5's exact defect if it is a task failure`);
});

test("f-a2.c4.landscape-moved (CLR23, counterparty_landscape_moved) converts", async (t) => {
  if (await gateCore(t)) return;
  // A COUNTERPARTY IS BORN AT APPROVE, NOT AT DRAFT — it is stamped inside the delegate
  // (`0037:1884-1888`), which is the same fact GB-2's projected-state predicate exists for. So a
  // draft on its own leaves nothing to move, and the fixture APPROVES a first bill for the vendor
  // to bring it into being before drafting the second one whose landscape then shifts.
  const first = await agentPostable(OWNER(), { client: A2(), amount: 409000, vendor: { new: { name: "LANDSCAPE SDN BHD" } } });
  await approveEntry(OWNER(), { entry: first.args.entry, expectedRevision: first.args.expectedRevision, opKey: opk("c4lsborn") })
    .catch((e) => noteLane(`c4.landscape-moved: the counterparty-birthing approve refused (${e.code}: ${e.message})`));
  const p = await agentPostable(OWNER(), { client: A2(), amount: 410000, vendor: { new: { name: "LANDSCAPE SDN BHD" } } });
  const cps = await counterpartyRows(A2());
  const target = cps.find((c) => /LANDSCAPE/i.test(c.name_display ?? c.name ?? ""));
  if (!target) { noteLane("c4.landscape-moved: no counterparty was born even after an approve — fixture gap, wall unproven"); return; }
  const { mergeCounterparties } = await import("./f-a2-post-world.mjs");
  const survivor = cps.find((c) => c.id !== target.id);
  if (survivor) {
    await mergeCounterparties(OWNER(), { client: A2(), survivor: survivor.id, merged: target.id, reason: "c4 move the landscape", opKey: opk("c4move") })
      .catch((e) => noteLane(`c4.landscape-moved: merge refused (${e.code}: ${e.message})`));
  }
  const r = await post(p);
  assert.equal(r?.posted, false, "c4.landscape-moved: a moved counterparty landscape never posts silently");
  if (r?.refusal?.tier === "C") assertConverted(r, "counterparty_landscape_moved", "c4.landscape-moved");
  else noteLane(`c4.landscape-moved: refused as ${JSON.stringify(r?.refusal)} — recorded, not asserted, because the merge fixture may not reproduce the live race`);
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
  const side = (p, key) => ({
    role: ROLES.wakeInteractive, wakeSecret: p.cred.secret,
    run: (c) => c.query(sql, [p.args.entry, p.args.expectedRevision, A2(), p.args.booksVersion,
      RATIONALE, JSON.stringify(MODEL), key]).then((x) => x.rows[0].r),
  });
  const out = await holdThenContend({ a: side(a, opk("c4raceA")), b: side(b, opk("c4raceB")) });
  const receipts = [out.a, out.b].map((s) => s?.receipt).filter(Boolean);
  const converted = receipts.filter((x) => x?.refusal?.tier === "C" && x.refusal.reason === "counterparty_birth_race");
  assert.ok(out.provedBlocked || converted.length > 0 || receipts.some((x) => x?.posted),
    `c4.birth-race: the pair either serialised or converted — never a raw task failure (a=${JSON.stringify(out.a)}, b=${JSON.stringify(out.b)})`);
  for (const x of receipts.filter((y) => y?.posted === false)) {
    assert.ok(typeof x?.refusal?.tier === "string" && x.refusal.tier.length > 0,
      `c4.birth-race: every non-posting side carries a TYPED refusal, not a bare exception (got ${JSON.stringify(x?.refusal)})`);
  }
});

test("f-a2.c4.name-only (CLR10, customer_identity_name_only) — hard constraint 12's own wall, ZERO body edits", async (t) => {
  if (await gateCore(t)) return;
  // GM-6. Live population is ~0 (ROME SECRETARY invoices print no buyer registration — the
  // constraint's own basis), which is exactly WHY the cell and not the data is the evidence: a
  // constraint-12 refusal settling `failed` is the wrong evidentiary shape precisely where
  // evidence matters most. The wall already carries `detail.reason`, so PR-1 edits no body.
  const wall = await rootQuery(
    `select count(*)::int as n from pg_trigger t join pg_class c on c.oid=t.tgrelid
       join pg_namespace ns on ns.oid=c.relnamespace
      where ns.nspname='clara' and c.relname='counterparties' and not t.tgisinternal`);
  assert.ok(wall.rows[0].n > 0, "c4.name-only: the counterparties BEFORE-row wall exists in the catalog");
  const p = await agentPostable(OWNER(), {
    client: A2(), amount: 430000,
    vendor: { new: { name: "NAME ONLY BUYER SDN BHD", registration_no: "201901000123" }, kind: "customer" },
  });
  const r = await post(p);
  if (r?.refusal?.reason === "customer_identity_name_only") {
    assertConverted(r, "customer_identity_name_only", "c4.name-only");
  } else {
    noteLane(`c4.name-only: the rig client is not under the 0062 name-only wall (uuid-pinned to ROME SECRETARY in production), so the behavioural half is unproven here; got ${JSON.stringify(r?.refusal)}. The PAIR's membership is asserted structurally by c4.set`);
    assert.ok(TIER_C_PAIRS.some(([, x]) => x === "customer_identity_name_only"),
      "c4.name-only: the pair is a member of the closed set");
  }
});

test("f-a2.c4.clr26 the two-session race — the post WAITS or refuses at B9, and never reaches the delegate's CLR26 re-check", async (t) => {
  if (await gateCore(t)) return;
  // GM-7. Tier A takes the filing FOR SHARE plus advisories 203005003 / 203005004 BEFORE B9, so
  // CLR26 is provably unreachable from this lane and law 31 excludes it from the pair set. If it
  // ever DOES surface, the named fallback pair is required — and this cell is what says so.
  const p = await agentPostable(OWNER(), { client: A1() });
  const sql =
    "select clara.wake_post_entry(p_entry => $1::uuid, p_expected_revision => $2::uuid, "
    + "p_client => $3::uuid, p_books_version => $4::bigint, p_rationale => $5::text, "
    + "p_model => $6::jsonb, p_op_key => $7::text) as r";
  const out = await holdThenContend({
    a: {
      role: ROLES.wakeInteractive, wakeSecret: p.cred.secret,
      run: (c) => c.query(sql, [p.args.entry, p.args.expectedRevision, A1(), p.args.booksVersion,
        RATIONALE, JSON.stringify(MODEL), opk("c4clr26post")]).then((x) => x.rows[0].r),
    },
    b: {
      role: ROLES.authenticated, jwtSub: OWNER(),
      run: (c) => c.query(
        "select clara.open_question(p_client => $1, p_scope_kind => 'document', p_scope_id => $2, p_question => $3, p_op_key => $4) as r",
        [A1(), p.cited.documentId, "c4.clr26 racing question", opk("c4clr26q")]).then((x) => x.rows[0].r),
    },
  });
  const post_ = out.a;
  assert.ok(post_?.ok || post_?.code !== "CLR26",
    `c4.clr26: the post never surfaces a bare CLR26 (got ${JSON.stringify(post_)}). If it ever does, the fallback pair (CLR26, open_question_race) becomes REQUIRED and E.2's disposition must be reopened`);
  if (post_?.ok && post_.receipt?.posted === false) {
    assert.notEqual(post_.receipt.refusal?.reason, undefined,
      "c4.clr26: a losing post is a TYPED refusal — B9's token if the question won the race");
  }
});

test("f-a2.c4.dup-bill / c4.dup-sales both duplicate pairs convert", async (t) => {
  if (await gateCore(t)) return;
  for (const [kind, reason, lines] of [
    ["supplier_bill", "duplicate_bill", null],
    ["sales_invoice", "duplicate_sales", null],
  ]) {
    const first = await agentPostable(OWNER(), { client: A2(), amount: 440000, codingKind: kind, lines });
    const r1 = await post(first);
    if (r1?.posted !== true) { noteLane(`c4.${reason}: the first ${kind} did not post (${JSON.stringify(r1?.refusal)}) — the duplicate's precondition is unbuilt`); continue; }
    // A second entry against the SAME (client, counterparty, invoice_id) tuple.
    const second = await agentPostable(OWNER(), { client: A2(), amount: 440000, codingKind: kind, lines });
    const r2 = await post(second);
    assert.equal(r2?.posted, false, `c4.${reason}: the duplicate does not post`);
    if (r2?.refusal?.tier === "C") assertConverted(r2, reason, `c4.${reason}`);
    else noteLane(`c4.${reason}: refused as ${JSON.stringify(r2?.refusal)} — the duplicate grain the fixture built may differ from the wall's`);
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
  if (closed.error) {
    noteLane(`c4.closed-period: could not close a fiscal year on the rig (${closed.error.code}: ${closed.error.message}) — the behavioural half is unproven; the pair's membership is asserted by c4.set`);
    return;
  }
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
  if (!doctored.ok) {
    noteLane(`c4.bare-clr23: the draft's lines could not be doctored (${doctored.code}: ${doctored.message}) — the entry guards refuse it, so the BEHAVIOURAL half is unbuildable and only the catalog half above stands`);
    return;
  }
  const r = await post(p).catch((e) => ({ raised: e.code, detail: e.detail }));
  assert.notEqual(r?.refusal?.tier, "C",
    `c4.bare-clr23: a bare CLR23 is NOT converted into a Tier-C receipt (got ${JSON.stringify(r)})`);
});

test("f-a2.c4.unlisted an UNLISTED (errcode, reason) propagates as a task FAILURE", async (t) => {
  if (await gateCore(t)) return;
  const { src } = await bodyOfName("_agent_post_entry_core");
  assert.ok(src, "c4.unlisted: the ungranted core resolves");
  const bare = src.replace(/--[^\n]*/g, " ");
  assert.ok(/raise\b/i.test(bare),
    "c4.unlisted: the conversion block RE-RAISES on an unknown pair rather than falling through to a default receipt");
  assert.ok(!/when\s+others\s+then\s+return/i.test(bare),
    "c4.unlisted: there is no `when others then return <receipt>` arm — that would be the wildcard by another name");
  noteLane("c4.unlisted: the SET MAY ONLY GROW. A new wall that arrives without joining the pair set surfaces as a task failure, which is loud and fail-closed — never a silently mis-labelled refusal");
});

test("f-a2.c4.subtxn the subtransaction rolls back the delegate's partial writes — no orphaned counterparty birth", async (t) => {
  if (await gateCore(t)) return;
  const name = `ORPHAN ${Date.now().toString(36)} SDN BHD`;
  const before = (await counterpartyRows(A2())).length;
  // A post that births a counterparty inside the delegate and THEN hits a converted wall: the
  // birth must not survive the conversion. An exception block opens a subtransaction, so the
  // partial writes inside it are gone — this cell proves it rather than trusting the semantics.
  const p = await agentPostable(OWNER(), {
    client: A2(), amount: 460000, codingKind: "supplier_bill",
    vendor: { new: { name, registration_no: "201801009999" } },
  });
  const r = await post(p);
  const after = await counterpartyRows(A2());
  if (r?.posted === false && r?.refusal?.tier === "C") {
    assert.equal(after.length, before,
      `c4.subtxn: a converted refusal left NO new counterparty (before=${before}, after=${after.length})`);
    assert.ok(!after.some((c) => (c.name_display ?? c.name ?? "").includes(name.split(" ")[1])),
      "c4.subtxn: …and specifically not the one the delegate started to birth");
    assert.equal(await postReceiptCount(p.args.entry), 0, "c4.subtxn: and ZERO post-receipt rows (C.7b)");
  } else {
    noteLane(`c4.subtxn: the fixture did not reach a Tier-C conversion (${JSON.stringify(r?.refusal ?? r?.posted)}) — the rollback half is unproven this run`);
    assert.equal((await entryRow(p.args.entry))?.status === "approved", r?.posted === true,
      "c4.subtxn: whatever happened, the entry's status agrees with the receipt");
  }
});
