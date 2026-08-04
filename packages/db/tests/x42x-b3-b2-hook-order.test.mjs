// WAVE D-b SPLIT — CROSS-SLICE CONTRACT (iii): D-b3 → D-b2, THE APPROVE-HOOK ORDER.
//
// census §2 Class C is the SEVEREST edge in the whole split. The whole-unit S5.8 splice ends
// `clara._subledger_on_approve` with TWO UNCONDITIONAL lines:
//     perform clara._adj_on_approve(p_entry);
//     perform clara._adv_on_approve(p_entry);
// PL/pgSQL resolves NEITHER at CREATE time. A slice that ships this splice before the bodies
// exist compiles clean and then breaks EVERY approve path in production at the first call.
// The split's resolution: D-b0 ships NO hook edit at all; D-b1 adds the ADVANCE line; D-b2
// inserts the ADJUSTMENT line ABOVE it (the order is load-bearing and is stated in the body's
// own comment).
//
// Errata E8 named the trap that makes this fragile in the OTHER direction: D-b2's prestate
// idempotency probe reads RAW `pg_get_functiondef` text, so D-b1's inserted anchor comment
// deliberately names the adjustment hook WITHOUT its open paren — a comment containing
// `clara._adj_on_approve(` would make D-b2 conclude "already applied" and skip its own splice.
// This file pins BOTH halves: the raw-instrument count that D-b2's probe depends on, and the
// stripped-instrument order that the books depend on.
//
// FRONTIER-AWARE, with an arm for EVERY slice — it belongs in all four CI lists:
//   D-b0  (0042, no 0043): NEITHER hook line. The splice was not shipped.
//   D-b1/D-b3 (0043, no 0045): EXACTLY the advance line; `clara._adj_on_approve(` at ZERO on
//                              the RAW instrument (E8's own assertion).
//   D-b2  (0045): BOTH, adjustment ABOVE advance.
// And at every frontier: an ordinary approve still works — the Class C failure mode itself.
//
// Rig-gated; pollution-proof (stages its own world).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, noteLane,
  opk, createClient, upsertAccountClassed, grantConsent, freshResolution,
  draftEntryV3, approveEntry, entryRowOf, x41EnsureReady, wb, uniqTag,
} from "./x41-fa-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await wb.buildWaveBWorld();
});
after(async () => {
  printLaneNotes("x42x-b3-b2-hook-order");
  printSkipCount("x42x-b3-b2-hook-order");
  await endPool();
});

const skipHere = (t) => {
  if (!live) { t.skip("no migrated rig (0041 absent) — the split contract battery is dormant"); return true; }
  return false;
};

const stripSqlComments = (src) => (src ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
/** THE RAW definition — the instrument D-b2's own prestate idempotency probe uses. */
const rawHook = async () => (await rootQuery(
  "select pg_get_functiondef(p.oid) as def from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='_subledger_on_approve'")).rows[0]?.def ?? null;
const applied = async (re) => Number((await rootQuery(
  "select count(*)::int as n from clara.schema_migrations where version ~ $1", [re])).rows[0].n);

/** ------------------------------------------------------------------------------------------
 *  FRONTIER PREDICATES BY STABLE NAME, NEVER BY NUMBER  [light re-confirm RC4 / LENS-3]
 *  ------------------------------------------------------------------------------------------
 *  Migration numbers are claimed at MERGE time (slices/forks/RENUMBER.md); the slice NAME never
 *  moves. A `^0042_` / `^0043_` pair therefore stops meaning what it says the moment an
 *  intervening hotfix takes a number: with D-b0 merged as 0043, `^0043_` reads D-b0 as D-b1, and
 *  a frontier-aware contract silently skips the arm that IS live and runs the arm that is not —
 *  against a database that has none of the objects that arm names. Keying on the full stable
 *  name makes every arm below renumber-proof, and makes the renumber inventory in RENUMBER.md
 *  §2 a list of FILENAMES to rename rather than a list of regexes to re-derive.
 */
const V_B0 = "^[0-9]{4}_wave_d_b0_shared_authorities$";
const V_B1 = "^[0-9]{4}_wave_d_b1_staff_advances$";
const V_B3 = "^[0-9]{4}_wave_d_b3_af2_composite$";
const V_B2 = "^[0-9]{4}_wave_d_b2_recurring_adjustments$";
const countOf = (hay, needle) => hay.split(needle).length - 1;

const CASH = "100-XB32";
const SALES = "600-XB32";

// ===========================================================================

test("x42x.ho1 [ALL FRONTIERS] THE CLASS-C FAILURE MODE ITSELF: an ordinary approve — no advance, no adjustment — still succeeds. This is the single cell that would go red if any slice shipped a hook line ahead of its body", async (t) => {
  if (skipHere(t)) return;
  const sub = w.users.alice;
  const client = await createClient(sub, { name: `xb32_${uniqTag()}`, opKey: opk("xb32cli") });
  await grantConsent(sub, { firm: w.firms.A, client }).catch(() => {});
  for (const [code, name, type] of [[CASH, "Cash (xb32)", "asset"], [SALES, "Sales (xb32)", "income"]]) {
    await upsertAccountClassed(sub, { client, code, name, type, accountClass: null, opKey: opk("xb32coa") });
  }
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "manual", subjectId: null }),
    memo: "xb32 ordinary sale", postingDate: "2034-05-04",
    lines: [
      { account_code: CASH, debit_cents: 12_345, credit_cents: 0, description: "cash in" },
      { account_code: SALES, debit_cents: 0, credit_cents: 12_345, description: "sales" },
    ],
    opKey: opk("xb32draft"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("xb32appr") });
  assert.equal((await entryRowOf(d.entry_id)).status, "approved",
    "the approve path works at this frontier — clara._subledger_on_approve resolved every hook line it carries");
  noteLane(`x42x.ho1: the approve path is intact at frontier D-b0=${await applied(V_B0)} D-b1=${await applied(V_B1)} D-b3=${await applied(V_B3)} D-b2=${await applied(V_B2)}`);
});

test("x42x.ho2 [D-b0 arm] with 0042 applied and 0043 NOT: clara._subledger_on_approve carries NEITHER hook line — D-b0 ships no S5.8 splice at all (census §2 Class C's resolution)", async (t) => {
  if (skipHere(t)) return;
  if (await applied(V_B1) > 0) {
    t.skip("D-b1 IS applied — the D-b0 arm of this three-arm contract is not the live one here");
    return;
  }
  assert.equal(await applied(V_B0), 1, "the D-b0 arm needs the D-b0 migration applied");
  const stripped = stripSqlComments(await rawHook());
  assert.equal(countOf(stripped, "clara._adv_on_approve("), 0, "no ADVANCE hook line at D-b0");
  assert.equal(countOf(stripped, "clara._adj_on_approve("), 0, "no ADJUSTMENT hook line at D-b0");
  assert.ok(/_fa_on_approve\(/.test(stripped),
    "…while the FA hook line D-a shipped is still there — D-b0 left the body ALONE, it did not rewrite it");
  noteLane("x42x.ho2 [D-b0 arm]: the approve hook is unedited at D-b0");
});

test("x42x.ho3 [D-b1/D-b3 arm] with 0043 applied and 0045 NOT: EXACTLY ONE hook line — the advance one — and on the RAW instrument D-b2's prestate probe uses, `clara._adj_on_approve(` counts ZERO. This is errata E8's assertion, from the other side", async (t) => {
  if (skipHere(t)) return;
  if (await applied(V_B1) === 0) {
    t.skip("D-b1 is not applied — the D-b1/D-b3 arm is not the live one at D-b0");
    return;
  }
  if (await applied(V_B2) > 0) {
    t.skip("D-b2 IS applied — the D-b1/D-b3 arm is not the live one here; the D-b2 arm (ho4) is");
    return;
  }
  const raw = await rawHook();
  const stripped = stripSqlComments(raw);
  assert.equal(countOf(stripped, "clara._adv_on_approve("), 1, "EXACTLY ONE advance hook line (D-b1's)");
  assert.equal(countOf(stripped, "clara._adj_on_approve("), 0, "and NO adjustment hook line — D-b2 has not shipped");

  // E8, EXACTLY: D-b2's prestate reads RAW text. If D-b1's anchor comment carried the open
  // paren, D-b2 would conclude "already applied" and skip its own splice — the adjustment hook
  // would never be installed and nothing would notice until an occurrence failed to post.
  assert.equal(countOf(raw, "clara._adj_on_approve("), 0,
    "on the RAW instrument (comments INCLUDED) `clara._adj_on_approve(` counts ZERO — D-b1's anchor comment names the hook WITHOUT its open paren, deliberately, so D-b2's prestate idempotency probe cannot mistake prose for an applied splice");
  noteLane(`x42x.ho3 [D-b1/D-b3 arm]: one hook line, and the raw-instrument adj count is 0 — E8 honoured (raw adj-without-paren mentions: ${countOf(raw, "clara._adj_on_approve")})`);
});

test("x42x.ho4 [D-b2 arm] once 0045 is applied: BOTH hook lines, and the ADJUSTMENT one stands ABOVE the ADVANCE one — the order the body's own comment calls load-bearing", async (t) => {
  if (skipHere(t)) return;
  if (await applied(V_B2) === 0) {
    t.skip("D-b2 is not applied — the D-b2 arm is not the live one here");
    return;
  }
  const stripped = stripSqlComments(await rawHook());
  assert.equal(countOf(stripped, "clara._adj_on_approve("), 1, "EXACTLY ONE adjustment hook line (D-b2's) — the splice ran once, not twice");
  assert.equal(countOf(stripped, "clara._adv_on_approve("), 1, "EXACTLY ONE advance hook line — D-b1's line survived D-b2's splice");
  const iAdj = stripped.indexOf("clara._adj_on_approve(");
  const iAdv = stripped.indexOf("clara._adv_on_approve(");
  assert.ok(iAdj < iAdv,
    `the ADJUSTMENT line stands ABOVE the ADVANCE line (adj@${iAdj} < adv@${iAdv}). Reversed, an occurrence's own advance-bearing legs would be seen by the advance hook before the adjustment hook had minted the occurrence receipt`);
  assert.ok(/_fa_on_approve\(/.test(stripped), "…and D-a's FA hook line is still there under all of it");
  noteLane("x42x.ho4 [D-b2 arm]: both hook lines present, adjustment above advance — the whole unit's hook, reassembled by three slices");
});
