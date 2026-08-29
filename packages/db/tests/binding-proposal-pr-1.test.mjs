// 裁-18b PR-1 — the Clara vendor-binding PROPOSAL door.
//
// Design of record: docs/plan/active/binding-proposal-design.md (as amended by its 裁-25 header
// block) · gate record docs/plan/active/binding-proposal-gate-record.md (G1-G8, all RULED) ·
// ruling ledger docs/plan/active/mohe-grill-rulings-2026-08-28.md 裁-25.
//
// THIS DOOR IS AN INJECTION SURFACE. Clara composes p_basis, p_rationale and p_model from model
// output; the whole point of the design is that NONE of it can become a fact. Law 28's
// cross-model adversarial pass is owed at review, so this battery is written to be DRIVEN by a
// reviewer, not merely read: every wall has a cell that makes it REFUSE, and every wall has a
// MUTANT cell that removes exactly that wall from the LIVE body and proves the refusal
// disappears. A wall with no mutant is a wall nobody has measured.
//
// FAIL, NEVER SKIP. The migration is UNNUMBERED on the branch (the conductor claims its number
// at merge prep), so readiness is probed by CATALOG — exact-signature to_regprocedure — not by a
// schema_migrations version string that does not exist yet. Against the pre-migration frontier
// this battery goes RED, deliberately (.claude/rules/db-tests.md; the estate's fail0017 idiom).
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, assertRaises, endPool, rootQuery, humanQuery, roleQuery,
  namedCall, CLR, PG, AGENT_USER_ID,
} from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { buildWorld } from "./x1-helpers.mjs";
import {
  has28, has29, seedPayableAccount, propose, sign, revoke,
} from "./x36-vendor-binding-helpers.mjs";
import {
  bp1Live, failBp1, reasonOf, mintCred, MODEL, WAKE_ROLE,
  proposeAsAgent, listCandidates, declineBinding, resetDecline,
  derivedBasis, lawfulBasis, evidenceDocuments, foreignRegion,
  supersedeInvoiceFactsKeepingRegions, seedVendorNoRegistration, mergeAway,
  seedWindow, seedUniqueFamilyVendor, DATES_OK, withMutant, withoutConstraint,
} from "./binding-proposal-pr-1-helpers.mjs";

const CORE_SIG =
  "clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text)";
const DOOR_SIG = "clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)";
const READ_SIG = "clara.wake_list_binding_candidates(uuid)";
const DECLINE_SIG = "clara.decline_vendor_identity_binding(uuid,text,text)";
const BLOCKER_SIG = "clara._binding_extra_blocker(uuid,uuid,uuid,jsonb,jsonb)";
const SUPPRESSION_SIG = "clara._binding_suppression(uuid,uuid,uuid)";

let live = false;
let w = null;

before(async () => {
  if (!(await has28()) || !(await has29())) {
    noteLane("0028/0029 absent — the binding machinery this door extends is not built");
  }
  live = await bp1Live();
  if (!live) return;
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
  await seedPayableAccount(w.firms.A, w.clients.A2);
});
after(async () => { printLaneNotes("binding-proposal-pr-1"); await endPool(); });

/** A fresh filing credential — wake credentials are single-firm and this battery makes many
 *  calls; minting per cell keeps a consumed/expired credential from cross-contaminating cells. */
const cred = (kind = "filing", firm = null, obo = null) =>
  mintCred({ kind, firm: firm ?? w.firms.A, onBehalfOf: obo ?? w.users.alice });

const filingActor = async () => ({ role: WAKE_ROLE.filing, ...(await cred("filing")) });
const interactiveActor = async () => ({ role: WAKE_ROLE.interactive, ...(await cred("interactive")) });

/** clara.mint_wake_credential enforces a per-kind client/on_behalf_of shape (e.g. an autodraft
 *  credential "requires a firm-congruent active client and no on_behalf_of"). Encoding it once
 *  here keeps every non-admitted-kind cell minting a REAL credential rather than tripping the
 *  minter and never reaching the wall it means to test. */
const CLIENT_BOUND = new Set(["autodraft", "interactive_client", "close_prep", "bank_agent"]);
const credOfKind = (kind) => mintCred(CLIENT_BOUND.has(kind)
  ? { kind, firm: w.firms.A, onBehalfOf: null, client: w.clients.A1 }
  : { kind, firm: w.firms.A, onBehalfOf: w.users.alice, client: null });

// A vendor that clears EVERY wall: the frozen ladder, and the four the 2026-08-29 adversarial
// pass added. x36's seedPassingWindow cannot be used any more — its vendors all share the
// "EZACCOUNT" family token (W15 refuses the second one) and its three documents carry ONE
// printed invoice id (W16 refuses that as one invoice seen three times).
async function eligibleVendor(tag, client = null) {
  const cp = await seedWindow(w, tag, { dates: DATES_OK, client: client ?? w.clients.A1 });
  const basis = await lawfulBasis(w.firms.A, client ?? w.clients.A1, cp.id);
  return { cp, basis };
}

const bindingRow = async (id) =>
  (await rootQuery("select * from clara.vendor_identity_bindings where id=$1", [id])).rows[0];
const receiptRow = async (id) =>
  (await rootQuery("select * from clara.binding_agent_receipts where id=$1", [id])).rows[0];

// ===========================================================================
// READINESS
// ===========================================================================

test("bp1.0 readiness — the three new doors resolve at their EXACT signatures", async () => {
  failBp1(live);
  assert.ok(w, "world built");
  const r = await rootQuery(
    `select to_regprocedure($1) a, to_regprocedure($2) b, to_regprocedure($3) c, to_regprocedure($4) d`,
    [CORE_SIG, DOOR_SIG, READ_SIG, DECLINE_SIG]);
  assert.ok(r.rows[0].a && r.rows[0].b && r.rows[0].c && r.rows[0].d, "all four bodies resolve");
});

// ===========================================================================
// B — WAKE AUTHORITY. Both directions, with REAL credentials through the REAL
// executor roles (the F-A7b PR-a lesson: an allowlist READ is not an authority proof).
// The two walls are INDEPENDENT and are proven independently:
//   the GRANT split (PRD §6 2(d)) — which ROLE may EXECUTE the function at all;
//   the per-kind ALLOWLIST (PRD §6 2(c)) — which wake KIND the credential may carry.
// A role that holds the grant but presents a non-admitted credential must still refuse, and
// that is the only cell that can tell the two walls apart.
// ===========================================================================

test("bp1.B1 filing credential through clara_wake_filing — ADMITTED, one proposal + one receipt", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("B1");
  const r = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  assert.equal(r.status, "proposed");
  assert.ok(r.binding_id && r.receipt_id, "binding_id + receipt_id returned");
  const b = await bindingRow(r.binding_id);
  assert.equal(b.status, "proposed");
  assert.equal(b.created_by, AGENT_USER_ID, "created_by is the agent sentinel");
  assert.equal(b.proposed_by_agent, true);
  assert.equal(b.proposer_model, `${MODEL.provider}/${MODEL.model}/${MODEL.version}`);
  assert.equal(b.proposal_receipt_id, r.receipt_id);
  const rec = await receiptRow(r.receipt_id);
  assert.equal(rec.via_wake_kind, "filing");
  // THE HONEST TRIGGER PAIR (conductor ruling 2026-08-29). A credential of a ruled kind carries
  // no agent_task_id — mint_wake_credential_for_task admits 'close_prep' only — so the id on the
  // receipt IS a credential uuid, and it is recorded under its OWN name. The estate's three
  // existing writers put a credential uuid under 'wake_task'; this door does not.
  assert.equal(rec.trigger_kind, "wake_credential");
  const cid = await rootQuery(
    "select id from clara.wake_credentials where id = $1::uuid", [rec.trigger_id]);
  assert.equal(cid.rowCount, 1, "trigger_id resolves to a REAL wake credential row");
  assert.equal(rec.binding_id, r.binding_id);
});

test("bp1.B2 interactive credential through clara_wake_interactive — ADMITTED (trigger T2, 裁-18c's way out)", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("B2");
  const r = await proposeAsAgent(await interactiveActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  assert.equal(r.status, "proposed");
  const rec = await receiptRow(r.receipt_id);
  assert.equal(rec.via_wake_kind, "interactive");
  // The interactive ask has no turn id either, so it is recorded the same honest way. An
  // earlier draft wrote 'chat_turn' here with a CREDENTIAL uuid under it — the exact looseness
  // the conductor's 2026-08-29 ruling forbids; 'chat_turn' is not even an admitted value now.
  assert.equal(rec.trigger_kind, "wake_credential");
});

test("bp1.B2b the trigger contract — 'chat_turn' is NOT admitted, and 'wake_task' means a REAL task", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("B2b");
  // (a) the value this table deliberately did NOT carry over from the estate's other two receipt
  //     tables is genuinely absent from the closed world — measured, not merely not-written.
  // A REAL binding_id: the column is NOT NULL now (gate O2/B2), so a null one would be refused
  // by 23502 before the trigger_kind CHECK is ever reached — the probe has to isolate the
  // constraint it names.
  const other = await eligibleVendor("B2b-anchor");
  const anchor = await proposeAsAgent(await filingActor(),
    { client: w.clients.A1, counterparty: other.cp.id, basis: other.basis });
  await assertRaises(PG.checkViolation, () => rootQuery(
    `insert into clara.binding_agent_receipts(firm_id,client_id,counterparty_id,binding_id,rationale,
        verdict,via_wake_kind,trigger_kind,trigger_id,acting_actor)
     values($1,$2,$3,$5,'probe','{}'::jsonb,'filing','chat_turn','x',$4)`,
    [w.firms.A, w.clients.A1, other.cp.id, AGENT_USER_ID, anchor.binding_id]), "chat_turn");
  // (b) the wake_task branch is REAL, not dead plumbing: attach an agent_tasks row to a filing
  //     credential and the receipt records THAT id, under 'wake_task'. No product path can mint
  //     such a credential for this door today (mint_wake_credential_for_task admits close_prep
  //     only), which is exactly why the branch is pinned here — PR-4's clocked sweep inherits a
  //     proven contract instead of an untested one.
  const c = await cred("filing");
  // kind='autodraft' is the cheapest lawful agent_tasks shape (clara._tf_agent_task_insert
  // requires a wake task to carry a wake_intents row and a chat_turn task a chat_sessions row).
  // Which KIND the task is does not matter to the contract under test — only that trigger_id
  // resolves to a real clara.agent_tasks row.
  const task = (await rootQuery(
    `insert into clara.agent_tasks(firm_id,client_id,kind,status,model_snapshot,created_by)
     values($1,$2,'autodraft','queued','rig/fixture/1',$3) returning id`,
    [w.firms.A, w.clients.A1, AGENT_USER_ID])).rows[0].id;
  await rootQuery("update clara.wake_credentials set agent_task_id=$2 where id=$1", [c.credentialId, task]);
  const r = await proposeAsAgent({ role: WAKE_ROLE.filing, ...c },
    { client: w.clients.A1, counterparty: cp.id, basis });
  const rec = await receiptRow(r.receipt_id);
  assert.equal(rec.trigger_kind, "wake_task");
  assert.equal(rec.trigger_id, task, "trigger_id is the REAL agent_tasks id, never the credential uuid");
});

test("bp1.B3 the GRANT wall — clara_wake_proactive / clara_wake_bank cannot EXECUTE at all (42501)", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("B3");
  for (const [kind, role] of [
    ["proactive", WAKE_ROLE.proactive],
    ["bank_agent", WAKE_ROLE.bank],
  ]) {
    const c = await credOfKind(kind);
    await assertRaises(PG.insufficientPrivilege,
      () => proposeAsAgent({ role, ...c }, { client: w.clients.A1, counterparty: cp.id, basis }),
      `${kind} through ${role}`);
  }
});

test("bp1.B4 the ALLOWLIST wall — a granted role presenting a NON-admitted kind still refuses CLR03", async () => {
  failBp1(live);
  // This is the discriminating cell: clara_wake_interactive HOLDS the EXECUTE grant, so a
  // refusal here can only be the per-kind allowlist. Five non-admitted kinds, each with a real
  // credential, all through the role that CAN execute the function.
  const { cp, basis } = await eligibleVendor("B4");
  const kinds = ["autodraft", "interactive_client", "close_prep", "bank_agent", "proactive"];
  for (const kind of kinds) {
    const c = await credOfKind(kind);
    const err = await assertRaises(CLR.wake,
      () => proposeAsAgent({ role: WAKE_ROLE.interactive, ...c },
        { client: w.clients.A1, counterparty: cp.id, basis }),
      `${kind} through clara_wake_interactive (allowlist wall)`);
    assert.match(err.message, /may not call wake_propose_vendor_identity_binding/,
      `${kind}: refused by assert_wake_allowed, not by something else`);
  }
});

test("bp1.B4m MUTANT — allowlisting `autodraft` makes B4's autodraft arm stop refusing CLR03", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("B4m");
  const c = await credOfKind("autodraft");
  await rootQuery(
    "insert into clara.wake_fn_allowlist(wake_kind,function_name) values('autodraft','wake_propose_vendor_identity_binding')");
  try {
    let code = null;
    try {
      await proposeAsAgent({ role: WAKE_ROLE.interactive, ...c },
        { client: w.clients.A1, counterparty: cp.id, basis });
    } catch (e) { code = e.code; }
    assert.notEqual(code, CLR.wake,
      "with the allowlist row present the call must NOT refuse CLR03 — otherwise B4 was measuring something else");
  } finally {
    await rootQuery(
      "delete from clara.wake_fn_allowlist where wake_kind='autodraft' and function_name='wake_propose_vendor_identity_binding'");
    const back = await rootQuery(
      "select count(*)::int n from clara.wake_fn_allowlist where function_name ilike '%binding%'");
    assert.equal(back.rows[0].n, 4, "the allowlist is restored to exactly the 4 ruled rows");
  }
});

test("bp1.B5 no credential at all — CLR03 (wake_context returns nothing)", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("B5");
  const specs = [
    { name: "p_client" }, { name: "p_counterparty" }, { name: "p_basis", cast: "jsonb" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" },
  ];
  await assertRaises(CLR.wake, () => roleQuery(WAKE_ROLE.filing,
    namedCall("wake_propose_vendor_identity_binding", specs),
    [w.clients.A1, cp.id, JSON.stringify(basis), "no credential", JSON.stringify(MODEL), opk("nocred")]),
    "clara_wake_filing with no wake secret set");
});

test("bp1.B6 a human session (clara_authenticated) cannot EXECUTE either wake verb — 42501", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("B6");
  const specs = [
    { name: "p_client" }, { name: "p_counterparty" }, { name: "p_basis", cast: "jsonb" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" },
  ];
  await assertRaises(PG.insufficientPrivilege, () => humanQuery(w.users.alice,
    namedCall("wake_propose_vendor_identity_binding", specs),
    [w.clients.A1, cp.id, JSON.stringify(basis), "human", JSON.stringify(MODEL), opk("human")]),
    "admin human calling the wake wrapper");
  await assertRaises(PG.insufficientPrivilege, () => humanQuery(w.users.alice,
    "select * from clara.wake_list_binding_candidates(p_client => $1)", [w.clients.A1]),
    "admin human calling the wake read verb");
});

test("bp1.B7 ACL census — six roles hold ZERO execute on both wake verbs and both internals", async () => {
  failBp1(live);
  const r = await rootQuery(
    `select string_agg(format('%s=%s', t.fn, t.rol), ', ') bad from (
       select f.fn, rr.rol from
         (values ($1),($2),($3),($4)) f(fn)
         cross join (values ('clara_authenticated'),('clara_agent_ro'),('clara_wake_proactive'),
                            ('clara_wake_bank'),('clara_freeform_ro'),('clara_runtime')) rr(rol)) t
      where has_function_privilege(t.rol, t.fn, 'EXECUTE')`,
    [DOOR_SIG, READ_SIG, CORE_SIG, "clara._derive_vendor_binding_basis(uuid,uuid,uuid)"]);
  assert.equal(r.rows[0].bad, null, `a door is reachable by a role it must not be: ${r.rows[0].bad}`);
});

test("bp1.B7m MUTANT — the ACL census is DISCRIMINATING (grant one, it must fail)", async () => {
  failBp1(live);
  const census = async () => (await rootQuery(
    "select has_function_privilege('clara_agent_ro', $1, 'EXECUTE') as p", [DOOR_SIG])).rows[0].p;
  assert.equal(await census(), false, "baseline: clara_agent_ro holds nothing");
  await rootQuery(`grant execute on function ${DOOR_SIG} to clara_agent_ro`);
  try {
    assert.equal(await census(), true, "the census SEES a grant — it is not a tautology");
  } finally {
    await rootQuery(`revoke execute on function ${DOOR_SIG} from clara_agent_ro`);
    assert.equal(await census(), false, "restored");
  }
});

// ===========================================================================
// W — THE WALLS (design §3.4). Each refusal asserted BY NAME (SQLSTATE + the typed
// DETAIL reason token), never by prose alone.
// ===========================================================================

test("bp1.W3 firm congruence — a client of firm B through a firm-A credential is CLR11", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W3");
  const err = await assertRaises(CLR.notFound,
    async () => proposeAsAgent(await filingActor(), { client: w.clients.B1, counterparty: cp.id, basis }),
    "cross-firm client");
  assert.equal(reasonOf(err), "cross_firm");
});

test("bp1.W3m MUTANT — removing the client wall admits the cross-firm call past CLR11", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W3m");
  await withMutant(CORE_SIG, [[
    "  if not exists (select 1 from clara.clients where id = p_client and firm_id = p_firm) then",
    "  if false then",
  ]], async () => {
    let code = null;
    try {
      await proposeAsAgent(await filingActor(), { client: w.clients.B1, counterparty: cp.id, basis });
    } catch (e) { code = e.code; }
    assert.notEqual(code, CLR.notFound, "without the wall the call no longer refuses CLR11");
  });
});

test("bp1.W4 counterparty liveness/attributability — delegated to the frozen derivation", async () => {
  failBp1(live);
  // (a) INACTIVE. A counterparty is retired by MERGING it — clara._tf_counterparty_update_0011
  // is a positive column whitelist whose merge branch admits exactly {merged_into, retired_at,
  // updated_at}, so a hand-set retired_at alone is refused CLR08 'illegal counterparty
  // mutation'. Merging is the substrate's own retirement, which is what makes this the real
  // fixture rather than a convenient one.
  const retired = await seedWindow(w, "W4a", { dates: DATES_OK });
  const survivor = await seedWindow(w, "W4a-survivor", { dates: DATES_OK });
  const basisR = await lawfulBasis(w.firms.A, w.clients.A1, retired.id);
  await mergeAway(retired.id, survivor.id);
  const e1 = await assertRaises("CLR36",
    async () => proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: retired.id, basis: basisR }),
    "merged-away counterparty");
  assert.match(e1.message, /binding_counterparty_inactive/);

  // (b) UNATTRIBUTABLE — a vendor carrying no registration at all. Built registration-free at
  // INSERT (vendors are out of scope for the name-only guard), because blanking the column
  // later is likewise outside that update whitelist.
  const blank = await seedVendorNoRegistration(w.firms.A, w.clients.A1, "W4b");
  await seedWindow(w, "W4b", { dates: DATES_OK, vendor: { ...blank, reg: "NONE", lead: "NOREG" } });
  const e2 = await assertRaises("CLR36",
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: blank.id, basis: { citations: [{ region_id: blank.id }] } }),
    "unattributable counterparty");
  assert.match(e2.message, /binding_unattributable/);
});

test("bp1.W5 rationale + model shape refuse CLR10 BEFORE the reservation is burned", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W5");
  const k1 = opk("w5rat");
  const e1 = await assertRaises(CLR.badRequest,
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: cp.id, basis, rationale: "   ", opKey: k1 }),
    "blank rationale");
  assert.equal(reasonOf(e1), "invalid_request");
  assert.match(e1.detail, /"class":"rationale"/);

  const k2 = opk("w5mod");
  const e2 = await assertRaises(CLR.badRequest,
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: cp.id, basis,
        model: { provider: "anthropic", model: "claude-opus-5" }, opKey: k2 }),
    "model missing version");
  assert.match(e2.detail, /"class":"model_snapshot"/);

  // The ordering claim, MEASURED: neither refusal left an op_receipts reservation behind. (A
  // RAISE would roll one back anyway — this cell is what proves the walls sit ABOVE _reserve_op
  // rather than relying on that rollback, which is the difference between a TYPED CLR10 and an
  // untyped 23514 arriving after a reservation.)
  const n = await rootQuery(
    "select count(*)::int c from clara.op_receipts where op_key = any($1)", [[k1, k2]]);
  assert.equal(n.rows[0].c, 0, "no reservation was written by a shape refusal");
});

test("bp1.W5m MUTANT — removing the rationale wall admits a blank rationale past CLR10", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W5m");
  await withMutant(CORE_SIG, [["  if v_rationale is null then", "  if false then"]], async () => {
    let code = null;
    try {
      await proposeAsAgent(await filingActor(),
        { client: w.clients.A1, counterparty: cp.id, basis, rationale: "   " });
    } catch (e) { code = e.code; }
    // Without the wall the blank rationale reaches the receipt's own NOT-BLANK CHECK (23514) or
    // succeeds — either way it is no longer this door's TYPED refusal, which is the point.
    assert.notEqual(code, CLR.badRequest, "the typed CLR10 came from the wall, not from elsewhere");
  });
});

// ---------------------------------------------------------------------------
// W6 — 裁-22. The basis. This is the injection surface proper.
// ---------------------------------------------------------------------------

test("bp1.W6a `sightings` is a FORBIDDEN key — refused, not ignored (PRD §6 invariant 1)", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W6a");
  const err = await assertRaises(CLR.badRequest,
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: cp.id, basis: { ...basis, sightings: 3 } }),
    "model-supplied sightings");
  assert.match(err.detail, /"constraint":"no_model_sightings"/);
  // ...and a sightings of ZERO, or null, is refused too: the wall is on the KEY's presence, not
  // on its value, so no "well, it was only zero" path exists.
  for (const v of [0, null, "3"]) {
    await assertRaises(CLR.badRequest,
      async () => proposeAsAgent(await filingActor(),
        { client: w.clients.A1, counterparty: cp.id, basis: { ...basis, sightings: v } }),
      `sightings=${JSON.stringify(v)}`);
  }
});

test("bp1.W6am MUTANT — removing the forbidden-key wall admits a model-asserted sighting count", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W6am");
  await withMutant(CORE_SIG, [["  if p_basis ? 'sightings' then", "  if false then"]], async () => {
    const r = await proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: cp.id, basis: { ...basis, sightings: 99 } });
    assert.equal(r.status, "proposed", "without the wall the poisoned basis is ADMITTED");
    // And the receipt then records the DB's own resolved count regardless — so even the mutant
    // cannot get 99 into a durable field. The wall is defence in depth over a structural floor.
    const rec = await receiptRow(r.receipt_id);
    assert.notEqual(rec.verdict.basis.citation_count, 99,
      "the resolver derives sightings; the model's 99 never becomes the durable number");
  });
});

test("bp1.W6b an empty / malformed basis refuses CLR10", async () => {
  failBp1(live);
  const { cp } = await eligibleVendor("W6b");
  const bad = [
    [{ citations: [] }, "empty citations array"],
    [{ citations: "nope" }, "citations not an array"],
    [{}, "no citations key"],
    [null, "null basis"],
  ];
  for (const [basis, label] of bad) {
    await assertRaises(CLR.badRequest,
      async () => proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis }),
      label);
  }
});

test("bp1.W6c a citation region of ANOTHER FIRM's document is refused, and nothing is written", async () => {
  failBp1(live);
  const { cp } = await eligibleVendor("W6c");
  const foreign = await foreignRegion(w.firms.B, "W6c-otherfirm");
  const before = await rootQuery(
    "select count(*)::int c from clara.vendor_identity_bindings where counterparty_id=$1", [cp.id]);
  await assertRaises(CLR.badRequest,
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: cp.id, basis: { citations: [{ region_id: foreign.region }] } }),
    "cross-firm citation");
  const after = await rootQuery(
    "select count(*)::int c from clara.vendor_identity_bindings where counterparty_id=$1", [cp.id]);
  assert.equal(after.rows[0].c, before.rows[0].c, "no binding row was written");
  const rec = await rootQuery(
    "select count(*)::int c from clara.binding_agent_receipts where counterparty_id=$1", [cp.id]);
  assert.equal(rec.rows[0].c, 0, "no receipt was written — a refusal leaves no card");
});

test("bp1.W6d a citation of a document NOT among the three evidence documents is refused", async () => {
  failBp1(live);
  const { cp } = await eligibleVendor("W6d");
  // A real, CURRENT-generation region of a document of the SAME firm that the derivation simply
  // did not select. This is the cell that proves the document SET comes from the DERIVATION and
  // not from the model.
  const other = await foreignRegion(w.firms.A, "W6d-samefirm-notselected");
  const docs = await evidenceDocuments(w.firms.A, w.clients.A1, cp.id);
  assert.ok(!docs.includes(other.document), "fixture: the probe document is genuinely outside the evidence set");
  await assertRaises(CLR.badRequest,
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: cp.id, basis: { citations: [{ region_id: other.region }] } }),
    "citation outside the evidence document set");
});

test("bp1.W6e a citation of a SUPERSEDED extraction generation is refused", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W6e");
  const docs = await evidenceDocuments(w.firms.A, w.clients.A1, cp.id);
  // The basis was lawful a moment ago; a newer done invoice_facts generation makes the cited
  // region stale WITHOUT deleting it — the region is still a real row of a real evidence
  // document, so only the current-generation rung can be what refuses.
  //
  // ISOLATION, learned by execution: a BARE v2 extraction refuses far earlier, and for a
  // different reason. Superseding with no regions makes F1 null and the ladder raises CLR36
  // binding_unattributable; superseding with a fresh extracted_at makes facts_restated true and
  // it raises CLR36 evidence_restated. Either way the citation is never reached and the cell
  // would have "passed" against the wrong wall. The helper therefore copies the v1 regions and
  // backdates extracted_at, leaving exactly ONE changed fact: the cited region is no longer
  // current. The CLR10 below is then unambiguously the resolver's generation rung.
  await supersedeInvoiceFactsKeepingRegions(w.firms.A, docs[0]);
  const err = await assertRaises(CLR.badRequest,
    async () => proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis }),
    "stale-generation citation");
  assert.equal(reasonOf(err), "basis_unresolved");
});

test("bp1.W6f a garbage region_id (absent / non-uuid / null) is refused", async () => {
  failBp1(live);
  const { cp } = await eligibleVendor("W6f");
  for (const c of [{}, { region_id: "not-a-uuid" }, { region_id: null }, "bare string", 7]) {
    await assertRaises(CLR.badRequest,
      async () => proposeAsAgent(await filingActor(),
        { client: w.clients.A1, counterparty: cp.id, basis: { citations: [c] } }),
      `garbage citation ${JSON.stringify(c)}`);
  }
});

test("bp1.W6m MUTANT — bypassing the shared resolver admits the foreign-document citation", async () => {
  failBp1(live);
  const { cp } = await eligibleVendor("W6m");
  const other = await foreignRegion(w.firms.A, "W6m-notselected");
  await withMutant(CORE_SIG, [[
    "  v_resolved := clara._resolve_proposal_basis(v_docs, p_firm, p_basis);",
    "  v_resolved := jsonb_build_object('citations', p_basis->'citations', 'sightings', 0);",
  ]], async () => {
    // DEFENCE IN DEPTH, measured rather than assumed: with the shared resolver bypassed the
    // foreign citation is still refused — by W17, which re-reads the resolved set and checks
    // field_path, text and coverage on its own. The two walls are INDEPENDENT, which is exactly
    // what the 2026-08-29 pass asked for when it found 0143 was a floor and not the whole wall.
    const err = await assertRaises(CLR.badRequest,
      async () => proposeAsAgent(await filingActor(),
        { client: w.clients.A1, counterparty: cp.id, basis: { citations: [{ region_id: other.region }] } }),
      "resolver bypassed, W17 still standing");
    assert.equal(reasonOf(err), "basis_citation_contradicts_derivation");
  });
  // …and with BOTH removed the citation really is admitted — which is what proves the pair is
  // the wall, and that neither cell above is passing for an unrelated reason.
  await withMutant(CORE_SIG, [
    ["  v_resolved := clara._resolve_proposal_basis(v_docs, p_firm, p_basis);",
     "  v_resolved := jsonb_build_object('citations', p_basis->'citations', 'sightings', 0);"],
    ["  if coalesce(v_bad_field,0) > 0 then", "  if false then"],
    ["  if coalesce(v_bad_f1,0) > 0 or coalesce(v_bad_f2,0) > 0 then", "  if false then"],
    ["  if coalesce(v_covered,0) <> coalesce(array_length(v_docs,1),0) then", "  if false then"],
  ], async () => {
    const r = await proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: cp.id, basis: { citations: [{ region_id: other.region }] } });
    assert.equal(r.status, "proposed",
      "with the resolver AND W17 gone the unchecked citation is ADMITTED — together they are the wall");
  });
});

// ---------------------------------------------------------------------------
// W7 / W8 — one open proposal, and the live-binding conflict.
// ---------------------------------------------------------------------------

test("bp1.W7a two AGENT proposals on one pair — the second is binding_conflict (CLR36)", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W7a");
  await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  const err = await assertRaises("CLR36",
    async () => proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis }),
    "second agent proposal");
  assert.match(err.message, /binding_conflict/);
  assert.equal(reasonOf(err), "binding_conflict");
});

test("bp1.W7b CROSS-PATH — human-then-agent and agent-then-human BOTH refuse binding_conflict", async () => {
  failBp1(live);
  // Human first, then Clara. The human door's body is UNCHANGED by this PR (its prosrc is
  // re-pinned byte-identical in the migration tail) — the behaviour moved because the INDEX
  // moved, which is exactly the change G8 accepted knowingly.
  const a = await eligibleVendor("W7b-h");
  const ph = await propose(w.users.bob, { client: w.clients.A1, counterparty: a.cp.id });
  assert.equal(ph.status, "proposed");
  const e1 = await assertRaises("CLR36",
    async () => proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: a.cp.id, basis: a.basis }),
    "agent after human");
  assert.match(e1.message, /binding_conflict/);

  // Clara first, then the human — the direction that changes the HUMAN door's behaviour.
  const b = await eligibleVendor("W7b-a");
  await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: b.cp.id, basis: b.basis });
  const e2 = await assertRaises("CLR36",
    () => propose(w.users.bob, { client: w.clients.A1, counterparty: b.cp.id }),
    "human after agent");
  assert.match(e2.message, /binding_conflict/,
    "the human door surfaces the estate's EXISTING typed word — no new error vocabulary in the UI");
});

test("bp1.W7m MUTANT — dropping uq_vib_one_active_binding admits the duplicate on BOTH paths", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W7m");
  await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  await withoutConstraint({
    index: "uq_vib_one_active_binding",
    ddl: `create unique index uq_vib_one_active_binding on clara.vendor_identity_bindings(client_id, counterparty_id) where status in ('proposed','live')`,
  }, async () => {
    const r = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
    assert.equal(r.status, "proposed", "without the index the loop is back — a second open proposal is admitted");
    const n = await rootQuery(
      "select count(*)::int c from clara.vendor_identity_bindings where counterparty_id=$1 and status='proposed'",
      [cp.id]);
    assert.equal(n.rows[0].c, 2);
    // Take the duplicate back OUT of the index's predicate so the index can be rebuilt. It is
    // marked declined rather than deleted: clara.binding_agent_receipts is APPEND-ONLY, so
    // deleting the duplicate's receipt is refused (CLR08) and would strand the restore in
    // withoutConstraint's finally with two live 'proposed' rows still present.
    await rootQuery(
      "update clara.vendor_identity_bindings set status='declined', declined_at=now(), declined_by=$2 where id=$1",
      [r.binding_id, w.users.alice]);
  });
});

test("bp1.W8 a LIVE binding blocks a fresh proposal — and the refusal comes from the DERIVATION, not the index", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W8");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  await sign(w.users.alice, { binding: p.binding_id });   // agent proposed ⇒ any admin may sign
  const err = await assertRaises("CLR36",
    async () => proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis }),
    "propose over a live binding");
  assert.match(err.message, /binding_conflict/);
  // THE DISCRIMINATOR (prediction P-5): the index path attaches a typed DETAIL reason; the
  // derivation's own rung does not. A null reason therefore proves the ladder refused, so the
  // agent door needs no second liveness check of its own.
  assert.equal(reasonOf(err), null,
    "the derivation's binding_conflict rung refused — not uq_vib_one_open_proposal");
});

// ---------------------------------------------------------------------------
// W9-W12 — expiry, the honest label, the receipt congruence FK.
// ---------------------------------------------------------------------------

test("bp1.W9 expiry is exactly 12 months and a 13-month row is refused by ck_vib_expiry", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W9");
  const r = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  // Compared as TIMESTAMPS, not as an interval: (timestamptz - timestamptz) yields a day-based
  // interval, and '365 days' <> '12 mons' under interval equality (12 mons is 360 days), so the
  // interval form would be a false red. Measured, not guessed.
  const b = await rootQuery(
    "select expires_at = created_at + interval '12 months' as ok from clara.vendor_identity_bindings where id=$1",
    [r.binding_id]);
  assert.equal(b.rows[0].ok, true);
  await assertRaises(PG.checkViolation,
    () => rootQuery(
      "update clara.vendor_identity_bindings set expires_at = created_at + interval '13 months' where id=$1",
      [r.binding_id]),
    "13-month expiry");
});

test("bp1.W10 the honest label is BIDIRECTIONAL — neither lie is representable", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W10");
  const agent = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  const human = await eligibleVendor("W10-h");
  const hp = await propose(w.users.bob, { client: w.clients.A1, counterparty: human.cp.id });

  // (a) a human row claiming agency
  const e1 = await assertRaises(PG.checkViolation,
    () => rootQuery("update clara.vendor_identity_bindings set proposed_by_agent=true where id=$1", [hp.binding_id]),
    "human row claiming proposed_by_agent");
  assert.equal(e1.constraint, "ck_vib_proposed_by_agent_honest");
  // (b) an agent row HIDING agency — the direction a one-way implication would miss.
  // ISOLATED (0142's F7 round-2 discipline): a bare `set proposed_by_agent=false` on the live
  // agent row ALSO violates ck_vib_proposer_model_honest and ck_vib_proposal_receipt_honest,
  // and PostgreSQL reports whichever it reaches first — so the assertion would be measuring an
  // unspecified choice, not this constraint. The probe therefore INSERTs a fresh copy of the
  // row with the two companion columns lawfully NULL, leaving ck_vib_proposed_by_agent_honest
  // as the only constraint that can refuse it.
  const e2 = await assertRaises(PG.checkViolation,
    () => rootQuery(
      `insert into clara.vendor_identity_bindings(
          firm_id,client_id,counterparty_id,status,f1_vendor_name_norm,f2_invoice_prefix,
          registration_at_signing,content_hash,created_by,expires_at,
          proposed_by_agent,proposer_model,proposal_receipt_id,declined_at,declined_by)
       select firm_id,client_id,counterparty_id,'declined',f1_vendor_name_norm,f2_invoice_prefix,
              registration_at_signing,content_hash,created_by,expires_at,
              false,null,null,now(),$2
         from clara.vendor_identity_bindings where id=$1`,
      [agent.binding_id, w.users.alice]),
    "an agent-created row hiding proposed_by_agent, with every OTHER column lawful");
  assert.equal(e2.constraint, "ck_vib_proposed_by_agent_honest");
  // (c) a human row claiming a proposer model / a proposal receipt
  const e3 = await assertRaises(PG.checkViolation,
    () => rootQuery("update clara.vendor_identity_bindings set proposer_model='x/y/z' where id=$1", [hp.binding_id]),
    "human row claiming a proposer model");
  assert.equal(e3.constraint, "ck_vib_proposer_model_honest");
  const e4 = await assertRaises(PG.checkViolation,
    () => rootQuery("update clara.vendor_identity_bindings set proposal_receipt_id=$2 where id=$1",
      [hp.binding_id, agent.receipt_id]),
    "human row claiming a proposal receipt");
  assert.equal(e4.constraint, "ck_vib_proposal_receipt_honest");
});

test("bp1.W10m MUTANT — a ONE-WAY honesty CHECK lets an agent row hide its agency", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W10m");
  const agent = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  await withoutConstraint({
    table: "vendor_identity_bindings", constraint: "ck_vib_proposed_by_agent_honest",
    ddl: `alter table clara.vendor_identity_bindings add constraint ck_vib_proposed_by_agent_honest check (proposed_by_agent = (created_by = clara.agent_user_id()))`,
  }, async () => {
    // The one-way form the design explicitly rejected: `proposed_by_agent implies agent`.
    await rootQuery(
      `alter table clara.vendor_identity_bindings add constraint ck_bp1_oneway_probe
         check (not proposed_by_agent or created_by = clara.agent_user_id())`);
    try {
      // The two companion honesty CHECKs are still live, so the probe clears their columns in
      // the same statement — otherwise this cell would be refused by THEM and would prove
      // nothing about the direction under test.
      await rootQuery(
        "update clara.vendor_identity_bindings set proposed_by_agent=false, proposer_model=null, proposal_receipt_id=null, directed_by=null where id=$1",
        [agent.binding_id]);
      const b = await bindingRow(agent.binding_id);
      assert.equal(b.proposed_by_agent, false,
        "under a one-way CHECK an agent-created row CAN hide its agency — which is why the shipped CHECK is an equality");
      await rootQuery(
        "update clara.vendor_identity_bindings set proposed_by_agent=true, proposal_receipt_id=$2 where id=$1",
        [agent.binding_id, agent.receipt_id]);
    } finally {
      await rootQuery("alter table clara.vendor_identity_bindings drop constraint ck_bp1_oneway_probe");
    }
  });
});

test("bp1.W12 receipt congruence — a receipt of another firm cannot be attached (23503)", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W12");
  const mine = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  await assertRaises(PG.foreignKeyViolation,
    () => rootQuery(
      "update clara.vendor_identity_bindings set proposal_receipt_id=$2 where id=$1",
      [mine.binding_id, "00000000-0000-4000-8000-0000000000ff"]),
    "a proposal_receipt_id that is not a receipt of this firm");
});

// ---------------------------------------------------------------------------
// W13 — idempotency.
// ---------------------------------------------------------------------------

test("bp1.W13 replay — same op_key echoes; rationale/model are OUTSIDE the hash; a changed subject conflicts", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("W13");
  const key = opk("w13");
  const first = await proposeAsAgent(await filingActor(),
    { client: w.clients.A1, counterparty: cp.id, basis, opKey: key });
  // (a) a genuine replay
  const echo = await proposeAsAgent(await filingActor(),
    { client: w.clients.A1, counterparty: cp.id, basis, opKey: key });
  assert.equal(echo.binding_id, first.binding_id, "the replay echoes the first result");
  // (b) replay TOLERANCE: a re-worded rationale and a bumped model version still echo — a fresh
  //     model turn re-composing its own prose must not turn a lawful retry into a conflict.
  const echo2 = await proposeAsAgent(await filingActor(), {
    client: w.clients.A1, counterparty: cp.id, basis, opKey: key,
    rationale: "Clara, re-worded after a dropped connection.",
    model: { ...MODEL, version: "2026-08-30" },
  });
  assert.equal(echo2.binding_id, first.binding_id);
  // ...and exactly ONE binding and ONE receipt exist for the pair.
  const n = await rootQuery(
    `select (select count(*)::int from clara.vendor_identity_bindings where counterparty_id=$1) b,
            (select count(*)::int from clara.binding_agent_receipts where counterparty_id=$1) r`, [cp.id]);
  assert.deepEqual({ b: n.rows[0].b, r: n.rows[0].r }, { b: 1, r: 1 });
  // (c) the same key with a DIFFERENT subject is a conflict, not an echo.
  const other = await eligibleVendor("W13-other");
  await assertRaises(CLR.badRequest,
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: other.cp.id, basis: other.basis, opKey: key }),
    "same op_key, different counterparty");
});

// ===========================================================================
// W14 / DECLINE — G7. The human "no", and the loop brake that reads it.
// ===========================================================================

test("bp1.D1 decline — admin floor, reason required, proposed → declined, audited + evented", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("D1");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });

  // reason required
  await assertRaises("CLR36",
    () => declineBinding(w.users.alice, { binding: p.binding_id, reason: "   " }), "blank reason");
  // bookkeeper floor
  await assertRaises(CLR.authz,
    () => declineBinding(w.users.bob, { binding: p.binding_id }), "bookkeeper declining");
  // another firm's admin
  await assertRaises(CLR.notFound,
    () => declineBinding(w.users.dave, { binding: p.binding_id }), "cross-firm admin declining");

  const r = await declineBinding(w.users.alice, { binding: p.binding_id, reason: "wrong vendor family" });
  assert.equal(r.status, "declined");
  const b = await bindingRow(p.binding_id);
  assert.equal(b.status, "declined");
  assert.equal(b.declined_by, w.users.alice);
  assert.equal(b.decline_reason, "wrong vendor family");
  assert.ok(b.declined_at, "declined_at stamped");
  assert.equal(b.revoked_at, null, "the revoke columns are NOT reused for a decline");

  const aud = await rootQuery(
    "select count(*)::int c from clara.audit_log where fn='decline_vendor_identity_binding' and (args->>'binding_id')=$1",
    [p.binding_id]);
  assert.equal(aud.rows[0].c, 1);
  const ev = await rootQuery(
    "select count(*)::int c from clara.domain_events where event_type='kb_binding.declined' and (payload->>'binding_id')=$1",
    [p.binding_id]);
  assert.equal(ev.rows[0].c, 1);

  // A declined row is terminal on this door: it cannot be declined twice.
  await assertRaises("CLR36",
    () => declineBinding(w.users.alice, { binding: p.binding_id }), "declining twice");
});

test("bp1.D2 ck_vib_declined — the status/stamp pair cannot lie in either direction", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("D2");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  const e1 = await assertRaises(PG.checkViolation,
    () => rootQuery("update clara.vendor_identity_bindings set declined_at=now() where id=$1", [p.binding_id]),
    "declined_at stamped without the status");
  assert.equal(e1.constraint, "ck_vib_declined");
  const e2 = await assertRaises(PG.checkViolation,
    () => rootQuery("update clara.vendor_identity_bindings set status='declined' where id=$1", [p.binding_id]),
    "status declined with no stamp");
  assert.equal(e2.constraint, "ck_vib_declined");
});

test("bp1.D3 THE LOOP BRAKE — Clara never re-proposes what a human declined (wall + read agree)", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("D3");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  await declineBinding(w.users.alice, { binding: p.binding_id, reason: "not this vendor" });

  // (a) the WALL in the door
  const err = await assertRaises("CLR36",
    async () => proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis }),
    "re-proposing a declined pair");
  assert.equal(reasonOf(err), "binding_declined");

  // (b) the READ agrees — a read verb Clara may not call is not a brake, so both must hold
  const rows = await listCandidates(await filingActor(), w.clients.A1);
  const row = rows.find((x) => x.counterparty_id === cp.id);
  assert.ok(row, "the declined vendor is still LISTED (so a human can see why), but…");
  assert.equal(row.eligible, false);
  assert.equal(row.reason, "binding_declined");
  assert.equal(row.has_declined_proposal, true);

  // (c) …and so does the HUMAN door. This is conductor ruling (b), 2026-08-29, OVERRULING this
  //     item's own design: a suppression only Clara honours is not an invariant, and the
  //     adversarial pass's attack was one line — decline the card, then call the unchanged human
  //     door. `propose_vendor_identity_binding` is RECUT by this PR and now refuses the same way.
  const e2 = await assertRaises("CLR36",
    () => propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id }),
    "the HUMAN door after a decline");
  assert.match(e2.message, /binding_declined/);
  assert.equal(reasonOf(e2), "binding_declined");

  // (d) …and the suppression is liftable, by a NAMED human door and nothing else. Without this
  //     a single "no" would mean "never, by anyone, forever".
  await assertRaises(CLR.authz,
    () => resetDecline(w.users.bob, { binding: p.binding_id }), "a bookkeeper lifting a decline");
  await assertRaises("CLR36",
    () => resetDecline(w.users.alice, { binding: p.binding_id, reason: "  " }), "no reason given");
  const reset = await resetDecline(w.users.alice, { binding: p.binding_id, reason: "vendor confirmed by phone" });
  assert.equal(reset.status, "expired", "the declined row becomes expired — history, not deletion");
  const after = await bindingRow(p.binding_id);
  assert.equal(after.declined_by, w.users.alice, "who declined stays on the row as audit history");
  assert.equal(after.declined_at, null, "…and the stamp clears, because ck_vib_declined pairs it with the status");

  // (e) both doors work again, and only now.
  const again = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  assert.equal(again.status, "proposed", "after an explicit reset the pair may be proposed again");
});

test("bp1.D3m MUTANT — removing the declined brake lets Clara re-propose a refused pair", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("D3m");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  await declineBinding(w.users.alice, { binding: p.binding_id, reason: "no" });
  // The suppression moved into clara._binding_suppression when the gate ruled it must cover
  // REVOKED as well and bind BOTH writers (B4) — so the mutant follows it there. withMutant
  // threw the moment the old needle went stale rather than running a silent no-op "mutant",
  // which is the guard doing its job twice now.
  await withMutant(SUPPRESSION_SIG,
    [["b.status in ('declined','revoked')", "false"]], async () => {
    const r = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
    assert.equal(r.status, "proposed", "without the brake the human's 'no' is ignored");
  });
});

test("bp1.D4 B4 — a REVOKED binding suppresses too, in both writers and the read", async () => {
  failBp1(live);
  // THE GATE'S FINDING: the frozen derivation refuses only on a LIVE binding, and no index
  // covers a revoked row — so a vendor a human deliberately UN-BOUND was re-proposed on the very
  // next filing turn. Revoking is a stronger statement than declining (somebody trusted this
  // binding, watched it work, and took it away), so it would be perverse to suppress less.
  const { cp, basis } = await eligibleVendor("D4");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  await sign(w.users.alice, { binding: p.binding_id });
  await revoke(w.users.bob, { binding: p.binding_id, reason: "wrong vendor after all" });

  const e1 = await assertRaises("CLR36",
    async () => proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis }),
    "Clara re-proposing a revoked pair");
  assert.equal(reasonOf(e1), "binding_revoked");
  const e2 = await assertRaises("CLR36",
    () => propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id }),
    "a human re-proposing a revoked pair");
  assert.equal(reasonOf(e2), "binding_revoked");
  const row = (await listCandidates(await filingActor(), w.clients.A1))
    .find((x) => x.counterparty_id === cp.id);
  assert.equal(row.eligible, false);
  assert.equal(row.reason, "binding_revoked");
  // …and the same named door lifts it.
  await resetDecline(w.users.alice, { binding: p.binding_id, reason: "vendor re-confirmed" });
  const again = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  assert.equal(again.status, "proposed");
});

test("bp1.D5 B5 — a stale PROPOSED row is expired in-door, so the widened index cannot deadlock", async () => {
  failBp1(live);
  // THE TRAP: nothing in the estate had ever expired a `proposed` row — every status='expired'
  // write in 0028 filters status='live'. Once uq_vib_one_active_binding covers ('proposed',
  // 'live'), a past-expiry proposal is BOTH unsignable (binding_expired) and un-re-proposable
  // (the index), and the pair is stuck forever behind a binding_conflict nobody can act on.
  // With PR-4's clock unbuilt, this in-door sweep is the ONLY drain.
  const { cp, basis } = await eligibleVendor("D5");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  // Age it past expiry. ck_vib_expiry caps expires_at at created_at + 1 year, so both move.
  await rootQuery(
    `update clara.vendor_identity_bindings
        set created_at = now() - interval '13 months', expires_at = now() - interval '1 month'
      where id = $1`, [p.binding_id]);
  // The stale row really is in the index's way first — the control that makes this discriminating.
  const stuck = await rootQuery(
    "select count(*)::int c from clara.vendor_identity_bindings where id=$1 and status='proposed'",
    [p.binding_id]);
  assert.equal(stuck.rows[0].c, 1, "control: the stale row is still 'proposed' before the door runs");

  const fresh = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  assert.equal(fresh.status, "proposed", "the door drained the stale row and admitted a fresh proposal");
  assert.notEqual(fresh.binding_id, p.binding_id);
  const old = await bindingRow(p.binding_id);
  assert.equal(old.status, "expired", "the stale row was expired, not deleted — it stays as history");
  // The sweep is AUDITED and EVENTED per row (law 80's shape; the clocked estate-wide sweep is
  // PR-4's, where the act is unattended).
  const ev = await rootQuery(
    "select count(*)::int c from clara.domain_events where event_type='kb_binding.expired' and (payload->>'binding_id')=$1",
    [p.binding_id]);
  assert.equal(ev.rows[0].c, 1);
  const aud = await rootQuery(
    "select count(*)::int c from clara.audit_log where fn='expire_stale_binding_proposal' and (args->>'binding_id')=$1",
    [p.binding_id]);
  assert.equal(aud.rows[0].c, 1);
});

// ===========================================================================
// E — THE ELIGIBILITY READ (G3). One definition of "ready to propose".
// ===========================================================================

test("bp1.E1 the positive case — eligible, no reason, and the DB's own matched count", async () => {
  failBp1(live);
  const cp = await seedWindow(w, "E1", { dates: DATES_OK });
  const rows = await listCandidates(await filingActor(), w.clients.A1);
  const row = rows.find((x) => x.counterparty_id === cp.id);
  assert.ok(row, "the vendor is listed");
  assert.equal(row.eligible, true);
  assert.equal(row.reason, null);
  // A HAND-COUNTED control, not the read's own number compared with itself.
  const control = await rootQuery(
    `select count(*)::int c from clara.journal_entries j
      where j.client_id=$1 and j.status='approved' and j.reversed_by is null
        and j.checked_via_rule_id is null and j.document_id is not null
        and exists (select 1 from clara.journal_lines l where l.entry_id=j.id and l.counterparty_id=$2)`,
    [w.clients.A1, cp.id]);
  assert.equal(row.matched_approved_entries, control.rows[0].c);
  assert.equal(row.has_open_proposal, false);
  assert.equal(row.has_live_binding, false);
});

test("bp1.E2 the near-misses — each reported with the LADDER's OWN typed word", async () => {
  failBp1(live);
  const cases = [
    // 2 approved invoices only
    [{ dates: ["2025-08-25", "2025-09-20"] }, "insufficient_evidence", "E2-two"],
    // 3 invoices on 2 distinct dates
    [{ dates: ["2025-08-25", "2025-08-25", "2025-10-13"] }, "window_too_recent", "E2-twodates"],
    // 3 distinct dates but the window spans < 14 days
    [{ dates: ["2025-08-25", "2025-08-27", "2025-09-01"] }, "window_too_recent", "E2-narrow"],
    // a generic invoice prefix
    [{ dates: DATES_OK, invoiceId: "INV-0001" }, "prefix_too_weak", "E2-prefix"],
  ];
  for (const [spec, expected, tag] of cases) {
    const cp = await seedWindow(w, tag, spec);
    const rows = await listCandidates(await filingActor(), w.clients.A1);
    const row = rows.find((x) => x.counterparty_id === cp.id);
    assert.ok(row, `${tag}: listed`);
    assert.equal(row.eligible, false, `${tag}: not eligible`);
    assert.equal(row.reason, expected, `${tag}: the derivation's own word`);
    // …and the DOOR refuses the same case with the same word — the read and the wall are the
    // same predicate, which is the whole of G3.
    const err = await assertRaises("CLR36",
      async () => proposeAsAgent(await filingActor(),
        { client: w.clients.A1, counterparty: cp.id, basis: { citations: [{ region_id: cp.id }] } }),
      `${tag}: the door refuses too`);
    assert.match(err.message, new RegExp(expected));
  }
});

test("bp1.E3 NON-VACUITY — one entry fewer, and the SAME builder's verdict flips", async () => {
  failBp1(live);
  // The annex asked for this control as "E-1's fixture with one approved entry DELETED". A
  // deletion is not available: clara.open_items (and the journal tables behind it) are
  // append-only, so `delete from clara.open_items` is refused CLR08 — measured, not assumed.
  // The control is therefore a DIFFERENTIAL over the same builder: two vendors seeded by the
  // identical code path, differing in exactly one approved entry. That answers the same
  // question — is this read discriminating, or is it a constant true? — without asking the
  // substrate to do something it forbids.
  const three = await seedWindow(w, "E3-three", { dates: DATES_OK });
  const two = await seedWindow(w, "E3-two", { dates: DATES_OK.slice(0, 2) });
  const rows = await listCandidates(await filingActor(), w.clients.A1);
  const rThree = rows.find((x) => x.counterparty_id === three.id);
  const rTwo = rows.find((x) => x.counterparty_id === two.id);
  assert.ok(rThree && rTwo, "both vendors are listed");
  assert.equal(rThree.eligible, true, "three approved entries → eligible");
  assert.equal(rTwo.eligible, false, "two → NOT eligible; the read is DISCRIMINATING");
  assert.equal(rTwo.reason, "insufficient_evidence");
  assert.equal(rThree.matched_approved_entries, 3);
  assert.equal(rTwo.matched_approved_entries, 2);
});

test("bp1.E4 an OPEN proposal is a loop brake — has_open_proposal true, not eligible", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("E4");
  await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  const row = (await listCandidates(await filingActor(), w.clients.A1))
    .find((x) => x.counterparty_id === cp.id);
  assert.equal(row.has_open_proposal, true);
  assert.equal(row.eligible, false);
  assert.equal(row.reason, "binding_proposal_open");
});

test("bp1.E5 a LIVE binding — has_live_binding true", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("E5");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  await sign(w.users.alice, { binding: p.binding_id });
  const row = (await listCandidates(await filingActor(), w.clients.A1))
    .find((x) => x.counterparty_id === cp.id);
  assert.equal(row.has_live_binding, true);
  assert.equal(row.eligible, false);
});

test("bp1.E6 the read leaks nothing cross-firm, and both wake kinds may call it", async () => {
  failBp1(live);
  await assertRaises(CLR.notFound,
    async () => listCandidates(await filingActor(), w.clients.B1), "firm-A credential asking for a firm-B client");
  // Both ruled kinds reach the read; the rows are the same rows.
  const viaFiling = await listCandidates(await filingActor(), w.clients.A1);
  const viaInteractive = await listCandidates(await interactiveActor(), w.clients.A1);
  assert.equal(viaFiling.length, viaInteractive.length);
  assert.ok(viaFiling.length > 0, "the read returns rows at all");
  // A non-admitted kind through the granted role is CLR03 here too.
  const c = await credOfKind("autodraft");
  await assertRaises(CLR.wake,
    () => listCandidates({ role: WAKE_ROLE.interactive, ...c }, w.clients.A1), "autodraft reading candidates");
});

// ===========================================================================
// A — THE 2026-08-29 CROSS-MODEL ADVERSARIAL PASS. Every wall below was added because a
// reviewer showed an attack the design as written admitted. Each has a refusal cell, a mutant,
// and — where the wall also changes what Clara is TOLD — a matching read-verb cell, because a
// read that disagrees with the wall sends her to probe the door by refusal.
// ===========================================================================

/** Two live counterparties sharing a family leading token — the condition law 79 detects. */
async function ambiguousFamily(tag) {
  const token = `ROMEFAM${randomSuffix()}`;
  const a = await seedUniqueFamilyVendor(w.firms.A, w.clients.A1, `${tag}a`);
  const b = await seedUniqueFamilyVendor(w.firms.A, w.clients.A1, `${tag}b`);
  const rename = (id, suffix) => rootQuery(
    "update clara.counterparties set name=$2, name_normalized=$3 where id=$1",
    [id, `${token} ${suffix} SDN BHD`, `${token}${suffix}sdnbhd`.toLowerCase()]);
  await rename(a.id, "ALPHA");
  await rename(b.id, "BETA");
  const cp = { ...a, name: `${token} ALPHA SDN BHD` };
  await seedWindow(w, tag, { dates: DATES_OK, vendor: cp });
  return cp;
}
const randomSuffix = () => Math.random().toString(36).slice(2, 8).toUpperCase();

test("bp1.A1 W15 law 79 — an AMBIGUOUS NAME FAMILY can never authorize identity", async () => {
  failBp1(live);
  // THE ATTACK (CRITICAL, 2026-08-29): F1 is a STABILITY feature matched by PREFIX and F3
  // accepts a NAME SUBSTRING, so a corpus crafted from a same-family vendor stores B's stable
  // fingerprint beside A's registration. Two live counterparties sharing a family leading token
  // are exactly that condition, and the firm-wide predicate that detects it has existed since
  // 0103 without one binding path ever calling it.
  const cp = await ambiguousFamily("A1");
  const err = await assertRaises("CLR36",
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: cp.id, basis: { citations: [{ region_id: cp.id }] } }),
    "an ambiguous-family vendor");
  assert.match(err.message, /binding_name_family_ambiguous/);

  // The READ agrees, in the writer's own word — so Clara is never sent at this door.
  const row = (await listCandidates(await filingActor(), w.clients.A1))
    .find((x) => x.counterparty_id === cp.id);
  assert.ok(row, "the vendor is still LISTED, so a human can see why");
  assert.equal(row.eligible, false);
  assert.equal(row.reason, "binding_name_family_ambiguous");
});

test("bp1.A1m MUTANT — without law 79's predicate the poisoned-family proposal is ADMITTED", async () => {
  failBp1(live);
  const cp = await ambiguousFamily("A1m");
  const basis = await lawfulBasis(w.firms.A, w.clients.A1, cp.id);
  await withMutant(BLOCKER_SIG,
    [["  if clara.name_family_is_ambiguous(p_firm, v_cp_name) then", "  if false then"]],
    async () => {
      const r = await proposeAsAgent(await filingActor(),
        { client: w.clients.A1, counterparty: cp.id, basis });
      assert.equal(r.status, "proposed", "without the predicate the ambiguous family is ADMITTED");
    });
});

test("bp1.A2 W16 — three ENTRIES is not three INVOICES", async () => {
  failBp1(live);
  // (a) ONE document behind three entries, and three BYTE-IDENTICAL uploads, are the audit's
  //     two headline shapes — and MEASURED HERE, the estate already makes both unrepresentable:
  //     clara.uq_document_filing_active forbids a second active filing on one document, and
  //     clara.documents_firm_id_sha256_key forbids a second document with the same bytes in one
  //     firm. So those two conjuncts of the wall are DEFENCE IN DEPTH over guarantees that live
  //     elsewhere, not the half of the finding that was actually open. They are still enforced,
  //     and they are still proven — by driving the shared predicate DIRECTLY with a crafted
  //     evidence array, which is the only way to reach a state the substrate will not build.
  const { cp: real } = await eligibleVendor("A2a");
  const derived = (await rootQuery(
    "select clara._derive_vendor_binding_proposal($1,$2,$3) as d",
    [w.firms.A, w.clients.A1, real.id])).rows[0].d;
  const oneDoc = { ...derived, evidence: [derived.evidence[0], derived.evidence[0], derived.evidence[0]] };
  const basisOf = await derivedBasis(w.firms.A, w.clients.A1, real.id);
  const probe = await rootQuery(
    "select clara._binding_extra_blocker($1,$2,$3,$4::jsonb,$5::jsonb) as r",
    [w.firms.A, w.clients.A1, real.id, JSON.stringify(oneDoc), JSON.stringify(basisOf)]);
  assert.equal(probe.rows[0].r, "binding_corpus_not_distinct",
    "one document three times is refused by the corpus wall");
  // …and the control: the SAME predicate returns clean for the real three-document corpus, so
  // the probe above is measuring the crafted array and not a fixture that was broken anyway.
  const control = await rootQuery(
    "select clara._binding_extra_blocker($1,$2,$3,$4::jsonb,$5::jsonb) as r",
    [w.firms.A, w.clients.A1, real.id, JSON.stringify(derived), JSON.stringify(basisOf)]);
  assert.equal(control.rows[0].r, null, "the real corpus passes the same predicate");

  // (b) three documents, distinct bytes, but ONE printed invoice id — three scans of one
  //     invoice. THIS is the half of the finding that was genuinely open: distinct documents and
  //     distinct shas do not make distinct invoices, and nothing else in the estate checks it.
  const dup = await seedWindow(w, "A2b", { dates: DATES_OK, invoiceId: "SAMEINVOICE-0001" });
  const e2 = await assertRaises("CLR36",
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: dup.id, basis: { citations: [{ region_id: dup.id }] } }),
    "three uploads of one invoice");
  assert.match(e2.message, /binding_corpus_not_distinct/);

  // (c) three real distinct invoices, all approved the same day — the posting dates are
  //     backdated, so the frozen window's own >=14-day span passes on a clock the caller set.
  const rushed = await seedWindow(w, "A2c", { dates: DATES_OK, approvedSpanDays: 0 });
  const e3 = await assertRaises("CLR36",
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: rushed.id, basis: { citations: [{ region_id: rushed.id }] } }),
    "backdated posting dates, no elapsed observation");
  assert.match(e3.message, /window_too_recent_unobserved/);

  // …and the read verb says all three, in the same words.
  const rows = await listCandidates(await filingActor(), w.clients.A1);
  for (const [id, expected] of [[dup.id, "binding_corpus_not_distinct"],
    [rushed.id, "window_too_recent_unobserved"]]) {
    const row = rows.find((x) => x.counterparty_id === id);
    assert.equal(row?.eligible, false);
    assert.equal(row?.reason, expected);
  }
});

test("bp1.A2m MUTANT — without the trusted clock, backdated posting dates are enough", async () => {
  failBp1(live);
  const cp = await seedWindow(w, "A2m", { dates: DATES_OK, approvedSpanDays: 0 });
  const basis = await lawfulBasis(w.firms.A, w.clients.A1, cp.id);
  await withMutant(BLOCKER_SIG, [["  if coalesce(v_span_days, -1) < 14 then", "  if false then"]],
    async () => {
      const r = await proposeAsAgent(await filingActor(),
        { client: w.clients.A1, counterparty: cp.id, basis });
      assert.equal(r.status, "proposed",
        "without the approved_at span a corpus approved in one minute passes as 'fourteen days apart'");
    });
});

test("bp1.A3 W18 — a DIFFERING printed registration is the poisoned-corpus signature", async () => {
  failBp1(live);
  // (a) the documents print someone else's registration.
  const mismatched = await seedWindow(w, "A3a", { dates: DATES_OK, printedRegistration: "199901011234" });
  const e1 = await assertRaises("CLR36",
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: mismatched.id, basis: { citations: [{ region_id: mismatched.id }] } }),
    "a corpus printing a different registration");
  assert.match(e1.message, /binding_identifier_unproven/);

  // (b) THE OR-ARM IS REAL, not a loophole that swallows the wall: a corpus that prints NO
  //     registration is still admissible, because each document carries a HUMAN identity
  //     resolution in clara.client_resolutions — the same shape the product's filing path writes.
  const unprinted = await seedWindow(w, "A3b", { dates: DATES_OK, printedRegistration: null });
  const basis = await lawfulBasis(w.firms.A, w.clients.A1, unprinted.id);
  const ok = await proposeAsAgent(await filingActor(),
    { client: w.clients.A1, counterparty: unprinted.id, basis });
  assert.equal(ok.status, "proposed", "no printed registration + a human resolution ⇒ admitted");
});

test("bp1.A3m MUTANT — without W18 the mismatched-registration corpus is ADMITTED", async () => {
  failBp1(live);
  const cp = await seedWindow(w, "A3m", { dates: DATES_OK, printedRegistration: "199901019999" });
  const basis = await lawfulBasis(w.firms.A, w.clients.A1, cp.id);
  await withMutant(BLOCKER_SIG, [["  if v_bad_doc is not null then", "  if false then"]],
    async () => {
      const r = await proposeAsAgent(await filingActor(),
        { client: w.clients.A1, counterparty: cp.id, basis });
      assert.equal(r.status, "proposed",
        "without W18 a corpus printing another party's registration stands up an identity authority");
    });
});

test("bp1.A4 W17 — a REAL, CURRENT, in-set citation is still not evidence of identity", async () => {
  failBp1(live);
  const { cp } = await eligibleVendor("A4");
  const b = await derivedBasis(w.firms.A, w.clients.A1, cp.id);
  const cites = b.resolved_citations ?? [];
  const vendorName = cites.filter((c) => c.field_path === "invoice.vendor_name");
  // The registration region is deliberately NOT in _derive_vendor_binding_basis (that read is
  // filtered to the two fields the fingerprint is taken from), so it is fetched straight from the
  // catalog — which is also what makes it a REAL, CURRENT, in-set region for this probe.
  const registration = (await rootQuery(
    `select r.id as region_id from clara.document_regions r
       join clara.document_extractions x on x.id = r.extraction_id
      where x.document_id = $1 and x.engine_kind = 'invoice_facts' and x.status = 'done'
        and r.field_path = 'invoice.vendor_registration' limit 1`,
    [vendorName[0].document_id])).rows;
  assert.ok(registration.length > 0, "fixture: the corpus prints a registration region");

  // (a) WRONG FIELD. Every 0143 rung passes — a real region, current generation, a document of
  //     the set — and the card would show a registration region as "where the fingerprint came
  //     from". It is not.
  const e1 = await assertRaises(CLR.badRequest,
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: cp.id, basis: { citations: [{ region_id: registration[0].region_id }] } }),
    "a real, current, in-set region of the WRONG field");
  assert.equal(reasonOf(e1), "basis_citation_irrelevant");

  // (b) COVERAGE. One of the three documents cited; 0143 is satisfied, the corpus is not.
  const e2 = await assertRaises(CLR.badRequest,
    async () => proposeAsAgent(await filingActor(),
      { client: w.clients.A1, counterparty: cp.id, basis: { citations: [{ region_id: vendorName[0].region_id }] } }),
    "one document of three cited");
  assert.equal(reasonOf(e2), "basis_coverage_incomplete");
});

test("bp1.A5 the index covers 'live' — the propose-versus-sign race end state is unrepresentable", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("A5");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  await sign(w.users.alice, { binding: p.binding_id });
  // THE RACE'S END STATE, written directly: a live binding AND a fresh open proposal for one
  // pair. A `where status='proposed'` index cannot forbid it (only one row is proposed) and
  // uq_vib_one_live cannot either (only one row is live) — so a refusal here can ONLY be the
  // widened predicate. That is what makes this cell discriminating rather than decorative.
  const err = await assertRaises(PG.uniqueViolation, () => rootQuery(
    `insert into clara.vendor_identity_bindings(
        firm_id,client_id,counterparty_id,status,f1_vendor_name_norm,f2_invoice_prefix,
        registration_at_signing,content_hash,created_by,expires_at)
     select firm_id,client_id,counterparty_id,'proposed',f1_vendor_name_norm,f2_invoice_prefix,
            registration_at_signing,content_hash,$2,now()+interval '12 months'
       from clara.vendor_identity_bindings where id=$1`,
    [p.binding_id, w.users.alice]), "a proposed row alongside a live one");
  assert.equal(err.constraint, "uq_vib_one_active_binding");
});

test("bp1.A6 裁-32 — directed_by is recorded and effective_proposer is DERIVED, not copied", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("A6");
  // An interactive credential carries the directing human in on_behalf_of (0011:1143).
  const r = await proposeAsAgent(await interactiveActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  const b = await bindingRow(r.binding_id);
  assert.equal(b.created_by, AGENT_USER_ID, "Clara is still the proposer of record");
  assert.equal(b.directed_by, w.users.alice, "…and the human who directed her is recorded");
  assert.equal(b.effective_proposer, w.users.alice,
    "the principal maker/checker must measure against is the DIRECTING HUMAN, not the agent uuid");
  // GENERATED ALWAYS — it cannot be set to disagree with the columns it comes from.
  await assertRaises("428C9", () => rootQuery(
    "update clara.vendor_identity_bindings set effective_proposer=$2 where id=$1",
    [r.binding_id, w.users.bob]), "writing effective_proposer directly");
  // A human proposal has no director, so the effective proposer is the human themself.
  const h = await eligibleVendor("A6-h");
  const hp = await propose(w.users.bob, { client: w.clients.A1, counterparty: h.cp.id });
  const hb = await bindingRow(hp.binding_id);
  assert.equal(hb.directed_by, null);
  assert.equal(hb.effective_proposer, w.users.bob);
});

test("bp1.A7 MED-9 — the receipt register cannot point a member at another member's shim", async () => {
  failBp1(live);
  // Both halves are individually lawful under their own widened regexes, so only the pairing
  // CHECK can refuse this row — and without it the nine-row census would still read green while
  // pb_binding's receipts were projected through somebody else's shim.
  const err = await assertRaises(PG.checkViolation, () => rootQuery(
    `insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source)
     values ('pb_probez','probe_kind_z','_agent_receipt_src_pb_probey','probe_source_z')`),
    "a mismatched item/shim pair");
  assert.equal(err.constraint, "ck_agent_receipt_surfaces_shim_matches_item");
  // …and every pre-existing member already satisfies it (it validated clean; no data pass owed).
  const bad = await rootQuery(
    "select count(*)::int c from clara.agent_receipt_surfaces where shim_relname <> '_agent_receipt_src_' || item");
  assert.equal(bad.rows[0].c, 0);
});

// ===========================================================================
// S — THE SIGN PATH over an agent-created row (裁-18a must hold for Clara too).
// ===========================================================================

test("bp1.S1 裁-18a — Clara proposes, ANY admin signs; the wall passes BY CONSTRUCTION", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("S1");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  const s = await sign(w.users.alice, { binding: p.binding_id });
  assert.equal(s.status, "live");
  const b = await bindingRow(p.binding_id);
  assert.equal(b.signed_by, w.users.alice);
  assert.equal(b.created_by, AGENT_USER_ID, "created_by is STILL the sentinel after signing");
  assert.equal(b.proposed_by_agent, true);
});

test("bp1.S2 the wall is an ACTOR COMPARISON — a human self-propose+self-sign is still refused", async () => {
  failBp1(live);
  // The control that gives S1 its meaning: if the wall were written as "the proposer must be
  // human" it would refuse S1 and strand every single-admin firm (design §3.4 / annex G-a).
  // Alice proposes as a human and tries to sign her own — refused, with the ruled words.
  const { cp } = await eligibleVendor("S2");
  const hp = await propose(w.users.alice, { client: w.clients.A1, counterparty: cp.id });
  const err = await assertRaises(CLR.authz,
    () => sign(w.users.alice, { binding: hp.binding_id }), "human self-propose then self-sign");
  // 裁-32 (2026-08-29) SPLIT this refusal. This world's firm A carries exactly ONE admin, so a
  // self-sign lands on the SOLO arm: still refused, but with the attestation way out named.
  // x36-vendor-binding-ceremony.test.mjs's x36c.5b holds the ≥2-signer arm, where 裁-18c's
  // verbatim words are unchanged — that file owns the wall's pins, so the pin lives there.
  assert.equal(reasonOf(err), "self_attestation_required");
  assert.match(err.message, /state why you are signing your own/);
  // …and the attestation genuinely opens it, writing the self-approval onto the row where a
  // reader can see it. This is the 裁-18c relaxation, and it is deliberate: the alternative was
  // to strand every solo firm, since "let Clara propose" is the path 裁-32 just closed for them.
  const signed = await humanQuery(w.users.alice,
    "select clara.sign_vendor_identity_binding(p_binding => $1, p_op_key => $2, p_attestation => $3) as result",
    [hp.binding_id, opk("s2att"), "Sole admin of this firm; I checked the three invoices myself."]);
  assert.equal(signed.rows[0].result.status, "live");
  assert.equal(signed.rows[0].result.self_approved, true);
  const row = await bindingRow(hp.binding_id);
  assert.equal(row.self_approved, true);
  assert.match(row.self_approval_reason, /Sole admin/);
});

test("bp1.S3 a bookkeeper cannot sign Clara's proposal; another firm's admin cannot see it", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("S3");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  await assertRaises(CLR.authz, () => sign(w.users.bob, { binding: p.binding_id }), "bookkeeper signing");
  await assertRaises(CLR.notFound, () => sign(w.users.dave, { binding: p.binding_id }), "other firm's admin signing");
});

test("bp1.S4 proposal_drifted still fires over an AGENT-created row", async () => {
  failBp1(live);
  const cp = await seedWindow(w, "S4", { dates: DATES_OK });
  const basis = await lawfulBasis(w.firms.A, w.clients.A1, cp.id);
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  // A FOURTH approved invoice for the SAME vendor moves the window, so the re-derivation at
  // sign time differs from the one the proposal was hashed over.
  await seedWindow(w, "S4-fourth", { dates: ["2025-12-15"], vendor: cp });
  const err = await assertRaises("CLR36", () => sign(w.users.alice, { binding: p.binding_id }), "signing a drifted proposal");
  assert.match(err.message, /proposal_drifted/);
});

// ===========================================================================
// R — THE RECEIPT (the ninth registered member, pb_binding).
// ===========================================================================

test("bp1.R1 the receipt reproduces the card from DB-OWNED inputs only", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("R1");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  const rec = await receiptRow(p.receipt_id);
  const b = await bindingRow(p.binding_id);
  assert.equal(rec.model, MODEL.model);
  assert.equal(rec.model_version, MODEL.version);
  assert.equal(rec.verdict.outcome, "proposed");
  // Every DERIVED field on the receipt equals the DB's own value on the row.
  assert.equal(rec.verdict.derived.content_hash, b.content_hash);
  assert.equal(rec.verdict.derived.f1_vendor_name_norm, b.f1_vendor_name_norm);
  assert.equal(rec.verdict.derived.f2_invoice_prefix, b.f2_invoice_prefix);
  assert.equal(rec.verdict.derived.registration_at_signing, b.registration_at_signing);
  const dbBasis = await derivedBasis(w.firms.A, w.clients.A1, cp.id);
  assert.equal(rec.verdict.derived.matched_approved_entries, dbBasis.matched_approved_entries);
  assert.equal(rec.verdict.derived.distinct_posting_dates, 3);
  // The persisted basis is the RESOLVER'S OUTPUT AND NOTHING ELSE — its sightings is DERIVED,
  // and the caller's raw citations are persisted NOWHERE (裁-22's HIGH-2 shape: a model-authored
  // list must not sit in a human-readable receipt beside the checked one).
  assert.equal(rec.verdict.basis.citation_count, basis.citations.length);
  assert.equal(rec.verdict.basis.sightings, undefined,
    "0143's sightings counts REGIONS, not invoices — this door never republishes that word");
  assert.equal(rec.verdict.basis.claimed, undefined, "the model's raw citations are persisted nowhere");
  for (const c of rec.verdict.basis.citations) {
    assert.equal(c.kind, "region", "every resolved citation is self-describing");
    assert.ok(c.region_id && c.extraction_id && c.document_id);
  }
});

test("bp1.R2 O2/B2 — a refusal receipt is not a REPRESENTABLE state, and the type says so", async () => {
  failBp1(live);
  // The gate struck out this table's refusal vocabulary: every wall RAISEs, a raise rolls the
  // row back, so no code can ever write a refusal receipt. What used to be a `failing_rungs`
  // column and a ck_bar_proposed_iff_clean CHECK is now simply a NOT NULL binding_id.
  // (a) the column is GONE from the table — asserted from the catalog, not from the migration.
  const cols = await rootQuery(
    `select count(*)::int c from information_schema.columns
      where table_schema='clara' and table_name='binding_agent_receipts' and column_name='failing_rungs'`);
  assert.equal(cols.rows[0].c, 0, "failing_rungs must not exist on the table");
  // (b) …and a bindingless receipt is refused by NOT NULL, the simplest wall that is true.
  const { cp } = await eligibleVendor("R2");
  await assertRaises("23502", () => rootQuery(
    `insert into clara.binding_agent_receipts(firm_id,client_id,counterparty_id,binding_id,rationale,
        verdict,via_wake_kind,trigger_kind,trigger_id,acting_actor)
     values($1,$2,$3,null,'probe','{}'::jsonb,'filing','wake_credential','probe',$4)`,
    [w.firms.A, w.clients.A1, cp.id, AGENT_USER_ID]),
    "a receipt with no binding");
  // (c) the 19-column contract is still satisfied: the shim projects ordinal 13 as an honest
  //     empty constant, so a human reading agent_receipts_visible sees a well-formed row.
  const shim = await rootQuery(
    `select a.attname, format_type(a.atttypid,a.atttypmod) t
       from pg_attribute a where a.attrelid='clara._agent_receipt_src_pb_binding'::regclass
        and a.attnum=13`);
  assert.equal(shim.rows[0].attname, "failing_rungs");
  assert.equal(shim.rows[0].t, "text[]");
});

test("bp1.R3 append-only — update and delete on the receipt are refused", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("R3");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  await assertRaises(CLR.immutable,
    () => rootQuery("update clara.binding_agent_receipts set rationale='rewritten' where id=$1", [p.receipt_id]),
    "updating a receipt");
  await assertRaises(CLR.immutable,
    () => rootQuery("delete from clara.binding_agent_receipts where id=$1", [p.receipt_id]),
    "deleting a receipt");
});

test("bp1.R4 RLS — the receipt is visible to the owning firm and INVISIBLE to another firm", async () => {
  failBp1(live);
  const { cp, basis } = await eligibleVendor("R4");
  const p = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: cp.id, basis });
  const seen = async (sub) => (await humanQuery(sub,
    "select count(*)::int c from clara.agent_receipts_visible where receipt_id=$1", [p.receipt_id])).rows[0].c;
  assert.equal(await seen(w.users.bob), 1, "a bookkeeper of the owning firm sees it");
  assert.equal(await seen(w.users.dave), 0, "an owner of another firm does NOT");
  // …and the row really is projected through the shim, with the contract's own kind.
  const r = await humanQuery(w.users.bob,
    "select receipt_kind, scope, subject_id from clara.agent_receipts_visible where receipt_id=$1", [p.receipt_id]);
  assert.equal(r.rows[0].receipt_kind, "binding_agent");
  assert.equal(r.rows[0].scope, "firm");
  assert.equal(r.rows[0].subject_id, p.binding_id);
});

test("bp1.R5 the registry census is 9, pb_binding conforms, and nothing is dark", async () => {
  failBp1(live);
  const c = await rootQuery(
    "select * from clara.agent_receipt_source_census() where item='pb_binding'");
  const row = c.rows[0];
  assert.ok(row, "pb_binding is registered");
  assert.equal(row.receipt_kind, "binding_agent");
  assert.equal(row.shim_exists, true);
  assert.equal(row.wired, true);
  assert.equal(row.conforms, true);
  assert.equal(row.column_count, 19);
  assert.equal(Number(row.dark_rows), 0);
  const n = await rootQuery("select count(*)::int c from clara.agent_receipt_source_census()");
  assert.equal(n.rows[0].c, 9);
  const dark = await rootQuery("select count(*)::int c from clara.agent_receipt_dark_rows()");
  assert.equal(dark.rows[0].c, 0);
});

// ===========================================================================
// F — THE FROZEN SURFACES. One derivation, two doors.
// ===========================================================================

test("bp1.F1 the byte-frozen bodies are unmoved (prosrc sha256, the live catalog)", async () => {
  failBp1(live);
  const pins = {
    "clara._derive_vendor_binding_proposal(uuid,uuid,uuid)":
      "de0f58078f23ef2c6ce3f4a82cb29691a3633e3b8b9c48ae90babc53e7ee043c",
    "clara._coding_lane_core(uuid,uuid)":
      "721a6704e3284679103537bdda56bf741422041e16dda0f4654394f1d9506fda",
    "clara.revoke_vendor_identity_binding(uuid,text,text)":
      "b0b566b36d84b17469425a86fdfd4c68fcaebea6dd793b3edb2f1bce609433ce",
    "clara._resolve_proposal_basis(uuid[],uuid,jsonb)":
      "dddd2747d3a440d2f5e644e1bac79c23ec227d6e71960c075016afb3fa60c3b5",
  };
  for (const [sig, expected] of Object.entries(pins)) {
    const r = await rootQuery(
      "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') s from pg_proc p where p.oid=$1::regprocedure",
      [sig]);
    assert.equal(r.rows[0].s, expected, `${sig} drifted`);
  }
  // `propose_vendor_identity_binding` is DELIBERATELY not in that list any more: this PR recuts
  // it (conductor ruling (b)). Asserted as a CHANGE from its pre-image rather than pinned to a
  // new literal, because the migration's own tail already proves the delta byte-for-byte by
  // re-substitution — pinning the post-image here too would only duplicate that, and would go
  // stale on every comment edit.
  const recut = await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') s from pg_proc p where p.oid=$1::regprocedure",
    ["clara.propose_vendor_identity_binding(jsonb,text)"]);
  assert.notEqual(recut.rows[0].s, "610ef1dfc18f963122ed2012e49a96b06526b93baca2f269fa054a76302f7fc7",
    "the human proposal door must NO LONGER be its 0028 pre-image — ruling (b) did not land");
  // The signer is a SIGNATURE change, not a CoR: the 2-arg overload must be GONE (a surviving
  // one would be shadow-reachable and would still carry the old wall), and the 3-arg one must
  // resolve. Read by exact signature, never by bare name (review law 3).
  const sigs = await rootQuery(
    "select to_regprocedure($1) old2, to_regprocedure($2) new3",
    ["clara.sign_vendor_identity_binding(uuid,text)",
      "clara.sign_vendor_identity_binding(uuid,text,text)"]);
  assert.equal(sigs.rows[0].old2, null, "the 2-arg signer overload must be DROPPED, not left shadow-reachable");
  assert.ok(sigs.rows[0].new3, "the 3-arg signer must resolve");
  const signerAcl = await rootQuery(
    "select has_function_privilege('clara_authenticated', $1, 'EXECUTE') p",
    ["clara.sign_vendor_identity_binding(uuid,text,text)"]);
  assert.equal(signerAcl.rows[0].p, true, "DROP destroys the ACL — the grant must have been re-made");
});

test("bp1.F2 ONE derivation, TWO doors — the five content fields are byte-identical", async () => {
  failBp1(live);
  const a = await eligibleVendor("F2-agent");
  const pa = await proposeAsAgent(await filingActor(), { client: w.clients.A1, counterparty: a.cp.id, basis: a.basis });
  const ba = await bindingRow(pa.binding_id);
  const h = await eligibleVendor("F2-human");
  const ph = await propose(w.users.bob, { client: w.clients.A1, counterparty: h.cp.id });
  const bh = await bindingRow(ph.binding_id);
  // Different vendors, so the VALUES differ — what must match is the SHAPE and the fact that
  // both rows' content came from the derivation. Prove it by re-deriving each and comparing.
  for (const [row, cpId] of [[ba, a.cp.id], [bh, h.cp.id]]) {
    const d = (await rootQuery("select clara._derive_vendor_binding_proposal($1,$2,$3) d",
      [w.firms.A, w.clients.A1, cpId])).rows[0].d;
    assert.equal(row.f1_vendor_name_norm, d.f1_vendor_name_norm);
    assert.equal(row.f2_invoice_prefix, d.f2_invoice_prefix);
    assert.equal(row.registration_at_signing, d.registration_at_signing);
    assert.equal(row.content_hash, d.content_hash);
  }
  // The agent path writes the SAME evidence rows the human path does.
  const evn = await rootQuery(
    `select (select count(*)::int from clara.vendor_identity_binding_evidence where binding_id=$1) a,
            (select count(*)::int from clara.vendor_identity_binding_evidence where binding_id=$2) h`,
    [pa.binding_id, ph.binding_id]);
  assert.deepEqual({ a: evn.rows[0].a, h: evn.rows[0].h }, { a: 3, h: 3 });
});

test("bp1.F3 the only status transition this door can cause is null → proposed", async () => {
  failBp1(live);
  // Clara has no sign / decline / revoke reach at all: neither wake role holds EXECUTE on any of
  // the three, and none of them is allowlisted for either ruled kind (N1, proven not asserted).
  const r = await rootQuery(
    `select string_agg(format('%s=%s', t.fn, t.rol), ', ') bad from (
       select f.fn, rr.rol from (values
         ('clara.sign_vendor_identity_binding(uuid,text,text)'),
         ('clara.revoke_vendor_identity_binding(uuid,text,text)'),
         ('clara.decline_vendor_identity_binding(uuid,text,text)')) f(fn)
       cross join (values ('clara_wake_filing'),('clara_wake_interactive')) rr(rol)) t
      where has_function_privilege(t.rol, t.fn, 'EXECUTE')`);
  assert.equal(r.rows[0].bad, null, `a wake role can change a binding's status: ${r.rows[0].bad}`);
  const al = await rootQuery(
    `select count(*)::int c from clara.wake_fn_allowlist
      where function_name in ('sign_vendor_identity_binding','revoke_vendor_identity_binding','decline_vendor_identity_binding')`);
  assert.equal(al.rows[0].c, 0);
});
