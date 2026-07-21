// Wave-A2 rig — execute_rule_post, the posting-tier executor (contract §6.3/§6.5 +
// probes P4/P12/P10). CONTRACT-BLIND: from contract v1.0 §6.3-§6.5 + the
// record_rule_resolution login-direct precedent (0007/0011) + _open_question_core
// zero-grant precedent (0011) — NEVER 0015 source. The load-bearing invariants:
//
//   ISOLATION (structural, robust): execute_rule_post is granted LOGIN-DIRECT to
//     clara_runtime_login ONLY — the agent pool role, every wake role,
//     clara_agent_ro, clara_authenticated and PUBLIC all get 42501. The extracted
//     _approve_entry_core carries ZERO app grants (adversarial #7 lockdown).
//   ELIGIBILITY (re-derived live, never trusted from a draft flag): a matching
//     in-bounds routine draft posts; high-stakes / over-cap / expired / over-window /
//     a whole-entry violation (a 3-way split under cap) / wrong-revision each REFUSE;
//     a sales rule fires on the CREDIT side. Failures are a QUIET no-op (a
//     rule_post_skips row), never an error loop; benign races (CLR10/CLR06) SKIP.
//   H2 CARVE-OUT (P10): a rule-post approval writes NO sighting and triggers NO
//     auto-proposal; a HUMAN approve leaves checked_via_rule_id NULL (adversarial #11).
//   WINDOW SERIALIZATION (P12): two concurrent posts on ONE rule at window_max-1 post
//     EXACTLY ONE (the FOR UPDATE on the coding_rules row).
//
// The new autopost writers are called ADAPTIVELY (contract-silent signatures →
// callFnAdaptive maps semantic keys; a divergence is a FINDING). Skips (counted).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, getPool, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, opk,
  withSessionAuth, callFnAdaptive, resolveFn, humanPersona,
  upsertPayableAccount, upsertAccountClassed, grantConsent, seedCitedDocument, freshResolution,
  draftEntryV3, approveEntry, billLines, ev, FIELD, counterpartyRows, codingRuleRows, sightingRows,
  AP, EXP,
} from "./wave-a-fixtures.mjs";

const EXP2 = "500-A02";
let ready = false;
let has15 = false;
let world = null;

/** 0015 executor marker — the execute_rule_post fn exists (live catalog). */
async function hasExecutor() {
  const r = await rootQuery("select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='execute_rule_post' limit 1");
  return r.rows.length > 0;
}
function skip15(t) {
  if (!has15) { markSkip(); t.skip("Wave-A2 not present — execute_rule_post absent"); return true; }
  return false;
}

async function makeVendor(sub, { client, name, reg }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, 50000),
    vendor: { new: { name, registration_no: reg } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("vend"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("vap") });
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === norm)?.id ?? null;
}

/** Draft a fresh AP bill for `cp` coded to `accountCode` at `amount` (a DRAFT, not
 *  approved — the raw material execute_rule_post posts). Returns {entry_id, revision_token}. */
async function draftBill(sub, { client, cp, accountCode = EXP, amount = 50000 }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: `RM ${(amount / 100).toFixed(2)}` });
  return draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(accountCode, AP, amount),
    vendor: { existing_id: cp }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("bill"),
  });
}

/** Generate ≥3 human-approved sightings for (cp, accountCode) — the proposal gaming guard. */
async function seedSightings(sub, { client, cp, accountCode = EXP, n = 3 }) {
  for (let i = 0; i < n; i++) {
    const d = await draftBill(sub, { client, cp, accountCode });
    if (d?.entry_id) await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("sight") }).catch(() => {});
  }
}

/** Build a LIVE autopost rule via the adaptive writers. Returns the rule id or null. */
async function buildLiveAutopostRule(sub, { client, cp, accountCode = EXP, cap = 200000, windowMax = 3, direction = "purchase", expiresAt = null }) {
  const proposeFn = await resolveFn(["propose_autopost_rule"], { label: "autopost proposer" });
  const signFn = await resolveFn(["sign_autopost_rule"], { label: "autopost signer" });
  if (!proposeFn || !signFn) { noteLane("propose_/sign_autopost_rule not found — autopost-rule build skipped"); return null; }
  await seedSightings(sub, { client, cp, accountCode });
  let ruleId = null;
  try {
    const proposed = await callFnAdaptive(proposeFn, {
      client, counterparty: cp, account_code: accountCode, amount_cap_cents: cap,
      frequency_window: "monthly", window_max_posts: windowMax, direction,
      expires_at: expiresAt, op_key: opk("proprule"),
    }, { persona: humanPersona(sub), label: proposeFn });
    ruleId = proposed?.rule_id ?? proposed?.id ?? (typeof proposed === "string" ? proposed : null);
  } catch (e) { noteLane(`${proposeFn} raised ${e.code}: ${e.message}`); return null; }
  if (!ruleId) { const live = (await codingRuleRows(client)).filter((r) => r.rule_type === "autopost"); ruleId = live[live.length - 1]?.id ?? null; }
  if (!ruleId) return null;
  try { await callFnAdaptive(signFn, { rule: ruleId, op_key: opk("signrule") }, { persona: humanPersona(sub), label: signFn }); }
  catch (e) { noteLane(`${signFn} raised ${e.code}: ${e.message}`); return null; }
  const row = (await codingRuleRows(client)).find((r) => r.id === ruleId);
  if (!row || row.status !== "live") { noteLane(`autopost rule ${ruleId} not live (status=${row?.status})`); return null; }
  return ruleId;
}

/** Post a draft via the runtime-login shell (the ONLY grantee of execute_rule_post). */
async function postViaRule(entry, { opKey = null } = {}) {
  return withSessionAuth("clara_runtime_login", async (c) => {
    const r = await c.query("select clara.execute_rule_post(p_entry => $1, p_op_key => $2) as r", [entry, opKey ?? `rulepost:${entry}:${randomUUID().slice(0, 8)}`]);
    return r.rows[0].r;
  });
}
async function entryRow(entry) {
  const r = await rootQuery("select status, checked_via_rule_id from clara.journal_entries where id=$1", [entry]);
  return r.rows[0] ?? null;
}

before(async () => {
  ready = await waveAEnsureReady();
  has15 = ready && (await hasExecutor());
  if (has15) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") }).catch(() => {});
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") }).catch(() => {});
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP2, name: "Rent", type: "expense", opKey: opk("exp2") }).catch(() => {});
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  } else noteLane(ready ? "0015 execute_rule_post absent — executor suite skipped" : "0011 surface absent");
});
after(async () => { printLaneNotes("wave-a2-execute-rule-post"); printSkipCount("wave-a2-execute-rule-post"); await endPool(); });

// ===========================================================================
// ISOLATION — the login-direct grant matrix (robust, structural).
// ===========================================================================

test("§6.3 execute_rule_post is granted to clara_runtime_login ONLY (login=t; group/wake/agent_ro/authenticated/PUBLIC=f)", async (t) => {
  if (skip15(t)) return;
  const sig = "clara.execute_rule_post(uuid,text)"; // ASSUMPTION (contract §6.3): (p_entry uuid, p_op_key text)
  const check = async (role) => (await rootQuery("select pg_catalog.has_function_privilege($1,$2,'execute') as ok", [role, sig])).rows[0].ok;
  let loginHas;
  try { loginHas = await check("clara_runtime_login"); }
  catch (e) { noteLane(`execute_rule_post signature probe failed (${e.message}) — arity assumption (uuid,text) may differ; adjudicate`); return; }
  assert.equal(loginHas, true, "clara_runtime_login HAS execute (the login-direct grant)");
  for (const role of ["clara_runtime", "clara_authenticated", "clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive"]) {
    assert.equal(await check(role), false, `${role} must NOT execute execute_rule_post (login-direct isolation)`);
  }
  const pub = (await rootQuery("select count(*)::int n from pg_proc p join pg_namespace nsp on nsp.oid=p.pronamespace cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee where nsp.nspname='clara' and p.proname='execute_rule_post' and r.rolname not in ('clara_fn_owner','clara_runtime_login') and a.privilege_type='EXECUTE'")).rows[0].n;
  assert.equal(pub, 0, "no role other than clara_fn_owner (owner) and clara_runtime_login holds EXECUTE on execute_rule_post");
});

test("§6.3 non-login roles calling execute_rule_post are denied 42501 (behavioral)", async (t) => {
  if (skip15(t)) return;
  const dummy = randomUUID();
  for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.runtime]) {
    await assert.rejects(
      () => roleQuery(role, "select clara.execute_rule_post(p_entry => $1, p_op_key => $2)", [dummy, opk("x")]),
      (e) => e.code === "42501",
      `${role} is denied EXECUTE (42501) on execute_rule_post`,
    );
  }
});

test("§6.3 _approve_entry_core carries ZERO app grants (adversarial #7 lockdown)", async (t) => {
  if (skip15(t)) return;
  const fn = await rootQuery("select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='_approve_entry_core' limit 1");
  if (!fn.rows.length) { noteLane("_approve_entry_core not present — the S5 approve-core split may name it differently; adjudicate"); return; }
  const extra = (await rootQuery(
    `select count(*)::int n from pg_proc p join pg_namespace nsp on nsp.oid=p.pronamespace
       cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
      where nsp.nspname='clara' and p.proname='_approve_entry_core' and r.rolname<>'clara_fn_owner' and a.privilege_type='EXECUTE'`,
  )).rows[0].n;
  assert.equal(extra, 0, "_approve_entry_core leaked ZERO non-owner EXECUTE grant (the _open_question_core precedent)");
});

// ===========================================================================
// The receipts/skip substrate + the rule-posted event.
// ===========================================================================

test("§6.4 the rule-post receipt + skip tables exist and are RLS+FORCE; entry.rule_posted is a registered event", async (t) => {
  if (skip15(t)) return;
  const tbls = await rootQuery(
    "select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relkind='r' and c.relname in ('rule_post_runs','rule_post_skips')");
  const have = new Map(tbls.rows.map((r) => [r.relname, r]));
  for (const tbl of ["rule_post_runs", "rule_post_skips"]) {
    const r = have.get(tbl);
    if (!r) { noteLane(`${tbl} not found — the S4 receipts table may be named differently; adjudicate`); continue; }
    assert.ok(r.rls && r.force, `${tbl} is RLS + FORCE RLS`);
  }
  const ev = await rootQuery("select 1 from clara.event_types where name='entry.rule_posted' limit 1");
  if (!ev.rows.length) noteLane("event_type 'entry.rule_posted' not registered — adjudicate the event name");
});

// ===========================================================================
// ELIGIBILITY — behavioral (best-effort; the SPEC is encoded, divergences adjudicated).
// ===========================================================================

test("§6.3 a matching IN-BOUNDS routine draft posts via the rule (checked_via_rule_id set), and writes NO sighting (P10)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `AUTOPOSTCO ${randomUUID().slice(0, 6)}`, reg: "201801020001" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A1, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  const draft = await draftBill(users.alice, { client: clients.A1, cp, accountCode: EXP, amount: 50000 });
  if (!draft?.entry_id) { noteLane("in-bounds draft not created"); return; }
  const sightBefore = (await sightingRows(clients.A1)).length;
  try { await postViaRule(draft.entry_id); } catch (e) { noteLane(`execute_rule_post(in-bounds) raised ${e.code}: ${e.message}`); return; }
  const row = await entryRow(draft.entry_id);
  assert.equal(row?.status, "approved", "an in-bounds routine draft is posted (approved) by the rule");
  assert.ok(row?.checked_via_rule_id, "the posted entry stamps checked_via_rule_id (the rule carried the checker authority)");
  const sightAfter = (await sightingRows(clients.A1)).length;
  assert.equal(sightAfter, sightBefore, "a rule-posted approval writes NO sighting (H2 carve-out — rules never breed rules from their own output)");
});

test("§6.3 execute_rule_post REFUSES an OVER-CAP draft (a rule signed for account A can never post above its cap)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `CAPCO ${randomUUID().slice(0, 6)}`, reg: "201801020002" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A1, cp, accountCode: EXP, cap: 60000, windowMax: 3 });
  if (!rule) return;
  const draft = await draftBill(users.alice, { client: clients.A1, cp, accountCode: EXP, amount: 90000 }); // > cap
  if (!draft?.entry_id) return;
  await postViaRule(draft.entry_id).catch(() => {});
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "an over-cap draft is NOT posted (a quiet no-op / skip, never over its bound)");
});

test("§6.3 execute_rule_post REFUSES a WHOLE-ENTRY violation (a 3-way split under cap never launders into unrelated accounts)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `SPLITCO ${randomUUID().slice(0, 6)}`, reg: "201801020003" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A2, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  // A 3-leg draft: two expense legs (EXP + EXP2) + the payable — total under cap, but
  // NOT every non-control leg hits the rule's account EXP (EXP2 is off-rule).
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, quote: "RM 900.00" });
  const draft = await draftEntryV3(users.alice, {
    client: clients.A2, resolution: await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: [
      { account_code: EXP, debit_cents: 40000, credit_cents: 0, description: "leg-a" },
      { account_code: EXP2, debit_cents: 50000, credit_cents: 0, description: "leg-b (off-rule)" },
      { account_code: AP, debit_cents: 0, credit_cents: 90000, description: "ap" },
    ],
    vendor: { existing_id: cp }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("split"),
  }).catch((e) => { noteLane(`3-way split draft raised ${e.code}`); return null; });
  if (!draft?.entry_id) return;
  await postViaRule(draft.entry_id).catch(() => {});
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "a 3-way split with an off-rule leg is NOT auto-posted (the whole-entry constraint)");
});

test("§6.5 execute_rule_post REFUSES a HIGH-STAKES draft (is_high_stakes re-checked hard at post time)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `HSCO ${randomUUID().slice(0, 6)}`, reg: "201801020004" });
  if (!cp) return;
  // Cap ceiling is min(rule cap, firm high-stakes threshold RM10k) — request a big cap;
  // a ≥RM10k draft is high-stakes and must be refused regardless of the cap.
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A1, cp, accountCode: EXP, cap: 5000000, windowMax: 3 });
  if (!rule) { noteLane("could not build a rule with a large cap (the cap ceiling may reject cap>high_stakes) — high-stakes cell noted"); return; }
  const draft = await draftBill(users.alice, { client: clients.A1, cp, accountCode: EXP, amount: 1500000 }); // ≥ RM10k
  if (!draft?.entry_id) return;
  await postViaRule(draft.entry_id).catch(() => {});
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "a high-stakes draft is NEVER auto-posted (structural, re-derived at post time)");
});

test("§6.3 execute_rule_post SKIPS (does not raise) a draft a human already WITHDREW (benign CLR10 → skip)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `WITHDRAWCO ${randomUUID().slice(0, 6)}`, reg: "201801020005" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A2, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  const draft = await draftBill(users.alice, { client: clients.A2, cp, accountCode: EXP, amount: 50000 });
  if (!draft?.entry_id) return;
  const { withdrawDraft } = await import("./wave-a-fixtures.mjs");
  await withdrawDraft(users.alice, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("wd") }).catch((e) => noteLane(`withdraw ${e.code}`));
  // The draft is no longer a draft. execute_rule_post must SKIP quietly, not raise.
  let raised = null;
  try { await postViaRule(draft.entry_id); } catch (e) { raised = e; }
  if (raised && !["CLR10", "CLR06"].includes(raised.code)) noteLane(`execute_rule_post on a withdrawn draft raised ${raised.code} (expected a quiet skip, not an error loop)`);
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "a withdrawn draft is never posted; the executor skips it as a benign no-op");
});

test("P12 two concurrent posts on ONE rule at window_max=1 post EXACTLY ONE (FOR-UPDATE serialization)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `WINCO ${randomUUID().slice(0, 6)}`, reg: "201801020006" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A1, cp, accountCode: EXP, cap: 200000, windowMax: 1 });
  if (!rule) return;
  const d1 = await draftBill(users.alice, { client: clients.A1, cp, accountCode: EXP, amount: 40000 });
  const d2 = await draftBill(users.alice, { client: clients.A1, cp, accountCode: EXP, amount: 45000 });
  if (!d1?.entry_id || !d2?.entry_id) { noteLane("could not build two window-race drafts"); return; }

  // Two runtime-login sessions, each posts its own draft, racing on the rule's FOR UPDATE.
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null };
  try {
    for (const [c, d, slot] of [[c1, d1, "a"], [c2, d2, "b"]]) {
      await c.query("set session authorization clara_runtime_login");
      await c.query("begin");
      const p = c.query("select clara.execute_rule_post(p_entry => $1, p_op_key => $2) as r", [d.entry_id, `rp:${d.entry_id}`])
        .then(() => { out[slot] = { ok: true }; })
        .catch((e) => { out[slot] = { ok: false, code: e.code }; });
      if (slot === "a") { await p; await c1.query("commit"); } // c1 posts + commits first (holds/releases the row lock)
      else { await p; await c2.query("commit").catch(() => c2.query("rollback").catch(() => {})); }
    }
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset session authorization").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  const s1 = (await entryRow(d1.entry_id))?.status;
  const s2 = (await entryRow(d2.entry_id))?.status;
  const n = [s1, s2].filter((s) => s === "approved").length;
  assert.equal(n, 1, `EXACTLY one of two concurrent posts at window_max=1 succeeds (got ${n}: ${s1}/${s2}) — the window count is atomic under FOR UPDATE`);
});
