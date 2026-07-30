// Wave A2 — the rule-post consumer (lib/rule-post.mjs), PURE (mocked client). Proves the
// login-direct role dance around execute_rule_post, the (entry,seq) op-key idempotency that
// stands in for `rulepost:<entry>:<revision>` (a re-delivery dedupes; a fresh draft
// re-attempts), and that the group role is ALWAYS restored (even on a raise).

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRulePostEffects, RULE_POST_CONSUMER, RULE_POST_EVENT_TYPE } from "../lib/rule-post.mjs";
import { narrowTypedStatus } from "../lib/receipts.mjs";

function recordingClient(onExecute = () => ({ posted: true })) {
  const queries = [];
  return {
    queries,
    query(sql, params) {
      queries.push({ sql: sql.trim(), params });
      if (/execute_rule_post/.test(sql)) return Promise.resolve({ rows: [{ result: onExecute(params) }] });
      return Promise.resolve({ rows: [{}] });
    },
  };
}

test("the effect makes the login-direct dance: reset role → execute_rule_post → set role clara_runtime", async () => {
  const client = recordingClient();
  const result = await applyRulePostEffects(client, { entryId: "entry-1", seq: 42 });
  const sqls = client.queries.map((q) => q.sql);
  assert.equal(sqls[0], "reset role");
  assert.match(sqls[1], /execute_rule_post/);
  assert.equal(sqls[sqls.length - 1], "set role clara_runtime");
  assert.deepEqual(result, { posted: true });
});

test("the op-key is rulepost:<entry>:<seq> — stable per (entry, draft event)", async () => {
  const client = recordingClient();
  await applyRulePostEffects(client, { entryId: "entry-9", seq: 100 });
  const exec = client.queries.find((q) => /execute_rule_post/.test(q.sql));
  assert.equal(exec.params[0], "entry-9");
  assert.equal(exec.params[1], "rulepost:entry-9:100");
});

test("idempotency: same (entry, seq) → same op-key; a fresh draft (new seq) → a new op-key", async () => {
  const keyFor = async (entryId, seq) => {
    const client = recordingClient();
    await applyRulePostEffects(client, { entryId, seq });
    return client.queries.find((q) => /execute_rule_post/.test(q.sql)).params[1];
  };
  assert.equal(await keyFor("e", 5), await keyFor("e", 5), "a re-delivery dedupes on the same op-key");
  assert.notEqual(await keyFor("e", 5), await keyFor("e", 6), "a new draft revision re-attempts");
});

test("the group role is restored even when execute_rule_post raises", async () => {
  const client = recordingClient(() => {
    throw new Error("CLR-something");
  });
  await assert.rejects(applyRulePostEffects(client, { entryId: "e", seq: 1 }), /CLR-something/);
  assert.equal(client.queries[client.queries.length - 1].sql, "set role clara_runtime", "finally restored the group role");
});

// In a real aborted transaction every statement — including SET ROLE — raises 25P02. The
// effect's ORIGINAL error must reach the dead-letter reason; the role-restore failure is
// swallowed (the caller re-sets the role after rollback).
test("an aborted-transaction SET ROLE failure does not mask the effect's original error", async () => {
  const client = {
    queries: [],
    query(sql, params) {
      client.queries.push({ sql: sql.trim(), params });
      if (/execute_rule_post/.test(sql)) return Promise.reject(new Error("CLR-original-reason"));
      if (/^set role/.test(sql.trim())) return Promise.reject(new Error("current transaction is aborted (25P02)"));
      return Promise.resolve({ rows: [{}] });
    },
  };
  await assert.rejects(applyRulePostEffects(client, { entryId: "e", seq: 2 }), /CLR-original-reason/);
});

test("with NO effect error in flight, a role-restore failure still surfaces (never a silent login-identity checkpoint)", async () => {
  const client = {
    queries: [],
    query(sql) {
      client.queries.push({ sql: sql.trim() });
      if (/execute_rule_post/.test(sql)) return Promise.resolve({ rows: [{ result: { posted: true } }] });
      if (/^set role/.test(sql.trim())) return Promise.reject(new Error("role restore failed"));
      return Promise.resolve({ rows: [{}] });
    },
  };
  await assert.rejects(applyRulePostEffects(client, { entryId: "e", seq: 3 }), /role restore failed/);
});

test("consumer identity constants are pinned", () => {
  assert.equal(RULE_POST_CONSUMER, "rule_post");
  assert.equal(RULE_POST_EVENT_TYPE, "entry.drafted");
});

// --- Typed-receipt hardening (Deliverable 5) -----------------------------------------
// execute_rule_post returns {status:'posted'} on a post and {status:'skipped', reason:...}
// for a benign non-post (the draft stays for human review — visibility-as-safety). The
// consumer must narrow a skip to a NON-success and NEVER retry it into a post.

test("applyRulePostEffects returns the execute_rule_post receipt VERBATIM (a skip is not swallowed)", async () => {
  const client = recordingClient(() => ({ entry_id: "e", status: "skipped", reason: "polarity_unverified" }));
  const receipt = await applyRulePostEffects(client, { entryId: "e", seq: 7 });
  assert.deepEqual(receipt, { entry_id: "e", status: "skipped", reason: "polarity_unverified" });
});

test("narrowTypedStatus: a 'posted' receipt narrows to success (logged as before)", () => {
  assert.deepEqual(narrowTypedStatus({ entry_id: "e", status: "posted", rule_id: "r" }), { status: "ok" });
});

test("narrowTypedStatus: a 'skipped' receipt passes through {status, reason} (never narrows to success)", () => {
  assert.deepEqual(narrowTypedStatus({ status: "skipped", reason: "direction_unproven" }), { status: "skipped", reason: "direction_unproven" });
  assert.deepEqual(narrowTypedStatus({ status: "skipped", reason: "customer_unresolved" }), { status: "skipped", reason: "customer_unresolved" });
});

test("narrowTypedStatus: a 'refused' bounded-write receipt passes through (the mandated propose/sign law)", () => {
  assert.deepEqual(narrowTypedStatus({ status: "refused", reason: "bounds_exceeded" }), { status: "refused", reason: "bounds_exceeded" });
});

test("narrowTypedStatus: a refused/skipped receipt with no string reason falls back to the status", () => {
  assert.deepEqual(narrowTypedStatus({ status: "skipped" }), { status: "skipped", reason: "skipped" });
  assert.deepEqual(narrowTypedStatus({ status: "refused", reason: 42 }), { status: "refused", reason: "refused" });
});

test("narrowTypedStatus: a legacy object receipt (no typed status) is success-shaped", () => {
  assert.deepEqual(narrowTypedStatus({ posted: true }), { status: "ok" });
  assert.deepEqual(narrowTypedStatus({ entry_id: "e", rule_id: "r" }), { status: "ok" });
});

test("narrowTypedStatus: an ABSENT receipt (null/undefined/non-object) is {status:'absent'} — never success", () => {
  // The future propose_autopost_rule / sign_autopost_rule callers must not read a missing
  // receipt as a posted write; 'absent' is a distinct non-ok status so it can't slip through.
  assert.deepEqual(narrowTypedStatus(null), { status: "absent", reason: "no_receipt" });
  assert.deepEqual(narrowTypedStatus(undefined), { status: "absent", reason: "no_receipt" });
  assert.deepEqual(narrowTypedStatus("posted"), { status: "absent", reason: "no_receipt" });
  assert.deepEqual(narrowTypedStatus(42), { status: "absent", reason: "no_receipt" });
});
