// Wave-B battery — migration 0020 §2 (ACTIVATION: the positive, owner-only gate)
// and §7.1 (the four owner RPCs' floors and op-key discipline).
//
// The ruling's "explicit owner re-attestation before synthesis lights" is a
// POSITIVE RECORD, not the absence of a hold: §2.1 verified at source that
// clear_wiki_synthesis_hold is granted to clara_runtime (0017:5126-5134), that the
// planner never reads wiki_synthesis_holds before the model call, and that a
// null-purpose LEGACY grant today clears the wiki hold. So the load-bearing cell
// here is: A TYPED GRANT ALONE NEVER AUTHORIZES — and specifically not when there
// is NO hold row at all, which is the exact state the old "clear the hold" design
// mistook for authorization. CONTRACT-BLIND; FAILS below 0020.
//
// AMBIGUITIES recorded here:
//   [A20-8] §7.1 pins activation's arg NAMES (p_client, p_purpose, p_consent,
//           p_op_key) but not its TYPES; encoded (uuid,text,uuid,text).
//   [A20-9] §7.1 lists the owner floor as "raises through _human_ctx
//           (CLR03/CLR04)" — asserted as the two-code set, never a single code.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, opk, assertRaises, assertRaisesOneOf, endPool, printLaneNotes, noteLane,
  detailReason, checkDefs, uniqueIndexDefs, roleCanExecute,
  fail0020, wbEnsureReady20,
  buildWaveBWorld, createClient, seedOpeningCoa,
  WIKI_PURPOSE, TYPED_ACTIVATION_TABLE, UNKNOWN_VERDICT,
  grantPurpose, activatePurpose, deactivatePurpose, revokePurpose,
  consentEvidenceDoc, livePurposeConsent, livePurposeActivation, purposeActivationRows,
  prepareForLatestEvent, holdRow, countRows, OWNER_FNS,
} from "./wb-0020-helpers.mjs";

let live = false;
let w = null;

/** A fresh firm-A client with a minimal CoA — every cell here needs an untouched
 *  consent/activation history, and the shared A1/A2 accumulate state. */
async function freshClient(tag) {
  const c = await createClient(w.users.alice, { name: `${w.prefix}_${tag}`, opKey: opk("cli") });
  await seedOpeningCoa(w.users.alice, c);
  return c;
}

before(async () => {
  live = await wbEnsureReady20();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0020-activation"); await endPool(); });

test("META: 0020 applied — the activation relation exists with the version-match surfaces", async () => {
  fail0020(live);
  const cols = (await rootQuery(
    `select column_name from information_schema.columns
       where table_schema='clara' and table_name=$1 order by column_name`,
    [TYPED_ACTIVATION_TABLE])).rows.map((x) => x.column_name);
  for (const c of ["id", "firm_id", "client_id", "purpose", "consent_id", "activated_by",
    "activated_at", "deactivated_by", "deactivated_at", "deactivation_reason"]) {
    assert.ok(cols.includes(c), `clara.${TYPED_ACTIVATION_TABLE}.${c} exists (got ${cols.join(",")})`);
  }
  const defs = await checkDefs(TYPED_ACTIVATION_TABLE);
  assert.ok(/deactivated_at/.test(defs) && /deactivated_by/.test(defs) && /deactivation_reason/.test(defs),
    `the paired deactivation CHECK names all three columns (got ${defs})`);
  const uq = (await uniqueIndexDefs(TYPED_ACTIVATION_TABLE)).join("\n");
  assert.ok(/\(client_id, ?purpose\)[\s\S]*?where[\s\S]*?deactivated_at is null/i.test(uq),
    `partial unique on (client_id,purpose) where deactivated_at is null (got:\n${uq})`);
});

test("[0020 §2.2]: the composite FK (consent_id,firm_id,client_id,purpose) → the typed consent's (id,firm_id,client_id,purpose) — an activation CANNOT name another client's, firm's or purpose's consent", async () => {
  fail0020(live);
  const fk = (await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname=$1 and c.contype='f'`,
    [TYPED_ACTIVATION_TABLE])).rows.map((x) => x.def).join("\n");
  assert.ok(/\(consent_id, ?firm_id, ?client_id, ?purpose\)/i.test(fk),
    `the four-column composite FK is present (got:\n${fk})`);
  assert.ok(/client_egress_purpose_consents\(id, ?firm_id, ?client_id, ?purpose\)/i.test(fk),
    "…targeting the typed consent's (id,firm_id,client_id,purpose) unique — the structural purpose match");
});

test("[0020 §2.3 / §9.1 — THE load-bearing activation cell]: a typed consent that is LIVE but NEVER ACTIVATED returns `unknown` — and it does so with NO hold row present at all", async () => {
  fail0020(live);
  const client = await freshClient("act_noact");
  const ev = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev.documentId, opKey: opk("g_noact") });
  const c = await livePurposeConsent(client);
  assert.ok(c?.id, "the typed consent is live");
  // §4.2/§7.1: a typed GRANT does not activate and emits no hold transition.
  assert.equal(await livePurposeActivation(client), null, "a grant alone minted NO activation");
  assert.equal(await holdRow(client), null,
    "…and there is NO wiki_synthesis_holds row — the old design would have read this absence as 'authorized'");
  assert.deepEqual(await prepareForLatestEvent({ firm: w.firms.A, client }), UNKNOWN_VERDICT,
    "the verdict is `unknown`: ACTIVATION, not the absence of a hold, is the dispatch gate (§4.3)");
});

test("[0020 §7.2]: the runbook order — grant → verdict STILL unknown → activate → verdict granted; synthesis lights for THAT client only", async () => {
  fail0020(live);
  const lit = await freshClient("act_runbook");
  const dark = await freshClient("act_dark");
  const ev = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client: lit, evidenceDocument: ev.documentId, opKey: opk("g_rb") });
  const c = await livePurposeConsent(lit);
  assert.deepEqual(await prepareForLatestEvent({ firm: w.firms.A, client: lit }), UNKNOWN_VERDICT,
    "runbook step 3: after the grant the verdict is STILL unknown — the proof that a grant alone does not authorize");
  await activatePurpose(w.users.alice, { client: lit, consent: c.id, opKey: opk("a_rb") });
  const verdict = await prepareForLatestEvent({ firm: w.firms.A, client: lit });
  assert.equal(verdict.verdict, "granted", "runbook step 5: after activation the verdict is granted");
  assert.ok(verdict.authorization_id, "…with an authorization id");
  const a = await livePurposeActivation(lit);
  assert.equal(a.consent_id, c.id, "the activation names the EXACT consent version (§2.3)");
  assert.deepEqual(await prepareForLatestEvent({ firm: w.firms.A, client: dark }), UNKNOWN_VERDICT,
    "every un-activated client stays fail-closed — lighting is PER CLIENT");
});

test("[0020 §7.1]: activation requires p_consent to BE the live typed consent — a blind activation, a stale consent id and a foreign client's consent are all refused", async () => {
  fail0020(live);
  const a = await freshClient("act_bind_a");
  const b = await freshClient("act_bind_b");
  const evA = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  const evB = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client: a, evidenceDocument: evA.documentId, opKey: opk("g_ba") });
  await grantPurpose(w.users.alice, { client: b, evidenceDocument: evB.documentId, opKey: opk("g_bb") });
  const ca = await livePurposeConsent(a);
  const cb = await livePurposeConsent(b);
  // (1) a random uuid is not the live consent.
  await assertRaisesOneOf(["CLR28", "CLR11"],
    () => activatePurpose(w.users.alice, { client: a, consent: "00000000-0000-4000-8000-0000000000aa", opKey: opk("a_rand") }),
    "activation naming a nonexistent consent");
  // (2) ANOTHER client's live consent — the composite FK makes this structurally
  //     impossible even if the body forgot to check.
  await assertRaisesOneOf(["CLR28", "CLR11", "23503"],
    () => activatePurpose(w.users.alice, { client: a, consent: cb.id, opKey: opk("a_cross") }),
    "activation naming ANOTHER client's consent");
  assert.equal(await livePurposeActivation(a), null, "no activation landed for A");
  // (3) the correct binding works, and it is the ONLY one that does.
  await activatePurpose(w.users.alice, { client: a, consent: ca.id, opKey: opk("a_ok") });
  assert.equal((await livePurposeActivation(a)).consent_id, ca.id, "the bound activation is live");
});

test("[0020 §7.1 / §9.1]: a SECOND live activation for the same (client,purpose) refuses CLR28", async () => {
  fail0020(live);
  const client = await freshClient("act_dupe");
  const ev = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev.documentId, opKey: opk("g_du") });
  const c = await livePurposeConsent(client);
  await activatePurpose(w.users.alice, { client, consent: c.id, opKey: opk("a_du1") });
  const err = await assertRaises("CLR28",
    () => activatePurpose(w.users.alice, { client, consent: c.id, opKey: opk("a_du2") }),
    "a second LIVE activation for the same (client,purpose)");
  noteLane(`[0020 §7.1] second-live-activation refusal reason = ${detailReason(err) ?? "(none)"}`);
  assert.equal((await purposeActivationRows(client)).filter((r) => r.deactivated_at == null).length, 1,
    "still exactly ONE live activation");
});

test("[0020 §2.3 / §9.1]: DEACTIVATION without revocation (a pause) → verdict `unknown`; the consent stays live; re-activating the SAME consent re-lights it", async () => {
  fail0020(live);
  const client = await freshClient("act_pause");
  const ev = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev.documentId, opKey: opk("g_pa") });
  const c = await livePurposeConsent(client);
  await activatePurpose(w.users.alice, { client, consent: c.id, opKey: opk("a_pa") });
  assert.equal((await prepareForLatestEvent({ firm: w.firms.A, client })).verdict, "granted", "lit");
  await deactivatePurpose(w.users.alice, { client, reason: "rig pause", opKey: opk("d_pa") });
  assert.deepEqual(await prepareForLatestEvent({ firm: w.firms.A, client }), UNKNOWN_VERDICT,
    "consent live + activation DEACTIVATED → unknown");
  assert.ok(await livePurposeConsent(client), "…the typed consent record is NOT discarded by a pause");
  assert.equal(await livePurposeActivation(client), null, "…and no live activation remains");
  await activatePurpose(w.users.alice, { client, consent: c.id, opKey: opk("a_pa2") });
  assert.equal((await prepareForLatestEvent({ firm: w.firms.A, client })).verdict, "granted",
    "re-activating the SAME live consent re-lights the client");
  assert.equal((await purposeActivationRows(client)).length, 2,
    "two activation rows — the pause left an audit trail, it did not mutate the first row");
});

test("[0020 §2.3 — the version-match law]: REVOKE-and-REGRANT never silently re-authorizes; only an explicit activation of the NEW consent does", async () => {
  fail0020(live);
  const client = await freshClient("act_regrant");
  const ev1 = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev1.documentId, opKey: opk("g_r1") });
  const c1 = await livePurposeConsent(client);
  await activatePurpose(w.users.alice, { client, consent: c1.id, opKey: opk("a_r1") });
  assert.equal((await prepareForLatestEvent({ firm: w.firms.A, client })).verdict, "granted", "lit on consent #1");

  await revokePurpose(w.users.alice, { client, reason: "rig withdrawal", opKey: opk("rv_r1") });
  assert.deepEqual(await prepareForLatestEvent({ firm: w.firms.A, client }), UNKNOWN_VERDICT,
    "revoke → unknown (and NOT `denied` — that token does not exist)");
  assert.equal(await livePurposeActivation(client), null,
    "§7.1: a typed revoke DEACTIVATES the activation in the same transaction");

  const ev2 = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev2.documentId, opKey: opk("g_r2") });
  const c2 = await livePurposeConsent(client);
  assert.notEqual(c2.id, c1.id, "the re-grant minted a NEW consent id");
  assert.deepEqual(await prepareForLatestEvent({ firm: w.firms.A, client }), UNKNOWN_VERDICT,
    "re-attestation ALONE never re-authorizes — no activation names the new consent yet");
  await activatePurpose(w.users.alice, { client, consent: c2.id, opKey: opk("a_r2") });
  assert.equal((await prepareForLatestEvent({ firm: w.firms.A, client })).verdict, "granted",
    "only the explicit activation of the NEW consent re-lights it");
  assert.equal((await livePurposeActivation(client)).consent_id, c2.id, "…bound to consent #2");
});

test("[0020 §7.1 / A20-9]: the OWNER floor on ALL FOUR typed RPCs — a bookkeeper is refused CLR03/CLR04 and changes nothing", async () => {
  fail0020(live);
  const client = await freshClient("act_floor");
  const ev = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  // bob is a firm-A BOOKKEEPER (buildWorld) — below the owner floor.
  await assertRaisesOneOf(["CLR03", "CLR04"],
    () => grantPurpose(w.users.bob, { client, evidenceDocument: ev.documentId, opKey: opk("f_g") }),
    "grant_client_egress_purpose as a bookkeeper");
  // Stage a live+activated consent as the OWNER so the other three have a target.
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev.documentId, opKey: opk("f_g2") });
  const c = await livePurposeConsent(client);
  await assertRaisesOneOf(["CLR03", "CLR04"],
    () => activatePurpose(w.users.bob, { client, consent: c.id, opKey: opk("f_a") }),
    "activate_client_egress_purpose as a bookkeeper");
  await activatePurpose(w.users.alice, { client, consent: c.id, opKey: opk("f_a2") });
  await assertRaisesOneOf(["CLR03", "CLR04"],
    () => deactivatePurpose(w.users.bob, { client, opKey: opk("f_d") }),
    "deactivate_client_egress_purpose as a bookkeeper");
  await assertRaisesOneOf(["CLR03", "CLR04"],
    () => revokePurpose(w.users.bob, { client, opKey: opk("f_r") }),
    "revoke_client_egress_purpose as a bookkeeper");
  // Nothing the bookkeeper attempted changed state.
  assert.ok(await livePurposeConsent(client), "the consent is still live after four refused non-owner calls");
  assert.ok(await livePurposeActivation(client), "…and the activation is still live");
});

// RATCHET R1-F5 (2026-07-25). Blind, this cell permitted CLR11 *or* CLR28 because activate,
// deactivate and revoke reached CLR28 first: each searched globally by (client, purpose), took
// FOR UPDATE on the matching live row — a FOREIGN FIRM's row — and only then compared firm_id.
// That is cross-firm lock reach and the wrong code: §7.1 mandates CLR11 for a client not in
// your firm, precisely because CLR28 ("nothing live here") vs CLR11 ("not your client") is
// itself an existence oracle. Firm membership is now verified FIRST and every state-row
// predicate carries firm_id, so the widened expectation is retired: CLR11 EXACTLY.
test("[0020 §7.1 amendment]: a FOREIGN-FIRM owner cannot reach another firm's client on any typed RPC — CLR11 EXACTLY, and no foreign row is ever locked", async () => {
  fail0020(live);
  const client = await freshClient("act_xfirm");
  const ev = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev.documentId, opKey: opk("x_g") });
  const c = await livePurposeConsent(client);
  await activatePurpose(w.users.alice, { client, consent: c.id, opKey: opk("x_a") });
  // dave OWNS firm B. Every call names a firm-A client that IS live and IS activated — so a
  // CLR28 here would prove the body found firm A's row before noticing whose it was.
  for (const [label, fn] of [
    ["grant", () => grantPurpose(w.users.dave, { client, evidenceDocument: ev.documentId, opKey: opk("x_g2") })],
    ["activate", () => activatePurpose(w.users.dave, { client, consent: c.id, opKey: opk("x_a2") })],
    ["deactivate", () => deactivatePurpose(w.users.dave, { client, opKey: opk("x_d2") })],
    ["revoke", () => revokePurpose(w.users.dave, { client, opKey: opk("x_r2") })],
  ]) {
    await assertRaises("CLR11", fn, `${label}_client_egress_purpose across firms`);
  }
  assert.ok(await livePurposeActivation(client), "the firm-A client is untouched by the firm-B owner");
});

test("[0020 §7.1 — op-key discipline]: a same-key/different-args reuse raises CLR10 (NOT CLR28 — v0.1's code was wrong, corrected at 0004:57), and a same-key/same-args replay is IDEMPOTENT", async () => {
  fail0020(live);
  const client = await freshClient("act_opk");
  const other = await freshClient("act_opk2");
  const ev1 = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  const ev2 = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  const key = opk("shared");
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev1.documentId, scopeNote: "first", opKey: key });
  // SAME key, DIFFERENT args → CLR10 'op_key reused with different args'.
  await assertRaises("CLR10",
    () => grantPurpose(w.users.alice, { client: other, evidenceDocument: ev2.documentId, scopeNote: "second", opKey: key }),
    "grant_client_egress_purpose replayed with the same op_key and different args");
  // SAME key, SAME args → the stored receipt replays; NO second consent row.
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev1.documentId, scopeNote: "first", opKey: key });
  assert.equal(await countRows("client_egress_purpose_consents", "where client_id=$1", [client]), 1,
    "the same-args replay produced exactly ONE consent row (the op receipt replayed)");
  assert.equal(await countRows("client_egress_purpose_consents", "where client_id=$1", [other]), 0,
    "the CLR10 refusal left the second client with no consent row");
});

test("[0020 §7.1]: argument validation is CLR10 — a null/blank op key and a blank reason are refused before any effect", async () => {
  fail0020(live);
  const client = await freshClient("act_args");
  const ev = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await assertRaises("CLR10",
    () => grantPurpose(w.users.alice, { client, evidenceDocument: ev.documentId, opKey: "   " }),
    "grant with a blank op key");
  await assertRaises("CLR10",
    () => grantPurpose(w.users.alice, { client, evidenceDocument: ev.documentId, opKey: null, scopeNote: "  " }),
    "grant with a blank scope note");
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev.documentId, opKey: opk("ok_args") });
  const c = await livePurposeConsent(client);
  await activatePurpose(w.users.alice, { client, consent: c.id, opKey: opk("ok_act") });
  await assertRaises("CLR10",
    () => revokePurpose(w.users.alice, { client, reason: "   ", opKey: opk("blankreason") }),
    "revoke with a blank reason");
  await assertRaises("CLR10",
    () => deactivatePurpose(w.users.alice, { client, reason: "", opKey: opk("blankreason2") }),
    "deactivate with a blank reason");
  assert.ok(await livePurposeActivation(client), "no argument-validation refusal changed state");
});

test("[0020 §7.1 / §9.5]: the four owner RPCs are EXECUTE-granted to clara_authenticated ONLY — clara_runtime, the agent role and both wake roles cannot reach them", async () => {
  fail0020(live);
  for (const fn of Object.keys(OWNER_FNS)) {
    assert.equal(await roleCanExecute(ROLES.authenticated, fn), true,
      `${fn} is EXECUTE-granted to clara_authenticated`);
    for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
      assert.equal(await roleCanExecute(role, fn), false,
        `${fn} is NOT reachable by ${role} (§7.1: never clara_runtime, never the agent or wake roles)`);
    }
  }
  assert.equal(WIKI_PURPOSE, "wiki_synthesis", "the single typed purpose is unchanged");
});
