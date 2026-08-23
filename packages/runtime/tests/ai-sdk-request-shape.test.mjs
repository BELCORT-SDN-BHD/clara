// OUTBOUND REQUEST-SHAPE LOCK for the three AI-SDK call shapes the runtime uses.
//
// WHY THIS EXISTS. `@ai-sdk/openai` 4.0.19 reclassified every `gpt-5.x` id that is not
// `-chat` as a REASONING model *by pattern*, and a reasoning model's request is built
// differently: `system` is remapped to a `developer` role, and `temperature` / `top_p` /
// `max_tokens` are silently DROPPED or renamed. Our model ids all default to
// `gpt-5.6-terra`, so that reclassification lands squarely on every model call Clara
// makes. A silently dropped sampling parameter is not a crash — it is a behaviour change
// that no typecheck, no build and no mock-model test can see, because it happens below
// the SDK's public surface, on the wire.
//
// So this test reads the WIRE. It injects a `fetch` into the provider, runs one call of
// each shape the runtime actually issues, captures the exact HTTP body the SDK would have
// sent, and asserts the properties that must not drift. No network, no key, no DB: the
// injected fetch records and rejects, and `maxRetries: 0` keeps it to a single attempt.
//
// WHAT IS PINNED, and why each line is a real risk rather than a tautology:
//   * endpoint `/v1/responses` — the Responses API is the ONLY OpenAI surface that accepts
//     PDF file parts (witnessFacts.v*.services.mjs); a silent fall back to chat/completions
//     would break the vision channel.
//   * the system prompt arrives as ONE `developer`-role turn carrying our exact text — the
//     4.0.19 remap's visible half. If a future version drops or splits it, the model loses
//     its instructions and nothing else would notice.
//   * NO sampling key is present (`temperature`, `top_p`, `max_tokens`,
//     `max_completion_tokens`, `seed`) — this is the closed-world half of the same story:
//     the runtime passes none today, so if any appears it was injected by the provider,
//     and if the provider ever starts *requiring* one the absence is what we want to see.
//   * a `file` part serialises as `input_file` with an INLINE `data:` base64 URI, never a
//     `file_url` / remote URL — `@ai-sdk/provider-utils` added DNS-rebinding hardening on
//     URL downloads, which can only bite a caller that passes bytes by reference. We pass
//     raw bytes (`data:` Uint8Array) everywhere; this proves it on the wire, not by grep.
//   * the tool surface (`tools[].name` + `tool_choice`) survives — `hasToolCall("clarify")`
//     in the chatTurn `stopWhen` array is meaningless if the tool never reaches the model.
//
// This file is NOT frozen and pins no workflow body: it exercises the SDK boundary with
// its own fixtures. Model id `gpt-5.6-terra` is the literal default of every model call
// site (chatRoutes.ts:18, classify.mjs:40, witnessFacts.v2.services.mjs:52,
// statementFacts.v2.services.mjs:41, wiki-projection.mjs:133).

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateObject, stepCountIs, hasToolCall, tool } from "ai";

// The pinned default of every model call site in the runtime — and, per the 4.0.19
// pattern, a REASONING id (gpt-5.x, not -chat).
const MODEL_ID = "gpt-5.6-terra";
const SYSTEM = "You are Clara. Be precise.";

// Constructed at runtime so no credential-shaped literal sits in source (leak-scan gate).
// It is never sent anywhere: the injected fetch rejects before any socket is opened.
const NOT_A_KEY = "probe-" + randomUUID().replace(/-/g, "");

/** Every sampling/limit key a reasoning-model reclassification is documented to drop,
 *  rename, or start requiring. Absence is asserted POSITIVELY, key by key. */
const SAMPLING_KEYS = ["temperature", "top_p", "topP", "max_tokens", "max_completion_tokens", "maxTokens", "seed"];

class ProbeStop extends Error {}

/** Build a provider whose fetch records the outbound request and refuses to send it. */
function probeProvider() {
  const captured = [];
  const fetchImpl = (url, init) => {
    let body = init?.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // A non-JSON body is itself a finding — keep the raw text for the assertion.
      }
    }
    captured.push({ url: String(url), method: init?.method ?? "GET", body });
    return Promise.reject(new ProbeStop("probe: captured, not sent"));
  };
  return { openai: createOpenAI({ apiKey: NOT_A_KEY, fetch: fetchImpl }), captured };
}

/** The ONE request the shape issued. Fail-closed: zero or many is a finding, not a pass. */
function soleRequest(captured, label) {
  assert.equal(captured.length, 1, `${label}: expected exactly ONE outbound request, captured ${captured.length}`);
  const req = captured[0];
  assert.equal(req.method, "POST", `${label}: expected a POST`);
  assert.equal(
    req.url,
    "https://api.openai.com/v1/responses",
    `${label}: the Responses API is the only OpenAI surface that accepts PDF file parts — this endpoint must not drift`,
  );
  assert.equal(typeof req.body, "object", `${label}: the request body must be JSON the assertions can read`);
  return req.body;
}

/** The system prompt must arrive as one `developer` turn carrying our exact text. */
function assertDeveloperSystemTurn(body, label) {
  assert.ok(Array.isArray(body.input), `${label}: expected an \`input\` array`);
  const systemTurns = body.input.filter((t) => t && (t.role === "developer" || t.role === "system"));
  assert.equal(systemTurns.length, 1, `${label}: expected exactly one system/developer turn, found ${systemTurns.length}`);
  assert.equal(
    systemTurns[0].role,
    "developer",
    `${label}: a gpt-5.x reasoning id must carry the system prompt as role "developer" (the 4.0.19 remap)`,
  );
  assert.equal(systemTurns[0].content, SYSTEM, `${label}: the system text must reach the model verbatim`);
}

/** No sampling parameter may appear — we pass none, so any presence is provider-injected. */
function assertNoSamplingKeys(body, label) {
  for (const k of SAMPLING_KEYS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(body, k),
      false,
      `${label}: "${k}" appeared in the outbound body — the runtime passes no sampling parameter, so this was injected by the provider`,
    );
  }
}

test("shape A — streamText + stopWhen (chatTurn, autoDraft): developer system turn, tools intact, no sampling keys", async () => {
  const { openai, captured } = probeProvider();
  const result = streamText({
    model: openai(MODEL_ID),
    system: SYSTEM,
    messages: [{ role: "user", content: "What is the balance?" }],
    maxRetries: 0,
    tools: {
      clarify: tool({
        description: "Ask the human one question.",
        inputSchema: z.object({ question: z.string(), context: z.string().optional() }),
      }),
    },
    stopWhen: [stepCountIs(8), hasToolCall("clarify")],
  });
  // TRANSPORT-FAILURE SEMANTICS, pinned because the frozen chatTurn/autoDraft model steps
  // are written against exactly this shape: a dead transport does NOT throw out of the
  // `for await` — it arrives as an `error` PART in fullStream — while `content` and
  // `totalUsage` reject with NoOutputGeneratedError (which is what
  // autoDraft.vN.infra.ts's fallback classifier keys on). A future version that started
  // throwing out of the iterator instead would bypass that classifier silently.
  const partTypes = [];
  for await (const part of result.fullStream) partTypes.push(part.type);
  assert.deepEqual(
    partTypes,
    ["start", "error"],
    `shape A: a failed transport must surface as an \`error\` part, not a throw — got ${JSON.stringify(partTypes)}`,
  );
  await assert.rejects(async () => result.content, { name: "AI_NoOutputGeneratedError" });
  await assert.rejects(async () => result.totalUsage, { name: "AI_NoOutputGeneratedError" });

  const body = soleRequest(captured, "shape A");
  assert.equal(body.model, MODEL_ID);
  assert.equal(body.stream, true, "shape A: streamText must request a streamed response");
  assertDeveloperSystemTurn(body, "shape A");
  assertNoSamplingKeys(body, "shape A");
  // hasToolCall("clarify") can only ever fire if the tool reached the model under that name.
  assert.ok(Array.isArray(body.tools), "shape A: expected a `tools` array");
  assert.deepEqual(
    body.tools.map((t) => t.name).sort(),
    ["clarify"],
    "shape A: the clarify tool must reach the model under exactly that name — the chatTurn stopWhen predicate keys on it",
  );
  assert.equal(body.tool_choice, "auto", "shape A: the model must remain free to choose the tool");
});

test("shape B — generateObject over text (classify-llm, witness text channel): json_schema format, no sampling keys", async () => {
  const { openai, captured } = probeProvider();
  await assert.rejects(async () =>
    generateObject({
      model: openai(MODEL_ID),
      schema: z.object({ kind: z.string(), confidence: z.number() }),
      system: SYSTEM,
      prompt: "Classify this document text.",
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30_000),
    }),
  );

  const body = soleRequest(captured, "shape B");
  assert.equal(body.model, MODEL_ID);
  assertDeveloperSystemTurn(body, "shape B");
  assertNoSamplingKeys(body, "shape B");
  assert.equal(body.text?.format?.type, "json_schema", "shape B: structured output must go out as a json_schema format");
  assert.equal(body.text?.format?.strict, true, "shape B: strict mode is what makes the parsed object trustworthy");
  assert.deepEqual(
    Object.keys(body.text.format.schema.properties).sort(),
    ["confidence", "kind"],
    "shape B: the zod-v4 schema must survive conversion with its properties intact",
  );
});

test("shape C — generateObject with a file part (witness/statement vision): inline data: URI, never a remote URL", async () => {
  const { openai, captured } = probeProvider();
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
  await assert.rejects(async () =>
    generateObject({
      model: openai(MODEL_ID),
      schema: z.object({ total: z.string() }),
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Read this invoice." },
            { type: "file", mediaType: "application/pdf", data: pdfBytes, filename: "document.pdf" },
          ],
        },
      ],
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(30_000),
    }),
  );

  const body = soleRequest(captured, "shape C");
  assertDeveloperSystemTurn(body, "shape C");
  assertNoSamplingKeys(body, "shape C");
  const userTurn = body.input.find((t) => t.role === "user");
  assert.ok(userTurn, "shape C: expected a user turn");
  const fileParts = userTurn.content.filter((p) => p.type === "input_file");
  assert.equal(fileParts.length, 1, `shape C: expected exactly one input_file part, found ${fileParts.length}`);
  const [filePart] = fileParts;
  assert.equal(filePart.filename, "document.pdf", "shape C: the filename the provider sees must be the one we set");
  assert.equal(
    typeof filePart.file_data,
    "string",
    "shape C: the bytes must travel INLINE — a by-reference URL is what the provider-utils DNS-rebinding hardening can block",
  );
  assert.ok(
    filePart.file_data.startsWith("data:application/pdf;base64,"),
    `shape C: expected an inline data: URI, got "${String(filePart.file_data).slice(0, 40)}…"`,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(filePart, "file_url"),
    false,
    "shape C: a `file_url` would mean the provider fetches the document itself — the witness lane never permits that",
  );
});
