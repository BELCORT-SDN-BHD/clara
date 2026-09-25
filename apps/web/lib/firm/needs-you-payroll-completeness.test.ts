// #1048 (0343_payroll_completeness_witness.sql, riders sweep wave lane 04) — the SEVENTEENTH
// review-queue row kind, `payroll_completeness_question`, and the five places a kind has to land
// in before a professional can see it and act on it.
//
// THE SEAM: the four lib/component-side registries the DB row passes through on its way to the
// inbox — `REVIEW_QUEUE_ROW_KINDS` / `isKnownReviewQueueRowKind` (the closed world every label
// lookup is gated on), `messages/en.json`'s `NeedsYou.rowKind` / `NeedsYou.openTab` (what a person
// reads), `needsYouRowHref` / `hasOwningTab` (where the row opens) and `getNeedsYouAffordance`
// (what it can act on inline) — plus the door call itself. The DB half is proven against a real
// queue read in `packages/db/tests/payroll-completeness-witness.test.mjs` (W7 drives the parked
// row, W8/W9 the two answers); this file is about the web side's own closed registries, which are
// hand-written and would otherwise silently drop a kind the database ships.
//
// WHY A SEPARATE FILE rather than more cells in `needs-you.test.ts` and `needs-you-links.test.ts`:
// several lanes edit `lib/firm/needs-you.ts` in this wave, and every hunk one of them adds to a
// shared TEST file is a conflict the integrator resolves by hand. The kind's own cells live in the
// kind's own file; the shared files gain only the one-line registry additions they must. (#946's
// `needs-you-payroll-posting.test.ts` set this shape; this is that shape.)

import assert from "node:assert/strict";
import { test } from "node:test";

import { REVIEW_QUEUE_ROW_KINDS, isKnownReviewQueueRowKind } from "./needs-you";
import { hasOwningTab, needsYouRowHref } from "./needs-you-links";
import { answerPayrollCompleteness } from "./payroll-completeness";
import { getNeedsYouAffordance } from "@/components/firm/needs-you-affordances";
import messages from "../../messages/en.json" with { type: "json" };
import type { SessionTokenAccessor } from "@/lib/session";

const CLIENT = "44444444-4444-4444-8444-444444444444";
const DOCUMENT = "55555555-5555-4555-8555-555555555555";
const KIND = "payroll_completeness_question";

test("#1048: the parked-question row kind is inside the closed world the label lookup is gated on", () => {
  assert.ok(
    (REVIEW_QUEUE_ROW_KINDS as readonly string[]).includes(KIND),
    "a kind the database emits but this array does not carry renders with no label and no affordance",
  );
  assert.equal(isKnownReviewQueueRowKind(KIND), true);
  // The world is still CLOSED: adding one kind admits exactly one.
  assert.equal(isKnownReviewQueueRowKind("payroll_completeness"), false);
  assert.equal(isKnownReviewQueueRowKind("payroll_completeness_questions"), false);
  // …and it is the SEVENTEENTH, which is the number the migration's own postcheck asserts the
  // database projects. Two hand rosters that happen to agree is exactly what pin (1) is for, so
  // the count is asserted rather than assumed (lib/firm/needs-you.ts's own extension note).
  assert.equal(REVIEW_QUEUE_ROW_KINDS.length, 17);
});

test("#1048: it carries a real label and a real openTab phrase, never a raw key path", () => {
  const m = messages as unknown as {
    NeedsYou: { rowKind: Record<string, string>; openTab: Record<string, string> };
  };
  assert.equal(typeof m.NeedsYou.rowKind[KIND], "string");
  assert.ok((m.NeedsYou.rowKind[KIND] ?? "").length > 0);
  assert.match(
    m.NeedsYou.rowKind[KIND]!,
    /payroll/i,
    "the label names what the row is about — a professional reads it before anything else on the row",
  );
  assert.match(
    m.NeedsYou.rowKind[KIND]!,
    /\?/,
    "…and it reads as a QUESTION, because that is what this row is, unlike every other payroll kind",
  );
  assert.equal(typeof m.NeedsYou.openTab[KIND], "string");
  assert.ok((m.NeedsYou.openTab[KIND] ?? "").length > 0);
});

test("#1048: the affordance's own five strings exist, and the yes copy says a run will be posted", () => {
  const n = (messages as unknown as { NeedsYou: Record<string, unknown> }).NeedsYou;
  for (const key of [
    "payrollCompletenessYes",
    "payrollCompletenessNo",
    "payrollCompletenessConfirmYes",
    "payrollCompletenessConfirmNo",
    "payrollCompletenessNotePlaceholder",
  ]) {
    assert.equal(typeof n[key], "string", `${key} is missing from messages/en.json`);
    assert.ok((n[key] as string).length > 0, `${key} is empty`);
  }
  // An act that books a journal entry must not read like a checkbox: the confirmation says what
  // pressing it does, before it is pressed.
  assert.match(n.payrollCompletenessConfirmYes as string, /post/i);
  assert.match(n.payrollCompletenessConfirmNo as string, /[Nn]othing will be posted/);
  // The note is OFFERED, not demanded (the standing "a gate prompts, never disables" ruling).
  assert.match(n.payrollCompletenessNotePlaceholder as string, /optional/i);
});

test("#1048: it opens the documents tab — where the payslip a person must check before answering is", () => {
  // The ACT is on the row itself, so the link is not where the question is answered: it is where a
  // person goes to CHECK the page before answering it, which is the payslip on the documents tab.
  assert.equal(needsYouRowHref({ row_kind: KIND, client_id: CLIENT }), `/clients/${CLIENT}/documents`);
  assert.equal(hasOwningTab({ row_kind: KIND }), true);
  // A row with no client has nowhere honest to go, exactly like every other kind.
  assert.equal(needsYouRowHref({ row_kind: KIND, client_id: null }), null);
});

test("#1048: it renders an INLINE act — the one payroll kind that does, because the question is the row", () => {
  const A = getNeedsYouAffordance(KIND);
  assert.equal(typeof A, "function", "a parked question with no affordance is a question nobody can answer");
  // …and the four payroll/rent kinds beside it still render none: each of those is cleared
  // somewhere else, and this cell is what keeps that distinction from eroding into "payroll rows
  // have buttons now".
  for (const other of [
    "payroll_posting_blocked",
    "payroll_net_pay_unsettled",
    "rent_payable_unsettled",
    "rent_escalation_pending",
  ]) {
    assert.equal(getNeedsYouAffordance(other), null, `${other} must stay link-only`);
  }
});

test("#1048: answerPayrollCompleteness POSTs the door's four arguments, trims the note, and mints a fresh op_key", async () => {
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };
  const realFetch = globalThis.fetch;
  const realUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ answer: "yes", posted: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  try {
    await answerPayrollCompleteness(session, DOCUMENT, "yes", "  checked against the EPF submission  ");
    await answerPayrollCompleteness(session, DOCUMENT, "no", "   ");
    await answerPayrollCompleteness(session, DOCUMENT, "no");
  } finally {
    globalThis.fetch = realFetch;
    if (realUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = realUrl;
  }

  assert.equal(seen.length, 3);
  for (const call of seen) {
    assert.match(call.url, /\/rpc\/answer_payroll_completeness$/, "the door is named once, here");
    assert.equal(call.body.p_document, DOCUMENT);
    assert.equal(typeof call.body.p_op_key, "string");
    assert.ok((call.body.p_op_key as string).length > 0);
  }
  assert.equal(seen[0]!.body.p_answer, "yes");
  assert.equal(
    seen[0]!.body.p_note,
    "checked against the EPF submission",
    "the note is trimmed, so a stray space is not stored as evidence",
  );
  assert.equal(seen[1]!.body.p_answer, "no");
  assert.equal(seen[1]!.body.p_note, null, "a whitespace-only note is NULL, not an empty string");
  assert.equal(seen[2]!.body.p_note, null, "…and an omitted note is NULL too");
  assert.notEqual(
    seen[0]!.body.p_op_key,
    seen[1]!.body.p_op_key,
    "a FRESH op key per call: reusing one would make the second answer a replay of the first",
  );
});
