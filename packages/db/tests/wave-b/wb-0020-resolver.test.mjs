// Wave-B battery — migration 0020 §5: THE DISCRIMINATED doc→client RESOLVER,
// EFFECT-TIME SERIALIZATION and THE RE-DRIVE.
//
// Three properties, each load-bearing for a different reason:
//   (1) the resolver is an AUTHORIZATION surface as much as a lookup — it takes
//       p_firm, releases a client_id ONLY on `unique`, returns NO count, and gives
//       foreign-firm / nonexistent / bytes-unverified / zero-filing inputs the
//       IDENTICAL payload so a caller in firm B cannot learn firm A's topology;
//   (2) uniqueness is re-decided AT EFFECT TIME under locks that exclude every
//       filing-topology transition — a plan-time resolve is not enough, because
//       record_wiki_source_ingest re-checks only that A still has an ACTIVE filing
//       (0017:2238-2242 — verified at source), never that A is still the ONLY one;
//   (3) THE RE-DRIVE is 0020's, not 0019's. 0019's retirement lane marks a retired
//       filing's citations stale; it explicitly does NOT re-resolve the document
//       for the surviving client, and the document.classified event is permanently
//       checkpointed. This is the single genuine coupling between the migrations
//       and the cell that proves 0020 owns it.
// CONTRACT-BLIND; FAILS below 0020.
//
// AMBIGUITIES recorded here:
//   [A20-4]  §5.4's `skipped_unclassified` gate vs §5.3's zero/one/many outcomes:
//            the ORDER is unstated, so a never-classified document with ZERO
//            filings is contract-ambiguous. Only unambiguous inputs are asserted
//            strictly; the ambiguous one is probed and RECORDED.
//   [A20-12] §9.5 says every cross-firm DEFINER probe returns "the single uniform
//            not-found shape", but §5.3's receipt vocabulary for
//            resolve_and_ingest_wiki_source has no `unresolved` member. Asserted
//            as "a skip token, never `projected`, never a client id".
//   [A20-13] §5.3 says the writer's refusals "propagate unchanged" (CLR10/CLR28/
//            CLR02) — i.e. resolve_and_ingest RAISES rather than returning a typed
//            skip. Asserted as a raise; a typed-skip return would be a finding.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, opk, endPool, printLaneNotes, noteLane,
  assertRaises, assertRaisesOneOf, roleCanExecute, fnSource, regProcedure, RUNTIME_FNS,
  fail0020, wbEnsureReady20,
  buildWaveBWorld, createClient, seedOpeningCoa,
  UNRESOLVED, AMBIGUOUS, INGEST_STATUS, sourceSlug,
  resolveDocClient, resolveIngest, classifiedDocument, fileTo, retireFilingFor,
  canonical, keysOf, activeFilingClients, sourcePageVersions,
  opReceiptRow, recordWikiIngest, seedVerifiedDocument, unverifyDocumentBytes,
  raceIngestThenFileB, raceIngestThenRetire,
} from "./wb-0020-helpers.mjs";

let live = false;
let w = null;

async function freshClient(tag) {
  const c = await createClient(w.users.alice, { name: `${w.prefix}_${tag}`, opKey: opk("cli") });
  await seedOpeningCoa(w.users.alice, c);
  return c;
}

before(async () => {
  live = await wbEnsureReady20();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0020-resolver"); await endPool(); });

test("META: 0020 applied — both resolver functions exist with the pinned two-arg (uuid,uuid) signatures", async () => {
  fail0020(live);
  for (const sig of [RUNTIME_FNS.resolve_document_client, RUNTIME_FNS.resolve_and_ingest_wiki_source]) {
    assert.ok(await regProcedure(sig), `${sig} resolves (to_regprocedure, EXACT signature — §10.2)`);
  }
});

// ===========================================================================
// §5.1 — the discriminated read: three shapes, no oracle.
// ===========================================================================

test("[0020 §5.1]: ZERO active filings → {status:'unresolved'}; EXACTLY ONE → {status:'unique',client_id}; TWO OR MORE → {status:'ambiguous'} with NO client_id and NO count", async () => {
  fail0020(live);
  const a = await freshClient("res_a");
  const b = await freshClient("res_b");
  const doc = await classifiedDocument({ firm: w.firms.A });

  const zero = await resolveDocClient({ firm: w.firms.A, document: doc.documentId });
  assert.deepEqual(zero, UNRESOLVED, "no active filing → unresolved");
  assert.deepEqual(keysOf(zero), ["status"], "…with EXACTLY one key");

  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  const one = await resolveDocClient({ firm: w.firms.A, document: doc.documentId });
  assert.deepEqual(keysOf(one), ["client_id", "status"], `unique returns EXACTLY {status,client_id} (got ${JSON.stringify(one)})`);
  assert.equal(one.status, "unique");
  assert.equal(one.client_id, a, "…and it is the one active filing's client");

  await fileTo(w.users.alice, { document: doc.documentId, client: b });
  const many = await resolveDocClient({ firm: w.firms.A, document: doc.documentId });
  assert.deepEqual(many, AMBIGUOUS, `two clients → EXACTLY {status:'ambiguous'} (got ${JSON.stringify(many)})`);
  assert.deepEqual(keysOf(many), ["status"], "…one key: no client_id is EVER released on ambiguous");
  const blob = JSON.stringify(many);
  assert.ok(!blob.includes(a) && !blob.includes(b), "…and no candidate identity leaks");
  assert.ok(!/\b2\b/.test(blob.replace(/ambiguous/g, "")),
    "…and no exact candidate count leaks (§5.1 takes the strictly stronger option: no count at all)");
  assert.equal((await activeFilingClients(doc.documentId)).length, 2, "the topology really is two clients");
});

test("[0020 §5.1 — THE no-oracle cell]: foreign-firm, nonexistent, bytes-UNVERIFIED and zero-active-filing inputs return a BYTE-IDENTICAL unresolved payload — no error, no distinguishable branch", async () => {
  fail0020(live);
  const a = await freshClient("res_uni");
  // (1) zero active filings, in-firm, verified + classified.
  const zeroDoc = await classifiedDocument({ firm: w.firms.A });
  // (2) a FOREIGN-firm document that is uniquely filed IN ITS OWN FIRM — the probe
  //     is from firm A, and it must learn nothing.
  const foreignDoc = await classifiedDocument({ firm: w.firms.B });
  await fileTo(w.users.dave, { document: foreignDoc.documentId, client: w.clients.B1 });
  assert.equal(
    (await resolveDocClient({ firm: w.firms.B, document: foreignDoc.documentId })).status, "unique",
    "the foreign document IS uniquely resolvable in its own firm (so the probe below is a real negative)");
  // (3) a bytes-UNVERIFIED document that IS uniquely filed (the §5.1 ingest floor).
  const unverified = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: unverified.documentId, client: a });
  await unverifyDocumentBytes(unverified.documentId);

  const payloads = {
    zeroFiling: await resolveDocClient({ firm: w.firms.A, document: zeroDoc.documentId }),
    foreignFirm: await resolveDocClient({ firm: w.firms.A, document: foreignDoc.documentId }),
    nonexistent: await resolveDocClient({ firm: w.firms.A, document: "00000000-0000-4000-8000-0000000000ff" }),
    bytesUnverified: await resolveDocClient({ firm: w.firms.A, document: unverified.documentId }),
  };
  const want = canonical(UNRESOLVED);
  for (const [label, got] of Object.entries(payloads)) {
    assert.equal(canonical(got), want,
      `${label}: byte-identical {"status":"unresolved"} (got ${JSON.stringify(got)})`);
  }
  assert.ok(!JSON.stringify(payloads).includes(w.clients.B1),
    "the foreign firm's client identity never leaks to a firm-A caller");
});

test("[0020 §5.1]: a RETIRED filing is not an active filing — retiring one of two collapses ambiguous → unique; retiring the last collapses unique → unresolved", async () => {
  fail0020(live);
  const a = await freshClient("res_ret_a");
  const b = await freshClient("res_ret_b");
  const doc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  await fileTo(w.users.alice, { document: doc.documentId, client: b });
  assert.equal((await resolveDocClient({ firm: w.firms.A, document: doc.documentId })).status, "ambiguous");
  await retireFilingFor(w.users.alice, { document: doc.documentId, client: b });
  const one = await resolveDocClient({ firm: w.firms.A, document: doc.documentId });
  assert.equal(one.status, "unique", "retiring B leaves exactly one active filing");
  assert.equal(one.client_id, a, "…A");
  await retireFilingFor(w.users.alice, { document: doc.documentId, client: a });
  assert.deepEqual(await resolveDocClient({ firm: w.firms.A, document: doc.documentId }), UNRESOLVED,
    "retiring the last filing collapses to unresolved");
});

// ===========================================================================
// §5.3 — one serialized operation: resolve + ingest through the audited writer.
// ===========================================================================

test("[0020 §5.3 / §10.1(1) — the DELIBERATELY LIVE change]: a uniquely-filed CLASSIFIED document publishes deterministically — `projected`, a real wiki source page, through the audited writer", async () => {
  fail0020(live);
  const a = await freshClient("ing_unique");
  const doc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  const r = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  assert.equal(r.status, INGEST_STATUS.projected, `unique → projected (got ${JSON.stringify(r)})`);
  const { page, versions } = await sourcePageVersions(a, doc.documentId);
  assert.ok(page, `a wiki page exists at the audited writer's slug ${sourceSlug(doc.documentId)}`);
  assert.equal(versions.length, 1, "exactly one version");
  assert.equal(versions[0].synthesis, "deterministic", "…published on the DETERMINISTIC lane (no model, no consent)");
  assert.equal(versions[0].projected_from_seq, null,
    "…with projected_from_seq NULL — the 0019 §5 monotonic guard is NULL-safe against it (Dependencies on 0019: 'no interaction. Assert it.')");
});

test("[0020 §5.3]: the op key is the BYTE-IDENTICAL shape the entry.approved lane already uses — `wikiingest:<client>:<document>` — so the two paths share ONE receipt and can never double-publish", async () => {
  fail0020(live);
  const a = await freshClient("ing_opkey");
  const doc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  const key = `wikiingest:${a}:${doc.documentId}`;
  assert.ok(await opReceiptRow("record_wiki_source_ingest", key),
    `the ingest reserved the pinned op key ${key} (the shape wiki-projection.mjs already derives for entry.approved)`);
  // The entry.approved lane calling the SAME key must REPLAY, not double-publish.
  await recordWikiIngest({ client: a, document: doc.documentId, note: null, opKey: key });
  const { versions } = await sourcePageVersions(a, doc.documentId);
  assert.equal(versions.length, 1,
    "the entry.approved lane's direct call under the shared key REPLAYED — exactly one version, never two");
});

test("[0020 §5.3 / §9.4]: idempotence — re-driving the same (client,document) twice produces ONE wiki source page, ONE version and ONE op receipt", async () => {
  fail0020(live);
  const a = await freshClient("ing_idem");
  const doc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  const r1 = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  const r2 = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  assert.equal(r1.status, INGEST_STATUS.projected);
  assert.equal(r2.status, INGEST_STATUS.projected, "the repeat is a replay, not a refusal");
  const { versions } = await sourcePageVersions(a, doc.documentId);
  assert.equal(versions.length, 1, "ONE version");
  const receipts = await rootQuery(
    "select count(*)::int n from clara.op_receipts where fn='record_wiki_source_ingest' and op_key=$1",
    [`wikiingest:${a}:${doc.documentId}`]);
  assert.equal(receipts.rows[0].n, 1, "ONE op receipt");
});

test("[0020 §5.3 / §9.4]: ZERO → `skipped_unresolved_client` and TWO-OR-MORE → `skipped_ambiguous_client` — the discriminant SURVIVES operationally, no client_id ever leaves, and NOTHING is written", async () => {
  fail0020(live);
  const a = await freshClient("ing_zero_a");
  const b = await freshClient("ing_zero_b");
  const doc = await classifiedDocument({ firm: w.firms.A });

  const zero = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  assert.equal(zero.status, INGEST_STATUS.unresolved, `zero → ${INGEST_STATUS.unresolved} (got ${JSON.stringify(zero)})`);

  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  await fileTo(w.users.alice, { document: doc.documentId, client: b });
  const many = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  assert.equal(many.status, INGEST_STATUS.ambiguous,
    `two clients → the NEW distinct receipt token ${INGEST_STATUS.ambiguous} (got ${JSON.stringify(many)})`);
  assert.notEqual(many.status, INGEST_STATUS.unresolved,
    "…NOT collapsed into the zero receipt — v0.1's single collapsed receipt is withdrawn (amendment 11)");
  const blob = JSON.stringify(many);
  assert.ok(!blob.includes(a) && !blob.includes(b), "no candidate identity in the ambiguous receipt");
  for (const c of [a, b]) {
    assert.equal((await sourcePageVersions(c, doc.documentId)).versions.length, 0,
      "nothing was written for either candidate");
  }
});

test("[0020 §5.4]: a NEVER-CLASSIFIED document that is uniquely filed publishes NOTHING — `skipped_unclassified`", async () => {
  fail0020(live);
  const a = await freshClient("ing_unclass");
  // No classify_document call → no `document.classified` event for this document.
  const doc = await seedVerifiedDocument({ firm: w.firms.A, kind: "invoice" });
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  assert.equal((await resolveDocClient({ firm: w.firms.A, document: doc.documentId })).status, "unique",
    "the document IS uniquely filed — so the refusal below is the CLASSIFICATION gate, not the topology");
  const r = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  assert.equal(r.status, INGEST_STATUS.unclassified,
    `a never-classified document is refused ${INGEST_STATUS.unclassified} (got ${JSON.stringify(r)})`);
  assert.equal((await sourcePageVersions(a, doc.documentId)).versions.length, 0, "…and writes nothing");
  // [A20-4] the contract-ambiguous input: never classified AND zero filings.
  const both = await seedVerifiedDocument({ firm: w.firms.A, kind: "invoice" });
  const r2 = await resolveIngest({ firm: w.firms.A, document: both.documentId });
  assert.ok([INGEST_STATUS.unclassified, INGEST_STATUS.unresolved].includes(r2.status),
    `a never-classified, never-filed document is a skip (got ${JSON.stringify(r2)})`);
  noteLane(`[A20-4] never-classified AND zero-filing resolved to '${r2.status}' — §5.3 and §5.4 do not pin which gate runs first; the contract is silent on the ORDER`);
});

test("[0020 §5.3 / A20-13]: the audited writer's own refusals PROPAGATE UNCHANGED — a consent_evidence source raises CLR28; a non-operational client raises CLR10; a bytes-unverified source is filtered to a skip, never a publish", async () => {
  fail0020(live);
  // (a) consent_evidence source → CLR28 (0017: 'consent evidence cannot feed wiki
  //     ingest'). Reached by root-stamping the kind AFTER classification, because
  //     classify_document itself refuses the consent_evidence kind (0014 rule).
  const ce = await freshClient("ing_ce");
  const ceDoc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: ceDoc.documentId, client: ce });
  await rootQuery("update clara.documents set document_kind='consent_evidence' where id=$1", [ceDoc.documentId]);
  await assertRaises("CLR28", () => resolveIngest({ firm: w.firms.A, document: ceDoc.documentId }),
    "resolve_and_ingest over a consent_evidence source document");

  // (b) a client that is neither active nor onboarding → CLR10.
  const dead = await freshClient("ing_dead");
  const deadDoc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: deadDoc.documentId, client: dead });
  await rootQuery("update clara.clients set status='archived' where id=$1", [dead]);
  await assertRaises("CLR10", () => resolveIngest({ firm: w.firms.A, document: deadDoc.documentId }),
    "resolve_and_ingest for an archived client");

  // (c) bytes-unverified: §5.1's floor makes it UNRESOLVED, so it is filtered
  //     BEFORE the writer's CLR02 can fire — a skip, never a publish, never a raise.
  const uv = await freshClient("ing_uv");
  const uvDoc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: uvDoc.documentId, client: uv });
  await unverifyDocumentBytes(uvDoc.documentId);
  const r = await resolveIngest({ firm: w.firms.A, document: uvDoc.documentId }).catch((e) => ({ raised: e.code }));
  assert.notEqual(r.status, INGEST_STATUS.projected, "a bytes-unverified source NEVER publishes");
  assert.equal((await sourcePageVersions(uv, uvDoc.documentId)).versions.length, 0, "…and writes nothing");
  noteLane(`[A20-13] bytes-unverified + uniquely filed resolved to ${JSON.stringify(r)} — §5.1's verified-document floor and §5.3's CLR02 propagation both cover this input and the contract does not say which wins`);
});

// ===========================================================================
// §5.4 — THE RE-DRIVE. The single genuine coupling with 0019.
// ===========================================================================

test("[0020 §5.4 — THE 0019-COUPLING cell]: ambiguous(A,B) → skipped; B's filing is RETIRED; the document is now uniquely A's and MUST be re-resolved and published — not permanently lost", async () => {
  fail0020(live);
  const a = await freshClient("rd_a");
  const b = await freshClient("rd_b");
  const doc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  await fileTo(w.users.alice, { document: doc.documentId, client: b });

  const first = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  assert.equal(first.status, INGEST_STATUS.ambiguous, "the document.classified pass is SKIPPED as ambiguous");
  assert.equal((await sourcePageVersions(a, doc.documentId)).versions.length, 0, "nothing published for A");
  // The classified event is now permanently checkpointed. 0019's retirement lane
  // marks citations stale and explicitly does NOT re-resolve — this is 0020's job.
  await retireFilingFor(w.users.alice, { document: doc.documentId, client: b, reason: "0020 re-drive: B was wrong" });
  assert.deepEqual(await activeFilingClients(doc.documentId), [a],
    "the topology collapsed to exactly A");

  const redrive = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  assert.equal(redrive.status, INGEST_STATUS.projected,
    `the document.filing_retired RE-DRIVE publishes for A (got ${JSON.stringify(redrive)}) — the ambiguous document is NOT permanently lost`);
  const { versions } = await sourcePageVersions(a, doc.documentId);
  assert.equal(versions.length, 1, "exactly one version for A");
  assert.equal((await sourcePageVersions(b, doc.documentId)).versions.length, 0, "and nothing for the retired B");
});

test("[0020 §5.4]: ZERO → FILED re-drive — a classified document with no filing, later filed to exactly one client, publishes via the document.filed lane", async () => {
  fail0020(live);
  const a = await freshClient("rd_zero");
  const doc = await classifiedDocument({ firm: w.firms.A });
  assert.equal((await resolveIngest({ firm: w.firms.A, document: doc.documentId })).status,
    INGEST_STATUS.unresolved, "the classified pass is skipped — no filing yet");
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  assert.equal((await resolveIngest({ firm: w.firms.A, document: doc.documentId })).status,
    INGEST_STATUS.projected, "the document.filed re-drive publishes");
  assert.equal((await sourcePageVersions(a, doc.documentId)).versions.length, 1, "one version");
});

test("[0020 §5.4]: the re-drive fires ONLY for classified documents — a never-classified document filed to one client stays unpublished no matter how many times the lane re-drives", async () => {
  fail0020(live);
  const a = await freshClient("rd_never");
  const doc = await seedVerifiedDocument({ firm: w.firms.A, kind: "invoice" });
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  for (let i = 0; i < 3; i += 1) {
    const r = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
    assert.equal(r.status, INGEST_STATUS.unclassified, `re-drive ${i + 1} is still ${INGEST_STATUS.unclassified}`);
  }
  assert.equal((await sourcePageVersions(a, doc.documentId)).versions.length, 0, "never published");
});

// ===========================================================================
// §5.2/§5.3 — effect-time serialization (two-session).
// ===========================================================================

test("[0020 §5.2/§5.3 / §9.4 — two-session]: `unique(A)` with a filing-to-B COMMITTED first must NEVER publish as uniquely resolved", async () => {
  fail0020(live);
  const a = await freshClient("ser_a");
  const b = await freshClient("ser_b");
  const doc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  const plan = await resolveDocClient({ firm: w.firms.A, document: doc.documentId });
  assert.equal(plan.status, "unique", "PLAN TIME: uniquely A");
  // B's filing commits between plan time and effect time. record_wiki_source_ingest
  // alone would still publish (it re-checks only that A is STILL filed, never that
  // A is the ONLY one, 0017:2238-2242) — the whole reason §5.3 exists.
  await fileTo(w.users.alice, { document: doc.documentId, client: b });
  const effect = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  assert.equal(effect.status, INGEST_STATUS.ambiguous,
    `EFFECT TIME re-decides: ambiguous (got ${JSON.stringify(effect)})`);
  assert.equal((await sourcePageVersions(a, doc.documentId)).versions.length, 0,
    "…and NOTHING was published as uniquely resolved once B's filing was committed and visible");
});

test("[0020 §5.3 — two-session]: a resolve+ingest in flight holds the phantom guard — a concurrent file-to-B PARKS on the clara.documents row and the publication is lawful only because it serialized FIRST", async () => {
  fail0020(live);
  const a = await freshClient("ser2_a");
  const b = await freshClient("ser2_b");
  const doc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  const out = await raceIngestThenFileB({
    firm: w.firms.A, document: doc.documentId, clientB: b, sub: w.users.alice });
  assert.equal(out.ingest?.status, INGEST_STATUS.projected,
    `the ingest that serialized FIRST publishes for A (got ${JSON.stringify(out.ingest)})`);
  if (out.blocked) {
    noteLane("[0020 §5.3] OBSERVED: the concurrent file-to-B genuinely PARKED on the clara.documents row lock — §5.3's phantom guard (FOR UPDATE vs the FK's FOR KEY SHARE) is real, with no writer change anywhere");
  } else {
    noteLane("[0020 §5.3] NOT OBSERVED: the concurrent file-to-B did not park on the clara.documents row. §5.3 pins that lock as THE phantom guard; without it a new filing can commit inside the decision window — adjudication item.");
  }
  // 0027 Q-round (finding 1): post-0027 both sides of this race are documents-first, so
  // the cycle this 40P01 allowance existed for is structurally dead. Accepting it here
  // would mask its recurrence — tightened to a hard success requirement.
  assert.equal(out.fileOk, true,
    `post-0027 the filing must succeed after the ingest commits — a 40P01 here would mean the documents-first fix regressed (got ok=${out.fileOk} code=${out.fileCode})`);
  assert.equal((await sourcePageVersions(a, doc.documentId)).versions.length, 1,
    "exactly one version for A — no duplicate, no lost publication");
  assert.equal((await sourcePageVersions(b, doc.documentId)).versions.length, 0, "and none for B");
});

test("[0020 §5.3 residual R-1 CLOSED / §9.4 — two-session]: resolve+ingest against a CONCURRENT retire_document_filing serializes cleanly — the 40P01 residual is DEAD post-0027, not merely self-healing", async () => {
  fail0020(live);
  const a = await freshClient("dl_a");
  const b = await freshClient("dl_b");
  const doc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  await fileTo(w.users.alice, { document: doc.documentId, client: b });
  const out = await raceIngestThenRetire({
    firm: w.firms.A, document: doc.documentId, clientToRetire: b, sub: w.users.alice });
  // The ingest ran while BOTH filings were active, so it must have skipped.
  assert.equal(out.ingest?.status, INGEST_STATUS.ambiguous,
    `the in-flight ingest saw the two-client topology and skipped (got ${JSON.stringify(out.ingest)})`);
  // 0027 Q-round (finding 1): R-1 named this deadlock a residual — "bounded and
  // self-healing" — against the pre-0027 writer set. Post-0027 both sides are
  // documents-first, so the cycle is structurally dead, not merely rare-and-recoverable.
  // Accepting 40P01 here would mask its recurrence; tightened to a hard requirement.
  assert.equal(out.retireOk, true,
    `post-0027 the retirement must commit after the ingest — a 40P01 here would mean R-1's residual regressed from CLOSED back to merely bounded (got ok=${out.retireOk} code=${out.retireCode})`);
  if (!out.blocked) {
    noteLane("[0020 R-1, post-0027] NOT OBSERVED: the concurrent retirement did not park on the clara.documents row lock held by resolve_and_ingest_wiki_source (task #29's P-round made this the step-1 lock, was document_filings FOR SHARE pre-0027) — adjudication item.");
  }
  // CONVERGENCE: the consumer's at-least-once delivery re-drives the event. Always
  // reachable now (retireOk is asserted true above) — the prior "else, self-healing on
  // abort" branch represented an outcome that can no longer occur.
  const redrive = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  assert.equal(redrive.status, INGEST_STATUS.projected,
    "the re-drive after the retirement converges on a publication for A");
  assert.equal((await sourcePageVersions(a, doc.documentId)).versions.length, 1,
    "exactly ONE version — convergence, not duplication");
});

// ===========================================================================
// §9.5 — the resolver ACL closed set + the cross-firm DEFINER probe.
// ===========================================================================

test("[0020 §5.1/§5.3 / §9.5]: both resolver fns are EXECUTE-granted to clara_runtime ONLY, and clara_runtime holds NO table grant on clara.document_filings — the DEFINER is the entire surface", async () => {
  fail0020(live);
  for (const fn of ["resolve_document_client", "resolve_and_ingest_wiki_source"]) {
    assert.equal(await roleCanExecute(ROLES.runtime, fn), true, `${fn} → clara_runtime`);
    for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
      assert.equal(await roleCanExecute(role, fn), false, `${fn} is NOT reachable by ${role}`);
    }
  }
  const canRead = await rootQuery(
    "select has_table_privilege($1,'clara.document_filings','SELECT') as ok", [ROLES.runtime]);
  assert.equal(canRead.rows[0].ok, false,
    "clara_runtime has NO SELECT on clara.document_filings (§5.1) — a single-arg resolver would have been a cross-firm oracle");
});

test("[0020 §9.5 / A20-12]: a CROSS-FIRM resolve_and_ingest probe writes nothing and returns a skip — never `projected`, never a client identity", async () => {
  fail0020(live);
  const doc = await classifiedDocument({ firm: w.firms.A });
  const a = await freshClient("xf_a");
  await fileTo(w.users.alice, { document: doc.documentId, client: a });
  assert.equal((await resolveIngest({ firm: w.firms.A, document: doc.documentId })).status,
    INGEST_STATUS.projected, "in-firm it publishes (so the probe below is a real negative)");
  const probe = await resolveIngest({ firm: w.firms.B, document: doc.documentId })
    .catch((e) => ({ raised: e.code }));
  assert.notEqual(probe.status, INGEST_STATUS.projected, "the firm-B probe NEVER publishes");
  assert.ok(!JSON.stringify(probe).includes(a), "…and never names the firm-A client");
  noteLane(`[A20-12] cross-firm resolve_and_ingest returned ${JSON.stringify(probe)} — §9.5 says "the single uniform not-found shape" but §5.3's receipt vocabulary has no 'unresolved' member; the contract does not pin which skip token a foreign-firm probe gets`);
  // …and a cross-firm probe of the READ resolver is the uniform unresolved.
  assert.deepEqual(await resolveDocClient({ firm: w.firms.B, document: doc.documentId }), UNRESOLVED,
    "resolve_document_client's cross-firm probe IS the uniform unresolved");
});

test("[0020 §5.1/§5.3 / §8]: neither resolver's source contains a COUNT expression in its return path, and neither returns 'denied'", async () => {
  fail0020(live);
  for (const fn of ["resolve_document_client", "resolve_and_ingest_wiki_source"]) {
    const src = (await fnSource(fn)).toLowerCase();
    assert.ok(!src.includes("'denied'"), `clara.${fn} does not carry the deleted 'denied' token`);
    assert.ok(!/'candidates?_?n?'/.test(src), `clara.${fn} builds no candidate-count key into a return`);
  }
  // Also probe empirically over an ambiguous topology with THREE candidates: the
  // payload must be identical to the two-candidate one (no arity oracle).
  const [x, y, z] = [await freshClient("cnt_x"), await freshClient("cnt_y"), await freshClient("cnt_z")];
  const two = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: two.documentId, client: x });
  await fileTo(w.users.alice, { document: two.documentId, client: y });
  const three = await classifiedDocument({ firm: w.firms.A });
  for (const c of [x, y, z]) await fileTo(w.users.alice, { document: three.documentId, client: c });
  assert.equal(
    canonical(await resolveDocClient({ firm: w.firms.A, document: two.documentId })),
    canonical(await resolveDocClient({ firm: w.firms.A, document: three.documentId })),
    "two candidates and three candidates return a BYTE-IDENTICAL ambiguous payload — no arity oracle");
  assert.equal(
    canonical(await resolveIngest({ firm: w.firms.A, document: two.documentId })),
    canonical(await resolveIngest({ firm: w.firms.A, document: three.documentId })),
    "…and so do their ingest receipts");
});

test("[0020 §5.1]: a foreign-firm caller cannot use the resolver to confirm a GUESSED document id — the identical unresolved shape covers 'exists elsewhere' and 'does not exist'", async () => {
  fail0020(live);
  const realElsewhere = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: realElsewhere.documentId, client: await freshClient("guess_a") });
  const guessed = "00000000-0000-4000-8000-00000000beef";
  assert.equal(
    canonical(await resolveDocClient({ firm: w.firms.B, document: realElsewhere.documentId })),
    canonical(await resolveDocClient({ firm: w.firms.B, document: guessed })),
    "a REAL foreign document and a fabricated uuid are indistinguishable to a firm-B caller");
  await assertRaisesOneOf(["42501"],
    () => resolveDocClient({ firm: w.firms.A, document: realElsewhere.documentId, role: ROLES.agentRo }),
    "resolve_document_client as clara_agent_ro");
});
