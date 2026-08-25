// F-A3 PR-3 -- the SS2/SS3 doors battery (review round fixes MF-A + SHOULD C3b/C3c).
//
// Ground: docs/plan/active/bank-agency-design.md v2 SS3.2/SS3.12 (OQ-7 staff-advance sibling,
// Annex M.2 row 4 / OQ-8 the identifier-promotion confirm door). WRITTEN AGAINST THE MIGRATION'S
// OWN CLAIMS, then run for real -- every cell here calls a REAL wake wrapper or a REAL human
// door through a REAL credential (never a direct core call), the same discipline
// f-a3-pr1b-wake-verbs.test.mjs uses. CONTRACT-BLIND for the confirm door's ladder shape; the
// staff-advance sibling's shape is read from the migration's own header (SS2) because no design
// annex names its wire contract independently.
//
// Cells, in file order:
//  MF-A (review MUST-FIX) -- wake_book_staff_advance_application had NO wake_fn_allowlist row,
//    so every call refused CLR03 regardless of grants: mfA.pos proves a real bank_agent call now
//    succeeds end to end; mfA.neg proves a wrong-kind credential still refuses CLR03 (the
//    allowlist gate itself, not merely "some credential exists").
//  C3c (review SHOULD) -- the third core extraction (book_staff_advance_application) gets the
//    same three twins PR-1a's own nine got: byte-for-byte pre-extraction proof, ungranted-core
//    proof, core_ctx_missing proof.
//  C3b (review SHOULD) -- confirm_bank_identifier_promotion is judgement logic (review law 1)
//    that shipped with GRANT-SHAPE coverage only. Both polarities plus the two traps the
//    reviewer named: matching the SAME client (must NOT resolve -- ci.client_id <> cp.client_id
//    is a structural fix this round, not merely a comment), and a blank registration_normalized
//    (must NOT resolve either).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, opk, endPool, printLaneNotes, printSkipCount, noteLane, markSkip,
  a21EnsureReady, firmOf,
} from "./a21-helpers.mjs";
import { addBankAccount } from "./x38-match-fixtures.mjs";
import { wakeQuery, roleQuery } from "./rig-helpers.mjs";
import { WAKE_ROLE, RATIONALE, MODEL, mintCred, callWrapper, realDigest } from "./f-a3-pr1b-wake-fixtures.mjs";
import { freshAdvClient, disburse, applicationLines, ADV1, BANKV, advWorld } from "./x42-adv-world.mjs";

// The pre-extraction sha256(prosrc) of clara.book_staff_advance_application, measured on a rig
// held at the exact pre-0129 frontier (0129 pulled out of CLARA_MIGRATIONS_DIR, reset, migrated
// to 0128, sha256(prosrc) read, 0129 restored) -- never taken from a file, the same law 0129's
// own SS0 sha-pins and PR-1a's NINE (0119:143-184) both observe: this body is the one thing that
// makes "byte-for-byte extraction" a proof rather than an assertion.
const PRE_EXTRACTION_SHA = "a27da323ccc67cb054fd12bb8a618987ff710adcb72cc5456f2b3ea4c96ba17c";
const CORE = "clara._book_staff_advance_application_core(jsonb,uuid,date,text,jsonb,jsonb,text,text,text)";
const PUBLIC_VERB = "clara.book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text)";
const WAKE_WRAPPER = "clara.wake_book_staff_advance_application(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)";
const AGENT_CORE = "clara._agent_book_staff_advance_application_core(uuid,date,text,jsonb,jsonb,text,text,text,jsonb,text,text)";
const CONFIRM_DOOR = "clara.confirm_bank_identifier_promotion(uuid,text)";

let ready = false;

/** PR-1c's own pre-PR gate, exactly as f-a3-pr1b-wake-verbs.test.mjs's before() does it: a raw
 *  consent+activation insert (never through grant_client_egress_purpose/activate_client_egress_
 *  purpose, each of which carries its own in-body enum raise independent of the table CHECK and
 *  is PR-1c's own CoR, not this file's to pre-empt). Every bank_agent Tier-A call in this file
 *  needs this or refuses purpose_unconsented before reaching any judgement rung. */
async function grantBankMatching({ client, firm, actor }) {
  const { consentEvidenceDoc } = await import("./wave-b/wb-0020-helpers.mjs");
  const evidence = await consentEvidenceDoc(actor, { firm });
  const consent = await rootQuery(
    `insert into clara.client_egress_purpose_consents(firm_id, client_id, purpose, scope_note, evidence_document_id, granted_by)
       values ($1,$2,'bank_matching','f-a3-pr3-doors rig consent',$3,$4) returning id`,
    [firm, client, evidence.documentId, actor]);
  await rootQuery(
    `insert into clara.client_egress_purpose_activations(firm_id, client_id, purpose, consent_id, activated_by)
       values ($1,$2,'bank_matching',$3,$4)`,
    [firm, client, consent.rows[0].id, actor]);
}

function skipHere(t) {
  if (!ready) { markSkip(); t.skip("F-A3 PR-3 SS2/SS3 doors not present -- dormant"); return true; }
  return false;
}

before(async () => {
  const base = await a21EnsureReady();
  const r = await rootQuery(
    `select to_regprocedure($1) as core, to_regprocedure($2) as verb,
            to_regprocedure($3) as wake, to_regprocedure($4) as agent,
            to_regprocedure($5) as confirm,
            (select 1 from pg_roles where rolname='clara_wake_bank_login') as login`,
    [CORE, PUBLIC_VERB, WAKE_WRAPPER, AGENT_CORE, CONFIRM_DOOR]);
  const row = r.rows[0];
  ready = Boolean(base.base) && row.core != null && row.verb != null && row.wake != null
    && row.agent != null && row.confirm != null && row.login != null;
  if (!ready) noteLane("F-A3 PR-3 SS2/SS3 doors absent -- f-a3-pr3-doors suite dormant");
});

after(async () => {
  printLaneNotes("f-a3-pr3-doors");
  printSkipCount("f-a3-pr3-doors");
  await endPool();
});

// ===========================================================================
// MF-A -- the allowlist row (the fix's own claim, positive + negative)
// ===========================================================================

test("f-a3pr3.mfA.pos a real bank_agent credential now reaches wake_book_staff_advance_application end to end", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("mfApos");
  const { advance } = await disburse({ client, cents: 100_000, postingDate: "2026-07-01" });
  const w = await advWorld();
  const acct = await addBankAccount(w.users.alice, { client, coaAccountCode: BANKV, accountNumber: `MFAPOS${randomUUID().slice(0, 6)}` });
  const bankAccountId = acct.bank_account_id ?? acct.id;
  const firm = await firmOf(client);
  await grantBankMatching({ client, firm, actor: w.users.alice });
  const cred = await mintCred("bank_agent", firm, client);
  const digest = await realDigest(cred.secret, client, bankAccountId, opk("mfa-pos-pack"));
  const specs = [
    { name: "p_client", cast: "uuid" }, { name: "p_posting_date", cast: "date" }, { name: "p_memo" },
    { name: "p_lines", cast: "jsonb" }, { name: "p_allocations", cast: "jsonb" }, { name: "p_kind" },
    { name: "p_reason" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
    { name: "p_inputs_digest" }, { name: "p_op_key" }];
  const opKey = opk("mfa-pos");
  const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_book_staff_advance_application", specs), [
    client, "2026-07-05", "mfA.pos agent application", JSON.stringify(applicationLines(ADV1, 40_000)),
    JSON.stringify([{ line_no: 2, advance_id: advance.id, amount_cents: 40_000 }]),
    "payroll_deduction", "mfA.pos rig application", RATIONALE, JSON.stringify(MODEL), digest, opKey,
  ]);
  const res = r.rows[0].r;
  assert.notEqual(res.status, "refused", `mfA.pos: the wake door admits a real application (got ${JSON.stringify(res)})`);
  assert.ok(res.entry_id ?? res.id, "mfA.pos: the receipt names an entry");

  const receipts = await rootQuery(
    `select act_kind, outcome from clara.bank_agent_receipts where op_key = $1`, [opKey]);
  assert.equal(receipts.rows.length, 1, "mfA.pos: exactly one bank_agent_receipts row for this op_key");
  assert.equal(receipts.rows[0].act_kind, "staff_advance_application");
  assert.equal(receipts.rows[0].outcome, "admitted");

  const appRows = await rootQuery(
    `select count(*)::int as n from clara.staff_advance_applications where advance_id = $1`, [advance.id]);
  assert.equal(appRows.rows[0].n, 1, "mfA.pos: the B-lite register carries the application row");
});

test("f-a3pr3.mfA.neg a credential of a kind WITHOUT this verb's allowlist row still refuses CLR03 -- the allowlist gate itself, not merely a bad credential shape", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("mfAneg");
  const firm = await firmOf(client);
  // autodraft carries its own, DIFFERENT allowlist -- never bank_agent's staff-advance row.
  const cred = await mintCred("autodraft", firm, client);
  const specs = [
    { name: "p_client", cast: "uuid" }, { name: "p_posting_date", cast: "date" }, { name: "p_memo" },
    { name: "p_lines", cast: "jsonb" }, { name: "p_allocations", cast: "jsonb" }, { name: "p_kind" },
    { name: "p_reason" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
    { name: "p_inputs_digest" }, { name: "p_op_key" }];
  let err = null;
  try {
    await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_book_staff_advance_application", specs), [
      client, "2026-07-05", "mfA.neg", JSON.stringify(applicationLines(ADV1, 1000)),
      JSON.stringify([{ line_no: 2, advance_id: randomUUID(), amount_cents: 1000 }]),
      "payroll_deduction", "r", RATIONALE, JSON.stringify(MODEL), "d", opk("mfa-neg"),
    ]);
  } catch (e) { err = e; }
  assert.ok(err, "mfA.neg: an autodraft credential is refused");
  assert.equal(err?.code, "CLR03", `mfA.neg: expected CLR03 (assert_wake_allowed), got ${err?.code}: ${err?.message}`);
});

// ===========================================================================
// C3c -- the third extraction's three twins (PR-1a's own (a)/(c)/(f), scoped to this one verb)
// ===========================================================================

// PR-1a's own idiom, verbatim (f-a3-pr1a-extraction.test.mjs:106-111): the extraction's FIRST
// substitution is this whole FIVE-line block (the ctx-unpack select PLUS the core_ctx_missing
// guard it needed that the original never did -- `_human_ctx()` itself guaranteed a non-null
// actor/firm or threw its own exception) for the single original acquisition line.
const CTX_BLOCK =
  `  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the book_staff_advance_application core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;`;
const CTX_ANCHOR = "  c := clara._human_ctx(clara.role_rank('bookkeeper'));";

// The SECOND substitution (review round fix, CLR08 the agent-post receipt wall): an is_agent-
// gated entry_post_receipts insert right after the SAME approve call the human path already
// took, matching _allocate_receipt_core's own precedent. Inverting it drops the whole `if
// coalesce(...)` block back to nothing -- the human path is byte-unmoved either way.
const RECEIPT_BLOCK_ANCHOR =
  `    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, null, v_approve_key);
    v_status := 'posted';`;
const RECEIPT_BLOCK_CTX = RECEIPT_BLOCK_ANCHOR +
  `
    if coalesce((p_ctx->>'is_agent')::boolean, false) then
      insert into clara.entry_post_receipts(firm_id, client_id, entry_id, acting_actor,
          on_behalf_of, via_wake_kind, model_snapshot, rationale, gate_verdicts, approval_arm,
          maker_active_at_approval, op_key)
        values (c.firm, p_client, v_entry, c.actor,
          nullif(p_ctx->>'on_behalf_of','')::uuid, coalesce(p_ctx->>'wake_kind','bank_agent'),
          coalesce(p_ctx->'model', '{}'::jsonb),
          coalesce(nullif(btrim(p_ctx->>'rationale'),''), 'Staff advance application (agent)'),
          jsonb_build_object('op_key', v_approve_key), 'agent_unattended', null, v_approve_key);
    end if;`;

test("f-a3pr3.c3c.a the extracted core is the PRE-EXTRACTION body byte-for-byte: inverting BOTH substitutions re-derives the pinned sha256", async (t) => {
  if (skipHere(t)) return;
  const r = await rootQuery(
    `select prosrc, encode(sha256(prosrc::bytea),'hex') as post_sha from pg_proc where oid = $1::regprocedure`, [CORE]);
  const coreSrc = r.rows[0].prosrc;
  const ctxOccurrences = coreSrc.split(CTX_BLOCK).length - 1;
  assert.equal(ctxOccurrences, 1,
    `c3c.a: the core carries the ctx-unpack block EXACTLY once (found ${ctxOccurrences})`);
  const receiptOccurrences = coreSrc.split(RECEIPT_BLOCK_CTX).length - 1;
  assert.equal(receiptOccurrences, 1,
    `c3c.a: the core carries the entry_post_receipts insert block EXACTLY once (found ${receiptOccurrences})`);
  const inverted = coreSrc.split(CTX_BLOCK).join(CTX_ANCHOR).split(RECEIPT_BLOCK_CTX).join(RECEIPT_BLOCK_ANCHOR);
  const crypto = await import("node:crypto");
  const sha = crypto.createHash("sha256").update(inverted, "utf8").digest("hex");
  assert.equal(sha, PRE_EXTRACTION_SHA,
    "c3c.a: inverting BOTH of the core's substitutions reproduces the pinned pre-extraction sha256 -- nothing else moved");
  assert.notEqual(r.rows[0].post_sha, PRE_EXTRACTION_SHA,
    "c3c.a: NON-VACUOUS -- the installed core really does differ from the pre-extraction body");
  assert.ok(!coreSrc.includes("clara._human_ctx("),
    "c3c.a: the core resolves no human context of its own -- it takes one, which is the point of the extraction");
});

test("f-a3pr3.c3c.b the extracted core holds ZERO grants: PUBLIC has nothing and no clara role can execute it", async (t) => {
  if (skipHere(t)) return;
  const pub = await rootQuery(`select has_function_privilege('public', $1::regprocedure, 'execute') as x`, [CORE]);
  assert.equal(pub.rows[0].x, false, "c3c.b: PUBLIC cannot execute the core");
  for (const role of ["clara_authenticated", "clara_wake_bank", "clara_wake_interactive", "clara_runtime"]) {
    const r = await rootQuery(`select has_function_privilege($1, $2::regprocedure, 'execute') as x`, [role, CORE]);
    assert.equal(r.rows[0].x, false, `c3c.b: ${role} cannot execute the core`);
  }
  const wrapperExec = await rootQuery(`select has_function_privilege('clara_authenticated', $1::regprocedure, 'execute') as x`, [PUBLIC_VERB]);
  assert.equal(wrapperExec.rows[0].x, true, "c3c.b: clara_authenticated still executes the thin public wrapper");
});

test("f-a3pr3.c3c.c the core called with no actor or firm in its context refuses CLR10 core_ctx_missing", async (t) => {
  if (skipHere(t)) return;
  let err = null;
  try {
    await roleQuery("clara_fn_owner",
      `select clara._book_staff_advance_application_core($1::jsonb,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)`,
      ["{}", randomUUID(), "2026-07-01", "memo", "[]", "[]", "payroll_deduction", "reason", opk("c3c-c")]);
  } catch (e) { err = e; }
  assert.ok(err, "c3c.c: an empty ctx is refused");
  assert.equal(err?.code, "CLR10", `c3c.c: expected CLR10, got ${err?.code}: ${err?.message}`);
  assert.match(String(err?.detail ?? ""), /core_ctx_missing/,
    `c3c.c: names the typed reason core_ctx_missing (got ${err?.detail ?? "(none)"})`);
});

// ===========================================================================
// C3b -- confirm_bank_identifier_promotion: judgement logic, both polarities + the two traps
// ===========================================================================

/** Build a real OPEN identifier_promotion proposal through the audited producer
 *  (wake_propose_bank_identifier_promotion, PR-1b) -- x37 dog-fooding law, never a raw insert
 *  for the proposal itself. `regNo` (raw, alnum + punctuation) is normalized here the SAME way
 *  ck_counterparties_registration_normalized demands (lower + strip non-alnum) -- null skips
 *  the registration entirely (both columns null, the trap2 shape). Returns
 *  { proposalId, counterpartyId }. */
async function realPromotionProposal({ client, firm, regNo, identifierValue }) {
  const w = await advWorld();
  const normalized = regNo == null ? null : regNo.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cp = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, registration_no, registration_normalized, created_by)
       values ($1,$2,'customer','C3B Payer','c3bpayer',$3,$4,$5) returning id`,
    [firm, client, regNo, normalized, w.users.alice]);
  const counterpartyId = cp.rows[0].id;
  const acct = await addBankAccount(w.users.alice, { client, coaAccountCode: BANKV, accountNumber: `C3B${randomUUID().slice(0, 6)}` });
  const bankAccountId = acct.bank_account_id ?? acct.id;
  await grantBankMatching({ client, firm, actor: w.users.alice });
  const cred = await mintCred("bank_agent", firm, client);
  const digest = await realDigest(cred.secret, client, bankAccountId, opk("c3b-pack"));
  const r = await wakeQuery(WAKE_ROLE, cred.secret,
    callWrapper("wake_propose_bank_identifier_promotion", [
      { name: "p_client", cast: "uuid" }, { name: "p_counterparty", cast: "uuid" },
      { name: "p_identifier_kind" }, { name: "p_identifier_value" }, { name: "p_times_seen", cast: "int" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
    [client, counterpartyId, "ssm", identifierValue, 3, RATIONALE, JSON.stringify(MODEL), digest, opk("c3b-propose")]);
  const proposalId = r.rows[0].r.proposal_id;
  assert.ok(proposalId, `realPromotionProposal: the propose door names a proposal (got ${JSON.stringify(r.rows[0].r)})`);
  return { proposalId, counterpartyId };
}

async function confirmAs(sub, { proposalId, opKey = null }) {
  return humanQuery(sub,
    `select clara.confirm_bank_identifier_promotion($1, $2) as r`,
    [proposalId, opKey ?? opk("c3b-confirm")]);
}

test("f-a3pr3.c3b.pos a promoted payer that IS itself a different client of this firm confirms: add_client_identifier writes, the proposal flips accepted", async (t) => {
  if (skipHere(t)) return;
  const w = await advWorld();
  const { client } = await freshAdvClient("c3bpos");
  const firm = await firmOf(client);
  const target = await freshAdvClient("c3bposTarget", { enrol: false });
  const reg = `C3BPOS${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.client_identifiers(firm_id, client_id, kind, value_normalized, added_by)
       values ($1,$2,'ssm',$3,$4)`,
    [firm, target.client, reg.toLowerCase(), w.users.alice]);
  const { proposalId } = await realPromotionProposal({
    client, firm, regNo: reg, identifierValue: "201599112233",
  });
  const r = await confirmAs(w.users.alice, { proposalId });
  const res = r.rows[0].r;
  assert.notEqual(res.status, "refused", `c3b.pos: confirms when the payer is genuinely a different client (got ${JSON.stringify(res)})`);

  const idRows = await rootQuery(
    `select count(*)::int as n from clara.client_identifiers where client_id = $1 and kind='ssm' and value_normalized='201599112233'`,
    [target.client]);
  assert.equal(idRows.rows[0].n, 1, "c3b.pos: add_client_identifier wrote onto the TARGET client");

  const pr = await rootQuery(`select status, decided_by, decided_at from clara.bank_agent_proposals where id = $1`, [proposalId]);
  assert.equal(pr.rows[0].status, "accepted", "c3b.pos: the proposal flips to accepted");
  assert.ok(pr.rows[0].decided_by, "c3b.pos: decided_by is stamped");
  assert.ok(pr.rows[0].decided_at, "c3b.pos: decided_at is stamped");
});

test("f-a3pr3.c3b.neg a payer that matches NO client refuses promotion_target_unavailable, and the proposal STAYS open", async (t) => {
  if (skipHere(t)) return;
  const w = await advWorld();
  const { client } = await freshAdvClient("c3bneg");
  const firm = await firmOf(client);
  const reg = `C3BNEG${randomUUID().slice(0, 8)}`; // matches nobody's client_identifiers
  const { proposalId } = await realPromotionProposal({
    client, firm, regNo: reg, identifierValue: "201500000000",
  });
  let err = null;
  try { await confirmAs(w.users.alice, { proposalId }); } catch (e) { err = e; }
  assert.ok(err, "c3b.neg: refuses when no client owns a matching ssm/tin");
  assert.match(String(err?.detail ?? ""), /promotion_target_unavailable/,
    `c3b.neg: names promotion_target_unavailable (got ${err?.detail ?? "(none)"})`);

  const pr = await rootQuery(`select status, decided_by, decided_at from clara.bank_agent_proposals where id = $1`, [proposalId]);
  assert.equal(pr.rows[0].status, "open", "c3b.neg: the proposal stays OPEN, not silently closed");
  assert.equal(pr.rows[0].decided_by, null, "c3b.neg: decided_by stays null");
  assert.equal(pr.rows[0].decided_at, null, "c3b.neg: decided_at stays null");
});

test("f-a3pr3.c3b.trap1 the SAME-client trap: a client_identifiers row belonging to the PROPOSAL'S OWN client must NOT resolve as the promotion target", async (t) => {
  if (skipHere(t)) return;
  const w = await advWorld();
  const { client } = await freshAdvClient("c3btrap1");
  const firm = await firmOf(client);
  const reg = `C3BTRAP1${randomUUID().slice(0, 6)}`;
  // The client's OWN identifier -- a counterparty on ITS OWN books happens to structurally echo
  // it (e.g. a reference number coincidence). This must NEVER resolve to `client` itself: there
  // is no different payer identity there to promote.
  await rootQuery(
    `insert into clara.client_identifiers(firm_id, client_id, kind, value_normalized, added_by)
       values ($1,$2,'ssm',$3,$4)`,
    [firm, client, reg.toLowerCase(), w.users.alice]);
  const { proposalId } = await realPromotionProposal({
    client, firm, regNo: reg, identifierValue: "201577884455",
  });
  let err = null;
  try { await confirmAs(w.users.alice, { proposalId }); } catch (e) { err = e; }
  assert.ok(err, "c3b.trap1: a same-client match is refused, not silently accepted");
  assert.match(String(err?.detail ?? ""), /promotion_target_unavailable/,
    `c3b.trap1: names promotion_target_unavailable (got ${err?.detail ?? "(none)"}) -- ci.client_id <> cp.client_id must exclude the proposal's own client`);
  const pr = await rootQuery(`select status from clara.bank_agent_proposals where id = $1`, [proposalId]);
  assert.equal(pr.rows[0].status, "open", "c3b.trap1: the proposal stays open");
});

test("f-a3pr3.c3b.trap2 a counterparty with NO registration_normalized at all must NOT resolve (the NULL/blank floor)", async (t) => {
  if (skipHere(t)) return;
  const w = await advWorld();
  const { client } = await freshAdvClient("c3btrap2");
  const firm = await firmOf(client);
  // regNo: null -- realPromotionProposal leaves BOTH registration_no and registration_normalized
  // null on the counterparty (the shape ck_counterparties_registration_normalized itself
  // demands for "no registration"), even though SOME client somewhere might carry a blank/empty
  // client_identifiers.value_normalized. The wall this proves is on the COUNTERPARTY side --
  // nullif(btrim(coalesce(cp.registration_normalized,'')),'') is not null -- never on whether
  // some unrelated row happens to be blank.
  const { proposalId } = await realPromotionProposal({
    client, firm, regNo: null, identifierValue: "201599900011",
  });

  let err = null;
  try { await confirmAs(w.users.alice, { proposalId }); } catch (e) { err = e; }
  assert.ok(err, "c3b.trap2: a null registration_normalized refuses rather than matching vacuously");
  assert.match(String(err?.detail ?? ""), /promotion_target_unavailable/,
    `c3b.trap2: names promotion_target_unavailable (got ${err?.detail ?? "(none)"})`);
});
