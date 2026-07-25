// Wave B — wiki-projection consumer DB INTEGRATION (migration 0017). Proves the consumer against
// REAL 0017 rows: the full MODEL path (counterparty.created → synthesize → Storage put → verify →
// publish_wiki_page_version → real wiki_pages/versions/citations + a verified Storage object),
// already_projected on re-run, skipped_inactive_client for an onboarding client, held_consent +
// a real wiki_synthesis_holds row when consent is absent, the DETERMINISTIC ingest lane
// (entry.approved → record_wiki_source_ingest), and dead-letter on a genuine throw + redrive
// through the CONSUMERS entry. Group-role identity (asRuntime — no login dance). Row-scoped
// assertions, per-test firm isolation, NEVER TRUNCATE (the rig truncate/deadlock law). Events are
// produced through audited writers / _append_event ONLY (never a raw books/event insert).
//
// MIGRATION 0020 (typed egress consent). The model lane is no longer gated by an injected
// `resolveConsent`; it PREPARES a short-lived audited authorization and CONSUMES it atomically
// immediately before the model call (§3.3/§3.4). With zero typed consents and zero activations —
// production's posture — every verdict is `unknown` and the lane is DARK: held_consent, zero
// synthesize, zero publication (§10.1, asserted by the DARK cell below). To exercise the POSITIVE
// path these cells run the §7.2 owner runbook on the rig (grant a typed consent on a verified
// consent_evidence document, then ACTIVATE it) exactly as §9.3(d) prescribes — the rig lights, the
// product ships dark. The withdrawal cell proves the reverse direction end-to-end.
// The DETERMINISTIC lanes 0020 deliberately takes LIVE (§10.1(1)) are covered too: a uniquely filed
// document.classified now publishes through clara.resolve_and_ingest_wiki_source, and an ambiguous
// one earns its own receipt without ever releasing a candidate identity.

process.env.RELAY_TEST_MODE ??= "1";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { rootQuery, humanQuery, asRuntime, asFnOwner, opk, buildFirm, headSeq, checkpointSeq, endPool } from "./relay-fixtures.mjs";
import { runWikiProjectionCycle, wikiProjectionRedrive, CONSUMERS, WIKI_PROJECTION_CONSUMER } from "../lib/wiki-projection.mjs";
import { wikiProjectionHealth } from "../lib/wiki-projection-ops.mjs";
import { verifyWikiCanonical } from "../lib/storage.mjs";

let storageDir;
before(async () => {
  storageDir = await mkdtemp(join(process.env.CLARA_TEST_TMP_ROOT || tmpdir(), "clara-wikiproj-consumer-"));
  process.env.CLARA_TEST_STORAGE_DIR = storageDir;
});
after(async () => {
  await endPool();
  await rm(storageDir, { recursive: true, force: true }).catch(() => {});
});

async function probe0017() {
  const r = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='clara' and p.proname in ('publish_wiki_page_version','record_wiki_source_ingest','set_wiki_synthesis_hold')`);
  return Number(r.rows[0].n) === 3;
}
const HAS17 = await probe0017();
const skip = HAS17 ? false : "0017 wiki surface absent — migrate the target first";
// The isolation floor (CLR32/isolation_unsupported) is a 0019 feature — gate the config-block cell.
async function probe0019iso() {
  const r = await rootQuery(
    `select count(*)::int as n from pg_proc
       where oid = to_regprocedure('clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)')
         and prosrc like '%isolation_unsupported%'`);
  return Number(r.rows[0].n) === 1;
}
const skip19 = HAS17 && (await probe0019iso()) ? false : "0019 isolation floor absent — migrate to 19 first";

// Migration 0020 gates the MODEL lane on a live typed consent AND a live owner activation, reached
// only through clara.prepare_egress_dispatch / clara.consume_egress_dispatch. The rig has both
// (probe20 below); production ships with ZERO of each, which is the whole DARK claim (§10.1).
async function probe20() {
  const r = await rootQuery(
    `select (to_regprocedure('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)') is not null
         and to_regprocedure('clara.consume_egress_dispatch(uuid,uuid)') is not null
         and to_regprocedure('clara.resolve_and_ingest_wiki_source(uuid,uuid)') is not null) as ok`);
  return r.rows[0].ok === true;
}
const HAS20 = HAS17 && (await probe20());
const skip20 = HAS20 ? false : "0020 typed-consent surface absent — migrate to 20 first";

const sha256hex = (seed) => createHash("sha256").update(String(seed)).digest("hex");
const goodSynth = async () => ({ title: "Acme Vendor", content: `# Acme Vendor\n\nRoutine vendor; SST-registered. ${randomUUID()}` });
// `resolveConsent` is RETIRED (0020 §3.7): a plan-time READ was never an authorization. Injecting it
// would assert nothing — the consumer ignores the key — so the deps carry only the model.
const goodDeps = { synthesize: goodSynth };
/** Wrap goodSynth so a cell can PROVE the model was never reached (§10.1: zero synthesize). */
function countingSynth() {
  const seen = { calls: 0 };
  return { seen, synthesize: async (a) => { seen.calls++; return goodSynth(a); } };
}

// --- the §7.2 owner runbook, executed on the rig (§9.3(d): the rig lights, production stays dark)
/** A verified, in-firm `consent_evidence` document — §1.3's three conditions. No filing: a typed
 *  grant only reads the artifact, and a consent artifact must never trip the provenance trigger. */
async function consentEvidenceDoc(firm, owner) {
  const s = sha256hex(randomUUID());
  const r = await rootQuery(
    "select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as r",
    [firm, null, s, "consent.pdf", "application/pdf", 1024, `firms/${firm}/docs/${s}.pdf`, owner, 1,
      "consent_evidence", null, null]);
  return r.rows[0].r.document_id;
}
/** Runbook steps 1→5: ingest the evidence, grant the typed consent, then ACTIVATE it. A grant alone
 *  never authorizes (§2.3), so a cell that only granted would still be dark — both steps are here. */
async function lightWikiSynthesis(owner, firm, client) {
  const evidence = await consentEvidenceDoc(firm, owner);
  const g = await humanQuery(owner,
    "select clara.grant_client_egress_purpose($1,$2,$3,$4,$5) as r",
    [client, "wiki_synthesis", evidence, "rig: WB-R23 typed wiki-synthesis attestation", opk("gp")]);
  const consent = g.rows[0].r.consent_id;
  await humanQuery(owner,
    "select clara.activate_client_egress_purpose($1,$2,$3,$4) as r",
    [client, "wiki_synthesis", consent, opk("ap")]);
  return { evidence, consent };
}
async function revokeWikiSynthesis(owner, client) {
  await humanQuery(owner,
    "select clara.revoke_client_egress_purpose($1,$2,$3,$4) as r",
    [client, "wiki_synthesis", "rig: owner withdrawal", opk("rp")]);
}

// `tag` keeps the name unique per client — uq_counterparties_client_unregistered_name refuses a
// second unregistered counterparty with the same normalized name for one client.
async function insertCounterparty(firm, client, owner, tag = "") {
  const id = randomUUID();
  await rootQuery(
    "insert into clara.counterparties(id,firm_id,client_id,kind,name,name_normalized,created_by) values($1,$2,$3,'vendor',$4,$5,$6)",
    [id, firm, client, `Acme Vendor${tag}`, `acmevendor${tag.toLowerCase()}`, owner]);
  return id;
}
async function seedDoc(firm, client, owner) {
  const sha = sha256hex(randomUUID());
  const r = await rootQuery(
    "select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as r",
    [firm, client, sha, "rig.pdf", "application/pdf", 2048, `firms/${firm}/docs/${sha}.pdf`, owner, 1, "invoice", null, null]);
  return r.rows[0].r.document_id;
}
// Emit ONE synthetic event via the audited _append_event helper (never a raw domain_events insert).
async function emitEvent(firm, type, { client = null, actor = null, document = null, payload = {} } = {}) {
  return asFnOwner(async (c) => {
    const s = await c.query(
      "select clara._append_event($1,$2,$3,$4,null,null,null,$5,null,$6::jsonb) as seq",
      [firm, type, client, actor, document, JSON.stringify(payload)]);
    const seq = Number(s.rows[0].seq);
    const e = await c.query("select id from clara.domain_events where firm_id=$1 and seq=$2", [firm, seq]);
    return { seq, eventId: e.rows[0].id };
  });
}
async function drainWiki(firm, deps = {}) {
  return asRuntime(async (c) => {
    for (let i = 0; i < 30; i++) {
      await runWikiProjectionCycle(c, { onlyFirm: firm, batchSize: 100, ...deps });
      if ((await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER)) === (await headSeq(firm))) return;
    }
    throw new Error(`drainWiki: firm ${firm} did not converge`);
  });
}
const pageBySlug = (client, slug) =>
  rootQuery(
    `select p.id, p.page_kind, p.counterparty_id, v.version_n, v.synthesis, v.engine_id, v.content_sha256,
            v.storage_key, v.projected_from_seq
       from clara.wiki_pages p join clara.wiki_page_versions v on v.id=p.current_version_id
      where p.client_id=$1 and p.slug=$2`, [client, slug]).then((r) => r.rows[0] ?? null);
const deadLetters = (firm) =>
  rootQuery("select event_id, status, attempt_count, reason, resolved_at from clara.relay_dead_letters where firm_id=$1 and consumer=$2",
    [firm, WIKI_PROJECTION_CONSUMER]).then((r) => r.rows);

test("MODEL path (LIT: typed consent + activation): counterparty.created → synthesize → Storage put/verify → publish", { skip: skip20 }, async () => {
  const { owner, firm, client } = await buildFirm("wpm");
  // §9.3(d) — the no-race baseline. WITHOUT these two owner acts this lane is dark and this cell
  // would be asserting nothing about synthesis at all; the DARK cell below is its exact converse.
  await lightWikiSynthesis(owner, firm, client);
  const cp = await insertCounterparty(firm, client, owner);
  const { seq } = await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });

  await drainWiki(firm, goodDeps);

  assert.equal(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "checkpoint converged to head");
  const page = await pageBySlug(client, `counterparty/${cp}`);
  assert.ok(page, "a real wiki_pages row exists");
  assert.equal(page.page_kind, "counterparty");
  assert.equal(page.counterparty_id, cp, "the page keys the counterparty entity");
  assert.equal(page.synthesis, "model");
  assert.ok(page.engine_id, "engine_id is NOT NULL for model synthesis");
  assert.equal(Number(page.projected_from_seq), seq, "projected_from_seq = the triggering event seq");
  assert.match(page.storage_key, new RegExp(`^firms/${firm}/wiki/${client}/[0-9a-f]{64}\\.md$`), "content-addressed wiki key");
  // The Storage object exists and matches the published sha (put→verify→publish lockstep, W5).
  await verifyWikiCanonical(page.storage_key, page.content_sha256);
  const cites = await rootQuery(
    "select source_kind, counterparty_id from clara.wiki_page_citations c join clara.wiki_page_versions v on v.id=c.version_id where v.page_id=$1",
    [page.id]);
  assert.ok(cites.rows.some((x) => x.source_kind === "counterparty" && x.counterparty_id === cp), "≥1 counterparty citation");
  assert.equal((await deadLetters(firm)).length, 0, "no dead-letters on a clean model run");
  // §3.2/§3.4 — the dispatch was AUDITED: exactly one authorization was minted for this event and
  // it is CONSUMED (single-use, terminal). A publication with no consumed authorization behind it
  // would mean the linearization point was bypassed.
  const authz = await rootQuery(
    `select event_seq, event_type, consumed_at, invalidated_at, document_sha256
       from clara.egress_dispatch_authorizations where client_id=$1`, [client]);
  assert.equal(authz.rowCount, 1, "exactly one authorization for the one dispatch");
  assert.equal(Number(authz.rows[0].event_seq), seq, "…bound to the dispatch intent (this event)");
  assert.equal(authz.rows[0].event_type, "counterparty.created");
  assert.ok(authz.rows[0].consumed_at != null, "…and CONSUMED — the model was reached only through §3.4");
  assert.equal(authz.rows[0].invalidated_at, null);
  assert.equal(authz.rows[0].document_sha256, null, "counterparty synthesis is not document-tied (§3.2 CHECK)");
});

// §10.1 — THE DARK CLAIM, asserted as production ships it: a client with NO typed consent and NO
// activation. This is the converse of the cell above and the reason the lit cell must exist at all;
// deleting either one would leave the migration's central safety property unproven.
test("DARK (production posture): no typed consent ⇒ held_consent, ZERO synthesize, nothing published", { skip: skip20 }, async () => {
  const { owner, firm, client } = await buildFirm("wpdark");
  const cp = await insertCounterparty(firm, client, owner);
  await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });

  const s = countingSynth();
  await drainWiki(firm, { synthesize: s.synthesize });

  assert.equal(s.seen.calls, 0, "the model was NEVER called — client-confidential bytes never left (§10.1)");
  assert.equal(await pageBySlug(client, `counterparty/${cp}`), null, "zero model-lane publications");
  assert.equal(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "…and the lane still converges (a typed terminal, never a stall)");
  const hold = await rootQuery("select reason from clara.wiki_synthesis_holds where client_id=$1", [client]);
  assert.equal(hold.rowCount, 1);
  assert.equal(hold.rows[0].reason, "wiki synthesis consent unknown",
    "the reason token is byte-identical to as-built — that equality IS the DARK claim");
  assert.equal((await rootQuery("select count(*)::int n from clara.egress_dispatch_authorizations where client_id=$1", [client])).rows[0].n, 0,
    "an unknown verdict mints NO authorization row");
  assert.equal((await deadLetters(firm)).length, 0, "a hold is a typed terminal, never a dead-letter");
});

// §3.5/§7.2(6) — WITHDRAWAL, end-to-end through the product. A revoke deactivates the activation and
// invalidates outstanding authorizations in one transaction; the next event is dark again.
test("WITHDRAWAL: revoke_client_egress_purpose re-darkens the lane (held_consent, no second page)", { skip: skip20 }, async () => {
  const { owner, firm, client } = await buildFirm("wprev");
  await lightWikiSynthesis(owner, firm, client);
  const cp = await insertCounterparty(firm, client, owner);
  await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });
  await drainWiki(firm, goodDeps);
  assert.ok(await pageBySlug(client, `counterparty/${cp}`), "lit: the first event published");

  await revokeWikiSynthesis(owner, client);
  const cp2 = await insertCounterparty(firm, client, owner, "2");
  await emitEvent(firm, "counterparty.merged", { client, actor: owner, payload: { survivor_id: cp2, merged_id: cp } });
  const s = countingSynth();
  await drainWiki(firm, { synthesize: s.synthesize });

  assert.equal(s.seen.calls, 0, "after withdrawal the model is not called again");
  assert.equal(await pageBySlug(client, `counterparty/${cp2}`), null, "…and nothing new is published");
  assert.equal(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "the lane converges");
});

test("already_projected on re-run: re-processing the same event mints no new version", { skip: skip20 }, async () => {
  const { owner, firm, client } = await buildFirm("wpa");
  await lightWikiSynthesis(owner, firm, client);
  const cp = await insertCounterparty(firm, client, owner);
  const { seq } = await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });
  await drainWiki(firm, goodDeps);
  const before = await pageBySlug(client, `counterparty/${cp}`);
  assert.equal(before.version_n, 1);

  // Rewind this consumer's checkpoint below the event and re-drive: the projected_from_seq guard
  // must yield already_projected (no republish), not a duplicate version.
  await rootQuery("update clara.relay_checkpoints set last_seq=$1 where consumer=$2 and firm_id=$3", [seq - 1, WIKI_PROJECTION_CONSUMER, firm]);
  await drainWiki(firm, goodDeps);
  const after = await pageBySlug(client, `counterparty/${cp}`);
  assert.equal(after.version_n, 1, "no new version — already_projected");
  assert.equal(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "checkpoint reconverged");
});

test("skipped_inactive_client: an onboarding client's counterparty event projects nothing", { skip }, async () => {
  const { owner, firm } = await buildFirm("wpi");
  const r = await humanQuery(owner, "select clara.create_client(p_name=>$1,p_op_key=>$2) as receipt", [`onb_${Date.now()}`, opk("onb")]);
  const onb = r.rows[0].receipt.client_id;
  assert.equal((await rootQuery("select status from clara.clients where id=$1", [onb])).rows[0].status, "onboarding");
  const cp = randomUUID(); // never inserted — the lane skips before any publish/FK
  await emitEvent(firm, "counterparty.created", { client: onb, actor: owner, payload: { counterparty_id: cp } });

  await drainWiki(firm, goodDeps);

  assert.equal(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "checkpoint advanced past the skipped event");
  assert.equal((await rootQuery("select count(*)::int n from clara.wiki_pages where client_id=$1", [onb])).rows[0].n, 0, "no wiki page for the onboarding client");
  assert.equal((await deadLetters(firm)).length, 0, "a skip is never a dead-letter");
});

// The old cell here injected `resolveConsent: 'absent'`. After 0020 that key is IGNORED, so the cell
// would have kept passing while asserting nothing about consent at all — the most dangerous kind of
// green. It is re-aimed onto the property 0020 actually adds and which the DARK cell cannot show:
// §2.3/§9.1 — A GRANT ALONE NEVER AUTHORIZES. A live typed consent with no activation is
// indistinguishable, at the dispatch boundary, from no consent at all.
test("a typed consent that was GRANTED but never ACTIVATED still holds (§2.3: activation is the gate)", { skip: skip20 }, async () => {
  const { owner, firm, client } = await buildFirm("wph");
  const evidence = await consentEvidenceDoc(firm, owner);
  await humanQuery(owner, "select clara.grant_client_egress_purpose($1,$2,$3,$4,$5) as r",
    [client, "wiki_synthesis", evidence, "rig: granted, deliberately NOT activated", opk("gp")]);
  assert.equal(
    (await rootQuery("select count(*)::int n from clara.client_egress_purpose_consents where client_id=$1 and revoked_at is null", [client])).rows[0].n,
    1, "the typed consent IS live — the hold that follows is the activation gate, not a missing grant");

  const cp = await insertCounterparty(firm, client, owner);
  await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });
  const s = countingSynth();
  await drainWiki(firm, { synthesize: s.synthesize });

  assert.equal(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "checkpoint converged");
  assert.equal(s.seen.calls, 0, "the model is not called on an un-activated grant");
  assert.equal((await rootQuery("select count(*)::int n from clara.wiki_synthesis_holds where client_id=$1", [client])).rows[0].n, 1, "a hold row was recorded");
  assert.equal(await pageBySlug(client, `counterparty/${cp}`), null, "no page published without an activation");
  assert.equal((await rootQuery("select count(*)::int n from clara.egress_dispatch_authorizations where client_id=$1", [client])).rows[0].n, 0,
    "…and no authorization was minted — the verdict was `unknown`, indistinguishable from never attested (§3.3)");
});

// §10.1(1)/§5.4 — the deterministic change 0020 takes LIVE on purpose. A uniquely filed, classified
// document now publishes its source page through the serialized verb; the resolution is re-decided
// inside the effect transaction under the §5.3 filing-topology lock pair. No consent, no model.
test("document.classified on a UNIQUELY filed document → deterministic publication (§10.1(1))", { skip: skip20 }, async () => {
  const { owner, firm, client } = await buildFirm("wprs");
  const doc = await seedDoc(firm, client, owner);
  await emitEvent(firm, "document.classified", { client: null, actor: owner, document: doc });

  await drainWiki(firm); // NO deps — no model, no consent anywhere on this lane

  assert.equal(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "checkpoint converged");
  const page = await pageBySlug(client, `sources/${doc}`);
  assert.ok(page, "the uniquely resolved document published a source page");
  assert.equal(page.synthesis, "deterministic");
  assert.equal(page.engine_id, null, "no engine — nothing was synthesized");
  assert.equal((await deadLetters(firm)).length, 0);
});

// §5.1/§5.4/§9.4 — AMBIGUITY. Two active filings ⇒ its own receipt, no publication, and no candidate
// identity or count ever leaves the database.
test("document.classified on an AMBIGUOUSLY filed document publishes nothing (skipped_ambiguous_client)", { skip: skip20 }, async () => {
  const { owner, firm, client } = await buildFirm("wpamb");
  const other = (await humanQuery(owner, "select clara.create_client(p_name=>$1,p_op_key=>$2) as r", [`amb_${Date.now()}`, opk("amb")])).rows[0].r.client_id;
  const s = sha256hex(randomUUID());
  const mk = (c) => rootQuery("select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as r",
    [firm, c, s, "amb.pdf", "application/pdf", 2048, `firms/${firm}/docs/${s}.pdf`, owner, 1, "invoice", null, null]);
  const doc = (await mk(client)).rows[0].r.document_id;
  await mk(other); // a SECOND active filing for the same document — the topology is now ambiguous
  await emitEvent(firm, "document.classified", { client: null, actor: owner, document: doc });

  await drainWiki(firm);

  assert.equal(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "checkpoint converged — ambiguity is a typed terminal");
  assert.equal(await pageBySlug(client, `sources/${doc}`), null, "no page for either candidate");
  assert.equal(await pageBySlug(other, `sources/${doc}`), null);
  assert.equal((await deadLetters(firm)).length, 0, "…and never a dead-letter");
});

test("DETERMINISTIC ingest: entry.approved with a source doc → record_wiki_source_ingest (no model/consent)", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("wpd");
  const doc = await seedDoc(firm, client, owner);
  await emitEvent(firm, "entry.approved", { client, actor: owner, document: doc });

  await drainWiki(firm); // NO deps — deterministic ingest never calls the model or resolves consent

  assert.equal(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "checkpoint converged");
  const page = await pageBySlug(client, `sources/${doc}`);
  assert.ok(page, "a deterministic source page exists");
  assert.equal(page.synthesis, "deterministic");
  const cites = await rootQuery(
    "select source_kind, document_id from clara.wiki_page_citations c join clara.wiki_page_versions v on v.id=c.version_id where v.page_id=$1",
    [page.id]);
  assert.ok(cites.rows.some((x) => x.source_kind === "document" && x.document_id === doc), "the document citation");
  assert.equal((await deadLetters(firm)).length, 0);
});

test("dead-letter on a genuine throw + redrive through the CONSUMERS entry", { skip: skip20 }, async () => {
  const { owner, firm, client } = await buildFirm("wpx");
  // The poison must come from the MODEL, so the lane has to reach the model: light the client.
  // Without the typed consent + activation the event would take the held_consent terminal and this
  // cell would prove nothing about dead-lettering at all.
  await lightWikiSynthesis(owner, firm, client);
  const cp = await insertCounterparty(firm, client, owner);
  const { eventId } = await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });

  // A non-CLR throw from the model call ⇒ a genuine dead-letter (not a terminal receipt).
  const boomDeps = { synthesize: async () => { throw new Error("boom: model unavailable"); } };
  await asRuntime((c) => runWikiProjectionCycle(c, { onlyFirm: firm, ...boomDeps }));
  const dls = await deadLetters(firm);
  const dl = dls.find((d) => d.event_id === eventId);
  assert.ok(dl, "a wiki_projection dead-letter row exists for the poison event");
  assert.equal(dl.status, "pending");
  assert.equal(await pageBySlug(client, `counterparty/${cp}`), null, "nothing published while poisoned");

  // Redrive with a healthy model ⇒ resolves + publishes (idempotent via op_key + put-409).
  const res = await asRuntime((c) => CONSUMERS.wiki_projection.redrive(c, eventId, goodDeps));
  assert.deepEqual({ resolved: res.resolved, consumer: res.consumer }, { resolved: true, consumer: WIKI_PROJECTION_CONSUMER });
  const dl2 = (await deadLetters(firm)).find((d) => d.event_id === eventId);
  assert.equal(dl2.status, "resolved", "the dead-letter is resolved");
  const page = await pageBySlug(client, `counterparty/${cp}`);
  assert.ok(page, "the redrive published the page");
  await verifyWikiCanonical(page.storage_key, page.content_sha256);
});

// --- ratchet R3: dead-letter recovery + configuration self-heal (F6/F2/F3) ---------------------

test("[R3 F6] an AUTOMATIC replay after a repair RESOLVES the dead-letter atomically (no explicit redrive)", { skip: skip20 }, async () => {
  const { owner, firm, client } = await buildFirm("wpf6");
  await lightWikiSynthesis(owner, firm, client); // the poison is the MODEL — the lane must reach it
  const cp = await insertCounterparty(firm, client, owner);
  const { eventId } = await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });

  // Poison ONE cycle: a non-CLR throw dead-letters the event; the checkpoint does NOT advance.
  const boomDeps = { synthesize: async () => { throw new Error("boom: model unavailable"); } };
  await asRuntime((c) => runWikiProjectionCycle(c, { onlyFirm: firm, ...boomDeps }));
  let dl = (await deadLetters(firm)).find((d) => d.event_id === eventId);
  assert.ok(dl && dl.status === "pending", "the poison event dead-lettered (pending)");
  assert.equal(dl.resolved_at, null, "…with no resolved_at yet");
  assert.notEqual(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "…and the checkpoint stayed BEHIND it");

  // Heal: a normal drain re-reads the same event (checkpoint never advanced) and it now SUCCEEDS.
  await drainWiki(firm, goodDeps);
  assert.ok(await pageBySlug(client, `counterparty/${cp}`), "the automatic replay published the page");
  dl = (await deadLetters(firm)).find((d) => d.event_id === eventId);
  assert.equal(dl.status, "resolved", "…and RESOLVED the dead-letter automatically — no explicit redrive (F6)");
  assert.ok(dl.resolved_at != null, "…stamping resolved_at");
});

test("[R3 F6] recordDeadLetter REFRESHES on re-failure — a stale-resolved row flips back to pending, attempts bump", { skip: skip20 }, async () => {
  const { owner, firm, client } = await buildFirm("wpf6b");
  await lightWikiSynthesis(owner, firm, client); // the poison is the MODEL — the lane must reach it
  const cp = await insertCounterparty(firm, client, owner);
  const { eventId } = await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });
  // boomDeps NEVER publishes (the throw precedes publish), so the event re-fails every cycle while
  // the checkpoint stays behind — no already_projected short-circuit can hide the re-failure.
  const boomDeps = { synthesize: async () => { throw new Error("boom: model unavailable"); } };

  await asRuntime((c) => runWikiProjectionCycle(c, { onlyFirm: firm, ...boomDeps }));
  let dl = (await deadLetters(firm)).find((d) => d.event_id === eventId);
  assert.equal(dl.status, "pending");
  assert.equal(Number(dl.attempt_count), 1);

  // Simulate a stale RESOLVE left over from before a checkpoint rewind.
  await rootQuery("update clara.relay_dead_letters set status='resolved', resolved_at=now() where consumer=$1 and event_id=$2",
    [WIKI_PROJECTION_CONSUMER, eventId]);

  // Re-poison: the event re-reads (checkpoint never advanced) and re-fails → the row must NOT stay resolved.
  await asRuntime((c) => runWikiProjectionCycle(c, { onlyFirm: firm, ...boomDeps }));
  dl = (await deadLetters(firm)).find((d) => d.event_id === eventId);
  assert.equal(dl.status, "pending", "the re-failure flipped the stale-resolved row BACK to pending (F6 — /ready warns again)");
  assert.equal(dl.resolved_at, null, "…and cleared resolved_at");
  assert.equal(Number(dl.attempt_count), 2, "…and bumped the attempt count");
});

test("[R3 F2/F3] a CONFIGURATION refusal (isolation_unsupported) BLOCKS the cursor, surfaces configurationBlocked, then self-heals", { skip: skip19 || skip20 }, async () => {
  const { owner, firm, client } = await buildFirm("wpcfg");
  // The refusal being probed comes from publish_wiki_page_version under REPEATABLE READ, so the
  // lane must actually get as far as publishing: light the client (§9.3(d) rig posture).
  await lightWikiSynthesis(owner, firm, client);
  const cp = await insertCounterparty(firm, client, owner);
  await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });

  // Pin the runtime connection's default isolation to REPEATABLE READ so the cycle's own `begin`
  // opens RR → publish raises CLR32/isolation_unsupported (0019 §1b). Instance-local; restored below.
  const blocked = await asRuntime(async (c) => {
    await c.query("set default_transaction_isolation to 'repeatable read'");
    try {
      const r = await runWikiProjectionCycle(c, { onlyFirm: firm, ...goodDeps });
      const health = await wikiProjectionHealth(c);
      return { r, health };
    } finally {
      await c.query("reset default_transaction_isolation").catch(() => {});
    }
  });

  assert.equal(blocked.r.configurationBlocked, true, "the cycle reports configurationBlocked");
  assert.notEqual(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm),
    "the checkpoint stayed BEHIND the event — a config failure is NEVER checkpointed past");
  assert.equal(await pageBySlug(client, `counterparty/${cp}`), null, "nothing published under the refused isolation");
  const dl = (await deadLetters(firm)).find((d) => String(d.reason).startsWith("runtime misconfiguration"));
  assert.ok(dl && dl.status === "pending", "a config-prefixed dead-letter was recorded (the configurationBlocked signal)");
  assert.equal(blocked.health.configurationBlocked, true, "wikiProjectionHealth exposes configurationBlocked=true");

  // Self-heal: a normal (READ COMMITTED) drain projects the event and clears the signal.
  await drainWiki(firm, goodDeps);
  assert.equal(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "checkpoint converged after the config was corrected");
  assert.ok(await pageBySlug(client, `counterparty/${cp}`), "the event projected once the isolation was fixed");
  const dl2 = (await deadLetters(firm)).find((d) => String(d.reason).startsWith("runtime misconfiguration"));
  assert.equal(dl2.status, "resolved", "…and the config dead-letter resolved automatically (F6)");
});

test("registry + redrive guard: unknown dead-letter refuses; identity is runtime-role", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("wpg");
  const { eventId } = await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: randomUUID() } });
  assert.equal(CONSUMERS.wiki_projection.identity, "runtime-role");
  await assert.rejects(() => asRuntime((c) => wikiProjectionRedrive(c, eventId, goodDeps)), /no dead-letter for consumer='wiki_projection'/);
});
