// 裁-18b PR-1 — shared fixtures and door wrappers for the Clara binding-PROPOSAL battery.
// NOT a test file (the name does not end in `.test.mjs`, so `node --test` ignores it) — it is a
// module binding-proposal-pr-1.test.mjs imports.
//
// Everything vendor-binding-shaped is REUSED from x36-vendor-binding-helpers.mjs (the same
// seedPassingWindow / seedVendorCounterparty / seedF123Evidence / seedApprovedEntry the human
// ceremony battery has driven since 0028) rather than re-seeded here: two fixtures for one
// window would let this battery pass against a shape the real derivation never sees.

import { randomUUID } from "node:crypto";
import { rootQuery, humanQuery, wakeQuery, roleQuery, namedCall, opk, ROLES } from "./rig-helpers.mjs";

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

import { seedVendorCounterparty, seedBareDocument, seedF123Evidence, seedApprovedEntry }
  from "./x36-vendor-binding-helpers.mjs";

/** A window with an arbitrary date list and invoice id — the near-miss builder. Returns the
 *  counterparty fixture. THROWS on construction failure (never a silent partial fixture). */
export async function seedWindow(w, tag, { dates, invoiceId = null, client = null } = {}) {
  const cl = client ?? w.clients.A1;
  const cp = await seedVendorCounterparty(w.firms.A, cl, tag);
  const iv = invoiceId ?? `EZSEC-IV-${randomUUID().slice(0, 5)}`;
  for (const d of dates) {
    const doc = await seedBareDocument(w.firms.A, `${tag}-${d}-${randomUUID().slice(0, 4)}`);
    await seedF123Evidence(w.firms.A, doc.id, cp, iv);
    await seedApprovedEntry(w.firms.A, cl, cp.id, doc, { postingDate: d });
  }
  return cp;
}

export const DATES_OK = ["2025-08-25", "2025-08-29", "2025-10-13"];

/** A vendor counterparty carrying NO registration at all — the derivation's
 *  `binding_unattributable` rung. Built that way at INSERT rather than by blanking the column
 *  later: clara._tf_counterparty_update_0011 is a positive column whitelist and refuses
 *  ('illegal counterparty mutation', CLR08) any UPDATE outside name/terms/merge. Vendors are
 *  explicitly out of scope for the name-only guard, so a registration-free vendor is lawful. */
export async function seedVendorNoRegistration(firm, client, tag) {
  const name = `NOREG VENDOR ${tag} ${randomUUID().slice(0, 6)}`;
  const norm = name.toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
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
