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
import { addBankAccount, enterStatement } from "./x38-match-fixtures.mjs";
import { wakeQuery, roleQuery } from "./rig-helpers.mjs";
import { WAKE_ROLE, RATIONALE, MODEL, mintCred, callWrapper, realDigest, approvedEntry } from "./f-a3-pr1b-wake-fixtures.mjs";
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

/** C1-bis (migration 0134) lands SEPARATELY from 0129's SS5 doors, so its cell needs its own
 *  gate: on a database migrated to 0129/0130 but not yet 0134, the SS2/SS3 doors above are all
 *  present (`ready` is true) while the widened conflict-identity comparison is not. Probed the
 *  way this file probes everything else -- against the LIVE catalog, on text 0134 itself
 *  installs and nothing else does -- never on a schema_migrations row, which records that a file
 *  RAN, not that this body carries the change. */
let c1bisReady = false;
/** ...and the PRE-0134 shape, read separately. A gate that only asks "is the new text there?"
 *  turns a REGRESSION (a later recut silently dropping the widened comparison) into a quiet
 *  skip -- proof deletion wearing a skip's clothes. So both shapes are probed, and the cell
 *  skips only when the body positively carries the OLD one. A body carrying NEITHER is not a
 *  pre-0134 chain, it is a body nobody understands: that falls through to the fail-closed
 *  branch (review law 2 -- absence is not evidence). */
let c1PreShape = false;
const C1BIS_MARKER =
  "acting_actor, on_behalf_of, via_wake_kind, model_snapshot, rationale, approval_arm into v_existing";
// 0129's C1 error wording. The C1-bis body says ".../digest/outcome/who'", so the two markers
// are mutually exclusive by construction, not by convention.
const C1_MARKER = "digest/outcome', p_op_key";
const RECEIPT_FN =
  "clara._agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamptz)";

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

/** Gate for the C1-bis cell: the SS2/SS3 doors AND migration 0134's widened comparison. Skips
 *  LOUDLY (a counted skip + a lane note), never silently, on a pre-0134 chain. */
function skipC1bis(t) {
  if (skipHere(t)) return true;
  if (c1bisReady) return false;
  if (c1PreShape) {
    markSkip();
    t.skip("F-A3 PR-3 C1-bis (0134) widened receipt identity not present -- dormant");
    return true;
  }
  // Neither shape: do NOT skip. Fall through so the cell runs and fails loudly.
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

  // C1-bis (0134): read the LIVE body and look for the text 0134 installs. `position(...) > 0`
  // on a NULL prosrc (function absent) yields NULL, so the Boolean() falls to false -- a body
  // this probe could not read never reports ready.
  const c = await rootQuery(
    `select position($1 in p.prosrc) > 0 as has_bis, position($2 in p.prosrc) > 0 as has_c1
       from pg_proc p where p.oid = to_regprocedure($3)`,
    [C1BIS_MARKER, C1_MARKER, RECEIPT_FN]);
  c1bisReady = Boolean(c.rows[0]?.has_bis);
  c1PreShape = Boolean(c.rows[0]?.has_c1);
  if (ready && !c1bisReady && c1PreShape) {
    noteLane("F-A3 PR-3 C1-bis (0134) absent -- the c1bis identity cell is dormant");
  }
  if (ready && !c1bisReady && !c1PreShape) {
    noteLane("F-A3 PR-3 C1-bis: _agent_bank_receipt carries NEITHER the C1 nor the C1-bis conflict block -- the c1bis cell will RUN and fail rather than skip");
  }
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
    `select act_kind, outcome, acting_actor, on_behalf_of, via_wake_kind, approval_arm
       from clara.bank_agent_receipts where op_key = $1`, [opKey]);
  assert.equal(receipts.rows.length, 1, "mfA.pos: exactly one bank_agent_receipts row for this op_key");
  assert.equal(receipts.rows[0].act_kind, "staff_advance_application");
  assert.equal(receipts.rows[0].outcome, "admitted");
  // SS5 provenance-threading regression twin, scoped to THIS core: staff-advance never gains an
  // interactive_client allowlist row (the ordering decision, SS4's own header), so it can only
  // ever be reached under a bank_agent credential -- _agent_book_staff_advance_application_core
  // is authored to call clara._agent_wake_ctx directly (never CoR-patched, SS5's own header), and
  // this proves that call site resolves the SAME unattended identity as before the fix.
  const agentUserRow = await rootQuery(`select clara.agent_user_id() as id`);
  assert.equal(receipts.rows[0].acting_actor, agentUserRow.rows[0].id,
    "mfA.pos: acting_actor is the SYSTEM agent user -- staff-advance has no interactive_client path");
  assert.equal(receipts.rows[0].on_behalf_of, null, "mfA.pos: on_behalf_of stays NULL for an unattended act");
  assert.equal(receipts.rows[0].via_wake_kind, "bank_agent", "mfA.pos: via_wake_kind is bank_agent, unchanged");
  assert.equal(receipts.rows[0].approval_arm, "agent_unattended", "mfA.pos: approval_arm is agent_unattended, unchanged");

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

// THIRD substitution (F2, review finding): last_human_editor gains the case-arm instead of
// unconditionally stamping c.actor -- mirrors the migration's own v_anchor3/v_ctx3 pair.
const LHE_ANCHOR =
  `      maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_posting_date, v_memo, 'manual', c.actor, c.actor,`;
const LHE_CTX =
  `      maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_posting_date, v_memo, 'manual', c.actor,
      case when coalesce((p_ctx->>'is_agent')::boolean, false) then null else c.actor end,`;

test("f-a3pr3.c3c.a the extracted core is the PRE-EXTRACTION body byte-for-byte: inverting ALL THREE substitutions re-derives the pinned sha256", async (t) => {
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
  const lheOccurrences = coreSrc.split(LHE_CTX).length - 1;
  assert.equal(lheOccurrences, 1,
    `c3c.a: the core carries the last_human_editor case-arm block EXACTLY once (found ${lheOccurrences})`);
  const inverted = coreSrc.split(CTX_BLOCK).join(CTX_ANCHOR)
    .split(RECEIPT_BLOCK_CTX).join(RECEIPT_BLOCK_ANCHOR)
    .split(LHE_CTX).join(LHE_ANCHOR);
  const crypto = await import("node:crypto");
  const sha = crypto.createHash("sha256").update(inverted, "utf8").digest("hex");
  assert.equal(sha, PRE_EXTRACTION_SHA,
    "c3c.a: inverting ALL THREE of the core's substitutions reproduces the pinned pre-extraction sha256 -- nothing else moved");
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
async function realPromotionProposal({ client, firm, regNo, identifierValue, kind = "bank_account" }) {
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
    [client, counterpartyId, kind, identifierValue, 3, RATIONALE, JSON.stringify(MODEL), digest, opk("c3b-propose")]);
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
    `select count(*)::int as n from clara.client_identifiers where client_id = $1 and kind='bank_account' and value_normalized='201599112233'`,
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

// ===========================================================================
// MUST 2b -- the two normalizations must agree, PUNCTUATED forms included
// ===========================================================================

test("f-a3pr3.must2b a PUNCTUATED registration (hyphen) still resolves -- the two normalizations agree", async (t) => {
  if (skipHere(t)) return;
  const w = await advWorld();
  const { client } = await freshAdvClient("must2bpos");
  const firm = await firmOf(client);
  const target = await freshAdvClient("must2bposTarget", { enrol: false });
  // The RAW registration carries a hyphen; ci.value_normalized only strips whitespace
  // (add_client_identifier's own rule), so it is stored WITH the hyphen, lowercased.
  const reg = `1234567-A${randomUUID().slice(0, 4)}`;
  await rootQuery(
    `insert into clara.client_identifiers(firm_id, client_id, kind, value_normalized, added_by)
       values ($1,$2,'ssm',$3,$4)`,
    [firm, target.client, reg.toLowerCase(), w.users.alice]);
  const { proposalId } = await realPromotionProposal({
    client, firm, regNo: reg, identifierValue: "201599112244",
  });
  const r = await confirmAs(w.users.alice, { proposalId });
  assert.notEqual(r.rows[0].r.status, "refused",
    `must2b: a punctuated registration resolves the same target both normalizations agree on (got ${JSON.stringify(r.rows[0].r)})`);
});

test("f-a3pr3.must2b.neg a DIFFERENT normalization (only after re-deriving from raw) correctly still refuses when nothing matches", async (t) => {
  if (skipHere(t)) return;
  const w = await advWorld();
  const { client } = await freshAdvClient("must2bneg");
  const firm = await firmOf(client);
  const reg = `9-ZZ${randomUUID().slice(0, 6)}`; // matches nobody
  const { proposalId } = await realPromotionProposal({
    client, firm, regNo: reg, identifierValue: "201500000099",
  });
  let err = null;
  try { await confirmAs(w.users.alice, { proposalId }); } catch (e) { err = e; }
  assert.ok(err, "must2b.neg: a punctuated form matching nobody still refuses cleanly");
  assert.match(String(err?.detail ?? ""), /promotion_target_unavailable/,
    `must2b.neg: names promotion_target_unavailable (got ${err?.detail ?? "(none)"})`);
});

// ===========================================================================
// MUST 2c -- the door confirms a promoted payer BANK ACCOUNT only
// ===========================================================================

test("f-a3pr3.must2c a non-bank_account identifier_kind (ssm) refuses identifier_kind_out_of_scope, never writes", async (t) => {
  if (skipHere(t)) return;
  const w = await advWorld();
  const { client } = await freshAdvClient("must2c");
  const firm = await firmOf(client);
  const target = await freshAdvClient("must2cTarget", { enrol: false });
  const reg = `MUST2C${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.client_identifiers(firm_id, client_id, kind, value_normalized, added_by)
       values ($1,$2,'ssm',$3,$4)`,
    [firm, target.client, reg.toLowerCase(), w.users.alice]);
  // An agent-minted 'ssm' proposal (the exact live-proven exploit shape) -- the propose door
  // itself admits tin/ssm/bank_account; the WALL must be at the confirm door.
  const { proposalId } = await realPromotionProposal({
    client, firm, regNo: reg, identifierValue: "000000-MODEL-INVENTED", kind: "ssm",
  });
  let err = null;
  try { await confirmAs(w.users.alice, { proposalId }); } catch (e) { err = e; }
  assert.ok(err, "must2c: an ssm-kind confirm is refused");
  assert.match(String(err?.detail ?? ""), /identifier_kind_out_of_scope/,
    `must2c: names identifier_kind_out_of_scope (got ${err?.detail ?? "(none)"})`);
  const written = await rootQuery(
    `select count(*)::int as n from clara.client_identifiers where client_id = $1 and value_normalized = $2`,
    [target.client, "000000-model-invented"]);
  assert.equal(written.rows[0].n, 0, "must2c: THE MONEY ASSERTION -- no model-invented identifier was ever written");
  const pr = await rootQuery(`select status from clara.bank_agent_proposals where id = $1`, [proposalId]);
  assert.equal(pr.rows[0].status, "open", "must2c: the proposal stays open, not silently accepted or dropped");
});

// ===========================================================================
// MUST 2d -- ambiguity: two clients carrying the same identifier refuses, never guesses
// ===========================================================================

test("f-a3pr3.must2d two clients carrying the SAME identifier refuses promotion_target_ambiguous, never picks one", async (t) => {
  if (skipHere(t)) return;
  const w = await advWorld();
  const { client } = await freshAdvClient("must2d");
  const firm = await firmOf(client);
  const targetA = await freshAdvClient("must2dTargetA", { enrol: false });
  const targetB = await freshAdvClient("must2dTargetB", { enrol: false });
  const reg = `MUST2D${randomUUID().slice(0, 8)}`;
  for (const t2 of [targetA, targetB]) {
    await rootQuery(
      `insert into clara.client_identifiers(firm_id, client_id, kind, value_normalized, added_by)
         values ($1,$2,'ssm',$3,$4)`,
      [firm, t2.client, reg.toLowerCase(), w.users.alice]);
  }
  const { proposalId } = await realPromotionProposal({
    client, firm, regNo: reg, identifierValue: "201599887755",
  });
  let err = null;
  try { await confirmAs(w.users.alice, { proposalId }); } catch (e) { err = e; }
  assert.ok(err, "must2d: an ambiguous match (two clients) is refused, not silently resolved to one");
  assert.match(String(err?.detail ?? ""), /promotion_target_ambiguous/,
    `must2d: names promotion_target_ambiguous (got ${err?.detail ?? "(none)"})`);
  const pr = await rootQuery(`select status from clara.bank_agent_proposals where id = $1`, [proposalId]);
  assert.equal(pr.rows[0].status, "open", "must2d: the proposal stays open");
});

// ===========================================================================
// SS5 -- provenance threading (owner ruling, 2026-08-25): an interactive_client act writes
// the real human's identity, the real kind, the attended arm; a bank_agent act is UNCHANGED.
// Both polarities, real wake calls, real fixtures -- the class F-A5/PR-3's fold-in wall exists
// to prevent, proven the same way that one was.
// ===========================================================================

/** A statement line + an approved candidate entry ready for wake_match_bank_line, plus the
 *  bank_matching consent this file's OTHER cells already stage via grantBankMatching. */
async function provFixture(label) {
  const { client } = await freshAdvClient(label);
  const w = await advWorld();
  const firm = await firmOf(client);
  // A COIN-FLIP FLAKE, found by the G1 PR-2a lane rather than by design: the first six characters
  // of a uuid are hex, so roughly one run in fifty draws six LETTERS and add_bank_account refuses
  // "account number PROVxxxxxx has no digits" (FOLD-15's own floor -- an account is a number).
  // Digits are now guaranteed by construction rather than by luck.
  const acct = await addBankAccount(w.users.alice, {
    client, coaAccountCode: BANKV,
    accountNumber: `PROV${Date.now().toString().slice(-6)}${randomUUID().slice(0, 4)}` });
  const bankAccountId = acct.bank_account_id ?? acct.id;
  await grantBankMatching({ client, firm, actor: w.users.alice });
  const stmt = await enterStatement(w.users.alice, {
    client, bankAccount: bankAccountId,
    opening: 0, specs: [{ entryDate: "2026-07-16", amountCents: 33300, description: `${label} deposit` }],
  });
  const line = stmt.lines[0].id;
  // OTHERV ("620-V42", an ordinary expense) is explicitly provisioned by freshAdvClient's own
  // chart build (x42-adv-world.mjs's buildAdvChart) -- a real, guaranteed-present counter-leg,
  // never a guessed code.
  const entry = await approvedEntry({
    client, actor: w.users.alice, postingDate: "2026-07-16",
    memo: `${label} entry`, bankCoa: BANKV, otherCoa: "620-V42", cents: 33300,
  });
  return { client, firm, bankAccountId, line, entry, alice: w.users.alice };
}

test("f-a3pr3.ss5.interactive an interactive_client act writes the REAL human identity, kind, and attended arm", async (t) => {
  if (skipHere(t)) return;
  const { client, firm, bankAccountId, line, entry, alice } = await provFixture("ss5int");
  const cred = await mintCred("interactive_client", firm, client, alice);
  const digest = await realDigest(cred.secret, client, bankAccountId, opk("ss5int-pack"));
  const opKey = opk("ss5int-match");
  const specs = [
    { name: "p_client", cast: "uuid" }, { name: "p_lines", cast: "jsonb" }, { name: "p_entries", cast: "jsonb" },
    { name: "p_adjustments", cast: "jsonb" }, { name: "p_ack_period_exceptions" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }];
  const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_match_bank_line", specs),
    [client, JSON.stringify([line]), JSON.stringify([{ entry_id: entry, matched_cents: 33300 }]),
     null, true, RATIONALE, JSON.stringify(MODEL), digest, opKey]);
  const matchId = r.rows[0].r.match_id ?? r.rows[0].r.id;
  assert.notEqual(r.rows[0].r.status, "refused", `ss5.interactive: the match admits (got ${JSON.stringify(r.rows[0].r)})`);

  const m = await rootQuery(`select origin from clara.bank_matches where id = $1`, [matchId]);
  assert.equal(m.rows[0].origin, "human",
    "ss5.interactive: bank_matches.origin reads 'human' -- an attended act, not agent-stamped");

  const receipts = await rootQuery(
    `select acting_actor, on_behalf_of, via_wake_kind, approval_arm from clara.bank_agent_receipts where op_key = $1`,
    [opKey]);
  assert.equal(receipts.rows.length, 1, "ss5.interactive: exactly one receipt for this op_key");
  const rec = receipts.rows[0];
  assert.equal(rec.acting_actor, alice, "ss5.interactive: acting_actor is the REAL human, never the system agent user");
  assert.equal(rec.on_behalf_of, alice, "ss5.interactive: on_behalf_of is populated with the same human");
  assert.equal(rec.via_wake_kind, "interactive_client", "ss5.interactive: via_wake_kind names the REAL credential kind");
  assert.equal(rec.approval_arm, "interactive_client_attended", "ss5.interactive: approval_arm is an ATTENDED value, never agent_unattended");
});

test("f-a3pr3.ss5.regression a bank_agent (unattended) act is BYTE-UNCHANGED by the provenance fix", async (t) => {
  if (skipHere(t)) return;
  const { client, firm, bankAccountId, line, entry } = await provFixture("ss5reg");
  const cred = await mintCred("bank_agent", firm, client);
  const digest = await realDigest(cred.secret, client, bankAccountId, opk("ss5reg-pack"));
  const opKey = opk("ss5reg-match");
  const specs = [
    { name: "p_client", cast: "uuid" }, { name: "p_lines", cast: "jsonb" }, { name: "p_entries", cast: "jsonb" },
    { name: "p_adjustments", cast: "jsonb" }, { name: "p_ack_period_exceptions" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }];
  const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_match_bank_line", specs),
    [client, JSON.stringify([line]), JSON.stringify([{ entry_id: entry, matched_cents: 33300 }]),
     null, true, RATIONALE, JSON.stringify(MODEL), digest, opKey]);
  const matchId = r.rows[0].r.match_id ?? r.rows[0].r.id;
  assert.notEqual(r.rows[0].r.status, "refused", `ss5.regression: the match admits (got ${JSON.stringify(r.rows[0].r)})`);

  const m = await rootQuery(`select origin from clara.bank_matches where id = $1`, [matchId]);
  assert.equal(m.rows[0].origin, "agent", "ss5.regression: bank_matches.origin still reads 'agent' -- unchanged");

  const receipts = await rootQuery(
    `select acting_actor, on_behalf_of, via_wake_kind, approval_arm from clara.bank_agent_receipts where op_key = $1`,
    [opKey]);
  const rec = receipts.rows[0];
  assert.equal(rec.on_behalf_of, null, "ss5.regression: on_behalf_of stays NULL, exactly as before the fix");
  assert.equal(rec.via_wake_kind, "bank_agent", "ss5.regression: via_wake_kind is still bank_agent");
  assert.equal(rec.approval_arm, "agent_unattended", "ss5.regression: approval_arm is still agent_unattended");
  const actorRow = await rootQuery(`select is_agent from clara.users where id = $1`, [rec.acting_actor]);
  assert.equal(actorRow.rows[0]?.is_agent, true, "ss5.regression: acting_actor still resolves to the SYSTEM agent user, never a human");
});

// ===========================================================================
// F1 (review finding, HIGH, the blocker) -- SS5's census was short by two: the two propose
// cores build no ctx object and call clara._append_event DIRECTLY, so before the fix a
// chat-driven propose stamped the EVENT SPINE ITSELF as an agent act. Both polarities, on the
// domain_events row the propose call actually writes.
// ===========================================================================

test("f-a3pr3.f1.events.interactive a chat-driven propose (line_exception) stamps the domain_events row with the REAL human identity and kind", async (t) => {
  if (skipHere(t)) return;
  const w = await advWorld();
  const { client } = await freshAdvClient("f1evint");
  const firm = await firmOf(client);
  const acct = await addBankAccount(w.users.alice, { client, coaAccountCode: BANKV, accountNumber: `F1EVI${randomUUID().slice(0, 6)}` });
  const bankAccountId = acct.bank_account_id ?? acct.id;
  await grantBankMatching({ client, firm, actor: w.users.alice });
  const stmt = await enterStatement(w.users.alice, {
    client, bankAccount: bankAccountId,
    opening: 0, specs: [{ entryDate: "2026-07-17", amountCents: -5500, description: "f1evint fee" }],
  });
  const line = stmt.lines[0].id;
  const cred = await mintCred("interactive_client", firm, client, w.users.alice);
  const digest = await realDigest(cred.secret, client, bankAccountId, opk("f1evint-pack"));
  const specs = [
    { name: "p_line", cast: "uuid" }, { name: "p_kind" }, { name: "p_reason" },
    { name: "p_evidence_document", cast: "uuid" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
    { name: "p_inputs_digest" }, { name: "p_op_key" }];
  const opKey = opk("f1evint-propose");
  const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_propose_bank_line_exception", specs),
    [line, "disputed", "f1evint disputed by the client", null, RATIONALE, JSON.stringify(MODEL), digest, opKey]);
  assert.notEqual(r.rows[0].r.status, "refused", `f1.events.interactive: the propose admits (got ${JSON.stringify(r.rows[0].r)})`);

  const ev = await rootQuery(
    `select actor, on_behalf_of, via_wake_kind, payload from clara.domain_events
      where firm_id = $1 and event_type = 'bank.line_exception_proposed' and (payload->>'line_id')::uuid = $2
      order by seq desc limit 1`,
    [firm, line]);
  assert.equal(ev.rows.length, 1, "f1.events.interactive: the propose emitted exactly one event for this line");
  assert.equal(ev.rows[0].actor, w.users.alice, "f1.events.interactive: domain_events.actor is the REAL human, never the system agent user");
  assert.equal(ev.rows[0].on_behalf_of, w.users.alice, "f1.events.interactive: domain_events.on_behalf_of is populated with the same human");
  assert.equal(ev.rows[0].via_wake_kind, "interactive_client", "f1.events.interactive: domain_events.via_wake_kind names the REAL credential kind");
});

test("f-a3pr3.f1.events.regression a bank_agent (unattended) propose still stamps domain_events as the agent, unchanged", async (t) => {
  if (skipHere(t)) return;
  const w = await advWorld();
  const { client } = await freshAdvClient("f1evreg");
  const firm = await firmOf(client);
  const acct = await addBankAccount(w.users.alice, { client, coaAccountCode: BANKV, accountNumber: `F1EVR${randomUUID().slice(0, 6)}` });
  const bankAccountId = acct.bank_account_id ?? acct.id;
  await grantBankMatching({ client, firm, actor: w.users.alice });
  const stmt = await enterStatement(w.users.alice, {
    client, bankAccount: bankAccountId,
    opening: 0, specs: [{ entryDate: "2026-07-17", amountCents: -6600, description: "f1evreg fee" }],
  });
  const line = stmt.lines[0].id;
  const cred = await mintCred("bank_agent", firm, client);
  const digest = await realDigest(cred.secret, client, bankAccountId, opk("f1evreg-pack"));
  const specs = [
    { name: "p_line", cast: "uuid" }, { name: "p_kind" }, { name: "p_reason" },
    { name: "p_evidence_document", cast: "uuid" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
    { name: "p_inputs_digest" }, { name: "p_op_key" }];
  const opKey = opk("f1evreg-propose");
  const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_propose_bank_line_exception", specs),
    [line, "bank_error", "f1evreg bank error", null, RATIONALE, JSON.stringify(MODEL), digest, opKey]);
  assert.notEqual(r.rows[0].r.status, "refused", `f1.events.regression: the propose admits (got ${JSON.stringify(r.rows[0].r)})`);

  const ev = await rootQuery(
    `select actor, on_behalf_of, via_wake_kind from clara.domain_events
      where firm_id = $1 and event_type = 'bank.line_exception_proposed' and (payload->>'line_id')::uuid = $2
      order by seq desc limit 1`,
    [firm, line]);
  assert.equal(ev.rows[0].on_behalf_of, null, "f1.events.regression: on_behalf_of stays NULL, exactly as before the fix");
  assert.equal(ev.rows[0].via_wake_kind, "bank_agent", "f1.events.regression: via_wake_kind is still bank_agent");
  const actorRow = await rootQuery(`select is_agent from clara.users where id = $1`, [ev.rows[0].actor]);
  assert.equal(actorRow.rows[0]?.is_agent, true, "f1.events.regression: actor still resolves to the SYSTEM agent user, never a human");
});

// ===========================================================================
// F2 (review finding, MED-HIGH) -- an unattended staff-advance application must satisfy
// 0120:387-393's own segregation probe (maker_actor = agent_user_id() AND last_human_editor IS
// NULL), not read as neither human- nor agent-prepared.
// ===========================================================================

test("f-a3pr3.f2.agent-prepared an unattended staff-advance's journal_entries row satisfies 0120's v_agent_prepared probe", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("f2agentprep");
  const { advance } = await disburse({ client, cents: 60_000, postingDate: "2026-07-02" });
  const w = await advWorld();
  const firm = await firmOf(client);
  const acct = await addBankAccount(w.users.alice, { client, coaAccountCode: BANKV, accountNumber: `F2AP${randomUUID().slice(0, 6)}` });
  const bankAccountId = acct.bank_account_id ?? acct.id;
  await grantBankMatching({ client, firm, actor: w.users.alice });
  const cred = await mintCred("bank_agent", firm, client);
  const digest = await realDigest(cred.secret, client, bankAccountId, opk("f2agentprep-pack"));
  const specs = [
    { name: "p_client", cast: "uuid" }, { name: "p_posting_date", cast: "date" }, { name: "p_memo" },
    { name: "p_lines", cast: "jsonb" }, { name: "p_allocations", cast: "jsonb" }, { name: "p_kind" },
    { name: "p_reason" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
    { name: "p_inputs_digest" }, { name: "p_op_key" }];
  const opKey = opk("f2agentprep");
  const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_book_staff_advance_application", specs), [
    client, "2026-07-06", "f2 agent application", JSON.stringify(applicationLines(ADV1, 20_000)),
    JSON.stringify([{ line_no: 2, advance_id: advance.id, amount_cents: 20_000 }]),
    "payroll_deduction", "f2 rig application", RATIONALE, JSON.stringify(MODEL),
    digest, opKey,
  ]);
  const res = r.rows[0].r;
  assert.notEqual(res.status, "refused", `f2.agent-prepared: the wake door admits a real application (got ${JSON.stringify(res)})`);
  const entryId = res.entry_id ?? res.id;
  assert.ok(entryId, "f2.agent-prepared: the receipt names an entry");

  const je = await rootQuery(
    `select maker_actor, last_human_editor from clara.journal_entries where id = $1`, [entryId]);
  const agentUserRow = await rootQuery(`select clara.agent_user_id() as id`);
  assert.equal(je.rows[0].maker_actor, agentUserRow.rows[0].id,
    "f2.agent-prepared: maker_actor is the SYSTEM agent user, per 0120's own probe predicate");
  assert.equal(je.rows[0].last_human_editor, null,
    "f2.agent-prepared: last_human_editor is NULL -- the exact pair 0120:387-393's v_agent_prepared checks for");
});

// ===========================================================================
// C1 (review finding, Codex) -- a refused receipt must NOT be silently reusable by a later
// SUCCESSFUL act sharing the same op_key. Tested directly against clara._agent_bank_receipt
// (superuser call, matching this file's own c3c.c precedent of exercising an ungranted core
// directly) rather than orchestrating a full refuse/unblock/retry through business logic --
// the fix lives entirely in this one function's conflict-identity check, so this is the
// tightest, most direct proof of it.
// ===========================================================================

test("f-a3pr3.c1.outcome-mismatch a same-op_key retry with a DIFFERENT outcome refuses op_key_identity_mismatch; a fresh op_key succeeds", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("c1outcome");
  const firm = await firmOf(client);
  const cred = await mintCred("bank_agent", firm, client);
  const opKey = opk("c1-retry");
  // _agent_bank_receipt is UNGRANTED (no role holds EXECUTE) and reads clara.wake_context(),
  // so a direct call needs BOTH superuser (to bypass the grant, matching c3c.c's own
  // ungranted-core-call precedent) AND a live wake session -- set_config(...,true) binds
  // clara.wake_secret for exactly this one statement (LOCAL semantics), evaluated before the
  // receipt call in the same target list, never leaking to any later rootQuery call.
  const bind = `select set_config('clara.wake_secret', $1, true), `;

  // First call: recorded REFUSED (the Tier-B refusal shape -- same op_key, same everything
  // else, outcome='refused').
  const r1 = await rootQuery(
    bind + `clara._agent_bank_receipt($2,$3,'unmatch','refused',$4,$5,$6::jsonb,'d1',$7,$8::jsonb,null) as id`,
    [cred.secret, firm, client, client, RATIONALE, JSON.stringify(MODEL), opKey, JSON.stringify({ verdict: "refused" })]);
  assert.ok(r1.rows[0].id, "c1: the first (refused) call returns a receipt id");

  // Retry with the SAME op_key, but the act now COMMITS (outcome='admitted') -- must refuse,
  // never silently return the stale refused row.
  let err = null;
  try {
    await rootQuery(
      bind + `clara._agent_bank_receipt($2,$3,'unmatch','admitted',$4,$5,$6::jsonb,'d1',$7,$8::jsonb,null) as id`,
      [cred.secret, firm, client, client, RATIONALE, JSON.stringify(MODEL), opKey, JSON.stringify({ verdict: "admitted" })]);
  } catch (e) { err = e; }
  assert.ok(err, "c1: a same-op_key retry with a different outcome is refused, not silently reused");
  assert.equal(err?.code, "CLR10", `c1: expected CLR10, got ${err?.code}: ${err?.message}`);
  assert.match(String(err?.detail ?? ""), /op_key_identity_mismatch/,
    `c1: names op_key_identity_mismatch (got ${err?.detail ?? "(none)"})`);

  // A FRESH op_key for the retry succeeds, with a truthful (admitted) receipt.
  const freshKey = opk("c1-retry-fresh");
  const r2 = await rootQuery(
    bind + `clara._agent_bank_receipt($2,$3,'unmatch','admitted',$4,$5,$6::jsonb,'d1',$7,$8::jsonb,null) as id`,
    [cred.secret, firm, client, client, RATIONALE, JSON.stringify(MODEL), freshKey, JSON.stringify({ verdict: "admitted" })]);
  assert.ok(r2.rows[0].id, "c1: a fresh op_key succeeds");
  assert.notEqual(r2.rows[0].id, r1.rows[0].id, "c1: the fresh-key retry writes a NEW receipt row, not the stale one");
  const rec2 = await rootQuery(`select outcome, via_wake_kind from clara.bank_agent_receipts where id = $1`, [r2.rows[0].id]);
  assert.equal(rec2.rows[0].outcome, "admitted", "c1: the fresh receipt truthfully names the real outcome");
  assert.equal(rec2.rows[0].via_wake_kind, "bank_agent",
    "c1: the fresh receipt's via_wake_kind names the REAL calling credential kind (bank_agent, this cell's own caller)");
});

// ===========================================================================
// C1-bis (review finding, Codex final leg, MUST -- the concrete-scenario tiebreak between the
// opus leg's MERGE-READY and Codex's NOT-merge-ready). Landed as its OWN migration, 0134, NOT as
// an edit to 0129: 0129 is applied history and applied migrations are immutable
// (.claude/rules/db-migrations.md -- fix forward with a new file). This cell therefore proves
// 0134's body and carries its own 0134 gate, skipping loudly on a pre-0134 chain.
// C1 alone left acting_actor/on_behalf_of/
// via_wake_kind/model_snapshot/rationale/approval_arm (every OTHER column _agent_bank_receipt
// WRITES) out of the conflict-identity comparison. Concretely: a bank_agent act gets Tier-B
// refused on op_key K; an interactive_client human INDEPENDENTLY produces the SAME
// client/act_kind/subject/digest/outcome/gate_verdicts on the SAME op_key K (a name collision,
// not a replay of the same act) -- C1 alone reads back and returns the OLD bank_agent-attributed
// row, misattributing WHO acted. Proven directly: same op_key, same outcome, only the calling
// credential's KIND differs.
// ===========================================================================

test("f-a3pr3.c1bis.identity-mismatch a bank_agent-refused op_key retried via interactive_client (same outcome, different WHO) refuses op_key_identity_mismatch", async (t) => {
  if (skipC1bis(t)) return;
  const { client } = await freshAdvClient("c1bisident");
  const firm = await firmOf(client);
  const w = await advWorld();
  const bankCred = await mintCred("bank_agent", firm, client);
  const humanCred = await mintCred("interactive_client", firm, client, w.users.alice);
  const opKey = opk("c1bis-collide");
  const bind = `select set_config('clara.wake_secret', $1, true), `;

  // First call: a bank_agent act, refused, op_key K.
  const r1 = await rootQuery(
    bind + `clara._agent_bank_receipt($2,$3,'unmatch','refused',$4,$5,$6::jsonb,'d1',$7,$8::jsonb,null) as id`,
    [bankCred.secret, firm, client, client, RATIONALE, JSON.stringify(MODEL), opKey, JSON.stringify({ verdict: "refused" })]);
  assert.ok(r1.rows[0].id, "c1bis: the first (bank_agent, refused) call returns a receipt id");
  const rec1 = await rootQuery(`select via_wake_kind, acting_actor from clara.bank_agent_receipts where id = $1`, [r1.rows[0].id]);
  assert.equal(rec1.rows[0].via_wake_kind, "bank_agent", "c1bis: the first receipt is genuinely bank_agent-attributed");

  // Second call: an interactive_client human, SAME client/act_kind/subject/digest/outcome/
  // gate_verdicts, SAME op_key K -- everything C1 alone compares is IDENTICAL. Only the calling
  // credential's kind differs (and therefore acting_actor/on_behalf_of/via_wake_kind/
  // approval_arm, all wake_context()-derived). Must refuse -- must NOT return r1's row.
  let err = null;
  try {
    await rootQuery(
      bind + `clara._agent_bank_receipt($2,$3,'unmatch','refused',$4,$5,$6::jsonb,'d1',$7,$8::jsonb,null) as id`,
      [humanCred.secret, firm, client, client, RATIONALE, JSON.stringify(MODEL), opKey, JSON.stringify({ verdict: "refused" })]);
  } catch (e) { err = e; }
  assert.ok(err, "c1bis: an interactive_client retry on the same op_key, same outcome, refuses -- it must not silently inherit the bank_agent row's identity");
  assert.equal(err?.code, "CLR10", `c1bis: expected CLR10, got ${err?.code}: ${err?.message}`);
  assert.match(String(err?.detail ?? ""), /op_key_identity_mismatch/,
    `c1bis: names op_key_identity_mismatch (got ${err?.detail ?? "(none)"})`);

  // The stored row is UNCHANGED -- still bank_agent-attributed, never silently overwritten or
  // reattributed to the human caller.
  const recAfter = await rootQuery(`select via_wake_kind, acting_actor from clara.bank_agent_receipts where id = $1`, [r1.rows[0].id]);
  assert.equal(recAfter.rows[0].via_wake_kind, "bank_agent", "c1bis: the stored receipt stays bank_agent-attributed after the refused collision");
  assert.equal(recAfter.rows[0].acting_actor, rec1.rows[0].acting_actor, "c1bis: acting_actor on the stored row is untouched");
});

// ===========================================================================
// C2 (review finding, Codex, MUST -- seam split with lane-chatturn-v14) -- every OTHER cell in
// this file mints its op_keys through opk() (rig-helpers.mjs), an underscore-joined shape with
// no colon at all, so 0129's task-binding arm (`v_task is null or split_part(r.op_key, ':', 2)
// = v_task`) always takes its `v_task is null` fallback in this whole battery -- the bound
// branch itself has run in NO cell until this one. Proven directly against
// clara._agent_verify_inputs_digest (superuser call, matching c3c.c/c1's own ungranted-core
// precedent -- the function reads no wake_context(), so no wake_secret binding is needed)
// using a colon-shaped op_key in lane-chatturn-v14's actual documented format
// (bank-{verb}:{taskId}:{segment}:{payload}), both polarities.
// ===========================================================================

test("f-a3pr3.c2.task-binding a same-task pack-read grounds an act; a different-task pack-read refuses", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("c2task");
  const w = await advWorld();
  const firm = await firmOf(client);
  const acct = await addBankAccount(w.users.alice, { client, coaAccountCode: BANKV, accountNumber: `C2TB${randomUUID().slice(0, 6)}` });
  const bankAccountId = acct.bank_account_id ?? acct.id;
  await grantBankMatching({ client, firm, actor: w.users.alice });
  const cred = await mintCred("bank_agent", firm, client);

  const taskA = `c2ta-${randomUUID().slice(0, 8)}`;
  const taskB = `c2tb-${randomUUID().slice(0, 8)}`;
  // The pack-read's own op_key names taskA in the real chat shape -- never opk()'s
  // underscore-joined form, which is exactly why the bound branch goes unexercised elsewhere.
  const digest = await realDigest(cred.secret, client, bankAccountId, `bank-get_bank_pack:${taskA}:0:{}`);

  // Same task as the pack-read: admits (returns void, no exception).
  await rootQuery(`select clara._agent_verify_inputs_digest($1,$2,$3)`,
    [client, digest, `bank-add_bank_account:${taskA}:0:{}`]);

  // A DIFFERENT task: the digest is real and the client matches, but the task field diverges --
  // must refuse, not silently fall back to the client+digest-only match (that fallback is
  // reserved for op_keys carrying NO parseable task field at all, never for one naming a WRONG
  // task).
  let err = null;
  try {
    await rootQuery(`select clara._agent_verify_inputs_digest($1,$2,$3)`,
      [client, digest, `bank-add_bank_account:${taskB}:0:{}`]);
  } catch (e) { err = e; }
  assert.ok(err, "c2.task-binding: a different-task op_key refuses, not silently grounds on a stale task's pack-read");
  assert.equal(err?.code, "CLR10", `c2.task-binding: expected CLR10, got ${err?.code}: ${err?.message}`);
  assert.match(String(err?.detail ?? ""), /inputs_digest_unverified/,
    `c2.task-binding: names inputs_digest_unverified (got ${err?.detail ?? "(none)"})`);
});
