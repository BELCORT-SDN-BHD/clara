// The high-stakes threshold dialog's MONEY door, as distinct from the keyboard
// walk in `firm-admin-keyboard.test.tsx`. PR #505 fold 2 (MATERIAL-2) deleted
// `parseThresholdAmountToCents` — a third money-parser body that had no
// safe-integer cap and returned `1e+22` where the canonical parser refuses
// `out_of_range` — and pointed the dialog at the shared `MoneyInput`. These
// cells pin what that migration must keep true at the governance door.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { SettingsPanel } from "./settings-panel";

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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function App(child: ReactElement) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children: child });
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

const STORED_CENTS = 10000000;
let currentCents = STORED_CENTS;
let writeBodies: Record<string, unknown>[] = [];

function mockSettingsFetch(u: string, init?: RequestInit): Response {
  if (u.includes("/rest/v1/firms")) return jsonResponse([{ id: "f1", high_stakes_amount_cents: currentCents }]);
  if (u.includes("/rpc/set_firm_high_stakes_threshold")) {
    writeBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    const oldCents = currentCents;
    currentCents = 20000000;
    return jsonResponse({ firm_id: "f1", old_cents: oldCents, new_cents: currentCents });
  }
  throw new Error(`unexpected fetch: ${u}`);
}

const OUT_OF_RANGE = "90071992547409.92"; // 9,007,199,254,740,992 cents — one past MAX_SAFE_INTEGER.

test("Change threshold: an out-of-range amount is refused, and never posts the last amount that WAS valid", async () => {
  currentCents = STORED_CENTS;
  writeBodies = [];
  await withMockedEnv(
    async (u, init) => mockSettingsFetch(String(u), init),
    async () => {
      const h = await renderComponent(App(createElement(SettingsPanel)));
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Change threshold");
        assert.ok(trigger);
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const confirmButton = () => findIn(
          body as never,
          (n) => n.tagName === "BUTTON" && textOf(n as never) === "Change threshold" && n !== trigger,
        );
        const amountField = findIn(body as never, (n) => n.tagName === "INPUT");
        assert.ok(amountField);

        // A VALID amount is typed FIRST, on purpose. Without it the dialog's
        // accepted-cents state never leaves null, and `amountCents === null`
        // alone keeps Confirm disabled — so a build that had dropped the
        // validity check entirely would still pass a refusal-only assertion.
        // Typing a good amount and then breaking it is what discriminates: the
        // stale accepted 150,000.00 is precisely what a dropped check would
        // post in place of the number now on screen.
        await h.act(() => { setFieldValue(amountField as never, "150000.00"); });
        for (let i = 0; i < 2; i++) await h.settle();
        const armed = confirmButton();
        assert.ok(armed);
        assert.equal(
          (armed as unknown as { disabled: boolean }).disabled,
          false,
          "control half: a well-formed amount really does arm Confirm, so the assertion below measures the refusal rather than a dialog that never arms",
        );

        await h.act(() => { setFieldValue(amountField as never, OUT_OF_RANGE); });
        for (let i = 0; i < 2; i++) await h.settle();
        assert.match(
          textOf(body as never),
          /Enter a smaller amount that can be represented exactly in cents\./,
          "the shared parser's typed out_of_range refusal is on screen",
        );

        const disarmed = confirmButton();
        assert.ok(disarmed);
        assert.equal(
          (disarmed as unknown as { disabled: boolean }).disabled,
          true,
          "a refusal re-disarms Confirm rather than leaving the previously accepted cents armed behind it",
        );
        // `h.fireEvent` silently no-ops inside an open Base UI dialog (portal),
        // so a click-then-assert-nothing-happened here would be vacuous.
        // `clickButton` is the shared instrument that refuses a disabled node,
        // which is why the gate is asserted through it rather than around it.
        await assert.rejects(
          () => clickButton(disarmed as never),
          /refusing to click a DISABLED node/,
          "the shared click instrument must find Confirm genuinely unclickable",
        );
        for (let i = 0; i < 3; i++) await h.settle();
        assert.deepEqual(writeBodies, [], "an out-of-range amount never reaches the governance door");
        assert.equal(currentCents, STORED_CENTS, "the DB-owned threshold is untouched by a refused edit");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("Change threshold: a well-formed amount crosses the door as exact cents, once", async () => {
  currentCents = STORED_CENTS;
  writeBodies = [];
  await withMockedEnv(
    async (u, init) => mockSettingsFetch(String(u), init),
    async () => {
      const h = await renderComponent(App(createElement(SettingsPanel)));
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Change threshold");
        assert.ok(trigger);
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const amountField = findIn(body as never, (n) => n.tagName === "INPUT");
        assert.ok(amountField);
        // Comma-grouped, so the door argument also pins that the canonical
        // parser's thousands handling survived the migration.
        await h.act(() => { setFieldValue(amountField as never, "1,234.56"); });
        for (let i = 0; i < 2; i++) await h.settle();

        const confirm = findIn(
          body as never,
          (n) => n.tagName === "BUTTON" && textOf(n as never) === "Change threshold" && n !== trigger,
        );
        assert.ok(confirm);
        assert.equal(
          (confirm as unknown as { disabled: boolean }).disabled,
          false,
          "a comma-grouped amount is accepted, not refused as ambiguous",
        );
        await clickButton(confirm as never);
        for (let i = 0; i < 6; i++) await h.settle();

        assert.equal(writeBodies.length, 1, "the confirm crosses the door exactly once");
        assert.equal(writeBodies[0]?.p_cents, 123456, "the door receives the exact canonical cents");
        assert.equal(typeof writeBodies[0]?.p_op_key, "string");
        assert.deepEqual(Object.keys(writeBodies[0]!).sort(), ["p_cents", "p_op_key"]);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
