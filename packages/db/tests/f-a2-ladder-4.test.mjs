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
  booksVersion, opk, entryRow, counterpartyRows, postingCoreReady, holdThenContend,
  gateCore, wakePostEntry, agentPostable, agentDraft, autodraftCred, ensureChart,
  witnessedFiling, postReceiptCount, supplierLines, bodyOf, fnPresent,
  TIER_C_PAIRS, TIER_C_EXCLUDED, MODEL, RATIONALE,
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
  const src = await bodyOf("clara._agent_post_entry_core(uuid,text,uuid,bigint,text,jsonb,text)")
    ?? await bodyOf("clara._agent_post_entry_core(uuid,text,uuid,bigint,text,jsonb,text,uuid)");
  assert.ok(src, "c4.set: the core resolves at a pinned signature — a divergence here is an interface finding");
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
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: 500000 });
  await rootQuery(
    `update clara.document_regions set text_content='SGD'
      where extraction_id=$1 and field_path='invoice.currency'`, [cited.pair.textId])
    .catch((e) => noteLane(`c4.currency: could not restate the currency region (${e.code}: ${e.message})`));
  const cred = await autodraftCred(A1());
  const d = await agentDraft(OWNER(), cred, { client: A1(), cited, codingKind: "supplier_bill", lines: supplierLines(500000) });
  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: d.revision_token, client: A1(), booksVersion: await booksVersion(A1()),
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
  const p = await agentPostable(OWNER(), { client: A1(), amount: 500000 });
  await rootQuery(
    `update clara.document_regions set text_content='RM 6,000.00', monetary_cents=600000
      where extraction_id=$1 and field_path='invoice.total'`, [p.cited.pair.textId])
    .catch((e) => noteLane(`c4.money-wall: could not move the bound anchor (${e.code}: ${e.message})`));
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
  const p = await agentPostable(OWNER(), { client: A2(), amount: 410000, vendor: { new: { name: "LANDSCAPE SDN BHD" } } });
  const cps = await counterpartyRows(A2());
  const target = cps.find((c) => /LANDSCAPE/i.test(c.name_display ?? c.name ?? ""));
  if (!target) { noteLane("c4.landscape-moved: the draft bore no counterparty to move — fixture gap, wall unproven"); return; }
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
    "select clara.wake_post_entry(p_entry => $1, p_expected_revision => $2, p_client => $3, "
    + "p_books_version => $4::bigint, p_rationale => $5, p_model => $6::jsonb, p_op_key => $7) as r";
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
    "select clara.wake_post_entry(p_entry => $1, p_expected_revision => $2, p_client => $3, "
    + "p_books_version => $4::bigint, p_rationale => $5, p_model => $6::jsonb, p_op_key => $7) as r";
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
  const p = await agentPostable(OWNER(), { client: A2(), amount: 450000 });
  const closed = await rootQuery(
    `update clara.reporting_periods set state='closed'
      where client_id=$1 and $2::date between period_start and period_end returning id`,
    [A2(), "2026-03-15"]).catch((e) => {
    noteLane(`c4.closed-period: could not close a period on the rig (${e.code}: ${e.message}) — the behavioural half is unproven; the pair's membership is asserted by c4.set`);
    return { rowCount: 0 };
  });
  if (!closed.rowCount) return;
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
  assert.ok(await fnPresent("_assert_supplier_bill_shape_at"),
    "c4.bare-clr23 precondition: the callable predicate exists");
  const src = await bodyOf("clara._assert_supplier_bill_shape_at(uuid,uuid)");
  const bare = (src ?? "").replace(/--[^\n]*/g, " ");
  const raises = [...bare.matchAll(/errcode\s*=\s*'CLR23'/g)].length;
  const detailed = [...bare.matchAll(/errcode\s*=\s*'CLR23'[^;]*detail/g)].length;
  assert.ok(raises > detailed,
    `c4.bare-clr23: the body still holds BARE CLR23 raises (${raises} total, ${detailed} carrying a detail) — if every one grew a reason, the anti-wildcard cell would be testing nothing`);
  const inverted = [
    { account_code: "400-000", debit_cents: 500000, credit_cents: 0, description: "c4 bare ap-dr" },
    { account_code: "500-A01", debit_cents: 0, credit_cents: 500000, description: "c4 bare exp-cr" },
  ];
  const p = await agentPostable(OWNER(), { client: A1(), codingKind: "supplier_bill", lines: inverted });
  const r = await post(p).catch((e) => ({ raised: e.code, detail: e.detail }));
  assert.notEqual(r?.refusal?.tier, "C",
    `c4.bare-clr23: a bare CLR23 is NOT converted into a Tier-C receipt (got ${JSON.stringify(r)})`);
});

test("f-a2.c4.unlisted an UNLISTED (errcode, reason) propagates as a task FAILURE", async (t) => {
  if (await gateCore(t)) return;
  const src = await bodyOf("clara._agent_post_entry_core(uuid,text,uuid,bigint,text,jsonb,text)")
    ?? await bodyOf("clara._agent_post_entry_core(uuid,text,uuid,bigint,text,jsonb,text,uuid)");
  const bare = (src ?? "").replace(/--[^\n]*/g, " ");
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
