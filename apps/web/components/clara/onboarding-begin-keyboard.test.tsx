// GATE (c) — keyboard-walk tests for BeginOnboardingCard (T11, firm
// altitude, no `clientId`). Split out of onboarding-checklist-keyboard.test.tsx
// (which covers ClientOnboardingCard's Commit/Cancel/Resolve doors) to keep
// each file under the harness's own size discipline — the two components
// share no state and this file needs its own dialog helpers regardless.
//
// rev-t11 fix round: F5 pins that a NEW begin attempt clears a STALE success
// receipt from an earlier, unrelated success (two contradictory receipts
// must never coexist — a fabricated-receipt read on a governed act); F6
// pins that the receipt's "go to the workspace" claim is a REAL link, not
// just a sentence the doc comment used to claim without one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function BeginApp() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      "div",
      null,
      createElement("h1", null, "Clara"),
      createElement(OnboardingChecklistCard, { session: sessionTokenAccessor }),
    ),
  });
}

async function mountBegin() {
  const h = await renderComponent(BeginApp());
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 5; i++) await h.settle();
  return { h, body };
}

/** Opens the Begin dialog, types `name`, and clicks its own Confirm
 *  (`beginConfirm` = "Begin onboarding" — DISTINCT from the trigger's own
 *  "Begin client onboarding" label, so no identity-exclusion is needed here). */
async function begin(h: Awaited<ReturnType<typeof mountBegin>>["h"], body: Node, name: string): Promise<void> {
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Begin client onboarding");
  assert.ok(trigger, "the Begin trigger must render");
  await h.fireEvent(trigger!, "click");
  for (let i = 0; i < 6; i++) await h.settle();
  const nameField = findIn(body, (n) => n.tagName === "INPUT");
  assert.ok(nameField, "the name field must be reachable");
  await h.act(() => { setFieldValue(nameField as never, name); });
  const confirmButton = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Begin onboarding");
  assert.ok(confirmButton, "the dialog's own Confirm control must render");
  await h.act(() => clickButton(confirmButton as never));
  for (let i = 0; i < 8; i++) await h.settle();
}

test("F5: a NEW begin attempt clears a STALE success receipt from an earlier, unrelated success (mutant: remove setResult(null) -> RED)", async () => {
  let call = 0;
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rpc/begin_client_onboarding")) {
      call += 1;
      if (call === 1) return jsonResponse({ client_id: "c-first", plan_id: "p-first" });
      return jsonResponse({ code: "CLR10", message: "a client with that name already exists" }, 400);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mountBegin();
    try {
      await begin(h, body as never, "Rome Public Advisory");
      assert.match(textOf(body as never), /Client c-first and plan p-first were created\./, "the first success receipt must render");

      await begin(h, body as never, "Rome Public Advisory (duplicate attempt)");
      const bodyText = textOf(body as never);
      assert.match(bodyText, /CLR10/, "the second attempt's refusal must render verbatim");
      assert.doesNotMatch(
        bodyText,
        /Client c-first and plan p-first were created\./,
        "F5: the FIRST attempt's stale success receipt must be GONE once a new attempt starts — two contradictory receipts must never coexist",
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("F6: the success receipt renders a REAL link into the new client's workspace, not just a claim of one (mutant: remove the <Link> -> RED)", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rpc/begin_client_onboarding")) return jsonResponse({ client_id: "c9", plan_id: "p9" });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mountBegin();
    try {
      await begin(h, body as never, "Rome Public Advisory");
      assert.match(textOf(body as never), /Client c9 and plan p9 were created\./, "the success receipt must render");

      const link = findIn(body as never, (n) => n.tagName === "A") as unknown as Record<string, unknown> | null;
      assert.ok(link, "an <a> element must render inside the success receipt");
      // Read the href React itself assigned via its own props — the stub
      // DOM's `setAttribute` is a no-op (hookHarness.ts's own mkNode), so
      // reading back `getAttribute("href")` would prove nothing either way;
      // this is the SAME `__reactProps$…` mechanism `clickButton`/
      // `setFieldValue` already rely on.
      const propsKey = Object.keys(link!).find((k) => k.startsWith("__reactProps"));
      const href = propsKey ? (link![propsKey] as { href?: string }).href : undefined;
      assert.equal(href, "/clients/c9", "the link must point at the NEW client's own workspace, by the DB-returned id");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
