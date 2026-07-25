// Wave-B battery — migration 0020 §9.2: CROSS-PURPOSE ISOLATION, the blocker the
// separate relation closes.
//
// THE cell: a typed wiki grant (with a live activation) must NEVER authorize the
// purpose-BLIND invoice-facts lane, and a legacy null-purpose grant must NEVER
// authorize wiki synthesis. If typed purposes had landed on
// clara.client_egress_consents — v0.1's withdrawn decision — a client with only a
// wiki grant would pass the 0015 predicate (`revoked_at is null` for the client,
// no purpose test) and its bills would go cross-border on a consent that never
// covered them. This file is the production non-regression proof, staged in RPR's
// exact live shape. CONTRACT-BLIND; FAILS below 0020.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, noteLane,
  fail0020, wbEnsureReady20,
  buildWaveBWorld, createClient, seedOpeningCoa, seedCitedDocument, filedDocument,
  enqueueInvoiceFacts, invoiceFactsTask, claimTask, WREASON,
  grantConsent, grantClientEgress, revokeClientEgress,
  UNKNOWN_VERDICT, canonical,
  revokePurpose, deactivatePurpose, lightSynthesis, prepareForLatestEvent,
  livePurposeConsent, liveLegacyConsentCount,
} from "./wb-0020-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await wbEnsureReady20();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0020-isolation"); await endPool(); });

async function freshClient(tag) {
  const c = await createClient(w.users.alice, { name: `${w.prefix}_${tag}`, opKey: opk("cli") });
  await seedOpeningCoa(w.users.alice, c);
  return c;
}

async function taskStatus(taskId) {
  const r = await rootQuery("select status from clara.document_processing_tasks where id=$1", [taskId]);
  return r.rows[0]?.status ?? null;
}
function clrOf(receipt) {
  if (!receipt || typeof receipt !== "object") return {};
  const p = receipt.payload ?? receipt;
  return { clr: p.clr ?? receipt.clr ?? null, reason: p.reason ?? receipt.reason ?? null };
}
/** Enqueue an invoice_facts task for a freshly-cited invoice doc, claim it with
 *  the kill-switch ON, and return { status, clr, reason, raised }.
 *
 *  FIXTURE HYGIENE (rig-only, no bearing on the property under test): the 0015
 *  claim body enforces a PER-FIRM concurrency cap of `ocr_concurrency` (default 2)
 *  RUNNING ocr/invoice_facts tasks and raises CLR18 past it (0015:3409-3415). Every
 *  cell in this file shares firm A, so a cell that legitimately reaches `running`
 *  would starve the next one. The task is therefore released as ROOT immediately
 *  after its status is captured — the assertion still reads the real claim outcome.
 *  A CLR18 is surfaced explicitly so a cap artefact can never masquerade as a
 *  consent refusal. */
async function claimInvoiceFacts(sub, { firm, client }) {
  const cited = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  const receipt = await claimTask(task.id, { egressApproved: true }).catch((e) => ({ raised: e.code }));
  const status = await taskStatus(task.id);
  if (status === "running") {
    await rootQuery(
      "update clara.document_processing_tasks set status='done', finished_at=now() where id=$1", [task.id]);
  }
  const out = { taskId: task.id, status, raised: receipt?.raised ?? null, ...clrOf(receipt) };
  assert.notEqual(out.raised, "CLR18",
    "the invoice_facts claim hit the per-firm concurrency cap — a RIG artefact, not a consent verdict");
  return out;
}

test("META: 0020 applied — the isolation battery is armed", async () => {
  fail0020(live);
  assert.ok(w, "world built");
});

test("[0020 §9.2 — THE load-bearing cell]: a typed wiki grant + activation with NO legacy row does NOT authorize invoice-facts — held_egress / CLR28 / no_consent, BYTE-IDENTICAL to a client with no consent at all", async () => {
  fail0020(live);
  const typedOnlyClient = await freshClient("iso_typed");
  const nothingClient = await freshClient("iso_nothing");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client: typedOnlyClient });
  // Prove the typed side IS live, so the isolation below is a real negative.
  assert.equal((await prepareForLatestEvent({ firm: w.firms.A, client: typedOnlyClient })).verdict, "granted",
    "the typed wiki lane IS authorized for this client");
  assert.equal(await liveLegacyConsentCount(typedOnlyClient), 0, "…and it holds NO legacy consent row");

  const typedOnly = await claimInvoiceFacts(w.users.alice, { firm: w.firms.A, client: typedOnlyClient });
  const control = await claimInvoiceFacts(w.users.alice, { firm: w.firms.A, client: nothingClient });
  assert.equal(typedOnly.status, "held_egress", "the typed-wiki-only client's invoice_facts task is held_egress");
  assert.notEqual(typedOnly.status, "running", "…never running (fail closed)");
  if (typedOnly.clr) assert.equal(typedOnly.clr, "CLR28", "…CLR28");
  if (typedOnly.reason) assert.equal(typedOnly.reason, WREASON.noConsent, "…reason no_consent");
  assert.equal(
    canonical({ status: typedOnly.status, clr: typedOnly.clr, reason: typedOnly.reason }),
    canonical({ status: control.status, clr: control.clr, reason: control.reason }),
    "a typed-wiki-only client is invoice-facts-INDISTINGUISHABLE from a client with no consent at all");
});

test("[0020 §9.2]: a LEGACY revoke leaves a live typed wiki consent UNTOUCHED — the verdict is still `granted`", async () => {
  fail0020(live);
  const client = await freshClient("iso_legrev");
  await grantConsent(w.users.alice, { firm: w.firms.A, client }); // legacy invoice-facts consent
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client }); // typed wiki grant + activation
  assert.equal((await prepareForLatestEvent({ firm: w.firms.A, client })).verdict, "granted",
    "typed wiki authorized while both are live");
  await revokeClientEgress(w.users.alice, { client, reason: "legacy only" });
  assert.equal((await prepareForLatestEvent({ firm: w.firms.A, client })).verdict, "granted",
    "a legacy revoke did NOT touch typed wiki authorization — still granted");
  assert.ok(await livePurposeConsent(client), "the live typed consent survives the legacy revoke");
  assert.equal(await liveLegacyConsentCount(client), 0, "…and the legacy row IS revoked (the revoker found the right one)");
});

test("[0020 §9.2]: a TYPED revoke leaves the legacy invoice-facts consent UNTOUCHED — the claim still authorizes", async () => {
  fail0020(live);
  const client = await freshClient("iso_typedrev");
  await grantConsent(w.users.alice, { firm: w.firms.A, client });
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const before1 = await claimInvoiceFacts(w.users.alice, { firm: w.firms.A, client });
  assert.equal(before1.status, "running", "invoice_facts runs while the legacy consent is live");
  await revokePurpose(w.users.alice, { client, reason: "typed only", opKey: opk("iso_tr") });
  const after = await claimInvoiceFacts(w.users.alice, { firm: w.firms.A, client });
  assert.equal(after.status, "running",
    "a typed revoke did NOT touch the legacy invoice-facts consent — still authorized");
  assert.equal(canonical(await prepareForLatestEvent({ firm: w.firms.A, client })), canonical(UNKNOWN_VERDICT),
    "…while the typed wiki verdict is now unknown");
  assert.equal(await liveLegacyConsentCount(client), 1, "the legacy row is still live");
});

test("[0020 §9.2]: a typed DEACTIVATION (a pause) also leaves invoice-facts running — the two lanes share no state at all", async () => {
  fail0020(live);
  const client = await freshClient("iso_pause");
  await grantConsent(w.users.alice, { firm: w.firms.A, client });
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  await deactivatePurpose(w.users.alice, { client, reason: "typed pause", opKey: opk("iso_dp") });
  assert.equal(canonical(await prepareForLatestEvent({ firm: w.firms.A, client })), canonical(UNKNOWN_VERDICT),
    "wiki synthesis is paused");
  const facts = await claimInvoiceFacts(w.users.alice, { firm: w.firms.A, client });
  assert.equal(facts.status, "running", "…and invoice-facts is unaffected");
});

test("[0020 §6 / §9.2]: the legacy one-live-per-client invariant is byte-identical WITH a typed consent live — a second live legacy grant still refuses; grant→revoke→grant leaves exactly one live", async () => {
  fail0020(live);
  const client = await freshClient("iso_onelive");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client }); // a typed row is live throughout
  const ev1 = await filedDocument(w.users.alice, { firm: w.firms.A, client });
  await grantClientEgress(w.users.alice, { client, evidenceDocument: ev1.documentId, scopeNote: "legacy 1" });
  const ev2 = await filedDocument(w.users.alice, { firm: w.firms.A, client });
  await assert.rejects(
    () => grantClientEgress(w.users.alice, { client, evidenceDocument: ev2.documentId, scopeNote: "legacy dup" }),
    "a second LIVE legacy consent row refuses (the 0011 one-live index, untouched by 0020)");
  await revokeClientEgress(w.users.alice, { client, reason: "rotate" });
  await grantClientEgress(w.users.alice, { client, evidenceDocument: ev2.documentId, scopeNote: "legacy 2" });
  assert.equal(await liveLegacyConsentCount(client), 1,
    "exactly ONE live legacy row (the partial unique is unchanged by 0020)");
});

test("[0020 §9.2 — RPR's exact production shape]: a client with ONLY a live legacy null-purpose row keeps invoice-facts AUTHORIZED and wiki synthesis HELD (verdict unknown)", async () => {
  fail0020(live);
  const client = await freshClient("iso_rpr");
  await grantConsent(w.users.alice, { firm: w.firms.A, client }); // ONLY the legacy row
  const facts = await claimInvoiceFacts(w.users.alice, { firm: w.firms.A, client });
  assert.equal(facts.status, "running", "invoice_facts is authorized (the legacy gate accepts the live row)");
  assert.equal(canonical(await prepareForLatestEvent({ firm: w.firms.A, client })), canonical(UNKNOWN_VERDICT),
    "…while wiki synthesis stays HELD — a legacy grant is not a typed grant (fail-closed PER PURPOSE)");
  assert.equal(await rootQuery(
    "select count(*)::int n from clara.client_egress_purpose_consents where client_id=$1", [client]
  ).then((r) => r.rows[0].n), 0, "…and no typed row was created for it by anything");
  noteLane("RPR non-regression: legacy-live + no-typed-row → invoice-facts LIVE, wiki DARK — the production posture 0020 must preserve through the ceremony");
});

test("[0020 §9.2]: the MULTI-FILING partial-consent rule is unchanged — a document filed to a legacy-consented client AND a typed-only client still HOLDS (every active filing's client must hold a LEGACY consent)", async () => {
  fail0020(live);
  const legacyClient = await freshClient("iso_mf_legacy");
  const typedClient = await freshClient("iso_mf_typed");
  await grantConsent(w.users.alice, { firm: w.firms.A, client: legacyClient });
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client: typedClient });
  const { seedVerifiedDocument, fileDocument, freshResolution } = await import("./wb-0020-helpers.mjs");
  const seed = await seedVerifiedDocument({ firm: w.firms.A, kind: "invoice" });
  for (const c of [legacyClient, typedClient]) {
    await fileDocument(w.users.alice, {
      document: seed.documentId, client: c,
      resolution: await freshResolution(w.users.alice, c, { subjectKind: "document", subjectId: seed.documentId }),
    });
  }
  await enqueueInvoiceFacts(seed.documentId);
  const task = await invoiceFactsTask(seed.documentId);
  const receipt = await claimTask(task.id, { egressApproved: true }).catch(() => null);
  const st = await taskStatus(task.id);
  assert.notEqual(st, "running",
    "a shared document whose second client holds ONLY a typed wiki consent does NOT run — a typed grant is not a legacy consent");
  const { reason } = clrOf(receipt);
  if (reason) {
    assert.ok([WREASON.partialConsent, WREASON.noConsent].includes(reason),
      `the hold reason is the unchanged partial/no-consent vocabulary (got ${reason})`);
  }
});
