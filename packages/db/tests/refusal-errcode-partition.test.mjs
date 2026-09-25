// #1114 — THE ERRCODE PARTITION, measured over the WHOLE `clara` schema.
// Migration: 0335_internal_refusal_errcode.sql. Frontier-gated on its own STABLE STEM
// (`internal_refusal_errcode$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `schedule_term_correction$` / `prepayment_account_roster$` idiom.
//
// WHAT THIS FILE IS FOR, and it is the ticket's second acceptance criterion rather than a
// duplicate of the behavioural cells. #1114 AC1 is "the two refusals are raised with distinct
// errcodes", and that is driven at the doors themselves (`p915.obo.roster_first`,
// `p941.create.refusals`). AC2 is "any OTHER refusal reason currently sharing CLR10 is audited and
// given its own code where it is meant to reach a user", and an audit is only worth the paper it
// is written on if something holds it afterwards. These cells are that something:
//
//   · CLR44 carries ONE meaning — exactly four bodies raise it, and exactly three reason tokens
//     travel under it. A fifth site, or a fourth token, fails here by name, so the next author to
//     reach for the code has to decide which side of the partition their refusal belongs on.
//   · The renderable half did NOT move. `prepayment_source_unfit` and
//     `deferred_revenue_source_unfit` — the refusals the Prepayments and Deferred revenue forms
//     render, with their remedy and their panel — are still raised under CLR10, and no body that
//     raises either has learned CLR44.
//
// CONTRACT-BLIND against the migration's own tail: 0335's tail describes one apply, this file
// describes the live catalog. It reads `pg_proc.prosrc` and nothing else, so it is cheap, needs no
// scene, and measures the bodies AS THEY STAND after whatever later file recut them.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { CLR, endPool, rootQuery } from "./rig-helpers.mjs";
import {
  CALLER_CONTRACT_SITES, INTERNAL_ERRCODE_GATE, INTERNAL_ERRCODE_STEM, RENDERABLE_UNFIT,
  bodiesRaising, errcodesRaisedBy, internalErrcodeApplied,
} from "./internal-refusal-errcode-fixtures.mjs";

let executed = 0;
let ready = false;
const EXPECTED_CELLS = 3;

before(async () => { ready = await internalErrcodeApplied().catch(() => false); });

after(async () => {
  if (ready) {
    assert.equal(executed, EXPECTED_CELLS,
      `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  await endPool();
});

function cell(name, fn) {
  test(name, async (t) => {
    if (!await internalErrcodeApplied()) {
      if (process.env[INTERNAL_ERRCODE_GATE] !== "1") {
        throw new Error(
          `#1114 premise 0335_internal_refusal_errcode.sql is not applied (no ${INTERNAL_ERRCODE_STEM} `
          + `row in clara.schema_migrations) and ${INTERNAL_ERRCODE_GATE} is unset -- this is a `
          + "FOCUSED run and must fail loudly, not skip. Preload "
          + "./tests/internal-refusal-errcode-preintegration-gate.mjs for an estate sweep against a "
          + "pre-0335 chain.");
      }
      t.skip("0335_internal_refusal_errcode not applied -- probed at the live catalog");
      return;
    }
    executed += 1;
    await fn(t);
  });
}

// ===========================================================================================
// AC2 — CLR44 CARRIES ONE MEANING, AND THE CENSUS IS EXACT.
// ===========================================================================================

cell("p1114.partition.census — over the whole clara schema, CLR44 is raised by exactly the four "
  + "caller-contract sites and by nothing else, and exactly three reason tokens travel under it",
async () => {
  const raising = await bodiesRaising("CLR44");
  assert.deepEqual(raising, CALLER_CONTRACT_SITES.map(([sig]) => sig).sort(),
    "CLR44 must mean ONE thing: a clara_runtime-only door handed a null its caller's contract "
    + "guarantees. A body outside this list either belongs in the list or belongs on CLR10.");

  // THE TOKENS, read out of the bodies rather than asserted from a list this file also wrote. A
  // fourth token under CLR44 is a second meaning creeping back in, which is the defect #1114 is.
  const tokens = new Set();
  for (const [sig] of CALLER_CONTRACT_SITES) {
    const r = await rootQuery(
      "select p.prosrc as src from pg_proc p where p.oid = $1::regprocedure", [sig]);
    for (const m of r.rows[0].src.matchAll(
      /errcode='CLR44',\s*\n?\s*detail='\{"reason":"([a-z_]+)"/g)) tokens.add(m[1]);
  }
  assert.deepEqual([...tokens].sort(),
    ["invalid_author", "prepayment_read_scope_required", "revenue_recognition_read_scope_required"],
    "the caller-contract class carries exactly the three tokens the audit moved");
});

cell("p1114.partition.sites — each of the four doors raises its own token under CLR44 and under "
  + "no other code, and none of them raises CLR44 for anything else",
async () => {
  for (const [sig, token] of CALLER_CONTRACT_SITES) {
    const codes = await errcodesRaisedBy(sig);
    assert.ok(codes, `${sig} is absent from the catalog`);
    assert.equal(codes.has(CLR.callerContract), true, `${sig} does not raise CLR44 at all`);

    const r = await rootQuery(
      "select p.prosrc as src from pg_proc p where p.oid = $1::regprocedure", [sig]);
    const src = r.rows[0].src;
    assert.match(src, new RegExp(`errcode='CLR44',\\s*\\n?\\s*detail='\\{"reason":"${token}"`),
      `${sig}'s ${token} raise does not carry CLR44`);
    assert.doesNotMatch(src, new RegExp(`errcode='CLR10',?\\s*\\n?\\s*detail='\\{"reason":"${token}"`),
      `${sig} still answers ${token} with CLR10 somewhere`);

    // THE PAYLOAD IS UNTOUCHED. #1114 puts reshaping out of scope, so the token is still the
    // WHOLE of what changed hands: only the SQLSTATE moved.
    assert.ok(src.includes(`"reason":"${token}"`), `${sig} lost the ${token} token itself`);
  }
});

// ===========================================================================================
// AC4 — THE HALF THE WEB RENDERS DID NOT MOVE.
// ===========================================================================================

cell("p1114.partition.renderable — the two roster refusals a bookkeeper acts on still carry "
  + "CLR10, and no body that raises either has learned CLR44",
async () => {
  for (const [token, axis] of [
    [RENDERABLE_UNFIT.prepayment, RENDERABLE_UNFIT.notEnrolledAxis],
    [RENDERABLE_UNFIT.deferredRevenue, RENDERABLE_UNFIT.deferredNotEnrolledAxis],
  ]) {
    const r = await rootQuery(
      `select p.oid::regprocedure::text as sig, p.prosrc as src
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara' and p.prosrc like $1 order by 1`, [`%'${axis}'%`]);
    assert.ok(r.rows.length >= 1, `nothing raises the ${axis} axis at all — the scene moved`);
    for (const row of r.rows) {
      assert.match(row.src,
        new RegExp(`errcode='CLR10',\\s*\\n?\\s*detail=jsonb_build_object\\('reason','${token}'`),
        `${row.sig} no longer raises ${token} under CLR10 — the half the web renders was re-coded`);
      assert.equal(row.src.includes("CLR44"), false,
        `${row.sig} raises the renderable roster refusal AND the caller-contract code — the two `
        + "meanings are back in one body");
    }
  }

  // …AND THE REMEDY AND PANEL A SURFACE READS ARE STILL THERE, so "unaffected other than picking
  // up the corrected code" (#1114 AC4) is measured rather than assumed.
  const core = await rootQuery(
    "select p.prosrc as src from pg_proc p where p.oid = $1::regprocedure",
    ["clara._prepayment_schedule_core(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)"]);
  assert.ok(core.rows[0].src.includes("'remedy','clara.enrol_prepayment_account'"));
  assert.ok(core.rows[0].src.includes("'panel','client_registers_prepayment_accounts'"));
});
