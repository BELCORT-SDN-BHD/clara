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
  isConfigurationRefusal,
  terminalStatusFor,
  CONFIG_DEAD_LETTER_PREFIX,
} from "../lib/wiki-projection.mjs";
import { wikiColdStartReady, startWikiProjectionLoop } from "../lib/wiki-projection-ops.mjs";
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
      if (/from clara\.seeding_proposals/.test(s)) return o.proposal ? { rows: [o.proposal], rowCount: 1 } : { rows: [], rowCount: 0 };
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
test("CONSUMERS entry is runtime-role; the subscription SET is the 8 registered types", () => {
  assert.equal(CONSUMERS.wiki_projection.name, WIKI_PROJECTION_CONSUMER);
  assert.equal(CONSUMERS.wiki_projection.identity, "runtime-role");
  // 0019 adds document.filing_retired — the WB-R21 stale lane. It is a document.* type,
  // NOT a wiki.* one, so P17 (never re-synthesize from wiki.*) is untouched.
  assert.deepEqual([...WIKI_PROJECTION_EVENT_TYPES].sort(), [
    "counterparty.created", "counterparty.merged", "document.classified",
    "document.filing_retired", "egress.consent_granted", "egress.consent_revoked",
    "entry.approved", "seeding.proposal_decided",
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

// --- the deterministic seeding wiki_fact lane (F13) ---------------------------------------------
const PROP = randomUUID();
const wikiFactProposal = (over = {}) => ({
  proposal_kind: "wiki_fact", state: "ticked", client_id: CLIENT,
  payload: { wiki: {
    slug: "prior-gl/acmesupplies", title: "Prior-GL activity — Acme Supplies",
    page_kind: "recurring_pattern", content: "# Prior-GL activity — Acme Supplies\n\nRoutine vendor.",
  } },
  evidence: { occurrence_count: 3, date_span: { first: "2025-01-02", last: "2025-11-30" },
    line_cites: [{ region_id: "reg-1", text: "2025-01-02 Acme Supplies 5000 RM 1,200.00 DR" }] },
  ...over,
});
const seedingEv = (payloadOver = {}) => ev("seeding.proposal_decided", {
  documentId: DOC,
  payload: { decision: "ticked", proposal_kind: "wiki_fact", proposal_id: PROP, ...payloadOver },
});

test("ticked wiki_fact → deterministic publish (synthesis='deterministic', engine_id null, prior_gl_line cites, seq op_key)", async () => {
  const c = stubClient({ proposal: wikiFactProposal() });
  const plan = await planEvent(c, { firmId: FIRM, ev: seedingEv(), deps: {} });
  assert.equal(plan.status, "projected");
  assert.equal(plan.lane, "deterministic");
  const cap = stubClient({ proposal: wikiFactProposal() });
  await plan.mutate(cap);
  const call = cap.calls.find((x) => /publish_wiki_page_version/.test(x.sql));
  assert.ok(call, "calls publish_wiki_page_version");
  assert.equal(call.params[1], "prior-gl/acmesupplies", "slug from payload verbatim");
  assert.equal(call.params[2], "recurring_pattern", "page_kind from payload (never counterparty)");
  assert.equal(call.params[4], null, "counterparty is null for a fact page");
  assert.match(call.params[5], /^# Prior-GL activity/, "content built from the payload verbatim");
  assert.equal(call.params[10], "deterministic", "synthesis=deterministic");
  assert.equal(call.params[11], null, "engine_id NULL (no model)");
  assert.equal(call.params[12], 42, "projected_from_seq = the event seq");
  assert.equal(call.params[13], `wikiproj:${CLIENT}:42`, "seq-embedded op_key idiom");
  const cites = JSON.parse(call.params[8]);
  assert.equal(cites.length, 1);
  assert.equal(cites[0].source_kind, "prior_gl_line");
  assert.equal(cites[0].document_id, DOC, "citation binds the source prior-GL document");
  assert.equal(cites[0].detail.proposal_id, PROP);
});

test("declined seeding decision → checkpoint-only skip (no publish)", async () => {
  const plan = await planEvent(stubClient({ proposal: wikiFactProposal() }), {
    firmId: FIRM, ev: seedingEv({ decision: "declined" }), deps: {},
  });
  assert.equal(plan.status, "skipped_declined");
  assert.equal(plan.mutate, null);
});

test("ticked NON-wiki_fact decision (vendor_account_rule) → checkpoint-only skip", async () => {
  const plan = await planEvent(stubClient({ proposal: wikiFactProposal() }), {
    firmId: FIRM, ev: seedingEv({ proposal_kind: "vendor_account_rule" }), deps: {},
  });
  assert.equal(plan.status, "skipped_non_wiki_kind");
  assert.equal(plan.mutate, null);
});

test("wiki_fact for an ONBOARDING client is publishable (seeding runs during onboarding)", async () => {
  const plan = await planEvent(stubClient({ status: "onboarding", proposal: wikiFactProposal() }), {
    firmId: FIRM, ev: seedingEv(), deps: {},
  });
  assert.equal(plan.status, "projected");
});

test("wiki_fact for an ARCHIVED client → skipped_inactive_client", async () => {
  const plan = await planEvent(stubClient({ status: "archived", proposal: wikiFactProposal() }), {
    firmId: FIRM, ev: seedingEv(), deps: {},
  });
  assert.equal(plan.status, "skipped_inactive_client");
});

test("wiki_fact already published at/after this seq → already_projected (idempotent)", async () => {
  const plan = await planEvent(stubClient({ projectedSeq: 99, proposal: wikiFactProposal() }), {
    firmId: FIRM, ev: seedingEv(), deps: {},
  });
  assert.equal(plan.status, "already_projected");
  assert.equal(plan.mutate, null);
});

test("wiki_fact with a malformed payload (no content) → skipped_bad_wiki_fact (terminal, no dead-letter)", async () => {
  const bad = wikiFactProposal({ payload: { wiki: { slug: "prior-gl/x", title: "x", page_kind: "recurring_pattern", content: "" } } });
  const plan = await planEvent(stubClient({ proposal: bad }), { firmId: FIRM, ev: seedingEv(), deps: {} });
  assert.equal(plan.status, "skipped_bad_wiki_fact");
  assert.equal(plan.mutate, null);
});

test("wiki_fact claiming page_kind='counterparty' is refused (structural mismatch) → skipped_bad_wiki_fact", async () => {
  const bad = wikiFactProposal({ payload: { wiki: { slug: "prior-gl/x", title: "x", page_kind: "counterparty", content: "# x" } } });
  const plan = await planEvent(stubClient({ proposal: bad }), { firmId: FIRM, ev: seedingEv(), deps: {} });
  assert.equal(plan.status, "skipped_bad_wiki_fact");
});

test("wiki_fact with NO concrete line/region anchor → skipped_no_citation (provenance is NEVER fabricated, F-M12)", async () => {
  const noAnchor = wikiFactProposal({ evidence: { occurrence_count: 1, date_span: { first: null, last: null }, line_cites: [] } });
  const plan = await planEvent(stubClient({ proposal: noAnchor }), { firmId: FIRM, ev: seedingEv(), deps: {} });
  assert.equal(plan.status, "skipped_no_citation");
  assert.equal(plan.mutate, null, "no publish, no synthesized citation");
});

test("wiki_fact whose line_cites carry NO row/region (text-only) → skipped_no_citation", async () => {
  const soft = wikiFactProposal({ evidence: { occurrence_count: 1, line_cites: [{ text: "prose, no row or region anchor" }] } });
  const plan = await planEvent(stubClient({ proposal: soft }), { firmId: FIRM, ev: seedingEv(), deps: {} });
  assert.equal(plan.status, "skipped_no_citation");
});

test("wiki_fact with an xlsx PHYSICAL-row cite ({row}) publishes with that concrete anchor (F-M14 union)", async () => {
  const rowCite = wikiFactProposal({ evidence: { occurrence_count: 1, line_cites: [{ row: 7, text: "2025-03-14 Acme Supplies 5000 RM 1,200.00 DR" }] } });
  const plan = await planEvent(stubClient({ proposal: rowCite }), { firmId: FIRM, ev: seedingEv(), deps: {} });
  assert.equal(plan.status, "projected");
  const cap = stubClient({ proposal: rowCite });
  await plan.mutate(cap);
  const call = cap.calls.find((x) => /publish_wiki_page_version/.test(x.sql));
  const cites = JSON.parse(call.params[8]);
  assert.equal(cites.length, 1);
  assert.equal(cites[0].source_kind, "prior_gl_line");
  assert.equal(cites[0].detail.row, 7, "the physical row rides the citation detail");
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

// --- cold-start gates (native-review HIGH-2): dormant until surface + ceremony seed ------------

test("wikiColdStartReady maps the two gates; ready only when BOTH hold", async () => {
  const mk = (surface, seeded) => ({ query: async () => ({ rows: [{ surface, seeded }], rowCount: 1 }) });
  assert.deepEqual(await wikiColdStartReady(mk(false, false)), { surface: false, seeded: false, ready: false });
  assert.deepEqual(await wikiColdStartReady(mk(true, false)), { surface: true, seeded: false, ready: false });
  assert.deepEqual(await wikiColdStartReady(mk(false, true)), { surface: false, seeded: true, ready: false });
  assert.deepEqual(await wikiColdStartReady(mk(true, true)), { surface: true, seeded: true, ready: true });
});

test("the loop stays DORMANT while unseeded: no LISTEN, no discovery; stop() returns promptly", async () => {
  const queries = [];
  const fake = {
    async connect() {},
    on() {},
    async query(sql) {
      queries.push(String(sql));
      // acquireLeaderLock/setRuntimeRole ignore rows; the gate reads surface/seeded.
      return { rows: [{ surface: true, seeded: false }], rowCount: 1 };
    },
    async end() {},
  };
  const loop = startWikiProjectionLoop({ makeClient: () => fake, log: () => {} });
  // Let the loop connect, take leadership, and hit the gate at least once.
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(queries.some((q) => q.includes("to_regproc")), "the gate query ran");
  assert.ok(!queries.some((q) => q.includes("listen clara_events")), "no LISTEN while dormant");
  assert.ok(!queries.some((q) => q.includes("relay_checkpoints") && q.includes("coalesce")), "no discovery while dormant");
  const t0 = Date.now();
  await loop.stop();
  assert.ok(Date.now() - t0 < 2000, "stop() interrupts the dormancy poll promptly");
});

// --- ratchet R3: refusal classification + configuration self-heal (F2/F3) ----------------------

/** A typed clara refusal (with an optional {reason} discriminant), the shape the DB raises. */
const clr = (code, reason, msg = "x") =>
  Object.assign(new Error(msg), reason != null ? { code, detail: JSON.stringify({ reason }) } : { code });

test("[R3 F2] budget_unknown is a CONFIGURATION refusal, not terminal (repair + replay succeeds)", () => {
  const err = clr("CLR32", "budget_unknown", "wiki budget configuration is incomplete");
  assert.equal(isConfigurationRefusal(err), true,
    "budget_unknown is a missing config row — the checkpoint must stay BEHIND it, never past");
  assert.equal(terminalStatusFor(err), null,
    "…so it is NOT terminal: checkpointing past it would permanently lose the projection");
});

test("[R3 F2] a missing-EXECUTE-privilege 42501 is a CONFIGURATION refusal (a grant gap, not data)", () => {
  const err = Object.assign(new Error("permission denied for function"), { code: "42501" });
  assert.equal(isConfigurationRefusal(err), true);
  assert.equal(terminalStatusFor(err), null, "a raw SQLSTATE is never a terminal domain outcome");
});

test("[R3 F2] isolation_unsupported and CLR03 remain configuration refusals", () => {
  assert.equal(isConfigurationRefusal(clr("CLR32", "isolation_unsupported")), true);
  assert.equal(isConfigurationRefusal(clr("CLR03", null)), true);
});

test("[R3 F2] an UNKNOWN typed refusal is NEITHER terminal NOR configuration → non-exhausting", () => {
  const err = clr("CLR32", "some_future_reason");
  assert.equal(terminalStatusFor(err), null, "an unrecognised reason is not terminal — never checkpointed");
  assert.equal(isConfigurationRefusal(err), false,
    "…and not configuration either, so runTargetEvent flags it `unclassified` → BLOCKS the cursor until a human classifies it");
});

test("[R3 F2] the still-terminal reasons keep their exact mappings (the change is additive)", () => {
  assert.equal(terminalStatusFor(clr("CLR32", "stale_projected_from_seq")), "already_projected");
  assert.equal(terminalStatusFor(clr("CLR32", "bad_state")), "skipped_bad_state");
  assert.equal(terminalStatusFor(clr("CLR32", "cap_exceeded")), "skipped_cap");
  assert.equal(terminalStatusFor(clr("CLR32", "consent_held")), "held_consent");
  assert.ok(CONFIG_DEAD_LETTER_PREFIX.length > 0, "the config dead-letter prefix is a real string the health query keys on");
});

test("[R3 F3] a configuration-blocked cycle RELEASES the connection (advisory lock) and reconnects after the backoff", async () => {
  let made = 0;
  const clients = [];
  const makeClient = () => {
    const c = {
      ended: false,
      async connect() {},
      on() {}, once() {}, removeListener() {},
      // acquireLeaderLock/setRuntimeRole ignore rows; the cold-start gate is READY.
      async query() { return { rows: [{ surface: true, seeded: true, ready: true }], rowCount: 1 }; },
      async end() { this.ended = true; },
    };
    made++; clients.push(c);
    return c;
  };
  // First cycle reports configurationBlocked; later cycles are quiet.
  let cycles = 0;
  const runCycle = async () => {
    cycles++;
    return cycles === 1
      ? { firms: 1, effects: 0, capped: false, configurationBlocked: true }
      : { firms: 0, effects: 0, capped: false, configurationBlocked: false };
  };
  const loop = startWikiProjectionLoop({ makeClient, runCycle, configBackoffMs: 40, log: () => {} });
  await new Promise((r) => setTimeout(r, 300)); // acquire → cycle#1 (blocked) → release → backoff → reconnect → cycle#2
  await loop.stop();

  assert.ok(clients[0]?.ended, "the FIRST connection was CLOSED — the session advisory lock is released for a standby");
  assert.ok(made >= 2, `the leader RECONNECTED after the block instead of pinning the lock (makeClient called ${made}×)`);
  assert.ok(cycles >= 2, "…and a fresh cycle ran on the new connection (the self-heal path)");
});

test("model-lane mutate re-checks recency IN-TXN: a newer published seq makes it a no-op (codex F9)", async () => {
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: ev("counterparty.created", { payload: { counterparty_id: CP } }),
    deps: { resolveConsent: present, synthesize: goodSynth, putWiki: okPut, verifyWiki: okVerify },
  });
  assert.equal(plan.status, "projected");
  // At mutate time a NEWER version (seq 99 > 42) has landed: the publish must not fire.
  const newer = stubClient({ projectedSeq: 99 });
  await plan.mutate(newer);
  assert.ok(!newer.calls.some((x) => /publish_wiki_page_version/.test(x.sql)), "no publish over a newer seq");
  // And with an older seq the publish still fires.
  const older = stubClient({ projectedSeq: 7 });
  await plan.mutate(older);
  assert.ok(older.calls.some((x) => /publish_wiki_page_version/.test(x.sql)), "publish proceeds over an older seq");
});
