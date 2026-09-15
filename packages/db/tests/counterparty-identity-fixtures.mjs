// #647 — the shared world for the counterparty-identity battery (NOT a test file: the name does
// not end in `.test.mjs`). Minted through the ROOT connection on purpose, the
// knowledge-fixtures.mjs reasoning verbatim: the subject of these cells is the identity
// SUBSTRATE and its doors, so going through create_firm / begin_client_onboarding would only add
// ways to fail for reasons that are not the subject. Every DOOR call a cell makes is the real
// door, as the real role, through `humanQuery`.

import { randomUUID } from "node:crypto";
import { rootQuery, humanQuery } from "./rig-helpers.mjs";

export const opk = () => `cid-${randomUUID()}`;

/** True iff 0200's whole cohort is applied. A PARTIAL cohort throws — "wholly present or wholly
 *  absent" is the estate's rule (rig-meta.mjs cohortFailures), and a half-applied identity lane
 *  must be visible as a defect rather than skipped as an old frontier. */
export async function identityCohortApplied() {
  const r = await rootQuery(
    `select
       to_regclass('clara.counterparty_identity_revisions') is not null as revisions_table,
       exists (select 1 from information_schema.columns
                where table_schema='clara' and table_name='counterparty_aliases'
                  and column_name='recorded_via')                      as alias_recorded_via,
       to_regprocedure('clara.get_counterparty_identity(uuid,uuid)')          is not null as detail_read,
       to_regprocedure('clara.list_counterparty_identity(uuid,text)')         is not null as list_read,
       to_regprocedure('clara.list_counterparty_merge_corrections(uuid)')     is not null as corrections_read,
       to_regprocedure('clara._append_counterparty_identity_revision(uuid,uuid,uuid,text,jsonb,jsonb,text,uuid,text,uuid,uuid,uuid,uuid,text)')
                                                                              is not null as revision_helper,
       to_regprocedure('clara.add_counterparty_alias(uuid,uuid,text,text,text,text,uuid,uuid,uuid,text)')
                                                                              is not null as alias_door`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#647 counterparty-identity cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

/** One firm, four people at four ranks, two clients — plus a SECOND firm with its own admin and
 *  client, because half of these cells are about what a neighbour cannot see. */
export async function identityWorld(tag) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`ci_${suffix}`]))
    .rows[0].id;
  const other = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`ci_other_${suffix}`]))
    .rows[0].id;
  const people = {};
  for (const [key, f, role] of [
    ["owner", firm, "owner"], ["admin", firm, "admin"],
    ["bookkeeper", firm, "bookkeeper"], ["viewer", firm, "viewer"],
    ["otherAdmin", other, "admin"],
  ]) {
    const id = randomUUID();
    await rootQuery(
      "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
      [id, `ci ${key} ${suffix}`, `ci_${key}_${suffix}@rig.test`],
    );
    await rootQuery(
      "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,$3,'active')",
      [f, id, role],
    );
    people[key] = id;
  }
  const clientA = (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [firm, `ci_a_${suffix}`],
  )).rows[0].id;
  const clientB = (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [firm, `ci_b_${suffix}`],
  )).rows[0].id;
  const otherClient = (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [other, `ci_o_${suffix}`],
  )).rows[0].id;
  return { firm, other, clientA, clientB, otherClient, suffix, ...people };
}

/** Through the REAL door, as the REAL role. Returns the new counterparty's uuid. */
export async function createCounterparty(sub, { client, kind = "vendor", name, registration = null, tin = null }) {
  const r = await humanQuery(sub,
    `select clara.create_counterparty(p_client => $1, p_kind => $2, p_name => $3,
        p_registration_no => $4, p_tin => $5, p_op_key => $6) as r`,
    [client, kind, name, registration, tin, opk()]);
  return r.rows[0].r.counterparty_id;
}

/** clara.add_counterparty_alias at its POST-0200 shape — five named args plus the defaulted
 *  provenance trailer. The five-named-arg form (the live web door's own call,
 *  apps/web/lib/registers/counterparty-doors.ts) is exercised separately by addAliasFiveArgs. */
export async function addAlias(sub, { client, counterparty, alias, origin = "human", basis = null,
    document = null, extraction = null, region = null, fieldPath = null, opKey = null }) {
  const r = await humanQuery(sub,
    `select clara.add_counterparty_alias(p_client => $1, p_counterparty => $2, p_alias => $3,
        p_origin => $4, p_op_key => $5, p_basis => $6, p_source_document => $7,
        p_source_extraction => $8, p_source_region => $9, p_source_field_path => $10) as r`,
    [client, counterparty, alias, origin, opKey ?? opk(), basis, document, extraction, region, fieldPath]);
  return r.rows[0].r;
}

/** The FIVE-NAMED-ARG call the shipped web door posts, byte-for-byte in its argument key set. */
export async function addAliasFiveArgs(sub, { client, counterparty, alias, origin = "human" }) {
  const r = await humanQuery(sub,
    `select clara.add_counterparty_alias(p_client => $1, p_counterparty => $2, p_alias => $3,
        p_origin => $4, p_op_key => $5) as r`,
    [client, counterparty, alias, origin, opk()]);
  return r.rows[0].r;
}

export async function retireAlias(sub, { client, alias }) {
  const r = await humanQuery(sub,
    "select clara.retire_counterparty_alias(p_client => $1, p_alias => $2, p_op_key => $3) as r",
    [client, alias, opk()]);
  return r.rows[0].r;
}

export async function renameCounterparty(sub, { client, counterparty, name }) {
  const r = await humanQuery(sub,
    `select clara.rename_counterparty(p_client => $1, p_counterparty => $2, p_new_name => $3,
        p_op_key => $4) as r`,
    [client, counterparty, name, opk()]);
  return r.rows[0].r;
}

export async function setIdentifiers(sub, { client, counterparty, registration = null, tin = null }) {
  const r = await humanQuery(sub,
    `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
        p_registration_no => $3, p_tin => $4, p_op_key => $5) as r`,
    [client, counterparty, registration, tin, opk()]);
  return r.rows[0].r;
}

export async function mergeCounterparties(sub, { client, survivor, merged, reason = "rig duplicate" }) {
  const r = await humanQuery(sub,
    `select clara.merge_counterparties(p_client => $1, p_survivor => $2, p_merged => $3,
        p_reason => $4, p_op_key => $5) as r`,
    [client, survivor, merged, reason, opk()]);
  return r.rows[0].r;
}

export async function identity(sub, { client, counterparty }) {
  const r = await humanQuery(sub,
    "select clara.get_counterparty_identity(p_client => $1, p_counterparty => $2) as r",
    [client, counterparty]);
  return r.rows[0].r;
}

export async function identityList(sub, { client, kind = null }) {
  const r = await humanQuery(sub,
    "select clara.list_counterparty_identity(p_client => $1, p_kind => $2) as r", [client, kind]);
  return r.rows[0].r;
}

export async function mergeCorrections(sub, { client }) {
  const r = await humanQuery(sub,
    "select clara.list_counterparty_merge_corrections(p_client => $1) as r", [client]);
  return r.rows[0].r;
}

/** Every revision row of one counterparty, oldest first, read as ROOT so a cell can assert what
 *  the relation HOLDS independently of what the read chooses to project. */
export async function revisionRows(counterparty) {
  const r = await rootQuery(
    `select revision_n, act, before_state, after_state, basis, changed_by, recorded_via,
            alias_id, source_document_id, source_extraction_id
       from clara.counterparty_identity_revisions
      where counterparty_id = $1 order by revision_n`, [counterparty]);
  return r.rows;
}

export async function aliasRow(aliasId) {
  const r = await rootQuery("select to_jsonb(a) as row from clara.counterparty_aliases a where a.id=$1", [aliasId]);
  return r.rows[0]?.row ?? null;
}

/** A real document + a done invoice_facts extraction + one region, in `firm`, optionally FILED to
 *  `client`. The filing is what makes the document client-congruent; a document with no live
 *  filing is the #646 re-attribution hole this slice's door has to refuse. */
export async function sourceDocument({ firm, client = null, filedBy = null, tag = "src" }) {
  const sha = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  const doc = (await rootQuery(
    `insert into clara.documents(firm_id,sha256,original_filename,mime_type,byte_size,storage_path,
        bytes_verified_at,extraction_status,uploaded_by)
     values($1,$2,$3,'application/pdf',2048,$4,now(),'done',null) returning id`,
    [firm, sha, `${tag}.pdf`, `firms/${firm}/docs/${sha}.pdf`],
  )).rows[0].id;
  const ext = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,
        status,page_count,envelope)
     values($1,$2,$3,'clara-fixture:v1','invoice_facts',1,'done',1,'{}'::jsonb)`,
    [ext, firm, doc],
  );
  const region = (await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
        text_content,engine_confidence)
     values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,'invoice.vendor_name',$3,1.0)
     returning id`,
    [firm, ext, `${tag} VENDOR`],
  )).rows[0].id;
  if (client) {
    await rootQuery(
      // `basis` is a closed CHECK (0007) and `ck_document_filings_resolution` ties every basis but
      // 'legacy-0007' to a resolution row — so the fixture files the legacy way rather than
      // minting a resolution this battery has no opinion about.
      `insert into clara.document_filings(firm_id,document_id,client_id,filed_by,basis)
       values($1,$2,$3,$4,'legacy-0007')`,
      [firm, doc, client, filedBy],
    );
  }
  return { document: doc, extraction: ext, region };
}

/** The thrown error, or null when the call succeeded. */
export async function caught(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

export function reasonOf(err) {
  if (!err) return null;
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
}
