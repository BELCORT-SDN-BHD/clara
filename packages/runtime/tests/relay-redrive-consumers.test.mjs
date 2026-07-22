// Finding 4 — the redrive CLI (scripts/relay.mjs) must know EVERY registered spine consumer,
// not just the matcher map, or `redrive sst_watch|facts_gate|rule_post <event>` is rejected as
// an unknown consumer and /ready warns about dead-letters no operator can clear. This pins the
// merged dispatch map + each entry's identity (the connection its redrive needs), PURE — it
// reconstructs the exact spread scripts/relay.mjs performs (importing the script itself would
// run its main()). If a new consumer module is added, relay.mjs must spread it too — this test
// is the reminder.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSUMERS as MATCHER } from "../lib/matcher.mjs";
import { CONSUMERS as RULE_POST } from "../lib/rule-post.mjs";
import { CONSUMERS as SST_WATCH } from "../lib/sst-watch.mjs";
import { CONSUMERS as FACTS_GATE } from "../lib/facts-gate.mjs";

const MERGED = { ...MATCHER, ...RULE_POST, ...SST_WATCH, ...FACTS_GATE };

// The redrive connection each consumer's effect needs:
//   runtime-login — the writer's EXECUTE lives on the login shell (matcher, rule_post)
//   runtime-role  — a plain clara_runtime GROUP call (router, sst_watch, facts_gate)
const EXPECTED_IDENTITY = Object.freeze({
  router: "runtime-role",
  matcher: "runtime-login",
  rule_post: "runtime-login",
  sst_watch: "runtime-role",
  facts_gate: "runtime-role",
});

test("the merged redrive map covers every registered consumer (no consumer is unreachable from the CLI)", () => {
  assert.deepEqual(Object.keys(MERGED).sort(), Object.keys(EXPECTED_IDENTITY).sort());
});

test("each consumer carries the identity its redrive connection needs (login vs role)", () => {
  for (const [name, identity] of Object.entries(EXPECTED_IDENTITY)) {
    assert.ok(MERGED[name], `consumer '${name}' is registered`);
    assert.equal(MERGED[name].identity, identity, `consumer '${name}' identity`);
  }
});

test("each consumer exposes a callable redrive seam (the CLI dispatch target)", () => {
  for (const name of Object.keys(EXPECTED_IDENTITY)) {
    assert.equal(typeof MERGED[name].redrive, "function", `consumer '${name}' has a redrive fn`);
  }
});

test("later spreads never clobber an earlier consumer (the four maps have disjoint keys)", () => {
  const keys = [...Object.keys(MATCHER), ...Object.keys(RULE_POST), ...Object.keys(SST_WATCH), ...Object.keys(FACTS_GATE)];
  assert.equal(keys.length, new Set(keys).size, "no key collision across the consumer modules");
});
