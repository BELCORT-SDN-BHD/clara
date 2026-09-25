// #1090 — CATALOGUE A DEPRECIATION-POLICY KNOWLEDGE KEY SO THE FIXED-ASSET PROPOSAL'S
// `client_knowledge` GROUND CAN FIRE.
//
// Migration: 0345_depreciation_policy_knowledge_key.sql. Every cell gates on the LIVE CATALOG,
// never on the migration number (knowledge-fixtures.mjs `depreciationPolicyKnowledgeCohortApplied`),
// the same discipline knowledge-fye-day.test.mjs and knowledge-firm-defaults.test.mjs both state.
//
// WHAT THESE CELLS ARE FOR, one per acceptance criterion of #1090's Agent Brief:
//   AC1 — the catalogue carries the key, and it CAN be recorded against a client through the
//         existing knowledge-recording door (`clara.capture_knowledge`) — dk.01 (shape:
//         kind=assertion + authority_bearing=true, the customer_identity_policy precedent, NOT
//         kind=policy — see migration 0345's own header for the measured reason), dk.02
//         (a successful client-scope capture, at the floor authority_bearing implies), dk.03 (only
//         an ASSERTED source may ever fill it — the #883 "a person stays the author" ruling,
//         enforced by the catalog's authority_bearing flag with no code of this ticket's own),
//         dk.04 (a firm-scope capture is refused — this key is never a firm default, which
//         authority_bearing alone does not guarantee: kind=policy/preference would have bypassed
//         this wall unconditionally, so dk.04 is the measurement that the kind choice matters).
//   AC2 — the code path that loads inputs for the proposal derivation reads that knowledge and
//         maps it onto `FaProposalKnowledgeNote` — dk.05 drives the EXACT read the successor
//         contract states (this ticket's report) under the SAME OBO credential
//         (`clara_agent_ro`, firm-walled) the workflow step will use, and dk.06 pipes those rows
//         through `mapDepreciationKnowledgeRows` (packages/runtime/lib/fa-particulars-proposal.ts,
//         #1090's own pure addition) to prove the round trip lands the exact note a person typed.
//   AC3 — a test drives a client with a recorded depreciation-policy knowledge note and asserts
//         the proposal is grounded by it, outranking an account-siblings-based proposal for the
//         same asset — dk.07, the end-to-end assembly: real capture -> real read (clara_agent_ro)
//         -> `mapDepreciationKnowledgeRows` -> `deriveFaParticularsProposal` (imported for real:
//         this cell is precisely about proving the NEW code assembles correctly with the ALREADY
//         proven ranking, so importing the deriver here trivializes nothing — contrast
//         fa-particulars-proposal.test.mjs's OWN "written out, not imported" rule, which exists to
//         keep a DIFFERENT subject, the #933 wire transport, independent of the deriver).
//
// EVERY WRITE UNDER TEST RUNS THROUGH A PERSONA (DECISIONS §1.10); root and the wake-scoped agent
// read appear only as READS, each marked as one.

import { test, before, after } from "node:test";
import { register } from "tsx/esm/api";
import assert from "node:assert/strict";
import {
  assertRaises, endPool, humanQuery, rootQuery, opk, mintWake, wakeQuery, ROLES,
} from "./rig-fixtures.mjs";
import { depreciationPolicyKnowledgeCohortApplied, knowledgeWorld } from "./knowledge-fixtures.mjs";

register();
const proposalLib = await import("../../runtime/lib/fa-particulars-proposal.ts");

const EXPECTED_CELLS = 9; // dk.01 .. dk.09
let live = false;
let executed = 0;

before(async () => {
  live = await depreciationPolicyKnowledgeCohortApplied();
});
after(async () => {
  assert.equal(!live || executed === EXPECTED_CELLS, true,
    `expected ${EXPECTED_CELLS} cells to run once live, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_DEPRECIATION_POLICY_KNOWLEDGE_0345 === "1") {
    console.warn("SKIP depreciation-policy-knowledge: the 0345 cohort is not applied (explicit pre-integration run).");
    t.skip("depreciation-policy-knowledge cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0345 depreciation-policy-knowledge cohort is required for a focused run: apply 0345_depreciation_policy_knowledge_key.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// Door wrapper, the SAME shape knowledge-fye-day.test.mjs's CAPTURE uses, so the batteries cannot
// drift into two dialects.
const CAPTURE = `select clara.capture_knowledge(
  p_knowledge_key => $1, p_value => $2::jsonb, p_basis => $3, p_op_key => $4,
  p_scope_kind => $5, p_client => $6, p_source_kind => $7, p_applies_when => $8::jsonb,
  p_effective_from => $9::date, p_effective_to => $10::date, p_source => $11::jsonb) as r`;

function capture(sub, o) {
  return humanQuery(sub, CAPTURE, [
    o.key ?? "depreciation_policy", JSON.stringify(o.value), o.basis ?? "rig basis", o.opKey ?? opk("p1090"),
    o.scope ?? "client", o.client ?? null, o.sourceKind ?? "user_statement",
    JSON.stringify(o.appliesWhen ?? {}), o.from ?? null, o.to ?? null,
    JSON.stringify(o.source ?? {}),
  ]).then((r) => r.rows[0].r);
}

const reasonOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
};

// The exact read the successor contract states, imported from its ONE home rather than restated
// here (fix round, ADV-L05-02, 2026-09-25 — a copy in this file is what let the window-less form
// pass review twice). Under clara_agent_ro, RLS `p_knowledge_records_agent`
// (firm_id = clara.wake_firm()), the client pinned as $1 and the calendar day the proposal is
// being made for as $2 (null = today in MYT).
const READ = proposalLib.FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL;

cell("dk.01 the catalogue carries depreciation_policy: assertion/object/shape_only, authority-bearing, and an admin+ floor at BOTH scopes from authority_bearing alone", async () => {
  const r = await rootQuery(
    `select kind, value_shape, validated_against, allowed_values, authority_bearing, min_role
       from clara.knowledge_keys where knowledge_key = 'depreciation_policy'`);
  assert.equal(r.rowCount, 1, "depreciation_policy must exist exactly once");
  const row = r.rows[0];
  assert.equal(row.kind, "assertion", "NOT policy -- kind=policy would make it unconditionally firm-eligible (0220's blanket admit), which this ticket does not want");
  assert.equal(row.value_shape, "object");
  assert.equal(row.validated_against, "shape_only");
  assert.equal(row.allowed_values, null);
  assert.equal(row.authority_bearing, true, "authority_bearing alone still forces asserted-only trust, the customer_identity_policy precedent");

  const floors = await rootQuery(
    `select clara._knowledge_floor('depreciation_policy','client') as client_floor,
            clara._knowledge_floor('depreciation_policy','firm') as firm_floor`);
  assert.equal(floors.rows[0].client_floor, "admin", "authority_bearing implies admin+ even though min_role itself reads bookkeeper");
  assert.equal(floors.rows[0].firm_floor, "admin");
});

cell("dk.02 an admin records a client-scoped depreciation-policy note through the existing door; a bookkeeper, below the floor, is refused", async () => {
  const w = await knowledgeWorld("dk2");
  const ok = await capture(w.admin, {
    client: w.clientA, value: { method: "straight_line", useful_life_months: 96, rate_bps: null, label: "Plant, 8 years" },
    appliesWhen: { asset_account_code: "1500" },
    basis: "the client's controller states this account is depreciated over 8 years",
  });
  assert.equal(ok.status, "captured");

  const w2 = await knowledgeWorld("dk2b");
  const err = await assertRaises("CLR04", () => capture(w2.bookkeeper, {
    client: w2.clientA, value: { method: "straight_line", useful_life_months: 96 },
    basis: "rig probe below the floor",
  }), "capture_knowledge(depreciation_policy) as bookkeeper");
  assert.ok(err, "a bookkeeper is below the admin floor authority_bearing implies (CLR04, authz/role-floor)");
});

cell("dk.03 only an ASSERTED source may ever fill it — a document_extraction or a model_inference source is refused, even from an owner", async () => {
  const w = await knowledgeWorld("dk3");
  // clara.capture_knowledge's own trust wall (0192:938-946) fires BEFORE clara._knowledge_source_pins
  // (0192:947), so this refusal is on TRUST, not on a missing document/extraction pin -- proven by
  // asserting the reason, not merely that SOME CLR10 fired.
  for (const sourceKind of ["model_inference", "document_extraction"]) {
    const err = await assertRaises("CLR10", () => capture(w.admin, {
      client: w.clientA, value: { method: "none" }, sourceKind, basis: "rig probe",
    }), `capture_knowledge(depreciation_policy, ${sourceKind})`);
    assert.equal(reasonOf(err), "knowledge_trust_insufficient",
      `a ${sourceKind} source must be refused for being un-asserted, not for a missing source pin`);
  }
  // AND user_statement / interview / registry_lookup are the admitted three (asserted trust).
  for (const sourceKind of ["user_statement", "interview", "registry_lookup"]) {
    const w2 = await knowledgeWorld(`dk3_${sourceKind}`);
    const ok = await capture(w2.admin, {
      client: w2.clientA, value: { method: "none" }, sourceKind, opKey: opk(`p1090_${sourceKind}`),
      basis: "rig probe, an admitted source",
    });
    assert.equal(ok.status, "captured", `${sourceKind} is one of the three sources 'asserted' trust admits`);
  }
});

cell("dk.04 a firm-scope capture of depreciation_policy is refused — this ticket's brief is a CLIENT note, never a firm default", async () => {
  const w = await knowledgeWorld("dk4");
  const err = await assertRaises("CLR10", () => capture(w.owner, {
    scope: "firm", client: null, value: { method: "none" },
    basis: "the firm's standing position on depreciation_policy",
  }), "capture_knowledge(firm, depreciation_policy)");
  assert.equal(reasonOf(err), "knowledge_scope_not_firm_defaultable");
  assert.equal(
    await rootQuery(
      "select count(*)::int as n from clara.knowledge_records where knowledge_key = 'depreciation_policy' and scope_kind = 'firm'",
    ).then((r) => r.rows[0].n),
    0, "no firm-scope row may have landed");
});

cell("dk.05 the SAME OBO read credential v4's own register read mints (clara_agent_ro) can read the captured row, firm-walled", async () => {
  const w = await knowledgeWorld("dk5");
  await capture(w.admin, {
    client: w.clientA, value: { method: "straight_line", useful_life_months: 60 },
    appliesWhen: { asset_account_code: "1500" }, opKey: opk("p1090_dk5"),
    basis: "rig probe for the agent-ro read",
  });
  const cred = await mintWake({ kind: "interactive", firm: w.firm });
  const mine = await wakeQuery(ROLES.agentRo, cred.secret, READ, [w.clientA, null]);
  assert.equal(mine.rowCount, 1, "the captured row is readable under clara_agent_ro, client-pinned");
  assert.deepEqual(mine.rows[0].applies_when, { asset_account_code: "1500" });
  assert.deepEqual(mine.rows[0].value, { method: "straight_line", useful_life_months: 60 });

  // FIRM-WALLED: a wake credential minted for ANOTHER firm reads nothing for this client, because
  // clara.wake_firm() binds firm_id and clara.knowledge_records has no client-only escape hatch.
  const w2 = await knowledgeWorld("dk5_other");
  const foreignCred = await mintWake({ kind: "interactive", firm: w2.firm });
  const foreign = await wakeQuery(ROLES.agentRo, foreignCred.secret, READ, [w.clientA, null]);
  assert.equal(foreign.rowCount, 0, "another firm's wake credential reads nothing for this client");
});

cell("dk.06 mapDepreciationKnowledgeRows carries the captured row's exact values into a FaProposalKnowledgeNote, round-tripped through the real database", async () => {
  const w = await knowledgeWorld("dk6");
  await capture(w.admin, {
    client: w.clientA,
    value: { method: "reducing_balance", useful_life_months: 84, rate_bps: 2500, label: "Machinery, reducing balance" },
    appliesWhen: { asset_account_code: "1600" }, opKey: opk("p1090_dk6"),
    basis: "rig probe for the mapper round trip",
  });
  const cred = await mintWake({ kind: "interactive", firm: w.firm });
  const rows = await wakeQuery(ROLES.agentRo, cred.secret, READ, [w.clientA, null]);
  assert.equal(rows.rowCount, 1);
  const notes = proposalLib.mapDepreciationKnowledgeRows(rows.rows);
  assert.equal(notes.length, 1);
  assert.deepEqual(
    { assetAccount: notes[0].assetAccount, label: notes[0].label, method: notes[0].method,
      usefulLifeMonths: notes[0].usefulLifeMonths, rateBps: notes[0].rateBps },
    { assetAccount: "1600", label: "Machinery, reducing balance", method: "reducing_balance",
      usefulLifeMonths: 84, rateBps: 2500 },
    "the mapped note carries EXACTLY what the person recorded, from an independent expected literal");
  assert.equal(notes[0].recordId, rows.rows[0].id, "recordId is the knowledge record's own id, so a reason can cite it");
});

cell("dk.07 AC3 — a client's recorded depreciation-policy note, captured and read for real, outranks an account-siblings-based proposal for the same asset", async () => {
  const w = await knowledgeWorld("dk7");
  await capture(w.admin, {
    client: w.clientA,
    value: { method: "straight_line", useful_life_months: 96, rate_bps: null, label: "Plant depreciated over 8 years, per the controller" },
    appliesWhen: { asset_account_code: "1500" }, opKey: opk("p1090_dk7"),
    basis: "the client's controller states this account is depreciated over 8 years",
  });
  const cred = await mintWake({ kind: "interactive", firm: w.firm });
  const rows = await wakeQuery(ROLES.agentRo, cred.secret, READ, [w.clientA, null]);
  const knowledge = proposalLib.mapDepreciationKnowledgeRows(rows.rows);

  const asset = {
    assetId: "22222222-2222-4222-8222-222222222222", description: "Forklift", costCents: 800_000,
    nonDepreciable: false, particularsComplete: false, assetAccount: "1500", acquiredDate: "2026-09-01",
  };
  // A DISAGREEING sibling on the SAME account: were the knowledge note absent, account_siblings
  // would ground 60 months straight line -- a DIFFERENT driver set, so the two grounds are
  // actually in tension and the outcome below is not vacuously true.
  const siblings = [{ assetAccount: "1500", particularsComplete: true, method: "straight_line",
    usefulLifeMonths: 60, rateBps: null }];

  const proposal = proposalLib.deriveFaParticularsProposal({ asset, siblings, knowledge });
  assert.ok(proposal, "a pending row on a policy-less account earns a proposal");
  assert.deepEqual(proposal.basis, ["client_knowledge", "acquisition_date", "firm_default_residual"],
    "the recorded note grounds the proposal, and account_siblings is not even named");
  assert.equal(proposal.method, "straight_line");
  assert.equal(proposal.useful_life_months, 96, "the note's OWN 96 months wins, not the sibling's 60");
  assert.match(proposal.reason, /This client's record states/, "the reason names the knowledge ground");
  assert.match(proposal.reason, /Plant depreciated over 8 years/, "…and quotes the recorded label");

  // WITHOUT the knowledge note, the SAME asset and siblings ground account_siblings instead — the
  // control that proves dk.07 above is a real reversal, not two independently-true proposals.
  const withoutKnowledge = proposalLib.deriveFaParticularsProposal({ asset, siblings });
  assert.deepEqual(withoutKnowledge.basis, ["account_siblings", "acquisition_date", "firm_default_residual"]);
  assert.equal(withoutKnowledge.useful_life_months, 60);
});

cell("dk.08 a note whose effective window has CLOSED grounds nothing — the read asks as of a calendar day, and the estate's own windowing is honoured (ADV-L05-02)", async () => {
  const w = await knowledgeWorld("dk8");
  // A note a person recorded for ONE year and never renewed. `clara.capture_knowledge` takes the
  // window; `state` stays 'live' for a windowed row that has simply expired (nothing supersedes
  // it), so `state = 'live'` alone is NOT the test of whether it still speaks.
  await capture(w.admin, {
    client: w.clientA, value: { method: "straight_line", useful_life_months: 24, label: "Interim basis, 2024 only" },
    appliesWhen: { asset_account_code: "1500" }, opKey: opk("p1090_dk8_windowed"),
    from: "2024-01-01", to: "2024-12-31",
    basis: "the controller's interim instruction for the 2024 year only",
  });
  const cred = await mintWake({ kind: "interactive", firm: w.firm });

  // THE ROW IS THERE AND STILL 'live' — so the exclusion below is the WINDOW, not a missing row.
  const unwindowed = await wakeQuery(ROLES.agentRo, cred.secret,
    `select id, state, to_char(effective_from,'YYYY-MM-DD') as from_day,
            to_char(effective_to,'YYYY-MM-DD') as to_day
       from clara.knowledge_records
      where client_id = $1::uuid and knowledge_key = 'depreciation_policy' and state = 'live'`,
    [w.clientA]);
  assert.equal(unwindowed.rowCount, 1, "the windowed note is present and live");
  assert.equal(unwindowed.rows[0].to_day, "2024-12-31", "…and it carries the window the person gave it");

  // AS OF A DAY AFTER THE WINDOW CLOSED: nothing. A 2026 proposal is not grounded on a 2024 note.
  const after = await wakeQuery(ROLES.agentRo, cred.secret,
    proposalLib.FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL, [w.clientA, "2026-09-01"]);
  assert.equal(after.rowCount, 0,
    "an expired note grounds nothing: the proposal's own sentence is present tense about what the client's record STATES");

  // AS OF A DAY INSIDE THE WINDOW: the same row comes back. This is the control that makes the
  // exclusion above the window's doing rather than the statement's.
  const inside = await wakeQuery(ROLES.agentRo, cred.secret,
    proposalLib.FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL, [w.clientA, "2024-06-30"]);
  assert.equal(inside.rowCount, 1, "inside its own window the note reads exactly as before");
  assert.deepEqual(proposalLib.mapDepreciationKnowledgeRows(inside.rows).map((n) => n.usefulLifeMonths), [24]);

  // AND A NOTE WITH NO WINDOW AT ALL — the ordinary case — is unaffected by either as-of.
  const w2 = await knowledgeWorld("dk8_open");
  await capture(w2.admin, {
    client: w2.clientA, value: { method: "straight_line", useful_life_months: 96 },
    appliesWhen: { asset_account_code: "1500" }, opKey: opk("p1090_dk8_open"),
    basis: "a standing instruction with no end date",
  });
  const cred2 = await mintWake({ kind: "interactive", firm: w2.firm });
  for (const asOf of ["2024-06-30", "2026-09-01", null]) {
    const r = await wakeQuery(ROLES.agentRo, cred2.secret,
      proposalLib.FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL, [w2.clientA, asOf]);
    assert.equal(r.rowCount, 1,
      `an unwindowed note speaks as of ${asOf ?? "the statement's own MYT day (the null default)"}`);
  }

  // THE NULL DEFAULT IS MYT'S CALENDAR DAY, not the server's — the same expression
  // clara.retrieve_knowledge defaults p_as_of to (0230:361-362 reads it against
  // `(now() at time zone 'Asia/Kuala_Lumpur')::date`), so the read cannot drift a day from the
  // estate's own knowledge window at a UTC midnight boundary. clara._book_today() would have been
  // the nicer spelling and is ungranted to this credential (dk.09's sibling measurement).
  const expired = await wakeQuery(ROLES.agentRo, cred.secret,
    proposalLib.FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL, [w.clientA, null]);
  assert.equal(expired.rowCount, 0, "with no as-of, the read asks about TODAY in MYT, and the 2024 note is past");
});

cell("dk.09 the successor step reads the relation directly because clara.retrieve_knowledge is out of the OBO read credential's reach — measured, not assumed (ADV-L05-02)", async () => {
  // WHY THIS CELL EXISTS. The estate owns a windowing knowledge read already
  // (clara.retrieve_knowledge, which also writes the work-knowledge-read receipt
  // clara.work_knowledge_drift depends on). The adversarial lens asked why the successor contract
  // states a raw SELECT instead. The answer is a grant, and a grant is measurable.
  const r = await rootQuery(
    `select has_function_privilege('clara_agent_ro',
              'clara.retrieve_knowledge(uuid,text,date,text[],integer,uuid)', 'execute') as agent_ro,
            has_function_privilege('clara_runtime',
              'clara.retrieve_knowledge(uuid,text,date,text[],integer,uuid)', 'execute') as runtime,
            has_function_privilege('clara_agent_ro',
              'clara.record_work_knowledge_read(uuid,text,integer,text,date,text,text[],jsonb,integer,boolean,text,text)', 'execute') as agent_ro_receipt`);
  assert.equal(r.rows[0].agent_ro, false,
    "clara_agent_ro — the credential readScoped mints and the successor step reads under — cannot call clara.retrieve_knowledge");
  assert.equal(r.rows[0].runtime, true,
    "…it is clara_runtime's door, a DIFFERENT credential with a different wall");
  assert.equal(r.rows[0].agent_ro_receipt, false,
    "…and the drift receipt is out of the same credential's reach, which is what the successor contract must say rather than leave a reader to discover");
});
