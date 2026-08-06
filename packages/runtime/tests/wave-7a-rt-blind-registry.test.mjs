// §7-A THE UNATTENDED SALES DRAFTER — CONTRACT-BLIND unit tests (PR #203 test lane,
// test-7a-rt-blind). Drives the exported registry.ts surface and the exported
// SYSTEM_PROMPT_V9/SYSTEM_PROMPT_V8 constants — never any impl.ts orchestration.
//
// registry.ts's own header (Appendix A policy) — "enqueue sites import from HERE so
// they always target the newest version ... keep the old export until zero
// non-terminal runs reference it (never rename/delete an export with in-flight
// runs)". The registry.ts §7-A comment states: "chatTurn v9 carries ONE prompt-only
// reinforcement (severable per skeleton §2f, riding this wave): a sentence appended
// to the supplier-bill paragraph makes explicit that a client-issued document is
// never coded there even if it superficially resembles a bill — it is
// sales_invoice, crediting income".

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const registry = await import("../workflows/registry.ts");
const entryAutoDraftV6 = await import("../workflows/autoDraft.v6.ts");
const entryAutoDraftV5 = await import("../workflows/autoDraft.v5.ts");
const entryChatTurnV9 = await import("../workflows/chatTurn.v9.ts");
const entryChatTurnV8 = await import("../workflows/chatTurn.v8.ts");
const promptV9 = await import("../workflows/chatTurn.v9.prompt.ts");
const promptV8 = await import("../workflows/chatTurn.v8.prompt.ts");

// ===========================================================================
// Registry pin.
// ===========================================================================

test("registry pins autoDraft to the v6 export", () => {
  assert.equal(registry.workflows.autoDraft, entryAutoDraftV6.autoDraft_v6);
});

test("registry pins chatTurn to the v9 export", () => {
  assert.equal(registry.workflows.chatTurn, entryChatTurnV9.chatTurn_v9);
});

test("registry still EXPORTS autoDraft_v5 so no parked v5 run is stranded (Appendix A policy (c))", () => {
  assert.equal(typeof registry.autoDraft_v5, "function");
  assert.equal(registry.autoDraft_v5, entryAutoDraftV5.autoDraft_v5);
});

test("registry still EXPORTS chatTurn_v8 so no parked v8 run is stranded (Appendix A policy (c))", () => {
  assert.equal(typeof registry.chatTurn_v8, "function");
  assert.equal(registry.chatTurn_v8, entryChatTurnV8.chatTurn_v8);
});

test("workflowNames includes both autoDraft and chatTurn class names (the registry keys, not version-qualified)", () => {
  assert.ok(registry.workflowNames.includes("autoDraft"));
  assert.ok(registry.workflowNames.includes("chatTurn"));
});

// ===========================================================================
// chatTurn_v9's ONE behavioural change (skeleton §2f) — the client-issuer
// reinforcement — must be present in v9 and absent from v8.
// ===========================================================================

test("chatTurn_v9's system prompt carries the client-issuer directive: a client-issued document is coded sales_invoice, never supplier_bill, even if it superficially resembles a bill", () => {
  assert.match(
    promptV9.SYSTEM_PROMPT_V9,
    /client-issued document[\s\S]{0,60}NEVER coded[\s\S]{0,160}sales_invoice[\s\S]{0,120}never as a supplier_bill/,
    "SYSTEM_PROMPT_V9 must explicitly direct a client-issued document to sales_invoice, never supplier_bill",
  );
});

test("chatTurn_v8's system prompt does NOT carry the client-issuer directive — proves the reinforcement is genuinely NEW in v9, not carried forward unchanged", () => {
  assert.doesNotMatch(
    promptV8.SYSTEM_PROMPT_V8,
    /client-issued document/i,
    "v8's system prompt must not already carry the client-issuer reinforcement",
  );
});
