// chatTurn_v22 — roster entry A11 (#945): reading a payroll summary back.
//
// THE LOAD-BEARING CLAUSE IS ONE SENTENCE: a figure the page does not print is NOT zero. Everything
// else in this entry exists to make that sentence true — the state is read back from what the
// reader banked, not recomputed, and a figure the state left null is reported as not printed.
//
// WHAT THIS FILE PROVES:
//   1. The input is `{client_id, document_id}` and `.strict()`.
//   2. The door is `clara.get_document_extract`, which IS agent-granted — measured on the lane
//      database, and the reason this entry is class A rather than class C.
//   3. The envelope parse: the `payroll_text_facts` extraction, `payroll_state` out of its
//      envelope, and the regions filtered to the `payroll.` field-path prefix.
//   4. The refusal map: CLR03 → not_permitted, CLR11 → document_not_found, no row →
//      payroll_not_read NAMING the task's own status.
//   5. A non-empty `disagreed` is NOT a refusal.
//   6. The stanza carries #945's paragraph verbatim on its load-bearing clauses.
//
// NO DATABASE IS NEEDED HERE: the parse and the refusal map are pure.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const payroll = await import("../lib/payroll-fact-state.ts");
const v22Tools = await import("../workflows/chatTurn.v22.tools.ts");
const v22Prompt = await import("../workflows/chatTurn.v22.prompt.ts");

const CTX = {
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  taskId: "77777777-7777-4777-8777-777777777777",
};
const DOC = "aaaaaaaa-1111-4111-8111-111111111111";

function codeOf(url) {
  return readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

const STATE = {
  state_version: "v1",
  rows: 14,
  facts: { gross_cents: 4210000, epf_employee_cents: 462000, net_pay_cents: 3500000 },
  established: ["gross_cents", "net_pay_cents"],
  disagreed: [],
  missing: ["socso_employer_cents"],
};

function extract(overrides = {}) {
  return {
    extractions: [
      { engine_kind: "ocr_text", envelope_text: "{}" },
      { engine_kind: "payroll_text_facts", envelope_text: JSON.stringify({ payroll_state: STATE }) },
    ],
    regions: [
      { field_path: "payroll.gross_cents", page: 1, text_content: "42,100.00" },
      { field_path: "payroll.net_pay_cents", page: 1, text_content: "35,000.00" },
      { field_path: "invoice.total_cents", page: 1, text_content: "nothing to do with payroll" },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1 · the input and the door
// ---------------------------------------------------------------------------

test("v22.payroll: the input is `.strict()` and is two uuids", () => {
  const ok = { client_id: CTX.clientId, document_id: DOC };
  assert.equal(v22Tools.readPayrollFactStateInputSchema.safeParse(ok).success, true);
  assert.deepEqual(Object.keys(v22Tools.readPayrollFactStateInputSchema.shape).sort(),
    ["client_id", "document_id"]);
  for (const invented of ["gross_cents", "employee_id", "max_chars"]) {
    assert.equal(v22Tools.readPayrollFactStateInputSchema.safeParse({ ...ok, [invented]: 1 }).success, false, invented);
  }
});

test("v22.payroll: the door is get_document_extract, and it is the CLIENT-SCOPED signature", () => {
  const src = codeOf(new URL("../workflows/chatTurn.v22.tools.ts", import.meta.url));
  // MEASURED on the lane database rather than transcribed: the live signature is
  // `clara.get_document_extract(p_document uuid, p_client uuid, p_max_chars integer)` — THREE
  // arguments, not the two #945's contract wrote — and the client argument is what keeps the read
  // inside the conversation's own client rather than merely inside the firm.
  assert.match(src, /clara\.get_document_extract\(\$1::uuid, \$2::uuid, \$3::int\)/);
  assert.ok(!/clara\.get_payroll_fact_state/.test(src),
    "#945's first-class read is a NEW migration's business and is not taken here");
});

// ---------------------------------------------------------------------------
// 2 · the parse
// ---------------------------------------------------------------------------

test("v22.payroll: the state comes out of the payroll_text_facts envelope, not out of any other", () => {
  const out = payroll.payrollFactStateFromExtract(extract());
  assert.equal(out.ok, true);
  assert.deepEqual(out.state, STATE);
  assert.equal(out.state.facts.net_pay_cents, 3500000, "carried, never recomputed");
});

test("v22.payroll: the regions are filtered to the payroll. field-path prefix", () => {
  const out = payroll.payrollFactStateFromExtract(extract());
  assert.deepEqual(out.regions.map((r) => r.field_path),
    ["payroll.gross_cents", "payroll.net_pay_cents"]);
});

test("v22.payroll: no payroll_text_facts row is `payroll_not_read`, never an empty state", () => {
  const out = payroll.payrollFactStateFromExtract(extract({
    extractions: [{ engine_kind: "ocr_text", envelope_text: "{}" }],
  }));
  assert.equal(out.ok, false);
  assert.equal(out.reason, "payroll_not_read");
  // AND AN UNREADABLE ENVELOPE IS THE SAME ANSWER, never a state of zeroes.
  const broken = payroll.payrollFactStateFromExtract(extract({
    extractions: [{ engine_kind: "payroll_text_facts", envelope_text: "{not json" }],
  }));
  assert.equal(broken.ok, false);
  assert.equal(broken.reason, "payroll_not_read");
});

test("v22.payroll: a non-empty `disagreed` is NOT a refusal", () => {
  const out = payroll.payrollFactStateFromExtract(extract({
    extractions: [{
      engine_kind: "payroll_text_facts",
      envelope_text: JSON.stringify({ payroll_state: { ...STATE, disagreed: ["epf_employee_cents"] } }),
    }],
  }));
  assert.equal(out.ok, true, "#945: a disagreement is something to REPORT, not something to refuse");
  assert.deepEqual(out.state.disagreed, ["epf_employee_cents"]);
});

// ---------------------------------------------------------------------------
// 3 · the refusal map
// ---------------------------------------------------------------------------

test("v22.payroll: CLR03 is not_permitted and CLR11 is document_not_found", () => {
  assert.equal(payroll.payrollReadRefusal("CLR03", null).reason, "not_permitted");
  assert.match(payroll.payrollReadRefusal("CLR03", null).message, /member of the firm/i);
  assert.equal(payroll.payrollReadRefusal("CLR11", null).reason, "document_not_found");
  assert.match(payroll.payrollReadRefusal("CLR11", null).message, /cannot find that document/i);
});

test("v22.payroll: `payroll_not_read` names the task's own status rather than guessing", () => {
  const named = payroll.payrollNotReadMessage("queued");
  assert.match(named, /queued/);
  assert.ok(!/failed|error/i.test(named), "a queued read is not a failure and must not read as one");
  // and when the status is unknown it says so rather than inventing one
  assert.match(payroll.payrollNotReadMessage(null), /not been read/i);
  assert.ok(!/null|undefined/.test(payroll.payrollNotReadMessage(null)));
});

// ---------------------------------------------------------------------------
// 4 · the roster and the stanza
// ---------------------------------------------------------------------------

test("v22.payroll: the tool is on the roster under its contract name", () => {
  const built = v22Tools.buildToolsV22(CTX, "gpt-5.6-terra", 0);
  assert.ok(built.read_payroll_fact_state);
  assert.equal(built.read_payroll_fact_state.inputSchema, v22Tools.readPayrollFactStateInputSchema);
});

test("v22.payroll: the stanza's load-bearing clause is that an unprinted figure is not zero", () => {
  const g = v22Prompt.PAYROLL_FACT_STATE_CHAT_GUIDANCE;
  assert.match(g, /IS NOT ZERO/);
  assert.match(g, /say the page[\s]+does not print it/i);
  assert.match(g, /never apply a[\s]+statutory rate/i);
  assert.match(g, /per-employee rows are not stored/i);
  assert.match(g, /run totals/i);
  assert.match(g, /the two readings disagreed/i);
  assert.ok(v22Prompt.SYSTEM_PROMPT_V22.includes(g));
});
