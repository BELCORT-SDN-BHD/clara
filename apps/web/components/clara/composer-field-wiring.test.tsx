// #642 AC7 — the composer on `Field`, and the three things that must NOT have changed.
//
// GAP-ORDER §2 asks for the composer to be composed on `Field`/`FieldGroup` like every
// other field in the product (`work-question-form.tsx:70` is the precedent). The risk is
// entirely in what a re-composition quietly takes with it: the accessible NAME, the ONE
// send predicate H-24 established, and the deliberate raw `<textarea>` (the `Textarea`
// primitive is `field-sizing-content` — auto-growing — and the rail composer is a fixed
// 2/3 rows on purpose).
//
// The `ring-ring/70` trap is guarded elsewhere and by name:
// `tests/focus-ring-contract.test.ts` reds on a `ring-ring/50` carrier, and
// `ClaraThreadView.tsx` records that trap in the textarea's own comment.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraThreadView } from "./ClaraThreadView";
import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { claraThreadStore } from "../../lib/clara/threadStore";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const THREAD = "aaaaaaaa-6424-4424-8424-642464246424";
const CLIENT = "bbbbbbbb-6424-4424-8424-642464246424";
const CALLER = "99999999-9999-4999-8999-999999999999";
const TOKEN = `x.${Buffer.from(JSON.stringify({ sub: CALLER })).toString("base64url")}.y`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Wire = { turns: number };

function withFetch(wire: Wire, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST" && url.includes(`/chat/${THREAD}/turns`)) {
      wire.turns += 1;
      return json({ error: "internal" }, 500);
    }
    if (url.includes("/messages")) return json({ messages: [] });
    if (url.includes("/rest/v1/")) return json([]);
    throw new Error(`unexpected fetch: ${method} ${url}`);
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

const get = (n: Stub, name: string): string | null =>
  typeof n.getAttribute === "function" ? (n.getAttribute as (a: string) => string | null)(name) : null;

function find(h: { find: (p: (n: Stub) => boolean) => Stub | null }, p: (n: Stub) => boolean): Stub {
  const node = h.find(p);
  assert.ok(node, "node not found");
  return node;
}

async function pressEnter(node: Stub): Promise<void> {
  const propsKey = Object.keys(node).find((k) => k.startsWith("__reactProps"));
  const onKeyDown = (node as Record<string, { onKeyDown?: (e: unknown) => unknown }>)[propsKey ?? ""]?.onKeyDown;
  if (!onKeyDown) throw new Error("no onKeyDown on the composer");
  await onKeyDown({
    key: "Enter", shiftKey: false, target: node, currentTarget: node,
    nativeEvent: { key: "Enter", isComposing: false },
    preventDefault() {}, stopPropagation() {}, persist() {},
  });
}

async function settle(h: { settle: () => Promise<void> }, times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) await h.settle();
}

test("p642.web.composer_field_wiring — ONE accessible name, a described-by hint, and still a raw <textarea>", async () => {
  claraThreadStore.reset(THREAD);
  await withFetch({ turns: 0 }, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      const box = find(h, (n) => n.tagName === "TEXTAREA");
      assert.equal(box.tagName, "TEXTAREA", "the control itself must not have been swapped for the auto-growing primitive");
      assert.equal(get(box, "rows"), "2", "the rail's deliberate fixed height survives the re-composition");

      // ONE name, not two. The name moved onto a `sr-only` FieldLabel; an `aria-label`
      // left behind would be a SECOND name and would silently win over the label it
      // duplicates — the exact defect the #507/#508 merge taught this file.
      assert.equal(get(box, "aria-label"), null, "the aria-label must be gone now that a real label exists");
      const id = get(box, "id");
      assert.ok(id, "the textarea needs an id for the label to point at");
      const label = find(h, (n) => n.tagName === "LABEL" && get(n, "for") === id);
      const labelText = (function textOf(n: Stub): string {
        if (n.nodeType === 3) return String(n.nodeValue ?? "");
        const kids = (n.childNodes as Stub[] | undefined) ?? [];
        if (kids.length > 0) return kids.map(textOf).join("");
        return typeof n.textContent === "string" ? n.textContent : "";
      })(label);
      assert.equal(labelText.trim(), "Ask Clara", "the accessible name is the SAME string it always was");
      assert.match(String(get(label, "class") ?? ""), /sr-only/, "…and it stays invisible, as it was as an aria-label");

      // The hint is a FieldDescription, wired by id, not a placeholder that vanishes the
      // moment the person starts typing — which is exactly when they need it.
      const describedBy = get(box, "aria-describedby");
      assert.ok(describedBy);
      const hint = find(h, (n) => get(n, "id") === describedBy);
      assert.match(
        (function textOf(n: Stub): string {
          if (n.nodeType === 3) return String(n.nodeValue ?? "");
          const kids = (n.childNodes as Stub[] | undefined) ?? [];
          if (kids.length > 0) return kids.map(textOf).join("");
          return typeof n.textContent === "string" ? n.textContent : "";
        })(hint),
        /Enter sends/,
      );
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.composer_field_wiring — `aria-invalid` appears only once the SEND failed, and the draft survives it", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      assert.equal(get(find(h, (n) => n.tagName === "TEXTAREA"), "aria-invalid"), null,
        "a composer nobody has failed to send from is not invalid");

      await h.act(() => setFieldValue(find(h, (n) => n.tagName === "TEXTAREA"), "book the invoice"));
      await pressEnter(find(h, (n) => n.tagName === "TEXTAREA"));
      await settle(h);

      assert.equal(wire.turns, 1);
      assert.equal(get(find(h, (n) => n.tagName === "TEXTAREA"), "aria-invalid"), "true",
        "the field carries the invalid state its own error is about");
      assert.equal(claraThreadStore.getDraft(CLIENT, THREAD), "book the invoice",
        "issue 614 A7 — a refused turn leaves the human's text where they can fix and resend it");
    } finally {
      await h.unmount();
    }
  });
});

test("H-24 (re-run, not copied) — Enter and the Send button still read ONE predicate after the re-composition", async () => {
  claraThreadStore.reset(THREAD);
  const wire: Wire = { turns: 0 };
  await withFetch(wire, async () => {
    const h = await renderComponent(view());
    try {
      await settle(h);
      const box = find(h, (n) => n.tagName === "TEXTAREA");
      const send = find(h, (n) => n.tagName === "BUTTON" && get(n, "type") === "submit");

      // Empty draft: the Button refuses, and so must Enter. If the two predicates ever
      // drifted apart, THIS is the shape that would show it.
      assert.equal(get(send, "disabled"), "", "the Send button is disabled on an empty draft");
      await pressEnter(box);
      await settle(h);
      assert.equal(wire.turns, 0, "Enter must never post what the button refuses to post");

      await h.act(() => setFieldValue(box, "book the invoice"));
      assert.equal(get(find(h, (n) => n.tagName === "BUTTON" && get(n, "type") === "submit"), "disabled"), null,
        "…and both open together");
      await pressEnter(find(h, (n) => n.tagName === "TEXTAREA"));
      await settle(h);
      assert.equal(wire.turns, 1);
    } finally {
      await h.unmount();
    }
  });
});
