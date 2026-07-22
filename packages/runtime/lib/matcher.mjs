// The matcher consumer — the deterministic, no-model attribution lane (Slice 5,
// contract §4.4 + §0 S5-D2; migration 0007 companion §3.4). A SECOND registered
// consumer on the Slice-3 event spine, reusing lib/relay.mjs's discovery/
// checkpoint/dead-letter primitives UNCHANGED (they already take `consumer`) — the
// router stays byte-identical (relay.mjs is not edited). Own name, own advisory
// lock key (hashtext('matcher')), own (consumer,firm) checkpoint, own dead-letter
// lane, own /ready warn signal. Subscribes to `document.extraction_completed` ONLY
// (no trigger_taxonomy read; every other type is a checkpoint-only advance). Never
// mints a wake intent, holds a task, runs an LLM, or files a document (S5-D2:
// assignment stays a human act, even for a lane-1 rule hit). The per-event handler
// runs the two lanes + the replay-key attempt with effects + checkpoint in ONE
// transaction, on ONE connection, across TWO identity scopes:
//   * Lane 1 (authorizing) — clara.record_rule_resolution(document, op_key)
//     recomputes the hard-identifier predicate SERVER-SIDE (method='rule' hit, or
//     an `abstained` attempt on a missing/shared identifier). 0007 grants its
//     EXECUTE to the clara_runtime_login LOGIN SHELL DIRECTLY, NOT the clara_runtime
//     GROUP (verified: login=t group=f); the login is a member with INHERIT FALSE,
//     so the narrow write surface is STRUCTURAL. The matcher makes THIS one call in
//     the RAW login identity (reset role → call → set role clara_runtime); a pooled
//     SET ROLE clara_runtime session gets 42501.
//   * Lane 2 (advisory) — unique exact name/alias hits become attribution
//     candidates via clara.record_attribution_attempt (granted to the group);
//     grouping input only, confirming is a human act; conflicts ABSTAIN with the
//     conflict REPRESENTED. The attempt row is the REPLAY KEY: idempotent on
//     (document,matcher_version,fingerprint) AND a deterministic op_key ⇒ a
//     re-delivered event produces ZERO new rows.
//
// LANE-2 READ SET (AB-1, migration 0008_runtime_read_surface): clara_runtime holds
// SELECT on document_extractions/document_regions/clients/client_aliases/
// client_identifiers, so the DEFAULT reader computes lane-2 candidates LIVE
// (firm hard-scoped in SQL — RLS is not the tenant boundary on this lane, §3.4).
// matchCandidates stays a pure unit-testable fn fed by an injectable reader
// (deps.readMatchInputs); the 42501 latch below is retained as a fail-safe for a
// mis-deployed grant set (degrades to lane-1-only, logged once, never fails the
// handler). Connections: env only, via pools.makeRuntimeClient.

import { setTimeout as sleep } from "node:timers/promises";
import { createHash } from "node:crypto";
import { discoverWork, writeCheckpoint, acquireLeaderLock, setRuntimeRole, redrive as routerRedrive } from "./relay.mjs";
import { makeRuntimeClient } from "./pools.mjs";
import { isConnErr, waitForNudge } from "./listen.mjs";

/** The matcher consumer name — its own checkpoint / dead-letter / lock key. */
export const MATCHER_CONSUMER = "matcher";
/** The matcher's replay-key matcher_version (attribution_attempts). */
export const MATCHER_VERSION = "matcher-v1";
/** The ONLY event type the matcher acts on; all others are checkpoint-only. */
export const MATCHER_EVENT_TYPE = "document.extraction_completed";

const MAX_ATTEMPTS = Number(process.env.CLARA_MATCHER_MAX_ATTEMPTS || 5);
const POLL_INTERVAL_MS = Number(process.env.CLARA_MATCHER_POLL_MS || 2000);
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;

let _lane2Disabled = false; // fail-safe latch: only fires if the 0008 read grants are missing (42501)
// ---------------------------------------------------------------------------
// Pure lane-2 candidate matching — no DB, fully unit-testable. UNIQUE exact
// name/alias hits become candidates; two+ distinct clients ⇒ conflict abstain.
// ADV-R2 R1#12: norm = the resolver's EXACT strip-normalization (0016 stores
// aliases canonically; trim/lower-only stopped matching "Acme Sdn. Bhd.").
// ---------------------------------------------------------------------------
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * @param {{regions?:{regionId?:string, text?:string}[], aliases?:{clientId:string, alias:string}[],
 *          clients?:{clientId:string, name:string}[]}} inputs
 * @returns {{candidates:{client_id:string, rank:number, rule_kind:string, region_ids:string[]}[], conflictReason:string|null}}
 */
export function matchCandidates({ regions = [], aliases = [], clients = [] } = {}) {
  // A normalized name/alias string can point at MULTIPLE clients (two siblings
  // sharing a name, an alias colliding with a name) — that collision is the very
  // conflict S5-D2 must represent, so the registry keeps every pointer, not one.
  const registry = new Map(); // normalized -> Array<{clientId, ruleKind}>
  const add = (k, clientId, ruleKind) => {
    if (!k) return;
    if (!registry.has(k)) registry.set(k, []);
    registry.get(k).push({ clientId, ruleKind });
  };
  for (const c of clients) add(norm(c.name), c.clientId, "name_exact");
  for (const a of aliases) add(norm(a.alias), a.clientId, "alias_exact");

  const hits = new Map(); // clientId -> { ruleKind, regionIds:Set }
  const bump = (clientId, ruleKind, regionId) => {
    const cur = hits.get(clientId) ?? { ruleKind, regionIds: new Set() };
    if (ruleKind === "name_exact") cur.ruleKind = "name_exact"; // name evidence never downgraded by an alias
    if (regionId) cur.regionIds.add(regionId);
    hits.set(clientId, cur);
  };
  for (const r of regions) {
    const t = norm(r.text);
    if (!t) continue;
    const entries = registry.get(t);
    if (entries) for (const e of entries) bump(e.clientId, e.ruleKind, r.regionId);
  }

  const distinct = [...hits.keys()].sort((a, b) => {
    const ra = hits.get(a).ruleKind === "name_exact" ? 0 : 1;
    const rb = hits.get(b).ruleKind === "name_exact" ? 0 : 1;
    return ra - rb || String(a).localeCompare(String(b));
  });
  const candidates = distinct.map((clientId, i) => ({
    client_id: clientId,
    rank: i + 1,
    rule_kind: hits.get(clientId).ruleKind,
    region_ids: [...hits.get(clientId).regionIds],
  }));
  const conflictReason = distinct.length > 1 ? "ambiguous-name-or-alias" : null;
  return { candidates, conflictReason };
}

// ---------------------------------------------------------------------------
// The default lane-2 reader — the ONE query surface needing read grants the
// committed 0007 does not give clara_runtime. Injectable (tests feed synthetic
// inputs; a future grant/fn lights lane 2 with no code change).
// ---------------------------------------------------------------------------

// 42501 under the as-built grants. C-7 (0009): PINNED to the raw-text engine_kinds so 0009's semantic `invoice_facts` extraction never false-matches a client / pollutes cites.
export async function readMatchInputs(client, { firmId, documentId }) {
  const regions = (
    await client.query(
      `select r.id as region_id, r.field_path, r.text_content as text
         from clara.document_extractions e
         join clara.document_regions r on r.extraction_id = e.id and r.firm_id = e.firm_id
        where e.document_id = $1 and e.firm_id = $2 and e.status = 'done' and e.engine_kind in ('ocr','structured_parse')`,
      [documentId, firmId],
    )
  ).rows.map((x) => ({ regionId: x.region_id, fieldPath: x.field_path, text: x.text }));
  const aliases = (
    await client.query(
      "select client_id, alias_normalized as alias from clara.client_aliases where firm_id = $1 and retired_at is null",
      [firmId],
    )
  ).rows.map((x) => ({ clientId: x.client_id, alias: x.alias }));
  const clients = (
    await client.query("select id as client_id, name from clara.clients where firm_id = $1", [firmId])
  ).rows.map((x) => ({ clientId: x.client_id, name: x.name }));
  return { regions, aliases, clients };
}

// Compute lane-2 candidates under a SAVEPOINT: a 42501 from the ungranted reads
// aborts the txn, so we roll back TO the savepoint to un-poison it and let the
// replay-key attempt still commit. The gap is latched off after the first hit (no
// per-event savepoint churn); a DB WITH the grants never latches.
async function computeLaneTwo(client, { firmId, documentId }, deps) {
  const log = deps.log ?? (() => {});
  const usingDefault = !deps.readMatchInputs; // the latch guards only the default (grant-gated) reader
  const reader = deps.readMatchInputs ?? readMatchInputs;
  if (usingDefault && _lane2Disabled) return { candidates: [], conflictReason: null, laneTwoAvailable: false };
  await client.query("savepoint mtc_lane2");
  let inputs;
  try {
    inputs = await reader(client, { firmId, documentId });
    await client.query("release savepoint mtc_lane2");
  } catch (err) {
    await client.query("rollback to savepoint mtc_lane2").catch(() => {});
    if (err?.code === "42501" && usingDefault) {
      if (!_lane2Disabled) {
        _lane2Disabled = true;
        log(
          "[matcher] lane-2 candidate generation DISABLED: clara_runtime lacks SELECT on " +
            "document_extractions/document_regions/clara.clients under committed 0007 — recording " +
            "lane-1 + replay-key only. Grant those SELECTs (or add a server-side lane-2 fn) to enable.",
        );
      }
      return { candidates: [], conflictReason: null, laneTwoAvailable: false };
    }
    throw err;
  }
  return { ...matchCandidates(inputs), laneTwoAvailable: true };
}

// ---------------------------------------------------------------------------
// Per-event effects — the two lanes + the replay-key attempt, inside the caller's
// OPEN transaction. The lane-1 role dance is contained here.
/** Deterministic 64-hex fingerprint (attribution_attempts CHECK: ^[0-9a-f]{64}$). */
function fingerprint(documentId, extractionId) {
  return createHash("sha256").update(`${documentId}:${extractionId ?? ""}`).digest("hex");
}

/**
 * Apply the S5-D2 effects for ONE extraction_completed event. MUST run inside an
 * open transaction on a clara_runtime-role connection whose LOGIN is
 * clara_runtime_login (the transient `reset role` reaches the login holding
 * record_rule_resolution's EXECUTE).
 * @returns {Promise<{rule:object, lane2:object}>}
 */
export async function applyMatcherEffects(client, { documentId, extractionId, firmId }, deps = {}) {
  // Lane 1 — the RAW-login-only call; the finally ALWAYS restores the group role.
  await client.query("reset role"); // -> clara_runtime_login (the session's login identity)
  let rule;
  try {
    const r = await client.query("select clara.record_rule_resolution($1, $2) as result", [
      documentId,
      `mtc:rule:${documentId}:${extractionId ?? "none"}`,
    ]);
    rule = r.rows[0].result;
  } finally {
    await client.query("set role clara_runtime"); // back to the group for everything else
  }

  const lane2 = await computeLaneTwo(client, { firmId, documentId }, deps);

  // The replay-key attempt: idempotent on (document,matcher_version,fingerprint)
  // AND the deterministic op_key ⇒ a re-delivery yields ZERO new rows.
  const fp = fingerprint(documentId, extractionId);
  await client.query("select clara.record_attribution_attempt($1, $2, $3, $4::jsonb, $5, $6) as result", [
    documentId,
    MATCHER_VERSION,
    fp,
    JSON.stringify(lane2.candidates),
    lane2.conflictReason,
    `mtc:attempt:${documentId}:${extractionId ?? "none"}`,
  ]);
  return { rule, lane2 };
}

// ---------------------------------------------------------------------------
// Dead-letter (consumer='matcher') — its OWN transaction so the attempt count
// survives the effect-transaction rollback. Returns the post-increment count.
async function recordMatcherDeadLetter(client, { eventId, reason }) {
  await client.query("begin");
  try {
    const r = await client.query(
      `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
         values ($1, $2, $3, null)
       on conflict (consumer, event_id) do update
         set attempt_count = clara.relay_dead_letters.attempt_count + 1
       returning attempt_count`,
      [MATCHER_CONSUMER, eventId, String(reason).slice(0, 500)],
    );
    await client.query("commit");
    return Number(r.rows[0].attempt_count);
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Per-firm processing — walk events > checkpoint in seq order; apply effects for
// matcher events (each its OWN effects+checkpoint txn, so a poison blocks only
// itself), coalesce checkpoint-only advances over every other type.
async function readEvents(client, firmId, lastSeq, batchSize) {
  const r = await client.query(
    `select seq, id, event_type, document_id, payload->>'extraction_id' as extraction_id
       from clara.domain_events
      where firm_id = $1 and seq > $2
      order by seq limit $3`,
    [firmId, lastSeq, batchSize],
  );
  return r.rows.map((row) => ({
    seq: Number(row.seq),
    id: row.id,
    eventType: row.event_type,
    documentId: row.document_id,
    extractionId: row.extraction_id,
  }));
}

async function checkpointOnly(client, { firmId, seq }) {
  await client.query("begin");
  try {
    await writeCheckpoint(client, { consumer: MATCHER_CONSUMER, firmId, seq });
    await client.query("commit");
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    throw err;
  }
}

/** Effects for one matcher event + its checkpoint, in ONE transaction. */
async function runEffectTxn(client, { firmId, ev, deps }) {
  await client.query("begin");
  try {
    await applyMatcherEffects(client, { documentId: ev.documentId, extractionId: ev.extractionId, firmId }, deps);
    await writeCheckpoint(client, { consumer: MATCHER_CONSUMER, firmId, seq: ev.seq });
    await client.query("commit");
    return { ok: true };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    await client.query("set role clara_runtime").catch(() => {}); // rollback reverts in-txn role; restore for the DL write
    const attempts = await recordMatcherDeadLetter(client, { eventId: ev.id, reason: err?.message ?? String(err) });
    return { ok: false, err, attempts };
  }
}

/** @returns {Promise<{readCount:number, maxSeq:number, effects:number, blocked:boolean}>} */
async function processMatcherFirm(client, { firmId, lastSeq, batchSize, deps }) {
  const log = deps.log ?? (() => {});
  const evs = await readEvents(client, firmId, lastSeq, batchSize);
  if (evs.length === 0) return { readCount: 0, maxSeq: lastSeq, effects: 0, blocked: false };

  let cursor = lastSeq;
  let effects = 0;
  for (const ev of evs) {
    if (ev.eventType !== MATCHER_EVENT_TYPE) continue; // checkpoint-only; coalesced below
    const res = await runEffectTxn(client, { firmId, ev, deps });
    if (res.ok) {
      cursor = ev.seq;
      effects += 1;
      continue;
    }
    if (res.attempts >= MAX_ATTEMPTS) {
      log(`[matcher] event=${ev.id} exhausted ${MAX_ATTEMPTS} attempts → dead-lettered + skipped: ${res.err?.message ?? res.err}`);
      await checkpointOnly(client, { firmId, seq: ev.seq }); // advance past the poison
      cursor = ev.seq;
      continue;
    }
    log(`[matcher] effect-error event=${ev.id} attempt=${res.attempts}/${MAX_ATTEMPTS}: ${res.err?.message ?? res.err}`);
    return { readCount: evs.length, maxSeq: cursor, effects, blocked: true }; // retry next cycle
  }

  const batchMax = evs[evs.length - 1].seq; // trailing/interior non-matcher events: one coalesced advance
  if (batchMax > cursor) {
    await checkpointOnly(client, { firmId, seq: batchMax });
    cursor = batchMax;
  }
  return { readCount: evs.length, maxSeq: cursor, effects, blocked: false };
}

// ---------------------------------------------------------------------------
// One full matcher cycle — discover firms behind the matcher checkpoint, drain
// each ROUND-ROBIN bounded to maxBatchesPerFirm (fairness, mirrors the router).
// ---------------------------------------------------------------------------

/** @returns {Promise<{firms:number, processed:number, effects:number, capped:boolean}>} */
export async function runMatcherCycle(client, opts = {}) {
  const { batchSize = 100, maxBatchesPerFirm = 4, onlyFirm = null, log = () => {} } = opts;
  const deps = { ...opts, log };
  const work = await discoverWork(client, { consumer: MATCHER_CONSUMER, onlyFirm });
  const cursors = work.map((w) => ({ firmId: w.firmId, lastSeq: w.lastSeq, active: true }));
  let processed = 0;
  let effects = 0;
  for (let round = 0; round < maxBatchesPerFirm; round++) {
    let anyActive = false;
    for (const cur of cursors) {
      if (!cur.active) continue;
      const res = await processMatcherFirm(client, { firmId: cur.firmId, lastSeq: cur.lastSeq, batchSize, deps });
      if (res.blocked || res.maxSeq <= cur.lastSeq) {
        cur.active = false; // a poison held us up (retry next cycle) OR no progress (caught up)
        continue;
      }
      cur.lastSeq = res.maxSeq;
      processed += res.readCount;
      effects += res.effects;
      anyActive = true;
      if (res.readCount < batchSize) cur.active = false; // drained to head
    }
    if (!anyActive) break;
  }
  return { firms: work.length, processed, effects, capped: cursors.some((c) => c.active) };
}

// Consumer-specific redrive (matcher variant) — re-dispatches the MATCHER handler,
// NEVER the router's taxonomy projection. Idempotent (effects dedupe on op_key +
// fingerprint). Requires an existing consumer='matcher' dead-letter row.
async function readEventById(client, eventId) {
  const r = await client.query(
    "select firm_id, event_type, document_id, payload->>'extraction_id' as extraction_id from clara.domain_events where id = $1",
    [eventId],
  );
  if (r.rowCount === 0) return null;
  return { firmId: r.rows[0].firm_id, eventType: r.rows[0].event_type, documentId: r.rows[0].document_id, extractionId: r.rows[0].extraction_id };
}

export async function matcherRedrive(client, eventId, deps = {}) {
  await client.query("begin");
  try {
    const dl = await client.query(
      "select status from clara.relay_dead_letters where consumer = $1 and event_id = $2 for update",
      [MATCHER_CONSUMER, eventId],
    );
    if (dl.rowCount === 0) throw new Error(`matcher redrive: no dead-letter for consumer='matcher' event=${eventId} — nothing to redrive`);
    const ev = await readEventById(client, eventId);
    if (!ev) throw new Error(`matcher redrive: event ${eventId} not found`);
    if (ev.eventType !== MATCHER_EVENT_TYPE) throw new Error(`matcher redrive: event ${eventId} is '${ev.eventType}', not ${MATCHER_EVENT_TYPE}`);
    await applyMatcherEffects(client, { documentId: ev.documentId, extractionId: ev.extractionId, firmId: ev.firmId }, deps);
    await client.query("update clara.relay_dead_letters set status = 'resolved', resolved_at = now() where consumer = $1 and event_id = $2", [
      MATCHER_CONSUMER,
      eventId,
    ]);
    await client.query("commit");
    return { resolved: true, consumer: MATCHER_CONSUMER, documentId: ev.documentId };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* aborted/dead */
    }
    await client.query("set role clara_runtime").catch(() => {});
    throw err;
  }
}

// The registered-consumer table — the redrive dispatch seam (§4.4). The CLI
// (scripts/relay.mjs) selects an entry by `--consumer <name>`; the router entry
// preserves the EXACT relay.mjs redrive. `identity` tells the CLI which login the
// one-shot connection needs (matcher = the raw runtime LOGIN for the lane-1 grant).
export const CONSUMERS = Object.freeze({
  router: Object.freeze({ name: "router", identity: "runtime-role", redrive: (c, id, o) => routerRedrive(c, "router", id, o) }),
  matcher: Object.freeze({ name: "matcher", identity: "runtime-login", redrive: (c, id, o) => matcherRedrive(c, id, o) }),
});

// /ready warn signal — per-consumer lag + dead-letter counts (§4.4). Warn-only: a
// stalled matcher must NEVER take chat traffic down. The orchestrator wires this
// into lib/health.mjs's /ready warning block at integration.
/** @returns {Promise<{consumer:string, lag:number, pendingDeadLetters:number, firmsTracked:number}>} */
export async function matcherHealth(client) {
  const r = await client.query(
    `select
       coalesce((select sum(greatest(s.n - coalesce(c.last_seq, 0), 0))
                   from clara.firm_event_seq s
                   left join clara.relay_checkpoints c on c.consumer = $1 and c.firm_id = s.firm_id), 0)::bigint as lag,
       (select count(*) from clara.relay_dead_letters where consumer = $1 and status = 'pending')::int as pending_dead_letters,
       (select count(*) from clara.relay_checkpoints where consumer = $1)::int as firms_tracked`,
    [MATCHER_CONSUMER],
  );
  return {
    consumer: MATCHER_CONSUMER,
    lag: Number(r.rows[0].lag),
    pendingDeadLetters: r.rows[0].pending_dead_letters,
    firmsTracked: r.rows[0].firms_tracked,
  };
}

// The matcher leader loop — its OWN dedicated connection + advisory lock
// ('matcher'), mirroring the router leader (lib/leader.mjs) but with NO taxonomy
// (no HALT) and NO drain/reconcile. Structurally independent: a matcher stall never
// touches the router's leadership/readiness/heartbeat. The supervisor starts this
// alongside the router leader at integration; `deps.makeClient` is injectable.
/**
 * @param {{log?:Function, makeClient?:()=>import("pg").Client, batchSize?:number,
 *          maxBatchesPerFirm?:number, readMatchInputs?:Function}} [deps]
 * @returns {{stop:()=>Promise<void>, done:Promise<void>}}
 */
export function startMatcherLoop(deps = {}) {
  const log = deps.log ?? (() => {});
  const makeClient = deps.makeClient ?? makeRuntimeClient;
  const stopRef = { stop: false, wake: null };

  const loop = (async () => {
    let backoff = RECONNECT_BASE_MS;
    while (!stopRef.stop) {
      const client = makeClient();
      let connErr = null;
      client.on("error", (e) => {
        connErr = e;
      });
      try {
        await client.connect();
        await setRuntimeRole(client); // N10 — set role clara_runtime (effects reset transiently)
        await acquireLeaderLock(client, MATCHER_CONSUMER); // BLOCKS until matcher leadership
        await client.query("listen clara_events");
        log("MATCHER acquired");
        backoff = RECONNECT_BASE_MS;
        while (!stopRef.stop) {
          if (connErr) throw connErr;
          let capped = false;
          try {
            const r = await runMatcherCycle(client, { ...deps, log });
            capped = r.capped;
          } catch (err) {
            if (connErr || isConnErr(err)) throw connErr ?? err;
            log(`MATCHER cycle-error ${err?.message ?? err}`); // transient — retry next poll
          }
          if (stopRef.stop) break;
          if (!capped) await waitForNudge(client, POLL_INTERVAL_MS, stopRef);
        }
      } catch (err) {
        if (stopRef.stop) break;
        log(`MATCHER connection-lost (${err?.message ?? err}) — reconnecting in ${backoff}ms`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
      } finally {
        await client.end().catch(() => {});
      }
    }
  })();

  return {
    stop: async () => {
      stopRef.stop = true;
      if (stopRef.wake) stopRef.wake();
      await loop.catch(() => {});
    },
    done: loop,
  };
}
