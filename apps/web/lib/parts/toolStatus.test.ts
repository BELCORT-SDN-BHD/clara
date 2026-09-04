// C6 — the tool_call outcome resolver. Every cell drives a DISCRIMINATING difference:
// the assertion is false before the arm it names exists.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ClaraPart } from "./types";
import { resolveToolStatuses, toolStatusTone } from "./toolStatus";

const call = (id: string, tool = "trial_balance"): ClaraPart => ({ type: "tool_call", tool, tool_call_id: id, input: {} });
const result = (id: string, tool = "trial_balance"): ClaraPart => ({ type: "tool_result", tool, tool_call_id: id, output: {} });
const failure = (id: string, tool = "trial_balance"): ClaraPart => ({ type: "tool_error", tool, tool_call_id: id, error: "boom" });

describe("resolveToolStatuses", () => {
  it("reads DONE and FAILED from the sibling the emitter wrote, and tells them apart", () => {
    const map = resolveToolStatuses([call("a"), result("a"), call("b"), failure("b")]);
    assert.equal(map.get("a"), "done");
    assert.equal(map.get("b"), "failed");
    // The whole defect this closes: before the resolver these two rendered the SAME
    // grey chip, so a tool that failed looked exactly like one that succeeded.
    assert.notEqual(map.get("a"), map.get("b"));
  });

  it("falls to UNRESOLVED when the transcript records no outcome — absence is not evidence", () => {
    const map = resolveToolStatuses([call("a")]);
    assert.equal(map.get("a"), "unresolved");
    // And it is NOT reported as done: a missing sibling must never read as success.
    assert.notEqual(map.get("a"), "done");
  });

  it("a recorded ERROR wins over a result for the same call — the fail-closed reading", () => {
    // The emitter produces one or the other per call, so this pair should never occur.
    // If a malformed or future payload carries both, painting a success chip over a
    // recorded error is the expensive mistake, so the error wins in BOTH orders.
    assert.equal(resolveToolStatuses([call("a"), result("a"), failure("a")]).get("a"), "failed");
    assert.equal(resolveToolStatuses([call("a"), failure("a"), result("a")]).get("a"), "failed");
  });

  it("never invents a status for a call that is not in this message", () => {
    // A resolver part whose call lives in some other row must not mint an entry: a
    // status with no chip to attach to is a fact about nothing.
    const map = resolveToolStatuses([result("orphan"), failure("also-orphan")]);
    assert.equal(map.size, 0);
    assert.equal(map.get("orphan"), undefined);
  });

  it("keys STRICTLY by tool_call_id, never by tool name", () => {
    // Spelling is not identity: two calls to the SAME tool are two different acts, and
    // one's failure must not label the other's chip.
    const map = resolveToolStatuses([call("first"), call("second"), result("first"), failure("second")]);
    assert.equal(map.get("first"), "done");
    assert.equal(map.get("second"), "failed");
  });

  it("drops a blank call id rather than grouping every blank one together", () => {
    const map = resolveToolStatuses([call(""), result("")]);
    assert.equal(map.size, 0, "a call with no id can never be matched to an outcome");
  });

  it("ignores parts that are neither a call nor a resolver", () => {
    const map = resolveToolStatuses([{ type: "text", text: "hello" }, call("a"), result("a")]);
    assert.deepEqual([...map.entries()], [["a", "done"]]);
  });
});

describe("toolStatusTone", () => {
  it("maps each outcome to a distinct tone, and leaves UNRESOLVED neutral", () => {
    assert.equal(toolStatusTone("failed"), "error");
    assert.equal(toolStatusTone("done"), "info");
    // An absence of evidence is not a warning about the tool, so it must not shout.
    assert.equal(toolStatusTone("unresolved"), "neutral");
    assert.equal(new Set(["done", "failed", "unresolved"].map((s) => toolStatusTone(s as never))).size, 3);
  });
});
