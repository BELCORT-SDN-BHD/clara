// Wave-A2 rig — the two-extraction attribution model + the #3 write-gate (contract
// §3.1 + probes P2/P11). CONTRACT-BLIND: from contract v1.0 §3.1 + the as-built
// record_rule_resolution matcher (0011 AB-3 CTE) + persist_document_extraction
// (0007) — NEVER 0015 source. The two invariants under test:
//
//   P2 (two-extraction / inversion): the IDENTITY pass (engine_kind='structured_parse')
//      attributes ONLY from the supplier identity (field_path matching %tin%/%ssm% on
//      the allowlist). The BUYER identifier NEVER attributes (its field_path avoids
//      the matcher patterns). The FACTS pass (engine_kind='invoice_facts'/'local_facts')
//      is STRUCTURALLY invisible to attribution — even a supplier-shaped field there
//      never attributes.
//   P11 (#3 write-gate): persist_document_extraction, for a structured_parse task,
//      REFUSES any region whose field_path matches %tin%/%ssm%/%account% but is NOT on
//      the attribution allowlist (myinvois.supplier_tin, myinvois.supplier_brn). The
//      two allowed supplier keys persist; a non-matching name (buyer_id_primary)
//      persists; the OCR lane stays UNGATED (the gate is structured_parse-only).
//
// Attribution is read off clara.client_resolutions (method='rule'), mirroring
// rig-docs-attribution.test.mjs. Skips (loudly, counted) until 0015 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, opk,
  seedVerifiedDocument, seedExtraction, seedRegion, addClientIdentifier, recordRuleResolution, claimTask,
} from "./wave-a-fixtures.mjs";

let ready = false;
let has15 = false;
let world = null;

async function has0015Lane() {
  const r = await rootQuery(
    `select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='document_processing_tasks' and c.contype='c'
        and pg_get_constraintdef(c.oid) ilike '%local_facts%' limit 1`,
  );
  return r.rows.length > 0;
}
function skip15(t) {
  if (!has15) { markSkip(); t.skip("Wave-A2 not present — 0015 lane surface absent"); return true; }
  return false;
}

/** Count of method='rule' client_resolutions for a firm (attribution readback). */
async function ruleResolutionCount(firm) {
  const r = await rootQuery("select count(*)::int as n from clara.client_resolutions where firm_id=$1 and method='rule'", [firm]);
  return r.rows[0].n;
}
async function latestRuleResolutionClient(firm) {
  const r = await rootQuery("select client_id from clara.client_resolutions where firm_id=$1 and method='rule' order by created_at desc limit 1", [firm]);
  return r.rows[0]?.client_id ?? null;
}

/** Attribution probe: seed a done extraction of `engineKind` carrying one identity
 *  region (field_path, text), then run record_rule_resolution. Returns whether a
 *  NEW method='rule' resolution appeared + its client. */
async function attributeVia({ firm, engineKind, engineId, fieldPath, text }) {
  const { documentId } = await seedVerifiedDocument({ firm });
  const extraction = await seedExtraction({ firm, document: documentId, engineId, engineKind, status: "done" });
  await seedRegion({ firm, extraction, locatorKind: "page_polygon", fieldPath, textContent: text, engineConfidence: 0.99 });
  const before = await ruleResolutionCount(firm);
  try { await recordRuleResolution({ document: documentId }); }
  catch (e) { noteLane(`record_rule_resolution(${fieldPath}, ${engineKind}) raised ${e.code}: ${e.message}`); }
  const after = await ruleResolutionCount(firm);
  return { attributed: after > before, client: after > before ? await latestRuleResolutionClient(firm) : null };
}

// ---------------------------------------------------------------------------
// #3 write-gate helpers — a running structured_parse/ocr task + direct persist.
// ---------------------------------------------------------------------------

async function insertQueuedTask({ firm, document, lane, engineId }) {
  const r = await rootQuery(
    `insert into clara.document_processing_tasks (firm_id,document_id,engine_id,engine_config,version_n,lane,status)
     values ($1,$2,$3,'{}'::jsonb,1,$4,'queued') returning id`,
    [firm, document, engineId, lane],
  );
  return r.rows[0].id;
}
/** Raw-insert a queued task and claim it to running (local lanes need no consent;
 *  ocr needs egressApproved). Returns the running task id, or null (noted). */
async function makeRunningTask({ firm, lane, engineId }) {
  const { documentId } = await seedVerifiedDocument({ firm });
  const task = await insertQueuedTask({ firm, document: documentId, lane, engineId });
  await claimTask(task, { egressApproved: true }).catch((e) => noteLane(`claim ${lane} task raised ${e.code}`));
  const st = (await rootQuery("select status from clara.document_processing_tasks where id=$1", [task])).rows[0]?.status;
  if (st !== "running") { noteLane(`${lane} task did not reach running (status=${st}) — write-gate cell skipped`); return null; }
  return task;
}
function region(fieldPath, text = "X") {
  return { locator_kind: "page_polygon", locator: { page: 1, polygon: [] }, field_path: fieldPath, text_content: text, engine_confidence: 0.9, monetary_raw: null, monetary_cents: null };
}
async function persistExtraction(task, regions) {
  const r = await roleQuery(
    ROLES.runtime,
    `select clara.persist_document_extraction(p_task=>$1, p_status=>$2, p_page_count=>$3,
       p_envelope=>$4::jsonb, p_regions=>$5::jsonb, p_error_code=>$6, p_vendor_op_ref=>$7, p_op_key=>$8) as r`,
    [task, "done", 1, "{}", JSON.stringify(regions), null, null, opk("persist")],
  );
  return r.rows[0].r;
}

before(async () => {
  ready = await waveAEnsureReady();
  has15 = ready && (await has0015Lane());
  if (has15) world = await buildWorld();
  else noteLane(ready ? "0015 absent — attribution/write-gate suite skipped" : "0011 surface absent");
});
after(async () => { printLaneNotes("wave-a2-attribution"); printSkipCount("wave-a2-attribution"); await endPool(); });

// ===========================================================================
// P2 — the two-extraction / inversion model.
// ===========================================================================

test("P2 the supplier identity (structured_parse, myinvois.supplier_tin) ATTRIBUTES the client", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const tin = `C${randomUUID().slice(0, 10)}`;
  await addClientIdentifier(users.alice, { client: clients.A1, kind: "tin", value: tin });
  const r = await attributeVia({ firm, engineKind: "structured_parse", engineId: "clara-myinvois:v1", fieldPath: "myinvois.supplier_tin", text: tin });
  assert.ok(r.attributed, "the supplier TIN on the identity pass attributes a client");
  assert.equal(r.client, clients.A1, "attribution resolves to the client whose identifier matches the supplier TIN");
});

test("P2 the supplier BRN (structured_parse, myinvois.supplier_brn) ATTRIBUTES a client whose kind='ssm' identifier matches (the AB-3 ssm arm extends to %brn%)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const brn = `20250${randomUUID().slice(0, 8).replace(/\D/g, "0")}`;
  // A BRN-only client (e.g. RPR = SSM 202501005621, no TIN) registers its SSM/BRN.
  await addClientIdentifier(users.alice, { client: clients.A1, kind: "ssm", value: brn });
  const r = await attributeVia({ firm, engineKind: "structured_parse", engineId: "clara-myinvois:v1", fieldPath: "myinvois.supplier_brn", text: brn });
  assert.ok(r.attributed, "the supplier BRN attributes — the record_rule_resolution ssm arm matches field_path %brn% for a kind='ssm' identifier");
  assert.equal(r.client, clients.A1, "BRN attribution resolves to the client whose ssm identifier matches the supplier BRN");
});

test("P2 (inversion) the BUYER identifier NEVER attributes — even carrying a real client TIN (field_path avoids the matcher patterns)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const tin = `C${randomUUID().slice(0, 10)}`;
  await addClientIdentifier(users.alice, { client: clients.A2, kind: "tin", value: tin });
  // The SAME (real, unique) client TIN, but presented under a BUYER field_path.
  const r = await attributeVia({ firm, engineKind: "structured_parse", engineId: "clara-myinvois:v1", fieldPath: "myinvois.buyer_id_primary", text: tin });
  assert.equal(r.attributed, false, "the buyer's TIN never attributes a client — a purchase e-invoice's buyer can never be mistaken for the supplier/client");
});

test("P2 the FACTS pass is STRUCTURALLY invisible to attribution — a supplier-shaped field on engine_kind='invoice_facts' never attributes", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const tin = `C${randomUUID().slice(0, 10)}`;
  await addClientIdentifier(users.alice, { client: clients.A1, kind: "tin", value: tin });
  // engine_kind='invoice_facts' sits OUTSIDE the matcher's ('ocr','structured_parse') predicate.
  const r = await attributeVia({ firm, engineKind: "invoice_facts", engineId: "clara-myinvois:v1", fieldPath: "myinvois.supplier_tin", text: tin });
  assert.equal(r.attributed, false, "the facts pass (invoice_facts) never attributes — it is invisible to the AB-3 identifier CTE by engine_kind");
});

test("P2 invoice.customer_taxid is deliberately named to avoid the %tin% pattern (naming is load-bearing)", async (t) => {
  if (skip15(t)) return;
  const fp = "invoice.customer_taxid";
  assert.ok(!/tin/.test(fp.toLowerCase()), "'invoice.customer_taxid' does NOT contain 'tin' — it can never match the %tin% attribution pattern even on an ocr/structured_parse extraction");
});

// ===========================================================================
// P11 — the #3 write-gate on persist_document_extraction (structured_parse only).
// ===========================================================================

test("P11 the two allowed supplier keys persist on a structured_parse task", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  for (const fp of ["myinvois.supplier_tin", "myinvois.supplier_brn"]) {
    const task = await makeRunningTask({ firm, lane: "structured_parse", engineId: "clara-structured:v1" });
    if (!task) continue;
    await assert.doesNotReject(() => persistExtraction(task, [region(fp, `C${randomUUID().slice(0, 8)}`)]), `the allowlisted supplier key ${fp} persists`);
  }
});

test("P11 a %tin%/%ssm%/%account%-matching field_path OFF the allowlist REFUSES at persist (the #3 gate)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  // Matches a matcher pattern, is NOT myinvois.supplier_tin/supplier_brn, and is CANONICAL —
  // so the only wall that can be refusing it is the #3 attribution gate.
  //
  // WHY THE CANONICALITY MATTERS (ticket 624 / C33.4): 0191 added an EARLIER wall at this same
  // boundary — clara._assert_field_path, which refuses a path whose first segment is not a
  // registered namespace. The two older rogues this cell carried, `rogue.company_ssm` and
  // `vendor.bank_account`, are now caught by THAT wall and never reach the attribution gate at
  // all. Both still raise CLR10, so leaving them here would have kept the cell green while it
  // quietly stopped testing its own subject. They move to their own assertion below, which
  // names the wall that catches them, and the #3 gate keeps a rogue it can actually refuse.
  const task = await makeRunningTask({ firm, lane: "structured_parse", engineId: "clara-structured:v1" });
  if (!task) { noteLane("no running structured_parse task — the #3 rogue cell is skipped"); return; }
  let err = null;
  try { await persistExtraction(task, [region("myinvois.buyer_tin", "9999")]); } catch (e) { err = e; }
  assert.ok(err, "persisting a structured_parse region with a pattern-matching off-allowlist field_path REFUSES");
  if (err && err.code !== "CLR10") noteLane(`write-gate refused myinvois.buyer_tin with ${err.code} (contract §3.1 / pin implies CLR10) — code assumption`);
  if (err && err.detail) {
    assert.match(String(err.detail), /attribution_field_not_allowed/,
      "the ATTRIBUTION gate is what refused it — not the syntax wall in front of it");
  }
});

test("[ticket 624] a NON-CANONICAL field_path is refused by the syntax wall BEFORE the attribution gate sees it", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  const grammarLive = (await rootQuery(
    "select to_regprocedure('clara._assert_field_path(text)') is not null as ok")).rows[0].ok;
  if (!grammarLive) { noteLane("clara._assert_field_path absent (pre-0191 frontier) — the syntax-wall cell is skipped"); return; }
  // The two rogues the cell above used to carry. Neither names a registered namespace, so the
  // boundary refuses them on SYNTAX, with its own reason, before any attribution question is
  // asked. That ordering is deliberate: a malformed path must never spend the opening-fact
  // derivation, and it must never be reported as an attribution finding it is not.
  for (const fp of ["rogue.company_ssm", "vendor.bank_account"]) {
    const task = await makeRunningTask({ firm, lane: "structured_parse", engineId: "clara-structured:v1" });
    if (!task) continue;
    let err = null;
    try { await persistExtraction(task, [region(fp, "9999")]); } catch (e) { err = e; }
    assert.ok(err, `a non-canonical field_path (${fp}) must be refused`);
    assert.equal(err.code, "CLR10", `${fp}: expected CLR10, got ${err.code}`);
    assert.match(String(err.message), /not a registered namespace/,
      `${fp}: the SYNTAX wall must be the one that refused it, and it must say so`);
  }
});

test("P11 a non-attribution field_path (buyer_id_primary) persists on structured_parse (only pattern-matchers are gated)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A2);
  const task = await makeRunningTask({ firm, lane: "structured_parse", engineId: "clara-structured:v1" });
  if (!task) { noteLane("no running structured_parse task — P11 non-match cell skipped"); return; }
  await assert.doesNotReject(() => persistExtraction(task, [region("myinvois.buyer_id_primary", `C${randomUUID().slice(0, 8)}`)]),
    "a buyer_id_primary region (no pattern match) persists — it can never become an attribution identifier, so the gate lets it through");
});

test("P11 the OCR lane stays UNGATED — a %tin%-matching field_path persists on an OCR task (the gate is structured_parse-only)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  const task = await makeRunningTask({ firm, lane: "ocr", engineId: "azure-di:prebuilt-layout:4.0" });
  if (!task) { noteLane("no running OCR task — the OCR-untouched cell is skipped"); return; }
  // `myinvois.buyer_tin` rather than the `buyer.tin` this cell carried before ticket 624: the
  // same %tin% match, the same off-allowlist status, now under a REGISTERED namespace so the
  // 0191 syntax wall lets it through and the cell's own subject — that the #3 attribution gate
  // is structured_parse-only — is the only thing being measured. The cell above proves the
  // structured lane refuses this exact path, which is what makes this one discriminating.
  await assert.doesNotReject(() => persistExtraction(task, [region("myinvois.buyer_tin", "9999")]),
    "the OCR lane is not gated by #3 — its verbatim-field_path trust model is unchanged (a named, recorded residual)");
});
