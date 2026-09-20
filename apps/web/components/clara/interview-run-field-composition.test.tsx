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

import { renderComponent, setFieldValue } from "../../test/hookHarness";
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

// CRS-07-07 — the same estate as `router`, except the runtime refuses the answer. Matches
// `useInterviewRun.test.ts`'s own "server_busy" refusal shape (`{error, message}` at 503), the
// hook's typed envelope (`errorFrom`, lib/interview/api.ts), so this is an independently sourced
// expected message, not one this test invents.
function routerWithRefusedAnswer(url: string): Response {
  if (url === "/api/runtime/interview/answer") {
    return json({ error: "server_busy", message: "Answer was not accepted" }, 503);
  }
  return router(url);
}

/** Types into the composer and submits it directly through the form's own `onSubmit` — the
 *  `onboarding-progress-sync.test.tsx` `answerCurrentPark` idiom. The stub DOM has no native
 *  form submission (a `type="submit"` Button's `onClick` never reaches a real `<form>`'s submit
 *  event here), so the real handler is invoked the same way a browser's own submit would. */
async function submitAnswer(h: Awaited<ReturnType<typeof renderComponent>>, body: Stub, text: string): Promise<void> {
  const textarea = findIn(body, (n) => n.tagName === "TEXTAREA" && n.getAttribute?.("aria-label") === "Your answer");
  assert.ok(textarea, "the answer textarea must render on a live pending park");
  await h.act(() => setFieldValue(textarea as never, text));

  const form = findIn(body, (n) => n.tagName === "FORM");
  assert.ok(form, "the composer's form must render");
  const propsKey = Object.keys(form as object).find((k) => k.startsWith("__reactProps"));
  const onSubmit = propsKey
    ? (form as unknown as Record<string, { onSubmit?: (e: unknown) => unknown }>)[propsKey]?.onSubmit
    : undefined;
  assert.ok(onSubmit, "the composer's form must carry the real submit handler");
  await h.act(async () => {
    await onSubmit!({ preventDefault() {}, stopPropagation() {}, target: form, currentTarget: form });
  });
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
      assert.ok(id, "900 — the answer control must carry an id for FieldLabel's htmlFor to target");

      const label = findIn(body, (n) => n.tagName === "LABEL" && n.getAttribute?.("for") === id);
      assert.ok(label, "900 — a real, visible <label for=…> must associate with the answer control (was aria-label only)");
      assert.match(textOf(label!), /Your answer/, "the label's own text names the control");

      assert.match(textOf(body), /Sent to Clara as your answer to the open question above\./,
        "900 — the Field carries a description, the same composition work-question-form's note field and OnboardingItemRow's resolve control use");

      // L07-A05 (fix round) — a visible FieldDescription is not an ANNOUNCED one: it is a bare
      // <p> with no id and no context wiring (components/ui/field.tsx), so nothing associates it
      // with the control unless the control's aria-describedby names it explicitly — the same
      // wiring work-question-form.tsx's own controls use for their own associated text.
      const describedBy = textarea!.getAttribute!("aria-describedby");
      assert.ok(describedBy, "900 — the answer control must carry aria-describedby, or the help text is never announced");
      const description = findIn(body, (n) => n.getAttribute?.("id") === describedBy);
      assert.ok(description, "900 — aria-describedby must resolve to an actual node in the DOM");
      assert.match(textOf(description!), /Sent to Clara as your answer to the open question above\./,
        "900 — the resolved node must BE the description, not some other id");
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

// CRS-07-07 (code-review fix round) — AC1 asks for the same "label, help AND ERROR behaviour"
// the sibling surfaces show. The prior round delivered label and help but left every submit
// failure — including a refused ANSWER, this field's own failure — in the card's chrome banner
// (`run.error` in a `StateBanner`, above the thread log), which is not "error placement" beside
// the control the sibling surfaces (trade-invoice-form.tsx, invite-dialog.tsx,
// matching-candidates.tsx) all use. This proves the missing leg through the component's real
// rendered output — no source-text proxy.
test("900 / CRS-07-07 — a refused answer renders through FieldError inside the answer Field, not only the chrome banner", async () => {
  await withFetch(routerWithRefusedAnswer, async () => {
    const { h, body } = await mountAndStart();
    try {
      await submitAnswer(h, body, "Rome Public Advisory");
      for (let i = 0; i < 8; i++) await h.settle();

      const form = findIn(body, (n) => n.tagName === "FORM");
      assert.ok(form, "the answer form must still render — the refused submit does not advance the park");
      const fieldError = findIn(form!, (n) => n.getAttribute?.("role") === "alert");
      assert.ok(fieldError, "900/CRS-07-07 — the refusal must render through a role=alert FieldError inside the answer Field");
      assert.match(textOf(fieldError!), /Answer was not accepted/,
        "the FieldError must carry the runtime's own refusal message, not a generic placeholder");

      const alerts = findAllIn(body, (n) => n.getAttribute?.("role") === "alert");
      assert.equal(alerts.length, 1,
        "the refusal renders exactly once, through the field — no half-state where the same message ALSO doubles into the chrome banner");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
