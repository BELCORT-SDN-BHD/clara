// Wave B — wiki-projection consumer DB INTEGRATION (migration 0017). Proves the consumer against
// REAL 0017 rows: the full MODEL path (counterparty.created → synthesize → Storage put → verify →
// publish_wiki_page_version → real wiki_pages/versions/citations + a verified Storage object),
// already_projected on re-run, skipped_inactive_client for an onboarding client, held_consent +
// a real wiki_synthesis_holds row when consent is absent, the DETERMINISTIC ingest lane
// (entry.approved → record_wiki_source_ingest), and dead-letter on a genuine throw + redrive
// through the CONSUMERS entry. Group-role identity (asRuntime — no login dance). Row-scoped
// assertions, per-test firm isolation, NEVER TRUNCATE (the rig truncate/deadlock law). Events are
// produced through audited writers / _append_event ONLY (never a raw books/event insert).

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

const sha256hex = (seed) => createHash("sha256").update(String(seed)).digest("hex");
const present = async () => "present";
const goodSynth = async () => ({ title: "Acme Vendor", content: `# Acme Vendor\n\nRoutine vendor; SST-registered. ${randomUUID()}` });
const goodDeps = { resolveConsent: present, synthesize: goodSynth };

async function insertCounterparty(firm, client, owner) {
  const id = randomUUID();
  await rootQuery(
    "insert into clara.counterparties(id,firm_id,client_id,kind,name,name_normalized,created_by) values($1,$2,$3,'vendor',$4,$5,$6)",
    [id, firm, client, "Acme Vendor", "acmevendor", owner]);
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

test("MODEL path: counterparty.created → synthesize → Storage put/verify → publish; real 0017 rows + verified object", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("wpm");
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
});

test("already_projected on re-run: re-processing the same event mints no new version", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("wpa");
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

test("held_consent: consent absent sets a real wiki_synthesis_holds row and publishes nothing", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("wph");
  const cp = await insertCounterparty(firm, client, owner);
  await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });

  await drainWiki(firm, { resolveConsent: async () => "absent", synthesize: goodSynth });

  assert.equal(await checkpointSeq(firm, WIKI_PROJECTION_CONSUMER), await headSeq(firm), "checkpoint converged");
  assert.equal((await rootQuery("select count(*)::int n from clara.wiki_synthesis_holds where client_id=$1", [client])).rows[0].n, 1, "a hold row was recorded");
  assert.equal(await pageBySlug(client, `counterparty/${cp}`), null, "no page published without consent");
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

test("dead-letter on a genuine throw + redrive through the CONSUMERS entry", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("wpx");
  const cp = await insertCounterparty(firm, client, owner);
  const { eventId } = await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });

  // A non-CLR throw from the model call ⇒ a genuine dead-letter (not a terminal receipt).
  const boomDeps = { resolveConsent: present, synthesize: async () => { throw new Error("boom: model unavailable"); } };
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

test("[R3 F6] an AUTOMATIC replay after a repair RESOLVES the dead-letter atomically (no explicit redrive)", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("wpf6");
  const cp = await insertCounterparty(firm, client, owner);
  const { eventId } = await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });

  // Poison ONE cycle: a non-CLR throw dead-letters the event; the checkpoint does NOT advance.
  const boomDeps = { resolveConsent: present, synthesize: async () => { throw new Error("boom: model unavailable"); } };
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

test("[R3 F6] recordDeadLetter REFRESHES on re-failure — a stale-resolved row flips back to pending, attempts bump", { skip }, async () => {
  const { owner, firm, client } = await buildFirm("wpf6b");
  const cp = await insertCounterparty(firm, client, owner);
  const { eventId } = await emitEvent(firm, "counterparty.created", { client, actor: owner, payload: { counterparty_id: cp } });
  // boomDeps NEVER publishes (the throw precedes publish), so the event re-fails every cycle while
  // the checkpoint stays behind — no already_projected short-circuit can hide the re-failure.
  const boomDeps = { resolveConsent: present, synthesize: async () => { throw new Error("boom: model unavailable"); } };

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

test("[R3 F2/F3] a CONFIGURATION refusal (isolation_unsupported) BLOCKS the cursor, surfaces configurationBlocked, then self-heals", { skip: skip19 }, async () => {
  const { owner, firm, client } = await buildFirm("wpcfg");
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
