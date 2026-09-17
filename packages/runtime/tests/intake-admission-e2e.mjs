// #633 AC4/AC10 — AUTOMATIC ADMISSION, ON A REAL POSTGRES WORLD.
//
// STANDALONE (not collected by `node --test`), on `intake-e2e.mjs`'s proven shape. Run:
//
//   PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres PGDATABASE=<throwaway> \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:<port>/<throwaway> \
//   node tests/intake-admission-e2e.mjs
//
// WHAT `intake-e2e.mjs` ALREADY PROVES, and this file therefore does not repeat: the
// HTTP transport itself — CORS, the streaming PUT, the token lock, the upload
// capability never crossing workflow step IO, and the ingest task reaching `done` with
// regions. What it does NOT prove, and what this ticket owes, is the chain AFTER the
// bytes are read: that a file becomes admitted WORK with no human pressing anything.
//
// THE CLAIM UNDER TEST, in one sentence: from `finalize` onward nobody calls
// `clara.request_autodraft`. That door was rewritten by #614 into a RECOVERY act
// ("start processing again"), not a gate, and the automatic lane runs entirely without
// it — `startWorld.ts:476` starts the facts-gate consumer, `:390` the autodraft
// consumer, and `autodraft.mjs` calls `clara.admit_autodraft_task` directly.
//
// FIX ROUND 1 — WHAT LEG 1 USED TO CLAIM, AND WHAT IT NOW PROVES (review findings
// SPEC-F1 / 633-ADV-1). Its poll predicate was `(row) => row !== null`, so "a classify
// task exists" passed even though every one of them was, on this fixture, an immediate
// and permanent `firm_narrow_consent_inactive` failure: the leg never got past the first
// gate and the header nevertheless said "the chain reaches an admitted coding task on
// its own". The leg now has three arms, each of which can go red on its own:
//   (a) CONTROL — an UNFILED upload's classify task settles `failed` with the estate's
//       OWN named verdict (`firm_narrow_consent_inactive`), and no kind is invented. So
//       arm (b)'s `done` is a filter doing work, not a poll that ignores status.
//   (b) THE CONSENTED CHAIN — with the client's `document_processing` consent granted
//       through the REAL governed verbs and the document filed the way the browser's own
//       queue files it, the chain runs ingest -> extraction done -> classify `done` ->
//       `documents.document_kind` set -> `document.classified`, with NO human act in it.
//   (c) THE ADMISSION DOOR — a real MyInvois UBL invoice runs upload -> structured_parse
//       -> local_facts `done` -> `document.invoice_facts_completed` -> the autodraft
//       consumer calling `clara.admit_autodraft_task` for that filing, ON ITS OWN. The
//       door's own verdict is read back and printed VERBATIM, never dressed as success.
//
// THE RESIDUAL, NAMED. Arm (c) proves the admission door is REACHED automatically; it
// does not prove an admitted CODING TASK, because `_coding_lane_core` refuses this
// fixture's document (`tier_a_fails`, `direction_unresolved`, `vendor_unresolved`,
// `no_consent` — measured on clara_633) and routes it to `needs_you` instead. A document
// that satisfies Tier A needs counterparty resolution, a resolved direction and coding
// consent — the autodraft lane's own fixture, not this ticket's. #633 owns the chain up
// to the door and says exactly that.
//
// SEVEN LEGS:
//   1. upload -> ingest -> classify -> facts -> `admit_autodraft_task`, with ZERO
//      `request_autodraft` anywhere in the automatic lane (three arms, above).
//   2. a FAILED extraction never yields a kind (0177's router returns
//      `awaiting_extraction` until a `done` ocr/structured_parse extraction exists).
//   3. duplicate bytes answer `adopted` and bind to the EXISTING document — one
//      document, one ingest task, with the 0051 recovery fragment on the receipt.
//   4. a five-file mixed batch (one `bad_type`, one `too_large`, three good) settles
//      each file INDEPENDENTLY.
//   5. a LOST FINALIZE RESPONSE, replayed, still leaves exactly one document and one
//      ingest task. (A true SIGKILL-between-finalize-and-checkpoint variant needs the
//      spawned-engine shape `interview-kill-resume-e2e.mjs` uses; this leg proves the
//      convergence property the client actually experiences, and the residual is named
//      in the ticket's report.)
//   6. H-53 — a non-coding kind born on this route keeps custody and never enters the
//      coding lane.
//   7. C-37 — a real OFX and a real XLSX travel begin->PUT->finalize, and the registry's
//      published levels for those pairs are exactly what a surface may claim.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { crc32 } from "node:zlib";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// Fail-closed local gate, one notch wider than `intake-e2e.mjs`'s: the same loopback
// requirement and the same two sanctioned CI throwaways, PLUS this wave's per-ticket rig
// databases (`clara_<three digits>`, RIG.md), because a wave worker cannot create a
// second migrated database on its own cluster — migration 0154 pins the CLUSTER-WIDE
// `clara%` role count, so a second from-scratch chain would destroy the rig.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|intake_ci|\d{3})$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("intake-admission-e2e is hard-gated to loopback + PGDATABASE in {clara_rt_test,clara_intake_ci,clara_<ddd>}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|intake_ci|\d{3})(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("intake-admission-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + the same throwaway database");
}

process.env.RELAY_TEST_MODE = "1";
process.env.CLARA_START_WORLD = "1";
process.env.CLARA_DOC_EGRESS_APPROVED = "1";
process.env.WORKFLOW_TARGET_WORLD = "@workflow/world-postgres";
process.env.PORT ||= await ephemeralPort();
process.env.CLARA_INTAKE_CORS_ORIGINS = "https://dashboard.test";
const tempBase = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
await mkdir(tempBase, { recursive: true });
const scratch = await mkdtemp(join(tempBase, "clara-intake-admission-"));
process.env.CLARA_SPOOL_DIR = join(scratch, "spool");
process.env.CLARA_TEST_STORAGE_DIR = join(scratch, "storage");

const issuer = "https://clara-intake.test/auth/v1";
const audience = "authenticated";
const jwtSecret = `admission-${randomUUID().replaceAll("-", "")}`;
process.env.SUPABASE_JWT_ISSUER = issuer;
process.env.SUPABASE_JWT_AUD = audience;
process.env.SUPABASE_JWT_SECRET = jwtSecret;

// The OCR fixture. Its text is deliberately invoice-shaped so the classify lane has
// something real to work from — the chain, not the classifier's accuracy, is the subject.
globalThis.__claraAzureForTest = async () => ({
  status: "succeeded",
  operationId: "fixture-op",
  analyzeResult: {
    content: "TAX INVOICE\nInvoice No INV-2026-0041\nDate 05/04/2026\nTotal MYR 123.45",
    pages: [{
      pageNumber: 1,
      lines: [{ content: "TAX INVOICE Invoice No INV-2026-0041 Total MYR 123.45", polygon: [0, 0, 1, 0, 1, 1, 0, 1] }],
    }],
  },
});

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const ORIGIN = "https://dashboard.test";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const key = new TextEncoder().encode(jwtSecret);
const mint = (sub) =>
  new SignJWT({ role: audience })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(key);

/** Structurally plausible per the F-12 admission check (startxref + obj/endobj + %%EOF). */
const pdfBytes = (marker) =>
  Buffer.from(`%PDF-1.7\n1 0 obj << /Type /Page /Marker (${marker}) >> endobj\nstartxref\n0\n%%EOF\n`);

/** A real OFX 1.x SGML document — the shape `statement-parse.mjs:268-276` reads. */
const OFX_BYTES = Buffer.from(
  "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>"
  + "<CURDEF>MYR<BANKACCTFROM><BANKID>1234<ACCTID>567890<ACCTTYPE>CHECKING</BANKACCTFROM>"
  + "<BANKTRANLIST><DTSTART>20260401<DTEND>20260430"
  + "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260405<TRNAMT>-123.45<FITID>X1<NAME>SUPPLIER SDN BHD</STMTTRN>"
  + "</BANKTRANLIST><LEDGERBAL><BALAMT>1000.00<DTASOF>20260430</LEDGERBAL>"
  + "</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n",
);

/** A REAL, minimal XLSX — built here, with no dependency.
 *
 *  FIX ROUND 1 (review finding 633-ADV-2). This used to try `jszip` (which is not a
 *  dependency of @clara/runtime, so the import always failed) and fall back to a 45-byte
 *  `PK\x03\x04` stub. `lib/scan.mjs:68-136` reads the END-OF-CENTRAL-DIRECTORY record,
 *  walks the central directory and requires `[Content_Types].xml` + `xl/workbook.xml`, so
 *  the stub was quarantined on every run ("ZIP central directory is missing") while the
 *  leg printed `outcome: admitted` for it and asserted only on registry rows.
 *
 *  This is a genuine stored-entry (method 0) ZIP: local file header + data per entry,
 *  then the central directory, then the EOCD. Verified against `scan.detectDocument`
 *  itself, which reads it as `{format:'xlsx', pages:1}`. */
function xlsxBytes() {
  const files = [
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'],
    ["xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="TB" sheetId="1"/></sheets></workbook>'],
    ["xl/worksheets/sheet1.xml", '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Trial balance</t></is></c></row></sheetData></worksheet>'],
  ];
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, eocd]);
}

/** A minimal VALID MyInvois UBL invoice — the same shape `ingest-workflow-db.test.mjs`
 *  proves the local structured_parse identity pass accepts. An XML rides `local_facts`
 *  (`_enqueue_invoice_facts_core`'s xml arm) with NO model and NO vendor egress, which is
 *  what makes the whole automatic chain to `admit_autodraft_task` deterministic here. */
const UBL_INVOICE = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>ADMISSION-E2E-1</cbc:ID>
  <cbc:IssueDate>2026-01-15</cbc:IssueDate>
  <cbc:InvoiceTypeCode listVersionID="1.1">01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>MYR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="TIN">C1234567890</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>ROME PROPERTIES SDN BHD</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyLegalEntity><cbc:RegistrationName>DARE TO DREAM SDN BHD</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="MYR">60.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="MYR">1000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="MYR">1060.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="MYR">1060.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;

async function waitHealthy() {
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* booting */ }
    await sleep(100);
  }
  throw new Error("runtime did not become healthy");
}

async function begin(jwt, bytes, filename, mime) {
  const response = await fetch(`${BASE}/api/intake/documents`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ filename, mime, declared_bytes: bytes.length, origin: "documents_tab" }),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function putBytes(token, intakeId, bytes) {
  const response = await fetch(`${BASE}/api/intake/documents/${intakeId}/bytes`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/octet-stream", origin: ORIGIN },
    body: bytes,
  });
  return response.status;
}

async function finalize(token, intakeId) {
  const response = await fetch(`${BASE}/api/intake/documents/${intakeId}/finalize`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: ORIGIN },
    body: "{}",
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

/** begin -> PUT -> finalize, the whole client trip. */
async function upload(jwt, bytes, filename, mime) {
  const begun = await begin(jwt, bytes, filename, mime);
  if (begun.status !== 201) return { refusedAt: "begin", status: begun.status, body: begun.body };
  const put = await putBytes(begun.body.upload_token, begun.body.intake_id, bytes);
  if (put !== 204) return { refusedAt: "bytes", status: put, intakeId: begun.body.intake_id };
  const sealed = await finalize(begun.body.upload_token, begun.body.intake_id);
  return {
    refusedAt: null, intakeId: begun.body.intake_id, token: begun.body.upload_token,
    status: sealed.status, receipt: sealed.body,
  };
}

/** THE BROWSER'S OWN ATTRIBUTION ACT, through the estate's real doors: the two-step
 *  `record_client_resolution` then `file_document` that `apps/web/lib/documents/doors.ts`'s
 *  `fileToClient` performs after finalize on the client's documents tab. It is the ONE
 *  human act in leg 1 — everything before and after it is the machine's. */
async function fileToClient(rig, owner, documentId, client, tag) {
  const res = await rig.humanQuery(
    owner,
    `select clara.record_client_resolution(p_client => $1, p_subject_kind => 'document', p_subject => $2,
       p_confidence => 1.0, p_method => 'human', p_evidence => '{"source":"intake-admission-e2e"}'::jsonb,
       p_op_key => $3) as out`,
    [client, documentId, `p633-${tag}-res-${randomUUID()}`],
  );
  const out = res.rows[0].out;
  await rig.humanQuery(
    owner,
    "select clara.file_document(p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4)",
    [documentId, client, out?.resolution_id ?? out, `p633-${tag}-file-${randomUUID()}`],
  );
}

async function poll(rig, sql, params, predicate, label, tries = 400) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    last = (await rig.rootQuery(sql, params)).rows[0] ?? null;
    if (predicate(last)) return last;
    await sleep(100);
  }
  throw new Error(`${label} timed out; last=${JSON.stringify(last)}`);
}

// ---------------------------------------------------------------------------

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.documentPipelineReady())) throw new Error("migration 0007 is absent");
  const { owner, firm, client } = await rig.buildFirm("intake-admission-e2e");
  const jwt = await mint(owner);

  // ONE model for BOTH lanes. The classify consumer calls `generateObject`
  // (`lib/classify-llm.mjs:205`) and every chat/text lane calls `streamText`; they share
  // the SAME `__claraModelForTest` override, so a text-only mock left every classify task
  // failing its three attempts — which is part of why leg 1 could not reach a kind before
  // this fix round. No network, no key, deterministic.
  const { MockLanguageModelV4, simulateReadableStream } = await import("ai/test");
  const mockUsage = () => ({
    inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 7, reasoning: undefined, audio: undefined },
    raw: undefined,
  });
  globalThis.__claraModelForTest = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify({ kind: "invoice", confidence: 0.93, rationale: "line items + a total due + one seller and one buyer" }) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: mockUsage(),
      warnings: [],
    }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: "admission chain " },
          { type: "text-end", id: "t1" },
          { type: "finish", usage: mockUsage(), finishReason: { unified: "stop", raw: "stop" } },
        ],
        chunkDelayInMs: 5,
      }),
    }),
  });
  await import("../.output/server/index.mjs");
  await waitHealthy();

  // =========================================================================
  // LEG 1 — NO HUMAN GATE ANYWHERE ON THE ADMISSION CHAIN.
  // =========================================================================
  //
  // Half one is STRUCTURAL and is asserted from the source itself: not one module in
  // the automatic lane names `request_autodraft`. That door is #614's RECOVERY act, and
  // if the automatic lane ever started calling it, "automatic" would quietly become
  // "automatic, once someone re-triggers it".
  const AUTOMATIC_LANE = [
    "lib/intake.mjs", "lib/intake-lanes.mjs", "lib/intake-recovery.mjs",
    "lib/autodraft.mjs", "lib/facts-gate.mjs", "src/intakeRoutes.ts",
  ];
  for (const rel of AUTOMATIC_LANE) {
    const source = await readFile(join(HERE, "..", rel), "utf8");
    assert.equal(
      source.includes("request_autodraft"), false,
      `${rel} must not reach for the RECOVERY door — the automatic lane admits work by itself (#614)`,
    );
  }
  // NON-VACUITY: the door does exist and something does name it, or the loop above
  // would pass against a repo where the string simply never occurs.
  const recoveryExists = await rig.rootQuery(
    "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='request_autodraft'",
  );
  assert.equal(recoveryExists.rows[0].n, 1, "control: clara.request_autodraft exists — it is a recovery door, not an absent one");

  // -------------------------------------------------------------------------
  // 1(a) CONTROL — THE ESTATE REFUSES BY NAME, so 1(b)'s `done` is a filter.
  // -------------------------------------------------------------------------
  // An UNFILED document is the pre-attribution class (0123's D-21 branch): classify needs
  // the firm's own `firm_narrow_intake`/`attribution` activation, which this fixture
  // deliberately does not hold. The verdict is a terminal, never-claimed failed task
  // carrying the estate's own word for it — not a stall, and not a kind invented anyway.
  const control = await upload(jwt, pdfBytes("leg1-control"), "never-attributed.pdf", "application/pdf");
  assert.equal(control.refusedAt, null, `the control upload was refused at ${control.refusedAt}`);
  const controlDoc = control.receipt.document_id;
  assert.ok(controlDoc, "the control document was adopted");
  const gated = await poll(
    rig,
    "select status, error_code from clara.document_processing_tasks where document_id=$1 and lane='classify' order by version_n desc limit 1",
    [controlDoc],
    (row) => row?.status === "failed",
    "leg 1(a): an UNFILED document's classify task settles as the estate's own refusal",
  );
  assert.equal(
    gated.error_code, "firm_narrow_consent_inactive",
    `the refusal must NAME itself — saw ${gated.error_code}`,
  );
  const controlKind = await rig.rootQuery("select document_kind from clara.documents where id=$1", [controlDoc]);
  assert.equal(controlKind.rows[0].document_kind, null, "and a refused classify invents no kind");

  // -------------------------------------------------------------------------
  // 1(b) THE CONSENTED CHAIN — upload -> extraction -> classify DONE -> a kind.
  // -------------------------------------------------------------------------
  // The client's `document_processing` consent is granted through the REAL governed verbs
  // (classify_consent_evidence_document -> grant_client_egress_purpose ->
  // activate_client_egress_purpose), never a raw table write; the filing is the same
  // two-step the browser's own queue performs after finalize
  // (`apps/web/lib/documents/useUploadQueue.ts:322` -> `doors.ts`'s `fileToClient`).
  // Everything after that is the machine's.
  await rig.ensureClassifyConsent(owner, { firm, client });
  const one = await upload(jwt, pdfBytes("leg1"), "supplier-invoice.pdf", "application/pdf");
  assert.equal(one.refusedAt, null, `leg 1 upload was refused at ${one.refusedAt}`);
  assert.equal(one.status, 202, `finalize returned ${one.status}`);
  const documentId = one.receipt.document_id;
  assert.ok(documentId, "finalize adopted a document");
  await fileToClient(rig, owner, documentId, client, "leg1");

  await poll(
    rig,
    "select status from clara.document_processing_tasks where id=$1",
    [one.receipt.task_id],
    (row) => row?.status === "done",
    "leg 1(b): the ingest task reaches done with NO human act",
  );
  const extraction = await rig.rootQuery(
    "select status, engine_kind from clara.document_extractions where document_id=$1 order by version_n desc",
    [documentId],
  );
  assert.ok(extraction.rowCount >= 1, "an extraction landed");
  assert.equal(extraction.rows[0].status, "done", "and it is done — 0177's gate opens only for a done extraction");

  const classify = await poll(
    rig,
    "select status, error_code from clara.document_processing_tasks where document_id=$1 and lane='classify' order by version_n desc limit 1",
    [documentId],
    (row) => row?.status === "done",
    "leg 1(b): the classify task itself reaches DONE — not merely 'a row exists'",
  );
  assert.equal(classify.status, "done", "the classify lane settled on its own");
  const kinded = await poll(
    rig,
    "select document_kind from clara.documents where id=$1",
    [documentId],
    (row) => row?.document_kind !== null,
    "leg 1(b): the classifier's verdict reaches the document",
  );
  assert.ok(kinded.document_kind, "a kind landed with no human classifying anything");
  const classified = await rig.rootQuery(
    "select count(*)::int n from clara.domain_events where event_type='document.classified' and document_id=$1",
    [documentId],
  );
  assert.equal(classified.rows[0].n, 1, "and it reached the spine exactly once as document.classified");

  // -------------------------------------------------------------------------
  // 1(c) THE ADMISSION DOOR, REACHED ON ITS OWN.
  // -------------------------------------------------------------------------
  // A real MyInvois UBL invoice is the deterministic path to the end of the chain: an XML
  // rides `structured_parse` at intake and then `local_facts` (`clara-myinvois:v1`), both
  // LOCAL — no model, no vendor egress, no second typed consent — so
  // `document.invoice_facts_completed` really lands and the autodraft consumer really
  // wakes. What it does next is `clara.admit_autodraft_task` for this document's filing,
  // under a sweep run it opened itself: origin `sweep`, never `one_click` (the door's own
  // CLR10 makes that pairing impossible), and with nothing human in between.
  const ubl = await upload(jwt, Buffer.from(UBL_INVOICE, "utf8"), "myinvois-invoice.xml", "application/xml");
  assert.equal(ubl.refusedAt, null, `the UBL upload was refused at ${ubl.refusedAt}`);
  const ublDoc = ubl.receipt.document_id;
  assert.ok(ublDoc, "the UBL invoice was adopted");
  await fileToClient(rig, owner, ublDoc, client, "leg1-ubl");

  const facts = await poll(
    rig,
    "select status, error_code from clara.document_processing_tasks where document_id=$1 and lane='local_facts' order by version_n desc limit 1",
    [ublDoc],
    (row) => row?.status === "done",
    "leg 1(c): the local facts pass runs itself to done",
  );
  assert.equal(facts.status, "done", "the MyInvois facts pass settled with no human act");
  const factsEvent = await rig.rootQuery(
    "select count(*)::int n from clara.domain_events where event_type='document.invoice_facts_completed' and document_id=$1",
    [ublDoc],
  );
  assert.equal(factsEvent.rows[0].n, 1, "and it reached the spine as document.invoice_facts_completed");

  const admission = await poll(
    rig,
    `select i.outcome, i.refusal_token, i.filing_id, s.state as run_state
       from clara.sweep_run_items i join clara.sweep_runs s on s.id = i.run_id
      where i.document_id = $1 order by i.created_at desc limit 1`,
    [ublDoc],
    (row) => row !== null,
    "leg 1(c): the autodraft consumer calls admit_autodraft_task for this filing, on its own",
  );
  assert.ok(admission.filing_id, "the admission is keyed on the document's FILING, as the door requires");
  assert.ok(admission.outcome, "and the door answered with one of its own named outcomes");
  const filingRow = await rig.rootQuery(
    "select id from clara.document_filings where document_id=$1 and retired_at is null", [ublDoc],
  );
  assert.equal(
    admission.filing_id, filingRow.rows[0].id,
    "and on THIS document's live filing, not some other row the sweep happened to touch",
  );
  // A run-bound item is itself the proof of origin: `admit_autodraft_task` raises CLR10
  // for `one_click` WITH a run id and for `sweep` WITHOUT one, so an item inside an open
  // sweep run can only have come from the unattended lane.
  const oneClick = await rig.rootQuery(
    "select count(*)::int n from clara.sweep_run_items where document_id=$1 and run_id is null", [ublDoc],
  );
  assert.equal(oneClick.rows[0].n, 0, "no one-click (human recovery) admission exists for this document");
  console.log(
    `[leg 1] PASS — control refused ${gated.error_code}; consented chain classified as '${kinded.document_kind}'; `
    + `admit_autodraft_task reached on its own for filing ${admission.filing_id} with outcome '${admission.outcome}'`
    + `${admission.refusal_token ? ` (${JSON.stringify(admission.refusal_token)})` : ""}; zero request_autodraft in the automatic lane`,
  );

  // =========================================================================
  // LEG 2 — A FAILED OR EMPTY EXTRACTION NEVER YIELDS A KIND.
  // =========================================================================
  //
  // 0177's `_enqueue_invoice_facts_core` returns `awaiting_extraction` until a DONE
  // ocr/structured_parse extraction exists (:44-58). Driven here on the router itself,
  // against a document whose only extraction FAILED — a passing classify would be the
  // exact "the machine decided from nothing" failure #606 exists to prevent.
  const two = await upload(jwt, pdfBytes("leg2"), "unreadable.pdf", "application/pdf");
  assert.equal(two.refusedAt, null);
  const failedDoc = two.receipt.document_id;
  await rig.rootQuery(
    "update clara.document_extractions set status='failed' where document_id=$1",
    [failedDoc],
  );
  await rig.rootQuery("update clara.documents set document_kind=null where id=$1", [failedDoc]);
  const routed = await rig.rootQuery("select clara._enqueue_invoice_facts_core($1) as out", [failedDoc]);
  const outcome = routed.rows[0].out;
  assert.match(
    JSON.stringify(outcome), /awaiting_extraction/,
    `the facts router must refuse to proceed without a DONE extraction — saw ${JSON.stringify(outcome)}`,
  );
  const kindAfter = await rig.rootQuery("select document_kind from clara.documents where id=$1", [failedDoc]);
  assert.equal(kindAfter.rows[0].document_kind, null, "and no kind was invented from a failed read");
  console.log("[leg 2] PASS — a failed extraction yields awaiting_extraction and no kind");

  // =========================================================================
  // LEG 3 — DUPLICATE BYTES CONVERGE ON THE EXISTING DOCUMENT.
  // =========================================================================
  const dupBytes = pdfBytes("leg3-duplicate");
  const first = await upload(jwt, dupBytes, "duplicate.pdf", "application/pdf");
  assert.equal(first.refusedAt, null);
  const firstDoc = first.receipt.document_id;

  const second = await upload(jwt, dupBytes, "duplicate-again.pdf", "application/pdf");
  assert.equal(second.refusedAt, null, "a duplicate is ADOPTED, not refused");
  assert.equal(second.receipt.document_id, firstDoc, "the same bytes bind to the EXISTING document (0003:76, unique (firm_id, sha256))");

  const docsForSha = await rig.rootQuery(
    "select count(*)::int n from clara.documents d join clara.document_intakes i on i.document_id=d.id where i.id=$1",
    [second.intakeId],
  );
  assert.equal(docsForSha.rows[0].n, 1, "one document, not two");
  console.log(`[leg 3] PASS — duplicate bytes adopted onto the existing document; receipt keys: ${Object.keys(second.receipt).join(",")}`);

  // SAME NAME, DIFFERENT BYTES stay DISTINCT — the other half of identity-is-sha256.
  const sameName = await upload(jwt, pdfBytes("leg3-different"), "duplicate.pdf", "application/pdf");
  assert.equal(sameName.refusedAt, null);
  assert.notEqual(sameName.receipt.document_id, firstDoc, "identity is the sha256, never the filename");
  console.log("[leg 3] PASS — same name, different bytes stayed distinct");

  // =========================================================================
  // LEG 4 — A FIVE-FILE MIXED BATCH SETTLES INDEPENDENTLY.
  // =========================================================================
  // AT THE CLIENT'S OWN CONCURRENCY. `useUploadQueue.ts`'s CONCURRENCY is 2, so two in
  // flight is the shape the product actually produces — and it matters: a burst of five
  // simultaneous PUTs is refused 429 by the runtime's own upload ceiling (measured on the
  // rig, 2026-09-16), which is a correct, per-item refusal but not the batch this leg is
  // about. The ceiling gets its own assertion below rather than being papered over.
  async function pool(jobs, width) {
    const results = new Array(jobs.length);
    let next = 0;
    await Promise.all(Array.from({ length: width }, async () => {
      for (;;) {
        const i = next++;
        if (i >= jobs.length) return;
        results[i] = await jobs[i]();
      }
    }));
    return results;
  }

  const batch = await pool([
    () => upload(jwt, pdfBytes("batch-a"), "batch-a.pdf", "application/pdf"),
    () => upload(jwt, pdfBytes("batch-b"), "batch-b.pdf", "application/pdf"),
    () => upload(jwt, pdfBytes("batch-c"), "batch-c.pdf", "application/pdf"),
    // bad_type: a mime the 12-entry allowlist does not admit.
    () => upload(jwt, Buffer.from("not a document"), "notes.exe", "application/x-msdownload"),
    // too_large: the 20 MB wall (`intake.mjs:28`) is judged on the DECLARED size at
    // `begin`, so this one is refused before a single byte moves.
    () => fetch(`${BASE}/api/intake/documents`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ filename: "huge.pdf", mime: "application/pdf", declared_bytes: 21 * 1024 * 1024, origin: "documents_tab" }),
    }),
  ], 2);
  const good = batch.slice(0, 3);
  for (const [i, result] of good.entries()) {
    assert.equal(
      result.refusedAt, null,
      `good file ${i} must not be refused — refusedAt=${result.refusedAt} status=${result.status} body=${JSON.stringify(result.body ?? null)}`,
    );
    assert.equal(result.status, 202, `good file ${i} must finalize, saw ${result.status}`);
    assert.ok(result.receipt.document_id, `good file ${i} must adopt a document`);
  }
  const badType = batch[3];
  assert.notEqual(badType.refusedAt, null, "an unadmitted mime is refused, and the refusal is that file's alone");
  const goodIds = new Set(good.map((g) => g.receipt.document_id));
  assert.equal(goodIds.size, 3, "three distinct documents — one bad file stopped none of them");

  const oversized = batch[4];
  assert.notEqual(oversized.status, 201, `a 21 MB declaration must be refused at begin — saw ${oversized.status}`);
  console.log(`[leg 4] PASS — 3 good / 1 bad_type (${badType.refusedAt} ${badType.status}) / 1 too_large (${oversized.status}) each settled on their own`);

  // AND THE CEILING ITSELF IS PER-ITEM. Five simultaneous PUTs exceed the runtime's own
  // upload ceiling; what matters is that the excess is refused with its OWN status on its
  // OWN file rather than failing the batch or, worse, being dressed as success.
  const burst = await Promise.all(
    Array.from({ length: 5 }, (_, i) => upload(jwt, pdfBytes(`burst-${i}`), `burst-${i}.pdf`, "application/pdf")),
  );
  const admitted = burst.filter((r) => r.refusedAt === null);
  const refused = burst.filter((r) => r.refusedAt !== null);
  assert.ok(admitted.length >= 1, "a burst must still admit what the ceiling allows");
  for (const r of refused) {
    assert.ok(
      typeof r.status === "number" && r.status >= 400,
      `a refused burst item carries its own honest status — saw ${JSON.stringify(r)}`,
    );
  }
  assert.equal(
    new Set(admitted.map((r) => r.receipt.document_id)).size, admitted.length,
    "every admitted burst item is its own document",
  );
  console.log(`[leg 4] PASS — burst of 5: ${admitted.length} admitted, ${refused.length} refused per-item (${refused.map((r) => `${r.refusedAt}:${r.status}`).join(", ") || "none"})`);

  // =========================================================================
  // LEG 5 — A LOST FINALIZE RESPONSE LEAVES EXACTLY ONE DOCUMENT AND ONE TASK.
  // =========================================================================
  //
  // NAMED NARROWING: the brief asks for a SIGKILL between finalize and checkpoint. That
  // needs the spawned-engine shape `interview-kill-resume-e2e.mjs` uses, and this file
  // boots the runtime IN PROCESS (as `intake-e2e.mjs` does) so it can inject the OCR
  // fixture. What is proven here is the convergence property a client actually
  // experiences — a finalize whose response never arrived, replayed — and the residual
  // is named in the ticket's report rather than left implied.
  const lost = await upload(jwt, pdfBytes("leg5"), "lost-response.pdf", "application/pdf");
  assert.equal(lost.refusedAt, null);
  const lostDoc = lost.receipt.document_id;
  const replay = await finalize(lost.token, lost.intakeId);
  assert.ok([200, 202, 404, 409].includes(replay.status), `a replayed finalize answers honestly — saw ${replay.status}`);

  const docCount = await rig.rootQuery("select count(*)::int n from clara.documents where id=$1", [lostDoc]);
  assert.equal(docCount.rows[0].n, 1, "exactly one document survives a replayed finalize");
  const ingestTasks = await rig.rootQuery(
    "select count(*)::int n from clara.document_processing_tasks where document_id=$1 and lane in ('ocr','structured_parse','none')",
    [lostDoc],
  );
  assert.equal(ingestTasks.rows[0].n, 1, `exactly one ingest task, saw ${ingestTasks.rows[0].n}`);
  console.log(`[leg 5] PASS — replayed finalize (${replay.status}) left one document and one ingest task`);

  // =========================================================================
  // LEG 6 — H-53: A NON-CODING KIND KEEPS CUSTODY AND LEAVES THE CODING LANE.
  // =========================================================================
  const consent = await upload(jwt, pdfBytes("leg6-consent"), "signed-consent.pdf", "application/pdf");
  assert.equal(consent.refusedAt, null);
  const consentDoc = consent.receipt.document_id;
  await rig.rootQuery("update clara.documents set document_kind='consent_evidence' where id=$1", [consentDoc]);

  // THROUGH THE HUMAN LANE, not root: `record_client_resolution` reads its actor from
  // the JWT claim, so a rootQuery has "no authenticated actor" by construction.
  const resolution = await rig.humanQuery(
    owner,
    `select clara.record_client_resolution(p_client => $1, p_subject_kind => 'document', p_subject => $2,
       p_confidence => 1.0, p_method => 'human', p_evidence => '{"source":"p633-e2e"}'::jsonb, p_op_key => $3) as out`,
    [client, consentDoc, `p633-e2e-res-${randomUUID()}`],
  );
  const resolutionId = resolution.rows[0].out?.resolution_id ?? resolution.rows[0].out;
  await rig.humanQuery(
    owner,
    "select clara.file_document(p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4)",
    [consentDoc, client, resolutionId, `p633-e2e-file-${randomUUID()}`],
  );

  const custody = await rig.rootQuery("select bytes_verified_at, storage_path from clara.documents where id=$1", [consentDoc]);
  assert.ok(custody.rows[0].bytes_verified_at, "custody survives a non-coding kind");
  assert.ok(custody.rows[0].storage_path, "and the stored object is still behind it");

  const uncoded = await rig.rootQuery("select x from clara.list_uncoded_filings($1) x", [client]);
  const uncodedIds = uncoded.rows.map((r) => r.x.document_id ?? r.x.id);
  assert.equal(uncodedIds.includes(consentDoc), false, "consent evidence never waits for a posting decision it can never get");
  console.log("[leg 6] PASS — H-53 on the intake route: custody kept, coding lane not entered");

  // =========================================================================
  // LEG 7 — C-37: A REAL OFX AND A REAL XLSX, AND THE LEVELS A SURFACE MAY CLAIM.
  // =========================================================================
  //
  // THE RATIONALE IS `intake-lanes.mjs:45-51`, NOT "there is no OFX reader": there IS
  // one (`statement-parse.mjs:268-276`, a full 1.x SGML / 2.x XML tag reader). An OFX is
  // store-only AT INTAKE because it is read by the DB-routed `statement_parse` task, not
  // by this trip — so an OFX never classified as a bank statement produces no extraction.
  const ofx = await upload(jwt, OFX_BYTES, "march-statement.ofx", "application/x-ofx");
  assert.equal(ofx.refusedAt, null, `a real OFX must be admitted — refused at ${ofx.refusedAt}`);
  assert.ok(ofx.receipt.document_id, "and adopted into custody");

  // FIX ROUND 1 (633-ADV-2): the XLSX arm is now ASSERTED, not merely printed. The old
  // stub was quarantined on every run while this line said "admitted".
  const xlsx = xlsxBytes();
  const xlsxResult = await upload(
    jwt, xlsx, "trial-balance.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.equal(xlsxResult.refusedAt, null, `a REAL xlsx must be admitted — refused at ${xlsxResult.refusedAt} (status ${xlsxResult.status})`);
  assert.ok(xlsxResult.receipt.document_id, "and adopted into custody, with a document id on the receipt");
  const xlsxIntake = await rig.rootQuery(
    "select status, failure_code, document_id from clara.document_intakes where id=$1", [xlsxResult.intakeId],
  );
  assert.notEqual(xlsxIntake.rows[0].status, "failed", `the intake row must not be a failure — saw ${xlsxIntake.rows[0].status}/${xlsxIntake.rows[0].failure_code}`);
  assert.equal(xlsxIntake.rows[0].failure_code, null, "and it carries no quarantine code");
  assert.ok(xlsxIntake.rows[0].document_id, "and the intake really bound a document");
  console.log(`[leg 7] xlsx bytes: ${xlsx.length} (${xlsx.subarray(0, 4).toString("hex")}), intake status: ${xlsxIntake.rows[0].status}`);

  const ofxTask = await rig.rootQuery(
    "select lane from clara.document_processing_tasks where document_id=$1 order by created_at asc limit 1",
    [ofx.receipt.document_id],
  );
  assert.equal(
    ofxTask.rows[0].lane, "none",
    `an OFX is store-only at intake (intake-lanes.mjs:45-51) — saw lane ${ofxTask.rows[0].lane}`,
  );

  const published = await rig.rootQuery(
    "select format, document_kind, custody, byte_extraction, typed_facts, business_operation from clara.document_capabilities where (format='ofx' and document_kind='bank_statement') or (format='xlsx' and document_kind='management_account') order by format",
  );
  assert.equal(published.rowCount, 2, "both pairs are published");
  const ofxRow = published.rows.find((r) => r.format === "ofx");
  assert.equal(ofxRow.custody, "supported", "an OFX is held");
  assert.equal(ofxRow.byte_extraction, "stored_only", "and deliberately not read at intake");
  const xlsxRow = published.rows.find((r) => r.format === "xlsx");
  assert.equal(xlsxRow.custody, "supported");
  console.log(`[leg 7] PASS — OFX lane=none and published levels: ofx(${ofxRow.byte_extraction}/${ofxRow.typed_facts}) xlsx(${xlsxRow.byte_extraction}/${xlsxRow.typed_facts})`);

  void firm;
  await writeFile(join(scratch, "done"), "ok");
  console.log("INTAKE ADMISSION E2E: PASS (7 legs — no human gate, no kind from a failed read, duplicates converge, mixed batch independent, replayed finalize idempotent, H-53 custody, C-37 OFX/XLSX)");
  process.exit(0);
}

main().catch((err) => {
  console.error("INTAKE ADMISSION E2E: FAIL", err?.stack ?? err);
  process.exit(1);
});
