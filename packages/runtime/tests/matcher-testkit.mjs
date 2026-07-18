// Shared harness for the Slice-5 matcher suite (NOT a test file — no `.test.`
// segment, so `node --test` ignores it). Builds on the Slice-3 relay fixtures
// (imported READ-ONLY) and adds the document-pipeline seeding + the matcher's two
// identity scopes. The suite runs under `node --test --test-concurrency=1` so
// files execute sequentially; every helper is FIRM-SCOPED with unique prefixes so
// it never collides with a sibling lane sharing clara_test. Contract §4.4 / §0
// S5-D2; migration 0007 companion §3.4.

import { after } from "node:test";
import * as fx from "./relay-fixtures.mjs";
import { runMatcherCycle } from "../lib/matcher.mjs";

export const { rootQuery, humanQuery, asRoot, asRuntime, opk, sha, headSeq, checkpointSeq, deadLettersForFirm } = fx;

// SKIP cleanly when 0007's attribution surface is absent (probe once per process).
export const READY = await probeMatcherReady();
export const skip = READY ? false : "Slice-5 (0007) attribution surface absent — migrate the target first";

async function probeMatcherReady() {
  const r = await fx.rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'clara' and p.proname in ('record_rule_resolution','record_attribution_attempt','_seed_verified_document')`,
  );
  return Number(r.rows[0].n) === 3;
}

after(async () => {
  await fx.endPool();
});

// ---------------------------------------------------------------------------
// The matcher's two identity scopes. SET SESSION AUTHORIZATION makes the session
// BE the login shell (ambient privileges = the login's, INHERIT FALSE ⇒ none), so
// a `reset role` inside the effects returns to clara_runtime_login (the raw login
// that holds record_rule_resolution's EXECUTE) — faithful to production, where the
// dedicated connection literally logs in as clara_runtime_login.
// ---------------------------------------------------------------------------

/** Session-authorized clara_runtime_login, SET ROLE clara_runtime (the loop baseline). */
export async function asMatcherLogin(fn) {
  const c = await fx.getPool().connect();
  try {
    await c.query("set session authorization clara_runtime_login");
    await c.query("set role clara_runtime");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset session authorization").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** Session-authorized clara_runtime_login, RAW (no SET ROLE) — the grant-proof CAN side. */
export async function asMatcherLoginRaw(fn) {
  const c = await fx.getPool().connect();
  try {
    await c.query("set session authorization clara_runtime_login");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset session authorization").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

// ---------------------------------------------------------------------------
// Seeders — a fresh firm + owner + N clients, verified documents, done
// extractions + regions, identifiers/aliases, and the extraction_completed event.
// ---------------------------------------------------------------------------

/** A firm + owner + `nClients` clients (unique names). Returns { owner, firm, clients:[...] }. */
export async function buildFirmWithClients(nClients = 2, label = "mtc") {
  const base = await fx.buildFirm(label);
  const clients = [base.client];
  for (let i = 1; i < nClients; i++) {
    clients.push(await fx.createClient(base.owner, { name: `${base.prefix}_c${i}`, opKey: fx.opk("cli") }));
  }
  return { owner: base.owner, firm: base.firm, prefix: base.prefix, clients };
}

/** A verified, UNASSIGNED document (no filing) so the matcher runs pre-assignment. */
export async function seedVerifiedDocument({ firm, uploadedBy, client = null, seed = null }) {
  const s = fx.sha(seed ?? `doc_${fx.opk("d")}`);
  const storagePath = `firms/${firm}/docs/${s}.pdf`;
  const r = await fx.rootQuery(
    "select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,1) as r",
    [firm, client, s, "matcher-rig.pdf", "application/pdf", 2048, storagePath, uploadedBy],
  );
  return r.rows[0].r.document_id;
}

export async function seedExtraction({ firm, document, status = "done", versionN = 1 }) {
  const r = await fx.rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
       values($1,$2,'azure-di:prebuilt-layout:4.0','ocr',$3,$4,1) returning id`,
    [firm, document, versionN, status],
  );
  return r.rows[0].id;
}

export async function seedRegion({ firm, extraction, fieldPath = "tin", textContent = "100.00" }) {
  const r = await fx.rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
       values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}',$3,$4,0.99) returning id`,
    [firm, extraction, fieldPath, textContent],
  );
  return r.rows[0].id;
}

/** Human writer (bookkeeper+). Stores value_normalized with ALL whitespace stripped (DC-1). */
export async function addClientIdentifier(ownerSub, { client, kind = "tin", value }) {
  await fx.humanQuery(
    ownerSub,
    "select clara.add_client_identifier(p_client=>$1,p_kind=>$2,p_value_normalized=>$3,p_op_key=>$4)",
    [client, kind, value, fx.opk("cid")],
  );
}

export async function addClientAlias(ownerSub, { client, alias }) {
  await fx.humanQuery(ownerSub, "select clara.add_client_alias(p_client=>$1,p_alias_normalized=>$2,p_op_key=>$3)", [
    client,
    alias,
    fx.opk("alias"),
  ]);
}

/** Emit a document.extraction_completed event (the matcher's trigger). Returns { seq, eventId }. */
export async function emitExtractionCompleted({ firm, document, extraction }) {
  const seq = Number(
    (
      await fx.rootQuery(
        "select clara._append_event($1,'document.extraction_completed',null,null,null,null,null,$2,null,$3::jsonb) as seq",
        [firm, document, JSON.stringify({ extraction_id: extraction })],
      )
    ).rows[0].seq,
  );
  const eventId = (await fx.rootQuery("select id from clara.domain_events where firm_id=$1 and seq=$2", [firm, seq])).rows[0].id;
  return { seq, eventId };
}

/** A convenience: seed doc + done extraction + a tin region + identifier, emit the event. */
export async function seedMatchableDocument({ firm, owner, client, tin }) {
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });
  const extraction = await seedExtraction({ firm, document });
  await seedRegion({ firm, extraction, fieldPath: "tin", textContent: tin });
  await addClientIdentifier(owner, { client, kind: "tin", value: tin });
  const ev = await emitExtractionCompleted({ firm, document, extraction });
  return { document, extraction, ...ev };
}

// ---------------------------------------------------------------------------
// Record an attempt WITH candidates directly (record_attribution_attempt is
// granted to clara_runtime) — the lane-2 write path, used where the as-built read
// grants block the matcher from computing candidates itself. Returns attempt_id.
// ---------------------------------------------------------------------------

export async function recordAttemptWithCandidates({ document, matcherVersion = "matcher-v1", fingerprint, candidates, conflictReason = null }) {
  const fp = fingerprint ?? fx.sha(`fp_${fx.opk("f")}`);
  return fx.asRuntime(async (c) => {
    const r = await c.query("select clara.record_attribution_attempt($1,$2,$3,$4::jsonb,$5,$6) as r", [
      document,
      matcherVersion,
      fp,
      JSON.stringify(candidates),
      conflictReason,
      fx.opk("att"),
    ]);
    return r.rows[0].r.attempt_id;
  });
}

// ---------------------------------------------------------------------------
// State readers (superuser — bypass RLS so assertions see everything).
// ---------------------------------------------------------------------------

export async function attemptsFor(document) {
  const r = await fx.rootQuery(
    "select id, matcher_version, outcome, conflict_reason from clara.attribution_attempts where document_id=$1 order by created_at",
    [document],
  );
  return r.rows;
}

export async function ruleResolutionsFor(firm, document) {
  const r = await fx.rootQuery(
    "select id, client_id, confidence from clara.client_resolutions where firm_id=$1 and subject_id=$2 and subject_kind='document' and method='rule' and superseded_at is null",
    [firm, document],
  );
  return r.rows;
}

export async function humanResolutionsFor(firm, document) {
  const r = await fx.rootQuery(
    "select id, client_id from clara.client_resolutions where firm_id=$1 and subject_id=$2 and subject_kind='document' and method='human'",
    [firm, document],
  );
  return r.rows;
}

export async function candidatesForDoc(document) {
  const r = await fx.rootQuery(
    `select ac.id, ac.client_id, ac.rank, ac.rule_kind, ac.disposition
       from clara.attribution_candidates ac
       join clara.attribution_attempts aa on aa.id = ac.attempt_id
      where aa.document_id = $1 order by ac.rank`,
    [document],
  );
  return r.rows;
}

// Drive the matcher to convergence. NB: a lane-1 rule hit itself EMITS a
// `client.resolved` event (record_rule_resolution), so head grows past the
// extraction event — a second cycle walks the matcher past that emitted event.
// Loops until the matcher checkpoint equals firm head (bounded).
export async function drainMatcher(firm, opts = {}) {
  return asMatcherLogin(async (c) => {
    for (let i = 0; i < 30; i++) {
      await runMatcherCycle(c, { onlyFirm: firm, batchSize: 50, ...opts });
      if ((await fx.checkpointSeq(firm, "matcher")) === (await fx.headSeq(firm))) return;
    }
    throw new Error(`drainMatcher: firm ${firm} did not converge to head`);
  });
}

export const matcherCheckpoint = (firm) => fx.checkpointSeq(firm, "matcher");
export const routerCheckpoint = (firm) => fx.checkpointSeq(firm, "router");
export const matcherDeadLetters = (firm) => fx.deadLettersForFirm(firm, "matcher");
