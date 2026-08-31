// F-A3 PR-3 (OQ-6, chatTurn_v14) -- registry + export sanity. No live model call, no DB: pure
// import/shape assertions.
//
// Proves: v13 stays exported and IS the same function the registry used to point `chatTurn:` at
// (no parked run stranded, ARCHITECTURE Appendix A policy (c)); the registry now repoints
// `chatTurn:` to chatTurn_v14; and v14's tool set is v13's own tool set UNION the thirteen bank
// tools -- no v13 tool dropped, renamed, or shadowed by this closure.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const registry = await import("../workflows/registry.ts");
const v13Module = await import("../workflows/chatTurn.v13.ts");
const v14Module = await import("../workflows/chatTurn.v14.ts");
const v13Tools = await import("../workflows/chatTurn.v13.tools.ts");
const v14Tools = await import("../workflows/chatTurn.v14.tools.ts");

const FAKE_CTX = { firmId: "00000000-0000-0000-0000-000000000001", clientId: "00000000-0000-0000-0000-000000000002", createdBy: "00000000-0000-0000-0000-000000000003", taskId: "00000000-0000-0000-0000-000000000004" };

test("v13 stays exported and frozen -- no parked run is stranded by the v14 repoint", () => {
  assert.equal(typeof registry.chatTurn_v13, "function", "registry re-exports chatTurn_v13");
  assert.equal(typeof v13Module.chatTurn_v13, "function", "chatTurn.v13.ts still exports chatTurn_v13");
  assert.equal(registry.chatTurn_v13, v13Module.chatTurn_v13, "the registry's chatTurn_v13 export IS chatTurn.v13.ts's own function, not a stand-in");
});

// F-A6 PR-2 moved the pin v14 -> v15 (the audited freeform read). This cell's SUBJECT is
// unchanged — v14 is still exported and still IS its own function — but the "is the pin"
// half becomes a policy (c) half, and the pin assertion moves. EXTENDED, never deleted:
// deleting it would silently drop the guarantee that v14's parked runs stay reachable.
// P6-1 (Q8's four-card wire bump) moved the pin again, v15 -> v16. The SUBJECT is still
// unchanged — v14 is exported and still IS its own function — and the pin assertion moves once
// more. EXTENDED, never deleted, for the reason stated above: deleting it would silently drop
// the guarantee that v14's parked runs stay reachable.
test("chatTurn_v14 stays exported and IS its own function; the registry now pins v16 (policy (c))", () => {
  assert.equal(typeof registry.chatTurn_v14, "function", "registry re-exports chatTurn_v14");
  assert.equal(registry.chatTurn_v14, v14Module.chatTurn_v14, "the registry's chatTurn_v14 export IS chatTurn.v14.ts's own function");
  assert.equal(registry.workflows.chatTurn.name, "chatTurn_v16", "P6-1 repointed chatTurn: past F-A6 PR-2's v15, which was already past this file's own v14 pin");
  assert.notEqual(registry.workflows.chatTurn, registry.chatTurn_v13, "the registry no longer points chatTurn: at v13");
  assert.notEqual(registry.workflows.chatTurn, registry.chatTurn_v14, "...nor at v14");
  assert.notEqual(registry.workflows.chatTurn, registry.chatTurn_v15, "...nor at v15");
});

test("buildToolsV14's tool set is v13's tools UNION the thirteen bank tools -- no v13 tool dropped", () => {
  const v13ToolNames = Object.keys(v13Tools.buildToolsV13(FAKE_CTX, "gpt-test"));
  const v14ToolNames = Object.keys(v14Tools.buildToolsV14(FAKE_CTX, "gpt-test", 0));
  for (const name of v13ToolNames) {
    assert.ok(v14ToolNames.includes(name), `v14's tool set is missing v13's own tool '${name}'`);
  }
  const bankToolNames = [
    "get_bank_pack", "add_bank_account", "upsert_bank_coa_account", "match_bank_line",
    "settle_from_bank_line", "unmatch_bank_match", "complete_bank_reconciliation",
    "void_bank_reconciliation", "resolve_bank_line_exception", "propose_bank_line_exception",
    "void_bank_statement", "propose_bank_identifier_promotion", "resolve_and_book_bank_line",
  ];
  assert.equal(bankToolNames.length, 13, "this cell's own list must name all 13 bank tools");
  assert.equal(new Set(bankToolNames).size, 13, "the 13 bank tool names are pairwise distinct");
  for (const name of bankToolNames) {
    assert.ok(v14ToolNames.includes(name), `v14's tool set is missing the bank tool '${name}'`);
  }
  assert.equal(v14ToolNames.length, new Set(v14ToolNames).size, "v14's tool set carries no duplicate name (a v13 tool never collides with a bank tool)");
});
