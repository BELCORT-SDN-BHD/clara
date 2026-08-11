// 0056 (Wave E lane beta, the close model) rig -- PART 4: the CONCURRENCY FAMILY
// (matrix A13/A13b/A13c/A13d). Priority order per the work order: wall battery ->
// E-R6 -> close lifecycle -> concurrency (this file) -> the rest.
//
// CONTRACT-BLIND on 0056 itself: every claim is probed off the LIVE CATALOG,
// never by reading 0056_wave_e_close_model.sql. The two-session driver is the
// house rig-docs-race.mjs (holdThenContend / waitBlockedBy) -- the same one A19b
// already proved out.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, ROLES,
  endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, opk, draftEntryV3, approveEntry, freshResolution,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import { holdThenContend } from "./rig-docs-race.mjs";
import {
  has0056, caught, cleanCloseableFY, birthCounterparty,
  beginClose, finalizeClose,
  AR1, REVN, addDaysStr,
} from "./x56-fixtures.mjs";

let ready = false;
let has56 = false;
let world = null;

function skip56(t) {
  if (!ready || !has56) {
    markSkip();
    t.skip("0056 (close model) not present");
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- x56 concurrency suite skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- close model absent"); return; }
  world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x56-concurrency"); printSkipCount("x56-concurrency"); await endPool(); });

const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

/** An approved AR-domain entry with a counterparty -- mints exactly one open item. */
async function arItem(sub, { client, cp, debit, credit, cents, postingDate }) {
  const d = await draftEntryV3(sub, {
    client, resolution: manualRes(sub, client), memo: "x56 concurrency ar item", postingDate,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    vendor: { existing_id: cp, kind: "customer" }, opKey: opk("x56-aritem"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x56-aritema") });
  const items = (await rootQuery("select id, amount_cents from clara.open_items where entry_id=$1", [d.entry_id])).rows;
  return items[0];
}

// ===========================================================================
// A13 -- two sessions call begin_close concurrently on the SAME FY: the loser
// WAITS then LOSES (blocking proven), without minting a second run. Exactly
// ONE close_runs row in_progress, and the partial unique index is the
// structural reason.
// ===========================================================================

test("A13 two concurrent begin_close calls on the same FY: the loser WAITS (proven), then LOSES with a named token; exactly ONE in_progress close_runs row; the partial unique index backs it", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a13", prepSub: preparer, startsOn: "2027-01-01" });

  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: owner, run: async (c) => {
      const r = await c.query("select clara.begin_close(p_fy => $1, p_op_key => $2) as r", [fx.fy, opk("x56-a13-s1")]);
      return r.rows[0].r;
    } },
    b: { role: ROLES.authenticated, jwtSub: owner, run: async (c) => {
      const r = await c.query("select clara.begin_close(p_fy => $1, p_op_key => $2) as r", [fx.fy, opk("x56-a13-s2")]);
      return r.rows[0].r;
    } },
  });
  assert.ok(out.provedBlocked, "S2 WAITED on S1's held exclusive acquisition (proven via pg_blocking_pids)");
  assert.equal(out.a.ok, true, "S1's begin_close committed");
  assert.equal(out.b.ok, false, "S2's begin_close, once unblocked, LOSES");
  assert.equal(out.b.code, "CLR41", `expected CLR41 (got ${out.b.code} -- ${out.b.message})`);
  noteLane(`A13 loser's actual token: ${out.b.message}`);

  const runs = (await rootQuery(
    "select count(*)::int as n from clara.close_runs where fiscal_year_id=$1 and state='in_progress'", [fx.fy],
  )).rows[0].n;
  assert.equal(runs, 1, "exactly ONE in_progress close_runs row -- the loser minted NO second run");

  const idx = await rootQuery(
    `select 1 from pg_index i join pg_class c on c.oid=i.indexrelid
      where c.relname='uq_close_runs_one_live' and i.indisunique
        and i.indpred is not null`,
  );
  assert.equal(idx.rows.length, 1, "the partial unique index (fiscal_year_id) WHERE state='in_progress' is the structural reason, read from pg_index");
});

// ===========================================================================
// A13b -- the ONE-RECEIPT half: two sessions holding the same close_run both
// call finalize_close concurrently; exactly ONE close_receipts row; the loser
// is named; a THIRD call after both settle refuses close_not_in_progress.
// ===========================================================================

test("A13b two concurrent finalize_close calls on the same run: exactly ONE close_receipts row; the loser is refused (named); a post-settlement third call refuses close_not_in_progress", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "a13b", prepSub: preparer, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });

  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: owner, run: async (c) => {
      const r = await c.query("select clara.finalize_close(p_fy => $1, p_self_attestation => $2, p_op_key => $3) as r", [fx.fy, null, opk("x56-a13b-s1")]);
      return r.rows[0].r;
    } },
    b: { role: ROLES.authenticated, jwtSub: owner, run: async (c) => {
      const r = await c.query("select clara.finalize_close(p_fy => $1, p_self_attestation => $2, p_op_key => $3) as r", [fx.fy, null, opk("x56-a13b-s2")]);
      return r.rows[0].r;
    } },
  });
  assert.ok(out.provedBlocked, "S2 WAITED on S1's held exclusive acquisition");
  assert.equal(out.a.ok, true, "S1's finalize_close committed the close");
  assert.equal(out.b.ok, false, "S2's finalize_close, once unblocked, is refused -- the FY it re-reads is no longer 'closing'");
  assert.equal(out.b.code, "CLR41", `expected CLR41 (got ${out.b.code} -- ${out.b.message})`);
  noteLane(`A13b loser's actual token: ${out.b.message}`);

  const receipts = (await rootQuery(
    "select count(*)::int as n from clara.close_receipts where fiscal_year_id=$1 and kind='close'", [fx.fy],
  )).rows[0].n;
  assert.equal(receipts, 1, "exactly ONE close_receipts row for this FY");

  const third = await caught(() => finalizeClose(owner, { fy: fx.fy, opKey: opk("x56-a13b-third") }));
  assert.ok(third, "a THIRD call, after both settled, must ALSO refuse");
  assert.equal(third.code, "CLR41");
  assert.equal(JSON.parse(third.detail ?? "{}").reason, "close_not_in_progress", "the post-settlement refusal names close_not_in_progress");
});

// ===========================================================================
// A13c -- the reopen's ACQUISITION ORDER: row -> 004 -> 007-exclusive.
// Structural: the live body shows the row lock textually BEFORE both advisory
// locks. Behavioural: a competing holder of the SAME row lock (standing in
// for reverse_entry's own first act, which reopen_fiscal_year re-acquires)
// blocks reopen_fiscal_year on the ROW, in both orderings -- never on 004.
// ===========================================================================

test("A13c reopen_fiscal_year's acquisition order is row -> 004 -> 007 (structural + behavioural, both orderings)", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;

  // STRUCTURAL: the live body, harvested via pg_get_functiondef.
  const src = (await rootQuery(
    "select pg_get_functiondef(p.oid) as s from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='reopen_fiscal_year'",
  )).rows[0].s;
  const rowPos = src.indexOf("for update");
  const lock004Pos = src.indexOf("pg_advisory_xact_lock(203005004");
  const lock007Pos = src.indexOf("pg_advisory_xact_lock(203005007");
  assert.ok(rowPos > 0 && lock004Pos > 0 && lock007Pos > 0, "mandatory setup: all three acquisitions are present in the live body");
  assert.ok(rowPos < lock004Pos, "the row lock (for update) appears TEXTUALLY BEFORE 203005004");
  assert.ok(lock004Pos < lock007Pos, "203005004 appears before 203005007");

  // BEHAVIOURAL, direction 1: a competing holder of the closing entry's OWN row
  // (standing in for reverse_entry's first act -- a raw `for update`, since
  // pausing mid-execution INSIDE reverse_entry itself is not reachable from the
  // client side) holds; reopen_fiscal_year is called second and must block on
  // THAT row, never on 004.
  const fx1 = await cleanCloseableFY(owner, { tag: "a13c-1", prepSub: preparer, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx1.fy });
  const closed1 = await finalizeClose(owner, { fy: fx1.fy });

  const out1 = await holdThenContend({
    a: { role: ROLES.fnOwner, run: async (c) => {
      await c.query("select id from clara.journal_entries where id=$1 for update", [closed1.close_entry_id]);
      return { held: true };
    } },
    b: { role: ROLES.authenticated, jwtSub: owner, run: async (c) => {
      const r = await c.query(
        "select clara.reopen_fiscal_year(p_fy => $1, p_reason => $2, p_correction_target => $3::jsonb, p_op_key => $4) as r",
        [fx1.fy, "x56 a13c direction 1: row-lock contender holds first", JSON.stringify({ check_key: "ar_control_tie" }), opk("x56-a13c-1")],
      );
      return r.rows[0].r;
    } },
  });
  assert.ok(out1.provedBlocked, "direction 1: reopen_fiscal_year BLOCKED on the row lock (never 004-while-holding-the-row)");
  assert.equal(out1.a.ok, true);
  assert.equal(out1.b.ok, true, `reopen_fiscal_year completes once the row lock releases (got ${JSON.stringify(out1.b)})`);
  assert.notEqual(out1.a.code, "40P01");
  assert.notEqual(out1.b.code, "40P01");

  // Direction 2 (the mirror): reopen_fiscal_year holds first (it takes the row lock as
  // its OWN first acquisition); the row-lock contender is called second and must block
  // behind IT.
  const fx2 = await cleanCloseableFY(owner, { tag: "a13c-2", prepSub: preparer, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx2.fy });
  const closed2 = await finalizeClose(owner, { fy: fx2.fy });

  const out2 = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: owner, run: async (c) => {
      const r = await c.query(
        "select clara.reopen_fiscal_year(p_fy => $1, p_reason => $2, p_correction_target => $3::jsonb, p_op_key => $4) as r",
        [fx2.fy, "x56 a13c direction 2: reopen holds first", JSON.stringify({ check_key: "ar_control_tie" }), opk("x56-a13c-2")],
      );
      return r.rows[0].r;
    } },
    b: { role: ROLES.fnOwner, run: async (c) => {
      await c.query("select id from clara.journal_entries where id=$1 for update", [closed2.close_entry_id]);
      return { held: true };
    } },
  });
  assert.ok(out2.provedBlocked, "direction 2: the row-lock contender BLOCKED behind reopen_fiscal_year's own row lock");
  assert.equal(out2.a.ok, true, "reopen_fiscal_year committed first");
  assert.equal(out2.b.ok, true, "the contender then proceeds");
  assert.notEqual(out2.a.code, "40P01");
  assert.notEqual(out2.b.code, "40P01");
});

// ===========================================================================
// A13d -- the gate-evidence walls: S1 begin_close HOLDS; S2's writers on the
// FIVE gate-input tables BLOCK (never refuse), then complete once S1 commits.
// Structural: the shared-lock trigger's table census.
// ===========================================================================

test("A13d the gate-evidence tables carry the shared-lock trigger (structural census, 8 tables); a live writer (apply_open_items) BLOCKS while S1 holds begin_close, then completes normally; record_client_fact (a Codex R2 census addition) blocks the SAME way", async (t) => {
  if (skip56(t)) return;
  const owner = world.users.alice;
  const preparer = world.users.bob;

  // STRUCTURAL: the trigger x table census, read from pg_trigger x pg_class -- never
  // from the migration's CREATE TRIGGER statements.
  const census = (await rootQuery(
    `select coalesce(array_agg(c.relname::text order by c.relname), '{}') as t
       from pg_trigger tg join pg_class c on c.oid=tg.tgrelid join pg_proc p on p.oid=tg.tgfoid
      where p.proname='_tf_close_serialize' and not tg.tgisinternal`,
  )).rows[0].t;
  // bank_accounts joined the roster (Codex R1 BLOCKER 2): the census moved to registry
  // enumeration in the R1 bank-census fix, but the serialize trigger was never swept to
  // match -- a concurrent add_bank_account could otherwise slip an unreconcilable account
  // past a mid-flight finalize. client_facts + document_filings join it too (Codex R2 fix,
  // priced residual named in the migration's own comment: documents itself has no
  // client_id, so it structurally cannot ride this trigger).
  assert.deepEqual(census, ["bank_accounts", "bank_line_exceptions", "bank_reconciliations", "bank_statements", "client_facts", "document_filings", "fixed_assets", "open_item_allocations"],
    `the shared-lock trigger's live table census (got ${JSON.stringify(census)})`);

  // BEHAVIOURAL (one demonstrative writer, apply_open_items -- open_item_allocations):
  // S1 begin_close HOLDS; S2's apply_open_items BLOCKS, then completes (serializes,
  // does not refuse) once S1 commits.
  // dated in the PAST (2025), never 2027 like the other fixtures here: apply_open_items
  // carries its OWN unborn-item guard (0055) measured against the REAL wall clock, and a
  // 2027-dated item would trip THAT guard regardless of anything this cell tests.
  const fx = await cleanCloseableFY(owner, { tag: "a13d", prepSub: preparer, startsOn: "2025-01-01" });
  const cust = await birthCounterparty(preparer, { client: fx.client, name: `X56 A13D ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await arItem(preparer, { client: fx.client, cp: cust, debit: AR1, credit: REVN, cents: 30000, postingDate: addDaysStr(fx.startsOn, 5) });
  const cred = await arItem(preparer, { client: fx.client, cp: cust, debit: REVN, credit: AR1, cents: 30000, postingDate: addDaysStr(fx.startsOn, 6) });

  const out = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: owner, run: async (c) => {
      const r = await c.query("select clara.begin_close(p_fy => $1, p_op_key => $2) as r", [fx.fy, opk("x56-a13d-begin")]);
      return r.rows[0].r;
    } },
    b: { role: ROLES.authenticated, jwtSub: preparer, run: async (c) => {
      const r = await c.query(
        "select clara.apply_open_items(p_client => $1, p_applications => $2::jsonb, p_reason => $3, p_op_key => $4) as r",
        [fx.client, JSON.stringify([{ source_item_id: cred.id, target_item_id: inv.id, amount_cents: 30000 }]), "x56 a13d apply", opk("x56-a13d-apply")],
      );
      return r.rows[0].r;
    } },
  });
  assert.ok(out.provedBlocked, "apply_open_items BLOCKED while S1 held begin_close's exclusive form");
  assert.equal(out.a.ok, true);
  assert.equal(out.b.ok, true, `apply_open_items SERIALIZES and completes normally once S1 commits -- it does NOT refuse (got ${JSON.stringify(out.b)})`);

  // A SECOND writer, on client_facts specifically (the Codex R2 census addition): a
  // fresh client/FY, since the first arm already left fx.fy 'closing'. Same shape,
  // same law -- serializes, never refuses.
  const fx2 = await cleanCloseableFY(owner, { tag: "a13d-facts", prepSub: preparer, startsOn: "2025-01-01" });
  const out2 = await holdThenContend({
    a: { role: ROLES.authenticated, jwtSub: owner, run: async (c) => {
      const r = await c.query("select clara.begin_close(p_fy => $1, p_op_key => $2) as r", [fx2.fy, opk("x56-a13d-facts-begin")]);
      return r.rows[0].r;
    } },
    b: { role: ROLES.authenticated, jwtSub: world.users.hana, run: async (c) => {
      // record_client_fact takes role_rank('admin') -- preparer (bookkeeper) does not
      // qualify and would refuse CLR04 immediately, never reaching the trigger at all
      // (measured: that shape never blocks, it just fails fast). hana is this world's
      // admin.
      const r = await c.query(
        "select clara.record_client_fact(p_client => $1, p_fact_key => $2, p_fact_value => $3::jsonb, p_basis => $4, p_basis_kind => $5, p_source_document_id => $6, p_op_key => $7) as r",
        [fx2.client, "trade_nature", JSON.stringify("services"), "x56 a13d-facts: a live writer during a held close", "owner_instruction", null, opk("x56-a13d-facts-record")],
      );
      return r.rows[0].r;
    } },
  });
  assert.ok(out2.provedBlocked, "record_client_fact BLOCKED while S1 held begin_close's exclusive form -- the SAME shape as apply_open_items");
  assert.equal(out2.a.ok, true);
  assert.equal(out2.b.ok, true, `record_client_fact SERIALIZES and completes normally once S1 commits -- it does NOT refuse (got ${JSON.stringify(out2.b)})`);
});
