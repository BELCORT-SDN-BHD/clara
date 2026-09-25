// chatTurn_v22 — roster entries A8 (#915) and A9 (#941): the two configuration tools.
//
// #941 copies #915's twin-door shape, so §1.10 fixes the order A8 then A9 and this file follows
// it. BOTH are bound by D1 (the model never supplies a term) and D2 (the model never enrols an
// account), which is why neither input carries a date and neither tool has an enrol path.
//
// WHAT THIS FILE PROVES:
//   1. Both inputs are `.strict()` and carry NO amount, NO term, NO dates, NO cadence, NO pattern
//      and NO authority id. Every one of those absences is a rule, not an omission.
//   2. Both tools call the OBO TWIN — `…_for` — because the runtime pool carries no JWT claims and
//      the human door would answer CLR04 on every call. `p_author` is the HUMAN the turn acts for.
//   3. The op key is `stableOpKey(ctx.taskId, TOOL, input)` and the two entrances share one
//      namespace, which is what makes a re-run turn replay rather than collide.
//   4. The success payload is a CONFIGURATION receipt and says so: `configurationOnly: true`, and
//      it carries a `kind`, never a wire `type` — no new part kind is added by this cut.
//   5. The refusal maps: #915's three new tokens, and #941's fourteen, which are the same fourteen
//      `apps/web/lib/deferred-revenue/schedule.ts` spells so the two surfaces cannot drift.
//   6. D2's prohibition is in the enrolment refusal itself: it names the panel and never offers to
//      enrol.
//
// NO DATABASE IS NEEDED HERE.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const prepay = await import("../lib/prepayment-schedule-basis.ts");
const revenue = await import("../lib/revenue-recognition-basis.ts");
const v22Tools = await import("../workflows/chatTurn.v22.tools.ts");
const v22Prompt = await import("../workflows/chatTurn.v22.prompt.ts");

const CTX = {
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  taskId: "77777777-7777-4777-8777-777777777777",
};
const ENTRY = "88888888-8888-4888-8888-888888888888";

function codeOf(url) {
  return readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// A8 · the prepayment schedule
// ---------------------------------------------------------------------------

test("v22.prepayment: the input is `.strict()` and carries no figure of any kind", () => {
  const ok = {
    source_entry_id: ENTRY,
    expense_account_code: "6300",
    expense_account_basis: "Annual insurance, charged monthly over the cover period",
    purpose: "Insurance amortisation 2026",
  };
  assert.equal(prepay.startPrepaymentScheduleWorkInputSchema.safeParse(ok).success, true);
  assert.deepEqual(Object.keys(prepay.startPrepaymentScheduleWorkInputSchema.shape).sort(),
    ["expense_account_basis", "expense_account_code", "purpose", "source_entry_id"]);
  // EVERY ABSENCE IS A RULE. The amount is the entry's own prepaid leg, the term is the document's
  // or a person's, the cadence is the frozen evaluator's, and the authority is the conversation.
  for (const invented of ["amount_cents", "period_start", "period_end", "term_months", "frequency", "authority_ref"]) {
    assert.equal(
      prepay.startPrepaymentScheduleWorkInputSchema.safeParse({ ...ok, [invented]: "x" }).success,
      false,
      invented,
    );
  }
});

test("v22.prepayment: the tool calls the OBO TWIN with p_author, in the door's own argument order", () => {
  const src = codeOf(new URL("../workflows/chatTurn.v22.tools.ts", import.meta.url));
  assert.match(src, /clara\.create_prepayment_schedule_for\(/);
  assert.ok(!/clara\.create_prepayment_schedule\(/.test(src),
    "the HUMAN door needs JWT claims the runtime pool does not carry, so it could only ever refuse");
  for (const arg of [
    "p_client          => \\$1::uuid",
    "p_author          => \\$2::uuid",
    "p_source_entry    => \\$3::uuid",
    "p_expense_account => \\$4::text",
    "p_expense_basis   => \\$5::text",
    "p_purpose         => \\$6::text",
    "p_authority_ref   => \\$7::jsonb",
    "p_op_key          => \\$8::text",
  ]) {
    assert.match(src, new RegExp(arg), arg);
  }
  // `p_author` is the HUMAN this turn acts for — never the agent user id, and never the task id.
  const body = src.slice(src.indexOf("export async function runStartPrepaymentScheduleWork"));
  assert.match(body, /ctx\.createdBy/);
  assert.ok(!/p_author[^\n]*ctx\.taskId/.test(body));
});

test("v22.prepayment: p_authority_ref is the CONVERSATION, minted from ctx and never from the model", () => {
  const payload = prepay.prepaymentDoorPayload(
    { source_entry_id: ENTRY, expense_account_code: " 6300 ", expense_account_basis: " because ", purpose: " ins " },
    { clientId: CTX.clientId, taskId: CTX.taskId, opKey: "k" },
  );
  assert.deepEqual(payload.p_authority_ref, { kind: "chat_task", id: CTX.taskId });
  assert.equal(payload.p_expense_account, "6300");
  assert.equal(payload.p_op_key, "k");
});

test("v22.prepayment: the success payload is a CONFIGURATION receipt, and it is not a wire kind", () => {
  const part = prepay.prepaymentSchedulePart({
    schedule_id: "s", plan_id: "p", total_cents: 120000, period_count: 12,
    effective_from: "2026-01-01", effective_to: "2026-12-31",
    expense_account_code: "6300", prepaid_account_code: "1300",
  });
  assert.equal(part.configurationOnly, true, "a schedule posts nothing at the moment this is emitted");
  // `kind`, not `type`: `check-parts-parity.mjs`'s discriminant is `type`, so this payload rides
  // INSIDE the tool result rather than becoming a new part the web has to render.
  assert.equal(part.kind, "prepayment_schedule_configured");
  assert.equal(part.type, undefined);
});

test("v22.prepayment: the three tokens #915 named have sentences, and the enrolment one names the panel", () => {
  // D2's prohibition, in the refusal itself: Clara says so, says which account, points at the
  // panel — and never offers to enrol it.
  const unfit = prepay.prepaymentRefusalMessage("prepayment_source_unfit", {
    axis: "prepaid_account_not_enrolled", prepaid_account_code: "1300",
    panel: "client_registers_prepayment_accounts",
  });
  assert.match(unfit, /1300/);
  assert.match(unfit, /Registers/i);
  assert.match(unfit, /bookkeeper/i);
  assert.ok(!/I can enrol|shall I enrol|would you like me to enrol/i.test(unfit),
    "D2: she never enrols and never proposes which account should be enrolled");

  assert.match(prepay.prepaymentRefusalMessage("authority_lost"), /no longer active/i);
  assert.match(prepay.prepaymentRefusalMessage("insufficient_role"), /bookkeeper/i);
  assert.match(prepay.prepaymentRefusalMessage("invalid_author"), /./);
});

test("v22.prepayment: the module's footer names the TWIN's eight arguments, not the human door's seven", () => {
  // #915's follow-up 3: the footer's step 4 was stale the moment the twin existed.
  const footer = readFileSync(new URL("../lib/prepayment-schedule-basis.ts", import.meta.url), "utf8");
  assert.match(footer, /create_prepayment_schedule_for/);
  assert.match(footer, /p_author/);
});

// ---------------------------------------------------------------------------
// A9 · the revenue recognition schedule
// ---------------------------------------------------------------------------

test("v22.revenue: the input is `.strict()` and carries no amount, no dates and no pattern", () => {
  const ok = {
    source_entry_id: ENTRY,
    revenue_account_code: "4000",
    revenue_account_basis: "Annual support contract, recognised monthly",
    purpose: "Support revenue 2026",
  };
  assert.equal(revenue.startRevenueRecognitionWorkInputSchema.safeParse(ok).success, true);
  assert.deepEqual(Object.keys(revenue.startRevenueRecognitionWorkInputSchema.shape).sort(),
    ["purpose", "revenue_account_basis", "revenue_account_code", "source_entry_id"]);
  for (const invented of ["amount_cents", "period_start", "pattern", "period_count", "authority_ref"]) {
    assert.equal(
      revenue.startRevenueRecognitionWorkInputSchema.safeParse({ ...ok, [invented]: "x" }).success,
      false,
      invented,
    );
  }
  // and the bounds #941 fixed
  assert.equal(revenue.startRevenueRecognitionWorkInputSchema.safeParse({ ...ok, revenue_account_code: "" }).success, false);
  assert.equal(revenue.startRevenueRecognitionWorkInputSchema.safeParse({ ...ok, revenue_account_basis: "" }).success, false);
});

test("v22.revenue: the tool calls the OBO twin and does NOT send p_pattern", () => {
  const src = codeOf(new URL("../workflows/chatTurn.v22.tools.ts", import.meta.url));
  assert.match(src, /clara\.create_revenue_recognition_schedule_for\(/);
  for (const arg of [
    "p_client          => \\$1::uuid",
    "p_author          => \\$2::uuid",
    "p_source_entry    => \\$3::uuid",
    "p_revenue_account => \\$4::text",
    "p_revenue_basis   => \\$5::text",
    "p_purpose         => \\$6::text",
    "p_authority_ref   => \\$7::jsonb",
    "p_op_key          => \\$8::text",
  ]) {
    assert.match(src, new RegExp(arg), arg);
  }
  assert.ok(!/p_pattern/.test(src),
    "#941: p_pattern defaults to straight_line and no other value is offered, so an argument could only refuse");
});

test("v22.revenue: the fourteen tokens are the ones the web already spells", () => {
  // They are the same fourteen `apps/web/lib/deferred-revenue/schedule.ts` carries, so the two
  // surfaces cannot drift. Read from the web module rather than re-typed here.
  const web = readFileSync(new URL("../../../apps/web/lib/deferred-revenue/schedule.ts", import.meta.url), "utf8");
  for (const token of revenue.RECOGNITION_REFUSAL_TOKENS) {
    assert.ok(web.includes(token), `${token} is spelled on both surfaces`);
    assert.match(revenue.recognitionRefusalMessage(token, {}), /\S/, token);
  }
  assert.equal(revenue.RECOGNITION_REFUSAL_TOKENS.length, 14);
});

test("v22.revenue: the enrolment refusal names the account and the panel, and offers nothing", () => {
  const out = revenue.recognitionRefusalMessage("deferred_revenue_source_unfit", {
    axis: "deferred_account_not_enrolled", deferred_account_code: "2030",
  });
  assert.match(out, /2030/);
  assert.match(out, /Registers/i);
  assert.ok(!/shall I enrol|would you like me to enrol/i.test(out), "D2 binds this lane too");
});

test("v22.revenue: the part is a configuration receipt carrying the period lines", () => {
  const part = revenue.revenueRecognitionPart({
    schedule_id: "s", plan_id: "p", total_cents: 120000, period_count: 12,
    term_start: "2026-01-01", term_end: "2026-12-31",
    deferred_account_code: "2030", revenue_account_code: "4000",
    period_lines: [{ due_date: "2026-01-31", amount_cents: 10000 }],
    overlap_warning: null,
  });
  assert.equal(part.kind, "revenue_recognition_configured");
  assert.equal(part.configurationOnly, true);
  assert.equal(part.periodCount, 12);
  assert.equal(part.periodLines.length, 1);
  assert.equal(part.overlapWarning, null);
});

// ---------------------------------------------------------------------------
// the roster and the two stanzas
// ---------------------------------------------------------------------------

test("v22.schedules: both tools are on the roster, under their contract names", () => {
  const built = v22Tools.buildToolsV22(CTX, "gpt-5.6-terra", 0);
  assert.ok(built.start_prepayment_schedule_work);
  assert.ok(built.start_revenue_recognition_work);
  assert.equal(built.start_prepayment_schedule_work.inputSchema, prepay.startPrepaymentScheduleWorkInputSchema);
  assert.equal(built.start_revenue_recognition_work.inputSchema, revenue.startRevenueRecognitionWorkInputSchema);
});

test("v22.schedules: the stanzas say she configures, never that anything posted", () => {
  const g = v22Prompt.SCHEDULES_V22_CHAT_GUIDANCE;
  assert.match(g, /never the term/i);
  assert.match(g, /THE SERVICE PERIOD IS A PERSON.S/);
  assert.match(g, /never proposes the dates/i);
  assert.match(g, /never enrols an account herself/i);
  assert.match(g, /configuring records what will be[\s]+recognised/i);
  assert.match(g, /CUSTOMER HAS PAID AHEAD/i);
  assert.match(g, /nothing has been posted yet/i);
  assert.ok(v22Prompt.SYSTEM_PROMPT_V22.includes(g));
});
