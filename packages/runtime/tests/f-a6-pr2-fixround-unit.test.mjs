// F-A6 PR-2 — THE FIX ROUND'S PURE CELLS (cross-model review, 2026-08-29). No DB, no network,
// no model. Each is RED against the cut it was written for; the live halves are in the sibling
// DB file.
//
//   HIGH  f-a6.pr2.h4.env-fails-closed  — the timeout is CLAMPED: a bad value can never emit
//                                         `= 0`, NaN or a negative, and never a bound at or
//                                         under the verb's own in-loop deadline
//   MED   f-a6.pr2.prompt.tier-d-honest — the model-facing audit promise is TRUE
//   LOW   parts.*                        — no new part kind; a refusal reaches the transcript
//
// NOT HERE, DELIBERATELY: metering. An earlier round of this review asked for an atomic
// enqueue keyed by `read_id`; the independent pass refuted it — the never-refuse shape is law-76
// compliance inherited from chatTurn_v13/v14, and a keyed projection is an F-A9 LEDGER redesign
// outside PR-2's scope. The metering cells therefore stay in the sibling unit file, asserting
// the inherited shape rather than a new one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

process.env.RELAY_TEST_MODE ??= "1";

const { register } = await import("tsx/esm/api");
register();

const ff = await import("../lib/freeform-read.mjs");
const tool = await import("../workflows/chatTurn.v15.freeform.ts");
const prompt = await import("../workflows/chatTurn.v15.prompt.ts");

const TASK = "00000000-0000-0000-0000-000000000004";
const OK_ARGS = { secret: "s3cret", sql: "select 1 as x", purpose: "why", taskId: TASK, opKey: "freeform:t:0:1" };

function recordingPool() {
  const calls = [];
  const client = {
    on() {},
    removeListener() {},
    release() {},
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ result: { ok: true, outcome: "ok" } }], rowCount: 1 };
    },
  };
  return { pool: { connect: async () => client }, calls };
}

// =============================================================================================
// HIGH · H-4 must not be removable by configuration.
//
// The first cut read the env with `Number(raw || default)`, which accepts ANY numeric string.
// `CLARA_FREEFORM_STATEMENT_TIMEOUT_MS=0` is the one value that means UNLIMITED in PostgreSQL:
// one character in a secret would have emitted `set statement_timeout = 0` and silently deleted
// the only wall that bounds a stalled FETCH — with every other cell still green, because every
// other cell asserts the statement it expects rather than the number inside it.
//
// The fix CLAMPS rather than refuses: the wall stays up either way, and taking the whole world
// down over a mistyped tuning knob (the assert runs before Nitro) would be the worse failure.
// There is NO upper limit by design — an operator may legitimately RAISE the backstop.
// =============================================================================================

test("f-a6.pr2.h4.env-fails-closed: a bad value can never emit `= 0`, NaN, or a bound at/under the verb's deadline", async () => {
  const prior = process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
  const bad = [
    ["0", "0 means UNLIMITED in PostgreSQL — the one value that deletes the wall outright"],
    ["-1", "negative"],
    ["5000", "EQUAL to the verb's in-loop deadline: it would fire first and destroy the receipt"],
    ["3.5", "fractional"],
    ["1e999", "Number() reads this as Infinity — not a millisecond count at all"],
    ["not-a-number", "not a number"],
    ["", "an EMPTY secret means 'unset', never 'zero'"],
    ["0x2710", "Number() would read this as 10000; a plain run of digits it is not"],
    ["12000ms", "a unit suffix"],
    ["4999", "below the in-loop deadline"],
    ["2147483648", "one over INT_MAX — PostgreSQL refuses the parameter itself (22023), so this is fail-closed either way; rejecting it here buys the operator the loud warning instead of an opaque per-read SQL error"],
  ];
  try {
    for (const [value, why] of bad) {
      process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = value;
      const ms = ff.freeformStatementTimeoutMs();
      assert.ok(Number.isInteger(ms), `${JSON.stringify(value)} must resolve to an INTEGER — ${why}`);
      assert.ok(Number.isFinite(ms), `${JSON.stringify(value)} must resolve to a FINITE value — ${why}`);
      assert.ok(ms > ff.FREEFORM_VERB_DEADLINE_MS, `${JSON.stringify(value)} must resolve ABOVE the verb's ${ff.FREEFORM_VERB_DEADLINE_MS}ms deadline — ${why}`);
      assert.equal(ms, ff.FREEFORM_STATEMENT_TIMEOUT_DEFAULT_MS, "...by falling back to the default");

      // THE EMITTED SQL is what actually reaches Postgres, so assert on it too — a clamp that
      // returned a good number while the builder used the raw one would pass every check above.
      const setup = ff.freeformSetupSql();
      assert.match(setup, /set statement_timeout = \d+/, `the setup must still arm a timeout for ${JSON.stringify(value)}`);
      assert.ok(!/set statement_timeout = 0\b/.test(setup), `NEVER "= 0" — that is UNLIMITED (${JSON.stringify(value)})`);
      assert.ok(!/set statement_timeout = -/.test(setup), `NEVER negative (${JSON.stringify(value)})`);
      assert.ok(!/NaN|Infinity/.test(setup), `NEVER NaN or Infinity (${JSON.stringify(value)})`);
      const emitted = Number(/set statement_timeout = (\d+)/.exec(setup)[1]);
      assert.ok(emitted > ff.FREEFORM_VERB_DEADLINE_MS, `the EMITTED bound must beat the deadline (${JSON.stringify(value)} -> ${emitted})`);

      // ...and it never reaches a connection carrying a broken session setup.
      const h = recordingPool();
      await ff.withFreeformRead(OK_ARGS, { pool: h.pool });
      assert.ok(!/statement_timeout = 0\b/.test(h.calls[0].sql), `the checkout's own setup is safe too (${JSON.stringify(value)})`);
    }

    // GOOD VALUES PASS THROUGH UNTOUCHED, including ones ABOVE the old cut's proposed ceiling —
    // there is deliberately no upper limit.
    for (const good of ["5001", "12000", "15000", "60000", "600000", "2147483647"]) {
      process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = good;
      assert.equal(ff.freeformStatementTimeoutMs(), Number(good), `${good} is a legitimate operator choice`);
      assert.ok(ff.freeformSetupSql().includes(`set statement_timeout = ${good}`));
    }
    // Surrounding whitespace is trimmed: a secret pasted with a trailing newline is an operator
    // who meant the number, and the floor still decides.
    process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = "  12000\n";
    assert.equal(ff.freeformStatementTimeoutMs(), 12000);
    delete process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
    assert.equal(ff.freeformStatementTimeoutMs(), ff.FREEFORM_STATEMENT_TIMEOUT_DEFAULT_MS, "absent falls back to the default");
  } finally {
    if (prior === undefined) delete process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS;
    else process.env.CLARA_FREEFORM_STATEMENT_TIMEOUT_MS = prior;
  }
});

test("f-a6.pr2.h4.clamp-is-loud: a bad value WARNS, naming the variable, the value and the substitution", () => {
  const said = [];
  assert.equal(ff.clampFreeformStatementTimeout("0", (m) => said.push(m)), ff.FREEFORM_STATEMENT_TIMEOUT_DEFAULT_MS);
  assert.equal(said.length, 1, "a silent fallback is how a misconfiguration survives a deploy");
  assert.match(said[0], /CLARA_FREEFORM_STATEMENT_TIMEOUT_MS/);
  assert.match(said[0], /"0"/, "the value the operator actually set");
  assert.match(said[0], /Using the default 15000ms/, "and what was used instead");
  assert.match(said[0], /no upper limit/, "...and that raising it is allowed, so nobody 'fixes' this by capping");
  const quiet = [];
  assert.equal(ff.clampFreeformStatementTimeout("9000", (m) => quiet.push(m)), 9000);
  assert.equal(quiet.length, 0, "a good value says nothing");
});

// =============================================================================================
// MED · The model-facing audit promise must be TRUE. The first cut said "every read is
// receipted, including the refused ones" — but a read that dies before the database reaches a
// verdict (no authority, a lost connection, the top-level timeout) aborts its transaction and
// leaves NO receipt, as this PR's own live cell measures.
// =============================================================================================

test("f-a6.pr2.prompt.tier-d-honest: no unconditional 'every read', and the durable path for the rest is named", () => {
  const g = prompt.FREEFORM_GUIDANCE;
  assert.ok(!/EVERY READ IS RECEIPTED/.test(g), "the unqualified promise is gone");
  assert.ok(!/every read is receipted/i.test(g), "...in any casing");
  assert.match(g, /EVERY READ THE DATABASE JUDGES IS RECEIPTED/, "the true half is still stated plainly");
  assert.match(g, /INCLUDING THE REFUSED ONES/, "a refusal the database reached COMMITS its receipt");
  assert.match(g, /leaves no receipt/, "the exception is named, not hidden");
  assert.match(g, /durable record/, "...and so is where those reads ARE recorded");
  assert.match(g, /no silent read/, "the guarantee that survives is stated as the guarantee it is");
});

// =============================================================================================
// Parts — no new kind, and a refusal reaches the transcript. (Here rather than in the sibling
// unit file, which sits at the repo's file-size ceiling.)
// =============================================================================================

test("f-a6.pr2.parts.no-new-kind: a SUCCESSFUL read promotes only the tool_call/tool_result pair", () => {
  const content = [
    { type: "tool-call", toolCallId: "c1", toolName: tool.FREEFORM_READ_TOOL, input: { sql: "select 1", purpose: "p" } },
    { type: "tool-result", toolCallId: "c1", toolName: tool.FREEFORM_READ_TOOL, output: { ok: true, read: { ok: true, outcome: "ok", read_id: 3, rows: [] } } },
  ];
  const parts = prompt.toTypedParts_v15(content);
  assert.deepEqual(parts.map((p) => p.type), ["tool_call", "tool_result"], "PART_CATALOG is untouched — freeform_result is P6's later wire bump");
});

test("f-a6.pr2.parts.refusal: a refused read DOES reach the transcript, deduped on code+reason+message", () => {
  const refusal = tool.freeformRefusal("result_row_cap");
  const one = { type: "tool-result", toolCallId: "c1", toolName: tool.FREEFORM_READ_TOOL, output: { ok: false, refusal } };
  const two = { type: "tool-result", toolCallId: "c2", toolName: tool.FREEFORM_READ_TOOL, output: { ok: false, refusal } };
  const parts = prompt.toTypedParts_v15([one, two]);
  assert.equal(parts.filter((p) => p.type === "refusal").length, 1, "two identical refusals collapse to one transcript entry");
  assert.equal(parts.filter((p) => p.type === "tool_result").length, 2, "both calls still show as tool results");
});

test("f-a6.pr2.parts.not-acting-intent: a freeform read is NOT coding intent (C-19 is about acts, not reads)", () => {
  assert.equal(prompt.hasCodingIntent_v15([{ type: "tool-call", toolCallId: "c1", toolName: tool.FREEFORM_READ_TOOL, input: {} }]), false);
});

// =============================================================================================
// S-1's BUNDLE CLAIM, STATED ACCURATELY. An earlier PR body said "the built bundle contains
// neither name". MEASURED, that is FALSE and the honest claim is narrower and still sufficient:
// no `clara._freeform_*` CALL SITE reaches the bundle, and the bare names survive only inside a
// PRESERVED JSDOC. A cell holds the accurate wording so the over-claim cannot come back.
// Skipped, never silently passed, when `.output/` has not been built in this checkout.
// =============================================================================================

const BUNDLE = fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url));
const bundleBuilt = await stat(BUNDLE).then(() => true).catch(() => false);

test("f-a6.pr2.bundle.s1-call-sites: no clara._freeform_* CALL SITE is in the bundle; the names survive only in a comment", { skip: bundleBuilt ? false : "no .output/ — run pnpm --filter @clara/runtime build" }, async () => {
  const src = await readFile(BUNDLE, "utf8");
  // The behaviour that must be present.
  assert.ok(src.includes("read_books_freeform"), "the tool name reaches the bundle, or the model could never call it");
  assert.ok(src.includes("chatTurn_v15"), "the workflow export reaches the bundle");
  assert.ok(src.includes("workflows/chatTurn.v15//chatTurn_v15"), "the WDK registered the workflow directive (path//export)");
  assert.ok(src.includes("workflows/chatTurn.v15.impl//runModelSegmentStepV15"), "...and the step directive — the half a swallowed directive would drop");
  assert.ok(src.includes("clara.wake_freeform_read"), "the ONE verb the wrapper calls");

  // S-1, accurately: a SCHEMA-QUALIFIED call to either granted writer is what a call site looks
  // like, and there is none.
  assert.ok(!src.includes("clara._freeform_arm"), "no qualified call site for the arm");
  assert.ok(!src.includes("clara._freeform_settle"), "no qualified call site for the settle");

  // ...and the bare names DO survive, in a comment. Asserted rather than denied, because the
  // denial was the over-claim: a reader grepping the bundle will find them and must not conclude
  // the wall leaked.
  const bare = src.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => l.includes("_freeform_arm") || l.includes("_freeform_settle"));
  assert.ok(bare.length > 0, "positive control: the census CAN see these names — so the qualified-absence above is a real read, not a broken grep");
  for (const [line, text] of bare) {
    assert.ok(/^\s*\*/.test(text) || text.trimStart().startsWith("//"), `bundle line ${line} names a writer OUTSIDE a comment: ${text.trim().slice(0, 120)}`);
  }
});
