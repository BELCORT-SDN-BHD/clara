// #654 — the shared world for the FIRM-DEFAULT battery (NOT a test file: the name does not end
// in `.test.mjs`). It builds on #644's `knowledge-fixtures.mjs` rather than re-minting a firm,
// four ranks and two clients: the subject here is what 0220 adds ON TOP of 0192, so the world is
// 0192's own and only the things 0220 reasons about (the eligibility catalog, a document with and
// without live client filings, a live Work to cite) are minted here.

import { randomUUID } from "node:crypto";
import { asRoot, rootQuery } from "./rig-helpers.mjs";

/** True iff 0220's whole cohort is applied. A PARTIAL cohort throws — "wholly present or wholly
 *  absent" is the estate's rule (rig-meta.mjs cohortFailures), and a half-applied firm-default
 *  lane must be visible as a defect rather than skipped as an old frontier.
 *
 *  THE TRIGGERS ARE PROBED BY NAME OFF pg_trigger, not by their function names alone: the wall
 *  this file's cells exercise is the trigger being ATTACHED, and a cohort probe that only saw the
 *  function bodies would call a schema whole while nothing fired. */
export async function knowledgeFirmCohortApplied() {
  const r = await rootQuery(
    `select
       to_regclass('clara.knowledge_key_firm_eligibility')              is not null as eligibility_table,
       to_regprocedure('clara.list_firm_knowledge()')                   is not null as firm_register_read,
       to_regprocedure('clara.get_knowledge_applicability(uuid,text)')  is not null as applicability_read,
       to_regprocedure('clara._tf_knowledge_firm_eligibility()')        is not null as eligibility_fn,
       to_regprocedure('clara._tf_knowledge_firm_evidence()')           is not null as evidence_fn,
       exists (select 1 from pg_trigger
                where tgrelid = 'clara.knowledge_records'::regclass
                  and not tgisinternal and tgname = 't_knowledge_records_firm_eligibility')
                                                                        as eligibility_trigger,
       exists (select 1 from pg_trigger
                where tgrelid = 'clara.knowledge_records'::regclass
                  and not tgisinternal and tgname = 't_knowledge_records_firm_evidence')
                                                                        as evidence_trigger,
       to_regprocedure('clara._tf_document_filing_firm_knowledge()')     is not null as filing_fn,
       exists (select 1 from pg_trigger
                where tgrelid = 'clara.document_filings'::regclass
                  and not tgisinternal and tgname = 't_document_filings_firm_knowledge')
                                                                        as filing_trigger`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#654 firm-default cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

/** A firm document with NO client filing — the source 0192 reserves for a firm-scope record
 *  (`0192:871-874`: "a knowledge source may legitimately be an unfiled firm document"). */
export async function firmDocument(firm, uploader, seed = randomUUID()) {
  const digest = Buffer.from(String(seed)).toString("hex").padEnd(64, "0").slice(0, 64);
  return (await rootQuery(
    `insert into clara.documents(firm_id, sha256, original_filename, mime_type, byte_size,
        storage_path, uploaded_by)
     values ($1, $2, $3, 'application/pdf', 10, $4, $5) returning id`,
    [firm, digest, `p654_${String(seed).slice(0, 8)}.pdf`, `firms/${firm}/docs/${digest}.pdf`, uploader],
  )).rows[0].id;
}

/** File `document` to `client`, LIVE. `uq_document_filing_active` is over
 *  `(document_id, client_id) where retired_at is null` (0007:92-94), so ONE document may hold
 *  MANY live filings — which is exactly why the evidence wall is written against N, not one. */
export async function fileDocument(firm, document, client, filedBy) {
  return (await rootQuery(
    `insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
     values ($1,$2,$3,$4,'legacy-0007') returning id`,
    [firm, document, client, filedBy],
  )).rows[0].id;
}

/** Retire a live filing, so the same document becomes admissible again. */
export async function retireFiling(filing, by) {
  await rootQuery(
    `update clara.document_filings
        set retired_at = now(), retired_by = $2, retirement_reason = 'p654 rig retirement'
      where id = $1`,
    [filing, by],
  );
}

/** A LIVE (non-terminal) accounting Work a knowledge record can pin as its `source_work_id`.
 *  Minted through the root connection for `knowledge-fixtures.mjs`'s own stated reason: the
 *  subject of these cells is the knowledge lane, not the admission lane. */
export async function liveWork(firm, client, initiator) {
  const digest = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  return (await rootQuery(
    `insert into clara.accounting_work(
        firm_id, client_id, purpose, status, initiator, initiator_role, intent_key,
        logical_op_id, basis, basis_digest, basis_origin, source_refs, initiated_by)
     values ($1,$2,'journal_entry','awaiting_input',$3,'bookkeeper',$4,$5,
             '{"rig":"p654"}'::jsonb,$6,'user_direct','[]'::jsonb,$3) returning id`,
    [firm, client, initiator, `p654_${randomUUID()}`, `p654_${randomUUID()}`, digest],
  )).rows[0].id;
}

/** Deactivate a membership, the shape #625's lifecycle produces
 *  (`firm_memberships.status in ('active','removed')`, measured off the live CHECK). */
export async function deactivateMembership(firm, user) {
  await rootQuery(
    "update clara.firm_memberships set status = 'removed', removed_at = now() where firm_id = $1 and user_id = $2",
    [firm, user],
  );
}

/** A filing that is REFUSED by 0220's `t_document_filings_firm_knowledge` wall today, made
 *  anyway — the only way to reach the contaminated state a database PREDATING 0220 could hold.
 *
 *  `session_replication_role = 'replica'` suppresses non-ALWAYS triggers for THIS SESSION ONLY
 *  (never a global `alter table ... disable trigger`, which a crashed cell would leave off for
 *  every other lane on the rig), and `withActor`'s own `reset all` clears it when the connection
 *  goes back to the pool. It is used by exactly one cell — the one proving that a contaminated
 *  firm rule can still be RETRACTED, which is the half of the wall a legacy row needs. */
export async function fileDocumentPre0220(firm, document, client, filedBy) {
  return asRoot(async (c) => {
    await c.query("set session_replication_role = 'replica'");
    try {
      const r = await c.query(
        `insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
         values ($1,$2,$3,$4,'legacy-0007') returning id`,
        [firm, document, client, filedBy],
      );
      return r.rows[0].id;
    } finally {
      await c.query("set session_replication_role = 'origin'").catch(() => {});
    }
  });
}

/** How many live firm-scope knowledge rows in this firm would the two evidence arms refuse if
 *  they were inserted today — the RUNTIME form of 0220 §0(8) / §E T.4's apply-time census. */
export async function evidenceViolators(firm) {
  const r = await rootQuery(
    `select
       count(*) filter (where r.source_document_id is not null and exists (
         select 1 from clara.document_filings f
          where f.document_id = r.source_document_id and f.retired_at is null))::int as documents,
       count(*) filter (where r.source_work_id is not null)::int as works
     from clara.knowledge_records r
    where r.firm_id = $1 and r.scope_kind = 'firm' and r.state = 'live'`,
    [firm],
  );
  return r.rows[0];
}
