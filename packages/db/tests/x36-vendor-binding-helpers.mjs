// Migration 0028 -- shared rig fixtures for the vendor identity binding battery (task #36).
// NOT a test file (does not end in `.test.mjs`): `node --test` ignores it. Split out of
// x36-vendor-binding-dwell.test.mjs so the ceremony test (propose/sign/revoke,
// x36-vendor-binding-ceremony.test.mjs) shares the exact same fixtures rather than drifting.

import { randomUUID } from "node:crypto";
import { rootQuery, withActor } from "./rig-helpers.mjs";
import { COA } from "./rig-fixtures.mjs";

export async function has28() {
  try {
    const r = await rootQuery("select 1 from clara.schema_migrations where version ~ '^0028_'");
    return r.rows.length > 0;
  } catch { return false; }
}

export async function has29() {
  try {
    const r = await rootQuery(
      "select 1 from clara.schema_migrations where version='0029_vendor_binding_executor'",
    );
    return r.rows.length > 0;
  } catch { return false; }
}

// buildWorld's fixture COA (cash/AR/sales/expense/rounding) carries no payable-class
// account, but _assert_supplier_bill_shape_at requires one for any coding_kind='supplier_bill'
// entry's credit leg. Direct-inserted once per client (PK is client_id+account_code, so this
// is idempotent within a single buildWorld() run) rather than through upsert_account -- these
// helpers already direct-insert documents/entries/lines for the same isolation reason, and
// upsert_account's p_account_class plumbing is incidental to what this battery tests.
export const AP_ACCOUNT = "2000";
export async function seedPayableAccount(firm, client) {
  await rootQuery(
    `insert into clara.coa_accounts(client_id,firm_id,account_code,name,account_type,account_class)
     values($1,$2,$3,'Accounts Payable','liability','payable')`,
    [client, firm, AP_ACCOUNT],
  );
}

// Matches ck_counterparties_name_normalized / ...registration_normalized EXACTLY:
// lower(regexp_replace(x, '[^a-zA-Z0-9]', '', 'g')) -- alphanumeric-only, no spaces.
const foldAlnum = (s) => s.toLowerCase().replace(/[^a-zA-Z0-9]/g, "");

export async function seedVendorCounterparty(firm, client, tag) {
  const name = `EZACCOUNT SECRETARY ${tag}`;
  const reg = `2023${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const r = await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,registration_no,registration_normalized,created_by)
     values($1,$2,'vendor',$3,$5,$4,$6,
       (select user_id from clara.firm_memberships where firm_id=$1 and status='active' limit 1))
     returning id`,
    [firm, client, name, reg, foldAlnum(name), foldAlnum(reg)],
  );
  return { id: r.rows[0].id, name, nameNorm: foldAlnum(name), reg, regNorm: foldAlnum(reg) };
}

/** A bare document with no extractions -- enough for the dwell cells that fail before F1/F2/F3
 *  ever look at extraction content. */
export async function seedBareDocument(firm, tag) {
  const sha = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  const r = await rootQuery(
    `insert into clara.documents(firm_id,sha256,original_filename,mime_type,byte_size,storage_path,bytes_verified_at,extraction_status,uploaded_by)
     values($1,$2,$3,'application/pdf',2048,$4,now(),'pending',null)
     returning id`,
    [firm, sha, `${tag}.pdf`, `firms/${firm}/docs/${sha}.pdf`],
  );
  return { id: r.rows[0].id, sha };
}

/** A minimal approved entry, direct-inserted (bypassing draft/approve) so the fixture is
 *  fast and the posting_date/approved_at/document_id are fully controlled. */
export async function seedApprovedEntry(firm, client, cp, doc, { postingDate, approvedAt = null }) {
  const maker = (await rootQuery("select user_id from clara.firm_memberships where firm_id=$1 and status='active' limit 1", [firm])).rows[0].user_id;
  const resolution = (await rootQuery(
    `insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,method,evidence,resolved_by)
     values($1,$2,'document',$3,1.0,'human','{}'::jsonb,$4) returning id`,
    [firm, client, doc.id, maker],
  )).rows[0].id;
  const filing = (await rootQuery(
    `insert into clara.document_filings(firm_id,document_id,client_id,filed_by,basis,resolution_id)
     values($1,$2,$3,$4,'seed-0007',$5) returning id`,
    [firm, doc.id, client, maker, resolution],
  )).rows[0].id;
  // t_je_balance is a DEFERRED constraint trigger -- it fires at COMMIT of the transaction
  // that touched the row, not at statement end. rootQuery runs each statement as its own
  // autocommit transaction, so a draft insert followed by a *separate* rootQuery call for the
  // lines would commit the (line-less) draft first and fire the deferred check right then --
  // CLR07 unbalanced. Fix: run draft-insert -> lines-insert -> approve-update on ONE client
  // inside ONE explicit transaction (withActor transaction:true) so the deferred check only
  // ever fires once, after the lines exist -- mirroring the real draft/approve lifecycle.
  const entry = await withActor({ transaction: true }, async (pgClient) => {
    const r = await pgClient.query(
      `insert into clara.journal_entries(firm_id,client_id,status,posting_date,origin,document_id,
          filing_id,source_doc_sha256,maker_actor,coding_kind)
       values($1,$2,'draft',$3,'agent',$4,$5,$6,$7,'supplier_bill')
       returning id`,
      [firm, client, postingDate, doc.id, filing, doc.sha, maker],
    );
    const id = r.rows[0].id;
    // A supplier-bill-shaped entry (coding_kind='supplier_bill') requires: no receivable leg,
    // no payable-class DEBIT leg, and a payable-class CREDIT that ties to gross (skipped here
    // since no verified entry_evidence exists) -- Dr expense / Cr payable, both real
    // coa_accounts rows. Every payable/receivable-class line also requires a counterparty.
    await pgClient.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description,counterparty_id)
       values($1,1,$3,100000,0,'bill',$2),($1,2,$4,0,100000,'payable',$2)`,
      [id, cp, COA.expense, AP_ACCOUNT],
    );
    await pgClient.query(
      `update clara.journal_entries set status='approved',checker_actor=$2,approved_at=coalesce($3::timestamptz,now())
       where id=$1`,
      [id, maker, approvedAt],
    );
    return id;
  });
  return entry;
}

/** A DONE invoice_facts + DONE ocr extraction, wired so F1 (vendor name) and F2 (invoice
 *  prefix) are stable across the window and F3 (page-1 top-band OCR line naming the bound
 *  party's registration) holds. */
export async function seedF123Evidence(firm, document, cp, invoiceId) {
  const factsExt = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
     values($1,$2,$3,'clara-fixture:v1','invoice_facts',1,'done',1)`,
    [factsExt, firm, document],
  );
  await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,'invoice.vendor_name',$3,1.0)`,
    [firm, factsExt, cp.name],
  );
  await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,'invoice.invoice_id',$3,1.0)`,
    [firm, factsExt, invoiceId],
  );
  const ocrExt = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,envelope)
     values($1,$2,$3,'clara-fixture:v1','ocr',1,'done',1,$4::jsonb)`,
    [ocrExt, firm, document, JSON.stringify({ pages: [{ page_number: 1, height: 11 }] })],
  );
  // top-band: ymin (y1) = 0.5, height = 11 -> ratio 0.045, well under 0.25.
  await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     values($1,$2,'page_polygon',$3::jsonb,'pages.1.lines.0',$4,1.0)`,
    [firm, ocrExt, JSON.stringify({ page_number: 1, polygon: [1, 0.5, 2, 0.5, 2, 0.9, 1, 0.9] }), `${cp.name} (${cp.reg})`],
  );
}

export async function deriveOrError(firm, client, cp) {
  try {
    const r = await rootQuery(
      "select clara._derive_vendor_binding_proposal($1,$2,$3) as r",
      [firm, client, cp],
    );
    return { ok: true, receipt: r.rows[0].r };
  } catch (e) {
    return { ok: false, message: e.message, code: e.code };
  }
}

/** Seed a full PASSING three-document window (the x36.1 shape) for a fresh counterparty
 *  tagged `tag`, so ceremony tests can propose/sign against a window guaranteed to clear
 *  every _derive_vendor_binding_proposal gate. Returns the counterparty fixture. */
export async function seedPassingWindow(w, tag) {
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, tag);
  const invoiceId = `EZSEC-IV-${randomUUID().slice(0, 5)}`;
  const dates = ["2025-08-25", "2025-08-29", "2025-10-13"];
  for (const d of dates) {
    const doc = await seedBareDocument(w.firms.A, `${tag}-${d}`);
    await seedF123Evidence(w.firms.A, doc.id, cp, invoiceId);
    await seedApprovedEntry(w.firms.A, w.clients.A1, cp.id, doc, { postingDate: d });
  }
  return cp;
}
