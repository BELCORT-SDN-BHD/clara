// Wave A2 — the rule-post consumer (lib/rule-post.mjs), PURE (mocked client). Proves the
// login-direct role dance around execute_rule_post, the (entry,seq) op-key idempotency that
// stands in for `rulepost:<entry>:<revision>` (a re-delivery dedupes; a fresh draft
// re-attempts), and that the group role is ALWAYS restored (even on a raise).

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRulePostEffects, RULE_POST_CONSUMER, RULE_POST_EVENT_TYPE } from "../lib/rule-post.mjs";

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

test("consumer identity constants are pinned", () => {
  assert.equal(RULE_POST_CONSUMER, "rule_post");
  assert.equal(RULE_POST_EVENT_TYPE, "entry.drafted");
});
