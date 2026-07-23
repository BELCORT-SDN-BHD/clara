// Wave B — wiki-projection consumer UNIT tests (no DB). Proves the lane-dispatch receipt matrix,
// the op_key idioms, the safeWikiKey accept/reject grammar, the governed-egress purpose entry,
// the consent-hold path, the CLR→terminal mapping, and orphan-repair idempotence (put-409) —
// all with a stubbed pg client + the local Storage shim. Mirrors the stub-pools discipline of
// wave-a21-chatturn-v6.test.mjs. Serial, no network (deps.synthesize is injected).

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  planEvent,
  contentSha256,
  wikiStorageKey,
  WIKI_PROJECTION_EVENT_TYPES,
  WIKI_PROJECTION_CONSUMER,
  CONSUMERS,
} from "../lib/wiki-projection.mjs";
import { safeWikiKey, putWikiCanonical, verifyWikiCanonical, StorageError } from "../lib/storage.mjs";
import { GOVERNED_EGRESS_PURPOSES } from "../lib/egress.mjs";

const FIRM = randomUUID();
const CLIENT = randomUUID();
const CP = randomUUID();
const DOC = randomUUID();
const HEX64 = "a".repeat(64);

// A stubbed pg client: canned reads for isClientActive / currentProjectedSeq / get_wiki_page,
// begin/rollback/set_config no-ops, and a capture log so we can assert the mutate SQL + op_key.
function stubClient(o = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      const s = String(sql);
      if (/from clara\.clients/.test(s)) return { rows: [{ status: o.status ?? "active" }], rowCount: o.clientFound === false ? 0 : 1 };
      if (/projected_from_seq/.test(s)) return o.projectedSeq != null ? { rows: [{ seq: o.projectedSeq }], rowCount: 1 } : { rows: [], rowCount: 0 };
      if (/get_wiki_page/.test(s)) return { rows: [{ page: o.existing ?? null }], rowCount: 1 };
      return { rows: [], rowCount: 0 }; // begin / rollback / set_config / mutate
    },
  };
}
const ev = (type, extra = {}) => ({ seq: 42, id: randomUUID(), firmId: FIRM, eventType: type, clientId: CLIENT, documentId: null, payload: {}, ...extra });
const goodSynth = async () => ({ title: "Acme Sdn Bhd", content: "# Acme Sdn Bhd\n\nRoutine vendor." });
const present = async () => "present";
const absent = async () => "absent";
const okPut = async () => ({ created: true, existed: false });
const okVerify = async () => ({ sha256: "x" });

// --- safeWikiKey accept/reject matrix -----------------------------------------------------------
test("safeWikiKey accepts the wiki grammar and rejects docs keys / traversal / bad sha / non-.md", () => {
  const ok = `firms/${FIRM}/wiki/${CLIENT}/${HEX64}.md`;
  assert.equal(safeWikiKey(ok), ok);
  for (const bad of [
    `firms/${FIRM}/docs/${HEX64}.pdf`, // the docs family — never on the wiki path
    `firms/${FIRM}/wiki/${CLIENT}/${HEX64}.txt`, // wrong extension
    `firms/${FIRM}/wiki/${CLIENT}/${"a".repeat(63)}.md`, // short sha
    `firms/../wiki/${CLIENT}/${HEX64}.md`, // path traversal
    `firms/${FIRM}/wiki/${HEX64}.md`, // missing client segment
    "", // empty
  ]) {
    assert.throws(() => safeWikiKey(bad), (e) => e instanceof StorageError, `must reject: ${bad}`);
  }
});

test("wikiStorageKey + contentSha256 produce a valid, content-addressed wiki key", () => {
  const sha = contentSha256("hello");
  const key = wikiStorageKey(FIRM, CLIENT, sha);
  assert.equal(safeWikiKey(key), key);
  assert.match(sha, /^[0-9a-f]{64}$/);
});

// --- governed-egress purpose entry --------------------------------------------------------------
test("GOVERNED_EGRESS_PURPOSES.wiki_synthesis names the consent discipline", () => {
  const p = GOVERNED_EGRESS_PURPOSES.wiki_synthesis;
  assert.equal(p.purpose, "wiki_synthesis");
  assert.equal(p.consentRequired, true);
  assert.equal(p.engineIdRequired, true);
  assert.match(p.consentSurface, /client_egress_consents/);
  assert.match(p.heldStatePath, /set_wiki_synthesis_hold/);
});

// --- registry + subscription ------------------------------------------------------------------
test("CONSUMERS entry is runtime-role; the subscription SET is the 6 registered types", () => {
  assert.equal(CONSUMERS.wiki_projection.name, WIKI_PROJECTION_CONSUMER);
  assert.equal(CONSUMERS.wiki_projection.identity, "runtime-role");
  assert.deepEqual([...WIKI_PROJECTION_EVENT_TYPES].sort(), [
    "counterparty.created", "counterparty.merged", "document.classified",
    "egress.consent_granted", "egress.consent_revoked", "entry.approved",
  ]);
});

// --- receipt-mapping matrix + op_key idioms -----------------------------------------------------
test("entry.approved with a source doc → deterministic ingest (projected) + document-stable op_key", async () => {
  const c = stubClient();
  const plan = await planEvent(c, { firmId: FIRM, ev: ev("entry.approved", { documentId: DOC }), deps: {} });
  assert.equal(plan.status, "projected");
  assert.equal(plan.lane, "deterministic");
  const cap = stubClient();
  await plan.mutate(cap);
  const call = cap.calls.find((x) => /record_wiki_source_ingest/.test(x.sql));
  assert.ok(call, "calls record_wiki_source_ingest");
  assert.equal(call.params[3], `wikiingest:${CLIENT}:${DOC}`, "document-stable op_key");
});

test("entry.approved WITHOUT a source doc → skipped_kind", async () => {
  const plan = await planEvent(stubClient(), { firmId: FIRM, ev: ev("entry.approved", { documentId: null }), deps: {} });
  assert.equal(plan.status, "skipped_kind");
  assert.equal(plan.mutate, null);
});

test("document.classified (client not carried, default resolver) → skipped_unresolved_client", async () => {
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: ev("document.classified", { clientId: null, documentId: DOC }), deps: {},
  });
  assert.equal(plan.status, "skipped_unresolved_client");
});

test("document.classified with an injected resolver → deterministic ingest", async () => {
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: ev("document.classified", { clientId: null, documentId: DOC }),
    deps: { resolveDocumentClient: async () => CLIENT },
  });
  assert.equal(plan.status, "projected");
  assert.equal(plan.lane, "deterministic");
});

test("counterparty.created with consent present → model synthesis (projected) + seq-embedded op_key + engine_id", async () => {
  const c = stubClient();
  const plan = await planEvent(c, {
    firmId: FIRM, ev: ev("counterparty.created", { payload: { counterparty_id: CP } }),
    deps: { resolveConsent: present, synthesize: goodSynth, putWiki: okPut, verifyWiki: okVerify },
  });
  assert.equal(plan.status, "projected");
  assert.equal(plan.lane, "model");
  const cap = stubClient();
  await plan.mutate(cap);
  const call = cap.calls.find((x) => /publish_wiki_page_version/.test(x.sql));
  assert.ok(call, "calls publish_wiki_page_version");
  assert.equal(call.params[1], `counterparty/${CP}`, "slug keys the counterparty entity");
  assert.equal(call.params[2], "counterparty", "page_kind=counterparty");
  assert.equal(call.params[4], CP, "counterparty_id bound");
  assert.equal(call.params[10], "model", "synthesis=model");
  assert.ok(call.params[11], "engine_id NOT NULL (model synthesis)");
  assert.equal(call.params[13], `wikiproj:${CLIENT}:42`, "seq-embedded op_key (W4)");
  const cites = JSON.parse(call.params[8]);
  assert.equal(cites[0].source_kind, "counterparty");
  assert.equal(cites[0].counterparty_id, CP, "the counterparty citation (≥1 cite floor)");
});

test("counterparty.created with consent ABSENT → held_consent + sets the hold (no model call)", async () => {
  let synthCalled = false;
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: ev("counterparty.created", { payload: { counterparty_id: CP } }),
    deps: { resolveConsent: absent, synthesize: async () => { synthCalled = true; return goodSynth(); } },
  });
  assert.equal(plan.status, "held_consent");
  assert.equal(synthCalled, false, "the model is NEVER called without consent (no un-consented egress)");
  const cap = stubClient();
  await plan.mutate(cap);
  assert.ok(cap.calls.find((x) => /set_wiki_synthesis_hold/.test(x.sql)), "records the DB-side hold");
});

test("counterparty.merged synthesizes the SURVIVOR's page", async () => {
  const survivor = randomUUID();
  const c = stubClient();
  const plan = await planEvent(c, {
    firmId: FIRM, ev: ev("counterparty.merged", { payload: { survivor_id: survivor, merged_id: CP } }),
    deps: { resolveConsent: present, synthesize: goodSynth, putWiki: okPut, verifyWiki: okVerify },
  });
  assert.equal(plan.status, "projected");
  const cap = stubClient();
  await plan.mutate(cap);
  const call = cap.calls.find((x) => /publish_wiki_page_version/.test(x.sql));
  assert.equal(call.params[1], `counterparty/${survivor}`, "keys the survivor, not the merged id");
});

test("already_projected when the page's current version is at/after this seq (idempotent redrive)", async () => {
  const plan = await planEvent(stubClient({ projectedSeq: 100 }), {
    firmId: FIRM, ev: ev("counterparty.created", { seq: 42, payload: { counterparty_id: CP } }),
    deps: { resolveConsent: present, synthesize: goodSynth },
  });
  assert.equal(plan.status, "already_projected");
  assert.equal(plan.mutate, null);
});

test("non-active client → skipped_inactive_client for every synthesis/ingest lane", async () => {
  const onboarding = stubClient({ status: "onboarding" });
  const cp = await planEvent(onboarding, { firmId: FIRM, ev: ev("counterparty.created", { payload: { counterparty_id: CP } }), deps: { resolveConsent: present, synthesize: goodSynth } });
  assert.equal(cp.status, "skipped_inactive_client");
  const ing = await planEvent(stubClient({ status: "archived" }), { firmId: FIRM, ev: ev("entry.approved", { documentId: DOC }), deps: {} });
  assert.equal(ing.status, "skipped_inactive_client");
});

test("egress.consent_granted → consent_released (clears hold); egress.consent_revoked → held_consent (sets hold)", async () => {
  const granted = await planEvent(stubClient(), { firmId: FIRM, ev: ev("egress.consent_granted"), deps: {} });
  assert.equal(granted.status, "consent_released");
  let cap = stubClient();
  await granted.mutate(cap);
  assert.ok(cap.calls.find((x) => /clear_wiki_synthesis_hold/.test(x.sql)));

  const revoked = await planEvent(stubClient(), { firmId: FIRM, ev: ev("egress.consent_revoked"), deps: {} });
  assert.equal(revoked.status, "held_consent");
  cap = stubClient();
  await revoked.mutate(cap);
  assert.ok(cap.calls.find((x) => /set_wiki_synthesis_hold/.test(x.sql)));
});

test("an unsubscribed type dispatched to planEvent → skipped_kind (defensive)", async () => {
  const plan = await planEvent(stubClient(), { firmId: FIRM, ev: ev("wiki.page_published"), deps: {} });
  assert.equal(plan.status, "skipped_kind");
});

// --- Storage put→verify + orphan-repair idempotence (put-409) -----------------------------------
test("putWikiCanonical is idempotent (409 existed:true) and verify re-download matches the sha", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clara-wikiproj-"));
  const prevRoot = process.env.CLARA_TEST_STORAGE_DIR;
  process.env.CLARA_TEST_STORAGE_DIR = dir;
  try {
    const content = "# Page\n\nbody";
    const sha = contentSha256(content);
    const key = wikiStorageKey(FIRM, CLIENT, sha);
    const src = join(dir, "src.md");
    await writeFile(src, content, "utf8");
    const first = await putWikiCanonical(src, key, "text/markdown");
    assert.deepEqual(first, { created: true, existed: false }, "first put creates");
    const second = await putWikiCanonical(src, key, "text/markdown");
    assert.deepEqual(second, { created: false, existed: true }, "re-put is idempotent success (put-409)");
    await verifyWikiCanonical(key, sha); // re-download + sha compare
    await assert.rejects(() => verifyWikiCanonical(key, "b".repeat(64)), /hash mismatch/);
  } finally {
    if (prevRoot === undefined) delete process.env.CLARA_TEST_STORAGE_DIR;
    else process.env.CLARA_TEST_STORAGE_DIR = prevRoot;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
