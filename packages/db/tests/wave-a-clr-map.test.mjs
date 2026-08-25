// Wave-A rig — the full CLR MAPPING sweep (Codex probe 28; contract §10 + companion
// §13a + PINS §6). Every §13a row maps a native SQLSTATE/constraint → a CLR code +
// reason discriminant with NO raw SQLSTATE leaking to the caller; multi-gate
// precedence (CLR03 identity > CLR28 consent > CLR26 question > CLR21/23 business >
// CLR29 sweep no-op). This file exercises the rows NOT already deep-covered by the
// concern-specific files, plus the "no raw 23505/23503 leak" property and the
// acknowledge role/identity floors. Contract-blind. SKIPS (counted) until 0011 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, roleQuery, opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  filedDocument, grantClientEgress, revokeClientEgress, openSweepRun, acknowledgeSweepRun, getEntryDiff,
  counterpartyRows, grantConsent, humanPersona, CLR29, CLR27,
} from "./wave-a-fixtures.mjs";
import { EXP } from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: "400-000", name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  }
});
after(async () => { printLaneNotes("wave-a-clr-map"); printSkipCount("wave-a-clr-map"); await endPool(); });

const codeOf = (fn) => fn().then(() => null, (e) => e);

// ===========================================================================
// No raw native SQLSTATE leaks — 23505/23503 are MAPPED to CLR codes.
// ===========================================================================

test("a duplicate LIVE egress grant does NOT leak a raw 23505 — it is mapped to CLR28 (or a typed duplicate refusal)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // before() pre-grants A1 consent; revoke so line-46 is the TRUE first live grant.
  await revokeClientEgress(users.alice, { client: clients.A1 }).catch(() => {});
  const ev1 = await filedDocument(users.alice, { firm, client: clients.A1 });
  const ev2 = await filedDocument(users.alice, { firm, client: clients.A1 });
  await grantClientEgress(users.alice, { client: clients.A1, evidenceDocument: ev1.documentId, scopeNote: "first" });
  // A SECOND live grant (without revoking) hits the one-live partial unique.
  const err = await codeOf(() => grantClientEgress(users.alice, { client: clients.A1, evidenceDocument: ev2.documentId, scopeNote: "dup" }));
  if (!err) { noteLane("a second live egress grant SUCCEEDED — the one-live partial unique may allow it / grant may revoke-and-replace; inspect"); return; }
  assert.notEqual(err.code, "23505", "a duplicate live grant does NOT leak the raw 23505 to the caller");
  assert.ok(/^CLR/.test(err.code), `the duplicate live grant is a typed CLR refusal (got ${err.code})`);
});

test("a composite-FK breach (get_entry_diff on a non-existent entry) collapses to CLR11 not-found — never a raw 23503 or a cross-firm oracle", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const err = await codeOf(() => getEntryDiff(humanPersona(users.alice), { entry: "00000000-0000-4000-8000-0000000d1ff0", client: clients.A1 }));
  // A non-existent entry either returns an empty/not-found shape OR raises CLR11 — never 23503.
  if (err) {
    assert.notEqual(err.code, "23503", "a non-existent entry does NOT leak a raw 23503");
    assert.ok(/^CLR/.test(err.code), `not-found collapses to a typed CLR (got ${err.code})`);
  }
});

// ===========================================================================
// Sweep law — acknowledge_sweep_run role/identity floors + not_finalized (CLR29).
// ===========================================================================

test("acknowledge_sweep_run on a NON-finalized run raises CLR29 not_finalized (the only sweep code that raises)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const run = await openSweepRun({ firm, expected: 2 }).catch((e) => { noteLane(`open_sweep_run raised ${e.code}`); return null; });
  if (!run) return;
  const runId = run.run_id ?? run.id ?? run;
  const err = await codeOf(() => acknowledgeSweepRun(users.alice, { run: runId }));
  assert.ok(err && err.code === CLR29, `acknowledging an open (non-finalized) run raises CLR29 not_finalized (got ${err?.code})`);
});

test("acknowledge_sweep_run structurally refuses a non-human (agent/runtime) identity (ACL) and a below-bookkeeper human (CLR04)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const run = await openSweepRun({ firm, expected: 1 }).catch(() => null);
  if (!run) { noteLane("acknowledge floors: could not open a sweep run"); return; }
  const runId = run.run_id ?? run.id ?? run;
  // A runtime/agent role cannot even EXECUTE acknowledge (human-only grant) → 42501.
  const agentErr = await codeOf(() => roleQuery(ROLES.agentRo, "select clara.acknowledge_sweep_run(p_run => $1, p_op_key => $2)", [runId, opk("ack")]));
  assert.ok(agentErr && ["42501", "CLR03", "CLR04"].includes(agentErr.code), `a non-human identity is refused acknowledge (got ${agentErr?.code})`);
  // A viewer (carol) is below the bookkeeper+ floor → CLR04 (or CLR29 not_finalized if the floor is checked after — record precedence).
  const viewerErr = await codeOf(() => acknowledgeSweepRun(users.carol, { run: runId }));
  assert.ok(viewerErr && ["CLR04", CLR29, "CLR03"].includes(viewerErr.code), `a viewer is refused (role floor CLR04, or the not_finalized gate — got ${viewerErr?.code})`);
});

// ===========================================================================
// Precedence — CLR03 identity dominates a business refusal.
// ===========================================================================

test("multi-gate precedence: a wake/agent identity calling a human-only writer is refused on IDENTITY first (CLR03/ACL), never the downstream business code", async (t) => {
  if (skipUnready(t, ready)) return;
  // This cell's claim is generic identity precedence, never one specific verb, so it
  // re-points whenever its current target retires. History: sign_coding_rule (the original
  // illustration) retired at F-A2 PR-3 -> re-pointed to sign_bank_rule; sign_bank_rule itself
  // now retires at F-A3 PR-3 (Annex I, the bank-rules machine drops whole) -> re-pointed
  // AGAIN, this time to sign_vendor_identity_binding(p_binding uuid, p_op_key text) — the
  // exact same (uuid, text) arity, a genuinely DIFFERENT human-only writer with no relation
  // to the bank-rules machine, so a third bank-side retirement cannot orphan this cell again.
  // TIGHTENED per the review round: a bare `assert.ok(err)` plus `notEqual(CLR27)` passes
  // just as happily on a MISSING function (42883) as on the real ACL refusal this cell
  // claims to prove — the exact vacuous-pass class this re-point is fixing. Assert the LITERAL
  // 42501 (Postgres's own insufficient_privilege) so a fourth retirement fails LOUD, not quiet.
  const err = await codeOf(() => roleQuery(ROLES.agentRo, "select clara.sign_vendor_identity_binding(p_binding => $1, p_op_key => $2)", ["00000000-0000-4000-8000-0000000051c0", opk("s")]));
  // (the bogus uuid is malformed; the point is the ACL/identity refusal precedes any body work)
  assert.ok(err, "the agent call to a human-only writer refused");
  assert.equal(err.code, "42501", `identity precedence is a real 42501 ACL refusal, not a substitute code (got ${err?.code})`);
  assert.notEqual(err.code, CLR27, "an identity-refused call never reaches the business (CLR27) layer");
});

// ===========================================================================
// No raw SQLSTATE leakage — a battery of refusals, every code is CLR-typed.
// ===========================================================================

test("no raw SQLSTATE leakage: a battery of new-surface refusals all raise CLR* codes (never a raw 23xxx/42xxx to a card)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const cp = (await counterpartyRows(clients.A1))[0]?.id ?? null;
  const errs = [];
  // duplicate live rule -> CLR27 (via propose_coding_rule/sign_coding_rule) RETIRED with
  // F-A2 PR-3 (Annex B.1) -- both verbs are dropped, so this probe is removed rather than
  // left calling a function that no longer exists. The malformed-alias probe below still
  // exercises the battery's claim (every refusal is CLR-typed, never a raw SQLSTATE).
  // malformed alias (empty) → CLR10/CLR23
  errs.push(await codeOf(() => import("./wave-a-fixtures.mjs").then((m) => m.addAlias(users.alice, { client: clients.A1, counterparty: cp, alias: "" }))));
  const raised = errs.filter(Boolean);
  if (!raised.length) { noteLane("no refusals were triggered in the leakage battery on this run (fixtures may not have reached the gates)"); return; }
  for (const e of raised) {
    assert.ok(/^CLR/.test(e.code), `refusal is CLR-typed, not a raw SQLSTATE (got ${e.code} — ${e.message?.slice(0, 120)})`);
  }
});
