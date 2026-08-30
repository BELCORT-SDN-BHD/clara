// 裁-18b PR-3 — the POST-TIME binding re-check inside clara._approve_entry_core, the control
// witness it mints, and 裁-46's clara.reset_binding_revocation door.
//
// Design of record: docs/plan/active/binding-proposal-design.md (裁-25 header block, G6
// OVERRULED). Gate record: binding-proposal-gate-record.md G6. PR-0 gate:
// binding-proposal-pr0-gate-2026-08-29.md — B8 (the contract and the port source) and O3 (the
// ruled semantics: REFUSE on revoked, ANNOTATE-and-post on expired, REVERSALS BYPASS).
// Ruling ledger: mohe-grill-rulings-2026-08-30.md 裁-46.
//
// EVERY WALL HAS A MUTANT. A wall with no mutant is a wall nobody has measured: each refusal
// cell below is paired with a `withMutant` run that removes EXACTLY that arm from the LIVE body
// and proves the refusal disappears. Without that pairing a cell can be green because the door
// refuses everything, and green would mean nothing.
//
// FAIL, NEVER SKIP. The migration is UNNUMBERED on the branch (the conductor claims its number
// at merge prep), so readiness is probed by CATALOG — exact-signature to_regprocedure — not by a
// schema_migrations version string that does not exist yet. Against the pre-migration frontier
// this battery goes RED, deliberately (.claude/rules/db-tests.md; the estate's fail0017 idiom).
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  opk, assertRaises, endPool, rootQuery, humanQuery, roleQuery, namedCall, CLR, PG, ROLES,
} from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { buildWorld } from "./x1-helpers.mjs";
import { approveEntry, COA } from "./rig-fixtures.mjs";
import {
  seedPayableAccount, seedClientHardIdentifier, seedPassingWindow, seedBareDocument,
  seedF123Evidence, propose, signLive, revoke, postTimeControlLive, POST_TIME_MARKER,
  APPROVE_CORE_SIG, recutApproveCore, restoreApproveCore, driftApproveCore, AP_ACCOUNT,
} from "./x36-vendor-binding-helpers.mjs";
import {
  reasonOf, withMutant, withoutConstraint, declineBinding, resetDecline,
  seedWindow, DATES_OK, mergeAway, seedUniqueFamilyVendor,
} from "./binding-proposal-pr-1-helpers.mjs";

const RESET_REVOCATION_SIG = "clara.reset_binding_revocation(uuid,text,text)";

let live = false;
let w = null;

/** READINESS BY CATALOG, never by a migration name: this file is UNNUMBERED on the branch.
 *  Both halves of what PR-3 ships are probed, because a half-applied database is its own
 *  failure and must not read as either clean state. */
async function pr3Live() {
  try {
    const r = await rootQuery(
      `select to_regprocedure($1) as door,
              (select count(*)::int from clara.control_witnesses where control = $2) as witness`,
      [RESET_REVOCATION_SIG, POST_TIME_MARKER]);
    const row = r.rows[0] ?? {};
    return Boolean(row.door) && row.witness === 1;
  } catch { return false; }
}

function failPr3() {
  if (!live) {
    throw new Error(
      "裁-18b PR-3 NOT applied (clara.reset_binding_revocation does not resolve at its exact "
      + "signature, or the binding_post_time_recheck_v1 witness is not minted) — this battery is "
      + "REQUIRED to fail against the pre-migration frontier rather than skip "
      + "(.claude/rules/db-tests.md).");
  }
}

before(async () => {
  live = await pr3Live();
  if (!live) return;
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
  await seedClientHardIdentifier(w.firms.A, w.clients.A1);
  // A2 is prepared too: bpr3.C8 needs a GENUINE live binding on a second client, and FOLD-7's
  // own-client wall refuses any client with no recorded hard identifier.
  await seedPayableAccount(w.firms.A, w.clients.A2);
  await seedClientHardIdentifier(w.firms.A, w.clients.A2);
});
after(async () => { printLaneNotes("binding-pr-3-post-time"); await endPool(); });

const bindingRow = async (id) =>
  (await rootQuery("select * from clara.vendor_identity_bindings where id=$1", [id])).rows[0];
const postResolution = async (entry) => (await rootQuery(
  "select * from clara.vendor_binding_resolutions where entry_id=$1 and phase='post' order by created_at desc,id desc limit 1",
  [entry])).rows[0] ?? null;
const entryStatus = async (id) =>
  (await rootQuery("select status from clara.journal_entries where id=$1", [id])).rows[0].status;

/** A LIVE binding over a fully-qualifying window, signed through the REAL audited door. */
async function liveBinding(tag) {
  const cp = await seedPassingWindow(w, tag);
  const proposed = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  const signed = await signLive(w.users.alice, { binding: proposed.binding_id });
  assert.equal(signed.status, "live", `${tag}: the fixture binding must be LIVE`);
  return { cp, binding: signed };
}

/**
 * A DRAFT entry carrying `binding`'s marker, over a document whose CURRENT facts genuinely
 * satisfy every rung of the restored control — so the only thing any cell below changes is the
 * ONE fact it is about. Built by direct insert (the draft lane's own admission gates are not
 * this battery's subject), but APPROVED through the real clara.approve_entry door: the wall
 * under test lives inside clara._approve_entry_core and reaching it any other way would prove
 * nothing about the door.
 *
 * The document deliberately prints NO invoice.vendor_registration: that is the A.1-clean shape
 * the ported control's receipt half admits (0046:1529), and it keeps the page-resolution rung
 * on its ordinary path — the name resolves to the bound counterparty, so v_pt_page_same holds.
 */
async function boundDraft({ cp, binding }, tag, { reversalOf = null } = {}) {
  const doc = await seedBareDocument(w.firms.A, `bpr3-${tag}`);
  // The printed invoice id must EXTEND the binding's stored F2 prefix (0030: F1/F2 are prefix
  // relations, never equalities) and be unique, so the duplicate-bill wall never fires instead.
  const invoiceId = `${binding.f2_invoice_prefix.toUpperCase()}${Date.now().toString(36).toUpperCase()}`;
  await seedF123Evidence(w.firms.A, doc.id, cp, invoiceId, cp.name);
  const maker = (await rootQuery(
    "select user_id from clara.firm_memberships where firm_id=$1 and status='active' limit 1",
    [w.firms.A])).rows[0].user_id;
  const resolution = (await rootQuery(
    `insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,method,evidence,resolved_by)
     values($1,$2,'document',$3,1.0,'human','{}'::jsonb,$4) returning id`,
    [w.firms.A, w.clients.A1, doc.id, maker])).rows[0].id;
  const filing = (await rootQuery(
    `insert into clara.document_filings(firm_id,document_id,client_id,filed_by,basis,resolution_id)
     values($1,$2,$3,$4,'seed-0007',$5) returning id`,
    [w.firms.A, doc.id, w.clients.A1, maker, resolution])).rows[0].id;
  const entry = (await rootQuery(
    `with e as (
       insert into clara.journal_entries(firm_id,client_id,status,posting_date,origin,document_id,
           filing_id,source_doc_sha256,maker_actor,coding_kind,vendor_binding_id,reversal_of)
       values($1,$2,'draft',current_date,'manual',$3,$4,$5,$6,'supplier_bill',$7,$8)
       returning id,revision_token
     ), l as (
       insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       select e.id,1,$9,100000,0,'bill',$10::uuid from e
       union all
       select e.id,2,$11,0,100000,'payable',$10::uuid from e
     )
     select id, revision_token from e`,
    [w.firms.A, w.clients.A1, doc.id, filing, doc.sha, maker, binding.binding_id, reversalOf,
      COA.expense, cp.id, AP_ACCOUNT])).rows[0];
  // THE DRAFT-PHASE RESOLUTION the control compares against. Without it the ladder's own
  // draft-resolution rung refuses `binding_changed` and every cell below would pass for the
  // wrong reason.
  await rootQuery(
    `insert into clara.vendor_binding_resolutions(
       binding_id,firm_id,client_id,document_id,entry_id,phase,
       facts_extraction_id,ocr_extraction_id,entry_revision_token,raw_proposal,outcome)
     values($1,$2,$3,$4,$5,'draft',
       (select id from clara.document_extractions where document_id=$4 and engine_kind='invoice_facts'
         and status='done' order by version_n desc,id desc limit 1),
       (select id from clara.document_extractions where document_id=$4 and engine_kind='ocr'
         and status='done' order by version_n desc,id desc limit 1),
       $6,'{}'::jsonb,'bound')`,
    [binding.binding_id, w.firms.A, w.clients.A1, doc.id, entry.id, entry.revision_token]);
  // RE-READ THE TOKEN LAST. clara._tf_entry_revision bumps it on every write to the row, so the
  // value the INSERT returned is already stale by the time the fixture finishes — approve_entry
  // would then refuse CLR06 and the cell would be measuring the revision gate, not this control.
  return { doc, entry: entry.id, revision: await currentRev(entry.id), invoiceId };
}

/**
 * A REVERSAL draft of `orig`, still carrying the binding marker.
 *
 * Built the way clara.reverse_entry builds one — mirror lines (debits and credits swapped),
 * origin='reversal', reversal_of set, coding_kind NULL — plus the two things reverse_entry does
 * NOT carry and this cell needs: the document and the binding marker. Without the document the
 * control could not reach its binding arms at all, and the mutant below would refuse for the
 * wrong reason (binding_changed rather than binding_revoked), which is a mutant that proves the
 * cell can be red rather than that this wall is the one holding it up.
 */
async function boundReversal(orig, binding, tag) {
  const src = (await rootQuery(
    "select firm_id,client_id,document_id,filing_id,source_doc_sha256,maker_actor from clara.journal_entries where id=$1",
    [orig.entry])).rows[0];
  const entry = (await rootQuery(
    `with e as (
       insert into clara.journal_entries(firm_id,client_id,status,posting_date,origin,document_id,
           filing_id,source_doc_sha256,maker_actor,vendor_binding_id,reversal_of,memo)
       values($1,$2,'draft',current_date,'reversal',$3,$4,$5,$6,$7,$8,$9)
       returning id,revision_token
     ), l as (
       insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       select e.id,o.line_no,o.account_code,o.credit_cents,o.debit_cents,o.description,o.counterparty_id
         from e cross join clara.journal_lines o where o.entry_id=$8 order by o.line_no
     )
     select id, revision_token from e`,
    [src.firm_id, src.client_id, src.document_id, src.filing_id, src.source_doc_sha256,
      src.maker_actor, binding.binding_id, orig.entry, `Reversal: ${tag}`])).rows[0];
  await rootQuery(
    `insert into clara.vendor_binding_resolutions(
       binding_id,firm_id,client_id,document_id,entry_id,phase,
       facts_extraction_id,ocr_extraction_id,entry_revision_token,raw_proposal,outcome)
     values($1,$2,$3,$4,$5,'draft',
       (select id from clara.document_extractions where document_id=$4 and engine_kind='invoice_facts'
         and status='done' order by version_n desc,id desc limit 1),
       (select id from clara.document_extractions where document_id=$4 and engine_kind='ocr'
         and status='done' order by version_n desc,id desc limit 1),
       $6,'{}'::jsonb,'bound')`,
    [binding.binding_id, src.firm_id, src.client_id, src.document_id, entry.id, entry.revision_token]);
  return { entry: entry.id, revision: await currentRev(entry.id) };
}

const currentRev = async (id) => (await rootQuery(
  "select revision_token from clara.journal_entries where id=$1", [id])).rows[0].revision_token;

/**
 * Expire a LIVE binding the way the estate actually expires one.
 *
 * NOT by moving `expires_at`: clara._tf_vendor_identity_binding_update FREEZES that column once
 * `signed_at` is set (measured, not assumed — a direct update raises CLR36 'vendor binding
 * content is frozen'), which is the right behaviour and this fixture does not weaken it. The
 * reachable form of expiry on a signed row is the STATUS write, and it has a real producer:
 * every `status='expired'` write in 0028 filters `status='live'`, so a proposal door expiring a
 * stale live binding puts a row in exactly this state. The control's arm is one condition
 * (`status='expired' OR expires_at<=now()`), so drilling the reachable disjunct drills the arm —
 * and the other disjunct is unreachable on a signed row BY DESIGN, which is recorded here rather
 * than papered over with a fixture that tears a trigger off to reach it.
 */
const expireBinding = async (id) => rootQuery(
  "update clara.vendor_identity_bindings set status='expired' where id=$1 and status='live'", [id])
  .then((r) => assert.equal(r.rowCount, 1, "the fixture must have expired exactly one LIVE binding"));

const approve = async (d, tag) => approveEntry(w.users.alice,
  { entry: d.entry, expectedRevision: await currentRev(d.entry), attestation: "rig post-time probe", opKey: opk(tag) });

// ===========================================================================
// READINESS + THE WITNESS
// ===========================================================================

test("bpr3.R0 — the control ships as REAL CODE and the witness attests to THOSE bytes", async () => {
  failPr3();
  // D2 (packages/db/README.md): the witness must be the LIVE body, byte for byte, or the door it
  // gates has quietly stopped working. Asked the way the door asks it — resolve the expected
  // identity to an OID first, then compare the sha — so this cell and the door can never disagree.
  const r = await rootQuery(
    `select w.proc, w.minted_in_migration,
            (encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') = w.prosrc_sha) as matches
       from clara.control_witnesses w join pg_proc p on p.oid = to_regprocedure(w.proc)
      where w.control = $1`, [POST_TIME_MARKER]);
  assert.equal(r.rowCount, 1, "exactly one witness row for the post-time control");
  assert.equal(r.rows[0].proc, APPROVE_CORE_SIG, "…naming the approve path by EXACT signature");
  assert.equal(r.rows[0].matches, true, "…and matching the live body byte-for-byte");
  assert.ok(!/^rig-fixture:/.test(r.rows[0].minted_in_migration),
    `…minted by the MIGRATION, not left behind by a fixture (${r.rows[0].minted_in_migration})`);
  // …and the control is real code, not a marker: the ruled O3 gate is IN the body.
  const src = (await rootQuery(
    `select regexp_replace(regexp_replace(p.prosrc,'/\\*.*?\\*/','','gs'),'--[^\\n]*','','g') as s
       from pg_proc p where p.oid = $1::regprocedure`, [APPROVE_CORE_SIG])).rows[0].s;
  assert.ok(src.includes("if e.vendor_binding_id is not null and e.reversal_of is null then"),
    "the ruled gate (bound AND not a reversal) is in the comment-stripped body");
  assert.ok(src.includes("clara._binding_lock_pair"), "…and the block takes the pair key");
  // The breeding block 0106 §E excised must NOT have come back with this splice (B8's `[N]`).
  for (const gone of ["insert into clara.rule_sightings", "bank_rule_suggested", "uq_rule_sightings_mapping"]) {
    assert.ok(!src.includes(gone), `the splice did not restore an earlier generation: "${gone}"`);
  }
});

test("bpr3.R1 — the signer's gate is OPEN after PR-3, and CLOSES again the moment the body drifts", async () => {
  failPr3();
  // The half PR-1 could only prove as a refusal. A migration that recuts a witnessed body and
  // forgets to re-witness it closes the control's gate — deliberately, because a control whose
  // body changed without review is a control nobody has reviewed. Drilled here as the state
  // that actually produces it, since ABSENCE is no longer reachable on this frontier.
  assert.equal(await postTimeControlLive(), true, "the gate reads OPEN on the reviewed bytes");
  const { cp } = await liveBinding("R1");
  const proposed = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id })
    .then(() => { throw new Error("unreachable"); })
    .catch((e) => e);
  assert.equal(proposed.code, "CLR36", "control: a second proposal on a LIVE pair is refused");

  const cp2 = await seedPassingWindow(w, "R1b");
  const p2 = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp2.id });
  const baseSha = (await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as s from pg_proc p where p.oid = $1::regprocedure",
    [APPROVE_CORE_SIG])).rows[0].s;
  const { original, sha } = await recutApproveCore(driftApproveCore);
  assert.notEqual(sha, baseSha, "the drift really moved the body");
  let err = null;
  try {
    err = await assertRaises("CLR36",
      () => humanQuery(w.users.alice,
        namedCall("sign_vendor_identity_binding", [{ name: "p_binding" }, { name: "p_op_key" }]),
        [p2.binding_id, opk("r1drift")]),
      "signing while the witnessed body has drifted");
  } finally {
    await restoreApproveCore(original, baseSha);
  }
  assert.equal(reasonOf(err), "post_time_control_absent");
  assert.equal((await bindingRow(p2.binding_id)).status, "proposed", "nothing went live");
  assert.equal(await postTimeControlLive(), true, "…and the gate is OPEN again after the restore");
});

// ===========================================================================
// THE CONTROL — the clean path, then one cell per ruled arm, each with its mutant
// ===========================================================================

test("bpr3.C1 — a still-valid binding approves UNCHANGED, and records phase='post' outcome='bound'", async () => {
  failPr3();
  // The control on every refusal cell below. If a valid binding could not post, every refusal
  // here would be indistinguishable from a door that refuses everything.
  const b = await liveBinding("C1");
  const d = await boundDraft(b, "C1");
  const r = await approve(d, "bpr3c1");
  assert.equal(r.status, "approved", `a valid binding must still post: ${JSON.stringify(r)}`);
  assert.equal(await entryStatus(d.entry), "approved");
  const res = await postResolution(d.entry);
  assert.ok(res, "the control persisted its phase='post' resolution — the record 0118 killed");
  assert.equal(res.outcome, "bound");
  assert.equal(res.refusal_reason, null);
  assert.equal(res.binding_id, b.binding.binding_id);
  assert.ok(res.compared_to_resolution_id, "…joined to the DRAFT resolution it was compared against");
  assert.equal(res.entry_revision_token, d.revision, "…pinned to the revision that was approved");
  // ANNOTATION-FREE: the clean path adds nothing to the caller's return.
  assert.equal(r.binding_post_check, undefined, "a clean re-check annotates nothing");
});

test("bpr3.C2 — an UNBOUND entry never enters the control at all (and its mutant proves the gate)", async () => {
  failPr3();
  // O3's gate: fourteen call sites reach this body and most carry no binding. An ungated check
  // would fire in every one of them.
  const b = await liveBinding("C2");
  const d = await boundDraft(b, "C2");
  await rootQuery("update clara.journal_entries set vendor_binding_id=null where id=$1", [d.entry]);
  const rev = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [d.entry])).rows[0].revision_token;
  const r = await approveEntry(w.users.alice,
    { entry: d.entry, expectedRevision: rev, attestation: "rig", opKey: opk("bpr3c2") });
  assert.equal(r.status, "approved", "an unbound entry posts without touching the binding machinery");
  assert.equal(await postResolution(d.entry), null, "…and writes no post-time resolution");

  // THE MUTANT: drop the `vendor_binding_id is not null` half of the gate, and the SAME unbound
  // entry is dragged into a control that has no authority row to judge.
  const b2 = await liveBinding("C2m");
  const d2 = await boundDraft(b2, "C2m");
  await rootQuery("update clara.journal_entries set vendor_binding_id=null where id=$1", [d2.entry]);
  const rev2 = (await rootQuery("select revision_token from clara.journal_entries where id=$1", [d2.entry])).rows[0].revision_token;
  await withMutant(APPROVE_CORE_SIG,
    [["if e.vendor_binding_id is not null and e.reversal_of is null then",
      "if e.reversal_of is null then"]],
    async () => {
      const err = await assertRaises("CLR36", () => approveEntry(w.users.alice,
        { entry: d2.entry, expectedRevision: rev2, attestation: "rig", opKey: opk("bpr3c2m") }),
      "an unbound entry with the gate's first half removed");
      assert.equal(reasonOf(err), "binding_changed");
    });
});

test("bpr3.C3 — a REVOKED binding REFUSES at approve (O3), and its mutant posts instead", async () => {
  failPr3();
  // THE EXPOSURE G6 NAMED: an entry drafted under a live binding and approved after the binding
  // is revoked was posted with the binding's identity attribution and no re-check. Not a wrong
  // number — the accounts, amounts and direction were always judged under the other walls — a
  // stale IDENTITY AUTHORITY. Ruled: refuse. A human took the authority away.
  const b = await liveBinding("C3");
  const d = await boundDraft(b, "C3");
  await revoke(w.users.bob, { binding: b.binding.binding_id, reason: "wrong vendor after all" });
  const err = await assertRaises("CLR36", () => approve(d, "bpr3c3"),
    "approving an entry bound to a since-REVOKED binding");
  assert.equal(reasonOf(err), "binding_revoked");
  assert.equal(await entryStatus(d.entry), "draft", "the entry stays a DRAFT — the raise unwound it");
  assert.equal(await postResolution(d.entry), null,
    "a REFUSED post-time check leaves no resolution row: the raise rolls the insert back with it, "
    + "and the durable evidence of the refusal is the still-draft entry plus the typed reason");

  // THE MUTANT: move `revoked` into the ANNOTATE set and the same call POSTS.
  const b2 = await liveBinding("C3m");
  const d2 = await boundDraft(b2, "C3m");
  await revoke(w.users.bob, { binding: b2.binding.binding_id, reason: "mutant probe" });
  await withMutant(APPROVE_CORE_SIG,
    [["v_pt_annotate:=(v_pt_reason in ('binding_expired','binding_revocation_lifted'));",
      "v_pt_annotate:=(v_pt_reason in ('binding_expired','binding_revocation_lifted','binding_revoked'));"]],
    async () => {
      const r = await approve(d2, "bpr3c3m");
      assert.equal(r.status, "approved",
        "with revoked moved to the annotate arm the refusal disappears — the wall is this arm and nothing else");
    });
});

test("bpr3.C4 — an EXPIRED binding POSTS and is ANNOTATED (O3), and its mutant refuses instead", async () => {
  failPr3();
  // O3, in the owner's words: expiry is a CLOCK, revocation is an ACT. An entry drafted three
  // days before expiry and approved two days after should not be stranded over a date. It posts,
  // the divergence is recorded, and the annotation reaches the caller rather than living only in
  // a table nobody reads.
  const b = await liveBinding("C4");
  const d = await boundDraft(b, "C4");
  await expireBinding(b.binding.binding_id);
  const r = await approve(d, "bpr3c4");
  assert.equal(r.status, "approved", `an expired binding must not strand the entry: ${JSON.stringify(r)}`);
  assert.ok(r.binding_post_check, "the caller is told, on the return");
  assert.equal(r.binding_post_check.code, "binding_expired_at_post");
  assert.equal(r.binding_post_check.binding_id, b.binding.binding_id);
  assert.equal(r.binding_post_check.resolution_recorded, true);
  const res = await postResolution(d.entry);
  assert.ok(res, "…the divergence is RECORDED, not merely narrated");
  assert.equal(res.outcome, "divergence");
  assert.equal(res.refusal_reason, "binding_expired");
  // …and the audit row carries it too, under its own key beside (never inside) the pre-existing
  // no-counterparty warning slot.
  const audit = (await rootQuery(
    "select args from clara.audit_log where fn='approve_entry' and entry_id=$1 order by at desc limit 1",
    [d.entry])).rows[0];
  assert.ok(audit, "the approval left an audit row");
  assert.equal(audit.args.binding_post_check?.code, "binding_expired_at_post");

  // THE MUTANT: empty the annotate set and the same call REFUSES.
  const b2 = await liveBinding("C4m");
  const d2 = await boundDraft(b2, "C4m");
  await expireBinding(b2.binding.binding_id);
  await withMutant(APPROVE_CORE_SIG,
    [["v_pt_annotate:=(v_pt_reason in ('binding_expired','binding_revocation_lifted'));",
      "v_pt_annotate:=false;"]],
    async () => {
      const err = await assertRaises("CLR36", () => approve(d2, "bpr3c4m"),
        "an expired binding with the annotate arm removed");
      assert.equal(reasonOf(err), "binding_expired");
    });
});

test("bpr3.C5 — an IDENTITY DRIFT between draft and approve REFUSES, and its mutant posts", async () => {
  failPr3();
  // The registration the binding was signed against is the identity it authorises. If the
  // counterparty's registration moves after the card was signed, the authority names a company
  // that is no longer the one in front of us.
  // THE DRIFT VECTOR IS A MERGE, not a registration rewrite. clara._tf_counterparty_update_0011
  // allows exactly {name, name_normalized, payment_terms_days} on a live row and exactly
  // {merged_into, retired_at} on a merge — a direct registration_normalized change raises
  // 'illegal counterparty mutation' (measured, and correctly so), and a lone retired_at is
  // refused for the same reason. Tearing that trigger off to reach the state would be weakening
  // one mechanism to test another. A merge is a REAL product transition and lands on the SAME
  // ladder arm, whose disjuncts — counterparty gone, merged, retired, or registration moved —
  // are one condition.
  const b = await liveBinding("C5");
  const d = await boundDraft(b, "C5");
  await mergeAway(b.cp.id, (await seedUniqueFamilyVendor(w.firms.A, w.clients.A1, "C5win")).id);
  const err = await assertRaises("CLR36", () => approve(d, "bpr3c5"),
    "approving after the bound counterparty was merged away");
  assert.equal(reasonOf(err), "binding_identity_drifted");
  assert.equal(await entryStatus(d.entry), "draft");

  // TWO MUTANTS, because a merged counterparty turns out to be defended TWICE — and a cell that
  // only ran the first one would report "the wall is still there" as if one arm had done it.
  //
  // (a) Neutralise the identity arm ALONE: the entry is still refused, but the WORD changes to
  //     binding_changed. That proves the arm is what produces the discriminant a classifier
  //     reads, and it surfaces the second rung instead of hiding behind it.
  const b2 = await liveBinding("C5m");
  const d2 = await boundDraft(b2, "C5m");
  await mergeAway(b2.cp.id, (await seedUniqueFamilyVendor(w.firms.A, w.clients.A1, "C5mwin")).id);
  const NEUTRALISE_DRIFT = ["      v_pt_reason:='binding_identity_drifted';",
    "      v_pt_reason:=v_pt_reason;"];
  await withMutant(APPROVE_CORE_SIG, [NEUTRALISE_DRIFT], async () => {
    const err2 = await assertRaises("CLR36", () => approve(d2, "bpr3c5ma"),
      "a merged counterparty with ONLY the identity arm neutralised");
    assert.equal(reasonOf(err2), "binding_changed",
      "the second rung still stops it — the merge is caught twice, and the word says which arm spoke");
  });

  // (b) Neutralise BOTH — the identity arm and the live-population fallback that also refuses a
  //     counterparty the `bm` lateral can no longer see — and the entry POSTS. That is the state
  //     the pair of walls exists to prevent: an authority whose vendor was merged away, honoured
  //     verbatim on a new document.
  const b3 = await liveBinding("C5m2");
  const d3 = await boundDraft(b3, "C5m2");
  await mergeAway(b3.cp.id, (await seedUniqueFamilyVendor(w.firms.A, w.clients.A1, "C5m2win")).id);
  await withMutant(APPROVE_CORE_SIG, [
    NEUTRALISE_DRIFT,
    [`      elsif coalesce(v_pt_matches,0)<>1
         or v_pt_matching_binding is distinct from e.vendor_binding_id then`,
    "      elsif false then"],
  ], async () => {
    const r = await approve(d3, "bpr3c5mb");
    assert.equal(r.status, "approved",
      "with BOTH rungs gone the merged-away authority is honoured and the entry posts");
  });
});

test("bpr3.C6 — a pair a human DECLINED is suppressed at post time too, and its mutant posts", async () => {
  failPr3();
  // Defence in depth, and it is labelled as such rather than sold as the primary wall: PR-1's
  // signer already refuses a suppressed pair, so a LIVE binding on a declined pair should be
  // unreachable. The fail-closed direction on a wall a human deliberately raised is to leave it
  // standing anyway — so the fixture manufactures the state directly and the door still refuses.
  const b = await liveBinding("C6");
  const d = await boundDraft(b, "C6");
  // A second, DECLINED row for the same pair. Inserted directly: no door can produce this while
  // uq_vib_one_active_binding stands, which is exactly why the rung is depth and not the wall.
  await rootQuery(
    `insert into clara.vendor_identity_bindings(
       firm_id,client_id,counterparty_id,status,f1_vendor_name_norm,f2_invoice_prefix,
       registration_at_signing,content_hash,created_by,declined_by,declined_at,decline_reason,expires_at)
     select firm_id,client_id,counterparty_id,'declined',f1_vendor_name_norm,f2_invoice_prefix,
       registration_at_signing,$2,created_by,$3,now(),'rig decline',expires_at
       from clara.vendor_identity_bindings where id=$1`,
    [b.binding.binding_id, randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64), w.users.alice]);
  assert.equal((await rootQuery("select clara._binding_suppression($1,$2,$3) as s",
    [w.firms.A, w.clients.A1, b.cp.id])).rows[0].s, "declined",
  "control: the pair really does read as suppressed before the approve");
  const err = await assertRaises("CLR36", () => approve(d, "bpr3c6"),
    "approving on a pair a human declined");
  assert.equal(reasonOf(err), "binding_suppressed");

  await withMutant(APPROVE_CORE_SIG,
    [["v_pt_suppression:=clara._binding_suppression(e.firm_id,e.client_id,v_pt_b.counterparty_id);",
      "v_pt_suppression:=null;"]],
    async () => {
      const r = await approve(d, "bpr3c6m");
      assert.equal(r.status, "approved",
        "with the suppression read stubbed out the refusal disappears");
    });
});

test("bpr3.C7 — a REVERSAL of an entry posted under a since-revoked binding BYPASSES entirely", async () => {
  failPr3();
  // O3, and it is NOT optional under any arm: an entry posted under a since-revoked binding is
  // exactly the entry a human needs to reverse. A check that refused it would block its own
  // remedy — the entry would be stuck posted, under an authority nobody wants, with no way out.
  const b = await liveBinding("C7");
  const d = await boundDraft(b, "C7");
  assert.equal((await approve(d, "bpr3c7a")).status, "approved", "the original posts while the binding is live");
  await revoke(w.users.bob, { binding: b.binding.binding_id, reason: "revoked after posting" });

  // A reversal carrying the SAME binding marker, so the ONLY difference from the C3 shape —
  // which refuses — is that this one is a reversal.
  const rev = await boundReversal(d, b.binding, "C7rev");
  const r = await approve(rev, "bpr3c7b");
  assert.equal(r.status, "approved",
    `the reversal must post even though the binding is revoked: ${JSON.stringify(r)}`);
  assert.equal(await postResolution(rev.entry), null, "…and the control never ran for it");

  // THE MUTANT: remove the bypass and the remedy is blocked by the very control meant to protect
  // the books from the thing it is remedying.
  const b2 = await liveBinding("C7m");
  const d2 = await boundDraft(b2, "C7m");
  await approve(d2, "bpr3c7ma");
  await revoke(w.users.bob, { binding: b2.binding.binding_id, reason: "mutant probe" });
  const rev2 = await boundReversal(d2, b2.binding, "C7mrev");
  await withMutant(APPROVE_CORE_SIG,
    [["if e.vendor_binding_id is not null and e.reversal_of is null then",
      "if e.vendor_binding_id is not null then"]],
    async () => {
      const err = await assertRaises("CLR36", () => approve(rev2, "bpr3c7mb"),
        "a reversal with the bypass removed");
      assert.equal(reasonOf(err), "binding_revoked",
        "without the bypass the remedy is refused by the control it exists to remedy");
    });
});

test("bpr3.C8 — a binding belonging to ANOTHER book cannot authorise this entry", async () => {
  failPr3();
  // The marker is a bare uuid on the entry with no composite FK behind it, so an authority
  // belonging to another client would otherwise be honoured verbatim.
  // TWO WALLS, and the order matters for what this cell is allowed to claim.
  //
  // The PRIMARY wall is STRUCTURAL and it is not this PR's: fk_je_vendor_binding is a COMPOSITE
  // foreign key over (vendor_binding_id, firm_id, client_id), so an entry cannot even be STAMPED
  // with another book's authority. That is measured first, with a genuine LIVE binding on client
  // A2 built through the real propose/sign doors — not a rewritten row.
  //
  // The body's own arm is therefore a FLOOR BENEATH a wall no path can get past today, and it is
  // labelled as one rather than sold as the thing holding the line. It is still worth having and
  // still worth measuring: an FK is one `alter table` away from being dropped by a later lane,
  // and a floor nobody ever drove is a promise. So the second half drops exactly that FK — the
  // estate's own withoutConstraint idiom for reaching a branch a constraint hides — and proves
  // the body refuses on its own.
  const b = await liveBinding("C8");
  const d = await boundDraft(b, "C8");
  const cpB = await seedWindow(w, "C8other", { dates: DATES_OK, client: w.clients.A2 });
  const pB = await propose(w.users.bob, { client: w.clients.A2, counterparty: cpB.id });
  const sB = await signLive(w.users.alice, { binding: pB.binding_id });
  assert.equal(sB.status, "live", "control: the foreign authority really is LIVE");

  await assertRaises(PG.foreignKeyViolation,
    () => rootQuery("update clara.journal_entries set vendor_binding_id=$2 where id=$1",
      [d.entry, sB.binding_id]),
    "stamping another book's authority onto this entry");

  await withoutConstraint({
    table: "journal_entries",
    constraint: "fk_je_vendor_binding",
    ddl: `alter table clara.journal_entries add constraint fk_je_vendor_binding
            foreign key (vendor_binding_id, firm_id, client_id)
            references clara.vendor_identity_bindings(id, firm_id, client_id)`,
  }, async () => {
    await rootQuery("update clara.journal_entries set vendor_binding_id=$2 where id=$1",
      [d.entry, sB.binding_id]);
    const err = await assertRaises("CLR36", () => approve(d, "bpr3c8"),
      "approving under an authority scoped to another client, with the FK out of the way");
    assert.equal(reasonOf(err), "binding_changed");
    assert.equal(await entryStatus(d.entry), "draft");
    // Put the marker back before the FK returns, or the constraint would refuse to validate.
    await rootQuery("update clara.journal_entries set vendor_binding_id=$2 where id=$1",
      [d.entry, b.binding.binding_id]);
  });
});

test("bpr3.C9 — an EXPIRED binding whose identity ALSO drifted REFUSES; the clock never masks", async () => {
  failPr3();
  // THE DEFECT THIS CELL EXISTS FOR, found in this PR's own body rather than in the port source.
  // 0046 judged the clock SECOND and UNGUARDED, which was safe there because expiry REFUSED:
  // overriding one refusal with another still refuses. O3 makes expiry ANNOTATE AND POST, so a
  // verbatim port would have let a stale date wave through an entry whose vendor identity had
  // moved — the opposite of what annotation is for. Two things are wrong here; the entry must
  // stop for the one that is not a date.
  const b = await liveBinding("C9");
  const d = await boundDraft(b, "C9");
  await mergeAway(b.cp.id, (await seedUniqueFamilyVendor(w.firms.A, w.clients.A1, "C9win")).id);
  await expireBinding(b.binding.binding_id);
  const err = await assertRaises("CLR36", () => approve(d, "bpr3c9"),
    "approving on a binding that is BOTH expired and identity-drifted");
  assert.equal(reasonOf(err), "binding_identity_drifted",
    "the identity fact outranks the clock, and the refusal says which one stopped it");
  assert.equal(await entryStatus(d.entry), "draft");
  assert.equal(await postResolution(d.entry), null, "nothing was annotated — nothing posted");

  // THE MUTANT: restore 0046's precedence verbatim — judge the clock FIRST and unguarded — and
  // the same doubly-broken entry POSTS with a mere annotation.
  const b2 = await liveBinding("C9m");
  const d2 = await boundDraft(b2, "C9m");
  await mergeAway(b2.cp.id, (await seedUniqueFamilyVendor(w.firms.A, w.clients.A1, "C9mwin")).id);
  await expireBinding(b2.binding.binding_id);
  await withMutant(APPROVE_CORE_SIG,
    [["    if v_pt_reason is null and v_pt_expired then\n      v_pt_reason := case when v_pt_lifted then 'binding_revocation_lifted' else 'binding_expired' end;\n    end if;",
      "    if v_pt_expired then\n      v_pt_reason := case when v_pt_lifted then 'binding_revocation_lifted' else 'binding_expired' end;\n    end if;"]],
    async () => {
      const r = await approve(d2, "bpr3c9m");
      assert.equal(r.status, "approved",
        "with the clock judged unguarded the drifted identity is masked and the entry posts — "
        + "which is precisely the port-verbatim behaviour this arm exists to prevent");
      assert.equal(r.binding_post_check?.code, "binding_expired_at_post",
        "…and it is annotated as a mere expiry, so a reader would never learn the identity moved");
    });
});

// ===========================================================================
// 裁-46 — clara.reset_binding_revocation
// ===========================================================================

const resetRevocation = (sub, { binding, reason = "rig reset", opKey } = {}) =>
  humanQuery(sub, namedCall("reset_binding_revocation",
    [{ name: "p_binding" }, { name: "p_reason" }, { name: "p_op_key" }]),
  [binding, reason, opKey ?? opk("resetrevo")]).then((r) => r.rows[0].result);

async function revokedBinding(tag) {
  const b = await liveBinding(tag);
  await revoke(w.users.bob, { binding: b.binding.binding_id, reason: `${tag} revoke` });
  return b;
}

test("bpr3.K1 — the door lifts a REVOCATION, receipts every column it cleared, and un-suppresses the pair", async () => {
  failPr3();
  // THE COUNT MUST DISCRIMINATE (Codex #452 LOW). An earlier cut of this cell asserted only
  // `typeof approved_entries === "number"` over a fixture that had posted NOTHING — so the impl
  // could have returned a constant 0, or dropped the `status='approved'` filter, and this cell
  // would still have been green. A receipt figure nobody checks is decoration.
  //
  // The fixture now makes the RIGHT ANSWER a specific, non-zero, non-trivial number:
  //   · TWO entries posted under this binding and APPROVED  -> both must count
  //   · ONE left as a DRAFT under the same binding          -> the status filter must exclude it
  //   · ONE approved under a DIFFERENT live binding         -> the binding filter must exclude it
  // so 2 is distinguishable from 0 (a constant), from 3 (no status filter) and from 4 (neither).
  const b = await liveBinding("K1");
  const counted = [];
  for (const tag of ["K1a", "K1b"]) {
    const d = await boundDraft(b, tag);
    assert.equal((await approve(d, `bpr3k1${tag}`)).status, "approved",
      `${tag}: the fixture entry must actually POST, or the count is trivially right`);
    counted.push(d.entry);
  }
  const draftOnly = await boundDraft(b, "K1draft");          // never approved
  const other = await liveBinding("K1other");                // a different authority entirely
  const otherEntry = await boundDraft(other, "K1otherpost");
  assert.equal((await approve(otherEntry, "bpr3k1other")).status, "approved");

  // THE EXPECTED VALUE IS READ FROM THE DB, never asserted as a literal 2 — this cell states the
  // predicate the door is supposed to compute and compares the door against it.
  const expected = (await rootQuery(
    "select count(*)::int c from clara.journal_entries where vendor_binding_id=$1 and status='approved'",
    [b.binding.binding_id])).rows[0].c;
  assert.equal(expected, 2,
    "control: the fixture really did leave exactly two APPROVED entries under this binding");
  assert.equal((await rootQuery(
    "select count(*)::int c from clara.journal_entries where vendor_binding_id=$1", [b.binding.binding_id])).rows[0].c,
  3, "control: …out of three carrying its marker, so the status filter has something to exclude");
  assert.equal(await entryStatus(draftOnly.entry), "draft", "control: the third really is a draft");

  await revoke(w.users.bob, { binding: b.binding.binding_id, reason: "K1 revoke" });
  const before = await bindingRow(b.binding.binding_id);
  assert.equal(before.status, "revoked");
  assert.ok(before.revoked_at && before.revoke_reason && before.revoked_by);

  const r = await resetRevocation(w.users.alice,
    { binding: b.binding.binding_id, reason: "vendor re-confirmed with SSM" });
  assert.equal(r.status, "expired", "the row lands on the estate's terminal status, not deleted");
  const after = await bindingRow(b.binding.binding_id);
  assert.equal(after.status, "expired");
  assert.equal(after.revoked_at, null, "ck_vib_revoked is an equality — the stamp must clear");
  assert.equal(after.revoke_reason, null);
  assert.equal(after.revoked_by, before.revoked_by, "WHO took the authority away stays on the row");

  // THE RECEIPT CARRIES WHAT THE DOOR ERASED. An audit line naming some of what it cleared and
  // not the rest is a summary, not a receipt — and the reason a human ended an authority is
  // exactly what a later reader will want back.
  const audit = (await rootQuery(
    "select args from clara.audit_log where fn='reset_binding_revocation' order by at desc limit 1")).rows[0];
  assert.ok(audit, "the door left an audit row");
  assert.equal(audit.args.binding_id, b.binding.binding_id);
  assert.equal(audit.args.reason, "vendor re-confirmed with SSM");
  assert.equal(audit.args.revoke_reason, "K1 revoke", "…including the revocation's own reason");
  assert.equal(audit.args.revoked_by, before.revoked_by);
  assert.equal(audit.args.prior_status, "revoked");

  // THE COUNT, ON ALL THREE SURFACES, AGAINST THE DB'S OWN ANSWER. The door's return, the audit
  // row and the event payload must each carry the same figure the predicate yields — a receipt
  // that agrees with itself but not with the books is worse than no receipt.
  assert.equal(r.approved_entries, expected, "the door RETURNS the DB-derived count");
  assert.equal(audit.args.approved_entries, expected, "…the audit row carries the same figure");
  // FIND-2(a): and the IN-FLIGHT exposure, which is the half an admin lifting a revocation
  // actually needs — every draft still carrying this marker will meet the post-time re-check.
  // The fixture left exactly one, and the count is read from the DB rather than written as 1.
  const draftsExpected = (await rootQuery(
    "select count(*)::int c from clara.journal_entries where vendor_binding_id=$1 and status='draft'",
    [b.binding.binding_id])).rows[0].c;
  assert.equal(draftsExpected, 1, "control: the fixture left exactly one draft under this binding");
  assert.equal(r.draft_entries, draftsExpected, "the door RETURNS the draft count too");
  assert.equal(audit.args.draft_entries, draftsExpected, "…and the audit row carries it");
  assert.notEqual(draftsExpected, expected,
    "the two counts DIFFER on this fixture (1 vs 2), so neither can be standing in for the other");
  const ev = (await rootQuery(
    `select count(*)::int c, min((payload->>'approved_entries')::int) n
       from clara.domain_events
      where event_type='kb_binding.revocation_reset' and payload->>'binding_id'=$1`,
    [b.binding.binding_id])).rows[0];
  assert.equal(ev.c, 1, "…and one typed event under its OWN name (裁-46: a revocation's undo carries its own name)");
  assert.equal(ev.n, expected, "…whose payload carries that same figure too");
  assert.equal((await rootQuery(
    `select min((payload->>'draft_entries')::int) n from clara.domain_events
      where event_type='kb_binding.revocation_reset' and payload->>'binding_id'=$1`,
    [b.binding.binding_id])).rows[0].n, draftsExpected, "…and the draft count on the event too");

  // TWO MUTANTS, because the two ways this figure can go wrong are different bugs.
  //   (a) a CONSTANT — the shape a cell asserting only `typeof === "number"` cannot see;
  //   (b) the STATUS FILTER dropped — the draft under the same binding starts counting.
  // Each is driven on a SECOND revoked binding built the same way, so the mutant is measured
  // against a fixture whose right answer is known and non-trivial.
  // THE MUTANT FIXTURE CARRIES DIFFERENT CARDINALITIES FROM THE CELL'S OWN (Codex r2 LOW):
  // 3 approved / 2 drafts here versus 2 / 1 above. With matching counts, a `v_posted := 2` or
  // `v_drafts := 1` constant would have passed both — the numbers have to disagree for the
  // constant mutants below to be able to fail.
  const m = await liveBinding("K1m");
  for (const tag of ["K1ma", "K1mb", "K1mc"]) await approve(await boundDraft(m, tag), `bpr3k1m${tag}`);
  for (const tag of ["K1mdraft", "K1mdraft2"]) await boundDraft(m, tag);
  await revoke(w.users.bob, { binding: m.binding.binding_id, reason: "K1m revoke" });
  const APPROVED_COUNT = "select count(*)::int into v_posted\n    from clara.journal_entries where vendor_binding_id = p_binding and status = 'approved';";
  const DRAFT_COUNT = "select count(*)::int into v_drafts\n    from clara.journal_entries where vendor_binding_id = p_binding and status = 'draft';";
  for (const [label, edits, want, wantDrafts] of [
    ["constant-zero", [[APPROVED_COUNT, "v_posted := 0;"]], 0, 2],
    ["constant-two", [[APPROVED_COUNT, "v_posted := 2;"]], 2, 2],
    ["constant-one-draft", [[DRAFT_COUNT, "v_drafts := 1;"]], 3, 1],
    ["no-status-filter", [["where vendor_binding_id = p_binding and status = 'approved';",
      "where vendor_binding_id = p_binding;"]], 5, 2],
    ["no-binding-filter", [[APPROVED_COUNT,
      "select count(*)::int into v_posted\n    from clara.journal_entries where status = 'approved';"]], null, 2],
  ]) {
    await withMutant(RESET_REVOCATION_SIG, edits, async () => {
      const out = await resetRevocation(w.users.alice,
        { binding: m.binding.binding_id, reason: `mutant ${label}`, opKey: opk(`k1m${label.slice(0, 8)}`) });
      if (want === null) {
        // no-binding-filter counts every approved entry in the estate — a number this fixture
        // cannot predict, but it MUST exceed this binding's own 3, which is the discrimination.
        assert.ok(out.approved_entries > 3,
          `${label}: dropping the binding filter must inflate the count past 3 (got ${out.approved_entries})`);
      } else {
        assert.equal(out.approved_entries, want,
          `${label}: the mutant reports ${want} where the truth is 3 — so the assertion above is discriminating`);
      }
      assert.equal(out.draft_entries, wantDrafts,
        `${label}: …and the draft count reads ${wantDrafts} (truth 2)`);
    });
    // Put the row back to 'revoked' so the second mutant starts from the same state.
    await rootQuery(
      "update clara.vendor_identity_bindings set status='revoked', revoked_at=now(), revoke_reason='K1m revoke' where id=$1",
      [m.binding.binding_id]);
  }

  // THE POINT OF THE DOOR: the pair stops being suppressed and can be proposed again.
  assert.equal((await rootQuery("select clara._binding_suppression($1,$2,$3) as s",
    [w.firms.A, w.clients.A1, b.cp.id])).rows[0].s, null, "the pair is no longer suppressed");

  // …and the proposal door now gets PAST the suppression rung. It is asserted that way, on the
  // typed reason, rather than as a bare "proposed" — because THIS cell's own count fixture
  // approved two fresh entries against this vendor TODAY, which collapses the frozen
  // derivation's 14-day/3-distinct-posting-date window. That refusal is the window talking, not
  // the revocation, and a cell that demanded `status==='proposed'` here would be asserting an
  // unrelated fixture property and would break the moment the count fixture changed.
  let reproposeReason = null;
  let reproposed = null;
  try {
    reproposed = await propose(w.users.bob, { client: w.clients.A1, counterparty: b.cp.id });
  } catch (e) {
    reproposeReason = reasonOf(e) ?? e.message;
  }
  assert.ok(reproposed?.status === "proposed"
    || !["binding_revoked", "binding_suppressed", "binding_conflict"].includes(reproposeReason),
  `the lifted pair is proposable again — any refusal must be about the WINDOW, never the revocation (got ${reproposeReason})`);
  // THE POSITIVE CONTROL that keeps the line above from passing vacuously: BEFORE the reset the
  // very same call refuses for the revocation, and that is measured on a pair reset has not
  // touched — the second fixture binding this cell already revoked for its mutants.
  const stillRevoked = await assertRaises("CLR36",
    () => propose(w.users.bob, { client: w.clients.A1, counterparty: m.cp.id }),
    "control: a pair whose revocation was NOT reset still refuses");
  assert.equal(reasonOf(stillRevoked), "binding_revoked");
});

test("bpr3.K2 — the door floors at ADMIN, refuses a blank or over-long reason, and refuses a non-revoked row", async () => {
  failPr3();
  const b = await revokedBinding("K2");
  // FLOOR. carol is a bookkeeper in firm A (buildWorld's roster); the floor is the signer's rank.
  await assertRaises(CLR.authz,
    () => resetRevocation(w.users.carol, { binding: b.binding.binding_id }),
    "a bookkeeper reopening a revocation");
  // REASON MANDATORY, and non-blank after trim — a receipt whose reason is three spaces is not
  // a reason.
  // FIND-1 (#452): single-arg btrim strips SPACES ONLY, so a tab- or newline-only reason used
  // to satisfy "non-blank" and lift a revocation with NOTHING on the receipt. Every shape the
  // reviewer drove is here; the non-space ones are the RED-before cells for that fix.
  for (const blank of ["", "   ", "\t", "\n", "  \t ", "\r\n", "\f", "\v"]) {
    const err = await assertRaises("CLR36",
      () => resetRevocation(w.users.alice, { binding: b.binding.binding_id, reason: blank }),
      `a blank reason (${JSON.stringify(blank)})`);
    assert.equal(reasonOf(err), "reset_reason_required");
  }
  // AND ACCEPTED REASONS SURVIVE BYTE-FOR-BYTE. This is the RED-before cell for Codex r2's HIGH:
  // PostgreSQL's E'' strings have NO `\v` escape and an unknown escape yields the FOLLOWING
  // CHARACTER, so a trim set spelled E' \t\n\r\f\v' contains the LETTER `v` and silently ate a
  // leading or trailing `v` off every reason. A reason that both starts and ends with `v` is the
  // shape that makes that visible, and it is asserted on the AUDIT ROW, not on the return.
  const vReason = "vendor verified by SSM v";
  const vRow = await revokedBinding("K2v");
  await resetRevocation(w.users.alice, { binding: vRow.binding.binding_id, reason: `  ${vReason}  `, opKey: opk("k2v") });
  assert.equal((await rootQuery(
    "select args from clara.audit_log where fn='reset_binding_revocation' order by at desc limit 1")).rows[0].args.reason,
  vReason, "an accepted reason is stored byte-for-byte — the trim set takes whitespace and NOTHING else");

  // AND CAPPED. The reason lands verbatim on an audit row; PR-0's M2 ruled the uncapped shape out.
  await assertRaises(CLR.badRequest,
    () => resetRevocation(w.users.alice, { binding: b.binding.binding_id, reason: "x".repeat(4001) }),
    "a 4001-character reason");
  // …and the cap counts CHARACTERS, not bytes. A 4 000-character MULTIBYTE reason is ACCEPTED;
  // a `>= 4000` off-by-one or an octet_length() regression would red here. Its byte length is
  // asserted to be larger, so the cell cannot pass by the two measures coinciding.
  const wide = "漢".repeat(4000);
  const wideRow = await revokedBinding("K2wide");
  const wideOut = await resetRevocation(w.users.alice,
    { binding: wideRow.binding.binding_id, reason: wide, opKey: opk("k2wide") });
  assert.equal(wideOut.status, "expired", "4 000 CHARACTERS is accepted at the boundary");
  const wideMeasured = (await rootQuery(
    `select length(args->>'reason') c, octet_length(args->>'reason') b
       from clara.audit_log where fn='reset_binding_revocation' order by at desc limit 1`)).rows[0];
  assert.equal(wideMeasured.c, 4000, "…stored at its full 4 000 characters");
  assert.ok(wideMeasured.b > 4000,
    `…and it really is multibyte (${wideMeasured.b} bytes), so length() and octet_length() disagree here`);
  assert.equal((await bindingRow(b.binding.binding_id)).status, "revoked",
    "…and none of those refusals moved the row");

  // NON-REVOKED refuses: this door re-opens a revocation and nothing else.
  const liveOne = await liveBinding("K2live");
  const e1 = await assertRaises("CLR36",
    () => resetRevocation(w.users.alice, { binding: liveOne.binding.binding_id }),
    "reopening a LIVE binding");
  assert.equal(reasonOf(e1), "binding_not_revoked");
  // …and a DECLINED row too — that one has its own named door.
  const cp3 = await seedPassingWindow(w, "K2dec");
  const p3 = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp3.id });
  await declineBinding(w.users.alice, { binding: p3.binding_id, reason: "not this vendor" });
  const e2 = await assertRaises("CLR36",
    () => resetRevocation(w.users.alice, { binding: p3.binding_id }), "reopening a DECLINED binding");
  assert.equal(reasonOf(e2), "binding_not_revoked");
  // …and the sibling still refuses the revoked one, verbatim (M-11 is untouched by 裁-46).
  const e3 = await assertRaises("CLR36",
    () => resetDecline(w.users.alice, { binding: b.binding.binding_id, reason: "wrong door" }),
    "reset_binding_decline on a revoked row");
  assert.equal(reasonOf(e3), "binding_revoked_reset_requires_ruling");
});

test("bpr3.K4 — a LIFTED revocation is never narrated as a clock expiry at post time", async () => {
  failPr3();
  // FIND-2 (#452 native review, RULED). 裁-46 lands a reset revocation on `expired` deliberately,
  // which makes it INDISTINGUISHABLE from a clock expiry by status alone — so the annotation on a
  // still-bound entry approved afterwards would have told a human "the binding had expired" when
  // what actually happened is that an admin took the authority away and another gave it back.
  // Same posting behaviour (O3: annotate, do not strand); different, honest words.
  const b = await liveBinding("K4");
  const d = await boundDraft(b, "K4");                       // drafted while the binding was LIVE
  await revoke(w.users.bob, { binding: b.binding.binding_id, reason: "K4 revoke" });
  await resetRevocation(w.users.alice,
    { binding: b.binding.binding_id, reason: "vendor re-confirmed", opKey: opk("k4reset") });
  const lifted = await bindingRow(b.binding.binding_id);
  assert.equal(lifted.status, "expired", "control: the lifted row lands on `expired`, as 裁-46 rules");
  assert.equal(lifted.revoked_at, null);
  assert.ok(lifted.revoked_by, "…and it is exactly the fingerprint: cleared stamp, KEPT actor");

  const r = await approve(d, "bpr3k4");
  assert.equal(r.status, "approved", "the entry still POSTS — this is an annotation, not a wall");
  assert.equal(r.binding_post_check?.code, "binding_revocation_lifted_at_post",
    "…and the receipt says a revocation was lifted, NEVER that a clock ran out");
  assert.match(r.binding_post_check.message, /REVOKED/,
    "…in words a human reads, not only a code");
  assert.equal(r.binding_post_check.revoked_by, lifted.revoked_by,
    "…naming who took the authority away");
  const res = await postResolution(d.entry);
  assert.equal(res.outcome, "divergence");
  assert.equal(res.refusal_reason, "binding_revocation_lifted",
    "the resolution ledger records the distinct reason too");

  // THE POSITIVE CONTROL, without which this cell could pass on a door that says
  // "revocation lifted" for every annotated post: a genuinely expired binding — never revoked —
  // still says EXPIRED.
  const plain = await liveBinding("K4plain");
  const pd = await boundDraft(plain, "K4plain");
  await expireBinding(plain.binding.binding_id);
  assert.equal((await bindingRow(plain.binding.binding_id)).revoked_by, null,
    "control: this one was never revoked");
  const pr = await approve(pd, "bpr3k4plain");
  assert.equal(pr.status, "approved");
  assert.equal(pr.binding_post_check?.code, "binding_expired_at_post",
    "a plain expiry keeps its own code — the two states stay distinguishable in both directions");
  assert.equal((await postResolution(pd.entry)).refusal_reason, "binding_expired");

  // THE MUTANT: blind the fingerprint and the lifted revocation is narrated as a clock expiry
  // again — which is precisely the misreport this cell exists to prevent.
  const m2 = await liveBinding("K4m");
  const md = await boundDraft(m2, "K4m");
  await revoke(w.users.bob, { binding: m2.binding.binding_id, reason: "K4m revoke" });
  await resetRevocation(w.users.alice,
    { binding: m2.binding.binding_id, reason: "re-confirmed", opKey: opk("k4mreset") });
  await withMutant(APPROVE_CORE_SIG,
    [["    v_pt_lifted := (v_pt_b.status='expired'\n                    and v_pt_b.revoked_at is null and v_pt_b.revoked_by is not null);",
      "    v_pt_lifted := false;"]],
    async () => {
      const out = await approve(md, "bpr3k4m");
      assert.equal(out.binding_post_check?.code, "binding_expired_at_post",
        "with the fingerprint blinded the lifted revocation reads as a plain expiry — the wall is that predicate");
    });
});

test("bpr3.K3 — the door is firm-scoped, idempotent, and EXECUTE-able by clara_authenticated alone", async () => {
  failPr3();
  const b = await revokedBinding("K3");
  // NO EXISTENCE ORACLE: a firm-B admin gets not-found, never a typed refusal that would confirm
  // the row exists somewhere.
  await assertRaises(CLR.notFound,
    () => resetRevocation(w.users.dave, { binding: b.binding.binding_id }),
    "a firm-B admin reopening firm A's revocation");
  assert.equal((await bindingRow(b.binding.binding_id)).status, "revoked", "…and it did not move");

  // IDEMPOTENCY: the same op key replays its own answer rather than double-auditing the act.
  const key = opk("k3reset");
  const first = await resetRevocation(w.users.alice,
    { binding: b.binding.binding_id, reason: "re-confirmed", opKey: key });
  const replay = await resetRevocation(w.users.alice,
    { binding: b.binding.binding_id, reason: "re-confirmed", opKey: key });
  assert.deepEqual(replay, first, "a retried RPC replays its answer");
  const n = (await rootQuery(
    "select count(*)::int c from clara.audit_log where fn='reset_binding_revocation' and args->>'binding_id'=$1",
    [b.binding.binding_id])).rows[0].c;
  assert.equal(n, 1, "…and audits the act exactly once");

  // ACL, read from the catalog rather than from the migration's GRANT line.
  assert.equal((await rootQuery(
    "select has_function_privilege('clara_authenticated',$1,'execute') as ok", [RESET_REVOCATION_SIG])).rows[0].ok,
  true, "clara_authenticated holds EXECUTE");
  for (const role of ["clara_agent_ro", "clara_wake_filing", "clara_wake_interactive",
    "clara_wake_bank", "clara_wake_proactive", "clara_freeform_ro", "public"]) {
    assert.equal((await rootQuery(
      "select has_function_privilege($2,$1,'execute') as ok", [RESET_REVOCATION_SIG, role])).rows[0].ok,
    false, `${role} must NOT hold EXECUTE on the 裁-46 door`);
  }
  // …and the agent-read role cannot reach it even through its own login role.
  await assertRaises(PG.insufficientPrivilege,
    () => roleQuery(ROLES.agentRo, `select ${RESET_REVOCATION_SIG.replace(/\(.*/, "")}($1,$2,$3)`,
      [b.binding.binding_id, "probe", opk("k3acl")]),
    "clara_agent_ro calling the door directly");
  noteLane("bpr3.K3: the 裁-46 door's frontend home is the admin / vendor-bindings panel, on a revoked row's admin menu (the P4/P6 train)");
});
