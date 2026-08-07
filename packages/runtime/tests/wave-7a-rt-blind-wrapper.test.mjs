// §7-A THE UNATTENDED SALES DRAFTER — CONTRACT-BLIND unit tests (PR #203 test lane,
// test-7a-rt-blind). Drives runDraftJournalEntry (autoDraft.v6.tools.ts) with a
// STUBBED globalThis.__claraPools (no DB, no network) and asserts on the CAPTURED SQL
// parameters actually sent toward the writer — never on the wrapper's own source.
// Mirrors wave-a2-chatturn-v4-sales.test.mjs's stub-pool convention (the family's own
// established idiom for this exact kind of test).
//
// skeleton §2a — "THE COUNTERPARTY CONTRACT (rewritten — v1 had this backwards). Live
// precedence [was] coalesce(explicit proposal kind, derive-from-coding_kind). Explicit
// **wins**. So the failure mode is not omission, it is **contradiction**. ... 1. Tool
// derives `kind` from `coding_kind`; the model never chooses it independently."
//
// Also covers §2d / 7A-R1 §3's settle_autodraft_task 6-arity overload — see the
// documented LIMITATION below for what this DB-less unit lane can and cannot prove
// about that call.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const toolsMod = await import("../workflows/autoDraft.v6.tools.ts");
const implMod = await import("../workflows/autoDraft.v6.impl.ts");
const { runDraftJournalEntry } = toolsMod;
const { settleAutoDraftStep } = implMod;

function stubPools() {
  const captured = { writeSql: null, writeParams: null };
  const readClient = {
    query: async (sql) => {
      if (/document_filings/.test(sql)) return { rows: [{ sha256: "sha-abc", filing_id: "fil-1", resolution_id: "res-1" }], rowCount: 1 };
      if (/get_context_pack/.test(sql)) return { rows: [{ pack: { books_version: 7 } }], rowCount: 1 };
      if (/get_document_extract/.test(sql)) return { rows: [{ x: null }], rowCount: 1 };
      // Any other read (e.g. a credential-mint query issued via withRuntime) gets a
      // permissive non-empty row — the mocked withReadWakeScoped/withWriteWakeScoped below
      // ignore whatever secret it carries, so its exact shape does not matter; an EMPTY
      // rows array is the one shape that is never safe to return here.
      return { rows: [{ credential_id: "cred", secret: "s3cr3t" }], rowCount: 1 };
    },
  };
  const writeClient = {
    query: async (sql, params) => {
      captured.writeSql = sql;
      captured.writeParams = params;
      return { rows: [{ receipt: { entry_id: "entry-9", revision_token: "rev-9" } }], rowCount: 1 };
    },
  };
  globalThis.__claraPools = {
    mintWakeCredentialObo: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
    mintWakeCredential: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
    withReadWakeScoped: async (_secret, fn) => fn(readClient),
    withWriteWakeScoped: async (_secret, fn) => fn(writeClient),
    withRuntime: async (fn) => fn(readClient),
  };
  return captured;
}

const ctx = { firmId: "f1", clientId: "c1", documentId: "11111111-1111-4111-8111-111111111111", filingId: "fil-1", taskId: "t1" };

function salesInput(overrides = {}) {
  return {
    coding_kind: "sales_invoice",
    posting_date: "2025-04-30",
    lines: [
      { account_code: "300-000", debit_cents: 20797415, credit_cents: 0 },
      { account_code: "500-000", debit_cents: 0, credit_cents: 20797415 },
    ],
    document_id: ctx.documentId,
    counterparty: { new: { name: "D & DREAM PROPERTIES SDN BHD" } },
    evidence: [{ region_id: "22222222-2222-4222-8222-222222222222", quote: "207,974.15" }],
    ...overrides,
  };
}

function billInput(overrides = {}) {
  return {
    coding_kind: "supplier_bill",
    posting_date: "2025-04-30",
    lines: [
      { account_code: "610-000", debit_cents: 1000, credit_cents: 0 },
      { account_code: "400-000", debit_cents: 0, credit_cents: 1000 },
    ],
    document_id: ctx.documentId,
    counterparty: { new: { name: "ACME SUPPLIES SDN BHD" } },
    evidence: [{ region_id: "22222222-2222-4222-8222-222222222222", quote: "10.00" }],
    ...overrides,
  };
}

// ===========================================================================
// The DERIVED counterparty kind reaches the DB — omitted, agreeing, AND
// contradicting model-supplied kinds all converge on the SAME derived value.
// ===========================================================================

test("wrapper sends DERIVED kind=customer for sales_invoice when the model OMITTED counterparty.kind", async () => {
  const captured = stubPools();
  const r = await runDraftJournalEntry(ctx, salesInput());
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  assert.match(captured.writeSql, /wake_draft_entry/, "the write call must reach the draft-entry writer");
  const cp = JSON.parse(captured.writeParams[10]);
  assert.equal(cp.kind, "customer", "the tool must derive+send kind=customer for sales_invoice when the model omitted it");
});

test("wrapper sends DERIVED kind=customer for sales_invoice when the model supplied an AGREEING kind", async () => {
  const captured = stubPools();
  const r = await runDraftJournalEntry(ctx, salesInput({ counterparty: { kind: "customer", new: { name: "D & DREAM PROPERTIES SDN BHD" } } }));
  assert.equal(r.ok, true);
  const cp = JSON.parse(captured.writeParams[10]);
  assert.equal(cp.kind, "customer");
});

test("wrapper OVERWRITES a CONTRADICTING model-supplied kind with the coding_kind-derived value — the model never chooses kind, even when it disagrees (skeleton §2a layer 1; the zod schema layer is tested separately and would normally catch this earlier, but the WRAPPER itself must not trust an explicit kind either)", async () => {
  const captured = stubPools();
  const bad = salesInput({ counterparty: { kind: "vendor", new: { name: "CONTRADICTING CORP" } } });
  const r = await runDraftJournalEntry(ctx, bad);
  assert.equal(r.ok, true, `expected ok, got ${JSON.stringify(r)}`);
  const cp = JSON.parse(captured.writeParams[10]);
  assert.equal(
    cp.kind,
    "customer",
    "the tool must derive kind from coding_kind and discard a contradicting model-supplied kind, never forward it verbatim",
  );
});

test("wrapper sends DERIVED kind=vendor for supplier_bill", async () => {
  const captured = stubPools();
  const r = await runDraftJournalEntry(ctx, billInput());
  assert.equal(r.ok, true);
  const cp = JSON.parse(captured.writeParams[10]);
  assert.equal(cp.kind, "vendor");
});

test("coding_kind itself reaches the DB call as its own positional parameter, unchanged", async () => {
  const captured = stubPools();
  await runDraftJournalEntry(ctx, salesInput());
  assert.equal(captured.writeParams[13], "sales_invoice");
});

// ===========================================================================
// skeleton §2d / 7A-R1 §3 — settle_autodraft_task's 6-arity overload, 6th argument
// the WORKFLOW's own engine run id (getWorkflowMetadata().workflowRunId), REQUIRED,
// sourced fresh inside the step.
//
// LIMITATION — recorded, not routed around by reading autoDraft.v6.impl.ts's step
// body. settleAutoDraftStep calls getWorkflowMetadata() internally (per the contract
// and skeleton §2d themselves, which this lane IS allowed to read). Empirically
// confirmed below: getWorkflowMetadata() throws "`getWorkflowMetadata()` can only be
// called inside a workflow or step function" when invoked outside a real WDK
// workflow/step execution — the SAME WDK-ambient constraint this repo's OWN
// ledger-44-autodraft-v4.test.mjs already documents for claimAutoDraftStep /
// runAutoDraftModelStep / autoDraft_v4 ("Both are PURE functions ... unlike
// runAutoDraftModelStep/autoDraft_v4 themselves"). Node 20.19 (pinned by this repo's
// package.json engines field, confirmed via `node --version` in this worktree) has no
// node:test `mock.module` (added in Node 22+), and no existing test in this repo
// shims the "workflow" package. So the contract's specific positional claim — SIX
// parameters, the 6th POSITIONALLY the workflow-run id rather than the admission-time
// sweep uuid — CANNOT be asserted as a blind, DB-less unit test in this harness. That
// assurance currently rests on a DB/integration test lane (needs a live DB, out of
// scope here) and code review, not on this unit-test surface. This is reported as an
// absence, per the lane's own law.
// ===========================================================================

test("settleAutoDraftStep is exported with FIVE declared JS parameters (taskId, outcome, tokens, entryId, refusal) — the workflow run id is not a caller-supplied argument, consistent with skeleton §2d's 'sourced fresh inside the step' design", () => {
  assert.equal(settleAutoDraftStep.length, 5);
});

test("settleAutoDraftStep genuinely depends on WDK-ambient getWorkflowMetadata() (throws outside a real workflow/step context) rather than silently settling without ever sourcing a run id — see the LIMITATION note above for what this does and does not prove", async () => {
  globalThis.__claraPools = { withRuntime: async (fn) => fn({ query: async () => ({ rows: [{}], rowCount: 1 }) }) };
  await assert.rejects(
    () => settleAutoDraftStep("task-1", "drafted", 100, "entry-1", null),
    /can only be called inside a workflow or step function/,
    "a silent success here would mean the step never actually sources a run id at all",
  );
});
