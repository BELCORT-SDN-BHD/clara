// #642 AC4 / UI-10 / UI-27 / UI-32 — the live tool chips ON THE REAL TRANSCRIPT, and the
// live-region invariant re-proven after the restructure (cell 14).
//
// `lib/clara/liveTools.test.ts` proves the fold. This file proves the COMPOSITION: that
// the fold is wired to the buffer the stream actually fills, that the chip shows a human
// label rather than the runtime's token (UI-32, which this ticket found LIVE AGAIN at
// `PartRenderer.tsx`), and that adding a self-announcing group beside the transcript did
// not reopen the DS-04 nested-live-region defect the log's whole geometry exists to
// prevent.
//
// THE DRIVER IS THE STORE, not a stubbed component prop: `claraThreadStore
// .applyStreamEvent` is the exact seam `runClaraTaskStream` writes into, so these cells
// exercise the same path a real SSE frame takes.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraThreadView } from "./ClaraThreadView";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { claraThreadStore } from "../../lib/clara/threadStore";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const THREAD = "aaaaaaaa-6422-4422-8422-642264226422";
const CLIENT = "bbbbbbbb-6422-4422-8422-642264226422";
const CALLER = "99999999-9999-4999-8999-999999999999";
const TOKEN = `x.${Buffer.from(JSON.stringify({ sub: CALLER })).toString("base64url")}.y`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function withFetch(run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/messages")) return json({ messages: [] });
    if (url.includes("/rest/v1/")) return json([]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

const view = (): ReactElement =>
  createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(ClaraThreadView, {
      auth: { getAccessToken: async () => TOKEN },
      threadId: THREAD,
      variant: "rail" as const,
      clientId: CLIENT,
      firmName: "Rome Public Advisory",
      clientName: "Milan Trading",
    }),
  }) as ReactElement;

/** Push chunks through the SAME store method `runClaraTaskStream` writes into. */
async function pushChunks(h: { act: (fn: () => void) => Promise<void>; settle: () => Promise<void> }, chunks: unknown[]) {
  await h.act(() => {
    for (const data of chunks) claraThreadStore.applyStreamEvent(THREAD, { event: "chunk", data });
  });
  await h.settle();
}

// The MEASURED chunk shapes (#642 M1) — `tool-input-start` carries `id`, the rest carry
// `toolCallId`.
const inputStart = (id: string, toolName: string) => ({ type: "tool-input-start", id, toolName });
const call = (toolCallId: string, toolName: string) => ({ type: "tool-call", toolCallId, toolName, input: "{}" });
const result = (toolCallId: string, toolName: string, output: unknown = { ok: true }) =>
  ({ type: "tool-result", toolCallId, toolName, input: "{}", output });
const toolError = (toolCallId: string, toolName: string) =>
  ({ type: "tool-error", toolCallId, toolName, input: "{}", error: "boom" });

async function settle(h: { settle: () => Promise<void> }, times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await h.settle();
}

test("p642.web.live_tool_states — the chip moves preparing → running → done inside ONE turn, before any settle", async () => {
  claraThreadStore.reset(THREAD);
  await withFetch(async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      // Nothing before a chunk arrives: absence renders NOTHING (liveClarify.ts:63-65's
      // rule), never a placeholder chip or a shimmer.
      assert.doesNotMatch(h.text(), /Configuring an accrual/);

      await pushChunks(h, [inputStart("v20a", "start_accrual_work")]);
      assert.match(h.text(), /Configuring an accrual · preparing/);

      await pushChunks(h, [call("v20a", "start_accrual_work")]);
      assert.match(h.text(), /Configuring an accrual · running/);

      await pushChunks(h, [result("v20a", "start_accrual_work")]);
      assert.match(h.text(), /Configuring an accrual · done/);
      // …and the transcript has NOT settled: no terminal `message` was ever delivered.
      assert.equal(claraThreadStore.getThread(THREAD).stream.transcriptParts, null);
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.live_tool_states — a THROWN tool reads `failed`, a REFUSING tool reads `refused`", async () => {
  claraThreadStore.reset(THREAD);
  await withFetch(async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await pushChunks(h, [
        call("a", "trial_balance"),
        toolError("a", "trial_balance"),
        call("b", "start_staff_expense_claim_work"),
        result("b", "start_staff_expense_claim_work", { ok: false, code: "CLR04", message: "not permitted" }),
      ]);
      assert.match(h.text(), /Reading the trial balance · failed/);
      assert.match(h.text(), /Queueing a staff expense claim · refused/);
    } finally {
      await h.unmount();
    }
  });
});

test("UI-32 — the chip shows the HUMAN label; a tool this build has never heard of falls back to the raw token", async () => {
  claraThreadStore.reset(THREAD);
  await withFetch(async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await pushChunks(h, [call("a", "start_accrual_work"), call("b", "a_tool_from_the_future")]);
      assert.match(h.text(), /Configuring an accrual · running/, "a known tool reads as a sentence");
      assert.doesNotMatch(h.text(), /start_accrual_work/, "…and its token never reaches the reader");
      assert.match(h.text(), /a_tool_from_the_future · running/, "an unknown tool shows the runtime's own word");
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.live_tool_states — a malformed chunk renders NOTHING, and no group is drawn at all", async () => {
  claraThreadStore.reset(THREAD);
  await withFetch(async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await pushChunks(h, [{ type: "tool-call" }, { type: "tool-input-start", toolCallId: "wrong-field", toolName: "trial_balance" }, null, "junk"]);
      const group = h.find((n: Stub) =>
        typeof n.getAttribute === "function"
        && (n.getAttribute as (a: string) => string | null)("data-slot") === "clara-live-tools");
      assert.equal(group, null, "an empty group with a heading would claim a step is happening when none is");
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.live_regions_after_restructure — ZERO nested live regions with the scope band, the jump control and the tool group all on screen", async () => {
  // CELL 14, AND IT IS A GATE, NOT A CHECK. `ClaraThreadView.tsx:282-296` records why the
  // log was moved DOWN off the scroll container (InterviewRunCard's own `role="log"`
  // nested inside it) and why the first suggested fix — dropping `aria-live` — would NOT
  // have worked, because `role="log"` carries an implicit polite live region. #642 adds a
  // named group beside the transcript and a control inside the scroll wrapper, so the
  // boundary is re-proven rather than assumed.
  claraThreadStore.reset(THREAD);
  await withFetch(async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await pushChunks(h, [call("a", "trial_balance"), result("a", "trial_balance")]);
      const violations = checkAccessibility(h.container as never).filter((v) => v.rule === "nested-live-region");
      assert.deepEqual(violations, [], JSON.stringify(violations, null, 2));
    } finally {
      await h.unmount();
    }
  });
});

test("VACUITY CONTROL — the tree really does carry live regions and the new group, so the gate above is not passing on an empty render", async () => {
  claraThreadStore.reset(THREAD);
  await withFetch(async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      await pushChunks(h, [call("a", "trial_balance")]);
      const roles: (string | null)[] = [];
      const slots: (string | null)[] = [];
      (function walk(node: Stub) {
        if (typeof node.getAttribute === "function") {
          const get = node.getAttribute as (a: string) => string | null;
          roles.push(get("role"));
          slots.push(get("data-slot"));
        }
        for (const c of (node.childNodes as Stub[] | undefined) ?? []) walk(c);
      })(h.container as Stub);
      assert.ok(roles.includes("log"), `the transcript log must be mounted; roles were ${JSON.stringify(roles.filter(Boolean))}`);
      assert.ok(slots.includes("clara-live-tools"), "the live tool group must be mounted");
      assert.ok(slots.includes("clara-scope-band"), "the scope band must be mounted");
    } finally {
      await h.unmount();
    }
  });
});
