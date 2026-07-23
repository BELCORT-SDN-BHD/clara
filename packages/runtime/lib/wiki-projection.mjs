// The wiki-projection consumer (Wave B, migration 0017 W4/W5/W9/P17). A registered spine
// consumer beside router/matcher/sst_watch/facts_gate, reusing lib/relay.mjs primitives
// UNCHANGED (own name/advisory-lock/checkpoint/dead-letter/`/ready` WARN/dedicated LISTEN client).
// It maintains the Layer-1 client wiki index as an EVENT-SPINE PROJECTION (WB-R3): (a) DETERMINISTIC
// ingest (no model/consent, WB-R10) — entry.approved with a source doc → record_wiki_source_ingest;
// (b) MODEL synthesis (consent-gated, W9) — counterparty.created/merged → synthesize the counterparty
// page, content-address in Storage, verify by re-download, THEN publish_wiki_page_version. Terminal
// receipts (checkpoint-advancing, no retry): projected|already_projected|skipped_inactive_client|
// held_consent|consent_released|skipped_kind + CLR32 wiki refusals mapped terminal; only a genuine
// throw dead-letters (matcher idiom). op_keys: model 'wikiproj:<client>:<seq>'; ingest
// 'wikiingest:<client>:<document>'; consent 'wikihold:/wikirelease:<client>:<seq>'. P17: never
// subscribes to / re-synthesizes from wiki.*. Cold start (checkpoint seed + backfill + repair) is a
// CEREMONY item, never boot. Three reads are INJECTABLE + FAIL CLOSED under the 0008 grants (no
// runtime document→client link, no SELECT on counterparties/client_egress_consents).

import { createHash, randomUUID } from "node:crypto";
import { writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverWork, writeCheckpoint } from "./relay.mjs";
import { isConnErr } from "./listen.mjs";
import { safeWikiKey, putWikiCanonical, verifyWikiCanonical } from "./storage.mjs";
import { GOVERNED_EGRESS_PURPOSES } from "./egress.mjs";

export const WIKI_PROJECTION_CONSUMER = "wiki_projection";

// The subscription SET (the sanctioned deviation from the single-type template, W4), bound from the
// live event_types registry (0005/0009/0011/0016). All other types (incl. wiki.* — P17) are
// checkpoint-only advances. document.classified = ingest (client not carried → resolveDocumentClient);
// entry.approved = ingest of the source doc (carries the client); counterparty.* = model synthesis;
// egress.consent_* = hold set/clear.
export const WIKI_PROJECTION_EVENT_TYPES = Object.freeze([
  "document.classified", "entry.approved", "counterparty.created",
  "counterparty.merged", "egress.consent_granted", "egress.consent_revoked",
]);
const SUBSCRIBED = new Set(WIKI_PROJECTION_EVENT_TYPES);

const WIKI_MODEL = process.env.CLARA_WIKI_MODEL || process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";
const WIKI_ENGINE_ID = `clara-wiki-synth:${WIKI_MODEL}`;
const MAX_ATTEMPTS = Number(process.env.CLARA_WIKI_PROJECTION_MAX_ATTEMPTS || 5);
const skip = (status) => ({ status, mutate: null });

export function contentSha256(content) {
  return createHash("sha256").update(Buffer.from(String(content), "utf8")).digest("hex");
}
export function wikiStorageKey(firmId, clientId, sha) {
  return `firms/${firmId}/wiki/${clientId}/${sha}.md`;
}
/** A typed clara refusal (CLR*) — TERMINAL: receipt + checkpoint, never a dead-letter loop. */
export function isClaraTerminal(err) {
  return typeof err?.code === "string" && /^CLR\d{2}$/.test(err.code);
}
export function claraReason(err) {
  try { return JSON.parse(err?.detail || "{}").reason ?? null; } catch { return null; }
}
function terminalStatusFor(err) {
  const reason = claraReason(err);
  if (err.code === "CLR32") {
    return reason === "consent_held" ? "held_consent"
      : reason === "cap_exceeded" ? "skipped_cap"
      : reason === "budget_unknown" ? "skipped_budget_unknown" : "skipped_bad_state";
  }
  if (err.code === "CLR28") return "skipped_consent_evidence";
  if (err.code === "CLR02") return "skipped_unfiled";
  if (err.code === "CLR11") return "skipped_client_mismatch";
  return "skipped_invalid";
}

// --- injectable reads (fail-closed defaults under the 0008 grants) -----------------------------
/** Consent gate. Autocommit read (a 42501 cannot poison a txn) → 'present'|'absent'|'unknown';
 *  clara_runtime has NO SELECT on client_egress_consents today ⇒ 42501 ⇒ 'unknown' ⇒ HELD. */
export async function resolveConsentDefault(client, { clientId, firmId }) {
  try {
    const r = await client.query(
      "select 1 from clara.client_egress_consents where client_id=$1 and firm_id=$2 and revoked_at is null limit 1",
      [clientId, firmId]);
    return r.rowCount > 0 ? "present" : "absent";
  } catch (err) {
    if (err?.code === "42501") return "unknown";
    throw err;
  }
}
/** document→client: no runtime-readable link under 0008 ⇒ null ⇒ skipped_unresolved_client.
 *  (Injectable resolver contract: (pgClient, {documentId, firmId}) → clientId|null.) */
export async function resolveDocumentClientDefault() {
  return null;
}
/** Default model synthesis — the governed-egress envelope (W9, GOVERNED_EGRESS_PURPOSES). Lazy
 *  AI-SDK import (tests inject deps.synthesize). Returns {title, content}. */
export async function synthesizeWikiPageDefault({ kind, counterpartyId, existing, event, modelId }) {
  const { generateText } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");
  const model = globalThis.__claraModelForTest ?? openai(modelId);
  const p = GOVERNED_EGRESS_PURPOSES.wiki_synthesis;
  const system = `You maintain a Malaysian accounting firm's CLARA-maintained advisory wiki page about ONE `
    + `counterparty of ONE client. The page INFORMS professional judgement; it never decides. Write concise `
    + `Markdown and cite the concrete facts your claims rest on. Governed-egress purpose: ${p.purpose} (${p.dataClass}).`;
  const prompt = `Page kind: ${kind}. Counterparty id: ${counterpartyId}. Trigger: ${event?.eventType}.\n\n`
    + (existing?.version?.content ? `Existing content:\n${existing.version.content}` : "No existing page.")
    + `\n\nProduce the updated advisory note as Markdown, starting with a single '# ' title line.`;
  const { text } = await generateText({ model, system, prompt });
  const heading = String(text).split("\n").find((l) => l.trim().startsWith("# "));
  const title = heading ? heading.replace(/^#\s+/, "").trim() : `Counterparty ${counterpartyId}`;
  return { title, content: String(text) };
}

// --- granted DB reads (clients + wiki tables; firm-scoped in SQL) ------------------------------
async function isClientActive(client, { clientId, firmId }) {
  const r = await client.query("select status from clara.clients where id=$1 and firm_id=$2", [clientId, firmId]);
  return r.rowCount > 0 && r.rows[0].status === "active";
}
/** projected_from_seq of a page's CURRENT version (null if absent) — the already_projected guard. */
async function currentProjectedSeq(client, { firmId, clientId, slug }) {
  const r = await client.query(
    `select v.projected_from_seq as seq from clara.wiki_pages p
       join clara.wiki_page_versions v on v.id=p.current_version_id
      where p.firm_id=$1 and p.client_id=$2 and p.slug=$3`, [firmId, clientId, slug]);
  return r.rowCount > 0 && r.rows[0].seq != null ? Number(r.rows[0].seq) : null;
}
/** Synthesis-context read via the DEFINER get_wiki_page — REFUSES (CLR03) unless
 *  clara.pack_consumer='v25' is set txn-locally AND the role is clara_runtime (0017 R1-F4). */
async function readWikiContext(client, { clientId, slug }) {
  await client.query("begin");
  try {
    await client.query("select set_config('clara.pack_consumer','v25',true)");
    const r = await client.query("select clara.get_wiki_page($1,$2) as page", [clientId, slug]);
    return r.rows[0]?.page ?? null;
  } finally {
    await client.query("rollback").catch(() => {});
  }
}

// --- Storage put→verify (W5 lockstep); put-409 (existed:true) = idempotent success -------------
async function putAndVerifyContent(key, content, sha, deps) {
  safeWikiKey(key);
  const put = deps.putWiki ?? putWikiCanonical;
  const verify = deps.verifyWiki ?? verifyWikiCanonical;
  const tmp = join(tmpdir(), `clara-wiki-${randomUUID()}.md`);
  await writeFile(tmp, content, "utf8");
  try {
    await put(tmp, key, "text/markdown");
    await verify(key, sha);
  } finally {
    await rm(tmp, { force: true }).catch(() => {});
  }
}

// --- event planning: reads + (model) egress + Storage → {status, mutate}. mutate(txnClient) runs
// the audited DB write INSIDE the caller's final effect txn (atomic with the checkpoint). --------
async function planDeterministicIngest(client, { firmId, clientId, documentId }) {
  if (!clientId) return skip("skipped_unresolved_client");
  if (!documentId) return skip("skipped_kind");
  if (!(await isClientActive(client, { clientId, firmId }))) return skip("skipped_inactive_client");
  const opKey = `wikiingest:${clientId}:${documentId}`;
  return {
    status: "projected", lane: "deterministic",
    mutate: (c) => c.query("select clara.record_wiki_source_ingest($1,$2,$3,$4) as r", [clientId, documentId, null, opKey]),
  };
}

async function planCounterpartySynthesis(client, { firmId, ev, clientId, counterpartyId, deps }) {
  if (!clientId || !counterpartyId) return skip("skipped_kind");
  if (!(await isClientActive(client, { clientId, firmId }))) return skip("skipped_inactive_client");
  const slug = `counterparty/${counterpartyId}`;
  const projected = await currentProjectedSeq(client, { firmId, clientId, slug });
  if (projected != null && projected >= ev.seq) return skip("already_projected");

  const consent = await (deps.resolveConsent ?? resolveConsentDefault)(client, { clientId, firmId });
  if (consent !== "present") {
    return {
      status: "held_consent",
      mutate: (c) => c.query("select clara.set_wiki_synthesis_hold($1,$2,$3) as r",
        [clientId, `wiki synthesis consent ${consent}`, `wikihold:${clientId}:${ev.seq}`]),
    };
  }

  const existing = await readWikiContext(client, { clientId, slug });
  const out = await (deps.synthesize ?? synthesizeWikiPageDefault)(
    { kind: "counterparty", counterpartyId, clientId, existing, event: ev, modelId: deps.model ?? WIKI_MODEL });
  const content = String(out?.content ?? "");
  if (!content) return skip("skipped_kind");
  const title = String(out?.title || `Counterparty ${counterpartyId}`).trim() || `Counterparty ${counterpartyId}`;
  const sha = contentSha256(content);
  const key = wikiStorageKey(firmId, clientId, sha);
  await putAndVerifyContent(key, content, sha, deps);
  const engineId = deps.engineId ?? WIKI_ENGINE_ID;
  const citations = [{ source_kind: "counterparty", counterparty_id: counterpartyId, detail: { trigger: ev.eventType } }];
  return {
    status: "projected", lane: "model",
    // The recency guard re-runs INSIDE the effect txn (codex finding 9): a concurrent
    // live pass / manual redrive that published a NEWER seq between planning and commit
    // must never be superseded by this older event — converge as a checkpoint-only no-op.
    // (Residual: two writers inside the same txn window; the DB-side monotonic
    // projected_from_seq guard is a 0018-candidate — see the v25 memo.)
    mutate: async (c) => {
      const now = await currentProjectedSeq(c, { firmId, clientId, slug });
      if (now != null && now >= ev.seq) return;
      await c.query(
        "select clara.publish_wiki_page_version($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14) as r",
        [clientId, slug, "counterparty", title, counterpartyId, content, sha, key,
          JSON.stringify(citations), "[]", "model", engineId, ev.seq, `wikiproj:${clientId}:${ev.seq}`]);
    },
  };
}

function planConsentTransition({ ev, clientId, granted }) {
  if (!clientId) return skip("skipped_kind");
  if (granted) {
    return {
      status: "consent_released",
      mutate: (c) => c.query("select clara.clear_wiki_synthesis_hold($1,$2) as r", [clientId, `wikirelease:${clientId}:${ev.seq}`]),
    };
  }
  return {
    status: "held_consent",
    mutate: (c) => c.query("select clara.set_wiki_synthesis_hold($1,$2,$3) as r",
      [clientId, "egress consent revoked", `wikihold:${clientId}:${ev.seq}`]),
  };
}

/** Dispatch one subscribed event to its lane plan (reads + any network egress happen here). */
export async function planEvent(client, { firmId, ev, deps }) {
  const payload = ev.payload || {};
  switch (ev.eventType) {
    case "entry.approved":
      return planDeterministicIngest(client, { firmId, clientId: ev.clientId, documentId: ev.documentId });
    case "document.classified": {
      const resolve = deps.resolveDocumentClient ?? resolveDocumentClientDefault;
      const clientId = ev.clientId ?? (await resolve(client, { documentId: ev.documentId, firmId }));
      return planDeterministicIngest(client, { firmId, clientId, documentId: ev.documentId });
    }
    case "counterparty.created":
      return planCounterpartySynthesis(client, { firmId, ev, clientId: ev.clientId, counterpartyId: payload.counterparty_id, deps });
    case "counterparty.merged":
      return planCounterpartySynthesis(client, { firmId, ev, clientId: ev.clientId, counterpartyId: payload.survivor_id, deps });
    case "egress.consent_granted":
      return planConsentTransition({ ev, clientId: ev.clientId, granted: true });
    case "egress.consent_revoked":
      return planConsentTransition({ ev, clientId: ev.clientId, granted: false });
    default:
      return skip("skipped_kind");
  }
}

// --- dead-letter (own txn, matcher idiom) + checkpoint-only ------------------------------------
async function recordDeadLetter(client, { eventId, reason }) {
  await client.query("begin");
  try {
    const r = await client.query(
      `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
         values ($1, $2, $3, null)
       on conflict (consumer, event_id) do update set attempt_count = clara.relay_dead_letters.attempt_count + 1
       returning attempt_count`, [WIKI_PROJECTION_CONSUMER, eventId, String(reason).slice(0, 500)]);
    await client.query("commit");
    return Number(r.rows[0].attempt_count);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
}
async function checkpointOnly(client, { firmId, seq }) {
  await client.query("begin");
  try {
    await writeCheckpoint(client, { consumer: WIKI_PROJECTION_CONSUMER, firmId, seq });
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
}

// One target event: plan (reads + egress) → atomic effect txn { mutate ; checkpoint }. A typed CLR
// refusal (either phase) is a TERMINAL receipt (checkpoint advances); a connection error PROPAGATES
// (reconnect); every other throw dead-letters.
async function runTargetEvent(client, { firmId, ev, deps }) {
  const log = deps.log ?? (() => {});
  let plan;
  try {
    plan = await planEvent(client, { firmId, ev, deps });
    await client.query("begin");
    try {
      if (plan.mutate) await plan.mutate(client);
      await writeCheckpoint(client, { consumer: WIKI_PROJECTION_CONSUMER, firmId, seq: ev.seq });
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    }
    return { ok: true, receipt: { status: plan.status, lane: plan.lane ?? null, event: ev.eventType } };
  } catch (err) {
    if (isConnErr(err)) throw err;
    if (isClaraTerminal(err)) {
      const status = terminalStatusFor(err);
      log(`[wiki_projection] event=${ev.id} ${ev.eventType} terminal ${err.code}/${claraReason(err) ?? ""} → ${status}`);
      await checkpointOnly(client, { firmId, seq: ev.seq });
      return { ok: true, receipt: { status, event: ev.eventType } };
    }
    const attempts = await recordDeadLetter(client, { eventId: ev.id, reason: err?.message ?? String(err) });
    return { ok: false, err, attempts };
  }
}

// --- per-firm walk (sst-watch/facts-gate shape) ------------------------------------------------
function mapEventRow(row) {
  return {
    seq: Number(row.seq), id: row.id, firmId: row.firm_id, eventType: row.event_type,
    clientId: row.client_id, entryId: row.entry_id, documentId: row.document_id, payload: row.payload || {},
  };
}
async function readEvents(client, firmId, lastSeq, batchSize) {
  const r = await client.query(
    `select id, firm_id, seq, event_type, client_id, entry_id, document_id, payload
       from clara.domain_events where firm_id = $1 and seq > $2 order by seq limit $3`, [firmId, lastSeq, batchSize]);
  return r.rows.map(mapEventRow);
}

async function processFirm(client, { firmId, lastSeq, batchSize, deps }) {
  const log = deps.log ?? (() => {});
  const evs = await readEvents(client, firmId, lastSeq, batchSize);
  if (evs.length === 0) return { readCount: 0, maxSeq: lastSeq, effects: 0, blocked: false };
  let cursor = lastSeq;
  let effects = 0;
  for (const ev of evs) {
    if (!SUBSCRIBED.has(ev.eventType)) continue; // checkpoint-only; coalesced below
    const res = await runTargetEvent(client, { firmId, ev, deps });
    if (res.ok) { cursor = ev.seq; effects += 1; continue; }
    if (res.attempts >= MAX_ATTEMPTS) {
      log(`[wiki_projection] event=${ev.id} exhausted ${MAX_ATTEMPTS} attempts → dead-lettered + skipped: ${res.err?.message ?? res.err}`);
      await checkpointOnly(client, { firmId, seq: ev.seq });
      cursor = ev.seq;
      continue;
    }
    log(`[wiki_projection] effect-error event=${ev.id} attempt=${res.attempts}/${MAX_ATTEMPTS}: ${res.err?.message ?? res.err}`);
    return { readCount: evs.length, maxSeq: cursor, effects, blocked: true };
  }
  const batchMax = evs[evs.length - 1].seq; // trailing/interior non-target (incl. wiki.*): one coalesced advance
  if (batchMax > cursor) { await checkpointOnly(client, { firmId, seq: batchMax }); cursor = batchMax; }
  return { readCount: evs.length, maxSeq: cursor, effects, blocked: false };
}

export async function runWikiProjectionCycle(client, opts = {}) {
  const { batchSize = 100, maxBatchesPerFirm = 4, onlyFirm = null, log = () => {} } = opts;
  const deps = { ...opts, log };
  const work = await discoverWork(client, { consumer: WIKI_PROJECTION_CONSUMER, onlyFirm });
  const cursors = work.map((w) => ({ firmId: w.firmId, lastSeq: w.lastSeq, active: true }));
  let effects = 0;
  for (let round = 0; round < maxBatchesPerFirm; round++) {
    let anyActive = false;
    for (const cur of cursors) {
      if (!cur.active) continue;
      const res = await processFirm(client, { firmId: cur.firmId, lastSeq: cur.lastSeq, batchSize, deps });
      if (res.blocked || res.maxSeq <= cur.lastSeq) { cur.active = false; continue; }
      cur.lastSeq = res.maxSeq;
      effects += res.effects;
      anyActive = true;
      if (res.readCount < batchSize) cur.active = false;
    }
    if (!anyActive) break;
  }
  return { firms: work.length, effects, capped: cursors.some((c) => c.active) };
}

// --- redrive (runtime-role, sst-watch pattern); idempotent via op_key + already_projected + put-409
async function readEventById(client, eventId) {
  const r = await client.query(
    "select id, firm_id, seq, event_type, client_id, entry_id, document_id, payload from clara.domain_events where id = $1",
    [eventId]);
  return r.rowCount === 0 ? null : mapEventRow(r.rows[0]);
}

export async function wikiProjectionRedrive(client, eventId, deps = {}) {
  const dl = await client.query("select status from clara.relay_dead_letters where consumer = $1 and event_id = $2",
    [WIKI_PROJECTION_CONSUMER, eventId]);
  if (dl.rowCount === 0) throw new Error(`wiki_projection redrive: no dead-letter for consumer='wiki_projection' event=${eventId}`);
  const ev = await readEventById(client, eventId);
  if (!ev) throw new Error(`wiki_projection redrive: event ${eventId} not found`);
  if (!SUBSCRIBED.has(ev.eventType)) throw new Error(`wiki_projection redrive: event ${eventId} is '${ev.eventType}', not subscribed`);
  const plan = await planEvent(client, { firmId: ev.firmId, ev, deps });
  await client.query("begin");
  try {
    if (plan.mutate) await plan.mutate(client);
    await client.query("update clara.relay_dead_letters set status='resolved', resolved_at=now() where consumer=$1 and event_id=$2",
      [WIKI_PROJECTION_CONSUMER, eventId]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
  return { resolved: true, consumer: WIKI_PROJECTION_CONSUMER, status: plan.status, eventId };
}

export const CONSUMERS = Object.freeze({
  wiki_projection: Object.freeze({ name: WIKI_PROJECTION_CONSUMER, identity: "runtime-role", redrive: (c, id, o) => wikiProjectionRedrive(c, id, o) }),
});
