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
  consumeEgressDispatchDefault,
  contentSha256,
  wikiStorageKey,
  WIKI_PROJECTION_EVENT_TYPES,
  WIKI_PROJECTION_CONSUMER,
  CONSUMERS,
  isConfigurationRefusal,
  terminalStatusFor,
  CONFIG_DEAD_LETTER_PREFIX,
  HELD_CONSENT_REASON,
  WIKI_SYNTHESIS_PURPOSE,
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
const okPut = async () => ({ created: true, existed: false });
const okVerify = async () => ({ sha256: "x" });

// --- 0020 §3.7: the two-phase authorization, modelled as TWO DISTINCT INJECTABLE STEPS ----------
//
// The single `resolveConsent` dep is RETIRED and these tests no longer accept it. §3.1 explains
// why the old shape could never be a gate: it READ a purpose-blind relation, the revoker had no
// way to invalidate anything it returned, and the model call happened after the read returned. A
// test that keeps injecting `resolveConsent` would silently assert nothing at all — the consumer
// ignores the key — so every model-lane cell below drives PREPARE and CONSUME separately and
// counts the calls.
//
// §3.7 also requires a cell proving the SECOND boundary cannot be bypassed. `authz()` therefore
// wraps `synthesize` in a tripwire: calling the model without a prior successful consume THROWS,
// so a regression that skips the linearization point fails the suite instead of passing it.
const AUTH_ID = "11111111-2222-3333-4444-555555555555";
function authz({ prepare = "granted", consume = "granted", surface = true, synth = goodSynth } = {}) {
  const seen = { surface: 0, prepared: 0, consumed: 0, synthesized: 0, order: [], prepareArgs: null, consumeArgs: null };
  return {
    seen,
    hasSynthesisAuthorizationSurface: async () => { seen.surface++; seen.order.push("surface"); return surface; },
    prepareEgressDispatch: async (_c, args) => {
      seen.prepared++; seen.order.push("prepare"); seen.prepareArgs = args;
      return prepare === "granted"
        ? { verdict: "granted", authorization_id: AUTH_ID }
        : { verdict: "unknown", authorization_id: null };
    },
    consumeEgressDispatch: async (_c, args) => {
      seen.consumed++; seen.order.push("consume"); seen.consumeArgs = args;
      return { verdict: consume };
    },
    synthesize: async (a) => {
      seen.order.push("synthesize");
      // THE BYPASS TRIPWIRE (§3.7). The model must never be reachable except through a consume
      // that returned `granted` — the dispatch linearization point. A default that quietly
      // synthesizes would make every model-lane cell below vacuous.
      if (seen.consumed === 0 || consume !== "granted") {
        throw new Error("BYPASS: deps.synthesize ran without a successful consume_egress_dispatch");
      }
      seen.synthesized++;
      return synth(a);
    },
    putWiki: okPut, verifyWiki: okVerify,
  };
}
/** A client that records every statement, for the transaction-shape cells. */
function txnStub({ verdict = "granted", failConsume = false } = {}) {
  const calls = [];
  return {
    calls,
    sqls: () => calls.map((x) => x.sql.trim().split(/\s+/)[0].toLowerCase()),
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      if (/consume_egress_dispatch/.test(String(sql))) {
        if (failConsume) throw Object.assign(new Error("consume blew up"), { code: "57014" });
        return { rows: [{ v: { verdict } }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

// 0020 ratchet R1-F2 — THE COMMIT DISCIPLINE, and why it lives in the helper and not in the loop.
//
// A PostgreSQL function cannot commit its caller's transaction. §3.6 claims consumption is the
// dispatch linearization point, and that claim is only unconditionally true if `granted` implies
// COMMITTED. The shipped loop happens to be autocommit-safe (a dedicated pg.Client, one statement),
// but the exported helper is a capability any caller can use — on a pooled or long-open connection
// a consume could return `granted` from an uncommitted transaction, the model would be called on an
// authorization the revoker still sees as spendable, and a later rollback would erase the only
// record that the bytes left. So the helper owns the transaction explicitly.
test("consumeEgressDispatchDefault commits the consume in its OWN transaction, before the model can be reached", async () => {
  const c = txnStub();
  const out = await consumeEgressDispatchDefault(c, {
    firmId: FIRM, authorizationId: AUTH_ID, clientId: CLIENT,
    purpose: WIKI_SYNTHESIS_PURPOSE, eventSeq: 42, eventType: "counterparty.created",
  });
  assert.deepEqual(out, { verdict: "granted" });
  assert.deepEqual(c.sqls(), ["begin", "select", "commit"],
    "begin → consume → commit; `granted` therefore MEANS committed for any caller (§3.6)");
  const call = c.calls.find((x) => /consume_egress_dispatch/.test(x.sql));
  assert.deepEqual(call.params, [FIRM, AUTH_ID, CLIENT, WIKI_SYNTHESIS_PURPOSE, 42, "counterparty.created"],
    "the full dispatch intent is bound, in the pinned argument order (§3.4 amendment)");
});

test("consumeEgressDispatchDefault ROLLS BACK and rethrows on failure — never a silent `unknown`", async () => {
  const c = txnStub({ failConsume: true });
  await assert.rejects(() => consumeEgressDispatchDefault(c, {
    firmId: FIRM, authorizationId: AUTH_ID, clientId: CLIENT,
    purpose: WIKI_SYNTHESIS_PURPOSE, eventSeq: 42, eventType: "counterparty.created",
  }), /consume blew up/);
  assert.deepEqual(c.sqls(), ["begin", "select", "rollback"], "rolled back, never committed");
  assert.ok(!c.sqls().includes("commit"),
    "a failed consume must not leave a committed consumption — and must not be mistaken for a refusal");
});

/** The 0020 resolver pair, injected. `status` is whatever the serialized DB verb would return. */
function resolver({ surface = true, status = "projected", throws = null } = {}) {
  const seen = { surface: 0, calls: 0, args: null };
  return {
    seen,
    hasResolverSurface: async () => { seen.surface++; return surface; },
    resolveAndIngestWikiSource: async (_c, args) => {
      seen.calls++; seen.args = args;
      if (throws) throw throws;
      return { status };
    },
  };
}

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
// 0020 §1.1 CHANGED THE SURFACE THIS REGISTRY NAMES, and the change is the whole point of the
// migration. Before 0020 the entry named `clara.client_egress_consents` — the PURPOSE-BLIND legacy
// relation whose live-row predicate also authorizes the invoice-facts lane (0015:3361-3366). §1.1
// withdrew that: carrying a typed wiki grant there would make a wiki consent ALSO authorize
// invoice-facts egress, and `revoke_client_egress` (no purpose, no ordering, no STRICT) would
// revoke an arbitrary one of two live rows. So the typed purpose got its OWN relation, plus a
// positive owner ACTIVATION (§2), reachable only through the two DEFINER verbs (§3.3/§3.4). The
// assertion is re-aimed and STRENGTHENED: it now pins the typed pair, both verbs, and — the
// load-bearing half — that the legacy purpose-blind relation is NOT named as this purpose's surface.
test("GOVERNED_EGRESS_PURPOSES.wiki_synthesis names the TYPED consent discipline (0020 §1.1/§3)", () => {
  const p = GOVERNED_EGRESS_PURPOSES.wiki_synthesis;
  assert.equal(p.purpose, "wiki_synthesis");
  assert.equal(p.consentRequired, true);
  assert.equal(p.engineIdRequired, true);
  assert.match(p.consentSurface, /client_egress_purpose_consents/, "the typed consent relation (§1.2)");
  assert.match(p.consentSurface, /client_egress_purpose_activations/, "…AND the positive activation (§2.2) — a grant alone never authorizes");
  assert.match(p.consentSurface, /prepare_egress_dispatch/, "the plan-time verdict verb (§3.3)");
  assert.match(p.consentSurface, /consume_egress_dispatch/, "the dispatch linearization point (§3.4)");
  assert.doesNotMatch(p.consentSurface, /client_egress_consents/,
    "the LEGACY purpose-blind relation is NOT this purpose's surface — it governs invoice-facts and nothing else (§1.1/§6)");
  assert.match(p.heldStatePath, /set_wiki_synthesis_hold/);
});

// --- registry + subscription ------------------------------------------------------------------
test("CONSUMERS entry is runtime-role; the subscription SET is the 13 registered types", () => {
  assert.equal(CONSUMERS.wiki_projection.name, WIKI_PROJECTION_CONSUMER);
  assert.equal(CONSUMERS.wiki_projection.identity, "runtime-role");
  // 0019 added document.filing_retired — the WB-R21 stale lane. 0020 adds FIVE more:
  //   * document.filed (§5.4) — the OTHER half of the topology-change surface. Without it a
  //     document classified while unfiled (or ambiguous) is checkpointed forever and its
  //     re-drive can only ever fire on a RETIREMENT, which is the rarer half of the pair.
  //   * the four egress.purpose_* typed events (§4.1/§4.2) — subscribed for observability and
  //     ordering only; the DB owns their hold transitions inside the owner-floored RPCs.
  // Every added type is document.* or egress.*, NOT wiki.*, so P17 (never re-synthesize from
  // wiki.*) is untouched.
  assert.deepEqual([...WIKI_PROJECTION_EVENT_TYPES].sort(), [
    "counterparty.created", "counterparty.merged", "document.classified",
    "document.filed", "document.filing_retired",
    "egress.consent_granted", "egress.consent_revoked",
    "egress.purpose_activated", "egress.purpose_consent_granted",
    "egress.purpose_consent_revoked", "egress.purpose_deactivated",
    "entry.approved", "seeding.proposal_decided",
  ]);
  assert.ok(![...WIKI_PROJECTION_EVENT_TYPES].some((t) => t.startsWith("wiki.")),
    "NO wiki.* type is subscribed (P17) — the lane's own effects emit no event to loop on");
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

// 0020 §10.2 — the LANE-LOCAL fallback. Without the exact resolver pair the classified lane
// degrades to today's receipt instead of dead-lettering the whole projection.
test("document.classified with the 0020 resolver pair ABSENT → skipped_unresolved_client (§10.2 fallback)", async () => {
  const r = resolver({ surface: false });
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: ev("document.classified", { clientId: null, documentId: DOC }), deps: r,
  });
  assert.equal(plan.status, "skipped_unresolved_client");
  assert.equal(plan.mutate, null, "checkpoint-only — no write is attempted without the surface");
  assert.equal(r.seen.calls, 0, "the absent verb is never invoked");
});

// 0020 §5.4 REPLACED THE INJECTED PLAN-TIME RESOLVER. The old cell injected
// `deps.resolveDocumentClient` returning a client id, which the lane then handed to
// record_wiki_source_ingest — the exact read-then-mutate shape §5.2 shows cannot be closed: between
// the read and the write a filing for B can commit, and record_wiki_source_ingest re-checks only
// that A still has an ACTIVE FILING (0017:2238-2242), never that A is still the ONLY client. So the
// document→client decision moved INSIDE clara.resolve_and_ingest_wiki_source, which re-decides
// uniqueness under the §5.3 filing-topology lock pair and ingests in the SAME transaction. The
// consumer therefore no longer learns a client id at all, and the receipt is whatever the verb
// returns — which is why it is refined from `mutate`, not from the plan.
test("document.classified → the SERIALIZED verb inside the effect txn; no client id is ever resolved consumer-side", async () => {
  const r = resolver({ status: "projected" });
  const c = stubClient();
  const plan = await planEvent(c, {
    firmId: FIRM, ev: ev("document.classified", { clientId: null, documentId: DOC }), deps: r,
  });
  assert.equal(plan.status, "projected");
  assert.equal(plan.lane, "resolved_ingest");
  assert.equal(r.seen.calls, 0, "the verb runs in the EFFECT txn (mutate), never at plan time");
  const cap = stubClient();
  const effect = await plan.mutate(cap);
  assert.equal(r.seen.calls, 1);
  assert.deepEqual(r.seen.args, { firmId: FIRM, documentId: DOC }, "firm-scoped (§5.1: p_firm is required) + the document; NO client");
  assert.deepEqual(effect, { status: "projected" }, "the receipt is refined from the verb's own status");
  assert.ok(!cap.calls.some((x) => /record_wiki_source_ingest/.test(x.sql)),
    "the consumer NEVER calls the audited writer directly on this lane — the serialized verb owns the write");
});

// §5.4/§9.6 — the three-way receipt. Ambiguity earns its OWN token: the discriminant survives
// operationally even though no candidate identity and no count ever leaves the database (§5.1).
test("document.classified receipts are refined from the verb: ambiguous / unresolved / unclassified", async () => {
  for (const status of ["skipped_ambiguous_client", "skipped_unresolved_client", "skipped_unclassified"]) {
    const r = resolver({ status });
    const plan = await planEvent(stubClient(), {
      firmId: FIRM, ev: ev("document.classified", { clientId: null, documentId: DOC }), deps: r,
    });
    assert.deepEqual(await plan.mutate(stubClient()), { status }, `${status} rides through the refinement`);
  }
});

// §5.4 — the NEW document.filed re-drive subscription (the other half of the topology surface).
test("document.filed → the same serialized verb on the redrive lane; absent surface is checkpoint-only", async () => {
  const r = resolver({ status: "projected" });
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: ev("document.filed", { clientId: null, documentId: DOC }), deps: r,
  });
  assert.equal(plan.lane, "filed_redrive");
  assert.deepEqual(await plan.mutate(stubClient()), { status: "projected" });

  const off = resolver({ surface: false });
  const dark = await planEvent(stubClient(), {
    firmId: FIRM, ev: ev("document.filed", { clientId: null, documentId: DOC }), deps: off,
  });
  assert.equal(dark.status, "skipped_no_surface", "§10.2: absent resolver pair ⇒ the re-drive lane is checkpoint-only");
  assert.equal(dark.mutate, null);
});

// 0020 §3.7 — the LIT path. `resolveConsent: present` no longer exists: a plan-time READ is not an
// authorization (§3.1), so the cell now PREPARES an authorization and CONSUMES it immediately
// before the model call. The dark counterpart (zero typed consent ⇒ every verdict `unknown`) is the
// production posture asserted two cells below and in the DB-integration suite.
test("counterparty.created, PREPARED + CONSUMED granted → model synthesis (projected) + seq-embedded op_key + engine_id", async () => {
  const c = stubClient();
  const a = authz();
  const plan = await planEvent(c, {
    firmId: FIRM, ev: ev("counterparty.created", { payload: { counterparty_id: CP } }), deps: a,
  });
  assert.equal(plan.status, "projected");
  assert.equal(plan.lane, "model");
  assert.deepEqual(a.seen.prepareArgs, {
    firmId: FIRM, clientId: CLIENT, purpose: WIKI_SYNTHESIS_PURPOSE, eventSeq: 42, eventType: "counterparty.created",
  }, "prepare carries firm + client + the typed purpose + the dispatch intent (§3.2/§3.3)");
  // 0020 ratchet R1-F1 (ratified §3.4 amendment, 2026-07-25). The consume no longer carries only
  // the opaque id: it re-presents the EXACT dispatch intent the authorization was minted for, and
  // the DB refuses a mismatch. v1.0's two-argument form made §3.2's client/purpose/event binding
  // audit-only — an authorization prepared for client A could be spent on a client-B dispatch and
  // the DB could not tell. The id stays opaque (it still encodes nothing); what changed is that
  // the caller must SAY what it is dispatching, and the DB checks.
  assert.deepEqual(a.seen.consumeArgs, {
    firmId: FIRM, authorizationId: AUTH_ID, clientId: CLIENT,
    purpose: WIKI_SYNTHESIS_PURPOSE, eventSeq: 42, eventType: "counterparty.created",
  }, "consume re-presents the full dispatch intent, byte-for-byte what prepare was given (§3.4)");
  assert.deepEqual(
    { ...a.seen.prepareArgs, authorizationId: AUTH_ID },
    { ...a.seen.consumeArgs },
    "…and it is the SAME intent — a lane that consumed under a different client/purpose/event would be spending an authorization it was not granted");
  // §3.7 pins the ORDER: the consume is the LAST db interaction before the model, and it comes
  // AFTER the wiki-context read — a third read could never buy what a state transition does.
  assert.deepEqual(a.seen.order, ["surface", "prepare", "consume", "synthesize"],
    "surface guard → prepare → (context read) → consume → model; the consume is the dispatch linearization point");
  assert.equal(a.seen.synthesized, 1);
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

// §10.1 — THE DARK POSTURE. With zero typed consents and zero activations every verdict is
// `unknown`, and the reason token + op key are UNCHANGED from as-built. That byte-equivalence is
// the entire DARK claim, so it is asserted literally, not by shape.
test("PREPARE unknown → held_consent with the UNCHANGED reason token + op key, and NO model call (§10.1 DARK)", async () => {
  const a = authz({ prepare: "unknown" });
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: ev("counterparty.created", { payload: { counterparty_id: CP } }), deps: a,
  });
  assert.equal(plan.status, "held_consent");
  assert.equal(a.seen.synthesized, 0, "the model is NEVER called on a non-granted verdict");
  assert.equal(a.seen.consumed, 0, "…and no authorization is consumed when none was granted");
  const cap = stubClient();
  await plan.mutate(cap);
  const hold = cap.calls.find((x) => /set_wiki_synthesis_hold/.test(x.sql));
  assert.ok(hold, "records the DB-side hold through the audited writer");
  assert.equal(hold.params[1], HELD_CONSENT_REASON, "the reason token is byte-identical to as-built");
  assert.equal(hold.params[1], "wiki synthesis consent unknown", "…pinned literally (§10.1)");
  assert.equal(hold.params[2], `wikihold:${CLIENT}:42`, "…and so is the op key shape");
});

// §3.4/§3.6 — THE DISPATCH LINEARIZATION POINT. A revocation that commits between prepare and
// consume must refuse, and the model must never be reached. This is the cell that proves the
// two-phase design buys something a second read could not: `granted` at plan time is not a licence.
test("PREPARED granted but CONSUME unknown (a revoke landed in between) → held_consent, zero egress", async () => {
  const a = authz({ prepare: "granted", consume: "unknown" });
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: ev("counterparty.created", { payload: { counterparty_id: CP } }), deps: a,
  });
  assert.equal(plan.status, "held_consent");
  assert.equal(a.seen.prepared, 1);
  assert.equal(a.seen.consumed, 1, "the consume DID run — it is what refused");
  assert.equal(a.seen.synthesized, 0, "no synthesize");
  assert.ok(!a.seen.order.includes("synthesize"), "…the model was not even entered: no put, no verify, no publish");
  const cap = stubClient();
  await plan.mutate(cap);
  assert.equal(cap.calls.find((x) => /set_wiki_synthesis_hold/.test(x.sql)).params[1], HELD_CONSENT_REASON,
    "the SAME terminal at both boundaries (§9.6) — externally indistinguishable from the dark path");
});

// §10.2 — the LANE-LOCAL synthesis fallback. A rollback or a reversed ceremony order must degrade
// this lane to today's dark held path, never dead-letter the whole projection.
test("the 0020 synthesis pair ABSENT → held_consent, and prepare is never even attempted (§10.2)", async () => {
  const a = authz({ surface: false });
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: ev("counterparty.created", { payload: { counterparty_id: CP } }), deps: a,
  });
  assert.equal(plan.status, "held_consent");
  assert.equal(a.seen.prepared, 0);
  assert.equal(a.seen.consumed, 0);
  assert.equal(a.seen.synthesized, 0);
});

test("counterparty.merged synthesizes the SURVIVOR's page", async () => {
  const survivor = randomUUID();
  const c = stubClient();
  const a = authz();
  const plan = await planEvent(c, {
    firmId: FIRM, ev: ev("counterparty.merged", { payload: { survivor_id: survivor, merged_id: CP } }), deps: a,
  });
  assert.equal(plan.status, "projected");
  assert.equal(a.seen.consumed, 1, "the survivor's page is model egress too — it goes through the same two phases");
  const cap = stubClient();
  await plan.mutate(cap);
  const call = cap.calls.find((x) => /publish_wiki_page_version/.test(x.sql));
  assert.equal(call.params[1], `counterparty/${survivor}`, "keys the survivor, not the merged id");
});

test("already_projected when the page's current version is at/after this seq (idempotent redrive)", async () => {
  const a = authz();
  const plan = await planEvent(stubClient({ projectedSeq: 100 }), {
    firmId: FIRM, ev: ev("counterparty.created", { seq: 42, payload: { counterparty_id: CP } }), deps: a,
  });
  assert.equal(plan.status, "already_projected");
  assert.equal(plan.mutate, null);
  assert.equal(a.seen.prepared, 0, "a converged event mints NO authorization — no stranded row, no needless audit");
});

test("non-active client → skipped_inactive_client for every synthesis/ingest lane", async () => {
  const a = authz();
  const cp = await planEvent(stubClient({ status: "onboarding" }), { firmId: FIRM, ev: ev("counterparty.created", { payload: { counterparty_id: CP } }), deps: a });
  assert.equal(cp.status, "skipped_inactive_client");
  assert.equal(a.seen.prepared, 0, "the client gate precedes authorization — an inactive client never mints one");
  const ing = await planEvent(stubClient({ status: "archived" }), { firmId: FIRM, ev: ev("entry.approved", { documentId: DOC }), deps: {} });
  assert.equal(ing.status, "skipped_inactive_client");
});

// 0020 §4.2 DELIBERATELY BROKE THE OLD COUPLING, and the old expectation encoded the bug. Before
// 0020 an `egress.consent_granted` — a LEGACY, NULL-PURPOSE row minted for the invoice-facts lane —
// CLEARED the wiki synthesis hold, and `egress.consent_revoked` set it. That let a consent given for
// one purpose silently release a control governing another, which is exactly what purpose limitation
// (WB-R23(1)) forbids. §4.2 makes both legacy events CHECKPOINT-ONLY for wiki. The cell is re-aimed
// to assert the ABSENCE of the coupling — not merely a different status — because "different" would
// also be satisfied by a lane that writes the hold somewhere else.
test("LEGACY egress.consent_granted/revoked are CHECKPOINT-ONLY for wiki — no hold is set OR cleared (§4.2)", async () => {
  for (const type of ["egress.consent_granted", "egress.consent_revoked"]) {
    const c = stubClient();
    const plan = await planEvent(c, { firmId: FIRM, ev: ev(type), deps: {} });
    assert.equal(plan.mutate, null, `${type}: no effect at all — the checkpoint just advances`);
    assert.equal(plan.status, "skipped_kind", `${type}: the existing generic no-op receipt (§4.2 names no new token)`);
    assert.ok(!c.calls.some((x) => /clear_wiki_synthesis_hold|set_wiki_synthesis_hold/.test(x.sql)),
      `${type}: an invoice-facts consent NEVER touches wiki authorization state again`);
  }
});

// §4.2 — the four TYPED events are checkpoint-only in the consumer too: the DB owns their hold
// transitions inside the owner-floored RPCs (§4.3), so the consumer has nothing to do but advance.
// They are subscribed for observability and ordering, not for effect.
test("the four TYPED egress.purpose_* events are checkpoint-only in the consumer (the DB owns the hold, §4.3)", async () => {
  for (const type of ["egress.purpose_consent_granted", "egress.purpose_consent_revoked",
    "egress.purpose_activated", "egress.purpose_deactivated"]) {
    const c = stubClient();
    const plan = await planEvent(c, { firmId: FIRM, ev: ev(type), deps: {} });
    assert.equal(plan.mutate, null, `${type}: no consumer-side effect`);
    assert.ok(!c.calls.some((x) => /clear_wiki_synthesis_hold|set_wiki_synthesis_hold/.test(x.sql)),
      `${type}: the hold transition lives inside activate_/deactivate_/revoke_client_egress_purpose, never here`);
  }
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

// RETIRED/REBUILT (F-A2 PR-3, OQ-3/D36): vendor_account_rule ticks WIDENED onto this SAME
// deterministic lane (tick_seeding_proposal stages payload.wiki.* itself, since it stopped
// minting a signed coding_rules row for this kind — see the migration's own header for the
// three grounds). "checkpoint-only skip" is no longer this kind's behaviour; it is the
// SAME dispatch a wiki_fact tick gets. A genuinely unrelated kind (counterparty_birth,
// never added to SEEDING_WIKI_PROPOSAL_KINDS) is the cell that still proves the skip.
const vendorAccountRuleProposal = (over = {}) => ({
  proposal_kind: "vendor_account_rule", state: "ticked", client_id: CLIENT,
  payload: { name: "ACME TRADING SDN BHD", account_code: "5000", wiki: {
    slug: `vendor-account/${CLIENT}`, title: "Vendor account coding: ACME TRADING SDN BHD",
    page_kind: "treatment", content: "ACME TRADING SDN BHD bills post to account 5000.",
  } },
  evidence: { occurrence_count: 14, date_span: { first: "2025-01-05", last: "2025-12-28" },
    line_cites: [{ region_id: "reg-2", text: "2025-01-05 ACME TRADING SDN BHD 5000 RM 300.00 DR" }] },
  ...over,
});

test("ticked vendor_account_rule decision → deterministic publish, the SAME lane a wiki_fact tick uses (OQ-3/D36)", async () => {
  const plan = await planEvent(stubClient({ proposal: vendorAccountRuleProposal() }), {
    firmId: FIRM, ev: seedingEv({ proposal_kind: "vendor_account_rule" }), deps: {},
  });
  assert.equal(plan.status, "projected");
  assert.equal(plan.lane, "deterministic");
  const cap = stubClient({ proposal: vendorAccountRuleProposal() });
  await plan.mutate(cap);
  const call = cap.calls.find((x) => /publish_wiki_page_version/.test(x.sql));
  assert.ok(call, "calls publish_wiki_page_version");
  assert.equal(call.params[1], `vendor-account/${CLIENT}`, "slug from the staged payload verbatim");
  assert.equal(call.params[2], "treatment", "page_kind is one already admitted by WIKI_FACT_PAGE_KINDS — no new kind added");
  assert.equal(call.params[4], null, "counterparty is null — publishes as a treatment page, not a counterparty page");
  assert.match(call.params[5], /ACME TRADING SDN BHD/, "content transcribes the admin's own decision verbatim");
  assert.equal(call.params[10], "deterministic", "synthesis=deterministic — no model, matching the estate's WB-R6(1) authority-boundary wall");
  assert.equal(call.params[11], null, "engine_id NULL (no model)");
});

test("ticked NON-wiki decision (counterparty_birth, genuinely unrelated) → checkpoint-only skip", async () => {
  const plan = await planEvent(stubClient({ proposal: wikiFactProposal() }), {
    firmId: FIRM, ev: seedingEv({ proposal_kind: "counterparty_birth" }), deps: {},
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

test("[0020 A5] the DETERMINISTIC-SOURCE ceiling is terminal under its OWN status — never conflated with skipped_cap", () => {
  assert.equal(terminalStatusFor(clr("CLR32", "source_cap_exceeded")), "skipped_source_cap",
    "max_source_pages_per_client exhaustion is terminal (a replay meets the identical ceiling)");
  assert.notEqual(terminalStatusFor(clr("CLR32", "source_cap_exceeded")),
    terminalStatusFor(clr("CLR32", "cap_exceeded")),
    "the two exhaustion modes must be distinguishable on a receipt — that is the point of the split key");
  assert.equal(isConfigurationRefusal(clr("CLR32", "source_cap_exceeded")), false,
    "a full source ceiling is a domain outcome, not a broken deployment");
});

test("[0020 A5] the reserved sources/ namespace refusal is a MALFORMED WRITE, enumerated so it cannot block the firm cursor", () => {
  // Reachable from this consumer: planSeedingWikiFact publishes a slug taken VERBATIM from a
  // model-authored seeding proposal, so a model can propose 'sources/<uuid>'.
  assert.equal(terminalStatusFor(clr("CLR32", "reserved_slug_namespace")), "skipped_bad_state",
    "a model-proposed page in the reserved namespace converges as a malformed write");
  assert.equal(isConfigurationRefusal(clr("CLR32", "reserved_slug_namespace")), false);
});

test("[0020 A5] budget_unknown stays a CONFIGURATION refusal after the THIRD budget row joined the same null check", () => {
  // §A5 reads max_source_pages_per_client through 0017's idiom and joins its null check, so a
  // missing row raises the SAME CLR32/budget_unknown — which must stay non-terminal, or a
  // deployment that forgot the row would silently checkpoint past every projection.
  const err = clr("CLR32", "budget_unknown", "wiki budget configuration is incomplete");
  assert.equal(terminalStatusFor(err), null, "never terminal — the checkpoint stays BEHIND it");
  assert.equal(isConfigurationRefusal(err), true, "repair the row, replay, and it projects");
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
    firmId: FIRM, ev: ev("counterparty.created", { payload: { counterparty_id: CP } }), deps: authz(),
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

// --- 0020 §5.4: the filing_retired lane now carries TWO effects in one transaction --------------

const retiredEv = () => ev("document.filing_retired", { documentId: DOC, payload: { filing_id: randomUUID() } });

test("document.filing_retired: the 0019 stale mark FIRST, then the 0020 re-drive attempt (§5.4)", async () => {
  const r = resolver({ status: "projected" });
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: retiredEv(), deps: { ...r, hasStaleWriter: async () => true },
  });
  assert.equal(plan.status, "citations_staled", "the 0019 receipt is unchanged — the re-drive does not rename the lane");
  const cap = stubClient();
  const effect = await plan.mutate(cap);
  const order = cap.calls.map((x) => x.sql).filter((s) => /mark_wiki_citations_stale|savepoint/i.test(s));
  assert.match(order[0], /mark_wiki_citations_stale/, "the 0019 effect commits first");
  assert.equal(r.seen.calls, 1, "…then the serialized verb is attempted for the same document");
  assert.deepEqual(effect, { redrive: "projected" }, "the re-drive outcome rides the receipt WITHOUT displacing citations_staled");
});

test("document.filing_retired with the 0020 resolver pair absent → the 0019 lane is untouched (§10.2)", async () => {
  const r = resolver({ surface: false });
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: retiredEv(), deps: { ...r, hasStaleWriter: async () => true },
  });
  const cap = stubClient();
  assert.equal(await plan.mutate(cap), null);
  assert.ok(cap.calls.some((x) => /mark_wiki_citations_stale/.test(x.sql)), "the 0019 stale mark still happens");
  assert.equal(r.seen.calls, 0);
});

// DEFECT FOUND IN THE REWIRE (fixed in lib/wiki-projection.mjs, not asserted away here).
// The re-drive was running BARE inside the effect transaction. An ENUMERATED terminal refusal from
// the serialized verb — CLR32/cap_exceeded when the client is at its wiki page cap is the reachable
// one — aborts that transaction, rolling back mark_wiki_citations_stale; runTargetEvent then maps
// the refusal through the closed terminal table and CHECKPOINTS the event. The 0019 §4 guarantee
// (a retirement marks the citing client's live wiki sources stale) would be silently lost forever,
// and the citation would never converge. The fix is a SAVEPOINT around the attempt only.
test("[defect] a TERMINAL re-drive refusal must NOT roll back the 0019 stale mark (savepoint containment)", async () => {
  const capExceeded = Object.assign(new Error("wiki page cap exceeded"), {
    code: "CLR32", detail: JSON.stringify({ reason: "cap_exceeded" }),
  });
  assert.equal(terminalStatusFor(capExceeded), "skipped_cap",
    "…and it IS terminal, which is exactly why it would have been checkpointed past");
  const r = resolver({ throws: capExceeded });
  const plan = await planEvent(stubClient(), {
    firmId: FIRM, ev: retiredEv(), deps: { ...r, hasStaleWriter: async () => true },
  });
  const cap = stubClient();
  const effect = await plan.mutate(cap);
  assert.ok(cap.calls.some((x) => /mark_wiki_citations_stale/.test(x.sql)), "the 0019 effect was issued");
  assert.ok(cap.calls.some((x) => /^savepoint wiki_redrive$/i.test(x.sql.trim())), "the attempt ran under a savepoint");
  assert.ok(cap.calls.some((x) => /rollback to savepoint wiki_redrive/i.test(x.sql)),
    "…and only the ATTEMPT was rolled back — the stale mark survives to commit with the checkpoint");
  assert.deepEqual(effect, { redrive: "refused:CLR32/cap_exceeded" }, "the refusal is REPORTED, not swallowed");
});

test("[defect] a NON-terminal re-drive failure still aborts the whole event (the checkpoint stays behind)", async () => {
  for (const [err, label] of [
    [Object.assign(new Error("wiki budget configuration is incomplete"), { code: "CLR32", detail: JSON.stringify({ reason: "budget_unknown" }) }), "a CONFIGURATION refusal"],
    [Object.assign(new Error("deadlock detected"), { code: "40P01" }), "a deadlock (residual R-1)"],
    [Object.assign(new Error("some future reason"), { code: "CLR32", detail: JSON.stringify({ reason: "not_in_the_table" }) }), "an UNRECOGNISED typed refusal"],
  ]) {
    const plan = await planEvent(stubClient(), {
      firmId: FIRM, ev: retiredEv(), deps: { ...resolver({ throws: err }), hasStaleWriter: async () => true },
    });
    await assert.rejects(() => plan.mutate(stubClient()), (e) => e === err,
      `${label} must PROPAGATE so the whole transaction rolls back and the event re-drives — it is not a convergence`);
  }
});
