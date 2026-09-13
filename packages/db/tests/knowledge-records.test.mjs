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
import { assertRaises, endPool, humanQuery, roleQuery, rootQuery, opk, ROLES } from "./rig-fixtures.mjs";
import { knowledgeCohortApplied, knowledgeWorld } from "./knowledge-fixtures.mjs";

const EXPECTED_CELLS = 18;
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

const listKnowledge = (sub, client) =>
  humanQuery(sub, "select clara.list_client_knowledge(p_client => $1) as r", [client])
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
  const one = await capture(w.bookkeeper, {
    key: "msic", client: w.clientA, value: "46900", basis: "the SSM profile the client sent",
  });
  const two = await correct(w.bookkeeper, {
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
  assert.equal(rows.rows[1].asserted_by, w.bookkeeper, "the correcting actor is not recorded");
});

cell("kn.06 a correction without a reason is refused: an attributable revision without its reason is an edit", async () => {
  const w = await knowledgeWorld("t6");
  const one = await capture(w.bookkeeper, { key: "msic", client: w.clientA, value: "46900" });
  const err = await assertRaises("CLR10", () => correct(w.bookkeeper, {
    record: one.record_id, value: "47211", reason: "   ",
  }), "correct_knowledge with a blank reason");
  assert.equal(reasonOf(err), "knowledge_reason_required");
});

cell("kn.07 withdrawal adds revision 3, is TERMINAL, and carries the retired value verbatim", async () => {
  const w = await knowledgeWorld("t7");
  const one = await capture(w.bookkeeper, { key: "msic", client: w.clientA, value: "46900" });
  await correct(w.bookkeeper, { record: one.record_id, value: "47211", reason: "client correction" });
  const three = await withdraw(w.bookkeeper, {
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
  const err = await assertRaises("CLR10", () => correct(w.bookkeeper, {
    record: one.record_id, value: "46900", reason: "changed my mind",
  }), "correcting a withdrawn record");
  assert.equal(reasonOf(err), "knowledge_withdrawn");
});

cell("kn.08 no role but a door writes: direct UPDATE and DELETE as clara_fn_owner are refused", async () => {
  const w = await knowledgeWorld("t8");
  const one = await capture(w.bookkeeper, { key: "msic", client: w.clientA, value: "46900" });
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
  const first = await capture(w.bookkeeper, { key: "msic", client: w.clientA, value: "46900", opKey: key });
  const again = await capture(w.bookkeeper, { key: "msic", client: w.clientA, value: "46900", opKey: key });
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
  const a = await listKnowledge(w.bookkeeper, w.clientA);
  const b = await listKnowledge(w.bookkeeper, w.clientB);
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
  const b = await listKnowledge(w.bookkeeper, w.clientB);
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
  const a = await listKnowledge(w.bookkeeper, w.clientA);
  const rows = a.records.filter((r) => r.knowledge_key === "coa_seed_decision");
  assert.equal(rows.length, 1, "both the client exception and the firm default were rendered");
  assert.equal(rows[0].scope_kind, "client");
  assert.equal(rows[0].value.seed, "manual");
  // …and the other client still sees the firm default.
  const b = await listKnowledge(w.bookkeeper, w.clientB);
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
  const a = await listKnowledge(w.bookkeeper, w.clientA);
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
     values ($1,$2,'paragraph_run','{}'::jsonb,'entity.msic','46900') returning id`,
    [w.firm, ext])).rows[0].id;

  const r = await capture(w.admin, {
    key: "msic", client: w.clientA, value: "46900", sourceKind: "document_extraction",
    basis: "read from the SSM profile the firm holds",
    source: { document_id: doc, extraction_id: ext, region_id: reg, field_path: "entity.msic" },
  });
  assert.equal(r.trust, "extracted", "a document extraction is extracted, never asserted");
  const row = await rootQuery(
    `select source_document_id, source_extraction_id, source_region_id, source_field_path
       from clara.knowledge_records where id = $1`, [r.revision_id]);
  assert.deepEqual(
    [row.rows[0].source_document_id, row.rows[0].source_extraction_id, row.rows[0].source_region_id,
      row.rows[0].source_field_path],
    [doc, ext, reg, "entity.msic"], "the four source pins were not stored");
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

cell("kn.17 the C13 register UNIONs the byte-untouched legacy client_facts, and a knowledge record shadows one", async () => {
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

  let a = await listKnowledge(w.bookkeeper, w.clientA);
  const legacy = a.records.filter((r) => r.source_kind === "legacy_client_fact");
  assert.equal(legacy.length, 2, "the legacy facts are not in the register");
  assert.equal(legacy.every((r) => r.editable === false), true,
    "a legacy fact must not offer a correct/withdraw control it has no door for");
  assert.equal(a.knowledge_version, 0, "legacy rows must not invent a knowledge version");

  // A knowledge record of the same key SHADOWS the legacy one; the other legacy fact survives.
  await capture(w.admin, {
    key: "entity_type", client: w.clientA, value: "llp",
    basis: "the client converted to an LLP on 1 Jul; SSM notice attached to the engagement file",
  });
  a = await listKnowledge(w.bookkeeper, w.clientA);
  const entity = a.records.filter((r) => r.knowledge_key === "entity_type");
  assert.equal(entity.length, 1, "the legacy fact was not shadowed by its knowledge record");
  assert.equal(entity[0].source_kind, "user_statement");
  assert.equal(entity[0].editable, true);
  assert.equal(a.records.filter((r) => r.knowledge_key === "trade_nature").length, 1);
  assert.ok(a.knowledge_version > 0);
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

  const pack = await roleQuery(ROLES.runtime,
    "select clara.get_knowledge_pack(p_client => $1, p_purpose => $2) as r", [w.clientA, "wiki_coding"])
    .then((r) => r.rows[0].r);
  assert.equal(pack.status, "ok");
  assert.equal(pack.purpose, "wiki_coding");
  assert.equal(pack.records.length, 2, "the pack must carry the client row and the firm default");
  assert.equal(pack.records.every((r) => r.client_id === w.clientA || r.scope_kind === "firm"), true);
  const maxVersion = Math.max(...pack.records.map((r) => Number(r.knowledge_version)));
  assert.equal(Number(pack.knowledge_version), maxVersion,
    "knowledge_version must be the greatest stamp the pack actually used");
  // A purpose is required — the pack never answers a question nobody asked.
  await assertRaises("CLR10", () => roleQuery(ROLES.runtime,
    "select clara.get_knowledge_pack(p_client => $1, p_purpose => $2) as r", [w.clientA, "  "]),
    "a knowledge pack with no purpose");
  // The human lane does NOT hold the runtime pack, and the runtime lane does not hold the C13 reads.
  const acl = await rootQuery(
    `select has_function_privilege('clara_authenticated','clara.get_knowledge_pack(uuid,text)'::regprocedure,'EXECUTE') as human_pack,
            has_function_privilege('clara_runtime','clara.list_client_knowledge(uuid)'::regprocedure,'EXECUTE') as runtime_list`);
  assert.equal(acl.rows[0].human_pack, false);
  assert.equal(acl.rows[0].runtime_list, false);
});
