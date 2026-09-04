// statementFacts_v3 — H-05: A FAILED PERSIST SETTLES ITS OWN TASK. Unit only: a scripted pg
// client over a fake task row, no DB, no network, no key.
//
// THE DEFECT THIS FILE PINS. statementFacts_v2 wrapped only its two READ channels in
// `withStatementTerminalSettle`; the persist issued a bare `callWriter`
// (statementFacts.v2.behavior.mjs:354-358) and `persistStatementWitnessPairStep`
// (statementFacts.v2.impl.ts:134-142) had neither a try/catch nor the rethrow shaping. So every
// verdict `clara.persist_statement_facts_v2` RAISES rolled its transaction back and left
// `document_processing_tasks.status = 'running'` forever — no card, no failure event, no refund,
// and nothing in `beltErrors` to see. Only the two account-binding verdicts escaped, because
// 0098:756-793 RETURNS them and settles the task itself inside the same transaction.
//
// EVIDENCE LAW 2 THROUGHOUT: "the task was settled" is asserted as a POSITIVE READ of a task row
// this harness owns and the settle door actually mutated — status AND error_code — never as the
// absence of an exception, and never off the query log alone. The v2 CONTRAST cell at the bottom
// is the discriminating half: the same fixture through the OLD body must leave the row
// `running`, which is what makes every assertion above it evidence about v3's wrapper rather
// than about the harness.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  classifyStatementWitnessFailure,
  persistStatementWitnessPair,
  statementPersistFailureCode,
} from "../workflows/statementFacts.v3.behavior.mjs";
import { persistStatementWitnessPair as persistV2 } from "../workflows/statementFacts.v2.behavior.mjs";

const { register } = await import("tsx/esm/api");
register();
const implV3 = await import("../workflows/statementFacts.v3.impl.ts");

/** The taxonomy `clara.fail_statement_facts` passes through verbatim (0038:2063-2071). */
const SETTLE_CODES = new Set([
  "engine_error", "timeout", "engine_lost", "storage_error", "corrupt", "encrypted",
  "bad_type", "limit", "budget", "attempt_cap", "internal",
  "header_unreadable", "totals_unreadable", "readers_disagree", "chain_broken",
  "continuity_mismatch", "duplicate_period", "overlapping_period", "non_myr_statement",
  "account_unregistered", "account_inactive", "statement_multi_client", "period_invalid",
  "line_date_out_of_period", "consent_inactive",
]);

/** A raised plpgsql exception exactly as node-postgres surfaces it: `code` is the SQLSTATE and
 *  the diagnosis is in `detail`. Getting this shape right is the whole point — a harness that
 *  put the reason in `.code` would prove nothing, because that is the field v2 already read. */
function dbVerdict(reason, message = `statement verdict ${reason}`) {
  return Object.assign(new Error(message), {
    code: "CLR10",
    detail: JSON.stringify({ reason }),
    severity: "ERROR",
  });
}

/**
 * A scripted client over ONE task row that the settle door really mutates. Refuses any query it
 * was not scripted for — an unscripted query is a behaviour these cells did not intend and must
 * be loud, never silently `{rows:[]}`.
 */
function harness({ persistFails = null } = {}) {
  const task = { id: randomUUID(), status: "running", error_code: null };
  const log = [];
  const client = {
    async query(sql, params) {
      log.push({ sql: String(sql), params });
      const text = String(sql);
      if (text.includes("clara.persist_statement_facts_v2")) {
        if (persistFails) throw persistFails;
        return { rows: [{ receipt: { task_id: task.id, status: "done", statement_id: randomUUID() } }] };
      }
      if (text.includes("clara.fail_statement_facts")) {
        // The real verb's own contract (0038:2052-2073): replay when already failed, CLR16 when
        // the task is not running, otherwise clamp an unknown reason to engine_error and settle.
        if (task.status === "failed") {
          return { rows: [{ receipt: { task_id: task.id, status: "failed", reason: task.error_code, replayed: true } }] };
        }
        if (task.status !== "running") {
          throw Object.assign(new Error("statement-facts task is not running"), { code: "CLR16" });
        }
        const raw = String(params?.[1] ?? "");
        task.error_code = SETTLE_CODES.has(raw) ? raw : "engine_error";
        task.status = "failed";
        return { rows: [{ receipt: { task_id: task.id, status: "failed", reason: task.error_code } }] };
      }
      throw new Error(`harness: unscripted query — ${text.slice(0, 120)}`);
    },
  };
  return {
    task,
    log,
    withRuntime: (fn) => fn(client),
    persistCalls: () => log.filter((q) => q.sql.includes("persist_statement_facts_v2")).length,
    settleCalls: () => log.filter((q) => q.sql.includes("fail_statement_facts")),
  };
}

const SERVICES = Object.freeze({ log: () => {} });

/** A reader blob whose header is fully readable and already carries a roster CODE, so that only
 *  the behaviour under test can be the reason a cell fails. */
function reads(overrides = {}) {
  const header = {
    institution_code: "MBB", account_number: "5140 1234 5678", currency: "MYR",
    period_start: "2025-06-01", period_end: "2025-06-30", statement_date: "2025-06-30",
    opening_cents: 100000, closing_cents: 150000, opening_label: "BEGINNING BALANCE",
    closing_label: "ENDING BALANCE", total_debit_cents: 0, total_credit_cents: 50000,
    ...(overrides.header ?? {}),
  };
  return {
    textRead: { header, lines: [], usage: {}, engineId: "llm-openai:m:stmt-witness-v1", pages_used: 2, ...(overrides.textRead ?? {}) },
    visionRead: { header: { ...header, ...(overrides.visionHeader ?? {}) }, lines: [], usage: {}, engineId: "llm-openai:m:stmt-witness-v1" },
  };
}

// ---------------------------------------------------------------------------
// The settle, one cell per raised verdict
// ---------------------------------------------------------------------------

const RAISED_VERDICTS = [
  "header_unreadable", "totals_unreadable", "readers_disagree", "chain_broken",
  "continuity_mismatch", "duplicate_period", "overlapping_period", "non_myr_statement",
  "period_invalid", "line_date_out_of_period", "statement_multi_client",
];

for (const reason of RAISED_VERDICTS) {
  test(`settle: a persist that RAISES ${reason} settles the task 'failed' with that exact reason`, async () => {
    const h = harness({ persistFails: dbVerdict(reason) });
    const { textRead, visionRead } = reads();
    await assert.rejects(persistStatementWitnessPair(SERVICES, h.withRuntime, h.task.id, textRead, visionRead));

    // THE POSITIVE READ: the row this harness owns, mutated by the settle door itself.
    assert.equal(h.task.status, "failed", "v2 left this row 'running' forever");
    assert.equal(h.task.error_code, reason,
      "the DB's own DETAIL token must survive to fail_statement_facts — err.code is the SQLSTATE 'CLR10'");
    const settles = h.settleCalls();
    assert.equal(settles.length, 1, "exactly one settle, never a retry storm of them");
    assert.deepEqual(settles[0].params, [h.task.id, reason]);
  });
}

test("settle: the reason mapper reads the DB's DETAIL, not the SQLSTATE — the defect behind the clamp", () => {
  // Asked of the real mapper (evidence law 3). Had this returned `internal`, every cell above
  // would still have settled the task — and every one of them would have settled it with a code
  // that told the firm nothing.
  assert.equal(statementPersistFailureCode(dbVerdict("chain_broken")), "chain_broken");
  assert.equal(statementPersistFailureCode(Object.assign(new Error("x"), { code: "CLR10" })), "internal",
    "a CLR10 with no readable detail falls through to internal rather than inventing a verdict");
  assert.equal(statementPersistFailureCode(Object.assign(new Error("x"), { code: "CLR10", detail: "not json" })), "internal");
  assert.equal(statementPersistFailureCode(Object.assign(new Error("x"), { code: "CLR10", detail: '{"reason":"made_up"}' })), "internal",
    "a reason outside the ratified taxonomy is ignored, never forwarded");
  assert.equal(statementPersistFailureCode(Object.assign(new Error("x"), { code: "header_unreadable" })), "header_unreadable",
    "a locally-raised refusal still keeps its own code");
});

// ---------------------------------------------------------------------------
// MUST NOT RED — a transient fault is not a verdict about the document
// ---------------------------------------------------------------------------

test("transient: a dropped connection on the persist does NOT settle — it retries", async () => {
  // The control that makes the whole file honest. A wrapper that settled everything would pass
  // every cell above and would terminally fail a perfectly good statement the first time the
  // pooler blinked.
  for (const code of ["08006", "08003", "57P01", "40P01", "ECONNRESET"]) {
    const h = harness({ persistFails: Object.assign(new Error(`transient ${code}`), { code }) });
    const { textRead, visionRead } = reads();
    await assert.rejects(
      persistStatementWitnessPair(SERVICES, h.withRuntime, h.task.id, textRead, visionRead),
      (err) => {
        assert.equal(err.claraRetry, true, `${code} must be retryable`);
        assert.deepEqual(classifyStatementWitnessFailure(err), { retry: true, code: "engine_error" });
        return true;
      },
    );
    assert.equal(h.task.status, "running", `${code} must leave the task claimable`);
    assert.deepEqual(h.settleCalls(), [], `${code} must issue no settle at all`);
  }
});

test("transient: the ratified RETRYABLE codes still mean retry on the persist arm", async () => {
  const h = harness({ persistFails: Object.assign(new Error("storage"), { code: "storage_error" }) });
  const { textRead, visionRead } = reads();
  await assert.rejects(persistStatementWitnessPair(SERVICES, h.withRuntime, h.task.id, textRead, visionRead));
  assert.equal(h.task.status, "running");
  assert.deepEqual(h.settleCalls(), []);
});

// ---------------------------------------------------------------------------
// H-03 / H-02 through the persist payload
// ---------------------------------------------------------------------------

test("institution: an unresolvable printed name refuses BEFORE the persist and settles header_unreadable", async () => {
  const h = harness();
  const { textRead, visionRead } = reads({ header: { institution_code: "BANK RAKYAT" } });
  await assert.rejects(
    persistStatementWitnessPair(SERVICES, h.withRuntime, h.task.id, textRead, visionRead),
    (err) => {
      assert.equal(err.code, "header_unreadable");
      assert.equal(err.statementWitnessRefusal, true);
      assert.match(err.message, /BANK RAKYAT/, "the receipt names what the page printed");
      assert.match(err.message, /roster/, "…and that it was the roster that could not place it");
      return true;
    },
  );
  assert.equal(h.persistCalls(), 0, "a document that cannot be identified is never written");
  assert.equal(h.task.status, "failed");
  assert.equal(h.task.error_code, "header_unreadable");
});

test("payload: the writer receives the ROSTER CODE and the DERIVED band, with both bases on the receipt", async () => {
  const h = harness();
  const { textRead, visionRead } = reads({
    header: { institution_code: "ALLIANCE BANK", period_start: null, period_end: null, statement_date: "2025-06-30" },
    visionHeader: { institution_code: "Alliance Bank Malaysia Berhad" },
  });
  const out = await persistStatementWitnessPair(SERVICES, h.withRuntime, h.task.id, textRead, visionRead);
  assert.equal(out.status, "done");
  assert.equal(h.persistCalls(), 1);
  assert.deepEqual(h.settleCalls(), []);

  const payload = JSON.parse(h.log.find((q) => q.sql.includes("persist_statement_facts_v2")).params[1]);
  assert.equal(payload.readers.reader1.header.institution_code, "ALB");
  assert.equal(payload.readers.reader2.header.institution_code, "ALB",
    "two spellings of the SAME letterhead resolve to one code — the DB's agreement rung sees a match, not a disagreement it cannot explain");
  assert.equal(payload.readers.reader1.header.period_start, "2025-06-01");
  assert.equal(payload.readers.reader1.header.period_end, "2025-06-30");
  assert.equal(payload.corroboration.reader1_header_basis.period_basis, "derived_from_statement_date_month");
  assert.equal(payload.corroboration.reader1_header_basis.institution_printed, "ALLIANCE BANK");
  assert.equal(payload.corroboration.reader2_header_basis.institution_printed, "Alliance Bank Malaysia Berhad");
  assert.equal(payload.corroboration.reader1_header_basis.institution_basis, "roster_name");
  assert.equal("period_basis" in payload.readers.reader1.header, false,
    "the basis rides corroboration; a key on the header would be dropped by _stmt_header_norm and the receipt would be a lie");
});

test("payload: TWO DIFFERENT banks stay two different codes — v3 launders no disagreement", async () => {
  // The negative twin of the cell above. Normalising two spellings of ONE bank to one code is
  // the fix; normalising two DIFFERENT banks to one would silently defeat the DB's own
  // `readers_disagree` rung on institution_code (0038:1506).
  const h = harness();
  const { textRead, visionRead } = reads({
    header: { institution_code: "MAYBANK" },
    visionHeader: { institution_code: "CIMB Bank Berhad" },
  });
  await persistStatementWitnessPair(SERVICES, h.withRuntime, h.task.id, textRead, visionRead);
  const payload = JSON.parse(h.log.find((q) => q.sql.includes("persist_statement_facts_v2")).params[1]);
  assert.equal(payload.readers.reader1.header.institution_code, "MBB");
  assert.equal(payload.readers.reader2.header.institution_code, "CIMB");
});

test("payload: a printed band is relayed untouched and stated as printed", async () => {
  const h = harness();
  const { textRead, visionRead } = reads();
  await persistStatementWitnessPair(SERVICES, h.withRuntime, h.task.id, textRead, visionRead);
  const payload = JSON.parse(h.log.find((q) => q.sql.includes("persist_statement_facts_v2")).params[1]);
  assert.equal(payload.readers.reader1.header.period_start, "2025-06-01");
  assert.equal(payload.corroboration.reader1_header_basis.period_basis, "printed");
  assert.equal(payload.corroboration.method, "witness_pair", "the v2 evidence block is kept, not replaced");
});

// ---------------------------------------------------------------------------
// The STEP — the outer half of the fix
// ---------------------------------------------------------------------------

test("step: killing the persist leaves the task SETTLED, and the engine is told not to retry", async () => {
  const h = harness({ persistFails: dbVerdict("readers_disagree") });
  const { textRead, visionRead } = reads();
  const prevPools = globalThis.__claraPools;
  const prevServices = globalThis.__claraStatementWitnessServices;
  globalThis.__claraPools = { withRuntime: h.withRuntime };
  globalThis.__claraStatementWitnessServices = SERVICES;
  try {
    await assert.rejects(
      implV3.persistStatementWitnessPairStep(h.task.id, textRead, visionRead),
      (err) => {
        assert.equal(err.code, "readers_disagree");
        assert.equal(err.name, "FatalError",
          "a terminal verdict must not be re-bought: v2's step rethrew it bare and the engine retried to the attempt cap");
        return true;
      },
    );
  } finally {
    globalThis.__claraPools = prevPools;
    globalThis.__claraStatementWitnessServices = prevServices;
  }
  assert.equal(h.task.status, "failed", "never left 'running'");
  assert.equal(h.task.error_code, "readers_disagree");
});

test("step: a settle that itself fails does not swallow the verdict the caller was raising", async () => {
  // Defence in depth, stated at statementFacts.v2.dispatch.mjs:225-233 and asserted here: the
  // task was parked between the read and the persist, so `fail_statement_facts` raises CLR16.
  // The original verdict must still reach the engine.
  const h = harness({ persistFails: dbVerdict("chain_broken") });
  h.task.status = "cancelled";
  const { textRead, visionRead } = reads();
  await assert.rejects(
    persistStatementWitnessPair(SERVICES, h.withRuntime, h.task.id, textRead, visionRead),
    (err) => {
      assert.match(String(err.detail ?? ""), /chain_broken/, "the DB's verdict, not the settle's own failure");
      return true;
    },
  );
  assert.equal(h.settleCalls().length, 1, "it TRIED to settle");
  assert.equal(h.task.status, "cancelled", "…and honoured the row it found");
});

// ---------------------------------------------------------------------------
// THE CONTRAST — the same fixture through the v2 body
// ---------------------------------------------------------------------------

test("contrast: statementFacts_v2's persist leaves the SAME failure stranded 'running' — the defect, pinned", async () => {
  // The discriminating half of this file. Without it, every assertion above is equally
  // consistent with "the harness settles tasks by itself". v2 stays frozen and exported, so this
  // cell keeps working for as long as a parked v2 run can exist, and it is the reason the
  // handover called H-05 the cheapest fix and the most expensive omission.
  const h = harness({ persistFails: dbVerdict("chain_broken") });
  const { textRead, visionRead } = reads();
  await assert.rejects(persistV2({ log: () => {} }, h.withRuntime, h.task.id, textRead, visionRead));
  assert.equal(h.task.status, "running", "v2 strands it — this is the behaviour v3 replaces");
  assert.deepEqual(h.settleCalls(), [], "v2 never even asked the settle door");
});
