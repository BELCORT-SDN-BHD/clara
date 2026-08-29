// Slice-2 rig — function wrappers + fixtures (NOT a test file: the name does not
// end in `.test.mjs`). Re-exports the core harness so test files import ONE module.
//
// Every clara function is called with NAMED args using the contract's documented
// parameter names (see rig-helpers.mjs "SIGNATURE STRATEGY"). Contract ambiguities
// each carry a flag comment here and are collected in the lane report.

import { randomUUID } from "node:crypto";
import {
  AGENT_USER_ID,
  ROLES,
  human,
  humanQuery,
  namedCall,
  opk,
  roleQuery,
  rootQuery,
  runAs,
} from "./rig-helpers.mjs";

export * from "./rig-helpers.mjs";

// ---------------------------------------------------------------------------
// Writer wrappers (contract §5 surface). Writers return a jsonb receipt; each
// wrapper pulls the relevant id out (probed shapes, e.g. {firm_id}, {entry_id,…}).
// ---------------------------------------------------------------------------

export async function createFirm(sub, { name, token, opKey }) {
  // As-built: create_firm(p_name, p_admission_token, p_op_key). Fail-closed on the
  // single-use admission token (v2 §F/F23) AND op_key idempotent (ADR-009).
  const r = await humanQuery(
    sub,
    "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3) as receipt",
    [name, token, opKey],
  );
  return r.rows[0].receipt.firm_id; // receipt jsonb = {firm_id}
}

export async function addMember(sub, { firm, user, role: memberRole, opKey }) {
  await humanQuery(sub, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    firm,
    user,
    memberRole,
    opKey,
  ]);
}

export async function setMemberRole(sub, { membership, role: memberRole, opKey }) {
  // v2 §F: p_op_key added to set_member_role.
  await humanQuery(sub, "select clara.set_member_role(p_membership => $1, p_role => $2, p_op_key => $3)", [
    membership,
    memberRole,
    opKey,
  ]);
}

export async function removeMember(sub, { membership, opKey }) {
  // v2 §F: p_op_key added to remove_member.
  await humanQuery(sub, "select clara.remove_member(p_membership => $1, p_op_key => $2)", [membership, opKey]);
}

export async function createClient(sub, { name, opKey }) {
  const r = await humanQuery(sub, "select clara.create_client(p_name => $1, p_op_key => $2) as receipt", [name, opKey]);
  const id = r.rows[0].receipt.client_id; // receipt jsonb = {client_id}
  await activateLegacyClient(sub, id);
  return id;
}

/** [R3-F2 bridge] Post-0017 the legacy creator births an ONBOARDING client with
 *  a plan (no Gate-O bypass). Fixture worlds need operational clients, so drive
 *  the birth to 'active' THROUGH the audited plan+commit verbs: a deferred
 *  carry-down item, then a committer DISTINCT from every contributor (or the
 *  sole-admin attestation path). Pre-fix (client born 'active') this no-ops, so
 *  every suite stays bimodal-green. */
async function activateLegacyClient(sub, client) {
  const c = (await rootQuery("select status, firm_id from clara.clients where id = $1", [client])).rows[0];
  if (c?.status !== "onboarding") return;
  const plan = (await rootQuery(
    "select id, revision_token from clara.onboarding_plans where client_id=$1 and state='open' order by created_at desc limit 1",
    [client])).rows[0];
  if (!plan) throw new Error("legacy bridge: onboarding client without an open plan");
  await roleQuery(ROLES.runtime,
    "select clara.update_onboarding_plan(p_plan => $1, p_expected_revision => $2, p_items => $3::jsonb, p_answered_by => $4, p_op_key => $5)",
    [plan.id, plan.revision_token,
      JSON.stringify([{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }]),
      sub, opk("bridge")]);
  const rev = (await rootQuery("select revision_token from clara.onboarding_plans where id=$1", [plan.id])).rows[0].revision_token;
  // [R3-F2/F3 repair, PROBED] the eligible-checker population counts
  // bookkeepers, so with one present the creator's self-attestation is
  // lawfully REFUSED (CLR05 distinct_checker) while the bookkeeper cannot
  // execute the admin-floored commit (CLR04). The uniform lawful route:
  // a distinct contributor-clean ADMIN commits — an existing one when the
  // firm has one, otherwise a TEMPORARY admin added, committing, and removed
  // entirely through the audited membership verbs.
  const alt = (await rootQuery(
    `select user_id from clara.firm_memberships
      where firm_id=$1 and status='active' and role in ('admin','owner') and user_id<>$2
      order by case role when 'owner' then 0 else 1 end, created_at limit 1`,
    [c.firm_id, sub])).rows[0]?.user_id;
  const commitAs = async (who) => humanQuery(who,
    "select clara.commit_client_onboarding(p_client => $1, p_plan => $2, p_expected_plan_revision => $3, p_op_key => $4)",
    [client, plan.id, rev, opk("bridgec")]);
  if (alt) {
    await commitAs(alt);
  } else {
    const temp = await insertUser("bridge", `tmp_${client.slice(0, 8)}`);
    await addMember(sub, { firm: c.firm_id, user: temp, role: "admin", opKey: opk("bta") });
    await commitAs(temp);
    const mem = await membershipId(c.firm_id, temp);
    await removeMember(sub, { membership: mem, opKey: opk("btr") });
  }
}

export async function upsertAccount(sub, { client, code, name, type, special = null, opKey = null }) {
  // Canonical: upsert_account(p_client, p_code, p_name, p_type,
  //   p_special_acc_type DEFAULT NULL, p_op_key DEFAULT NULL). p_special_acc_type
  //   IN (NULL,'rounding') is how the rounding account is created (through the
  //   writer, NOT a direct INSERT — CLAUDE.md law / interface §upsert_account).
  const specs = [{ name: "p_client" }, { name: "p_code" }, { name: "p_name" }, { name: "p_type" }];
  const vals = [client, code, name, type];
  if (special != null) {
    specs.push({ name: "p_special_acc_type" });
    vals.push(special);
  }
  if (opKey != null) {
    specs.push({ name: "p_op_key" });
    vals.push(opKey);
  }
  await humanQuery(sub, namedCall("upsert_account", specs), vals);
}

export async function ingestDocument(persona, o) {
  // Slice-5 retires both legacy ingest writers. Existing pre-Slice-5 rigs still
  // need a canonical verified document fixture, so provision it through the
  // owner-only migration helper instead of weakening the retired surface.
  const helper = await rootQuery(
    `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='_seed_verified_document'`,
  );
  if (!helper.rowCount) {
    // Deploy-onto-existing drills intentionally stop at 0006 first. Only that
    // historical schema still has the governed legacy writer.
    const specs = [
      { name: "p_client" }, { name: "p_sha256" }, { name: "p_filename" },
      { name: "p_mime" }, { name: "p_bytes", cast: "bigint" },
      { name: "p_storage_path" }, { name: "p_op_key" },
    ];
    const vals = [
      o.client ?? null, o.sha256, o.filename ?? "rig.pdf",
      o.mime ?? "application/pdf", o.bytes ?? 1024, o.storagePath ?? "rig/path", o.opKey,
    ];
    const legacy = await runAs(persona, namedCall(o.wake ? "wake_ingest_document" : "ingest_document", specs), vals);
    return legacy.rows[0].result.document_id;
  }
  if (o.client == null) throw new Error("ingestDocument fixture requires a client after Slice-5");
  const firm = await rootQuery("select firm_id from clara.clients where id = $1", [o.client]);
  if (!firm.rows[0]?.firm_id) throw new Error("ingestDocument fixture client does not exist");
  const firmId = firm.rows[0].firm_id;
  const mime = o.mime ?? "application/pdf";
  const extension = mime === "application/pdf" ? "pdf" : "bin";
  const storagePath = o.storagePath?.startsWith(`firms/${firmId}/docs/`)
    ? o.storagePath
    : `firms/${firmId}/docs/${o.sha256}.${extension}`;
  const r = await rootQuery(
    `select clara._seed_verified_document(
       p_firm => $1, p_client => $2, p_sha256 => $3, p_filename => $4,
       p_mime => $5, p_bytes => $6::bigint, p_storage_path => $7) as receipt`,
    [firmId, o.client, o.sha256, o.filename ?? "rig.pdf", mime, o.bytes ?? 1024, storagePath],
  );
  return r.rows[0].receipt.document_id;
}

export async function recordResolution(persona, o) {
  // As-built signature: (p_client, p_subject_kind, p_subject, p_confidence, p_method,
  // p_evidence, p_op_key). v2 §D: the fn STAMPS method from the lane (human->'human',
  // wake->'agent') and IGNORES the p_method arg — we pass one to match the signature;
  // the lane stamping is asserted separately. (p_method kept as-built; a follow-up
  // could drop the ignored param.)
  const specs = [
    { name: "p_client" },
    { name: "p_subject_kind" },
    { name: "p_subject" },
    { name: "p_confidence", cast: "numeric" },
    { name: "p_method" },
    { name: "p_evidence", cast: "jsonb" },
    { name: "p_op_key" },
  ];
  const vals = [
    o.client,
    o.subjectKind ?? "manual",
    o.subjectId ?? null,
    o.confidence ?? 0.98,
    o.method ?? "human",
    JSON.stringify(o.evidence ?? {}),
    o.opKey,
  ];
  const fn = o.wake ? "wake_record_client_resolution" : "record_client_resolution";
  const r = await runAs(persona, namedCall(fn, specs), vals);
  return r.rows[0].result.resolution_id; // receipt jsonb = {resolution_id}
}

export async function draftEntry(persona, o) {
  // Negative document-pipeline rigs sometimes pass a resolution promise while
  // arranging the provenance condition under test. Resolve it before handing
  // the UUID to PostgreSQL so the intended database invariant—not driver-side
  // Promise serialization—determines the outcome.
  const resolution = await o.resolution;
  const specs = [
    { name: "p_client" },
    { name: "p_resolution" },
    { name: "p_posting_date", cast: "date" },
    { name: "p_memo" },
    { name: "p_lines", cast: "jsonb" },
  ];
  const vals = [
    o.client,
    resolution ?? null,
    o.postingDate ?? "2026-01-15",
    o.memo ?? "rig entry",
    JSON.stringify(o.lines),
  ];
  if (o.document != null) {
    specs.push({ name: "p_document" });
    vals.push(o.document);
  }
  if (o.sha256 != null) {
    specs.push({ name: "p_sha256" });
    vals.push(o.sha256);
  }
  if (o.flags != null) {
    specs.push({ name: "p_flags", cast: "jsonb" });
    vals.push(JSON.stringify(o.flags));
  }
  specs.push({ name: "p_op_key" });
  vals.push(o.opKey);
  if (o.wake) {
    // Slice-3 (design §2.5): wake_draft_entry gained a required books-version freshness
    // token. Supply a FRESH one (the client's firm max seq) unless the caller pins a
    // value — Slice-2 wake drafts exercise other invariants, not staleness, so a fresh
    // token clears the gate exactly as the tokenless pre-Slice-3 call used to.
    const fv = await rootQuery(
      "select coalesce(max(d.seq), 0)::int as v from clara.domain_events d join clara.clients c on c.firm_id = d.firm_id where c.id = $1",
      [o.client],
    );
    specs.push({ name: "p_books_version", cast: "bigint" });
    vals.push(o.booksVersion ?? fv.rows[0].v);
  }
  const r = await runAs(persona, namedCall(o.wake ? "wake_draft_entry" : "draft_entry", specs), vals);
  return r.rows[0].result;
}

export async function approveEntry(sub, o) {
  const specs = [{ name: "p_entry" }, { name: "p_expected_revision" }];
  const vals = [o.entry, o.expectedRevision];
  if (o.attestation != null) {
    specs.push({ name: "p_attestation" });
    vals.push(o.attestation);
  }
  specs.push({ name: "p_op_key" });
  vals.push(o.opKey);
  const r = await humanQuery(sub, namedCall("approve_entry", specs), vals);
  return r.rows[0].result;
}

export async function reverseEntry(sub, o) {
  const r = await humanQuery(
    sub,
    namedCall("reverse_entry", [{ name: "p_entry" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [o.entry, o.reason ?? "rig reversal", o.opKey],
  );
  return r.rows[0].result;
}

export async function recordNotification(persona, o) {
  const specs = [{ name: "p_kind" }, { name: "p_payload", cast: "jsonb" }];
  const vals = [o.kind ?? "rig.kind", JSON.stringify(o.payload ?? {})];
  if (o.client != null) {
    specs.push({ name: "p_client" });
    vals.push(o.client);
  }
  specs.push({ name: "p_op_key" });
  vals.push(o.opKey);
  const r = await runAs(persona, namedCall(o.wake ? "wake_record_notification" : "record_notification", specs), vals);
  return r.rows[0].result.notification_id; // receipt jsonb = {notification_id}
}

// ---------------------------------------------------------------------------
// Wake credentials (runtime lane)
// ---------------------------------------------------------------------------

/** Mint a wake credential as clara_runtime; returns { credentialId, secret }. */
export async function mintWake({ kind, firm, onBehalfOf = null, ttl = "15 minutes" }) {
  // mint_wake_credential RETURNS TABLE(credential_id uuid, secret text) — a row, not
  // a scalar. Read the columns off the row.
  const r = await roleQuery(
    ROLES.runtime,
    "select * from clara.mint_wake_credential(p_wake_kind => $1, p_firm => $2, p_on_behalf_of => $3, p_ttl => $4::interval)",
    [kind, firm, onBehalfOf, ttl],
  );
  const row = r.rows[0] ?? {};
  return { credentialId: row.credential_id ?? null, secret: row.secret };
}

/** Revoke a wake credential as clara_runtime (single positional arg — name-agnostic). */
export async function revokeWake(credentialId) {
  await roleQuery(ROLES.runtime, "select clara.revoke_wake_credential($1)", [credentialId]);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Insert a synthetic human user directly (provisioning is the auth plane's job). Reviewer
 *  test-hygiene note: the email carries a per-call random suffix so the SAME (prefix, tag) can
 *  be re-run against an already-used database without a unique_violation on clara.users.email --
 *  display_name stays the caller's exact deterministic string, since nothing asserts on it. */
export async function insertUser(prefix, tag) {
  const id = randomUUID();
  await rootQuery("insert into clara.users (id, display_name, email, is_agent) values ($1, $2, $3, false)", [
    id,
    `${prefix}_${tag}`,
    `${prefix}_${tag}_${id.slice(0, 8)}@rig.test`,
  ]);
  return id;
}

/** Seed an unconsumed firm_admissions token as the operator (superuser). 裁-16b (pre-beta
 *  hardening batch): firm_admissions stores token_hash only -- the plaintext is minted here,
 *  returned to the caller, and never written to the row itself.
 *
 *  `$1::uuid::text`, NOT `$1::text` (independent review 2026-08-29). `clara.create_firm` hashes
 *  `p_admission_token::text`, i.e. uuid's own canonical lowercase-hyphenated rendering. Hashing
 *  the CALLER'S SPELLING here instead would write a row no reader can ever find whenever the
 *  spelling is not already canonical -- and this is a WRITE, so the damage is permanent: the
 *  token would be unusable forever with nothing to compare against once the plaintext is gone.
 *  The pre-hardening `where token = $1` was tolerant because Postgres coerced the parameter to
 *  uuid for the comparison; hashing removes that coercion, so the cast has to be explicit. */
export async function seedAdmission(note = "rig admission") {
  const token = randomUUID();
  await rootQuery(
    "insert into clara.firm_admissions (token_hash, note) values (sha256(convert_to($1::uuid::text,'UTF8')), $2)",
    [token, note],
  );
  return token;
}

/** Look up a membership id (root; superuser bypasses RLS). */
export async function membershipId(firm, user, status = "active") {
  const r = await rootQuery(
    "select id from clara.firm_memberships where firm_id = $1 and user_id = $2 and status = $3 order by created_at desc limit 1",
    [firm, user, status],
  );
  return r.rows[0]?.id ?? null;
}

export const COA = { cash: "1000", ar: "1100", sales: "4000", expense: "5000", rounding: "9990" };

async function buildCoa(ownerSub, client) {
  await upsertAccount(ownerSub, { client, code: COA.cash, name: "Cash", type: "asset", opKey: opk("coa") });
  await upsertAccount(ownerSub, { client, code: COA.ar, name: "Accounts Receivable", type: "asset", opKey: opk("coa") });
  await upsertAccount(ownerSub, { client, code: COA.sales, name: "Sales", type: "income", opKey: opk("coa") });
  await upsertAccount(ownerSub, { client, code: COA.expense, name: "Expense", type: "expense", opKey: opk("coa") });
  // Rounding account THROUGH the writer (interface §upsert_account; type 'equity').
  await upsertAccount(ownerSub, { client, code: COA.rounding, name: "Rounding", type: "equity", special: "rounding", opKey: opk("coa") });
  return { ...COA };
}

/**
 * Build the whole synthetic world THROUGH the audited fns (dog-fooding), with
 * users pre-inserted as superuser. Unique `rig_<...>` prefix per call so parallel
 * test files / re-runs never collide. Returns the fixture graph.
 *
 * Firms: A (alice owner, bob bookkeeper, carol viewer), B (dave owner),
 *        S solo (erin owner). Clients A1,A2 (firm A), B1 (firm B), S1 (firm S).
 */
export async function buildWorld() {
  const prefix = `rig_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;

  const users = {
    alice: await insertUser(prefix, "alice"),
    bob: await insertUser(prefix, "bob"),
    carol: await insertUser(prefix, "carol"),
    dave: await insertUser(prefix, "dave"),
    erin: await insertUser(prefix, "erin"),
  };

  const tokenA = await seedAdmission();
  const tokenB = await seedAdmission();
  const tokenS = await seedAdmission();

  const firmA = await createFirm(users.alice, { name: `${prefix}_firmA`, token: tokenA, opKey: opk("firm") });
  const firmB = await createFirm(users.dave, { name: `${prefix}_firmB`, token: tokenB, opKey: opk("firm") });
  const firmS = await createFirm(users.erin, { name: `${prefix}_firmS`, token: tokenS, opKey: opk("firm") });

  await addMember(users.alice, { firm: firmA, user: users.bob, role: "bookkeeper", opKey: opk("mem") });
  await addMember(users.alice, { firm: firmA, user: users.carol, role: "viewer", opKey: opk("mem") });

  const clientA1 = await createClient(users.alice, { name: `${prefix}_A1`, opKey: opk("cli") });
  const clientA2 = await createClient(users.alice, { name: `${prefix}_A2`, opKey: opk("cli") });
  const clientB1 = await createClient(users.dave, { name: `${prefix}_B1`, opKey: opk("cli") });
  const clientS1 = await createClient(users.erin, { name: `${prefix}_S1`, opKey: opk("cli") });

  const coa = {
    A1: await buildCoa(users.alice, clientA1),
    A2: await buildCoa(users.alice, clientA2),
    B1: await buildCoa(users.dave, clientB1),
    S1: await buildCoa(users.erin, clientS1),
  };

  return {
    prefix,
    agent: AGENT_USER_ID,
    users,
    firms: { A: firmA, B: firmB, S: firmS },
    clients: { A1: clientA1, A2: clientA2, B1: clientB1, S1: clientS1 },
    coa,
  };
}

/** A fresh, valid (human, ≥0.95, not superseded) resolution id for `client`. */
export async function freshResolution(sub, client, extra = {}) {
  // Slice-5 document admission keeps exact-document attribution. When a caller
  // has just filed a document and did not state another subject, bind the fixture
  // resolution to the newest active filing. Non-document admission still accepts
  // that authoritative client resolution.
  let inferred = {};
  if (extra.subjectId === undefined && extra.subjectKind === undefined) {
    const hasFilings = await rootQuery("select to_regclass('clara.document_filings') as rel");
    if (hasFilings.rows[0]?.rel) {
      const filing = await rootQuery(
        `select document_id from clara.document_filings
          where client_id=$1 and retired_at is null order by filed_at desc,id desc limit 1`,
        [client],
      );
      if (filing.rows[0]?.document_id) {
        inferred = { subjectKind: "document", subjectId: filing.rows[0].document_id };
      }
    } else {
      // The deploy drill's 0001-0006 phase still carries documents.client_id.
      const legacyDocument = await rootQuery(
        `select id from clara.documents where client_id=$1 order by created_at desc,id desc limit 1`,
        [client],
      );
      if (legacyDocument.rows[0]?.id) {
        inferred = { subjectKind: "document", subjectId: legacyDocument.rows[0].id };
      }
    }
  }
  return recordResolution(human(sub), { client, confidence: 0.98, ...inferred, ...extra, opKey: opk("res") });
}
