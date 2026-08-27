// F-A4 PR-2a -- Annex A, WRAPPER 12's ladder: the op-key discipline and receipt honesty under
// multiplicity (W13-W16), F2's three walls (W39, W40), pre-rung (a) as a construction invariant
// (W38), and the closed-world proof that the agent can never sign (W5).
//
// Every acted path here runs through a REAL clara_wake_interactive session, so a missing grant or
// an argument-name mismatch is a finding rather than something a direct core call would smooth over.

import test, { before } from "node:test";
import assert from "node:assert/strict";
import { noteLane } from "./rig-runtime-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import { humanQuery } from "./rig-helpers.mjs";
import {
  ensurePrepay, prepayGate, prepaidScene, recordPeriod, rootQuery, wake12, caught,
  receiptsForTask, templateById, derivedOpKey, VERB12, uniq, account, MODEL,
} from "./f-a4-pr2a-fixtures.mjs";

let skipped = 0;
const markSkip = () => { skipped += 1; };
before(async () => { await ensurePrepay(noteLane); });

const PERIOD = { start: "2025-02-01", end: "2025-04-30" };

/** A second document + approved prepaid entry on the SAME client, so two source entries can be
 *  driven inside ONE wake task -- the multiplicity W14 is about. */
async function secondEntry(sc, { cents = 90000 } = {}) {
  const { seedVerifiedDocument, fileDocument } = await import("./rig-docs-fixtures.mjs");
  const { draftEntryV3, approveEntry } = await import("./wave-a-reads.mjs");
  const { freshResolution, opk } = await import("./wave-a-fixtures.mjs");
  const doc = await seedVerifiedDocument({ firm: sc.firm, client: null, filename: `p2-${uniq()}.pdf` });
  await fileDocument(sc.alice, { document: doc.documentId, client: sc.client, opKey: opk("fa4p2a-file2") });
  const d = await draftEntryV3(sc.alice, {
    client: sc.client,
    resolution: await freshResolution(sc.alice, sc.client,
      { subjectKind: "document", subjectId: doc.documentId }),
    memo: `second prepaid ${uniq()}`, postingDate: "2025-01-16",
    document: doc.documentId, sha256: doc.sha256,
    lines: [
      { account_code: sc.prepaid, debit_cents: cents, credit_cents: 0, description: "prepaid" },
      { account_code: "170-C56", debit_cents: 0, credit_cents: cents, description: "paid" },
    ],
    opKey: opk("fa4p2a-draft2"),
  });
  await approveEntry(sc.bob, { entry: d.entry_id, expectedRevision: d.revision_token,
    opKey: opk("fa4p2a-appr2") });
  return { document: doc.documentId, entry: d.entry_id, cents };
}

// ---------------------------------------------------------------------------------------------
// W13 -- the op-key discipline.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W13 a caller-MINTED op key is refused, and a retry of the same act REPLAYS", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // TWO SCENES, deliberately. The forged-key attempt raises at Tier A, and a raise inside a wake
  // session is not free of consequence for that session -- driving the replay arm in the same one
  // measured the aftermath of the refusal rather than the replay. Separate sessions keep each arm
  // about the thing it names.
  const forgedScene = await prepaidScene("w13f");
  await recordPeriod(forgedScene.alice, { document: forgedScene.document, ...PERIOD });
  const forged = await caught(() => wake12(forgedScene.s,
    { client: forgedScene.client, entry: forgedScene.entry, target: forgedScene.target,
      opKey: "not-a-derived-key" }));
  assert.ok(forged, "a hand-minted op key was accepted -- the derivation is not being enforced");
  assert.match(String(forged.detail ?? forged.message), /op_key_not_derived|CLR10|derived/i);

  const sc = await prepaidScene("w13");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const first = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(first.status, "acted", `expected an act, got ${JSON.stringify(first).slice(0, 300)}`);

  // ARM 1 -- THE OWN-KEY RETRY REPLAYS (D-25 / cell B-11), per the conductor's 2026-08-27 ruling
  // recorded at design §13.2. This build's first cut asked pre-rung (b) unconditionally, so the
  // rung fired on the lane's OWN prior act and an idempotent retry read `refused` while naming the
  // template that very task had just drafted -- nothing double-drafted, but the ANSWER dishonest,
  // which is the class FIX-1 spent a fix round killing. The self-twin is now excluded by the
  // delegate's own sub-key.
  const again = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(again.status, "acted",
    `a same-task retry must REPLAY the stored outcome, got ${JSON.stringify(again).slice(0, 300)}`);
  assert.equal(again.template_id, first.template_id, "the replay returned a DIFFERENT template");
  assert.equal(again.receipt_id, first.receipt_id,
    "the replay minted a second receipt -- a retry must hand back the stored one");
  const drafted = await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where client_id=$1", [sc.client]);
  assert.equal(drafted.rows[0].n, 1, "the retry drafted a SECOND template");
});

// ---------------------------------------------------------------------------------------------
// W14 / W15 -- RECEIPT HONESTY UNDER MULTIPLICITY. FIX-1's defect, re-opened by a subject too
// coarse to tell two acts apart.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W13-movedworld (C2) the own-key replay survives the world MOVING under it", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The self-twin exclusion alone did not deliver D-25's replay contract, because it lived AFTER
  // every mutable rung. Deactivate the judged expense account after the act and retry the same
  // key: F2 wall 1 would refuse `prepayment_target_ineligible` and the lane would read a FRESH
  // REFUSAL for work that already succeeded. The world moved; the answer to a retry must not.
  const sc = await prepaidScene("w13mw");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const first = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(first.status, "acted", `first act refused: ${JSON.stringify(first).slice(0, 250)}`);

  // MOVE THE WORLD: the chosen account goes inactive, which is exactly what wall 1 reads.
  await rootQuery(
    "update clara.coa_accounts set is_active = false where client_id = $1 and account_code = $2",
    [sc.client, sc.target]);
  const breach = await rootQuery(
    "select clara._adj_line_eligibility_breach($1, $2::jsonb) as b",
    [sc.client, JSON.stringify([{ account_code: sc.target, debit_cents: 1, credit_cents: 0 }])]);
  assert.ok(breach.rows[0].b, "the account is still eligible -- the world did not actually move");

  const replay = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(replay.status, "acted",
    `the retry read a fresh refusal after the world moved: ${JSON.stringify(replay).slice(0, 300)}`);
  assert.equal(replay.template_id, first.template_id, "the replay returned a different template");
  assert.equal(replay.receipt_id, first.receipt_id, "the replay minted a second receipt");
  assert.equal(replay.replayed, true, "the replay did not identify itself as one");

  const drafted = await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where client_id=$1", [sc.client]);
  assert.equal(drafted.rows[0].n, 1, "the replay drafted a second template");
});

test("fa4p2a.W13-changedargs (C2) the SAME key with a DIFFERENT judged account is an op-key reuse refusal", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The other half of the replay contract: a retry that quietly re-judges the account is a
  // DIFFERENT act wearing the first one's key, and the estate answers that with a reuse refusal
  // rather than silently replaying the old answer or silently acting on the new one.
  const sc = await prepaidScene("w13ca");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const first = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(first.status, "acted");
  const other = await account(sc.alice, {
    client: sc.client, code: "59000002", name: "Other expense", type: "expense" });
  const e = await caught(() => wake12(sc.s, { client: sc.client, entry: sc.entry, target: other }));
  assert.ok(e, "the same key with a different account was accepted");
  assert.match(String(e.detail ?? e.message), /op_key_reused_with_different_args|reused with different args/);
  const drafted = await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where client_id=$1", [sc.client]);
  assert.equal(drafted.rows[0].n, 1, "the refused retry drafted a template anyway");
});

test("fa4p2a.W13-basischanged (P2) a changed BASIS under the same key is an op-key reuse refusal, not a silent replay", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The identity comparison used to cover only the target ACCOUNT, so a retry supplying different
  // GROUNDS for the same account replayed silently -- and the basis is not incidental: it is the
  // stated grounds of a judgement, durable receipt content that F2 wall 2 exists to carry.
  // Answering that retry with the first act's receipt would record grounds nobody gave.
  const sc = await prepaidScene("w13bc");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const first = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(first.status, "acted");

  const e = await caught(() => wake12(sc.s, {
    client: sc.client, entry: sc.entry, target: sc.target,
    basis: "a DIFFERENT justification for the very same account" }));
  assert.ok(e, "a changed basis under the same key replayed silently");
  assert.match(String(e.detail ?? e.message), /op_key_reused_with_different_args|reused with different args/);

  // AND A CHANGED MODEL likewise -- law 79's triple is part of what the receipt records. Asserted
  // BY TOKEN, not by "some error was raised": this arm drives a wake session that can refuse for a
  // dozen unrelated reasons, and an assertion that any of them satisfies proves nothing about the
  // wall it names. (It read `assert.ok(m)` until 2026-08-28.)
  const m = await caught(() => wake12(sc.s, {
    client: sc.client, entry: sc.entry, target: sc.target,
    model: { name: "some-other-model", version: "9.9" } }));
  assert.ok(m, "a changed model triple under the same key replayed silently");
  assert.match(String(m.detail ?? m.message), /op_key_reused_with_different_args/,
    `a changed model must refuse as an op-key REUSE, got ${String(m.detail ?? m.message).slice(0, 250)}`);

  // POSITIVE CONTROL: the IDENTICAL request still replays, so the widened identity did not turn
  // every retry into a refusal.
  const same = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(same.status, "acted");
  assert.equal(same.replayed, true, "the identical retry stopped replaying");
  assert.equal(same.receipt_id, first.receipt_id);
});

// ---------------------------------------------------------------------------------------------
// W45 -- THE REPLAY IDENTITY RIDES AN INJECTIVE, TRANSFORM-STABLE ENCODING, NEVER A DISPLAY
// STRING. Four arms, because the display-string identity failed in BOTH directions and a fix that
// only closes one of them is not a fix:
//   (a) a rationale-only change still refuses TYPED -- the digest covers the whole request;
//   (b) a delimiter-STRADDLING pair refuses, where the old composition made the two requests
//       byte-identical and the second one replayed SILENTLY (a false ACCEPT);
//   (c) a NEAR-CEILING rationale acts and its identical retry REPLAYS, where the old comparison
//       compared a full string against the receipt's left(...,4000) copy and false-REFUSED;
//   (d) the identical-request control stays green (also held in W13-basischanged).
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W45 a rationale-only change under the same key refuses TYPED as an op-key reuse", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w45a");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const first = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(first.status, "acted");

  const e = await caught(() => wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target,
    rationale: "a DIFFERENT rationale for the very same account and the very same grounds" }));
  assert.ok(e, "a changed rationale under the same key replayed silently");
  assert.match(String(e.detail ?? e.message), /op_key_reused_with_different_args/,
    `expected the typed reuse token, got ${String(e.detail ?? e.message).slice(0, 250)}`);
  const drafted = await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where client_id=$1", [sc.client]);
  assert.equal(drafted.rows[0].n, 1, "the refused retry drafted a template anyway");
});

test("fa4p2a.W45-straddle a delimiter-STRADDLING pair refuses -- the identity is injective", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // THE FALSE-ACCEPT ARM, and it is the dangerous one: a refusal is loud, a silent replay is not.
  // The old identity was the receipt's composed rationale,
  //     rationale || ' | target account ' || account || ': ' || basis,
  // whose join characters can occur INSIDE the fields it joins. So this pair, on ONE account:
  //     r1 = X                                  b1 = Y | target account <acct>: Z
  //     r2 = X | target account <acct>: Y        b2 = Z
  // composes to IDENTICAL bytes while being two different requests -- different stated grounds,
  // different rationale. Under the old comparison the second one replayed the first one's receipt
  // and recorded grounds nobody gave.
  const sc = await prepaidScene("w45s");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const A = sc.target;
  const r1 = "X";
  const b1 = `Y | target account ${A}: Z`;
  const r2 = `X | target account ${A}: Y`;
  const b2 = "Z";

  // THE MUTANT, run FIRST and in the DB itself: prove the pair actually collides under the old
  // encoding and does NOT under the shipped one. Without this the cell would pass against an
  // identity that never had the defect, and would be measuring nothing. (Law 2: the collision is
  // asserted from what a read SAW, not from arithmetic done in the test's head.)
  const enc = await rootQuery(
    `select ($1::text || ' | target account ' || $5::text || ': ' || $2::text)
          = ($3::text || ' | target account ' || $5::text || ': ' || $4::text) as old_collides,
            encode(sha256(convert_to(jsonb_build_array($5::text, $2::text, $1::text, 'm', 'v')::text, 'UTF8')), 'hex')
          = encode(sha256(convert_to(jsonb_build_array($5::text, $4::text, $3::text, 'm', 'v')::text, 'UTF8')), 'hex') as new_collides`,
    [r1, b1, r2, b2, A]);
  assert.equal(enc.rows[0].old_collides, true,
    "the straddling pair does NOT collide under the old composition -- this cell is not testing the defect");
  assert.equal(enc.rows[0].new_collides, false,
    "the straddling pair COLLIDES under the shipped digest -- the encoding is not injective");

  const first = await wake12(sc.s,
    { client: sc.client, entry: sc.entry, target: A, rationale: r1, basis: b1 });
  assert.equal(first.status, "acted", `first act refused: ${JSON.stringify(first).slice(0, 250)}`);

  const e = await caught(() => wake12(sc.s,
    { client: sc.client, entry: sc.entry, target: A, rationale: r2, basis: b2 }));
  assert.ok(e, "the straddling twin REPLAYED SILENTLY -- a different request wore the first one's receipt");
  assert.match(String(e.detail ?? e.message), /op_key_reused_with_different_args/,
    `expected the typed reuse token, got ${String(e.detail ?? e.message).slice(0, 250)}`);

  // AND THE DIGESTS ARE WHAT SEPARATED THEM: the stored one is the FIRST request's, unchanged.
  const stored = await templateById(first.template_id);
  const expect = await rootQuery(
    `select encode(sha256(convert_to(jsonb_build_array($1::text, $2::text, $3::text, $4::text,
       $5::text)::text, 'UTF8')), 'hex') as d`,
    [A, b1, r1, MODEL.name, MODEL.version]);
  assert.equal(stored.proposed_request_digest, expect.rows[0].d,
    "the persisted digest is not the digest of the request that was acted on");
});

test("fa4p2a.W45-ceiling a NEAR-CEILING rationale acts, and its identical retry REPLAYS", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // THE FALSE-REFUSE ARM. B2 bounds the RAW rationale at 4000 (0138:1433) but the receipt stores
  // the COMPOSED one through left(..., 4000) (0138:1366). So a rationale near the ceiling was
  // stored truncated, and every replay compared a full string against a shortened one and refused
  // work that had already succeeded -- fail-closed, but it broke the very idempotency this path
  // exists to provide. The digest is fixed-width: no storage transform can shorten it.
  const sc = await prepaidScene("w45c");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const long = `near-ceiling ${"r".repeat(3970)}`;
  assert.ok(long.length <= 4000 && long.length + 30 > 4000,
    `the fixture must sit UNDER B2's bound and OVER it once composed, got ${long.length}`);

  const first = await wake12(sc.s,
    { client: sc.client, entry: sc.entry, target: sc.target, rationale: long });
  assert.equal(first.status, "acted", `a lawful near-ceiling rationale refused: ${JSON.stringify(first).slice(0, 250)}`);

  // THE RECEIPT REALLY IS TRUNCATED -- measured, not assumed. This is what made the old comparison
  // false-refuse, and it is still true: the fix moved the IDENTITY off it, it did not remove it.
  const rec = await rootQuery(
    "select length(rationale) as n from clara.agent_act_receipts where id = $1", [first.receipt_id]);
  assert.equal(rec.rows[0].n, 4000, "the composed rationale was not stored at the truncation ceiling");

  const again = await wake12(sc.s,
    { client: sc.client, entry: sc.entry, target: sc.target, rationale: long });
  assert.equal(again.status, "acted",
    `the identical retry of a near-ceiling request refused: ${JSON.stringify(again).slice(0, 300)}`);
  assert.equal(again.replayed, true, "the identical retry did not replay");
  assert.equal(again.receipt_id, first.receipt_id, "the replay minted a second receipt");
  const drafted = await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where client_id=$1", [sc.client]);
  assert.equal(drafted.rows[0].n, 1, "the replay drafted a second template");
});

test("fa4p2a.W45-nulldigest a twin carrying NO digest is REFUSED, never replayed", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // THE MIGRATION-DAY POPULATION, and a security argument, in one cell. Every template standing on
  // the estate the day this applies carries `proposed_request_digest IS NULL` -- the column is new.
  // The replay comparison is `is distinct from`, so NULL refuses; that was argued in the source and
  // Codex was right that a source read is not a measurement.
  //
  // ARM 1 -- BUILT THROUGH A GOVERNED DOOR, because the shape is reachable through one. The human
  // door takes p_op_key, so a bookkeeper can propose a template stamped with the agent's own
  // delegate sub-key. That is the FORGED-TWIN case the door-narrowing argument turns on (it is why
  // the digest is NOT the human door's to set), and it is also exactly a pre-migration row's shape:
  // sub-key present, digest NULL. The estate's answer must be a typed, fail-closed refusal.
  const sc = await prepaidScene("w45n");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const sub = `${derivedOpKey(sc.s.task, VERB12, sc.client)}:${sc.entry}`;
  const lines = [
    { account_code: sc.target, debit_cents: 100, credit_cents: 0, description: "d" },
    { account_code: sc.prepaid, debit_cents: 0, credit_cents: 100, description: "c" }];
  const planted = await humanQuery(sc.alice,
    `select clara.propose_adjustment_template($1::uuid,$2,'monthly',date '2025-02-01',
       date '2025-02-28',false,$3::jsonb,'m',$4) as r`,
    [sc.client, `w45n-${uniq()}`, JSON.stringify(lines), sub]);
  const twin = planted.rows[0].r?.template_id;
  assert.ok(twin, "the human proposal did not land -- the fixture, not the wall, is broken");
  const row = await templateById(twin);
  assert.equal(row.proposed_op_key, sub, "the planted twin does not carry the agent's sub-key");
  assert.equal(row.proposed_request_digest, null,
    "a HUMAN proposal carried a request digest -- the door was widened after all");

  const e = await caught(() => wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target }));
  assert.ok(e, "a twin with no digest and no acted receipt was REPLAYED -- a forged twin answered for the agent");
  assert.match(String(e.detail ?? e.message), /prepayment_replay_receipt_absent/,
    `expected the typed receipt-absent refusal, got ${String(e.detail ?? e.message).slice(0, 250)}`);
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where client_id=$1", [sc.client])).rows[0].n,
    1, "the refused call drafted a second template");

  // ARM 2 -- THE DIGEST COMPARISON ITSELF, which arm 1 never reaches: the receipt-absent wall fires
  // first, and it fires first BY DESIGN (a replay with no acted receipt is not a replay). To reach
  // the NULL-digest branch a twin needs an ACTED receipt it could never lawfully have -- no
  // pre-migration row can carry a `prepayment_schedule` receipt, because this file mints the verb.
  // So the receipt is PLANTED as root, past the door, and the cell says so: this branch is
  // DEFENSIVE, unreachable through any governed path, and that is precisely why it is worth pinning
  // -- a defensive branch nobody drives is a branch nobody notices rotting.
  const sc2 = await prepaidScene("w45n2");
  await recordPeriod(sc2.alice, { document: sc2.document, ...PERIOD });
  const sub2 = `${derivedOpKey(sc2.s.task, VERB12, sc2.client)}:${sc2.entry}`;
  const lines2 = [
    { account_code: sc2.target, debit_cents: 100, credit_cents: 0, description: "d" },
    { account_code: sc2.prepaid, debit_cents: 0, credit_cents: 100, description: "c" }];
  const planted2 = await humanQuery(sc2.alice,
    `select clara.propose_adjustment_template($1::uuid,$2,'monthly',date '2025-02-01',
       date '2025-02-28',false,$3::jsonb,'m',$4) as r`,
    [sc2.client, `w45n2-${uniq()}`, JSON.stringify(lines2), sub2]);
  const twin2 = planted2.rows[0].r?.template_id;
  await rootQuery(
    `insert into clara.agent_act_receipts (firm_id, client_id, act_kind, subject_kind, subject_id,
        acting_actor, via_wake_kind, wake_task_id, model_name, model_version, rationale, verdict,
        op_key)
     values ($1::uuid, $2::uuid, 'prepayment_schedule', 'adjustment_template', $3::uuid,
        $4::uuid, 'close_prep', $5::uuid, $6, $7, 'planted: a receipt no lawful path could write',
        'acted', $8)`,
    [sc2.firm, sc2.client, twin2, sc2.alice, sc2.s.task, MODEL.name, MODEL.version, sub2]);

  const e2 = await caught(() => wake12(sc2.s, { client: sc2.client, entry: sc2.entry, target: sc2.target }));
  assert.ok(e2, "a twin whose stored digest is NULL was REPLAYED -- `is distinct from` is not doing its work");
  assert.match(String(e2.detail ?? e2.message), /op_key_reused_with_different_args/,
    `expected the typed reuse refusal on the NULL digest, got ${String(e2.detail ?? e2.message).slice(0, 250)}`);
  // AND THE REFUSAL NAMES THE NULL, so a reader of the detail can tell this apart from a mismatch.
  assert.match(String(e2.detail ?? e2.message), /stored_request_digest/,
    "the refusal detail does not carry the stored digest, so a NULL reads like any other mismatch");
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where client_id=$1", [sc2.client])).rows[0].n,
    1, "the refused call drafted a second template");
});

test("fa4p2a.W45-frozen the persisted digest is IMMUTABLE -- an identity a signer could rewrite is not one", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The column is worth nothing without this. §TAIL's T.12b proves the NAME is absent from the
  // transition trigger's exemption array; that is a spelling instrument, and spelling is not
  // identity (review law 3). This is the behavioural half: the storage layer itself refuses.
  const sc = await prepaidScene("w45f");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const first = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(first.status, "acted");
  const before = (await templateById(first.template_id)).proposed_request_digest;
  // 64 HEX CHARACTERS, ASSERTED EXACTLY. This is where the sha256 swap is measured on a value the
  // verb actually WROTE, rather than read off the source: an md5 regression would land here at 32
  // and this cell would red. A loose /^[0-9a-f]+$/ would have accepted either, which is why the
  // length is pinned rather than the alphabet alone.
  assert.ok(before && /^[0-9a-f]{64}$/.test(before),
    `the persisted digest is not 64 hex characters (sha256): ${before}`);

  // ROOT, deliberately -- the strongest caller in the estate, so the refusal is the TRIGGER's and
  // not a missing grant's. withTxn because a raise inside the pooled session would otherwise
  // poison it for the post-check read.
  const e = await caught(() => withTxn(async (c) => {
    await c.query("update clara.adjustment_templates set proposed_request_digest = $1 where id = $2",
      ["0".repeat(64), first.template_id]);
  }));
  assert.ok(e, "the replay identity was REWRITTEN in place -- a later signer could redirect a replay");
  assert.match(String(e.detail ?? e.message), /adjustment_template_immutable|immutable outside/,
    `expected the transition trigger's immutability refusal, got ${String(e.detail ?? e.message).slice(0, 250)}`);
  const after = (await templateById(first.template_id)).proposed_request_digest;
  assert.equal(after, before, "the digest moved despite the refusal");
});

test("fa4p2a.W13-granularity (C3) an amount smaller than its period count refuses TYPED, with a receipt", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // One cent over two months truncates to a base of 0, so the representative flat lines go
  // zero-sided and the delegate would raise a RAW CLR10 -- aborting the transaction and taking the
  // receipt with it, leaving no trace of WHY the lane could not act. It must be a typed rung.
  const sc = await prepaidScene("w13g", { cents: 1 });
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-03-31" });
  const r = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(r.status, "refused", `expected a typed refusal, got ${JSON.stringify(r).slice(0, 250)}`);
  const toks = (r.rung_vector ?? []).map((v) => v.token);
  assert.ok(toks.includes("prepayment_amount_below_period_granularity"),
    `expected prepayment_amount_below_period_granularity, got ${toks.join(",")}`);
  // THE RECEIPT SURVIVES -- which is the whole point of making it a rung rather than a raise.
  const rows = await receiptsForTask(sc.s.task);
  const mine = rows.filter((x) => x.act_kind === "prepayment_schedule" && x.verdict === "refused");
  assert.equal(mine.length, 1, "the typed refusal left no receipt");
  assert.equal(mine[0].subject_id, sc.entry, "the refusal receipt does not name its source entry");

  // MUTANT / positive control: an amount that DOES reach its granularity acts, so the rung is
  // conditional and not a blanket refusal of small prepayments.
  const ok = await prepaidScene("w13gok", { cents: 200 });
  await recordPeriod(ok.alice, { document: ok.document, start: "2025-02-01", end: "2025-03-31" });
  const acted = await wake12(ok.s, { client: ok.client, entry: ok.entry, target: ok.target });
  assert.equal(acted.status, "acted", `200 cents over 2 months must act: ${JSON.stringify(acted).slice(0, 250)}`);
});

test("fa4p2a.W13-arm2 a FOREIGN task's duplicate still meets pre-rung (b), named with the twin's id", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // THE OTHER HALF of §13.2's ruling, and the arm §6.2a was written for: the lane drafted this
  // schedule in an EARLIER pass, nobody signed it, and today's pass must REFUSE with the twin's id
  // rather than abort on the delegate's raise. Excluding the self-twin must not have disarmed it.
  const sc = await prepaidScene("w13b");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const first = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(first.status, "acted");

  // A SECOND clocked session over the same client -- a genuinely different task, so a different
  // derived key and therefore a different delegate sub-key.
  const { mintClosePrepSession } = await import("./f-a4-pr1c-fixtures.mjs");
  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const again = await wake12(s2, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(again.status, "refused",
    `a foreign task's duplicate must refuse, got ${JSON.stringify(again).slice(0, 300)}`);
  assert.deepEqual((again.rung_vector ?? []).map((v) => v.token), ["template_duplicate_pending"]);
  assert.equal(again.rung_vector[0].template_id, first.template_id,
    "the refusal must NAME the standing twin, so the lane can see what already exists");
  const drafted = await rootQuery(
    "select count(*)::int as n from clara.adjustment_templates where client_id=$1", [sc.client]);
  assert.equal(drafted.rows[0].n, 1, "the re-wake drafted a second template instead of refusing");
});

test("fa4p2a.W14 two source entries refusing for the SAME reason in ONE task write TWO receipts with distinct subjects", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // THE REFUSAL IS DRIVEN BY A TASK-LEVEL RUNG, and that choice is the whole point. Annex E names
  // the collision case exactly: "a live hold or an incomplete model triple produces byte-identical
  // vectors for every entry in the pass", because those are conditions of the TASK, not of the
  // entry. An incomplete model triple gives B2 `receipt_incomplete`, whose payload carries nothing
  // entry-specific.
  //
  // MEASURED WHILE WRITING THIS CELL, and worth recording: the B10 no-service-period refusal does
  // NOT collide, because its payload names the entry and its document, so rung_digest already
  // separates the two rows. The subject discrimination is belt-and-braces for that arm. The arm
  // that genuinely needs it is this one -- so this is the arm the cell drives.
  const sc = await prepaidScene("w14");
  const second = await secondEntry(sc);
  const a = await wake12(sc.s,
    { client: sc.client, entry: sc.entry, target: sc.target, model: {} });
  const b = await wake12(sc.s,
    { client: sc.client, entry: second.entry, target: sc.target, model: {} });
  assert.equal(a.status, "refused");
  assert.equal(b.status, "refused");
  assert.notEqual(a.receipt_id, b.receipt_id,
    "the second entry's refusal was answered with the FIRST entry's receipt id -- FIX-1's defect, re-opened");

  const rows = await receiptsForTask(sc.s.task);
  const mine = rows.filter((r) => r.act_kind === "prepayment_schedule" && r.verdict === "refused");
  assert.equal(mine.length, 2, "two refusals, two durable rows");
  assert.deepEqual(mine.map((r) => r.subject_kind), ["journal_entry", "journal_entry"]);
  assert.deepEqual([...new Set(mine.map((r) => r.subject_id))].sort(),
    [sc.entry, second.entry].sort(), "each receipt names ITS OWN entry");
  // And the vectors really are identical -- otherwise rung_digest would have separated them anyway
  // and the cell would prove nothing about the subject.
  assert.equal(mine[0].rung_digest, mine[1].rung_digest,
    "the two refusals differ in their rung vector, so this cell is not exercising the collision it claims");
});

test("fa4p2a.W14-mutant collapsing the subject to the CLIENT reproduces the defect", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // Reproduced against the real uq_aar rather than a scratch build: two rows that differ ONLY in
  // subject_id are what the fix relies on, so making them agree must collide.
  const sc = await prepaidScene("w14m");
  const second = await secondEntry(sc);
  const a = await wake12(sc.s,
    { client: sc.client, entry: sc.entry, target: sc.target, model: {} });
  const b = await wake12(sc.s,
    { client: sc.client, entry: second.entry, target: sc.target, model: {} });
  await withTxn(async (c) => {
    const e = await c.query(
      "update clara.agent_act_receipts set subject_id = $1 where id = $2",
      [sc.client, b.receipt_id]).then(() => null, (err) => err);
    // Whether the collapse is refused by the unique key or by the table's own append-only rule, the
    // point stands: the two rows are kept apart BY THE SUBJECT.
    assert.ok(e, "collapsing the second receipt's subject onto the client was accepted -- nothing keeps the two acts apart");
    assert.ok(["23505", "CLR08", "CLR10"].includes(e.code) || /immutable|append/i.test(String(e.message)),
      `unexpected refusal shape: ${e.code} ${e.message}`);
  }, { commit: false });
  assert.notEqual(a.receipt_id, b.receipt_id);
});

test("fa4p2a.W15 refused-then-ACTED on the same entry in one task gives TWO receipts with honest verdicts", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // FIX-1's regression, extended to this verb: the acted receipt must never be answered with the
  // refused one's id, and the refusal must still be on the table afterwards.
  const sc = await prepaidScene("w15");
  const refused = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(refused.status, "refused", "with no service period this must refuse");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const acted = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(acted.status, "acted", "with the fact recorded the SAME call must act");
  assert.notEqual(acted.receipt_id, refused.receipt_id,
    "the acted call returned the REFUSED receipt's id -- a receipt that lies about its own verdict");

  const rows = await receiptsForTask(sc.s.task);
  const mine = rows.filter((r) => r.act_kind === "prepayment_schedule");
  assert.equal(mine.length, 2, "the refusal must still be on the table -- reverse, never delete");
  assert.deepEqual(mine.map((r) => r.verdict).sort(), ["acted", "refused"]);
  const act = mine.find((r) => r.verdict === "acted");
  assert.equal(act.subject_kind, "adjustment_template", "the ACTED receipt names the template it minted");
  assert.equal(act.subject_id, acted.template_id);
});

test("fa4p2a.W16 subject_kind EXTENDS, it does not loosen", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const def = await rootQuery(
    `select pg_get_constraintdef(c.oid) as d from pg_constraint c
      where c.conrelid='clara.agent_act_receipts'::regclass and c.conname='ck_aar_subject_kind'`);
  const d = def.rows[0].d;
  for (const k of ["client", "fiscal_year", "close_run", "close_receipt", "journal_entry",
                   "snapshot", "adjustment_template"]) {
    assert.match(d, new RegExp(`'${k}'`), `subject_kind no longer admits ${k}`);
  }
  // MUTANT: an UNKNOWN kind still refuses, so the CHECK was extended rather than dropped.
  const e = await caught(() => rootQuery(
    `insert into clara.agent_act_receipts(firm_id, act_kind, subject_kind, subject_id, op_key,
       verdict, acting_actor)
     select firm_id, 'prepayment_schedule', 'not_a_kind', id, 'x', 'refused', id
       from clara.users limit 1`));
  assert.ok(e, "an unknown subject_kind was accepted -- the closed set is no longer closed");
});

// ---------------------------------------------------------------------------------------------
// W39 / W40 -- F2's walls: the account is a JUDGEMENT, and it is validated, receipted and shown.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W39 an INELIGIBLE target refuses; the acted receipt carries the account AND its basis; the sign surface renders both", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w39");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });

  // (1) DETERMINISTIC VALIDATION -- a BANK-class account refuses by the estate's own existing rule.
  const bank = await rootQuery(
    "select coa_account_code from clara.bank_accounts where client_id = $1 limit 1", [sc.client]);
  const bankCode = bank.rows[0]?.coa_account_code ?? "170-C56";
  const ineligible = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: bankCode });
  assert.equal(ineligible.status, "refused");
  const badTokens = (ineligible.rung_vector ?? []).map((v) => v.token);
  assert.ok(badTokens.includes("prepayment_target_ineligible"),
    `expected prepayment_target_ineligible, got ${badTokens.join(",")}`);

  // A NON-EXPENSE account refuses on its own axis: an amortisation charge is an expense, and a
  // balance-sheet target would move the prepayment sideways and never charge it.
  const asset = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.prepaid });
  assert.equal(asset.status, "refused");
  assert.ok((asset.rung_vector ?? []).some((v) => v.axis === "not_expense_class"),
    "a non-expense target was not refused on the expense-class axis");

  // (2) RECEIPTED -- the account and its stated basis ride the acted receipt.
  const acted = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(acted.status, "acted", `expected an act, got ${JSON.stringify(acted).slice(0, 200)}`);
  assert.equal(acted.target_account, sc.target);
  const rows = await receiptsForTask(sc.s.task);
  const act = rows.find((r) => r.verdict === "acted" && r.act_kind === "prepayment_schedule");
  assert.ok(act, "no acted receipt");
  assert.match(act.rationale, new RegExp(sc.target), "the receipt does not name the judged account");
  assert.match(act.rationale, /target account/, "the receipt does not carry the judgement's stated grounds");

  // (3a) VISIBLE at the sign door -- the projection F2 wall 3 needs to be implementable at all.
  const json = await rootQuery("select clara._adj_template_json($1) as j", [acted.template_id]);
  const j = json.rows[0].j;
  assert.ok(Object.hasOwn(j, "schedule"), "_adj_template_json does not project the schedule");
  assert.ok(Array.isArray(j.schedule) && j.schedule.length === 3, "the schedule is not rendered");
  assert.equal(j.target_account, sc.target, "the judged account is not visible at the sign surface");
  assert.deepEqual(j.target_accounts, [sc.target]);

  // MUTANT / positive control: the template really is only PROPOSED, and the sign door is untouched.
  const tmpl = await templateById(acted.template_id);
  assert.equal(tmpl.status, "proposed", "the agent's draft must never be live");
  assert.ok(tmpl.schedule, "the template carries its per-occurrence schedule");
});

test("fa4p2a.W40 the no-plausible-account arm: an absent judgement refuses UNDERIVABLE, not INELIGIBLE", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The distinction matters: `underivable` is the arm for "I could not pick with confidence", and
  // it must never become the default path -- a lane that refused whenever it was unsure would never
  // charge anything, which is over-caution wearing a safety property's clothes.
  const sc = await prepaidScene("w40");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const none = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: "   " });
  assert.equal(none.status, "refused");
  const toks = (none.rung_vector ?? []).map((v) => v.token);
  assert.ok(toks.includes("prepayment_target_underivable"),
    `expected prepayment_target_underivable, got ${toks.join(",")}`);

  // And a MISSING BASIS refuses too -- a judgement with no recorded grounds is what TA-P4 prevents.
  const noBasis = await wake12(sc.s,
    { client: sc.client, entry: sc.entry, target: sc.target, basis: "  " });
  assert.equal(noBasis.status, "refused");
  assert.ok((noBasis.rung_vector ?? []).some((v) => v.axis === "basis_missing"),
    "a judged account with NO stated basis was accepted");

  // MUTANT / positive control: with a plausible account AND its basis the same call ACTS.
  const ok = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(ok.status, "acted", "the refusal is not conditional -- W40 is refusing everything");
});

// ---------------------------------------------------------------------------------------------
// W38 / W5 -- the construction invariant, and the closed-world sign proof.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W38 (F3 pre-rung a) the constructed template start is a PERIOD START for a term beginning on ANY day of a month", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // Under F1's ruled convention monthly IS calendar-month at the bytes, so alignment holds BY
  // CONSTRUCTION and the rung can no longer fire on ordinary caller input. It is kept as a
  // self-check; this cell proves the invariant across every start day rather than one.
  // ONE SCENE PER DAY. The op key derives per (task, verb, client), so re-driving the same verb in
  // one session after the world has moved is refused by _reserve_op as "op_key reused with
  // different args" -- which is the estate being right and my first cut asking the wrong question.
  for (const day of ["01", "02", "15", "28"]) {
    const sc = await prepaidScene(`w38d${day}`);
    await recordPeriod(sc.alice, { document: sc.document, start: `2025-02-${day}`, end: "2025-06-30",
      basis: `term starting on day ${day}` });
    const r = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
    // A POSITIVE CONTROL PER DAY (Codex C6). The earlier form let a refusal `continue` after
    // checking only that it was not template_alignment_unmet -- so a day whose scene failed for an
    // UNRELATED reason (no service period, an ineligible account, a fixture slip) counted as
    // evidence for the invariant while never constructing a template at all. Each day must ACT.
    assert.equal(r.status, "acted",
      `day ${day} did not produce a template, so it proves nothing about alignment: ${JSON.stringify(r).slice(0, 250)}`);
    const tmpl = await templateById(r.template_id);
    const aligned = await rootQuery(
      "select clara._adj_period_start($1,'monthly',$2::date) = $2::date as ok", [sc.client, tmpl.start_date]);
    assert.equal(aligned.rows[0].ok, true,
      `the template built for a day-${day} term does not start on a period start`);
  }
});

test("fa4p2a.W38-mutant a hand-built MISALIGNED start makes the rung fire -- it is live code, not a comment", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w38m");
  const mid = await rootQuery(
    "select clara._adj_period_start($1,'monthly',date '2025-02-15') as ps", [sc.client]);
  assert.notEqual(mid.rows[0].ps.toISOString?.().slice(0, 10) ?? String(mid.rows[0].ps), "2025-02-15",
    "a mid-month date IS a period start on this client -- the mutant cannot discriminate");
  // The delegate itself refuses a misaligned start, which is the structural wall the pre-rung only
  // anticipates (Annex F.3: the pre-rungs are courtesies, not walls).
  const e = await caught(() => rootQuery(
    `select clara._propose_adjustment_template_core(
       jsonb_build_object('firm', $1::uuid, 'actor', (select id from clara.users limit 1)),
       $2::uuid, $3, 'monthly', date '2025-02-15', date '2025-04-30', false,
       $4::jsonb, 'm', $5, null, null)`,
    [sc.firm, sc.client, `w38m-${uniq()}`,
      JSON.stringify([{ account_code: sc.target, debit_cents: 100, credit_cents: 0 },
                      { account_code: sc.prepaid, debit_cents: 0, credit_cents: 100 }]),
      `w38m-${uniq()}`]));
  assert.ok(e, "a misaligned start was accepted by the delegate -- the structural wall is gone");
  assert.match(String(e.detail ?? e.message), /template_fy_stale|alignment|period/i);
});

test("fa4p2a.W5 THE AGENT CAN NEVER SIGN -- a closed-world read, with its ceiling stated", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // THE BINDING HALF IS STRUCTURAL: clara.sign_adjustment_template holds EXECUTE for no wake role.
  const acl = await rootQuery(
    `select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as a
       from pg_proc p where p.oid = to_regprocedure('clara.sign_adjustment_template(uuid,uuid,text)')`);
  assert.doesNotMatch(acl.rows[0].a, /clara_wake_/, "a wake role holds EXECUTE on the signing door");
  assert.doesNotMatch(acl.rows[0].a, /^=|,=/, "the signing door is executable by PUBLIC");
  assert.match(acl.rows[0].a, /clara_authenticated/, "the HUMAN path must stay open");

  // THE PROSRC HALF IS A SPELLING INSTRUMENT, and its ceiling is stated HERE rather than implied:
  // it cannot tell a WRITE of status='live' from a comparison against it, so it is reported and
  // paired with the ACL half above, which is the claim that actually binds (Annex A's own W5 note).
  const writers = await rootQuery(
    `select count(*)::int as n from pg_proc p where p.pronamespace='clara'::regnamespace
       and p.prosrc ~ 'status\\s*=\\s*''live'''`);
  noteLane(`W5: ${writers.rows[0].n} bodies mention status='live' (a spelling scan -- comparisons included; the ACL half is the binding claim)`);

  // And wrapper 12 reaches only the PROPOSE core: its acted answer says `proposed`, every time.
  const sc = await prepaidScene("w5");
  await recordPeriod(sc.alice, { document: sc.document, ...PERIOD });
  const r = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(r.status, "acted");
  assert.equal(r.status_of_template, "proposed");
  const tmpl = await templateById(r.template_id);
  assert.equal(tmpl.status, "proposed");
  assert.equal(tmpl.signed_by, null, "the agent's draft carries a signature");
});

test("fa4p2a.armed-skip the focused run records ZERO skips", async () => {
  assert.equal(skipped, 0,
    `${skipped} cell(s) skipped -- a focused PR-2a run must fail rather than skip`);
  void VERB12; void derivedOpKey;
});
