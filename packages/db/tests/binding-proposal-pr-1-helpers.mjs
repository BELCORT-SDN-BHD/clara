// 裁-18b PR-1 — shared fixtures and door wrappers for the Clara binding-PROPOSAL battery.
// NOT a test file (the name does not end in `.test.mjs`, so `node --test` ignores it) — it is a
// module binding-proposal-pr-1.test.mjs imports.
//
// Everything vendor-binding-shaped is REUSED from x36-vendor-binding-helpers.mjs (the same
// seedPassingWindow / seedVendorCounterparty / seedF123Evidence / seedApprovedEntry the human
// ceremony battery has driven since 0028) rather than re-seeded here: two fixtures for one
// window would let this battery pass against a shape the real derivation never sees.

import { randomUUID } from "node:crypto";
import { rootQuery, humanQuery, wakeQuery, roleQuery, namedCall, opk, ROLES, getPool } from "./rig-helpers.mjs";

// ---------------------------------------------------------------------------
// TWO-SESSION MACHINERY — the lock-order cells (H6 / M-9 / C-1).
// ---------------------------------------------------------------------------
// db-tests.md: two dedicated clients, and PROVE the interleave with pg_blocking_pids, never a
// sleep — a sleep proves nothing about whether the block actually happened. Copied locally
// rather than cross-imported from p4t1/p4t2's own local copies, exactly as those two did.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitBlockedByOrThrow(pid, blockerPid, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [pid]);
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) return true;
    await sleep(25);
  }
  throw new Error(
    `waitBlockedByOrThrow: backend ${pid} never observably blocked on blocker ${blockerPid} within ${timeoutMs}ms`);
}

/** Two dedicated pooled clients, released cleanly whatever happens. `rollback` -> `reset role`
 *  -> `reset all` on each, in that order: RESET ALL does NOT reset the role, and a SET ROLEd
 *  connection returned to the pool poisons the next rootQuery (db-tests.md). */
export async function twoSessions(fn) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  try {
    return await fn(c1, c2);
  } finally {
    for (const c of [c1, c2]) {
      try { await c.query("rollback"); } catch { /* not in a txn */ }
      try { await c.query("reset role"); } catch { /* already reset */ }
      try { await c.query("reset all"); } catch { /* already reset */ }
      c.release();
    }
  }
}

/** Put a pooled client into a human (clara_authenticated + jwt) session and return its backend
 *  pid. `false` on set_config so the claim survives outside an explicit transaction too. */
export async function asHumanSession(client, sub) {
  await client.query("set role clara_authenticated");
  await client.query("select set_config('request.jwt.claims', $1, false)",
    [JSON.stringify({ sub, role: "authenticated" })]);
  return (await client.query("select pg_backend_pid() as pid")).rows[0].pid;
}

/** The same, for a wake executor role carrying a real credential secret. */
export async function asWakeSession(client, role, secret) {
  await client.query(`set role ${role}`);
  await client.query("select set_config('clara.wake_secret', $1, false)", [secret]);
  return (await client.query("select pg_backend_pid() as pid")).rows[0].pid;
}

export const WAKE_ROLE = {
  filing: "clara_wake_filing",
  interactive: "clara_wake_interactive",
  proactive: "clara_wake_proactive",
  bank: "clara_wake_bank",
};

/** Is THIS lane's migration live? Probed by CATALOG (an exact-signature to_regprocedure), never
 *  by a schema_migrations version string: the file is UNNUMBERED on the branch and the conductor
 *  claims its number at merge prep, so a version-name probe would be pinned to a number that
 *  does not exist yet (review law 3 — a name is a projection of the thing, not the thing). */
export async function bp1Live() {
  try {
    const r = await rootQuery(
      `select to_regprocedure('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)') as door,
              to_regprocedure('clara.wake_list_binding_candidates(uuid)') as lister,
              to_regprocedure('clara.decline_vendor_identity_binding(uuid,text,text)') as decline`,
    );
    const row = r.rows[0] ?? {};
    return Boolean(row.door && row.lister && row.decline);
  } catch { return false; }
}

/** FAIL, never skip (the estate's fail0017 discipline): this battery is REQUIRED to go red
 *  against the pre-migration frontier. A drill that only ever skips is a false green. */
export function failBp1(live) {
  if (!live) {
    throw new Error(
      "裁-18b PR-1 NOT applied (clara.wake_propose_vendor_identity_binding / "
      + "wake_list_binding_candidates / decline_vendor_identity_binding do not all resolve at "
      + "their exact signatures) — this battery is REQUIRED to fail against the pre-0150 "
      + "frontier rather than skip (work-order discipline, .claude/rules/db-tests.md).");
  }
}

/** The estate's DETAIL-reason idiom: a STRUCTURED assertion on the typed discriminant, never a
 *  string-match on English prose alone (x36's own reasonOf, MED-3). */
export function reasonOf(err) {
  const m = /"reason"\s*:\s*"([a-z_]+)"/.exec(err?.detail ?? "");
  return m ? m[1] : null;
}

/** mint_wake_credential(p_wake_kind, p_firm, p_on_behalf_of, p_ttl, p_client). */
export async function mintCred({ kind, firm, onBehalfOf = null, ttl = "15 minutes", client = null }) {
  const r = await roleQuery(
    ROLES.runtime,
    "select * from clara.mint_wake_credential(p_wake_kind => $1, p_firm => $2, p_on_behalf_of => $3, p_ttl => $4::interval, p_client => $5)",
    [kind, firm, onBehalfOf, ttl, client],
  );
  const row = r.rows[0] ?? {};
  if (!row.secret) throw new Error(`mintCred(${kind}) returned no secret — fixture construction FAILED`);
  return { credentialId: row.credential_id ?? null, secret: row.secret };
}

export const MODEL = { provider: "anthropic", model: "claude-opus-5", version: "2026-08-29" };

/** Drive clara.wake_propose_vendor_identity_binding through a REAL credential and the REAL
 *  executor role — never as root, never by reading the allowlist (the F-A7b PR-a lesson: an
 *  allowlist read is not an authority proof). */
export async function proposeAsAgent(
  { role, secret },
  { client, counterparty, basis, rationale = "Clara: three approved invoices, one stable fingerprint.",
    model = MODEL, opKey } = {},
) {
  const specs = [
    { name: "p_client" }, { name: "p_counterparty" }, { name: "p_basis", cast: "jsonb" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" },
  ];
  const r = await wakeQuery(role, secret, namedCall("wake_propose_vendor_identity_binding", specs), [
    client, counterparty,
    basis === undefined ? null : JSON.stringify(basis),
    rationale,
    model === undefined ? null : JSON.stringify(model),
    opKey ?? opk("vbagent"),
  ]);
  return r.rows[0].result;
}

export async function listCandidates({ role, secret }, client) {
  const r = await wakeQuery(role, secret,
    "select * from clara.wake_list_binding_candidates(p_client => $1)", [client]);
  return r.rows;
}

export async function declineBinding(sub, { binding, reason = "rig decline", opKey } = {}) {
  const specs = [{ name: "p_binding" }, { name: "p_reason" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("decline_vendor_identity_binding", specs),
    [binding, reason, opKey ?? opk("vbdecline")]);
  return r.rows[0].result;
}

/** clara.reset_binding_decline — the named human door out of a decline (ruling (b)). */
export async function resetDecline(sub, { binding, reason = "rig reset", opKey } = {}) {
  const specs = [{ name: "p_binding" }, { name: "p_reason" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("reset_binding_decline", specs),
    [binding, reason, opKey ?? opk("vbreset")]);
  return r.rows[0].result;
}

// ---------------------------------------------------------------------------
// Basis construction — the citations Clara claims to have read.
// ---------------------------------------------------------------------------

/** The document_regions rows the fingerprint was actually taken from, for the three evidence
 *  documents of a binding-eligible (client, counterparty). Read from the DB's OWN non-hashed
 *  sibling, so the fixture cites what the derivation cited rather than what the test guessed. */
export async function derivedBasis(firm, client, counterparty) {
  const r = await rootQuery("select clara._derive_vendor_binding_basis($1,$2,$3) as b",
    [firm, client, counterparty]);
  return r.rows[0].b;
}

/** A lawful basis: one citation per evidence document, each naming a real region of that
 *  document's CURRENT invoice_facts generation. */
export async function lawfulBasis(firm, client, counterparty) {
  const b = await derivedBasis(firm, client, counterparty);
  const cites = (b.resolved_citations ?? []).filter((c) => c.field_path === "invoice.vendor_name");
  if (cites.length === 0) {
    throw new Error("lawfulBasis: the derived basis carries no vendor_name regions — fixture construction FAILED");
  }
  return { citations: cites.map((c) => ({ region_id: c.region_id })) };
}

/** The evidence documents the derivation itself selected (the resolver's p_documents set). */
export async function evidenceDocuments(firm, client, counterparty) {
  const r = await rootQuery("select clara._derive_vendor_binding_proposal($1,$2,$3) as d",
    [firm, client, counterparty]);
  const ev = r.rows[0].d.evidence ?? [];
  return ev.map((e) => e.document_id);
}

/** A real region of a document that is NOT in the proposal's evidence set — the W6-c fixture.
 *  Built as a full standalone invoice_facts extraction so the region is CURRENT for its own
 *  document (otherwise the cell could pass for the stale-generation reason instead). */
export async function foreignRegion(firm, tag) {
  const sha = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  const doc = (await rootQuery(
    `insert into clara.documents(firm_id,sha256,original_filename,mime_type,byte_size,storage_path,bytes_verified_at,extraction_status,uploaded_by)
     values($1,$2,$3,'application/pdf',2048,$4,now(),'pending',null) returning id`,
    [firm, sha, `${tag}.pdf`, `firms/${firm}/docs/${sha}.pdf`],
  )).rows[0].id;
  const ext = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,envelope)
     values($1,$2,$3,'clara-fixture:v1','invoice_facts',1,'done',1,'{}'::jsonb)`,
    [ext, firm, doc],
  );
  const region = (await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,'invoice.vendor_name',$3,1.0)
     returning id`,
    [firm, ext, `${tag} FOREIGN`],
  )).rows[0].id;
  return { document: doc, extraction: ext, region };
}

/** Supersede an evidence document's invoice_facts generation, so the region the derivation
 *  cited becomes STALE while staying a real row — the W6-d fixture. */
export async function supersedeInvoiceFacts(firm, document) {
  const ext = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,envelope)
     values($1,$2,$3,'clara-fixture:v1','invoice_facts',2,'done',1,'{}'::jsonb)`,
    [ext, firm, document],
  );
  return ext;
}

// ---------------------------------------------------------------------------
// Window fixtures the eligibility cells need (each a DELIBERATE near-miss).
// ---------------------------------------------------------------------------

import { seedBareDocument, seedApprovedEntry, FULL_ABSENT_RECEIPT, deriveEconomics }
  from "./x36-vendor-binding-helpers.mjs";

export {
  postTimeControlLive, withPostTimeControl, signLive, POST_TIME_MARKER,
} from "./x36-vendor-binding-helpers.mjs";

/** A window with an arbitrary date list and invoice id — the near-miss builder. Returns the
 *  counterparty fixture. THROWS on construction failure (never a silent partial fixture). */
const foldAlnum = (s) => s.toLowerCase().replace(/[^a-zA-Z0-9]/g, "");

/** A UNIQUE-FAMILY vendor counterparty. Every fixture vendor gets its OWN leading token,
 *  because clara.name_family_is_ambiguous counts every client and counterparty of the firm
 *  sharing clara.name_family_token(name) — and x36's shared builder names them all
 *  "EZACCOUNT SECRETARY …", so the SECOND one makes a family and W15 rightly refuses both.
 *  A shared fixture that trips a real wall is a fixture defect, not a wall defect. */
export async function seedUniqueFamilyVendor(firm, client, tag, { registration = null, tin = null } = {}) {
  const lead = `VND${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const name = `${lead} SUPPLIES SDN BHD`;
  const reg = registration ?? `2019${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  // `tin` is set AT INSERT, never by a later UPDATE: clara._tf_counterparty_update_0011 is a
  // positive column whitelist admitting only name/terms/merge, so `update … set tin=…` is refused
  // CLR08 'illegal counterparty mutation'. Measured on the rig, not reasoned about.
  const r = await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,registration_no,registration_normalized,tin,created_by)
     values($1,$2,'vendor',$3,$5,$4,$6,$7,
       (select user_id from clara.firm_memberships where firm_id=$1 and status='active' limit 1))
     returning id`,
    [firm, client, name, reg, foldAlnum(name), foldAlnum(reg), tin],
  );
  return { id: r.rows[0].id, name, nameNorm: foldAlnum(name), reg, regNorm: foldAlnum(reg), tin, lead };
}

/**
 * Age every departure the WORLD ARRIVED WITH out of the 90-day roster window (H5).
 *
 * WHY THIS IS A FIXTURE CORRECTION AND NOT A WALL RELAXATION. buildWorld's legacy-onboarding
 * bridge (rig-fixtures.mjs:106-111) mints a TEMPORARY admin, uses it as the distinct checker for
 * commit_client_onboarding, and removes it again — once per client. So every firm this rig builds
 * arrives carrying one or two admin+ memberships that ended seconds ago, and
 * clara.eligible_binding_signer_count rightly counts them: a firm that had a second admin last
 * month is a firm that can have one again. That is the wall working, and in production it is the
 * fail-closed direction. But it means NO firm in a freshly built world is solo, and 裁-32's solo
 * arm would then be untestable — a fixture that cannot reach the case is not evidence about it.
 *
 * So the machinery's own departures are pushed past the window, and nothing else is touched: the
 * roster moves each CELL makes are all inside it, which is exactly what those cells measure.
 */
export async function ageOutPriorDepartures(firm) {
  const r = await rootQuery(
    `update clara.firm_memberships
        set removed_at = removed_at - interval '200 days'
      where firm_id = $1 and status = 'removed' and removed_at is not null
        and removed_at > now() - interval '90 days'
      returning id`,
    [firm]);
  return r.rowCount;
}

/** x36's seedF123Evidence, re-cut with the three knobs this battery's new walls need — a
 *  backdated extracted_at, a printed invoice.vendor_registration region, and a per-document
 *  invoice id. The F1/F2/F3 shapes are otherwise what the shared builder emits. */
async function seedEvidence(firm, document, cp, invoiceId,
  { extractedAt, printedRegistration, economics = null, extraRegistrations = [] }) {
  const factsExt = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,envelope,extracted_at)
     values($1,$2,$3,'clara-fixture:v1','invoice_facts',1,'done',1,$4::jsonb,$5::timestamptz)`,
    [factsExt, firm, document, JSON.stringify({ vendor_identity: FULL_ABSENT_RECEIPT }), extractedAt],
  );
  const region = (path, text, cents = null) => rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,monetary_cents,engine_confidence)
     values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,$3,$4,$5,1.0)`,
    [firm, factsExt, path, text, cents]);
  await region("invoice.vendor_name", cp.name);
  await region("invoice.invoice_id", invoiceId);
  // W18's hard identifier. undefined ⇒ print the vendor's own registration (the lawful case);
  // null ⇒ print none (which now REFUSES — the human-resolution arm was struck by the fold
  // round, C1/N-1); a string ⇒ a MISMATCH.
  const printed = printedRegistration === undefined ? cp.reg : printedRegistration;
  if (printed !== null) await region("invoice.vendor_registration", printed);
  // ...and any ADDITIONAL registration regions the cell wants on the same document. The wall now
  // judges EVERY current-generation region rather than min(text_content), so the order these are
  // written in must not matter — the H-4 cells drive both sort orders through this one knob.
  for (const extra of extraRegistrations) await region("invoice.vendor_registration", extra);
  // C2's economic facts. A SHARED `economics` object across a window's three documents is
  // exactly "one invoice, three scans" — the A2d attack.
  const econ = economics ?? deriveEconomics(invoiceId);
  await region("invoice.invoice_date", econ.date);
  await region("invoice.currency", econ.currency);
  await region("invoice.total", econ.total, econ.totalCents);

  const ocrExt = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,envelope,extracted_at)
     values($1,$2,$3,'clara-fixture:v1','ocr',1,'done',1,$4::jsonb,$5::timestamptz)`,
    [ocrExt, firm, document, JSON.stringify({ pages: [{ page_number: 1, height: 11 }] }), extractedAt],
  );
  await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     values($1,$2,'page_polygon',$3::jsonb,'pages.1.lines.0',$4,1.0)`,
    [firm, ocrExt, JSON.stringify({ page_number: 1, polygon: [1, 0.5, 2, 0.5, 2, 0.9, 1, 0.9] }),
      `${cp.name} (${cp.reg})`],
  );
}

/** The window builder this battery owns. Self-contained rather than a call into x36's
 *  seedF123Evidence, because every wall the 2026-08-29 adversarial pass added needs a knob the
 *  shared builder has no way to express. Each option below exists to build a DELIBERATE
 *  near-miss for one named wall — there are no decorative parameters here. */
export async function seedWindow(w, tag, {
  dates,
  invoicePrefix = null,
  invoiceId = null,          // force ONE printed id across all three → W16's invoice_id arm
  client = null,
  reuseDocument = false,     // one document, three entries → W16's document/sha arm
  printedRegistration,       // undefined = the vendor's own; null = none; text = a MISMATCH
  extraRegistrations = [],   // additional vendor_registration regions per document (H-4)
  approvedSpanDays = null,   // null = mirror the posting dates (a real elapsed span)
  sharedEconomics = false,   // ONE invoice's economics on all three documents → C2's A2d attack
  invoiceIdsPerDoc = null,   // explicit printed id per document (three ALTERED ids, A2d)
  duplicateOverrideOn = [],  // 0-based indexes whose ENTRY carries flags.duplicate_override (M-12)
  vendor = null,
} = {}) {
  const cl = client ?? w.clients.A1;
  const cp = vendor ?? await seedUniqueFamilyVendor(w.firms.A, cl, tag);
  const prefix = invoicePrefix ?? `${cp.lead ?? "EZSEC"}-IV-`;
  // ONE invoice's economics, shared: distinct documents, distinct bytes, even distinct PRINTED
  // ids — and still one invoice. Seeded from the tag so it is stable within a call and differs
  // between calls.
  const shared0 = sharedEconomics ? deriveEconomics(`${tag}-one-invoice`) : null;
  let shared = null;
  let i = 0;
  for (const d of dates) {
    const doc = reuseDocument
      ? (shared ??= await seedBareDocument(w.firms.A, `${tag}-shared`))
      : await seedBareDocument(w.firms.A, `${tag}-${d}-${randomUUID().slice(0, 4)}`);
    const iv = invoiceIdsPerDoc ? invoiceIdsPerDoc[i] : (invoiceId ?? `${prefix}${9001 + i}`);
    // approved_at defaults to the posting date, so the TRUSTED span mirrors the booked one.
    const approvedAt = approvedSpanDays === null
      ? `${d}T09:00:00Z`
      : new Date(Date.parse(`${dates[0]}T09:00:00Z`)
          + (i === 0 ? 0 : approvedSpanDays) * 86400000).toISOString();
    // Extracted BEFORE approval, or the frozen derivation refuses `evidence_restated` first and
    // the cell would be measuring that rung instead of the one under test.
    const extractedAt = new Date(Date.parse(approvedAt) - 86400000).toISOString();
    if (!reuseDocument || i === 0) {
      await seedEvidence(w.firms.A, doc.id, cp, iv, {
        extractedAt, printedRegistration, extraRegistrations,
        economics: shared0 ?? null,
      });
    }
    await seedApprovedEntry(w.firms.A, cl, cp.id, doc, {
      postingDate: d,
      approvedAt,
      flags: duplicateOverrideOn.includes(i)
        ? { duplicate_override: { reason: "rig: human waved the duplicate guard", actor: null, at: approvedAt } }
        : null,
    });
    i += 1;
  }
  return cp;
}

/** Add a registration region to an evidence document's CURRENT invoice_facts generation, AFTER
 *  the proposal exists. Deliberately not a new generation: a v2 extraction moves
 *  facts_extraction_id, which is inside the frozen derivation's content_hash, so the signer would
 *  refuse `proposal_drifted` and the cell would be measuring drift instead of the identity wall.
 *  Adding a region to the SAME generation changes exactly one fact — what the page claims to be. */
export async function plantRegistrationRegion(firm, document, text) {
  const r = await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     select $1, x.id, 'page_polygon', '{"page":1,"polygon":[0,0,1,1]}'::jsonb,
            'invoice.vendor_registration', $3, 1.0
       from clara.document_extractions x
      where x.document_id=$2 and x.engine_kind='invoice_facts' and x.status='done'
      order by x.version_n desc, x.id desc limit 1
     returning id`,
    [firm, document, text]);
  if (r.rowCount === 0) {
    throw new Error("plantRegistrationRegion: no current invoice_facts generation — fixture construction FAILED");
  }
  return r.rows[0].id;
}

export const DATES_OK = ["2025-08-25", "2025-08-29", "2025-10-13"];

/** A vendor counterparty carrying NO registration at all — the derivation's
 *  `binding_unattributable` rung. Built that way at INSERT rather than by blanking the column
 *  later: clara._tf_counterparty_update_0011 is a positive column whitelist and refuses
 *  ('illegal counterparty mutation', CLR08) any UPDATE outside name/terms/merge. Vendors are
 *  explicitly out of scope for the name-only guard, so a registration-free vendor is lawful. */
export async function seedVendorNoRegistration(firm, client, tag) {
  const name = `NOREG VENDOR ${tag} ${randomUUID().slice(0, 6)}`;
  const norm = foldAlnum(name);
  const r = await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
     values($1,$2,'vendor',$3,$4,
       (select user_id from clara.firm_memberships where firm_id=$1 and status='active' limit 1))
     returning id`,
    [firm, client, name, norm]);
  return { id: r.rows[0].id, name, nameNorm: norm, reg: null, regNorm: null };
}

/** RETIRE a counterparty the only way the substrate allows: a merge. The update whitelist in
 *  clara._tf_counterparty_update_0011's merge branch is exactly {merged_into, retired_at,
 *  updated_at}, so this is the lawful shape — a hand-set `retired_at` alone is refused. */
export async function mergeAway(loser, winner) {
  await rootQuery(
    "update clara.counterparties set merged_into=$2, retired_at=now() where id=$1", [loser, winner]);
}

/** Supersede a document's invoice_facts generation WITH a full region set of its own, stamped
 *  EXTRACTED LONG AGO. Both halves are load-bearing:
 *   - copying the regions keeps the derivation passing (a bare v2 with no regions makes F1 null
 *     and the ladder refuses `binding_unattributable` before the basis is ever resolved);
 *   - the old extracted_at keeps `facts_restated` FALSE (the derivation compares
 *     extracted_at > approved_at and refuses `evidence_restated` otherwise).
 *  What is left is exactly one changed fact: the cited v1 region is no longer CURRENT. */
export async function supersedeInvoiceFactsKeepingRegions(firm, document) {
  const ext = randomUUID();
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,envelope,extracted_at)
     select $1,$2,$3,'clara-fixture:v2','invoice_facts',2,'done',1,x.envelope,timestamptz '2000-01-01'
       from clara.document_extractions x
      where x.document_id=$3 and x.engine_kind='invoice_facts' and x.status='done'
      order by x.version_n desc, x.id desc limit 1`,
    [ext, firm, document]);
  const copied = await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     select r.firm_id,$1,r.locator_kind,r.locator,r.field_path,r.text_content,r.engine_confidence
       from clara.document_regions r
       join clara.document_extractions x on x.id=r.extraction_id
      where x.document_id=$2 and x.engine_kind='invoice_facts' and x.version_n=1
     returning id`,
    [ext, document]);
  if (copied.rowCount === 0) {
    throw new Error("supersedeInvoiceFactsKeepingRegions: copied no regions — fixture construction FAILED");
  }
  return ext;
}

// ---------------------------------------------------------------------------
// THE MUTANT HARNESS — the non-vacuity proof for every wall.
// ---------------------------------------------------------------------------
// A cell that shows "the door refuses X" proves nothing on its own: it could be refusing X for
// some OTHER reason, or the fixture could be malformed in a way that would refuse anything. The
// discriminating question is "does this cell go GREEN when — and only when — this specific wall
// is removed?" So each mutant DELETES exactly one wall from the LIVE body, re-runs the probe,
// asserts the probe now SUCCEEDS, and restores the original byte-for-byte.
//
// Three disciplines make this honest rather than theatre:
//   1. The replacement must actually CHANGE the text. A no-op edit would leave the wall standing
//      and the "mutant" cell would then prove the opposite of what it claims — so a replacement
//      that matches nothing THROWS.
//   2. The mutant is COMMITTED, not held in an uncommitted transaction: the probe runs on a
//      different pooled connection (wakeQuery opens its own txn) and would never see an
//      uncommitted body.
//   3. The restore is verified by prosrc sha256 against the pre-image, in a finally block, so a
//      failing probe can never leave a weakened door behind for the rest of the suite.

async function prosrcSha(sig) {
  const r = await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p where p.oid = $1::regprocedure",
    [sig]);
  return r.rows[0]?.sha ?? null;
}

/**
 * Run `fn()` against a mutated copy of `sig`'s body, with exactly one wall removed.
 * @param {string} sig  exact signature, e.g. "clara._propose_vendor_binding_agent_core(...)"
 * @param {Array<[string,string]>} edits  [needle, replacement] pairs applied to pg_get_functiondef
 */
export async function withMutant(sig, edits, fn) {
  const original = (await rootQuery(
    "select pg_get_functiondef($1::regprocedure) as def", [sig])).rows[0].def;
  const before = await prosrcSha(sig);
  let mutated = original;
  for (const [needle, replacement] of edits) {
    if (!mutated.includes(needle)) {
      throw new Error(
        `withMutant(${sig}): the needle is ABSENT from the live body, so this "mutant" would be a `
        + `no-op and the cell would prove the opposite of what it claims. Needle: ${needle.slice(0, 120)}`);
    }
    mutated = mutated.replace(needle, replacement);
  }
  if (mutated === original) throw new Error(`withMutant(${sig}): the edits changed nothing`);
  await rootQuery(`set role ${ROLES.fnOwner}; ${mutated}`);
  const after = await prosrcSha(sig);
  if (after === before) throw new Error(`withMutant(${sig}): the body did not actually change`);
  // No `finally` here, deliberately (eslint no-unsafe-finally, and the reason behind that rule):
  // the restore must run whatever happens, but a throw from inside a finally block SWALLOWS the
  // probe's own error, which is the one a reader needs. Capture, restore, then decide — and a
  // failed RESTORE outranks a failed probe, because it leaves every later cell untrustworthy.
  let out; let probeError = null;
  try { out = await fn(); } catch (e) { probeError = e; }
  await rootQuery(`set role ${ROLES.fnOwner}; ${original}`);
  const restored = await prosrcSha(sig);
  if (restored !== before) {
    throw new Error(
      `withMutant(${sig}): RESTORE FAILED — the door is still weakened (sha ${restored} != ${before}). `
      + `Every later cell in this suite is now untrustworthy.`
      + (probeError ? ` The probe had also failed: ${probeError.message}` : ""));
  }
  if (probeError) throw probeError;
  return out;
}

/** Drop a constraint or index, run `fn()`, then put it back and verify it is back. */
export async function withoutConstraint({ table = null, constraint = null, index = null, ddl }, fn) {
  if (index) await rootQuery(`drop index clara.${index}`);
  else await rootQuery(`alter table clara.${table} drop constraint ${constraint}`);
  // Same shape as withMutant, and for the same reason (no-unsafe-finally).
  let out; let probeError = null;
  try { out = await fn(); } catch (e) { probeError = e; }
  await rootQuery(ddl);
  const back = index
    ? (await rootQuery("select to_regclass($1) as r", [`clara.${index}`])).rows[0].r
    : (await rootQuery(
        "select conname as r from pg_constraint where conrelid = $1::regclass and conname = $2",
        [`clara.${table}`, constraint])).rows[0]?.r;
  if (!back) {
    throw new Error(`withoutConstraint: RESTORE FAILED for ${index ?? constraint}`
      + (probeError ? ` — the probe had also failed: ${probeError.message}` : ""));
  }
  if (probeError) throw probeError;
  return out;
}
