// #839 — THE RESTATE GATE, under test.
//
// `offersRestateFor` is the PURE decision `WorkQuestionPanel` and `WorkCards.tsx`'s
// `WorkQuestionCard` both apply before mounting `RestateWorkPanel` beside the shared question
// form. It is exported and tested directly because the surrounding render path needs a REAL
// Supabase browser session (`getSessionIdentity()`, `work-cards.test.tsx`'s own header names this
// exact limitation) that this harness has no seam for — so the render branch itself cannot be
// driven to "shows restate" here, but the DECISION that branch depends on has no such dependency
// and is proven directly.

import assert from "node:assert/strict";
import { test } from "node:test";

import { offersRestateFor } from "./work-question-panel";
import type { WorkQuestionRecord } from "../../lib/work/questions";

const BASIS = { posting_date: "2026-09-01", memo: "rent", currency: "MYR", lines: [] };

function record(over: Partial<WorkQuestionRecord> = {}): WorkQuestionRecord {
  return {
    question_id: "q-1",
    work_id: "w-1",
    client_id: "c-1",
    task_id: "t-1",
    firm_id: "f-1",
    question_version: 1,
    status: "pending",
    question: "Which date?",
    context: null,
    reason: null,
    fields: [],
    source_ref: null,
    basis_digest: "d",
    expires_at: "2026-09-15T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    answer: null,
    answered_by: null,
    answered_at: null,
    answered_role: null,
    delivery_state: "pending",
    delivery_attempts: 0,
    work_status: "awaiting_input",
    work_basis_digest: "d",
    basis: BASIS,
    ...over,
  };
}

test("839 offers restate when the caller asked, the Work is awaiting_input and a basis is present", () => {
  assert.equal(offersRestateFor(record(), true), true);
});

test("839 the caller must opt in — B3's own separate RestateWorkPanel mount means the default is OFF", () => {
  assert.equal(offersRestateFor(record(), false), false,
    "839 the Work detail passes no offerRestate at all; this panel must not double it");
});

test("839 no basis, no offer — a pre-0265 database or an unreadable record renders nothing", () => {
  assert.equal(offersRestateFor(record({ basis: null }), true), false);
  assert.equal(offersRestateFor(record({ basis: undefined }), true), false);
});

test("839 gated on the WORK's status, not the question's own — matching work-detail.tsx's placement", () => {
  // The question round can be answered/converged/cancelled while the WORK itself is no longer
  // awaiting_input at all (the run moved on) — or, the reverse a fresh re-ask produces: a NEW
  // pending question on a Work that is still awaiting_input. Either way the gate reads work_status.
  assert.equal(offersRestateFor(record({ work_status: "running" }), true), false,
    "839 the Work moved on; restating an instruction the run is no longer waiting on makes no sense");
  assert.equal(offersRestateFor(record({ work_status: "completed" }), true), false);
  assert.equal(offersRestateFor(record({ status: "answered", work_status: "awaiting_input" }), true), true,
    "839 THIS question round settled, but the Work is still parked (a re-ask can follow) — still offered");
});

test("839 a null or absent record never crashes the gate", () => {
  assert.equal(offersRestateFor(null, true), false);
  assert.equal(offersRestateFor(undefined, true), false);
});

// #885 (third fix round, recheck finding L09-RC2-03) — A CONTROL THAT CAN ONLY BE REFUSED IS NOT
// AN AFFORDANCE. `clara.restate_accounting_work` refuses a Work holding a committed receipt
// (CLR13 `not_restatable`: it reads as completed), so offering Restate there is the same defect
// L09-ADV-06 was fixed under one rank down. The record says so directly (`work_posted`).
test("885 offersRestateFor withholds the control on a Work that has already posted", () => {
  const parked = {
    work_status: "awaiting_input",
    basis: { posting_date: "2026-09-01", memo: "rent", currency: "MYR", lines: [] },
  } as never;
  assert.equal(offersRestateFor(parked, true), true, "the ordinary parked Work still offers it");
  assert.equal(offersRestateFor({ ...(parked as object), work_posted: true } as never, true), false,
    "…and a Work that has already posted does not: the door would refuse");
  assert.equal(offersRestateFor({ ...(parked as object), work_posted: false } as never, true), true,
    "…while an explicit false is the ordinary case");
});
