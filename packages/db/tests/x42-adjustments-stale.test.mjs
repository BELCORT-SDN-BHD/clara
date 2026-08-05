// 0042 Wave D-b — the ADJUSTMENT-TEMPLATE battery, part 2: ARM (2)'s SEVEN approve-time
// re-validation axes (design §2.6, token CLR39 `adjustment_stale`) plus the two D-a
// defect classes hunted BY NAME (design §8): FROZEN-SNAPSHOT reads and ROW-SHAPE
// dispatch.
//
// Arm (2) exists because a proposal can sit in the maker-checker window while the world
// moves: the template retires, its lines change, an account gets reserved, the period
// stops being valid, or the stamp itself is tampered with. Four of the seven axes are
// only reachable against a TAMPERED stamp (no verb writes `flags` or `origin`, and
// `revise_entry` refuses every D-b proposal flag by design), so those cells stage the
// tamper by superuser surgery — see the x42-adj-helpers.mjs header for why each shape
// has no verb-reachable route.
//
// CONTRACT-BLIND (see the x42-adj-core.mjs header): authored from the design + ABI only.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, getPool, rootQuery, namedCall, opk, endPool, printLaneNotes, printSkipCount,
  noteLane, x42EnsureReady, skip42, refuses, refusesAxis, caught, reasonToken,
  T, CLR39, STALE_AXES,
  EXPA, EXPB, ACCR, PREP, FAACC, FAEXP, mon, addDays, dayIn,
  runManual, enrolAdvance, upsertFaProfile, accrualLines, prepaymentLines,
  adjWorld, freshAdjClient, liveTemplate, approveDraft,
  entryRowOf, mirrorOf, receiptForEntry, stampedEntries, runRowsForTemplate, eventCount, firmOfClient,
  firmThresholdOf, templateRow, retireTemplateRaw, forgeEntryColumns, forgeStamp,
  forgeOpReceiptHash,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});

after(async () => {
  printLaneNotes("x42-adjustments-stale");
  printSkipCount("x42-adjustments-stale");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b approve-time staleness battery");

/** A live template plus ONE outstanding occurrence draft for `period` — the shape every
 *  arm-(2) cell tampers with. Returns everything a forge needs. */
async function stagedDraft(label, { period = mon(-3), start = mon(-3).start, ...over } = {}) {
  const client = await freshAdjClient(label);
  const tpl = await liveTemplate({ client, label, start, ...over });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: period.start, periodEnd: period.end });
  assert.equal(r.status, "drafted", `${label}: the staged occurrence really is a DRAFT`);
  const e = await entryRowOf(r.entry_id);
  return {
    client, tpl, period, entry: r.entry_id, row: e,
    firm: await firmOfClient(client), opKey: e.flags.recurring_adjustment.op_key,
  };
}

/** Approving must have changed NOTHING: still a draft, no receipt, no mirror. */
async function assertNothingMaterialised(s, label) {
  assert.equal((await entryRowOf(s.entry)).status, "draft", `${label}: the occurrence is still a DRAFT`);
  assert.equal(await receiptForEntry(s.entry), null, `${label}: no adjustment_runs receipt was minted`);
  assert.equal(await mirrorOf(s.entry), null, `${label}: no auto-reversal mirror was born`);
}

// ===========================================================================
// x42.s — ARM (2): the seven axes, in the design's own §2.6 order.
// ===========================================================================

test("x42.s1 arm (2) axes 1–4: a tampered origin, a broken issuer op-receipt, a template retired under the draft, and a changed line set each refuse CLR39 adjustment_stale by axis", async (t) => {
  if (skipHere(t)) return;

  // (1) ORIGIN — the proposal must still say it came from the scheduled poster.
  const a = await stagedDraft("s1origin");
  await forgeEntryColumns(a.entry, { origin: "manual" });
  await refusesAxis(() => approveDraft(w.users.alice, a.entry), T.adjustmentStale, ["origin"],
    "approving an occurrence whose origin was moved off 'scheduled_run'", { code: CLR39 });
  await assertNothingMaterialised(a, "the origin axis");

  // (2) ISSUER OP-RECEIPT — the hook re-derives the request hash from client+template+
  // period (design §2.6) and must find the poster's own receipt behind the stamp.
  const b = await stagedDraft("s1issuer");
  await forgeOpReceiptHash(b.firm, b.opKey, { garbage: true });
  await refusesAxis(() => approveDraft(w.users.alice, b.entry), T.adjustmentStale, ["issuer_receipt"],
    "approving an occurrence whose issuing op-receipt no longer binds its own request", { code: CLR39 });
  await assertNothingMaterialised(b, "the issuer_receipt axis");

  // (3) TEMPLATE RETIRED — SURGERY 3: the verb refuses to retire while this very draft
  // is outstanding, so the only way into this axis is an out-of-band retire.
  const c = await stagedDraft("s1retired");
  await retireTemplateRaw(c.tpl.id, w.users.hana);
  await refusesAxis(() => approveDraft(w.users.alice, c.entry), T.adjustmentStale, ["template_retired"],
    "approving an occurrence of a template that is no longer live", { code: CLR39 });
  await assertNothingMaterialised(c, "the template_retired axis");

  // (4) LINES CHANGED — the draft's line set must still be byte-equal to the template's.
  // Moving ONE line's account (debit→a different expense) keeps the entry balanced, so
  // only the byte-equality rule can catch it.
  const d = await stagedDraft("s1lines");
  const moved = await rootQuery(
    `update clara.journal_lines set account_code = $3
      where entry_id = $1 and account_code = $2 returning line_no`,
    [d.entry, EXPA, EXPB]);
  assert.equal(moved.rowCount, 1, "exactly one line moved account (the entry stays balanced)");
  await refusesAxis(() => approveDraft(w.users.alice, d.entry), T.adjustmentStale, ["lines_changed"],
    "approving an occurrence whose lines no longer match the signed template", { code: CLR39 });
  await assertNothingMaterialised(d, "the lines_changed axis");
});

test("x42.s2 arm (2) axis 5: an occurrence whose stamped period is no longer cadence-valid refuses adjustment_stale/period_invalid — with the issuer receipt re-derived so the EARLIER axis cannot mask it", async (t) => {
  if (skipHere(t)) return;
  const s = await stagedDraft("s2period");
  const badStart = dayIn(s.period, 7); // no longer a month START
  const badEnd = addDays(s.period.end, -2); // no longer a month END

  // Re-derive the poster's op-receipt hash for the FORGED period through the DB's own
  // `clara._hash` over ABI §E's literal field set, so axis (2) is satisfied and axis (5)
  // is what the cell actually measures. If the refusal comes back as `issuer_receipt`
  // instead, ABI §E's hash-field pin has diverged from the as-built — a finding, and the
  // assertion below says so by name.
  await forgeStamp(s.entry, { period_start: badStart, period_end: badEnd });
  await forgeOpReceiptHash(s.firm, s.opKey, {
    client: s.client, template: s.tpl.id, ps: badStart, pe: badEnd });

  await refusesAxis(() => approveDraft(w.users.alice, s.entry), T.adjustmentStale, ["period_invalid"],
    "approving an occurrence whose stamped period is not cadence-aligned", { code: CLR39 });
  await assertNothingMaterialised(s, "the period_invalid axis");
});

test("x42.s3 arm (2) axis 6: a mode='post' stamp is refused when the forced-draft predicate or is_high_stakes NOW holds — the hook never trusts the stamp it is handed", async (t) => {
  if (skipHere(t)) return;

  // (a) THE CATCH-UP ARM. The template was signed TODAY, so this period is catch-up and
  // WDB-G4 forces a draft; a 'post' stamp on it is a lie the hook must catch.
  const a = await stagedDraft("s3catchup", { cents: 55_000 });
  assert.equal(a.row.flags.recurring_adjustment.mode, "draft", "the poster itself stamped 'draft'");
  await forgeStamp(a.entry, { mode: "post" });
  await refusesAxis(() => approveDraft(w.users.alice, a.entry), T.adjustmentStale, ["mode"],
    "approving a mode='post' stamp whose period is catch-up (WDB-G4)", { code: CLR39 });
  await assertNothingMaterialised(a, "the mode axis (catch-up)");

  // (b) THE HIGH-STAKES ARM. Backdating the signature takes catch-up out of the picture,
  // so the ONLY thing forcing this occurrence to draft is its amount (WCA-R7).
  const client = await freshAdjClient("s3hs");
  const threshold = await firmThresholdOf(client);
  const cents = threshold + 250_000;
  const tpl = await liveTemplate({
    client, label: "s3hs", start: mon(-4).start, cents,
    lines: accrualLines(cents, { debit: EXPB, credit: ACCR }), backdateSignTo: mon(-5).end });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: mon(-4).start, periodEnd: mon(-4).end });
  assert.equal(r.status, "drafted", "a high-stakes occurrence drafts even off the catch-up path");
  await forgeStamp(r.entry_id, { mode: "post" });
  // alice is DISTINCT from the signer (hana), so CLR05's distinct-checker arm is clear
  // and the refusal that lands is arm (2)'s, not maker-checker's.
  await refusesAxis(() => approveDraft(w.users.alice, r.entry_id), T.adjustmentStale, ["mode"],
    "approving a mode='post' stamp on a HIGH-STAKES occurrence", { code: CLR39 });
  assert.equal((await entryRowOf(r.entry_id)).status, "draft", "…and the entry is still a draft");
  assert.equal(await receiptForEntry(r.entry_id), null, "…with no receipt minted");
});

test("x42.s4 arm (2) axis 7: an account reserved DURING the draft window refuses adjustment_stale/line_eligibility — and on an auto_reverse occurrence it RAISES rather than skipping (the sole soft-birth immunity, §2.6 arm 0)", async (t) => {
  if (skipHere(t)) return;

  // AUTO_REVERSE path. Arm (0) exists only to keep arm (2) off the mirror; eligibility is
  // carried by §2.1 ALONE, so a violation must RAISE and no half-pair may commit.
  const client = await freshAdjClient("s4auto");
  const tpl = await liveTemplate({
    client, label: "s4auto", start: mon(-3).start, cents: 65_000,
    lines: prepaymentLines(65_000, { asset: PREP, expense: EXPA }), autoReverse: true });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: mon(-3).start, periodEnd: mon(-3).end });
  assert.equal(r.status, "drafted", "the auto_reverse occurrence drafts (ramp + catch-up)");

  // The reservation is a LAWFUL act by a real verb — the enrolment floor is admin+ and
  // the prepayment account's approved GL balance is still zero (the occurrence is a draft).
  await enrolAdvance(w.users.hana, { client, accountCode: PREP, personLabel: "x42 s4 staff" });
  const elig = await refusesAxis(() => approveDraft(w.users.alice, r.entry_id), T.adjustmentStale, ["line_eligibility"],
    "approving an occurrence whose account was enrolled as a staff advance mid-window", { code: CLR39 });
  // BOTH ALTITUDES, pinned together — this is a REGRESSION PIN for the defect the first
  // integration run exposed, not an ABI requirement. ABI §F pins only the outer `axis`
  // (line_eligibility, one of arm (2)'s seven). The build additionally reports WHICH
  // eligibility rule broke via a second key, and the two were originally merged with jsonb
  // `||` in the order that let the inner object's own `axis` overwrite the outer one — so
  // `axis` came back as `account_reserved` on 100% of arm-(2g) refusals and the ABI-named
  // token was never observable. Asserting both keys locks the two-altitude shape: the outer
  // axis stays the ABI's, the inner detail survives beside it, and neither can swallow the
  // other again. `eligibility_axis` is a build-introduced key — if a later design names it,
  // promote this into ABI §F rather than leaving it a bare test-side pin.
  // `err.detail` is the raw Postgres DETAIL string, not a parsed object — read it the way
  // axisOf does, with a regex, or this assertion silently reads undefined and proves nothing.
  assert.equal(
    /"eligibility_axis"\s*:\s*"([a-z0-9_]+)"/.exec(String(elig?.detail ?? ""))?.[1] ?? null,
    "account_reserved",
    "…and the inner eligibility vocabulary survives BESIDE the ABI axis (regression pin: the " +
    "jsonb merge must not let either altitude overwrite the other)");
  assert.equal((await entryRowOf(r.entry_id)).status, "draft", "the occurrence is still a draft");
  assert.equal(await mirrorOf(r.entry_id), null,
    "NO mirror committed — an eligibility violation raises on the auto-reversal path too, never skips");
  assert.equal(await receiptForEntry(r.entry_id), null, "…and no receipt exists");

  // SOLO path, reserved through the OTHER door (an FA profile) — the rule is the shared
  // `_acct_role_reserved` union, not one enrolment kind.
  const c2 = await freshAdjClient("s4solo");
  const t2 = await liveTemplate({
    client: c2, label: "s4solo", start: mon(-3).start, cents: 44_000,
    lines: prepaymentLines(44_000, { asset: PREP, expense: EXPA }) });
  const r2 = await runManual(w.users.bob, {
    client: c2, template: t2.id, periodStart: mon(-3).start, periodEnd: mon(-3).end });
  await upsertFaProfile(w.users.alice, {
    client: c2, assetAccount: PREP, accumAccount: FAACC, expenseAccount: FAEXP });
  await refusesAxis(() => approveDraft(w.users.alice, r2.entry_id), T.adjustmentStale, ["line_eligibility"],
    "approving an occurrence whose account was enrolled as an FA COST account mid-window", { code: CLR39 });

  noteLane(`x42.s4: arm (2)'s axis vocabulary asserted across s1–s4 = ${STALE_AXES.join(", ")}`);
});

// ===========================================================================
// x42.z — THE TWO D-a DEFECT CLASSES, hunted by name (design §8).
// ===========================================================================

/** Two human sessions run the SAME (template, period) on a forced schedule: A takes its
 *  locks and holds them, B blocks behind them, A commits, B resolves. A poster that
 *  snapshots its admission reads BEFORE its rung would let B mint a second occurrence
 *  for a pair A has already taken — the frozen-snapshot class. */
async function racePoster({ client, template, period, subA, subB }) {
  const call = namedCall("run_adjustment_manual", [
    { name: "p_client" }, { name: "p_template" },
    { name: "p_period_start", cast: "date" }, { name: "p_period_end", cast: "date" },
    { name: "p_op_key" }]);
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null };
  const open = async (c, sub) => {
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("begin");
    await c.query("set local statement_timeout = '15000ms'"); // a genuine deadlock surfaces, never hangs
    await c.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub, role: "authenticated" })]);
  };
  try {
    await open(c1, subA);
    await c1.query(call, [client, template, period.start, period.end, opk("x42raceA")]);
    out.a = { ok: true };
    await open(c2, subB);
    const p2 = c2.query(call, [client, template, period.start, period.end, opk("x42raceB")])
      .then(() => { out.b = { ok: true }; })
      .catch((e) => { out.b = { ok: false, code: e.code, reason: reasonToken(e), message: e.message }; });
    await c1.query("commit");
    await p2;
    await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {}); // RESET ALL does NOT reset the role
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  return out;
}

test("x42.z1 the FROZEN-SNAPSHOT class: two concurrent posters on one (template, period) leave EXACTLY ONE occurrence — the loser re-reads under the rung and refuses CLR38", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("z1");
  const tpl = await liveTemplate({ client, label: "z1", start: mon(-3).start, cents: 51_000 });
  const period = mon(-3);

  const race = await racePoster({
    client, template: tpl.id, period, subA: w.users.bob, subB: w.users.grace });
  assert.equal(race.a?.ok, true, "the first session posted its occurrence");
  assert.equal(race.b?.ok, false,
    `the second session must be REFUSED, not admitted (it reported ${JSON.stringify(race.b)})`);
  assert.equal(race.b.code, "CLR38",
    `…on the poster's own admission family (got ${race.b.code} — ${race.b.message})`);
  assert.ok([T.periodAlreadyMet, T.occurrenceDraftOutstanding].includes(race.b.reason),
    `…naming period_already_met or occurrence_draft_outstanding (got '${race.b.reason}')`);

  const occ = await stampedEntries(tpl.id, "occurrence");
  assert.equal(occ.length, 1,
    `EXACTLY ONE occurrence exists for (${tpl.id}, ${period.key}) — a frozen pre-lock read would have minted two (got ${occ.length})`);
  assert.equal(occ[0].flags.recurring_adjustment.period_start, period.start, "…and it is the requested period");

  // The oracle must agree with the books the instant the winner commits.
  const after = await stampedEntries(tpl.id);
  assert.equal(after.length, 1, "…and no orphan stamped entry of any role survived the losing session");
});

test("x42.z2 the ROW-SHAPE-DISPATCH class: a malformed recurring_adjustment stamp mints NOTHING, and a stamp naming ANOTHER client's template is refused rather than misdispatched", async (t) => {
  if (skipHere(t)) return;

  // (a) + (b) Edge shapes: an EMPTY stamp and an explicitly NULL one. A helper that
  // dispatches on `flags ? 'recurring_adjustment'` (rather than on a validated role)
  // would fall through every arm and approve a flagged entry with no receipt, no mirror
  // and no event — a silent adjustment. Whatever the disposition, the invariant is that
  // NOTHING of the adjustment family materialises.
  for (const [shape, flags] of [["an EMPTY stamp", {}], ["an explicitly NULL stamp", null]]) {
    const s = await stagedDraft(`z2${shape.length}`);
    const posted0 = await eventCount(s.client, "adjustment.posted");
    await forgeStamp(s.entry, {}); // materialise the key first so the shape is exact
    const row = await entryRowOf(s.entry);
    await forgeEntryColumns(s.entry, { flags: { ...(row.flags ?? {}), recurring_adjustment: flags } },
      { casts: { flags: "jsonb" } });

    const err = await caught(() => approveDraft(w.users.alice, s.entry));
    assert.equal(await receiptForEntry(s.entry), null, `${shape}: no adjustment_runs receipt was minted`);
    assert.equal(await mirrorOf(s.entry), null, `${shape}: no auto-reversal mirror was born`);
    assert.equal(await eventCount(s.client, "adjustment.posted"), posted0,
      `${shape}: no adjustment.posted event was emitted`);
    noteLane(`x42.z2 ${shape}: ${err ? `refused ${err.code} reason='${reasonToken(err) ?? "(none)"}'` : "APPROVED silently (no receipt, no mirror, no event)"}`);
  }

  // (c) A stamp naming ANOTHER CLIENT's template. The hook re-derives the issuer receipt
  // from client+template+period, so a cross-tenant template id can never authenticate —
  // and it must never mint a receipt against the foreign template either.
  const victim = await freshAdjClient("z2foreign");
  const foreign = await liveTemplate({ client: victim, label: "z2foreign", start: mon(-3).start });
  const s = await stagedDraft("z2xtenant");
  await forgeStamp(s.entry, { template_id: foreign.id });
  await refuses(() => approveDraft(w.users.alice, s.entry), T.adjustmentStale,
    "approving an occurrence whose stamp names ANOTHER client's template", { code: CLR39 });
  await assertNothingMaterialised(s, "the cross-tenant stamp");
  // MEASURE THE VICTIM'S BOOKS, NOT OUR OWN FORGERY. `stampedEntries` keys on the STAMP's
  // template_id, and `forgeStamp` above wrote `foreign.id` into the staging draft's stamp —
  // so that draft (ours, on OUR client, refused at approve and still a draft per
  // assertNothingMaterialised) necessarily answers this query. A bare count can therefore
  // never read zero, whatever the build does; the claim under test is that nothing landed
  // on the VICTIM. Pinned two ways: the ONLY entry naming the foreign template is our own
  // forgery on our own client, and adjustment_runs — the only place a misdispatch could
  // BANK a (template, period) against the victim (ABI §D 2) — gained nothing.
  const named = await stampedEntries(foreign.id, "occurrence");
  assert.deepEqual(named.map((e) => e.id), [s.entry],
    `…and the ONLY entry naming the foreign template is our own refused forgery (got ${named.length})`);
  assert.equal(named[0].client_id, s.client,
    "…which sits on the FORGER's client, never on the victim's books");
  assert.equal((await runRowsForTemplate(foreign.id)).length, 0,
    "…and the foreign template banked no adjustment_runs receipt of its own");
  assert.equal((await templateRow(foreign.id)).status, "live", "…and was not touched");
});
