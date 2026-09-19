// #900 — `InterviewRunCard` IS STILL PRE-`Field`: its answer textarea carried only an
// `aria-label`, no visible label, no description, and no error slot — the ad-hoc shape
// `OnboardingItemRow.tsx`'s own header (AC6 / appendix D #28) named and moved away from for the
// resolve/amend controls, and `work-question-form.tsx:70`'s `note` field. Owner ruling
// (2026-09-18, ticket comment): ONLY the answer textarea — a genuinely field-shaped part —
// recomposes onto `Field`/`FieldLabel`/`FieldDescription`; the card's run chrome, upload queue,
// terminal chips and cancel dialog are UNCHANGED, and this file proves both halves of that split.
//
// `aria-label` STAYS on the control (redundant with the new visible `FieldLabel`, same choice
// OnboardingItemRow's resolve control makes) because two EXISTING cells
// (`interview-run-keyboard.test.tsx`, `onboarding-progress-sync.test.tsx`) already key off it —
// a component-level relabel that broke those would be an accidental transport-adjacent change,
// not a Field recomposition.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";
import { InterviewRunCard } from "./InterviewRunCard";

enableDomInspection();

type Stub = { tagName?: string; nodeType?: number; getAttribute?: (k: string) => string | null; childNodes?: Stub[]; nodeValue?: string };

const CLIENT_ID = "c9000000-0000-4000-8000-000000000900";
const PLAN_ID = "p9000000-0000-4000-8000-000000000900";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withFetch(impl: (url: string) => Response, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = ((input: RequestInfo | URL) => Promise.resolve(impl(String(input)))) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

function router(url: string): Response {
  if (url === "/api/runtime/interview/client/start") return json({ run_id: "run-900" }, 202);
  if (url.startsWith("/api/runtime/interview/state?")) {
    return json({
      run_id: "run-900", scope: "client", status: "awaiting_input",
      pending_park: { parkIndex: 1, seg: "legal_name", phase: "q", question: "What is the client's legal name?" },
      terminal: null, activity: [], plan: { id: PLAN_ID }, items: [],
    });
  }
  return json({});
}

function App(): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(InterviewRunCard, { clientId: CLIENT_ID, planId: PLAN_ID, session }),
  });
}

function findIn(root: Stub, predicate: (n: Stub) => boolean): Stub | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function findAllIn(root: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  const walk = (n: Stub) => {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(root);
  return out;
}

function textOf(node: Stub): string {
  if (node.nodeType === 3) return node.nodeValue ?? "";
  return (node.childNodes ?? []).map(textOf).join("");
}

async function mountAndStart(): Promise<{ h: Awaited<ReturnType<typeof renderComponent>>; body: Stub }> {
  const h = await renderComponent(App());
  const body = (globalThis as unknown as { document: { body: Stub & { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container as unknown);
  for (let i = 0; i < 6; i++) await h.settle();
  const start = h.find((n) => n.tagName === "BUTTON") as Stub | null;
  assert.ok(start, "the start/continue control must render");
  await h.fireEvent(start as never, "click");
  for (let i = 0; i < 10; i++) await h.settle();
  return { h, body };
}

test("900 — the answer textarea is a labelled Field: a real <label> element, associated by id, carrying the description", async () => {
  await withFetch(router, async () => {
    const { h, body } = await mountAndStart();
    try {
      const textarea = findIn(body, (n) => n.tagName === "TEXTAREA" && n.getAttribute?.("aria-label") === "Your answer");
      assert.ok(textarea, "the answer textarea must still be findable by its (kept) aria-label");
      const id = textarea!.getAttribute!("id");
      assert.ok(id, "#900 — the answer control must carry an id for FieldLabel's htmlFor to target");

      const label = findIn(body, (n) => n.tagName === "LABEL" && n.getAttribute?.("for") === id);
      assert.ok(label, "#900 — a real, visible <label for=…> must associate with the answer control (was aria-label only)");
      assert.match(textOf(label!), /Your answer/, "the label's own text names the control");

      assert.match(textOf(body), /Sent to Clara as your answer to the open question above\./,
        "#900 — the Field carries a description, the same composition work-question-form's note field and OnboardingItemRow's resolve control use");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("900 — no drift: the run chrome (Send button, cancel trigger, card label) is unchanged by the Field recomposition", async () => {
  await withFetch(router, async () => {
    const { h, body } = await mountAndStart();
    try {
      assert.ok(findIn(body, (n) => n.tagName === "BUTTON" && textOf(n).trim() === "Send"), "Send must still render, unrenamed");
      assert.ok(findIn(body, (n) => n.tagName === "BUTTON" && textOf(n).trim() === "Cancel onboarding"),
        "the cancel trigger (run chrome) is untouched by this ticket");
      assert.ok(findIn(body, (n) => n.getAttribute?.("aria-label") === "Client onboarding interview"),
        "the card's own aria-label is untouched");
      // Non-vacuity for "only one Field renders here": the terminal chips / upload queue / cancel
      // dialog are NOT field-shaped and must not have picked up a stray FieldLabel of their own.
      assert.equal(findAllIn(body, (n) => n.tagName === "LABEL").length, 1,
        "exactly the one Field this ticket adds — the run chrome grew no label of its own");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
