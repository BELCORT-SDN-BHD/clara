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
  mintInteractive, wakeDraftEntry,
  mintLegacyInvoiceFactsTask, invoiceFactsTask, claimTask, persistInvoiceFacts, factField, statedIdentityFields, agreedEnvelope, factsRegion,
  AP, EXP,
} from "./wave-a-fixtures.mjs";
import { addClientIdentifier } from "./rig-docs-fixtures.mjs";

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

/** Draft a fresh supplier-bill DRAFT for `cp` (the raw material execute_rule_post
 *  posts). It MUST carry coding_kind='supplier_bill' + a document + a counterparty
 *  proposal — i.e. the AGENT/wake lane (the human draft_entry forces coding_kind=NULL,
 *  which the executor rejects as not_eligible_shape). `lines` overrides the default
 *  Dr expense / Cr payable pair. Returns {entry_id, revision_token}. */
async function draftBill(sub, { client, cp, accountCode = EXP, amount = 50000, lines = null, direction = "purchase" }) {
  const firm = await firmOf(client);
  const cred = await mintInteractive(firm);
  // F-A2 PR-1 (D11): a coded AGENT draft is now held to the document's direction on every wake
  // kind, so this fixture states its supplier. It still states no arithmetic — these cells want
  // an UNCORROBORATED bill, and direction is a different question from corroboration.
  const cited = await seedCitedDocument(sub, { firm, client, quote: `RM ${(amount / 100).toFixed(2)}`, direction });
  return wakeDraftEntry(cred, {
    client,
    resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    lines: lines ?? billLines(accountCode, AP, amount),
    document: cited.documentId, sha256: cited.sha256,
    vendor: { existing_id: cp },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    codingKind: "supplier_bill", opKey: opk("bill"),
  });
}

/** Draft a Tier-A CORROBORATED supplier-bill DRAFT for `cp` — the raw material a
 *  LEGITIMATE auto-post acts on (post-v5 the executor REQUIRES corroboration). Seeds a
 *  facts-complete document whose invoice.total CORROBORATES (azure page_polygon Tier-A),
 *  then wake-drafts a supplier_bill citing the MACHINE total region (so the evidence is
 *  'verified' and binds the corroborated gross) with a control leg = the gross. Mirrors
 *  the s6 "Tier-A agreement" recipe. Returns {entry_id, revision_token}. */
async function draftCorroboratedBill(sub, { client, cp, accountCode = EXP, amount = 50000, lines = null }) {
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cred = await mintInteractive(firm);
  const quote = `RM ${(amount / 100).toFixed(2)}`;
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(sub, { firm, client, quote, kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, quote),
    factField(FIELD.currency, "MYR"),
    factField("invoice.vendor_name", "CORROBVENDOR SDN BHD"), // a third party => direction=purchase
    factField("invoice.invoice_id", `INV-${randomUUID().slice(0, 8)}`),
    // 0023 (X5): corroboration is now arithmetic agreement, so a fixture that needs a
    // CORROBORATED total has to state the arithmetic — no SST on this bill, hence a zero tax.
    ...statedIdentityFields(amount),
  ], { envelope: agreedEnvelope() });
  const freg = await factsRegion(cited.documentId, FIELD.total);
  return wakeDraftEntry(cred, {
    client,
    resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    lines: lines ?? billLines(accountCode, AP, amount),
    document: cited.documentId, sha256: cited.sha256,
    vendor: { existing_id: cp },
    evidence: [ev(freg.id, freg.text_content, FIELD.total)],
    codingKind: "supplier_bill", opKey: opk("cbill"),
  });
}

/** F-A2 PR-1 (N1, design §3.4): THE SHAPE FLOORS RUN AT THE DRAFT DOOR on the agent lane now,
 *  so a deliberately MIS-SHAPED coded bill is refused before it becomes a draft. It is the SAME
 *  floor raising the SAME family it raised at approve — only the door moved, and a coded
 *  supplier_bill has no other lane to be born on (clara.draft_entry takes no p_coding_kind).
 *
 *  A cell whose claim is "this shape never posts" is SATISFIED by that refusal and says so here;
 *  it does not get to skip quietly, because an unexpected errcode still fails. A cell whose
 *  claim is about the EXECUTOR's own skip reason needs the draft to exist, and those cells keep
 *  their `assert.ok(draft?.entry_id, …)` — which now fails loudly if N1 ever swallows one. */
function n1DraftRefusal(assert, maybeError, label, codes = ["CLR23", "CLR21"]) {
  if (!(maybeError instanceof Error)) return false;
  assert.ok(codes.includes(maybeError.code),
    `${label}: the draft-door refusal rides the same family the approve door used to raise (got ${maybeError.code}: ${maybeError.message})`);
  return true;
}

/** Generate ≥3 human-approved sightings for (cp, accountCode) — the proposal gaming guard.
 *
 *  F-A2 PR-1: THE POOL IS NOW STATED, NOT BRED. The eighth clara._approve_entry_core body
 *  excises the breeding block, so approving a bill no longer writes a clara.rule_sightings row
 *  and this fixture's pool would be empty — `sign_autopost_rule` would refuse CLR27 and every
 *  executor cell below would take its `if (!rule) return;` early exit and pass VACUOUSLY, which
 *  is worse than failing: a green cell that exercises nothing.
 *
 *  The claim of every cell in this file is about the EXECUTOR's behaviour, not about breeding,
 *  so per the PR-1 claim rule the cells stay (they retire with the verb in PR-3) and only their
 *  fixture changes: the sightings are inserted directly. The table survives KEEP-AS-HISTORY, the
 *  rows are the same shape the retired writer wrote, and the entries they cite are the real
 *  approved bills — so the pool is honest evidence, just no longer a side effect of approving.
 *  What is NO LONGER asserted here is that approval breeds; that claim moved to C.8's inverted
 *  twins, which assert the opposite. */
async function seedSightings(sub, { client, cp, accountCode = EXP, n = 3 }) {
  const firm = await firmOf(client);
  for (let i = 0; i < n; i++) {
    const d = await draftBill(sub, { client, cp, accountCode });
    if (!d?.entry_id) continue;
    await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("sight") }).catch(() => {});
    await rootQuery(
      `insert into clara.rule_sightings(firm_id, client_id, counterparty_id, account_code, entry_id, side)
         values ($1, $2, $3, $4, $5, 'debit')
         on conflict on constraint uq_rule_sightings_mapping do nothing`,
      [firm, client, cp, accountCode, d.entry_id],
    );
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
    // The writer takes a single jsonb proposal (contract §6.2) + p_op_key; the adaptive
    // call packs a `proposal` object (loose keys never map onto the jsonb param).
    const proposal = {
      client_id: client, counterparty_id: cp, account_code: accountCode,
      amount_cap: (cap / 100).toFixed(2), frequency_window: "monthly",
      window_max_posts: windowMax, direction,
    };
    if (expiresAt) proposal.expires_at = expiresAt;
    const proposed = await callFnAdaptive(proposeFn, { proposal, op_key: opk("proprule") },
      { persona: humanPersona(sub), label: proposeFn });
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
  // v5: the executor auto-posts ONLY a CORROBORATED bill (a non-corroborated draft is
  // now skipped not_corroborated — see the RESIDUAL v5 section). The happy path therefore
  // cites a facts-corroborated document with the control leg tied to the verified gross.
  const draft = await draftCorroboratedBill(users.alice, { client: clients.A1, cp, accountCode: EXP, amount: 50000 });
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
  const draft = await draftBill(users.alice, {
    client: clients.A2, cp, amount: 90000,
    lines: [
      { account_code: EXP, debit_cents: 40000, credit_cents: 0, description: "leg-a" },
      { account_code: EXP2, debit_cents: 50000, credit_cents: 0, description: "leg-b (off-rule)" },
      { account_code: AP, debit_cents: 0, credit_cents: 90000, description: "ap" },
    ],
  }).catch((e) => { noteLane(`3-way split draft raised ${e.code}`); return null; });
  assert.ok(draft?.entry_id, "the 3-way split supplier-bill draft was created (mandatory setup)");
  await postViaRule(draft.entry_id).catch(() => {});
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "a 3-way split with an off-rule leg is NOT auto-posted (the whole-entry constraint)");
});

test("FIX-1 execute_rule_post REFUSES an EXTRA control leg (a receivable leg on a purchase bill never launders under the control exemption)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const REC = "300-A00";
  await upsertAccountClassed(users.alice, { client: clients.A2, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("recX") }).catch((e) => noteLane(`recX ${e.code}`));
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `CTRLCO ${randomUUID().slice(0, 6)}`, reg: "201801020103" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A2, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  // Dr EXP(rule) 40000 + Dr receivable-control 5000 + Cr AP 45000 — balanced, under cap.
  // The extra receivable CONTROL leg is the laundering target; the pre-fix executor
  // exempted ALL control lines, so the expense-only whole-entry check passed and it
  // posted. Post-fix: exactly-one-direction-correct-control refuses it.
  const draft = await draftBill(users.alice, {
    client: clients.A2, cp, amount: 45000,
    lines: [
      { account_code: EXP, debit_cents: 40000, credit_cents: 0, description: "expense (rule)" },
      { account_code: REC, debit_cents: 5000, credit_cents: 0, description: "launder-into-receivable" },
      { account_code: AP, debit_cents: 0, credit_cents: 45000, description: "ap" },
    ],
  }).catch((e) => e);
  if (n1DraftRefusal(assert, draft, "FIX-1 extra control leg")) return;
  assert.ok(draft?.entry_id, "the extra-control-leg supplier-bill draft was created (mandatory setup)");
  await postViaRule(draft.entry_id).catch(() => {});
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "a purchase bill with an extra receivable control leg is NOT auto-posted (control-shape refusal)");
  const skip = (await rootQuery("select reason from clara.rule_post_skips where entry_id=$1 order by created_at desc limit 1", [draft.entry_id])).rows[0]?.reason;
  if (skip && skip !== "control_shape") noteLane(`extra-control-leg skipped with reason '${skip}' (expected control_shape)`);
});

test("FIX-6 execute_rule_post discriminates CLR10 — only the benign not_a_draft race is masked; other CLR10 propagate", async (t) => {
  if (skip15(t)) return;
  // The benign not_a_draft race is masked (proven behaviorally by the withdrawn-draft
  // cell). This asserts the DISCRIMINATION exists: the executor inspects the exception
  // detail rather than blanket-catching every CLR10, and the core tags the status race
  // with the not_a_draft marker — so a config-integrity CLR10 (e.g. sst_account_missing)
  // is never silently reported as not_a_draft. Both FAIL against the pre-fix code.
  const src = (await rootQuery("select prosrc from pg_proc where oid='clara.execute_rule_post(uuid,text)'::regprocedure")).rows[0].prosrc;
  assert.match(src, /pg_exception_detail/i, "execute_rule_post inspects the exception detail (no blanket CLR10 catch)");
  assert.match(src, /not_a_draft/, "execute_rule_post keys the benign race on the not_a_draft marker");
  const core = (await rootQuery("select prosrc from pg_proc where oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure")).rows[0].prosrc;
  assert.match(core, /not_a_draft/, "the approve core tags the not-a-draft status race with a distinct detail reason");
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

test("P12 two concurrent posts on ONE rule at window_max=1 post EXACTLY ONE — a REAL two-open-transaction barrier proves FOR-UPDATE serialization", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `WINCO ${randomUUID().slice(0, 6)}`, reg: "201801020006" });
  assert.ok(cp, "the window-race vendor was created (mandatory setup)");
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A1, cp, accountCode: EXP, cap: 200000, windowMax: 1 });
  assert.ok(rule, "the window_max=1 autopost rule was built (mandatory setup)");
  // v5: both drafts must be CORROBORATED to be auto-post-eligible — else the executor skips
  // not_corroborated before the window race is even reached. Each cites its own facts-
  // corroborated document (gross = its amount), so the FOR-UPDATE window count is the sole
  // discriminator that lets EXACTLY ONE through.
  const d1 = await draftCorroboratedBill(users.alice, { client: clients.A1, cp, accountCode: EXP, amount: 40000 });
  const d2 = await draftCorroboratedBill(users.alice, { client: clients.A1, cp, accountCode: EXP, amount: 45000 });
  assert.ok(d1?.entry_id && d2?.entry_id, "both window-race drafts were created (mandatory setup)");

  // TRUE lock-serialization barrier (native #13): BOTH sessions BEGIN; session 1 posts
  // d1 and HOLDS the rule's FOR-UPDATE row lock (uncommitted); session 2 then issues its
  // post and must BLOCK on that same lock — it MUST NOT resolve while session 1 holds the
  // row. Only after session 1 commits does session 2 proceed and re-derive the window
  // count (now exhausted) → skip. This proves serialization, not mere sequential counting.
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  try {
    await c1.query("set session authorization clara_runtime_login");
    await c2.query("set session authorization clara_runtime_login");
    await c1.query("begin");
    await c2.query("begin");
    // Session 1: post d1 (returns, holding the rule row lock until commit).
    await c1.query("select clara.execute_rule_post(p_entry => $1, p_op_key => $2) as r", [d1.entry_id, `rp:${d1.entry_id}`]);
    // Session 2: start its post; it blocks on the rule's FOR UPDATE held by session 1.
    let s2settled = false;
    const p2 = c2.query("select clara.execute_rule_post(p_entry => $1, p_op_key => $2) as r", [d2.entry_id, `rp:${d2.entry_id}`])
      .then((r) => { s2settled = true; return r; })
      .catch((e) => { s2settled = true; throw e; });
    // Barrier: session 2 must still be blocked (not settled) while session 1 holds the lock.
    const raced = await Promise.race([p2.then(() => "settled", () => "settled"), new Promise((res) => setTimeout(() => res("blocked"), 500))]);
    assert.equal(raced, "blocked", "session 2 BLOCKS on the rule FOR-UPDATE while session 1 holds it (true serialization, not sequential counting)");
    assert.equal(s2settled, false, "session 2's post has not resolved while the lock is held");
    // Release: session 1 commits → session 2 unblocks and re-derives the (now-exhausted) window.
    await c1.query("commit");
    await p2.catch(() => {}); // session 2 completes (posts a skip row; no throw expected)
    await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset session authorization").catch(() => {}); // RESET ALL does NOT clear this
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  const s1 = (await entryRow(d1.entry_id))?.status;
  const s2 = (await entryRow(d2.entry_id))?.status;
  const n = [s1, s2].filter((s) => s === "approved").length;
  assert.equal(n, 1, `EXACTLY one of two concurrent posts at window_max=1 succeeds (got ${n}: ${s1}/${s2}) — the window count is atomic under FOR UPDATE`);
});

// ===========================================================================
// RESIDUAL v2 (second adversarial re-verify) — the CRITICAL laundering path was
// only PARTIALLY closed in round 1. These FAIL against the round-1 0015 and PASS
// after the v2 fix.
// ===========================================================================

/** A purchase (supplier) facts doc whose stated MyInvois type_code is as given. */
async function purchaseFactsDoc({ client, typeCode = "02", gross = 50000 }) {
  const firm = await firmOf(client);
  await grantConsent(world.users.alice, { firm, client }).catch(() => {});
  // F-A2 PR-1 (D11): THE CLIENT NEEDS ITS OWN HARD IDENTIFIERS for this page to have a testable
  // direction. The document states a supplier REGISTRATION, and the resolver only treats a
  // stated registration as a miss "when there was something to miss against, in every kind it
  // could have been" — with no tin/ssm on file the (P2) limb cannot fire, the supplier is not
  // yet a known vendor either (this fixture births it during the draft), and the honest answer
  // is unresolved. The resolver's own comment names the remedy: record the client's TIN. A real
  // client has both; the fixture now says so instead of relying on an arm that never ran.
  await addClientIdentifier(world.users.alice, { client, kind: "ssm", value: "199801000099" }).catch(() => {});
  await addClientIdentifier(world.users.alice, { client, kind: "tin", value: "199801000099" }).catch(() => {});
  // 0016 (P3): classify-first gate — kind-stamped at seed (typeCode-matched) so invoice_facts engages directly.
  const kind = typeCode === "02" ? "credit_note" : typeCode === "03" ? "debit_note" : "invoice";
  const cited = await seedCitedDocument(world.users.alice, { firm, client, quote: `RM ${(gross / 100).toFixed(2)}`, kind });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", `RM ${(gross / 100).toFixed(2)}`),
    factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", "THIRDPARTY SUPPLIER SDN BHD"),
    factField("invoice.vendor_registration", "201899123456", { polygon: [], confidence: 0.9 }),
    factField("invoice.type_code", typeCode, { polygon: [], confidence: 0.9 }),
  // NO FAIL-SOFT HERE. This persist is what gives the document its stated supplier identity and
  // therefore its readable DIRECTION; swallowing its failure used to be invisible, and under
  // D11 it is the difference between the cell's own wall firing and the direction arm refusing
  // the draft first. A fixture that cannot state its facts must say so.
  ]);
  return cited;
}

// buildWorld already seeds ONE rounding account per client (COA.rounding); uq_coa_special
// permits only one, so the tests reference the existing code rather than creating another.
const RND = "9990";

test("RESIDUAL-1 execute_rule_post REFUSES a caller-supplied ROUNDING leg carrying a material amount (the 9,999¢ laundering vector)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `RNDLAUNDER ${randomUUID().slice(0, 6)}`, reg: "201801020201" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A1, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  // Dr EXP(rule) 1 + Dr rounding 9,999 + Cr AP 10,000 — balanced, under cap, EXACTLY one
  // payable control, the only signed-account leg hits EXP. Pre-fix the rounding leg was
  // exempted by CATEGORY with no amount bound, so RM99.99 laundered into rounding and it
  // POSTED. Post-fix the expected-account-SET bound (greatest(5, n_legs) sen) refuses it.
  const draft = await draftBill(users.alice, {
    client: clients.A1, cp, amount: 10000,
    lines: [
      { account_code: EXP, debit_cents: 1, credit_cents: 0, description: "signed expense (1 sen)" },
      { account_code: RND, debit_cents: 9999, credit_cents: 0, description: "launder-into-rounding" },
      { account_code: AP, debit_cents: 0, credit_cents: 10000, description: "ap" },
    ],
  }).catch((e) => e);
  if (n1DraftRefusal(assert, draft, "RESIDUAL-1 material rounding leg")) return;
  assert.ok(draft?.entry_id, "the rounding-laundering supplier-bill draft was created (mandatory setup)");
  await postViaRule(draft.entry_id).catch(() => {});
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "a bill with a MATERIAL rounding leg is NOT auto-posted (the expected-account-set laundering bound)");
  const skip = (await rootQuery("select reason from clara.rule_post_skips where entry_id=$1 order by created_at desc limit 1", [draft.entry_id])).rows[0]?.reason;
  if (skip && skip !== "account_mismatch") noteLane(`rounding-launder skipped with reason '${skip}' (expected account_mismatch)`);
});

test("RESIDUAL-1/v5 a ≤5-sen rounding-leg bill is SKIPPED not_corroborated (a rounding leg is inherently non-corroborated → auto-post now refuses it)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `RNDOK ${randomUUID().slice(0, 6)}`, reg: "201801020204" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A1, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  // v5 BEHAVIOR CHANGE (flagged): pre-v5 a ≤5-sen rounding leg auto-posted (the executor's
  // rounding tolerance is generous). But a rounding leg means expense (49,997) ≠ gross
  // (50,000), and the supplier-bill floor's verified-total tie REQUIRES expense=gross exactly
  // — so a CORROBORATED bill can never carry a rounding leg (the floor refuses it). A rounding
  // leg is therefore INHERENTLY non-corroborated, and v5 (auto-post only DB-verified entries)
  // now SKIPS it not_corroborated. The executor's ≤5-sen tolerance still guards the human/agent
  // approve path and any future non-verified admission; it is simply unreachable for auto-post.
  // The >5-sen material-rounding refusal (account_mismatch, next-but-one test) is UNCHANGED.
  const draft = await draftBill(users.alice, {
    client: clients.A1, cp, amount: 50000,
    lines: [
      { account_code: EXP, debit_cents: 49997, credit_cents: 0, description: "expense" },
      { account_code: RND, debit_cents: 3, credit_cents: 0, description: "genuine rounding (3 sen)" },
      { account_code: AP, debit_cents: 0, credit_cents: 50000, description: "ap" },
    ],
  }).catch((e) => { noteLane(`legit-rounding draft raised ${e.code}`); return null; });
  assert.ok(draft?.entry_id, "the ≤5-sen rounding bill draft was created (mandatory setup)");
  await postViaRule(draft.entry_id).catch((e) => noteLane(`≤5-sen rounding post raised ${e.code}`));
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "a ≤5-sen rounding-leg bill is NOT auto-posted under v5 (inherently non-corroborated)");
  const skip = (await rootQuery("select reason from clara.rule_post_skips where entry_id=$1 order by created_at desc limit 1", [draft.entry_id])).rows[0]?.reason;
  // 0016 ADV-R4#1 moved this skip to the earlier named 'facts_missing'. F-A2 PR-1 (D11) moves
  // it once more, and for a stated reason: a coded AGENT draft is now held to the document's
  // DIRECTION, so this fixture's document must state its supplier — which means it states facts.
  // They are uncorroborated facts (no arithmetic, no agreement envelope), so the executor's
  // named skip is 'not_corroborated' rather than 'facts_missing'. The PROTECTED PROPERTY is
  // identical and still asserted above: a ≤5-sen rounding-leg bill NEVER auto-posts.
  assert.equal(skip, "not_corroborated", `the ≤5-sen rounding bill is skipped not_corroborated (got '${skip}')`);
});

test("RESIDUAL-1 the supplier-bill shape floor REFUSES a material rounding leg at APPROVE (defense-in-depth, human path)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `RNDFLOOR ${randomUUID().slice(0, 6)}`, reg: "201801020202" });
  if (!cp) return;
  const draft = await draftBill(users.alice, {
    client: clients.A2, cp, amount: 10000,
    lines: [
      { account_code: EXP, debit_cents: 1, credit_cents: 0, description: "signed expense (1 sen)" },
      { account_code: RND, debit_cents: 9999, credit_cents: 0, description: "launder-into-rounding" },
      { account_code: AP, debit_cents: 0, credit_cents: 10000, description: "ap" },
    ],
  }).catch((e) => e);
  if (n1DraftRefusal(assert, draft, "RESIDUAL-1 floor, material rounding leg")) return;
  assert.ok(draft?.entry_id, "the rounding-laundering supplier-bill draft was created (mandatory setup)");
  let err = null;
  try { await approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("aprnd") }); }
  catch (e) { err = e; }
  assert.ok(err, "a supplier bill with a MATERIAL rounding leg is REFUSED at approve (pre-fix the floor had no rounding-amount bound)");
  assert.equal(err.code, "CLR23", `the material-rounding bill is refused CLR23 (got ${err?.code})`);
  assert.notEqual((await rootQuery("select status from clara.journal_entries where id=$1", [draft.entry_id])).rows[0]?.status, "approved", "the laundering bill is never approved");
});

test("RESIDUAL-2 a supplier_bill drafted against a type-02 (credit-note) document is REFUSED (type_polarity_mismatch)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cited = await purchaseFactsDoc({ client: clients.A1, typeCode: "02", gross: 50000 });
  const firm = await firmOf(clients.A1);
  const cred = await mintInteractive(firm);
  let err = null;
  try {
    await wakeDraftEntry(cred, {
      client: clients.A1,
      resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: cited.documentId }),
      lines: billLines(EXP, AP, 50000),
      document: cited.documentId, sha256: cited.sha256,
      vendor: { new: { name: "THIRDPARTY SUPPLIER SDN BHD", registration_no: "201899123456" } },
      evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
      codingKind: "supplier_bill", opKey: opk("bill02"),
    });
  } catch (e) { err = e; }
  assert.ok(err, "drafting a supplier_bill against a type-02 document is REFUSED (pre-fix the purchase path never checked type_code)");
  assert.equal(err.code, "CLR21", `the type-02 supplier bill is refused CLR21 (got ${err?.code})`);
  assert.match(err.detail ?? err.message ?? "", /type_polarity_mismatch/, "the refusal reason is type_polarity_mismatch");
});

// ===========================================================================
// RESIDUAL v3 (THIRD adversarial re-verify) — the laundering boundary is now a
// COUNT+IDENTITY enumeration (the v2 Σ|dr−cr| tolerance is REPLACED). These FAIL
// against the round-1/v2 0015 (which posted under the sum tolerance) and PASS after.
// ===========================================================================

const SST = "250-000"; // SST-output (liability, special_acc_type='sst_output')

test("FIX-1/v3 execute_rule_post REFUSES N tiny decoy legs (count+identity — a Σ tolerance would have admitted them)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `DECOYCO ${randomUUID().slice(0, 6)}`, reg: "201801020302" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A2, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  // Dr EXP(rule) 1¢ + SIX Dr EXP2 1¢ decoys + Cr AP 7¢ — balanced, under cap. The six decoys
  // (6¢) sit UNDER the old greatest(5, n_legs=8)=8¢ Σ tolerance, so the v2 executor POSTED —
  // laundering 6¢ into an off-rule account, scalable arbitrarily with more legs. v3 COUNTS
  // the legs: six legs outside {control, signed, sst, rounding} => account_mismatch.
  const decoys = Array.from({ length: 6 }, () => ({ account_code: EXP2, debit_cents: 1, credit_cents: 0, description: "decoy 1 sen" }));
  const draft = await draftBill(users.alice, {
    client: clients.A2, cp, amount: 7,
    lines: [
      { account_code: EXP, debit_cents: 1, credit_cents: 0, description: "signed expense (1 sen)" },
      ...decoys,
      { account_code: AP, debit_cents: 0, credit_cents: 7, description: "ap" },
    ],
  }).catch((e) => { noteLane(`decoy-legs draft raised ${e.code}`); return null; });
  assert.ok(draft?.entry_id, "the N-decoy-legs supplier-bill draft was created (mandatory setup)");
  await postViaRule(draft.entry_id).catch(() => {});
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "N tiny decoy legs are NOT auto-posted (count+identity, no Σ tolerance to inflate)");
  const skip = (await rootQuery("select reason from clara.rule_post_skips where entry_id=$1 order by created_at desc limit 1", [draft.entry_id])).rows[0]?.reason;
  if (skip && skip !== "account_mismatch") noteLane(`decoy-legs skipped with reason '${skip}' (expected account_mismatch)`);
});

test("FIX-7/v3 execute_rule_post REFUSES an UNTIED sst_output leg (Dr expense 1¢ / Dr sst_output 9,999¢ / Cr payable — sst is not a free bucket)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  await upsertAccountClassed(users.alice, { client: clients.A2, code: SST, name: "SST Output", type: "liability", special: "sst_output", opKey: opk("sstX") }).catch((e) => noteLane(`sstX ${e.code}`));
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `SSTLAUNDER ${randomUUID().slice(0, 6)}`, reg: "201801020301" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A2, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  // No facts on this draft => NO tax fact. Pre-fix the executor exempted the active
  // sst_output account UNCONDITIONALLY, so 9,999¢ laundered into it and it POSTED. v3 ties
  // the sst_output leg to invoice.tax_total — absent a tax fact, the leg is refused.
  const draft = await draftBill(users.alice, {
    client: clients.A2, cp, amount: 10000,
    lines: [
      { account_code: EXP, debit_cents: 1, credit_cents: 0, description: "signed expense (1 sen)" },
      { account_code: SST, debit_cents: 9999, credit_cents: 0, description: "launder-into-sst" },
      { account_code: AP, debit_cents: 0, credit_cents: 10000, description: "ap" },
    ],
  }).catch((e) => e);
  if (n1DraftRefusal(assert, draft, "FIX-7 untied sst_output leg (executor)")) return;
  assert.ok(draft?.entry_id, "the sst-laundering supplier-bill draft was created (mandatory setup)");
  await postViaRule(draft.entry_id).catch(() => {});
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "a bill with an UNTIED sst_output leg (no tax fact) is NOT auto-posted (the tied-sst gate)");
  const skip = (await rootQuery("select reason from clara.rule_post_skips where entry_id=$1 order by created_at desc limit 1", [draft.entry_id])).rows[0]?.reason;
  if (skip && skip !== "account_mismatch") noteLane(`sst-launder skipped with reason '${skip}' (expected account_mismatch)`);
});

test("FIX-7/v3 the supplier-bill shape floor REFUSES an UNTIED sst_output leg at APPROVE (human path, defense-in-depth)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  await upsertAccountClassed(users.alice, { client: clients.A2, code: SST, name: "SST Output", type: "liability", special: "sst_output", opKey: opk("sstF") }).catch((e) => noteLane(`sstF ${e.code}`));
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `SSTFLOOR ${randomUUID().slice(0, 6)}`, reg: "201801020303" });
  if (!cp) return;
  // No facts => no tax fact. The floor (approve path) must refuse an sst_output leg that
  // cannot tie to a stated tax total — mirroring the executor's autopost gate.
  const draft = await draftBill(users.alice, {
    client: clients.A2, cp, amount: 10000,
    lines: [
      { account_code: EXP, debit_cents: 1, credit_cents: 0, description: "signed expense (1 sen)" },
      { account_code: SST, debit_cents: 9999, credit_cents: 0, description: "launder-into-sst" },
      { account_code: AP, debit_cents: 0, credit_cents: 10000, description: "ap" },
    ],
  }).catch((e) => e);
  if (n1DraftRefusal(assert, draft, "FIX-7 untied sst_output leg (floor)")) return;
  assert.ok(draft?.entry_id, "the untied-sst supplier-bill draft was created (mandatory setup)");
  let err = null;
  try { await approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("apsst") }); }
  catch (e) { err = e; }
  assert.ok(err, "a supplier bill with an untied sst_output leg is REFUSED at approve (no tax fact to tie against)");
  assert.equal(err.code, "CLR23", `the untied-sst bill is refused CLR23 (got ${err?.code})`);
  assert.notEqual((await rootQuery("select status from clara.journal_entries where id=$1", [draft.entry_id])).rows[0]?.status, "approved", "the untied-sst bill is never approved");
});

// ===========================================================================
// FIX-2/v4 (FOURTH adversarial re-verify) — sst_output is a SALES-side (output-tax)
// role ONLY. A supplier bill (PURCHASE) admits NO sst_output leg: Malaysian purchase
// SST is expensed INTO cost (expense=gross), never booked as a separate output-tax
// liability. This SUPERSEDES the v3 purchase-side sst TIE — v3 ALLOWED a purchase sst
// leg that tied to the stated tax fact (the item-2 laundering vector); v4 refuses it
// OUTRIGHT at both the supplier floor (approve) and the executor (auto-post). Each of
// these FAILS pre-v4 (approves / posts) and PASSES after (refused).
// ===========================================================================

test("FIX-2/v4 the supplier-bill floor REFUSES ANY sst_output leg on a PURCHASE at APPROVE (a TIED leg v3 admitted is now refused; sst is sales-only)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  await upsertAccountClassed(users.alice, { client: clients.A2, code: SST, name: "SST Output", type: "liability", special: "sst_output", opKey: opk("sst4") }).catch((e) => noteLane(`sst4 ${e.code}`));
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `SSTV4 ${randomUUID().slice(0, 6)}`, reg: "201801020401" });
  if (!cp) return;
  // Dr EXP=net(10,000) / Dr SST=tax(600) / Cr AP=gross(10,600) — a WELL-FORMED, balanced
  // purchase-with-tax split. Under v3 the supplier floor's sst block only refused an UNTIED
  // leg ('sst_output leg must equal the stated tax total'); this tied-shaped leg PASSED it.
  // Under v4 the floor refuses ANY sst leg on a purchase — the v4 message ('admits no
  // sst_output leg') can ONLY appear post-v4, a clean FAIL-pre-v4 / PASS-post-v4 discriminator.
  const draft = await draftBill(users.alice, {
    client: clients.A2, cp, amount: 10600,
    lines: [
      { account_code: EXP, debit_cents: 10000, credit_cents: 0, description: "expense (net)" },
      { account_code: SST, debit_cents: 600, credit_cents: 0, description: "purchase-sst (would-tie)" },
      { account_code: AP, debit_cents: 0, credit_cents: 10600, description: "ap (gross)" },
    ],
  }).catch((e) => e);
  if (n1DraftRefusal(assert, draft, "FIX-2 any sst_output leg on a purchase")) return;
  assert.ok(draft?.entry_id, "the sst-leg supplier-bill draft was created (mandatory setup)");
  let err = null;
  try { await approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("apsst4") }); }
  catch (e) { err = e; }
  assert.ok(err, "a supplier bill with an sst_output leg is REFUSED at approve (sst is sales-only)");
  assert.equal(err.code, "CLR23", `the sst-leg bill is refused CLR23 (got ${err?.code})`);
  assert.match(err.message ?? "", /admits no sst_output leg/, "refused SPECIFICALLY by the v4 sst-is-sales-only rule (not the v3 tie message) — a clean post-v4 discriminator");
  assert.notEqual((await rootQuery("select status from clara.journal_entries where id=$1", [draft.entry_id])).rows[0]?.status, "approved", "the sst-leg bill is never approved");
});

test("FIX-2/v4 execute_rule_post REFUSES a purchase-side sst_output leg that TIES to the stated tax fact (v3 auto-posted it; v4 counts it as an OUTSIDE leg)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  await upsertAccountClassed(users.alice, { client: clients.A2, code: SST, name: "SST Output", type: "liability", special: "sst_output", opKey: opk("sst4e") }).catch((e) => noteLane(`sst4e ${e.code}`));
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `SSTV4E ${randomUUID().slice(0, 6)}`, reg: "201801020402" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A2, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  // A supplier-bill draft whose document STATES a tax fact (tax_total = 600), shaped
  // Dr EXP=net(10,000) / Dr SST=tax(600) / Cr AP=gross(10,600). The total fact carries an
  // EMPTY polygon on the azure lane, so it never corroborates (v_gross NULL => the control-
  // amount tie stays lenient); the tax_total fact still surfaces. Under v3 the executor
  // EXEMPTED the tied sst leg from the outside-leg count and the sst tie passed => it POSTED.
  // v4 counts a PURCHASE sst leg as an OUTSIDE leg => account_mismatch, never posted.
  const firm = await firmOf(clients.A2);
  const cred = await mintInteractive(firm);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, quote: "RM 106.00" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  if (!task) { noteLane("no invoice_facts task for the sst-v4 executor doc — cell skipped"); return; }
  await claimTask(task.id, { egressApproved: true }).catch((e) => noteLane(`sst4e claim ${e.code}`));
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", "RM 106.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.tax_total", "RM 6.00", { polygon: [], confidence: 0.9 }),
    factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
    factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", "UNRELATED PURCHASE VENDOR SDN BHD"), // non-client => direction purchase
  ]).catch((e) => noteLane(`sst4e persist ${e.code}: ${e.message}`));
  let draft = null;
  try {
    draft = await wakeDraftEntry(cred, {
      client: clients.A2,
      resolution: await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId }),
      lines: [
        { account_code: EXP, debit_cents: 10000, credit_cents: 0, description: "expense (net)" },
        { account_code: SST, debit_cents: 600, credit_cents: 0, description: "purchase-sst (ties to the tax fact)" },
        { account_code: AP, debit_cents: 0, credit_cents: 10600, description: "ap (gross)" },
      ],
      document: cited.documentId, sha256: cited.sha256,
      vendor: { existing_id: cp },
      evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
      codingKind: "supplier_bill", opKey: opk("billf"),
    });
  } catch (e) { noteLane(`sst-v4 executor draft raised ${e.code}: ${e.message}`); return; }
  if (!draft?.entry_id) { noteLane("sst-v4 executor draft not created"); return; }
  await postViaRule(draft.entry_id).catch(() => {});
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "a purchase bill with a TIED sst_output leg is NOT auto-posted (v4: sst is sales-only; v3 posted it)");
  const skip = (await rootQuery("select reason from clara.rule_post_skips where entry_id=$1 order by created_at desc limit 1", [draft.entry_id])).rows[0]?.reason;
  if (skip && skip !== "account_mismatch") noteLane(`sst-v4 executor skipped with reason '${skip}' (expected account_mismatch — the purchase sst leg as an outside leg)`);
});

// ===========================================================================
// RESIDUAL v5 (FIFTH adversarial re-verify) — CORROBORATION-REQUIRED to auto-post.
// The executor's control-leg tie only anchors to gross when gross is non-NULL; a
// NON-corroborated document (a blank/malformed/unreadable total, or any state short of
// Tier-A) leaves gross NULL, so a coded draft (the runtime submits EVERY entry.drafted —
// rule-post.mjs, incl. interactive wake drafts) could carry an ARBITRARY under-cap
// balanced amount with no verified anchor. v5 adds a corroboration-required admission
// gate: a non-corroborated entry SKIPS not_corroborated and stays in the human queue.
// Each FAILS pre-v5 (the draft POSTS) and PASSES after (skipped not_corroborated). The
// gate is placed LAST, so a shaped-but-non-corroborated draft (an sst/decoy/rounding
// laundering shape) still skips its SPECIFIC reason first — only a CLEAN-shaped
// non-corroborated draft (the residual-5 path) lands on not_corroborated.
// ===========================================================================

test("RESIDUAL-5 execute_rule_post SKIPS not_corroborated a CLEAN draft on a NO-FACTS document (v_gross NULL — the blank-total auto-post path; pre-v5 it POSTED)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `NOFACTSCO ${randomUUID().slice(0, 6)}`, reg: "201801020501" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A1, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  // draftBill seeds an OCR-cited doc with NO invoice_facts extraction ⇒ _invoice_fact_state
  // returns {} ⇒ corroborated absent, v_gross NULL. Clean shape (Dr EXP 50,000 / Cr AP 50,000),
  // under cap, matches the live rule. Pre-v5: the lenient control tie let it POST with no
  // verified total. Post-v5: the corroboration gate SKIPS it.
  const draft = await draftBill(users.alice, { client: clients.A1, cp, accountCode: EXP, amount: 50000 });
  if (!draft?.entry_id) { noteLane("no-facts draft not created"); return; }
  await postViaRule(draft.entry_id).catch((e) => noteLane(`no-facts post raised ${e.code}: ${e.message}`));
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "a non-corroborated (no-facts) draft is NOT auto-posted (pre-v5 it posted)");
  const skip = (await rootQuery("select reason from clara.rule_post_skips where entry_id=$1 order by created_at desc limit 1", [draft.entry_id])).rows[0]?.reason;
  // 0016 ADV-R4#1 moved this to the named 'facts_missing' skip. F-A2 PR-1 (D11) moves it again:
  // a coded agent draft is now held to the document's DIRECTION, so the fixture states a
  // supplier and the document therefore states facts — uncorroborated ones, with no arithmetic
  // and no agreement envelope. The executor's named skip is 'not_corroborated', which is the
  // honest reason for THIS document, and the protected property asserted above is unchanged:
  // a non-corroborated draft is never auto-posted.
  assert.equal(skip, "not_corroborated", `a non-corroborated draft is skipped not_corroborated (got '${skip}')`);
});

test("RESIDUAL-5 execute_rule_post SKIPS not_corroborated a draft on a document whose total is MALFORMED ('N/A' persists non-corroborated) with an ARBITRARY amount", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `MALFORMEDCO ${randomUUID().slice(0, 6)}`, reg: "201801020502" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A2, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  // A facts doc whose invoice.total is UNREADABLE ('N/A' ⇒ monetary_cents NULL). invoice.total
  // is deliberately allowed to persist blank/non-corroborated (fail-closed) — so total_cents is
  // NULL, corroborated is false, and v_gross stays NULL (the control tie is inert). The wake
  // draft then supplies an ARBITRARY under-cap balanced amount (50,000) citing the readable OCR
  // region. Pre-v5 the executor posted it despite the blank total (the exact residual-5 hole);
  // post-v5 the corroboration gate SKIPS it.
  const firm = await firmOf(clients.A2);
  await grantConsent(users.alice, { firm, client: clients.A2 }).catch(() => {});
  const cred = await mintInteractive(firm);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, quote: "RM 500.00" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  if (!task) { noteLane("no invoice_facts task for the malformed-total doc — cell skipped"); return; }
  await claimTask(task.id, { egressApproved: true }).catch((e) => noteLane(`malformed claim ${e.code}`));
  await persistInvoiceFacts(task.id, [
    factField(FIELD.total, "N/A"), // malformed ⇒ persists with monetary_cents NULL, never corroborates
    factField(FIELD.currency, "MYR"),
    factField("invoice.vendor_name", "MALFORMED PURCHASE VENDOR SDN BHD"),
  ]).catch((e) => noteLane(`malformed persist ${e.code}: ${e.message}`));
  const fs = (await rootQuery("select clara._invoice_fact_state($1) as s", [cited.documentId])).rows[0].s;
  assert.equal(fs.corroborated ?? false, false, "the malformed-total doc is non-corroborated (mandatory setup)");
  let draft = null;
  try {
    draft = await wakeDraftEntry(cred, {
      client: clients.A2,
      resolution: await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId }),
      lines: billLines(EXP, AP, 50000), // arbitrary amount, unmoored from the (unreadable) total
      document: cited.documentId, sha256: cited.sha256,
      vendor: { existing_id: cp },
      evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
      codingKind: "supplier_bill", opKey: opk("mbill"),
    });
  } catch (e) { noteLane(`malformed-total draft raised ${e.code}: ${e.message}`); return; }
  if (!draft?.entry_id) { noteLane("malformed-total draft not created"); return; }
  await postViaRule(draft.entry_id).catch((e) => noteLane(`malformed-total post raised ${e.code}: ${e.message}`));
  assert.notEqual((await entryRow(draft.entry_id))?.status, "approved", "a draft on a malformed-total (non-corroborated) doc is NOT auto-posted (pre-v5 it posted)");
  const skip = (await rootQuery("select reason from clara.rule_post_skips where entry_id=$1 order by created_at desc limit 1", [draft.entry_id])).rows[0]?.reason;
  assert.equal(skip, "not_corroborated", `a malformed-total draft is skipped not_corroborated (got '${skip}')`);
});

test("RESIDUAL-5 POSITIVE CONTROL — a legit CORROBORATED bill STILL auto-posts (checked_via_rule_id stamped; never not_corroborated) — the gate does not over-tighten", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `CORROBOK ${randomUUID().slice(0, 6)}`, reg: "201801020503" });
  if (!cp) return;
  const rule = await buildLiveAutopostRule(users.alice, { client: clients.A2, cp, accountCode: EXP, cap: 200000, windowMax: 3 });
  if (!rule) return;
  // A Tier-A CORROBORATED bill (facts-complete doc, total corroborates; control leg = the
  // verified gross). The corroboration gate PASSES and the entry auto-posts through the approve
  // core with the rule's signature — the confidence ladder's DB-verified auto-post.
  const draft = await draftCorroboratedBill(users.alice, { client: clients.A2, cp, accountCode: EXP, amount: 50000 });
  if (!draft?.entry_id) { noteLane("corroborated positive-control draft not created"); return; }
  await postViaRule(draft.entry_id).catch((e) => noteLane(`corroborated post raised ${e.code}: ${e.message}`));
  const row = await entryRow(draft.entry_id);
  assert.equal(row?.status, "approved", "a legit CORROBORATED bill still auto-posts under v5 (the gate does not over-tighten)");
  assert.ok(row?.checked_via_rule_id, "the corroborated auto-post stamps checked_via_rule_id (the rule carried the checker authority)");
  const skip = (await rootQuery("select reason from clara.rule_post_skips where entry_id=$1 order by created_at desc limit 1", [draft.entry_id])).rows[0]?.reason;
  assert.notEqual(skip, "not_corroborated", "a corroborated bill is NEVER skipped not_corroborated");
});
