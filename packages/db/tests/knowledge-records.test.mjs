// #644 — the governed Knowledge record: typed assertions, extracted facts, preferences and
// policies, with source, trust, applicability and an attributable revision.
// Migration: 0192_client_knowledge_records.sql. Every cell gates on the LIVE CATALOG, never on
// the migration number (knowledge-fixtures.mjs `knowledgeCohortApplied`).
//
// WHAT THESE CELLS ARE FOR. Three of #644's acceptance criteria are SECURITY claims about what
// the database refuses, not feature claims about what it can store:
//   AC3 — an imported "verified" label or a model inference stays supplied, unverified data and
//         cannot become policy or authority. Three belts say so (CHECK, catalog trigger, door),
//         and cells 1-4 provoke each one.
//   AC4 — a correction or a withdrawal is an attributable REVISION, and the row it retires stays
//         readable. Cells 5-9 prove the revision chain and that no other write is admitted.
//   AC6 — client scope is the default and a firm default never leaks across clients. Cells
//         10-14 prove the scope wall, the shadow and the firm floor.
// Cells 15-18 cover the reads C13 and the runtime lane render.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { assertRaises, endPool, humanQuery, roleQuery, rootQuery, opk, withActor, ROLES } from "./rig-fixtures.mjs";
import { knowledgeCohortApplied, knowledgeWorld } from "./knowledge-fixtures.mjs";

const EXPECTED_CELLS = 27;
let live = false;
let executed = 0;

before(async () => { live = await knowledgeCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_KNOWLEDGE_0192 === "1") {
    console.warn("SKIP knowledge-records: the 0192 cohort is not applied (explicit pre-integration run).");
    t.skip("knowledge cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0192 knowledge cohort is required for a focused run: apply 0192_client_knowledge_records.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// Door wrappers. Named args throughout (the rig's signature strategy).
// ---------------------------------------------------------------------------------------------
const CAPTURE = `select clara.capture_knowledge(
  p_knowledge_key => $1, p_value => $2::jsonb, p_basis => $3, p_op_key => $4,
  p_scope_kind => $5, p_client => $6, p_source_kind => $7, p_applies_when => $8::jsonb,
  p_effective_from => $9::date, p_effective_to => $10::date, p_source => $11::jsonb) as r`;

function capture(sub, o) {
  return humanQuery(sub, CAPTURE, [
    o.key, JSON.stringify(o.value), o.basis ?? "rig basis", o.opKey ?? opk("kn"),
    o.scope ?? "client", o.client ?? null, o.sourceKind ?? "user_statement",
    JSON.stringify(o.appliesWhen ?? {}), o.from ?? null, o.to ?? null,
    JSON.stringify(o.source ?? {}),
  ]).then((r) => r.rows[0].r);
}

function correct(sub, o) {
  return humanQuery(sub,
    `select clara.correct_knowledge(p_record => $1, p_value => $2::jsonb, p_reason => $3,
       p_op_key => $4, p_basis => $5, p_source_kind => $6, p_source => $7::jsonb) as r`,
    [o.record, JSON.stringify(o.value), o.reason, o.opKey ?? opk("kn"), o.basis ?? null,
      o.sourceKind ?? null, o.source == null ? null : JSON.stringify(o.source)],
  ).then((r) => r.rows[0].r);
}

function withdraw(sub, o) {
  return humanQuery(sub,
    "select clara.withdraw_knowledge(p_record => $1, p_reason => $2, p_op_key => $3) as r",
    [o.record, o.reason, o.opKey ?? opk("kn")],
  ).then((r) => r.rows[0].r);
}

const listClientKnowledge = (sub, client) =>
  humanQuery(sub, "select clara.list_client_knowledge(p_client => $1) as r", [client])
    .then((r) => r.rows[0].r);

// TWO CALL SHAPES FOR THE PACK, and the difference is the point -- the same split the promotion
// door already carries. The MACHINE lane carries no claims, so it must NAME the firm it reads and
// the door verifies that name against the client; the HUMAN lane takes its firm from the session
// and treats a supplied p_firm as a belt that must agree.
const PACK_UNBOUND = "select clara.get_knowledge_pack(p_client => $1, p_purpose => $2) as r";
const PACK_BOUND = `select clara.get_knowledge_pack(
  p_client => $1, p_purpose => $2, p_firm => $3) as r`;

const packAs = (firm, client, purpose = "wiki_coding") =>
  roleQuery(ROLES.runtime, PACK_BOUND, [client, purpose, firm]).then((r) => r.rows[0].r);

const knowledgeHistory = (sub, record) =>
  humanQuery(sub, "select clara.get_knowledge_history(p_record => $1) as r", [record])
    .then((r) => r.rows[0].r);

const reasonOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
};

// =============================================================================================
// SEAM 1 — TRUST. An inference is supplied data and can never become policy or authority.
// =============================================================================================

cell("kn.01 an inferred source cannot fill a POLICY key: CLR10 knowledge_trust_insufficient, and no row lands", async () => {
  const w = await knowledgeWorld("t1");
  const err = await assertRaises("CLR10", () => capture(w.admin, {
    key: "accounting_basis", client: w.clientA, sourceKind: "model_inference",
    value: { accounting_basis: "accrual", accounting_basis_label: "Accrual" },
    basis: "the model read three invoices and guessed",
  }), "capture_knowledge(policy, model_inference)");
  assert.equal(reasonOf(err), "knowledge_trust_insufficient");
  const n = await rootQuery(
    "select count(*)::int as n from clara.knowledge_records where client_id = $1", [w.clientA]);
  assert.equal(n.rows[0].n, 0, "a refused capture left a row behind");
});

cell("kn.02 the SAME call from an asserted source succeeds, and the stored trust is derived, not supplied", async () => {
  const w = await knowledgeWorld("t2");
  const r = await capture(w.admin, {
    key: "accounting_basis", client: w.clientA, sourceKind: "user_statement",
    value: { accounting_basis: "accrual", accounting_basis_label: "Accrual" },
    basis: "the client's engagement letter, clause 4",
  });
  assert.equal(r.status, "captured");
  assert.equal(r.trust, "asserted");
  assert.equal(r.revision_kind, "capture");
  assert.equal(r.revision_n, 1);
  const row = await rootQuery(
    "select kind, trust, state, knowledge_version from clara.knowledge_records where record_id = $1",
    [r.record_id]);
  assert.equal(row.rows[0].kind, "policy");
  assert.equal(row.rows[0].trust, "asserted");
  assert.equal(row.rows[0].state, "live");
  assert.ok(Number(row.rows[0].knowledge_version) > 0, "no knowledge_version was stamped");
});

cell("kn.03 an IMPORTED bundle's own label never becomes asserted: the record reads imported_unverified", async () => {
  const w = await knowledgeWorld("t3");
  const r = await capture(w.bookkeeper, {
    key: "turnover_band", client: w.clientA, sourceKind: "imported_bundle", value: "RM1M-5M",
    basis: "an OKF bundle the client emailed, which annotates itself verified",
  });
  assert.equal(r.trust, "imported_unverified",
    "an imported bundle's self-description must not raise its trust");
  // …and the same source is refused on an authority-bearing key.
  const err = await assertRaises("CLR10", () => capture(w.admin, {
    key: "reporting_framework", client: w.clientA, sourceKind: "imported_bundle",
    value: { framework_code: "MPERS" }, basis: "the same bundle",
  }), "capture_knowledge(authority-bearing, imported_bundle)");
  assert.equal(reasonOf(err), "knowledge_trust_insufficient");
});

cell("kn.04 the belt survives the doors: a direct fn_owner INSERT of an inferred policy is refused too", async () => {
  const w = await knowledgeWorld("t4");
  // The doors are one belt; the CHECK and the catalog trigger are the other two. This cell goes
  // AROUND the doors as the definer owner itself — the highest-privilege writer that exists —
  // and the row is still refused.
  const err = await assertRaises("CLR10", () => roleQuery(ROLES.fnOwner,
    `insert into clara.knowledge_records(record_id, revision_n, firm_id, scope_kind, client_id,
        knowledge_key, kind, value, source_kind, trust, basis, asserted_by, recorded_via,
        knowledge_version, revision_kind, state)
     values (gen_random_uuid(), 1, $1, 'client', $2, 'reporting_framework', 'policy',
        '{"framework_code":"MPERS"}'::jsonb, 'model_inference', 'inferred', 'b', $3, 'clara_runtime',
        1, 'capture', 'live')`,
    [w.firm, w.clientA, w.admin]), "direct insert of an inferred policy");
  assert.equal(reasonOf(err), "knowledge_trust_insufficient");
});

// =============================================================================================
// SEAM 2 — CORRECTION AND WITHDRAWAL ARE REVISIONS.
// =============================================================================================

cell("kn.05 capture -> correct leaves TWO revisions: revision 1 superseded, stamped, and still readable", async () => {
  const w = await knowledgeWorld("t5");
  const one = await capture(w.admin, {
    key: "msic", client: w.clientA, value: "46900", basis: "the SSM profile the client sent",
  });
  const two = await correct(w.admin, {
    record: one.record_id, value: "47211", reason: "the client corrected the code by email on 12 Sep",
  });
  assert.equal(two.status, "corrected");
  assert.equal(two.record_id, one.record_id, "a correction must keep the record identity");
  assert.equal(two.revision_n, 2);
  const rows = await rootQuery(
    `select revision_n, state, revision_kind, revision_reason, superseded_by, value #>> '{}' as v,
            asserted_by
       from clara.knowledge_records where record_id = $1 order by revision_n`, [one.record_id]);
  assert.equal(rows.rowCount, 2);
  assert.equal(rows.rows[0].state, "superseded");
  assert.equal(rows.rows[0].superseded_by, two.revision_id, "revision 1 does not name its successor");
  assert.equal(rows.rows[0].v, "46900", "the superseded value must stay readable");
  assert.equal(rows.rows[1].state, "live");
  assert.equal(rows.rows[1].revision_kind, "correction");
  assert.equal(rows.rows[1].revision_reason, "the client corrected the code by email on 12 Sep");
  assert.equal(rows.rows[1].asserted_by, w.admin, "the correcting actor is not recorded");
});

cell("kn.06 a correction without a reason is refused: an attributable revision without its reason is an edit", async () => {
  const w = await knowledgeWorld("t6");
  const one = await capture(w.admin, { key: "msic", client: w.clientA, value: "46900" });
  const err = await assertRaises("CLR10", () => correct(w.admin, {
    record: one.record_id, value: "47211", reason: "   ",
  }), "correct_knowledge with a blank reason");
  assert.equal(reasonOf(err), "knowledge_reason_required");
});

cell("kn.07 withdrawal adds revision 3, is TERMINAL, and carries the retired value verbatim", async () => {
  const w = await knowledgeWorld("t7");
  const one = await capture(w.admin, { key: "msic", client: w.clientA, value: "46900" });
  await correct(w.admin, { record: one.record_id, value: "47211", reason: "client correction" });
  const three = await withdraw(w.admin, {
    record: one.record_id, reason: "the client ceased that trade on 30 Jun",
  });
  assert.equal(three.status, "withdrawn");
  assert.equal(three.revision_n, 3);
  const rows = await rootQuery(
    "select revision_n, state, revision_kind, value #>> '{}' as v from clara.knowledge_records where record_id = $1 order by revision_n",
    [one.record_id]);
  assert.equal(rows.rowCount, 3);
  assert.deepEqual(rows.rows.map((r) => r.state), ["superseded", "superseded", "withdrawn"]);
  assert.equal(rows.rows[2].v, "47211", "a withdrawal must carry the value it retires");
  // TERMINAL: nothing may be appended to a withdrawn record.
  const err = await assertRaises("CLR10", () => correct(w.admin, {
    record: one.record_id, value: "46900", reason: "changed my mind",
  }), "correcting a withdrawn record");
  assert.equal(reasonOf(err), "knowledge_withdrawn");
});

cell("kn.08 no role but a door writes: direct UPDATE and DELETE as clara_fn_owner are refused", async () => {
  const w = await knowledgeWorld("t8");
  const one = await capture(w.admin, { key: "msic", client: w.clientA, value: "46900" });
  const upd = await assertRaises("CLR10", () => roleQuery(ROLES.fnOwner,
    "update clara.knowledge_records set value = '\"11111\"'::jsonb where record_id = $1", [one.record_id]),
    "direct UPDATE of a knowledge value");
  assert.equal(reasonOf(upd), "knowledge_immutable");
  const del = await assertRaises("CLR08", () => roleQuery(ROLES.fnOwner,
    "delete from clara.knowledge_records where record_id = $1", [one.record_id]),
    "direct DELETE of a knowledge revision");
  assert.ok(del, "delete must raise");
  // And no application role holds any DML privilege at all.
  const acl = await rootQuery(
    `select count(*)::int as n
       from unnest(array['clara_authenticated','clara_agent_ro','clara_runtime']) role,
            unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) priv
      where has_table_privilege(role, 'clara.knowledge_records'::regclass, priv)`);
  assert.equal(acl.rows[0].n, 0);
});

cell("kn.09 an exact op_key retry REPLAYS its receipt instead of minting a second revision", async () => {
  const w = await knowledgeWorld("t9");
  const key = opk("kn_replay");
  const first = await capture(w.admin, { key: "msic", client: w.clientA, value: "46900", opKey: key });
  const again = await capture(w.admin, { key: "msic", client: w.clientA, value: "46900", opKey: key });
  assert.equal(again.revision_id, first.revision_id, "a replay minted a second revision");
  const n = await rootQuery(
    "select count(*)::int as n from clara.knowledge_records where client_id = $1", [w.clientA]);
  assert.equal(n.rows[0].n, 1);
});

// =============================================================================================
// SEAM 3 — SCOPE. Client by default; a firm default is an explicit admin act and never leaks.
// =============================================================================================

cell("kn.10 a client preference is invisible to another client of the same firm", async () => {
  const w = await knowledgeWorld("t10");
  await capture(w.bookkeeper, {
    key: "coa_seed_decision", client: w.clientA, value: { seed: "manual" },
    basis: "the client keeps its own chart",
  });
  const a = await listClientKnowledge(w.bookkeeper, w.clientA);
  const b = await listClientKnowledge(w.bookkeeper, w.clientB);
  assert.equal(a.records.filter((r) => r.knowledge_key === "coa_seed_decision").length, 1);
  assert.equal(b.records.filter((r) => r.knowledge_key === "coa_seed_decision").length, 0,
    "a client-private preference leaked to another client");
});

cell("kn.11 a bookkeeper cannot write a FIRM default: CLR04", async () => {
  const w = await knowledgeWorld("t11");
  await assertRaises("CLR04", () => capture(w.bookkeeper, {
    key: "coa_seed_decision", scope: "firm", client: null, value: { seed: "lhdn_mpers_standard" },
    basis: "the firm standardises on the LHDN chart",
  }), "firm-scope capture as a bookkeeper");
});

cell("kn.12 an admin CAN, and the firm default reaches a client that holds no row of its own", async () => {
  const w = await knowledgeWorld("t12");
  await capture(w.admin, {
    key: "coa_seed_decision", scope: "firm", client: null, value: { seed: "lhdn_mpers_standard" },
    basis: "the firm standardises on the LHDN chart",
  });
  const b = await listClientKnowledge(w.bookkeeper, w.clientB);
  const row = b.records.find((r) => r.knowledge_key === "coa_seed_decision");
  assert.ok(row, "the firm default did not reach a client without its own row");
  assert.equal(row.scope_kind, "firm");
  assert.equal(row.value.seed, "lhdn_mpers_standard");
});

cell("kn.13 a client's OWN live row SHADOWS the firm default (#603 Q22: exceptions survive)", async () => {
  const w = await knowledgeWorld("t13");
  await capture(w.bookkeeper, {
    key: "coa_seed_decision", client: w.clientA, value: { seed: "manual" },
    basis: "this client keeps its own chart",
  });
  await capture(w.admin, {
    key: "coa_seed_decision", scope: "firm", client: null, value: { seed: "lhdn_mpers_standard" },
    basis: "the firm standardises on the LHDN chart",
  });
  const a = await listClientKnowledge(w.bookkeeper, w.clientA);
  const rows = a.records.filter((r) => r.knowledge_key === "coa_seed_decision");
  assert.equal(rows.length, 1, "both the client exception and the firm default were rendered");
  assert.equal(rows[0].scope_kind, "client");
  assert.equal(rows[0].value.seed, "manual");
  // …and the other client still sees the firm default.
  const b = await listClientKnowledge(w.bookkeeper, w.clientB);
  assert.equal(b.records.find((r) => r.knowledge_key === "coa_seed_decision").scope_kind, "firm");
});

cell("kn.14 a second live row of one key needs a DIFFERENT applicability; the same one is refused by name", async () => {
  const w = await knowledgeWorld("t14");
  const one = await capture(w.bookkeeper, {
    key: "turnover_band", client: w.clientA, value: "RM1M-5M", basis: "management accounts FY24",
  });
  const err = await assertRaises("CLR10", () => capture(w.bookkeeper, {
    key: "turnover_band", client: w.clientA, value: "RM5M-25M", basis: "a later forecast",
  }), "a second capture of the same key and applicability");
  assert.equal(reasonOf(err), "knowledge_already_live");
  assert.equal(JSON.parse(err.detail).record_id, one.record_id,
    "the refusal must name the record to correct");
  // A genuinely different applicability IS a second live row — the contradiction C13 renders.
  const two = await capture(w.bookkeeper, {
    key: "turnover_band", client: w.clientA, value: "RM5M-25M", appliesWhen: { segment: "digital" },
    basis: "the digital-services segment alone",
  });
  assert.equal(two.status, "captured");
  assert.notEqual(two.applies_when_digest, one.applies_when_digest);
  const a = await listClientKnowledge(w.bookkeeper, w.clientA);
  assert.equal(a.records.filter((r) => r.knowledge_key === "turnover_band" && r.state === "live").length, 2);
});

// =============================================================================================
// SEAM 4 — THE READS. Catalog validation, source pins, the legacy union and the runtime pack.
// =============================================================================================

cell("kn.15 the catalog rule is fail-closed: a wrong shape and a non-catalog value are both refused", async () => {
  const w = await knowledgeWorld("t15");
  const shape = await assertRaises("CLR10", () => capture(w.bookkeeper, {
    key: "financial_year_end_month", client: w.clientA, value: "6", basis: "typed as a string",
  }), "a JSON string for a number-shaped key");
  assert.equal(reasonOf(shape), "knowledge_value_invalid");
  const range = await assertRaises("CLR10", () => capture(w.bookkeeper, {
    key: "financial_year_end_month", client: w.clientA, value: 13, basis: "month thirteen",
  }), "month 13");
  assert.equal(reasonOf(range), "knowledge_value_invalid");
  const enumErr = await assertRaises("CLR10", () => capture(w.bookkeeper, {
    key: "sst_regime", client: w.clientA, value: "maybe", basis: "not a catalog value",
  }), "a non-catalog enum value");
  assert.equal(reasonOf(enumErr), "knowledge_value_invalid");
  const unknown = await assertRaises("CLR10", () => capture(w.bookkeeper, {
    key: "favourite_colour", client: w.clientA, value: "blue", basis: "not a key",
  }), "an unknown key");
  assert.equal(reasonOf(unknown), "knowledge_key_unknown");
  const ok = await capture(w.bookkeeper, {
    key: "financial_year_end_month", client: w.clientA, value: 6, basis: "the constitution",
  });
  assert.equal(ok.status, "captured");
});

cell("kn.16 an extracted fact is LINKED, not copied: the pins are real FKs and a foreign source is refused", async () => {
  const w = await knowledgeWorld("t16");
  const other = await knowledgeWorld("t16b");
  const doc = (await rootQuery(
    `insert into clara.documents(firm_id, sha256, original_filename, mime_type, byte_size,
        storage_path, uploaded_by)
     values ($1, repeat('a',64), 'kn16.pdf', 'application/pdf', 10, $2, $3) returning id`,
    [w.firm, `firms/${w.firm}/docs/${'a'.repeat(64)}.pdf`, w.admin])).rows[0].id;
  const ext = (await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind, version_n, status)
     values ($1,$2,'rig','ocr',1,'done') returning id`, [w.firm, doc])).rows[0].id;
  const reg = (await rootQuery(
    `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path, text_content)
     values ($1,$2,'paragraph_run','{}'::jsonb,'paragraphs.0.entity_msic','46900') returning id`,
    [w.firm, ext])).rows[0].id;

  const r = await capture(w.admin, {
    key: "msic", client: w.clientA, value: "46900", sourceKind: "document_extraction",
    basis: "read from the SSM profile the firm holds",
    source: { document_id: doc, extraction_id: ext, region_id: reg, field_path: "paragraphs.0.entity_msic" },
  });
  assert.equal(r.trust, "extracted", "a document extraction is extracted, never asserted");
  const row = await rootQuery(
    `select source_document_id, source_extraction_id, source_region_id, source_field_path
       from clara.knowledge_records where id = $1`, [r.revision_id]);
  assert.deepEqual(
    [row.rows[0].source_document_id, row.rows[0].source_extraction_id, row.rows[0].source_region_id,
      row.rows[0].source_field_path],
    [doc, ext, reg, "paragraphs.0.entity_msic"], "the four source pins were not stored");
  // A source from ANOTHER firm answers with the same refusal as an absent one (no existence oracle).
  const foreignDoc = (await rootQuery(
    `insert into clara.documents(firm_id, sha256, original_filename, mime_type, byte_size,
        storage_path, uploaded_by)
     values ($1, repeat('b',64), 'kn16b.pdf', 'application/pdf', 10, $2, $3) returning id`,
    [other.firm, `firms/${other.firm}/docs/${'b'.repeat(64)}.pdf`, other.admin])).rows[0].id;
  await assertRaises("CLR11", () => capture(w.admin, {
    key: "entity_type", client: w.clientA, value: "sdn_bhd", sourceKind: "document_extraction",
    basis: "another firm's document", source: { document_id: foreignDoc, extraction_id: ext },
  }), "an extraction pinned to another firm's document");
  // And an extraction pin on a NON-extraction source is refused outright.
  const stray = await assertRaises("CLR10", () => capture(w.admin, {
    key: "entity_type", client: w.clientA, value: "sdn_bhd", sourceKind: "user_statement",
    basis: "a statement wearing an extraction's clothes", source: { document_id: doc, extraction_id: ext },
  }), "an extraction pin on a user statement");
  assert.equal(reasonOf(stray), "knowledge_source_unexpected");
});

cell("kn.17 the C13 register UNIONs the byte-untouched legacy client_facts, and a knowledge record never hides one", async () => {
  const w = await knowledgeWorld("t17");
  // A legacy fact, written exactly as 0055's door leaves it (root insert: the subject here is the
  // READ, and record_client_fact's own admin ceremony is proven in the x55 battery).
  await rootQuery(
    `insert into clara.client_facts(firm_id, client_id, fact_key, fact_value, basis, basis_kind,
        validated_against, recorded_by)
     values ($1,$2,'entity_type','"sdn_bhd"'::jsonb,'the SSM certificate','owner_instruction',
        'enum:ENTITY_TYPES_V2',$3)`, [w.firm, w.clientA, w.admin]);
  await rootQuery(
    `insert into clara.client_facts(firm_id, client_id, fact_key, fact_value, basis, basis_kind,
        validated_against, recorded_by)
     values ($1,$2,'trade_nature','"services"'::jsonb,'the engagement letter','owner_instruction',
        'enum:TRADE_NATURE_V1',$3)`, [w.firm, w.clientA, w.admin]);

  let a = await listClientKnowledge(w.bookkeeper, w.clientA);
  const legacy = a.records.filter((r) => r.source_kind === "legacy_client_fact");
  assert.equal(legacy.length, 2, "the legacy facts are not in the register");
  assert.equal(legacy.every((r) => r.editable === false), true,
    "a legacy fact must not offer a correct/withdraw control it has no door for");
  assert.equal(a.knowledge_version, "0", "legacy rows must not invent a knowledge version");

  // A knowledge record of the same key does NOT hide the legacy one. 0192 does not dual-write,
  // and the rest of the estate still READS clara.client_facts for every one of the five carried
  // keys -- entity_type and msic through the 0055 S6 splice into clara.get_context_pack
  // (0055:765), trade_nature through clara._close_gate_closing_stock (0056:1283),
  // customer_identity_policy through the 0062 name-only guard (0062:226) and
  // banking_arrangement through 0121:4797. So a shadow would have this register report the NEW
  // value while the books went on being prepared from the OLD one, with nothing on screen to say so.
  await capture(w.admin, {
    key: "entity_type", client: w.clientA, value: "llp",
    basis: "the client converted to an LLP on 1 Jul; SSM notice attached to the engagement file",
  });
  a = await listClientKnowledge(w.bookkeeper, w.clientA);
  const entity = a.records.filter((r) => r.knowledge_key === "entity_type");
  assert.equal(entity.length, 2,
    `the legacy fact the estate still reads was hidden by its knowledge record -- got ${JSON.stringify(entity.map((r) => [r.source_kind, r.value]))}`);
  const entityLegacy = entity.find((r) => r.source_kind === "legacy_client_fact");
  const entityRecord = entity.find((r) => r.source_kind === "user_statement");
  assert.equal(entityLegacy.value, "sdn_bhd", "the legacy row keeps the value get_context_pack reads");
  assert.equal(entityLegacy.authoritative, true, "…and says it is the row that still governs");
  assert.equal(entityLegacy.editable, false);
  assert.equal(entityRecord.value, "llp");
  assert.equal(entityRecord.editable, true);
  assert.equal(a.records.filter((r) => r.knowledge_key === "trade_nature").length, 1);
  assert.ok(Number(a.knowledge_version) > 0);
  // The legacy row itself is untouched.
  const untouched = await rootQuery(
    "select count(*)::int as n from clara.client_facts where client_id = $1 and superseded_at is null",
    [w.clientA]);
  assert.equal(untouched.rows[0].n, 2, "0192 must not supersede a legacy fact");
});

cell("kn.18 the runtime pack answers status ok with the version it used, and reaches no other firm", async () => {
  const w = await knowledgeWorld("t18");
  const other = await knowledgeWorld("t18b");
  await capture(w.bookkeeper, { key: "turnover_band", client: w.clientA, value: "RM1M-5M",
    basis: "management accounts FY24" });
  await capture(w.admin, { key: "coa_seed_decision", scope: "firm", client: null,
    value: { seed: "lhdn_mpers_standard" }, basis: "the firm standard" });
  await capture(other.bookkeeper, { key: "turnover_band", client: other.clientA, value: "RM100M+",
    basis: "another firm entirely" });

  const pack = await packAs(w.firm, w.clientA);
  assert.equal(pack.status, "ok");
  assert.equal(pack.purpose, "wiki_coding");
  assert.equal(pack.records.length, 2, "the pack must carry the client row and the firm default");
  assert.equal(pack.records.every((r) => r.client_id === w.clientA || r.scope_kind === "firm"), true);
  const maxVersion = Math.max(...pack.records.map((r) => Number(r.knowledge_version)));
  assert.equal(Number(pack.knowledge_version), maxVersion,
    "knowledge_version must be the greatest stamp the pack actually used");
  // A purpose is required — the pack never answers a question nobody asked.
  await assertRaises("CLR10", () => roleQuery(ROLES.runtime, PACK_BOUND, [w.clientA, "  ", w.firm]),
    "a knowledge pack with no purpose");
  // The human lane does NOT hold the runtime pack, and the runtime lane does not hold the C13 reads.
  const acl = await rootQuery(
    `select has_function_privilege('clara_authenticated','clara.get_knowledge_pack(uuid,text,uuid)'::regprocedure,'EXECUTE') as human_pack,
            has_function_privilege('clara_runtime','clara.list_client_knowledge(uuid)'::regprocedure,'EXECUTE') as runtime_list`);
  assert.equal(acl.rows[0].human_pack, false);
  assert.equal(acl.rows[0].runtime_list, false);
});

// =============================================================================================
// SEAM 3 (review round) — THE SHADOW IS PER-APPLICABILITY, NOT PER-KEY.
//
// The write side already treats two live rows of one key as INDEPENDENT facts whenever their
// `applies_when_digest` differs (`uq_knowledge_live` is over the digest). The reads' shadow has to
// agree, or a client row scoped to one narrow condition silently hides an UNCONDITIONAL firm
// default from that client's whole register — a default that may well apply where the narrow row
// does not. #603 Q22 is explicit that a firm default preserves client EXCEPTIONS; an exception is
// per-condition, so the shadow is too.
// =============================================================================================

// #654 (0205) CHANGED THE KEY THIS CELL USES, and nothing else about it. `sst_regime` is a
// CLIENT-IDENTITY fact — one business's own SST registration status — and owner ruling D8 made
// it un-promotable at firm scope (`clara._tf_knowledge_firm_eligibility`, CLR10
// `knowledge_scope_not_firm_defaultable`). The SUBJECT of this cell is the per-applicability
// shadow, not the key it demonstrates on, so it now demonstrates on `coa_seed_decision`: a
// `preference`, firm-defaultable by kind, and exactly the sort of rule ("the firm seeds the
// LHDN/MPERS chart unless a client asks otherwise") a narrow client exception should override
// without erasing. The values are objects, so the assertions compare them by value rather than by
// a sortable scalar.
cell("kn.19 a client row scoped to ONE condition shadows only the firm row with the SAME condition", async () => {
  const w = await knowledgeWorld("t19");
  const KEY = "coa_seed_decision";
  const FIRM_VALUE = { seed: "lhdn_mpers_standard" };
  const NARROW_VALUE = { seed: "manual" };
  const CLIENT_VALUE = { seed: "manual", note: "the client's own unconditional position" };
  // An UNCONDITIONAL firm default…
  await capture(w.admin, {
    key: KEY, scope: "firm", client: null, value: FIRM_VALUE,
    basis: "the firm's standing treatment where nothing else is recorded",
  });
  // …and a client row that applies to ONE segment only.
  await capture(w.bookkeeper, {
    key: KEY, client: w.clientA, value: NARROW_VALUE,
    appliesWhen: { segment: "digital" }, basis: "the digital-services segment alone",
  });

  const a = await listClientKnowledge(w.bookkeeper, w.clientA);
  const rows = a.records.filter((r) => r.knowledge_key === KEY);
  assert.equal(rows.length, 2,
    `a client row scoped to one condition must not hide the unconditional firm default -- got ${JSON.stringify(rows.map((r) => [r.scope_kind, r.applies_when]))}`);
  const clientRow = rows.find((r) => r.scope_kind === "client");
  const firmRow = rows.find((r) => r.scope_kind === "firm");
  assert.deepEqual(clientRow.applies_when, { segment: "digital" });
  assert.deepEqual(firmRow.applies_when, {});
  assert.deepEqual(firmRow.value, FIRM_VALUE, "the firm default must survive verbatim");

  // The RUNTIME pack reads the same way — a run must not lose the default either.
  const pack = await packAs(w.firm, w.clientA);
  const packRows = pack.records.filter((r) => r.knowledge_key === KEY);
  assert.equal(packRows.length, 2,
    `the knowledge pack must carry both -- got ${JSON.stringify(packRows.map((r) => [r.scope_kind, r.applies_when]))}`);

  // …AND THE SAME-DIGEST PAIR STILL SHADOWS, which is the half that makes this a shadow at all:
  // the client's own UNCONDITIONAL row hides the firm's unconditional one, and only that one.
  await capture(w.bookkeeper, {
    key: KEY, client: w.clientA, value: CLIENT_VALUE,
    basis: "the client's own unconditional position",
  });
  const b = await listClientKnowledge(w.bookkeeper, w.clientA);
  const after = b.records.filter((r) => r.knowledge_key === KEY);
  assert.equal(after.length, 2,
    `the client's unconditional row must shadow the firm's unconditional one -- got ${JSON.stringify(after.map((r) => [r.scope_kind, r.applies_when]))}`);
  assert.equal(after.every((r) => r.scope_kind === "client"), true,
    "both remaining rows are the client's own: the firm default is now genuinely overridden");
  // Compared as OBJECTS, never as JSON text: jsonb normalises key order on storage, so a string
  // comparison would assert something about Postgres's sort rather than about the two values.
  assert.deepEqual(
    [...after].sort((x, y) => String(x.value.note ?? "").localeCompare(String(y.value.note ?? "")))
      .map((r) => r.value),
    [NARROW_VALUE, CLIENT_VALUE],
    "the client's unconditional value and its digital-segment exception both stand");
});

// =============================================================================================
// REVIEW ROUND — the adversarial migration-safety findings, each with its own cell.
// =============================================================================================

cell("kn.20 a QUOTED/escaped applies_when stores and digests -- the old bytea-cast digest raised 22P02 on it", async () => {
  const w = await knowledgeWorld("t20");
  // `jsonb_pretty(x)::bytea` compiles and then raises 22P02 on any value containing a quote,
  // because bytea's input grammar reads the backslash and the quote for itself. That made a whole
  // class of model-supplied condition UNSTORABLE, and lib/knowledge.mjs classifies a non-CLR
  // failure as `unavailable` -- i.e. a deterministic retry loop over a row that can never land.
  const hostile = { note: 'a "quoted" value with a \\ backslash', segment: "digital" };
  const r = await capture(w.bookkeeper, {
    key: "turnover_band", client: w.clientA, value: "RM1M-5M", appliesWhen: hostile,
    basis: "the condition a model would actually write",
  });
  assert.equal(r.status, "captured");
  assert.match(r.applies_when_digest, /^[0-9a-f]{64}$/, "the stored digest must be a real sha256");
  // …and the digest the doors compute is the digest the trigger stamped.
  const same = await rootQuery(
    "select applies_when_digest = clara._knowledge_applies_when_digest(applies_when) as agree, applies_when from clara.knowledge_records where id = $1",
    [r.revision_id]);
  assert.equal(same.rows[0].agree, true, "the stamped digest and the helper must agree");
  assert.deepEqual(same.rows[0].applies_when, hostile, "the condition is stored verbatim");
  // The digest is key-order-insensitive, so the SAME condition written the other way round is the
  // same live slot (a second capture of it is refused, not a second live row).
  const err = await assertRaises("CLR10", () => capture(w.bookkeeper, {
    key: "turnover_band", client: w.clientA, value: "RM5M-25M",
    appliesWhen: { segment: "digital", note: 'a "quoted" value with a \\ backslash' },
    basis: "the same condition, keys reordered",
  }), "the same condition written key-reversed");
  assert.equal(reasonOf(err), "knowledge_already_live");
});

cell("kn.21 the watermark is TEXT and never moves backwards on a withdrawal; both reads agree", async () => {
  const w = await knowledgeWorld("t21");
  const one = await capture(w.admin, { key: "msic", client: w.clientA, value: "46900" });
  const two = await capture(w.bookkeeper, { key: "turnover_band", client: w.clientA, value: "RM1M-5M" });
  // A bigint through jsonb_build_object becomes a JSON NUMBER, which is a lossy claim for a
  // watermark #631's trace compares -- every envelope emits it as text.
  assert.equal(typeof one.knowledge_version, "string", "the receipt's watermark must be text");
  const pack1 = await packAs(w.firm, w.clientA);
  const reg1 = await listClientKnowledge(w.bookkeeper, w.clientA);
  assert.equal(typeof pack1.knowledge_version, "string");
  assert.equal(typeof reg1.knowledge_version, "string");
  assert.equal(pack1.knowledge_version, reg1.knowledge_version,
    "the pack and the register must never disagree about the version they read");
  // EVERY ENVELOPE, not just the two headers: the per-ROW stamp is the number a resumed run
  // compares against a trace, and clara._knowledge_row_json is the one shaper all four reads use.
  const rowVersions = [...pack1.records, ...reg1.records.filter((r) => r.editable)]
    .map((r) => typeof r.knowledge_version);
  assert.equal(rowVersions.every((x) => x === "string"), true,
    `a row emitted its watermark as a JSON number: ${JSON.stringify(rowVersions)}`);
  const hist = await knowledgeHistory(w.bookkeeper, one.record_id);
  assert.equal(typeof hist.revisions[0].knowledge_version, "string",
    "the history shaper must emit the same text");

  // THE WITHDRAWAL. It appends a revision and REMOVES a live row, so a watermark taken over the
  // emitted rows alone would go BACKWARDS -- and a resume check of the form "has the version moved
  // since I recorded it?" would read "nothing changed" across the one event most likely to
  // invalidate the work.
  await withdraw(w.bookkeeper, { record: two.record_id, reason: "the band was withdrawn" });
  const pack2 = await packAs(w.firm, w.clientA);
  const reg2 = await listClientKnowledge(w.bookkeeper, w.clientA);
  assert.ok(BigInt(pack2.knowledge_version) > BigInt(pack1.knowledge_version),
    `the pack watermark stalled or went backwards across a withdrawal: ${pack1.knowledge_version} -> ${pack2.knowledge_version}`);
  assert.equal(pack2.knowledge_version, reg2.knowledge_version,
    "…and the two reads still agree afterwards");
  assert.notEqual(one.record_id, two.record_id);
});

cell("kn.22 a carried legacy key keeps its LEGACY floor: entity_type is admin+, customer_identity_policy is OWNER", async () => {
  const w = await knowledgeWorld("t22");
  // clara.record_client_fact is admin+ for all five carried keys (0055:510); a knowledge capture
  // of the same subject must not be the cheaper route to the same claim.
  await assertRaises("CLR04", () => capture(w.bookkeeper, {
    key: "entity_type", client: w.clientA, value: "sdn_bhd", basis: "a bookkeeper's word",
  }), "entity_type as a bookkeeper");
  const byAdmin = await capture(w.admin, {
    key: "entity_type", client: w.clientA, value: "sdn_bhd", basis: "the SSM certificate",
  });
  assert.equal(byAdmin.status, "captured");

  // …and lifting customer_identity_policy off 'name_only' is an OWNER act (0063:156-166), so an
  // ADMIN cannot record 'unrestricted' here either.
  await assertRaises("CLR04", () => capture(w.admin, {
    key: "customer_identity_policy", client: w.clientA, value: "unrestricted",
    basis: "an admin's word",
  }), "customer_identity_policy as an admin");
  const byOwner = await capture(w.owner, {
    key: "customer_identity_policy", client: w.clientA, value: "unrestricted",
    basis: "the owner's instruction, recorded in the engagement file",
  });
  assert.equal(byOwner.status, "captured");
  // A key with NO legacy floor still admits a bookkeeper at client scope.
  const pref = await capture(w.bookkeeper, {
    key: "coa_seed_decision", client: w.clientA, value: { seed: "manual" },
    basis: "the client keeps its own chart",
  });
  assert.equal(pref.status, "captured");
});

cell("kn.23 NO legacy fact is shadowed: every one of the five is still read by the estate, and says so", async () => {
  const w = await knowledgeWorld("t23");
  // 0062's name-only guard reads clara.client_facts, NOT this register. So a knowledge row of
  // customer_identity_policy that HID the legacy fact would have C13 and the pack both report
  // "unrestricted" while that trigger went on refusing on the row nobody could see. The SAME is
  // true of the other four carried keys -- entity_type/msic (clara.get_context_pack, 0055:765),
  // trade_nature (clara._close_gate_closing_stock, 0056:1283) and banking_arrangement
  // (0121:4797) -- so the rule is not "authority-bearing keys are exempt" but "a legacy fact is
  // never shadowed", and `authoritative` says which row the estate reads.
  await rootQuery(
    `insert into clara.client_facts(firm_id, client_id, fact_key, fact_value, basis, basis_kind,
        validated_against, recorded_by)
     values ($1,$2,'customer_identity_policy','"name_only"'::jsonb,'the owner armed it',
        'owner_instruction','enum:CUSTOMER_IDENTITY_POLICY_V1',$3)`,
    [w.firm, w.clientA, w.owner]);
  // …and a NON-authority-bearing legacy fact, which 0056's close gate still reads.
  await rootQuery(
    `insert into clara.client_facts(firm_id, client_id, fact_key, fact_value, basis, basis_kind,
        validated_against, recorded_by)
     values ($1,$2,'trade_nature','"services"'::jsonb,'the engagement letter','owner_instruction',
        'enum:TRADE_NATURE_V1',$3)`,
    [w.firm, w.clientA, w.owner]);

  await capture(w.owner, {
    key: "customer_identity_policy", client: w.clientA, value: "unrestricted",
    basis: "the owner lifted it in writing on 14 September",
  });
  await capture(w.admin, {
    key: "trade_nature", client: w.clientA, value: "mixed",
    basis: "the client added a goods line",
  });

  const a = await listClientKnowledge(w.owner, w.clientA);
  const policy = a.records.filter((r) => r.knowledge_key === "customer_identity_policy");
  assert.equal(policy.length, 2,
    `an authority-bearing legacy fact must NOT be shadowed -- got ${JSON.stringify(policy.map((r) => r.source_kind))}`);
  const legacy = policy.find((r) => r.source_kind === "legacy_client_fact");
  assert.ok(legacy, "the legacy row must still be on screen");
  assert.equal(legacy.authoritative, true, "…flagged as the row that still governs");
  assert.equal(legacy.value, "name_only", "…carrying the value the 0062 guard actually enforces");
  assert.equal(legacy.editable, false);
  // AND THE DESCRIPTIVE KEY TOO. clara._close_gate_closing_stock (0056:1283) reads the LEGACY
  // trade_nature, so 'services' still decides the closing-stock gate while the register's newer
  // record says 'mixed'. Both rows show; the legacy one is flagged as the one in force.
  const trade = a.records.filter((r) => r.knowledge_key === "trade_nature");
  assert.equal(trade.length, 2,
    `a descriptive legacy fact the close gate still reads was hidden -- got ${JSON.stringify(trade.map((r) => [r.source_kind, r.value]))}`);
  const tradeLegacy = trade.find((r) => r.source_kind === "legacy_client_fact");
  assert.equal(tradeLegacy.value, "services", "the value 0056's gate actually reads");
  assert.equal(tradeLegacy.authoritative, true);
  assert.equal(trade.filter((r) => r.source_kind === "user_statement").length, 1);
  // A GOVERNED record is never flagged authoritative: the flag means "the estate reads THIS row",
  // and nothing outside this register reads clara.knowledge_records yet.
  assert.equal(a.records.filter((r) => r.editable && r.authoritative === true).length, 0,
    "a governed knowledge record must not claim to be the row the estate enforces");
});

cell("kn.24 correctable is DERIVED, so no surface offers a door a superseded or withdrawn revision has not got", async () => {
  const w = await knowledgeWorld("t24");
  const one = await capture(w.admin, { key: "msic", client: w.clientA, value: "46900" });
  await correct(w.admin, { record: one.record_id, value: "47211", reason: "client correction" });
  const hist = await knowledgeHistory(w.admin, one.record_id);
  assert.equal(hist.revisions.length, 2);
  assert.equal(hist.revisions[0].state, "superseded");
  assert.equal(hist.revisions[0].correctable, false, "a superseded revision is immutable at the table");
  assert.equal(hist.revisions[0].editable, true, "…but it is still a governed record with a detail route");
  assert.equal(hist.revisions[1].correctable, true);

  await withdraw(w.admin, { record: one.record_id, reason: "the trade ceased" });
  const after = await knowledgeHistory(w.admin, one.record_id);
  assert.equal(after.revisions.length, 3);
  assert.equal(after.revisions[2].state, "withdrawn");
  assert.equal(after.revisions[2].correctable, false, "a withdrawal is terminal - no door accepts it");
});

cell("kn.25 the live-uniqueness RACE answers by name: the writer body maps 23505 onto its own reasons", async () => {
  // NOT A PROVOKED RACE, and labelled so. Two writers capturing the same (scope, subject, key,
  // applicability) both find no live predecessor to lock, so the loser meets uq_knowledge_live at
  // the INSERT rather than at the core's lookup. Provoking that needs two interleaved transactions
  // inside one governed door call, which this harness cannot arrange; what IS checked here is that
  // the writer names both constraints and both reasons, so the loser gets a typed refusal instead
  // of a bare 23505 no caller maps. The refusal's own wording is exercised by kn.14 (the
  // single-threaded second capture), which takes the same reason through the lookup arm.
  const body = await rootQuery(
    `select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = '_knowledge_insert_revision'`);
  const src = body.rows[0].prosrc;
  assert.match(src, /exception when unique_violation/, "the insert must catch unique_violation");
  assert.match(src, /uq_knowledge_live/, "…and name the live-uniqueness constraint");
  assert.match(src, /knowledge_already_live/, "…mapping it onto the door's own reason");
  assert.match(src, /uq_knowledge_records_revision/, "…and the revision race onto its own");
  assert.match(src, /knowledge_revision_raced/);
  assert.match(src, /\braise;/, "…re-raising anything it does not recognise, fail-closed");
});

// =============================================================================================
// REVIEW ROUND 2 — SHOULD-2: THE RUNTIME PACK NAMES THE TENANT IT READS.
//
// clara.promote_plan_answers_to_knowledge now demands an explicit `p_firm` of its machine lane,
// and clara.capture_knowledge_for is bound by the named human's active membership. The pack was
// the one runtime surface with NO binding at all: `get_knowledge_pack(p_client => X)` derived the
// firm FROM the client and verified nothing, so a wrong (or model-influenced) client id put
// another tenant's knowledge into the model's context. "Derive it from the argument" is not a
// tenancy check; it is the absence of one.
//
// The shape is the promotion door's, verbatim: the machine lane NAMES the firm and a firm that
// does not own the client answers the no-existence-oracle refusal; the human lane takes the
// session firm and a supplied p_firm must agree; anything that is neither lane is CLR03.
// =============================================================================================

cell("kn.26 the runtime pack NAMES the tenant it reads, and neither lane is open by default", async () => {
  const w = await knowledgeWorld("t26");
  const other = await knowledgeWorld("t26b");
  await capture(w.bookkeeper, { key: "turnover_band", client: w.clientA, value: "RM1M-5M",
    basis: "management accounts FY24" });
  await capture(other.bookkeeper, { key: "turnover_band", client: other.clientA, value: "RM100M+",
    basis: "another firm entirely" });

  // ARM 1 — THE MACHINE LANE WITH NO BINDING AT ALL. Before the fix this SUCCEEDED and handed
  // back the client's firm's knowledge on the strength of a client id alone.
  const unbound = await assertRaises("CLR10",
    () => roleQuery(ROLES.runtime, PACK_UNBOUND, [w.clientA, "wiki_coding"]),
    "the runtime reading a pack for a firm it named nowhere");
  assert.equal(reasonOf(unbound), "pack_firm_required");

  // ARM 2 — a binding that does NOT own the client is the no-existence-oracle refusal, and it is
  // the SAME refusal an id that exists nowhere gets.
  const foreign = await assertRaises("CLR11",
    () => roleQuery(ROLES.runtime, PACK_BOUND, [other.clientA, "wiki_coding", w.firm]),
    "the runtime naming firm A and firm B's client");
  const absent = await assertRaises("CLR11",
    () => roleQuery(ROLES.runtime, PACK_BOUND,
      ["00000000-0000-4000-8000-0000000000ff", "wiki_coding", w.firm]),
    "the runtime naming a client that exists nowhere");
  assert.equal(foreign.message, absent.message, "absent and foreign must answer alike");

  // ARM 3 — the correct binding reads, and reads only this firm.
  const ok = await roleQuery(ROLES.runtime, PACK_BOUND, [w.clientA, "wiki_coding", w.firm])
    .then((r) => r.rows[0].r);
  assert.equal(ok.status, "ok");
  assert.equal(ok.firm_id, w.firm);
  assert.equal(ok.records.length, 1);
  assert.equal(ok.records[0].value, "RM1M-5M");

  // ARM 4 — AN IDENTIFIED HUMAN takes the firm from the SESSION, and a supplied p_firm is a belt.
  // The human lane holds no EXECUTE on this door today (kn.18 pins that, and this round does not
  // widen it), so the arm is exercised through a claims-carrying superuser session: that is
  // exactly what the function BODY sees, which is what is under test here.
  const asClaims = (sub, sql, params) => withActor({ jwtSub: sub }, (c) => c.query(sql, params));
  const human = await asClaims(w.bookkeeper, PACK_UNBOUND, [w.clientA, "wiki_coding"])
    .then((r) => r.rows[0].r);
  assert.equal(human.firm_id, w.firm, "the human lane reads its own session firm");
  assert.equal(human.records.length, 1);
  await assertRaises("CLR11",
    () => asClaims(w.bookkeeper, PACK_BOUND, [w.clientA, "wiki_coding", other.firm]),
    "a human naming a firm that is not their own");
  await assertRaises("CLR11",
    () => asClaims(w.bookkeeper, PACK_UNBOUND, [other.clientA, "wiki_coding"]),
    "a human reading another firm's client");

  // ARM 5 — NEITHER LANE. A session that is neither an identified human nor the runtime role is
  // refused CLR03, the authority class, rather than falling through to the cheaper arm.
  const nobody = await assertRaises("CLR03", () => rootQuery(PACK_UNBOUND, [w.clientA, "wiki_coding"]),
    "a claims-less, role-less session reading a pack");
  assert.equal(reasonOf(nobody), "no_pack_context");
});

// =============================================================================================
// REVIEW ROUND 2 — WORKER FOLLOW-UP (f): THE PACK CARRIES THE LEGACY FACTS THAT STILL GOVERN.
//
// The register unions clara.client_facts in and flags each row `authoritative` because those are
// the rows the estate actually reads (decision 1 names the four readers). The PACK did not, so
// the two reads disagreed about the same client: C13 showed the legacy `trade_nature` beside the
// newer knowledge row, while a Work reading the pack saw only the knowledge row -- and would have
// coded on 'mixed' while clara._close_gate_closing_stock (0056:1283) went on gating on
// 'services'. One register, one pack, one answer: the union is the same union, read-only,
// labelled `legacy_client_fact` with `authoritative` true.
// =============================================================================================

cell("kn.27 the runtime pack carries the LEGACY facts that still govern, marked as the rows in force", async () => {
  const w = await knowledgeWorld("t27");
  await rootQuery(
    `insert into clara.client_facts(firm_id, client_id, fact_key, fact_value, basis, basis_kind,
        validated_against, recorded_by)
     values ($1,$2,'trade_nature','"services"'::jsonb,'the engagement letter','owner_instruction',
        'enum:TRADE_NATURE_V1',$3)`, [w.firm, w.clientA, w.admin]);
  await capture(w.admin, {
    key: "trade_nature", client: w.clientA, value: "mixed",
    basis: "the client added a goods line in August",
  });

  const pack = await packAs(w.firm, w.clientA);
  const trade = pack.records.filter((r) => r.knowledge_key === "trade_nature");
  assert.equal(trade.length, 2,
    `the pack dropped the legacy fact the close gate still reads -- got ${JSON.stringify(trade.map((r) => [r.source_kind, r.value]))}`);
  const legacy = trade.find((r) => r.source_kind === "legacy_client_fact");
  assert.ok(legacy, "the pack must carry the legacy row");
  assert.equal(legacy.value, "services", "…carrying the value 0056's close gate actually reads");
  assert.equal(legacy.authoritative, true, "…and saying it is the row that still governs");
  assert.equal(legacy.editable, false, "…with no door behind it");
  assert.equal(legacy.knowledge_version, null, "a legacy fact has no knowledge revision to stamp");
  const governed = trade.find((r) => r.source_kind === "user_statement");
  assert.equal(governed.value, "mixed");
  assert.equal(typeof governed.knowledge_version, "string",
    "a governed row still emits its watermark as text");
  assert.equal(governed.authoritative, undefined,
    "a governed knowledge record must not claim to be the row the estate enforces");

  // THE TWO READS AGREE, row for row, on the legacy half.
  const reg = await listClientKnowledge(w.admin, w.clientA);
  const shape = (rows) => rows.filter((r) => r.source_kind === "legacy_client_fact")
    .map((r) => [r.knowledge_key, r.value, r.authoritative, r.editable, r.trust, r.state])
    .sort();
  assert.deepEqual(shape(pack.records), shape(reg.records),
    "the register and the pack must not carry two dialects of the same legacy fact");
  assert.equal(pack.knowledge_version, reg.knowledge_version);

  // …AND THE WATERMARK IS UNCHANGED BY THE UNION. It is taken over knowledge REVISIONS, so a
  // legacy row arriving (or leaving) must not move the number a resumed run compares.
  const before_ = pack.knowledge_version;
  await rootQuery(
    `insert into clara.client_facts(firm_id, client_id, fact_key, fact_value, basis, basis_kind,
        validated_against, recorded_by)
     values ($1,$2,'entity_type','"sdn_bhd"'::jsonb,'the SSM certificate','owner_instruction',
        'enum:ENTITY_TYPES_V2',$3)`, [w.firm, w.clientA, w.admin]);
  const after_ = await packAs(w.firm, w.clientA);
  assert.equal(after_.knowledge_version, before_,
    "a legacy fact moved the knowledge watermark; the watermark is over knowledge revisions alone");
  assert.equal(after_.records.filter((r) => r.source_kind === "legacy_client_fact").length, 2);
  assert.equal(typeof after_.knowledge_version, "string");
});
