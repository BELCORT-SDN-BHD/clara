// #1008 — THE PLATFORM'S LEGAL ENFORCEMENT MODE. Migration 0234_legal_enforcement_mode.sql.
//
// WHAT THIS BATTERY EXISTS FOR, IN FIVE SENTENCES:
//   1. DURING THE BETA, THE STATE OF A FIRM'S AGREEMENTS MUST NEVER SWITCH A CAPABILITY OFF.
//      That is the owner's ruling of 2026-09-20, and `prompt` is the mode that carries it: an
//      ACTIVE client and an ACTIVE OWNER holding at least ONE REAL acceptance of either kind at
//      any version is enough. Currency and completeness stop being required.
//   2. …AND IT STILL NEVER INVENTS AN AUTHORITY. A firm whose active owner has never accepted
//      ANYTHING is refused in `prompt` too, with the SAME `unknown` payload as every other
//      negative. Prompt relaxes currency; it does not manufacture a citation.
//   3. THE EVIDENCE STAYS TRUTHFUL. The consent the first dispatch mints cites an acceptance row
//      that person actually made, and the scope note, the audit row and the
//      `egress.purpose_consent_derived` event all say WHICH MODE granted the basis and WHICH KIND
//      of acceptance it cites. A Terms acceptance is never filed under a DPA key.
//   4. `enforce` IS TODAY'S RULE, UNCHANGED. Every 0195 / 0211 cell that asserts enforcement runs
//      under it and is untouched; this battery re-proves the enforcement arm from the other side.
//   5. THE MODE IS THE OPERATOR FIRM OWNER'S, AND ONLY THEIRS. One write door at
//      `clara.set_admission_capacity`'s exact floor, with that door's idempotency key, receipt and
//      audit shape.
//
// EVERY ASSERTION ABOUT A DOOR GOES THROUGH A REAL LEAST-PRIVILEGED SESSION — `humanQuery` for a
// person, `roleQuery(clara_runtime)` for the dispatch verbs. `rootQuery` appears only for LABELLED
// fixture arrangement and for reading catalog facts and ungranted bodies no door returns.
//
// Frontier-gated on the `legal_enforcement_mode$` stem: a leg pinned below 0234 skips cleanly.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, PG, assertRaises, endPool, ensureReady, insertUser, opk, roleQuery, ROLES, rootQuery,
} from "./rig-fixtures.mjs";
import { markSkip, printSkipCount } from "./wave-a-helpers.mjs";
import { assertPair } from "./work-journal-fixtures.mjs";
import {
  prepareEgressDispatch, synthesisedConsent, consentRows, activationRows, revokeWorkEgress,
  restoreWorkEgress, deactivateWorkEgressPurpose, reactivateWorkEgress, eventsOfType,
  deactivateClient, reactivateClient,
} from "./work-egress-fixtures.mjs";
import { ensureOperatorOwner, ordinaryFirm } from "./legal-acceptance-fixtures.mjs";
import { clearOperator } from "./p4t2-fixtures.mjs";
import {
  ENFORCEMENT_STEM, ENFORCEMENT_REASON, MODE_ENFORCE, MODE_PROMPT,
  acceptKind, acceptancesOf, auditRows, egressBasis, forceMode, getEnforcementMode,
  legalStanding, predicateMode, publishNextVersion, routinePosture, setEnforcementMode,
  storedEnforcement, virginFirm,
} from "./legal-enforcement-mode-fixtures.mjs";

const MIGRATION = "0234_legal_enforcement_mode.sql";
const MODE_DOOR = "clara.set_legal_enforcement_mode(text,text,text)";
const MODE_READ = "clara.get_legal_enforcement_mode()";
const MODE_PREDICATE = "clara._legal_enforcement_mode()";
const BASIS_HELPER = "clara._accounting_work_egress_live(uuid,uuid)";
const STANDING_DOOR = "clara.get_firm_legal_standing()";

/** The uniform non-grant payload. Spelled ONCE: every refusal below must be byte-identical to it,
 *  which is what "the negatives stay indistinguishable" means in practice. */
const UNKNOWN = { verdict: "unknown", authorization_id: null };

/** The typed refusal the egress family raises for a basis that is not live (0195's own). */
const CLR_BASIS = "CLR28";

/** The exact ACL text the two new human doors must carry — grantor included, so a WITH GRANT
 *  OPTION or a PUBLIC grant cannot hide behind a `has_function_privilege` probe. */
const EXPECTED_ACL = "clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner";

/** THE PRE-IMAGES 0234 PINS, MEASURED on the release-rehearsal rig at 228 migrations
 *  (0001→0233, PG 17.11) by `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` keyed by
 *  `to_regprocedure` — never transcribed from a creating migration's file text. 0234's §0
 *  prestate carries the same numbers and refuses to apply if one has moved; these constants are
 *  the other half of the pair, used by `p1008.db.recuts_landed` to prove the live bodies are NO
 *  LONGER their pre-images. */
const PREIMAGE = {
  [BASIS_HELPER]: "53f690091c24bb82ec529d5cb818647374d0181ed609777155d2f9eae87596a0",
  "clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)":
    "f051fe1ff8cacfe15e570b668413e43d41e562b78f0f99524d03bf0889dcb3a9",
  "clara.restore_client_egress_purpose(uuid,text,text)":
    "97e3f3ee783bb18374d5f8efb51fe14569a9ea2ad16e601058a52a65731f1cba",
  [STANDING_DOOR]: "42fc6a6630a29462e74953635abd81928ecbb02dbb1e4fac1dc6dd78939ff8b9",
};

/** The one body 0234 must NOT touch (0195's own non-regression pin, re-measured here). */
const CONSUME_SHA = "f461ceb0d8e7f59e5a9753170c5fb17831ff6e3dbb3f57906e14653044592ba3";

let ready = false;
let seq = 5_000n;
const nextSeq = () => (seq += 1n);

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const at = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [ENFORCEMENT_STEM]);
  if (at.rows[0].n === 0) {
    if (process.env.CLARA_ALLOW_MISSING_LEGAL_ENFORCEMENT_MODE !== "1") {
      throw new Error(
        `legal-enforcement-mode premise ${MIGRATION} is not applied (no ${ENFORCEMENT_STEM} row in `
        + "clara.schema_migrations) and CLARA_ALLOW_MISSING_LEGAL_ENFORCEMENT_MODE is unset -- this "
        + "is a FOCUSED run and must fail loudly, not skip. Preload "
        + "./tests/legal-enforcement-mode-preintegration-gate.mjs for an estate sweep against a "
        + "pre-PR chain.");
    }
    ready = false;
  }
});

after(async () => {
  // Leave the estate in the shape the MIGRATION leaves it, so a later file in the same run does
  // not inherit this battery's arrangement.
  if (ready) await forceMode(MODE_PROMPT).catch(() => {});
  await clearOperator();
  printSkipCount("legal-enforcement-mode");
  await endPool();
});

function unready(t) {
  if (!ready) {
    markSkip();
    t.skip(`rig not ready: ensureReady() found no draft_entry, or ${MIGRATION} is not applied`);
    return true;
  }
  return false;
}

// ===========================================================================================
// 1 · THE MODE ITSELF — the relation, the predicate and the default the migration leaves.
// ===========================================================================================

test("p1008.db.default_is_prompt the migration leaves the platform in PROMPT, and the predicate agrees", async (t) => {
  if (unready(t)) return;
  // Read the RELATION and the PREDICATE separately: a default asserted only through the body that
  // reads it would pass on a body that ignores the row entirely.
  const stored = await storedEnforcement();
  assert.ok(stored, "default_is_prompt: the singleton configuration row exists");
  assert.ok([MODE_PROMPT, MODE_ENFORCE].includes(stored.mode),
    `default_is_prompt: the stored mode is one of the two values, got ${stored.mode}`);
  assert.equal(await predicateMode(), stored.mode,
    "default_is_prompt: clara._legal_enforcement_mode() answers the STORED row, not a literal");

  // The migration's own landing value, read from the ledger's first receipt rather than from the
  // live row (this battery moves the row, and a later re-run would otherwise read its own work).
  const asMigrated = await rootQuery(
    `select count(*)::int as n from clara.legal_enforcement
      where id and mode is not null`);
  assert.equal(asMigrated.rows[0].n, 1, "default_is_prompt: exactly ONE configuration row");
});

test("p1008.db.relation_posture the mode lives behind FORCE RLS with ZERO application-role DML", async (t) => {
  if (unready(t)) return;
  const rel = await rootQuery(
    `select c.relrowsecurity as rls, c.relforcerowsecurity as forced, pg_get_userbyid(c.relowner) as owner
       from pg_class c where c.oid = 'clara.legal_enforcement'::regclass`);
  assert.equal(rel.rows[0].rls, true, "relation_posture: row level security is enabled");
  assert.equal(rel.rows[0].forced, true, "relation_posture: …and FORCED, so even the owner obeys it");
  assert.equal(rel.rows[0].owner, "clara_fn_owner");

  const grants = await rootQuery(
    `select grantee, privilege_type from information_schema.role_table_grants
      where table_schema='clara' and table_name='legal_enforcement'
        and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                        'clara_wake_interactive','clara_wake_proactive','PUBLIC')`);
  assert.deepEqual(grants.rows, [],
    "relation_posture: NO application role holds any privilege on the mode relation");

  const policies = await rootQuery(
    "select polname, pg_get_userbyid(unnest(polroles)) as grantee from pg_policy where polrelid = 'clara.legal_enforcement'::regclass");
  assert.deepEqual(policies.rows.map((r) => r.grantee), ["clara_fn_owner"],
    "relation_posture: exactly one policy, to clara_fn_owner");

  // The row may never be deleted or truncated away: a missing row is an unanswerable question,
  // not an unenforced estate. 0186's own disposition for clara.admission_capacity.
  const triggers = await rootQuery(
    `select t.tgname from pg_trigger t
      where t.tgrelid = 'clara.legal_enforcement'::regclass and not t.tgisinternal
      order by t.tgname`);
  const names = triggers.rows.map((r) => r.tgname);
  assert.ok(names.some((n) => n.includes("no_delete")), `relation_posture: a no-delete trigger is armed (${names})`);
  assert.ok(names.some((n) => n.includes("no_truncate")), `relation_posture: a no-truncate trigger is armed (${names})`);

  // …and the CHECK that closes the vocabulary at two values.
  const check = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.legal_enforcement'::regclass and conname='ck_legal_enforcement_mode'`);
  assert.match(check.rows[0].def, /'prompt'/, "relation_posture: the CHECK names prompt");
  assert.match(check.rows[0].def, /'enforce'/, "relation_posture: the CHECK names enforce");
  await assertRaises(PG.checkViolation, () => rootQuery(
    "update clara.legal_enforcement set mode='off' where id"),
    "a third mode value");
});

test("p1008.db.predicate_ungranted the one body every wall reads is granted to NOBODY", async (t) => {
  if (unready(t)) return;
  const posture = await routinePosture(MODE_PREDICATE);
  assert.ok(posture, `predicate_ungranted: ${MODE_PREDICATE} resolves`);
  assert.equal(posture.owner, "clara_fn_owner");
  assert.equal(posture.secdef, true);
  assert.equal(posture.acl, "clara_fn_owner=X/clara_fn_owner",
    "predicate_ungranted: the ACL is the owner alone — PUBLIC is revoked and no role is granted");
  for (const role of ["clara_authenticated", "clara_runtime", "clara_agent_ro",
    "clara_wake_interactive", "clara_wake_proactive"]) {
    const r = await rootQuery(
      "select to_regrole($1) is not null and has_function_privilege($1, $2, 'EXECUTE') as can",
      [role, MODE_PREDICATE]);
    assert.equal(r.rows[0].can, false, `predicate_ungranted: ${role} cannot execute the predicate`);
  }
});

// ===========================================================================================
// 2 · THE DERIVED BASIS UNDER EACH MODE.
// ===========================================================================================

test("p1008.db.prompt_belcort a DPA accepted at signup with the Terms unaccepted GRANTS under prompt and is refused under enforce", async (t) => {
  if (unready(t)) return;
  const sc = await virginFirm("belcort");
  await acceptKind(sc.owner, "dpa");                 // the shape BELCORT is actually in

  await forceMode(MODE_ENFORCE);
  assert.deepEqual(await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() }), UNKNOWN,
    "prompt_belcort: under enforce, an unaccepted published Terms withdraws Work's model authority");
  assert.equal((await egressBasis(sc.firm, sc.client)).live, false);
  assert.equal(await synthesisedConsent(sc.client), null,
    "prompt_belcort: …and nothing was minted while the basis was not live");

  await forceMode(MODE_PROMPT);
  const basis = await egressBasis(sc.firm, sc.client);
  assert.equal(basis.live, true, "prompt_belcort: under prompt the real DPA acceptance founds the basis");
  assert.equal(basis.mode, MODE_PROMPT);
  assert.equal(basis.basis_kind, "dpa", "prompt_belcort: …and it cites the DPA acceptance");
  assert.equal(basis.owner, sc.owner);

  const v = await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() });
  assert.equal(v.verdict, "granted", "prompt_belcort: the dispatch is authorised with NO owner action");
  assert.ok(v.authorization_id);
});

test("p1008.db.prompt_terms_only an owner holding ONLY a Terms acceptance founds the basis, and NO key calls it a DPA acceptance", async (t) => {
  if (unready(t)) return;
  const sc = await virginFirm("termsonly");
  await acceptKind(sc.owner, "terms");

  await forceMode(MODE_ENFORCE);
  assert.deepEqual(await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() }), UNKNOWN,
    "prompt_terms_only: under enforce an unaccepted DPA withdraws authority");

  await forceMode(MODE_PROMPT);
  const basis = await egressBasis(sc.firm, sc.client);
  assert.equal(basis.live, true);
  assert.equal(basis.basis_kind, "terms", "prompt_terms_only: the citation names the kind it actually is");
  assert.equal(basis.dpa_acceptance, null,
    "prompt_terms_only: the dpa_acceptance key is NULL — a Terms acceptance is never filed under it");
  assert.ok(basis.terms_acceptance, "prompt_terms_only: …and the terms_acceptance key carries the real row");
  assert.equal(basis.basis_acceptance, basis.terms_acceptance);

  const v = await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() });
  assert.equal(v.verdict, "granted");

  // THE CONSENT CITES AN ACCEPTANCE THAT PERSON MADE — the whole of AC3, read from the row.
  const consent = await synthesisedConsent(sc.client);
  assert.ok(consent.legal_acceptance_id, "prompt_terms_only: the consent names a real acceptance row");
  const mine = await acceptancesOf(sc.owner);
  assert.ok(mine.some((a) => a.id === consent.legal_acceptance_id && a.kind === "terms"),
    "prompt_terms_only: …and that row is one THIS OWNER made, of the kind the basis named");
});

test("p1008.db.prompt_no_acceptance an owner who has never accepted ANYTHING is still refused, byte-identically", async (t) => {
  if (unready(t)) return;
  const sc = await virginFirm("virgin");
  assert.deepEqual(await acceptancesOf(sc.owner), [],
    "prompt_no_acceptance: mandatory setup — this owner holds no acceptance of any kind");

  for (const mode of [MODE_ENFORCE, MODE_PROMPT]) {
    await forceMode(mode);
    assert.deepEqual(await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() }), UNKNOWN,
      `prompt_no_acceptance: refused under ${mode} — prompt relaxes currency, never the requirement that something REAL exists`);
    assert.deepEqual(await egressBasis(sc.firm, sc.client), { live: false },
      `prompt_no_acceptance: …and the helper's negative is the SAME bytes under ${mode}`);
  }
  assert.equal(await synthesisedConsent(sc.client), null,
    "prompt_no_acceptance: no consent was minted with nothing to cite");
});

test("p1008.db.prompt_inactive_client an inactive client is refused in BOTH modes, with the same bytes", async (t) => {
  if (unready(t)) return;
  const sc = await virginFirm("inactive");
  await acceptKind(sc.owner, "dpa");
  await acceptKind(sc.owner, "terms");
  await deactivateClient(sc.client);

  for (const mode of [MODE_PROMPT, MODE_ENFORCE]) {
    await forceMode(mode);
    assert.deepEqual(await egressBasis(sc.firm, sc.client), { live: false },
      `prompt_inactive_client: an archived client has no basis under ${mode}`);
    assert.deepEqual(await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() }), UNKNOWN,
      `prompt_inactive_client: …and the dispatch is the uniform unknown under ${mode}`);
  }

  await reactivateClient(sc.client);
  await forceMode(MODE_PROMPT);
  assert.equal((await egressBasis(sc.firm, sc.client)).live, true,
    "prompt_inactive_client: …and re-activating the client is what puts it back, in both modes");
});

test("p1008.db.prompt_survives_publication a NEWER published version leaves a prompt-mode basis LIVE and still withdraws it under enforce", async (t) => {
  if (unready(t)) return;
  const sc = await virginFirm("publication");
  await acceptKind(sc.owner, "dpa");
  await acceptKind(sc.owner, "terms");

  await forceMode(MODE_ENFORCE);
  assert.equal((await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() })).verdict,
    "granted", "prompt_survives_publication: mandatory setup — the current acceptances authorise under enforce");

  const newVersion = await publishNextVersion("terms");
  assert.deepEqual(await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() }), UNKNOWN,
    `prompt_survives_publication: under enforce, terms v${newVersion} nobody has accepted STOPS model egress`);

  await forceMode(MODE_PROMPT);
  const basis = await egressBasis(sc.firm, sc.client);
  assert.equal(basis.live, true,
    "prompt_survives_publication: under prompt the publication changes NO already-live firm's basis");
  assert.equal(basis.basis_kind, "dpa",
    "prompt_survives_publication: …and the citation is still the owner's own most recent DPA acceptance");
  assert.equal((await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() })).verdict, "granted");
});

test("p1008.db.enforce_unchanged under enforce the basis is 0195's own payload, and the citation is the DPA acceptance", async (t) => {
  if (unready(t)) return;
  const sc = await virginFirm("enforceshape");
  await acceptKind(sc.owner, "dpa");
  await acceptKind(sc.owner, "terms");
  await forceMode(MODE_ENFORCE);

  const basis = await egressBasis(sc.firm, sc.client);
  assert.equal(basis.live, true);
  assert.equal(basis.mode, MODE_ENFORCE);
  assert.equal(basis.owner, sc.owner);
  assert.ok(basis.terms_acceptance && basis.dpa_acceptance,
    "enforce_unchanged: BOTH acceptances are named, as 0195 named them");
  assert.equal(basis.basis_acceptance, basis.dpa_acceptance,
    "enforce_unchanged: the cited acceptance is 0195's own — the DPA one");
  assert.equal(basis.basis_kind, "dpa");
  const published = await rootQuery(
    "select kind, version from clara.legal_documents where status='published' order by kind");
  for (const row of published.rows) {
    assert.equal(Number(basis[`${row.kind}_version`]), row.version,
      `enforce_unchanged: ${row.kind}_version is the CURRENTLY PUBLISHED version under enforce`);
  }
});

// ===========================================================================================
// 3 · THE MINT'S EVIDENCE.
// ===========================================================================================

test("p1008.db.mint_evidence_prompt the minted consent, its audit row and its event all name the MODE and the KIND", async (t) => {
  if (unready(t)) return;
  const sc = await virginFirm("mintprompt");
  await acceptKind(sc.owner, "dpa");
  await forceMode(MODE_PROMPT);

  const v = await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() });
  assert.equal(v.verdict, "granted");

  const consent = await synthesisedConsent(sc.client);
  assert.equal(consent.evidence_document_id, null,
    "mint_evidence_prompt: this purpose's evidence is the legal acceptance, never a document");
  assert.ok(consent.legal_acceptance_id, "mint_evidence_prompt: …and the row cites a real acceptance");
  assert.match(consent.scope_note, /prompt/i,
    `mint_evidence_prompt: the scope note says which MODE granted the basis — got ${consent.scope_note}`);
  assert.match(consent.scope_note, /\bdpa\b/i,
    `mint_evidence_prompt: …and which KIND of acceptance it cites — got ${consent.scope_note}`);
  assert.equal(consent.granted_by, sc.owner,
    "mint_evidence_prompt: the consent is minted in the OWNER's name, because it is their acceptance");

  const audits = await auditRows(sc.firm, "derive_client_egress_purpose");
  assert.equal(audits.length, 1, "mint_evidence_prompt: exactly ONE audit row for the one mint");
  assert.equal(audits[0].actor, sc.owner);
  assert.equal(audits[0].args.enforcement_mode, MODE_PROMPT,
    "mint_evidence_prompt: the audit payload names the mode that granted the basis");
  assert.equal(audits[0].args.basis_kind, "dpa");
  assert.equal(audits[0].args.legal_acceptance, consent.legal_acceptance_id);

  const events = await eventsOfType(sc.firm, "egress.purpose_consent_derived", sc.client);
  assert.equal(events.length, 1, "mint_evidence_prompt: …and exactly ONE event");
  assert.equal(events[0].payload.enforcement_mode, MODE_PROMPT);
  assert.equal(events[0].payload.basis_kind, "dpa");
  assert.equal(events[0].payload.legal_acceptance_id, consent.legal_acceptance_id,
    "mint_evidence_prompt: the event's legal_acceptance_id is the row the consent cites");
});

test("p1008.db.mint_evidence_terms_only a Terms-only basis is never described as a DPA acceptance, anywhere", async (t) => {
  if (unready(t)) return;
  const sc = await virginFirm("mintterms");
  const accepted = await acceptKind(sc.owner, "terms");
  await forceMode(MODE_PROMPT);
  assert.equal((await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() })).verdict,
    "granted");

  const consent = await synthesisedConsent(sc.client);
  const mine = await acceptancesOf(sc.owner);
  const terms = mine.find((a) => a.kind === "terms");
  assert.equal(consent.legal_acceptance_id, terms.id);
  assert.equal(terms.version, accepted.version);
  assert.match(consent.scope_note, /terms/i,
    `mint_evidence_terms_only: the scope note names the Terms acceptance — got ${consent.scope_note}`);
  assert.doesNotMatch(consent.scope_note, /\bdpa\b/i,
    `mint_evidence_terms_only: …and never the DPA — got ${consent.scope_note}`);

  const events = await eventsOfType(sc.firm, "egress.purpose_consent_derived", sc.client);
  assert.equal(events[0].payload.basis_kind, "terms");
  assert.equal(events[0].payload.legal_acceptance_id, terms.id);
  assert.equal(events[0].payload.dpa_acceptance_id ?? null, null,
    "mint_evidence_terms_only: no DPA-named key carries this Terms acceptance id");
  assert.equal(events[0].payload.terms_acceptance_id, terms.id);

  const audits = await auditRows(sc.firm, "derive_client_egress_purpose");
  assert.equal(audits[0].args.basis_kind, "terms");
  assert.equal(audits[0].args.dpa_acceptance ?? null, null);
});

test("p1008.db.mint_evidence_enforce under enforce the minted evidence is 0195's own, with the mode stated", async (t) => {
  if (unready(t)) return;
  const sc = await virginFirm("mintenforce");
  await acceptKind(sc.owner, "dpa");
  await acceptKind(sc.owner, "terms");
  await forceMode(MODE_ENFORCE);
  assert.equal((await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() })).verdict,
    "granted");

  const consent = await synthesisedConsent(sc.client);
  assert.match(consent.scope_note, /published versions \(#631\)/,
    `mint_evidence_enforce: 0195's own sentence, unchanged — got ${consent.scope_note}`);
  const events = await eventsOfType(sc.firm, "egress.purpose_consent_derived", sc.client);
  assert.equal(events[0].payload.enforcement_mode, MODE_ENFORCE);
  assert.equal(events[0].payload.basis_kind, "dpa");
  assert.ok(Number(events[0].payload.terms_version) >= 1);
  assert.ok(Number(events[0].payload.dpa_version) >= 1);
});

// ===========================================================================================
// 4 · EVERYTHING ELSE THAT WITHDRAWS AUTHORITY IS UNCHANGED IN BOTH MODES.
// ===========================================================================================

test("p1008.db.revoke_sticky an owner's revoke is STICKY under prompt exactly as it is under enforce", async (t) => {
  if (unready(t)) return;
  for (const mode of [MODE_PROMPT, MODE_ENFORCE]) {
    const sc = await virginFirm(`sticky_${mode}`);
    await acceptKind(sc.owner, "dpa");
    await acceptKind(sc.owner, "terms");
    await forceMode(mode);
    assert.equal((await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() })).verdict,
      "granted", `revoke_sticky[${mode}]: mandatory setup`);

    await revokeWorkEgress(sc.owner, { client: sc.client, opKey: opk(`p1008-rev-${mode}`) });
    assert.deepEqual(await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() }), UNKNOWN,
      `revoke_sticky[${mode}]: the withdrawal refuses the next dispatch`);
    assert.deepEqual(await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() }), UNKNOWN,
      `revoke_sticky[${mode}]: …and it STICKS — no prepare re-mints over it`);
    assert.equal((await consentRows(sc.client)).length, 1,
      `revoke_sticky[${mode}]: exactly one consent row, still the revoked one`);
  }
});

test("p1008.db.restore_prompt the way back on works under prompt and cites a REAL acceptance of the kind it names", async (t) => {
  if (unready(t)) return;
  // The Terms-only firm is the case that would violate 0195's own evidence CHECK if the restore
  // door still cited a DPA acceptance that does not exist: `accounting_work` requires
  // legal_acceptance_id IS NOT NULL (0195:502), so a NULL citation is a 23514, not a refusal.
  const sc = await virginFirm("restoreprompt");
  await acceptKind(sc.owner, "terms");
  await forceMode(MODE_PROMPT);
  assert.equal((await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() })).verdict, "granted");
  await revokeWorkEgress(sc.owner, { client: sc.client, opKey: opk("p1008-rp-rev") });

  const receipt = await restoreWorkEgress(sc.owner, { client: sc.client, opKey: opk("p1008-rp-res") });
  assert.equal(receipt.status, "live", "restore_prompt: the restore lands under prompt");
  const rows = await consentRows(sc.client);
  assert.equal(rows.length, 2, "restore_prompt: a FRESH pair is minted; the revoked row stays as history");
  const fresh = rows[1];
  const terms = (await acceptancesOf(sc.owner)).find((a) => a.kind === "terms");
  assert.equal(fresh.legal_acceptance_id, terms.id,
    "restore_prompt: the restored consent cites the owner's own Terms acceptance");
  assert.equal((await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() })).verdict,
    "granted", "restore_prompt: …and the next dispatch finds the live pair");

  const events = await eventsOfType(sc.firm, "egress.purpose_consent_restored", sc.client);
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.legal_acceptance_id, terms.id);
  assert.equal(events[0].payload.enforcement_mode, MODE_PROMPT);
  assert.equal(events[0].payload.basis_kind, "terms");
});

test("p1008.db.restore_basis restoring still refuses CLR28 derived_basis_not_live in BOTH modes", async (t) => {
  if (unready(t)) return;
  const sc = await virginFirm("restorebasis");
  await acceptKind(sc.owner, "dpa");
  await forceMode(MODE_PROMPT);
  assert.equal((await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() })).verdict, "granted");
  await revokeWorkEgress(sc.owner, { client: sc.client, opKey: opk("p1008-rb-rev") });

  await deactivateClient(sc.client);
  await assertPair(CLR_BASIS, "derived_basis_not_live",
    () => restoreWorkEgress(sc.owner, { client: sc.client, opKey: opk("p1008-rb-a") }),
    "restore_basis[prompt]: an ARCHIVED client has no basis to restore");

  await reactivateClient(sc.client);
  await forceMode(MODE_ENFORCE);
  await assertPair(CLR_BASIS, "derived_basis_not_live",
    () => restoreWorkEgress(sc.owner, { client: sc.client, opKey: opk("p1008-rb-b") }),
    "restore_basis[enforce]: …and an unaccepted published Terms is the same refusal");

  await forceMode(MODE_PROMPT);
  assert.equal((await restoreWorkEgress(sc.owner, { client: sc.client, opKey: opk("p1008-rb-c") })).status,
    "live", "restore_basis: …and once the basis is live again the restore lands");
});

test("p1008.db.deactivate_reactivate the ACTIVATION pair behaves identically in both modes", async (t) => {
  if (unready(t)) return;
  for (const mode of [MODE_PROMPT, MODE_ENFORCE]) {
    const sc = await virginFirm(`react_${mode}`);
    await acceptKind(sc.owner, "dpa");
    await acceptKind(sc.owner, "terms");
    await forceMode(mode);
    assert.equal((await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() })).verdict,
      "granted", `deactivate_reactivate[${mode}]: mandatory setup`);
    const consentBefore = await synthesisedConsent(sc.client);

    await deactivateWorkEgressPurpose(sc.owner, { client: sc.client, opKey: opk(`p1008-deact-${mode}`) });
    assert.deepEqual(await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() }), UNKNOWN,
      `deactivate_reactivate[${mode}]: the deactivation refuses the dispatch`);

    await reactivateWorkEgress(sc.owner, { client: sc.client, opKey: opk(`p1008-react-${mode}`) });
    assert.equal((await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() })).verdict,
      "granted", `deactivate_reactivate[${mode}]: …and the way back on grants again`);
    const rows = await activationRows(sc.client);
    assert.equal(rows.length, 2, `deactivate_reactivate[${mode}]: two activations, the first still stamped`);
    assert.ok(rows[0].deactivated_at);
    assert.equal(rows[1].deactivated_at, null);
    assert.equal(rows[1].consent_id, consentBefore.id,
      `deactivate_reactivate[${mode}]: the SURVIVING consent is re-activated, never re-minted`);
    assert.equal((await consentRows(sc.client)).length, 1);
  }
});

// ===========================================================================================
// 5 · THE MODE DOOR — the floor, the vocabulary, the replay and the receipt.
// ===========================================================================================

test("p1008.db.mode_door_floor only the OPERATOR FIRM's owner may change the mode", async (t) => {
  if (unready(t)) return;
  const operator = await ensureOperatorOwner();

  const applicant = await insertUser("p1008", "door_applicant");
  await assertRaises(CLR.authz, () => setEnforcementMode(applicant, { mode: MODE_ENFORCE }),
    "an authenticated person with no firm at all");

  const outsider = await insertUser("p1008", "door_outsider");
  await ordinaryFirm(outsider, "owner");
  await assertPair(CLR.authz, ENFORCEMENT_REASON.notOperatorFirm,
    () => setEnforcementMode(outsider, { mode: MODE_ENFORCE }),
    "an ORDINARY firm's owner");

  const bookkeeper = await insertUser("p1008", "door_bookkeeper");
  await rootQuery("insert into clara.firm_memberships(firm_id,user_id,role) values ($1,$2,'bookkeeper')",
    [operator.firm, bookkeeper]);
  await assertRaises(CLR.authz, () => setEnforcementMode(bookkeeper, { mode: MODE_ENFORCE }),
    "an operator-firm bookkeeper is below the owner floor");
  await assertRaises(CLR.authz, () => getEnforcementMode(bookkeeper),
    "…and the read carries the same predicate as the write");

  await assertRaises(CLR.authz,
    () => roleQuery(ROLES.authenticated, "select clara.set_legal_enforcement_mode('enforce','x','y')"),
    "an unauthenticated write");

  // …and the operator's own owner may. Put the platform back where the migration left it.
  const receipt = await setEnforcementMode(operator.owner, {
    mode: MODE_ENFORCE, reason: "#1008 p1008.db.mode_door_floor", opKey: opk("p1008-floor"),
  });
  assert.equal(receipt.mode, MODE_ENFORCE);
  assert.equal((await getEnforcementMode(operator.owner)).mode, MODE_ENFORCE);
  await setEnforcementMode(operator.owner, {
    mode: MODE_PROMPT, reason: "#1008 back to the beta default", opKey: opk("p1008-floor-back"),
  });
  assert.equal(await predicateMode(), MODE_PROMPT);
});

test("p1008.db.mode_door_vocabulary the door admits exactly two values and refuses everything else by name", async (t) => {
  if (unready(t)) return;
  const operator = await ensureOperatorOwner();
  await assertPair(CLR.badRequest, ENFORCEMENT_REASON.invalidMode,
    () => setEnforcementMode(operator.owner, { mode: "off", opKey: opk("p1008-v1") }), "a third value");
  await assertPair(CLR.badRequest, ENFORCEMENT_REASON.invalidMode,
    () => setEnforcementMode(operator.owner, { mode: null, opKey: opk("p1008-v2") }), "a null mode");
  await assertPair(CLR.badRequest, ENFORCEMENT_REASON.reasonRequired,
    () => setEnforcementMode(operator.owner, { mode: MODE_PROMPT, reason: "   ", opKey: opk("p1008-v3") }),
    "a blank reason");
  await assertPair(CLR.badRequest, ENFORCEMENT_REASON.reasonTooLong,
    () => setEnforcementMode(operator.owner, { mode: MODE_PROMPT, reason: "x".repeat(501), opKey: opk("p1008-v4") }),
    "a reason past 500 characters");
  await assertPair(CLR.badRequest, ENFORCEMENT_REASON.invalidOpKey,
    () => setEnforcementMode(operator.owner, { mode: MODE_PROMPT, opKey: "  " }), "a blank op key");
  assert.equal(await predicateMode(), MODE_PROMPT,
    "mode_door_vocabulary: not one refusal moved the stored mode");
});

test("p1008.db.mode_door_receipt a change is receipted, audited and attributed; a replay answers the ORIGINAL", async (t) => {
  if (unready(t)) return;
  const operator = await ensureOperatorOwner();
  await setEnforcementMode(operator.owner, {
    mode: MODE_PROMPT, reason: "#1008 baseline", opKey: opk("p1008-r0") });

  const key = opk("p1008-receipt");
  const before = (await auditRows(operator.firm, "set_legal_enforcement_mode")).length;
  const first = await setEnforcementMode(operator.owner, {
    mode: MODE_ENFORCE, reason: "#1008 p1008.db.mode_door_receipt", opKey: key });
  assert.equal(first.status, "set");
  assert.equal(first.mode, MODE_ENFORCE);
  assert.equal(first.previous_mode, MODE_PROMPT, "mode_door_receipt: the receipt says what it changed FROM");
  assert.ok(first.updated_at, "mode_door_receipt: …and WHEN");

  const stored = await storedEnforcement();
  assert.equal(stored.mode, MODE_ENFORCE);
  assert.equal(stored.updated_by, operator.owner, "mode_door_receipt: …and WHO, on the row itself");
  assert.equal(new Date(stored.updated_at).toISOString(), new Date(first.updated_at).toISOString(),
    "mode_door_receipt: the stored instant and the answered instant are the SAME sample");

  const audits = await auditRows(operator.firm, "set_legal_enforcement_mode");
  assert.equal(audits.length, before + 1, "mode_door_receipt: exactly one audit row per change");
  const last = audits[audits.length - 1];
  assert.equal(last.actor, operator.owner);
  assert.equal(last.args.mode, MODE_ENFORCE);
  assert.equal(last.args.previous_mode, MODE_PROMPT);

  // THE REPLAY. Byte-identical, and it writes nothing a second time.
  const replay = await setEnforcementMode(operator.owner, {
    mode: MODE_ENFORCE, reason: "#1008 p1008.db.mode_door_receipt", opKey: key });
  assert.deepEqual(replay, first, "mode_door_receipt: the replay is the ORIGINAL receipt, byte-identical");
  assert.equal((await auditRows(operator.firm, "set_legal_enforcement_mode")).length, before + 1,
    "mode_door_receipt: …and it did not audit twice");

  // The same key with DIFFERENT arguments is a conflict, never a silent second change.
  await assertPair(CLR.badRequest, ENFORCEMENT_REASON.opKeyConflict,
    () => setEnforcementMode(operator.owner, { mode: MODE_PROMPT, reason: "#1008 different", opKey: key }),
    "the same op key with different arguments");
  assert.equal(await predicateMode(), MODE_ENFORCE);

  await setEnforcementMode(operator.owner, {
    mode: MODE_PROMPT, reason: "#1008 back to the beta default", opKey: opk("p1008-r-back") });
});

test("p1008.db.mode_doors_posture both doors are clara_authenticated-only SECURITY DEFINER bodies", async (t) => {
  if (unready(t)) return;
  for (const sig of [MODE_DOOR, MODE_READ]) {
    const posture = await routinePosture(sig);
    assert.ok(posture, `mode_doors_posture: ${sig} resolves at its exact signature`);
    assert.equal(posture.owner, "clara_fn_owner");
    assert.equal(posture.secdef, true, `${sig} is SECURITY DEFINER`);
    assert.match(posture.config, /search_path=clara, pg_temp/, `${sig} pins its search_path`);
    assert.equal(posture.acl, EXPECTED_ACL,
      `mode_doors_posture: ${sig} is executable by clara_authenticated and nobody else`);
    for (const role of ["clara_runtime", "clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive"]) {
      const r = await rootQuery(
        "select to_regrole($1) is not null and has_function_privilege($1,$2,'EXECUTE') as can", [role, sig]);
      assert.equal(r.rows[0].can, false, `mode_doors_posture: ${role} cannot execute ${sig}`);
    }
  }
});

// ===========================================================================================
// 6 · THE STANDING READ, AND THE RECUTS THEMSELVES.
// ===========================================================================================

test("p1008.db.standing_reports_mode the standing read carries the mode, and its OWN facts do not move", async (t) => {
  if (unready(t)) return;
  const sc = await virginFirm("standing");
  await acceptKind(sc.owner, "dpa");                       // deliberately NOT the Terms

  for (const mode of [MODE_PROMPT, MODE_ENFORCE]) {
    await forceMode(mode);
    const standing = await legalStanding(sc.owner);
    assert.equal(standing.enforcement_mode, mode,
      `standing_reports_mode: the read reports the platform mode (${mode})`);
    assert.equal(standing.standing_live, false,
      `standing_reports_mode[${mode}]: "not current" is STILL reported under prompt — the settings `
      + "card and #1009's prompt both need that fact");
    assert.equal(standing.can_accept_for_firm, true);
    const dpa = standing.documents.find((d) => d.kind === "dpa");
    assert.equal(dpa.firm_accepted, true, `standing_reports_mode[${mode}]: the per-kind facts are unmoved`);
    const terms = standing.documents.find((d) => d.kind === "terms");
    assert.equal(terms.firm_accepted, false);
  }
  await forceMode(MODE_PROMPT);
});

test("p1008.db.recuts_landed every body 0234 recuts has MOVED off its pinned pre-image, and consume has not", async (t) => {
  if (unready(t)) return;
  for (const [sig, sha] of Object.entries(PREIMAGE)) {
    const posture = await routinePosture(sig);
    assert.ok(posture, `recuts_landed: ${sig} resolves`);
    assert.notEqual(posture.sha, sha,
      `recuts_landed: ${sig} still hashes to its PRE-IMAGE — 0234's recut did not apply`);
  }
  const consume = await routinePosture("clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)");
  assert.equal(consume.sha, CONSUME_SHA,
    "recuts_landed: clara.consume_egress_dispatch is byte-UNMOVED — 0234 must never recut it");

  // THE HELPER STAYS UNGRANTED, and its answer still never leaves the database.
  const helper = await routinePosture(BASIS_HELPER);
  assert.equal(helper.acl, "clara_fn_owner=X/clara_fn_owner",
    "recuts_landed: the derived-basis helper is granted to nobody, exactly as 0195 left it");

  // …and the two spliced doors kept their grants, which `create or replace` preserves.
  const prepare = await routinePosture("clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)");
  assert.equal(prepare.acl, "clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner",
    "recuts_landed: prepare_egress_dispatch's ACL is unmoved");
  const restore = await routinePosture("clara.restore_client_egress_purpose(uuid,text,text)");
  assert.equal(restore.acl, EXPECTED_ACL, "recuts_landed: restore's ACL is unmoved");
  const standing = await routinePosture(STANDING_DOOR);
  assert.equal(standing.acl, EXPECTED_ACL, "recuts_landed: the standing door's ACL is unmoved");
  const arity = await rootQuery(
    "select p.pronargs::int as n from pg_proc p where p.oid = 'clara.get_firm_legal_standing()'::regprocedure");
  assert.equal(arity.rows[0].n, 0,
    "recuts_landed: the standing door is STILL arity 0 — 0233's safety property survives the recut");
});

test("p1008.db.no_manufactured_acceptance 0234 inserted no acceptance row, and no door does either", async (t) => {
  if (unready(t)) return;
  // The migration's own arrival must not have minted an acceptance for anybody: every row in
  // clara.legal_acceptances carries an op_key, and the estate's ONLY writer is
  // clara.accept_legal_document. Read from the catalog rather than asserted about the file.
  const writers = await rootQuery(
    `select p.proname from pg_proc p
      where p.pronamespace='clara'::regnamespace
        and p.prosrc like '%insert into clara.legal_acceptances%'
      order by p.proname`);
  assert.deepEqual(writers.rows.map((r) => r.proname), ["accept_legal_document"],
    "no_manufactured_acceptance: exactly ONE body in the estate inserts an acceptance, and it is the human door");

  const sc = await virginFirm("nomint");
  await forceMode(MODE_PROMPT);
  const before = (await acceptancesOf(sc.owner)).length;
  assert.deepEqual(await prepareEgressDispatch({ firm: sc.firm, client: sc.client, eventSeq: nextSeq() }), UNKNOWN);
  assert.equal((await acceptancesOf(sc.owner)).length, before,
    "no_manufactured_acceptance: a refused dispatch created no acceptance on that person's behalf");
});
