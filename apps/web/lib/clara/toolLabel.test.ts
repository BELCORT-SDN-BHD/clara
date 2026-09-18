// #642 UI-32 — the gate that keeps the tool-label list and `messages/en.json` from
// drifting apart, and the one that keeps the FALLBACK honest.
//
// UI-32 was fixed once and reopened the moment the tool chip came back
// (`PartRenderer.tsx` printed `part.tool` verbatim). A list of labels in a JSON file is
// exactly the kind of thing that rots silently: the next frozen `chatTurn` body adds a
// tool, nobody adds a label, and the transcript starts printing implementation tokens
// again with every suite green. This file is the instrument that would go red instead.

import assert from "node:assert/strict";
import { test } from "node:test";

import messages from "../../messages/en.json";
import { CHAT_TOOL_TOKENS, chatToolLabel, isChatToolToken } from "./toolLabel";

const LABELS = (messages as { Clara: { thread: { tools: Record<string, string> } } }).Clara.thread.tools;

test("UI-32 — every tool token this build knows has a HUMAN label, and every label has a token", () => {
  const missing = CHAT_TOOL_TOKENS.filter((token) => typeof LABELS[token] !== "string" || LABELS[token].length === 0);
  assert.deepEqual(missing, [], "a tool with no label prints its raw token to the reader");
  const orphans = Object.keys(LABELS).filter((key) => !isChatToolToken(key)).sort();
  assert.deepEqual(orphans, [], "a label with no tool is copy nobody can ever see");
});

test("UI-32 — no label is the token wearing a costume", () => {
  // A prettified token (`start accrual work`) reads like a label while still being the
  // implementation's own word, which is precisely what UI-32 forbids. The check is
  // mechanical: a label must not be the token with its underscores swapped for spaces.
  const jargon = CHAT_TOOL_TOKENS.filter((token) => (LABELS[token] ?? "").toLowerCase() === token.replace(/_/g, " "));
  assert.deepEqual(jargon, [], "these labels are the raw token with the underscores taken out");
  const withUnderscores = CHAT_TOOL_TOKENS.filter((token) => (LABELS[token] ?? "").includes("_"));
  assert.deepEqual(withUnderscores, [], "a label carrying an underscore is still an identifier");
});

test("UI-32 — the FALLBACK is the runtime's own word, for a tool this build has never heard of", () => {
  // A newer frozen body may ship a tool this surface does not know. Showing the runtime's
  // token is honest; inventing a friendly name for a step this build cannot describe is
  // not, and neither is a blank chip, which would hide that a step happened at all.
  const t = (key: string) => {
    const name = key.replace(/^tools\./, "");
    const label = LABELS[name];
    if (label === undefined) throw new Error(`MISSING_MESSAGE: Clara.thread.${key}`);
    return label;
  };
  assert.equal(chatToolLabel("trial_balance", t), "Reading the trial balance");
  assert.equal(chatToolLabel("a_tool_from_the_future", t), "a_tool_from_the_future");
  assert.equal(isChatToolToken("a_tool_from_the_future"), false);
});

test("UI-32 — the token list is the MEASURED one, not a hand-walked union", () => {
  // Measured by CALLING `buildToolsV20(...)` on this rig rather than by reading the files
  // (v20 composes v19 composes v18; a hand-walked union missed several). This cell pins
  // the count and three tokens that only appear in the composed map, so a future
  // regeneration that silently shrinks the list is visible.
  assert.equal(CHAT_TOOL_TOKENS.length, 37);
  for (const token of ["start_accrual_work", "start_staff_expense_claim_work", "remember_client_information", "trial_balance", "clarify"]) {
    assert.ok(isChatToolToken(token), `${token} must be in the measured tool map`);
  }
  assert.equal(new Set(CHAT_TOOL_TOKENS).size, CHAT_TOOL_TOKENS.length, "no duplicates");
});
