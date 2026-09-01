// FS-7 ECHELON-1 — chatTurn_v17's PURE battery: no DB, no model and no network.
//
// This is deliberately smaller than P6-1's v16 battery. v17 declares no wire kind and adds no
// promotion arm; its contract is a registry repoint, three tools, one appended prompt paragraph,
// and identity-with-v16 part/intent behaviour. Source reads below are comment-stripped whenever
// they prove an executable binding, so the substantial frozen headers cannot make a missing
// import or call look present.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/part-shapes.mjs";

const { register } = await import("tsx/esm/api");
register();

const registry = await import("../workflows/registry.ts");
const v16Module = await import("../workflows/chatTurn.v16.ts");
const v17Module = await import("../workflows/chatTurn.v17.ts");
const prompt16 = await import("../workflows/chatTurn.v16.prompt.ts");
const prompt17 = await import("../workflows/chatTurn.v17.prompt.ts");
const tools15 = await import("../workflows/chatTurn.v15.tools.ts");
const tools17 = await import("../workflows/chatTurn.v17.tools.ts");
const usage16 = await import("../workflows/chatTurn.v16.usage.ts");
const usage17 = await import("../workflows/chatTurn.v17.usage.ts");
const impl17 = await import("../workflows/chatTurn.v17.impl.ts");

const ENTRY_PATH = fileURLToPath(new URL("../workflows/chatTurn.v17.ts", import.meta.url));
const TOOLS_PATH = fileURLToPath(new URL("../workflows/chatTurn.v17.tools.ts", import.meta.url));
const PROMPT_PATH = fileURLToPath(new URL("../workflows/chatTurn.v17.prompt.ts", import.meta.url));
const IMPL_PATH = fileURLToPath(new URL("../workflows/chatTurn.v17.impl.ts", import.meta.url));
const USAGE_PATH = fileURLToPath(new URL("../workflows/chatTurn.v17.usage.ts", import.meta.url));

const ENTRY_SRC = await readFile(ENTRY_PATH, "utf8");
const TOOLS_SRC = await readFile(TOOLS_PATH, "utf8");
const PROMPT_SRC = await readFile(PROMPT_PATH, "utf8");
const IMPL_SRC = await readFile(IMPL_PATH, "utf8");
const USAGE_SRC = await readFile(USAGE_PATH, "utf8");

const FAKE_CTX = {
  firmId: "00000000-0000-4000-8000-000000000001",
  clientId: "00000000-0000-4000-8000-000000000002",
  createdBy: "00000000-0000-4000-8000-000000000003",
  taskId: "00000000-0000-4000-8000-000000000004",
};

test("fs7.v17.registry: chatTurn is pinned to v17 while v16 remains its own exported body", () => {
  assert.equal(registry.workflows.chatTurn.name, "chatTurn_v17");
  assert.equal(registry.workflows.chatTurn, v17Module.chatTurn_v17, "the pin IS v17's module function");
  assert.equal(registry.chatTurn_v16, v16Module.chatTurn_v16, "policy (c): v16 remains reachable by identity");
  assert.notEqual(registry.workflows.chatTurn, v16Module.chatTurn_v16, "the live pin actually moved");
});

test("fs7.v17.registry.policy-c: every chatTurn body v1..v17 remains reachable by export", async () => {
  for (let n = 1; n <= 17; n += 1) {
    const name = `chatTurn_v${n}`;
    const mod = await import(`../workflows/chatTurn.v${n}.ts`);
    assert.equal(typeof registry[name], "function", `registry exports ${name}`);
    assert.equal(registry[name], mod[name], `${name} is its module's own function`);
  }
});

test("fs7.v17.tools: the carried v15 set gains exactly the ruled three report tools", () => {
  const base = Object.keys(tools15.buildToolsV15(FAKE_CTX, "gpt-test", 0)).sort();
  const current = Object.keys(tools17.buildToolsV17(FAKE_CTX, "gpt-test", 0)).sort();
  const added = current.filter((name) => !base.includes(name));
  assert.deepEqual(added, [...tools17.REPORT_CHAT_TOOLS].sort());
  assert.deepEqual(added, ["assess_report_claim", "open_report_run", "seal_report_dataset"]);
  assert.ok(!current.includes("evaluate_report_pack"), "wake_evaluate_report_pack is deliberately not a chat tool");
  assert.equal(new Set(current).size, current.length, "no carried tool was shadowed or duplicated");
});

test("fs7.v17.tools.no-client: open_report_run refuses before minting when the session has no client pin", async () => {
  const out = await tools17.runOpenReportRun(
    { ...FAKE_CTX, clientId: null },
    {
      report_spec_version_id: FAKE_CTX.firmId,
      books_snapshot_id: FAKE_CTX.clientId,
      reporting_period_id: FAKE_CTX.createdBy,
      rationale: "prepare the client's requested management accounts",
    },
    "gpt-test",
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "CLR03");
  assert.equal(out.reason, "report_run_needs_client_pin");
});

test("fs7.v17.prompt: v16's prompt is an exact prefix and the new guidance tells the truth about ids and rendering", () => {
  assert.ok(prompt17.SYSTEM_PROMPT_V17.startsWith(`${prompt16.SYSTEM_PROMPT_V16}\n\n`));
  assert.equal(prompt17.SYSTEM_PROMPT_V17.slice(0, prompt16.SYSTEM_PROMPT_V16.length), prompt16.SYSTEM_PROMPT_V16);
  assert.match(prompt17.REPORT_CHAT_GUIDANCE, /OPEN, ASSESS, THEN SEAL/);
  assert.match(prompt17.REPORT_CHAT_GUIDANCE, /render was queued|enqueues the render/i);
  assert.match(prompt17.REPORT_CHAT_GUIDANCE, /not built/i);
  assert.match(prompt17.REPORT_CHAT_GUIDANCE, /ask the human/i);
});

test("fs7.v17.parts: promotion and intent behaviour are identical to v16 on representative content", () => {
  const content = [
    { type: "text", text: "I found the report context." },
    {
      type: "tool-result",
      toolCallId: "t-read",
      toolName: "read_books_freeform",
      output: { ok: true, read: { ok: true, outcome: "ok", read_id: 31 } },
    },
    {
      type: "tool-result",
      toolCallId: "t-refusal",
      toolName: "post_journal_entry",
      output: { ok: false, refusal: { type: "refusal", code: "CLR11", reason: "stale", message: "Refresh." } },
    },
  ];
  assert.deepEqual(prompt17.toTypedParts_v17(content), prompt16.toTypedParts_v16(content));

  const reportOnly = [{ type: "tool-call", toolCallId: "t-report", toolName: "open_report_run", input: {} }];
  const acting = [{ type: "tool-call", toolCallId: "t-draft", toolName: "draft_journal_entry", input: {} }];
  assert.equal(prompt17.hasCodingIntent_v17(reportOnly), prompt16.hasCodingIntent_v16(reportOnly));
  assert.equal(prompt17.hasCodingIntent_v17(reportOnly), false, "report lifecycle work is not a C-19 book act");
  assert.equal(prompt17.hasCodingIntent_v17(acting), prompt16.hasCodingIntent_v16(acting));
  assert.equal(prompt17.hasCodingIntent_v17(acting), true, "control: the classifier is not a constant false stub");
});

test("fs7.v17.freeze: every new closure file is marked frozen and binds only its own version seams", () => {
  for (const [label, source] of [
    ["entry", ENTRY_SRC],
    ["tools", TOOLS_SRC],
    ["prompt", PROMPT_SRC],
    ["impl", IMPL_SRC],
    ["usage", USAGE_SRC],
  ]) {
    assert.match(source, /^\/\/ @frozen\r?\n/, `${label} is freeze-registered source`);
  }
  assert.match(stripComments(IMPL_SRC), /buildToolsV17\(ctx, model, segment\)/);
  assert.match(stripComments(IMPL_SRC), /toTypedParts_v17\(content\)/);
  assert.match(stripComments(IMPL_SRC), /hasCodingIntent_v17\(content\)/);
  assert.match(stripComments(ENTRY_SRC), /runModelSegmentStepV17/);
  assert.ok(!stripComments(PROMPT_SRC).includes('type: "report_agent"'), "no report receipt part is constructed");
  assert.ok(!stripComments(TOOLS_SRC).includes("wake_evaluate_report_pack"), "the excluded wrapper occurs only in comments");
});

test("fs7.v17.stamp: the chat stamp moves while carried recorder identities do not", () => {
  assert.equal(usage17.chatEngineId("gpt-5.6-terra"), "llm-openai:gpt-5.6-terra:chatturn-v17");
  assert.notEqual(usage17.chatEngineId("gpt-5.6-terra"), usage16.chatEngineId("gpt-5.6-terra"));
  assert.equal(usage17.recordChatUsage, usage16.recordChatUsage);
  assert.equal(usage17.recordFreeformUsage, usage16.recordFreeformUsage);
  assert.equal(usage17.freeformEngineId, usage16.freeformEngineId);
  assert.equal(impl17.CHAT_STEP_BUDGET, 8);
  assert.ok(!stripComments(USAGE_SRC).includes("record_agent_usage_event"), "the recorder SQL was not copied");
});
