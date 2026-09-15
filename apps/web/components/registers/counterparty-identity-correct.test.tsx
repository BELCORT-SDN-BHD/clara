// C77.6 — IDENTICAL LABELS, OPPOSITE EFFECTS, on the two dialogs #647 adds.
//
// The historical row asks for a test that "close/cancel actions with identical labels/visuals but
// opposite effects" assert TYPED ACTION IDENTITY and RESULT. A Correct-vs-Cancel pair sitting at
// equal visual weight inside one dialog is exactly that case: both are buttons, both are in the
// footer, and one of them writes to the estate. So each cell here asserts THREE things rather
// than one:
//   1. WHICH typed action fired — by the RPC the wire actually saw, not by which button looked
//      pressed;
//   2. the OUTCOME it left — the persistent state on screen afterwards;
//   3. that the other action left NOTHING — a Cancel that quietly wrote would pass a
//      "the dialog closed" assertion just as well.
//
// The draft-preservation half is asserted here too: a correction whose door refuses it must keep
// the human's typed values, because the refusal is asking them to change one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { CounterpartyIdentityPanel } from "./counterparty-identity-panel";

enableDomInspection();

// A door dialog PORTALS onto document.body, so every cell below mounts the container into the
// body and walks from there (counterparty-hygiene-keyboard.test.tsx's own idiom), and drives
// controls through `clickButton` / `setFieldValue` — the two helpers whose headers record that
// delegated dispatch never reaches a portal, so a plain fireEvent would click nothing and pass.
type Node = { tagName?: string; childNodes?: Node[]; id?: string; value?: string; disabled?: boolean };
function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
function docBody(): Node & { appendChild: (c: unknown) => void } {
  return (globalThis as unknown as { document: { body: Node & { appendChild: (c: unknown) => void } } }).document.body;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const IDENTITY = {
  client_id: "c1",
  as_of: "2026-09-16T10:00:00",
  current: {
    id: "cp1", kind: "vendor", name: "Acme Sdn Bhd", name_normalized: "acmesdnbhd",
    registration_no: "201801012345", registration_normalized: "201801012345", tin: "C123",
    payment_terms_days: 30, merged_into: null, retired_at: null, canonical_id: "cp1",
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z",
  },
  aliases: [],
  identifier_revisions: [
    {
      revision_n: 1, act: "identifiers_set",
      before_state: { registration_no: null, tin: null },
      after_state: { registration_no: "201801012345", tin: "C123" },
      basis: "identifiers corrected: registration (none) -> 201801012345, TIN (none) -> C123",
      changed_by: "u1", changed_by_name: "Aisyah", recorded_via: "human_ui",
      changed_at: "2026-02-01T02:00:00Z", alias_id: null,
      source: { document_id: null, extraction_id: null, region_id: null, field_path: null },
    },
  ],
  merges: [],
  conflicts: [],
};

type Seen = { fn: string; body: Record<string, unknown> }[];

function mock(seen: Seen, refuse = false): typeof fetch {
  return (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) {
      const fn = rpc[1] ?? "";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      seen.push({ fn, body });
      if (fn === "get_counterparty_identity") return jsonResponse(IDENTITY);
      if (fn === "set_counterparty_identifiers" && refuse) {
        return jsonResponse({
          code: "CLR23",
          message: "another live counterparty of this client and kind already carries that registration number",
          details: JSON.stringify({ reason: "registration_collision" }), hint: null,
        }, 400);
      }
      return jsonResponse({
        counterparty_id: "cp1", registration_no: body.p_registration_no ?? null,
        registration_normalized: body.p_registration_no ?? null, tin: body.p_tin ?? null,
      });
    }
    if (url.includes("/rest/v1/documents")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
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

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(CounterpartyIdentityPanel, { clientId: "c1", counterpartyId: "cp1" }),
  });
}

type H = Awaited<ReturnType<typeof renderComponent>>;

/** Mount into document.body (so portals are reachable), settle, and open the correction dialog. */
async function mounted(): Promise<{ h: H; body: Node & { appendChild: (c: unknown) => void } }> {
  const h = await renderComponent(App());
  const body = docBody();
  body.appendChild(h.container);
  for (let i = 0; i < 8; i++) await h.settle();
  return { h, body };
}

async function openCorrectDialog(h: H, body: Node) {
  const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Correct identifiers"));
  assert.ok(trigger, "the Correct-identifiers trigger exists (H-09's door finally has a face)");
  await h.act(async () => { await clickButton(trigger as never); });
  for (let i = 0; i < 6; i++) await h.settle();
}

/** The dialog footer's own CONFIRM button — matched on its exact label so it can never be the
 *  trigger that opened the dialog ("Correct identifiers" contains "Correct"). */
function confirmButton(body: Node): Node | null {
  return findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Correct");
}

test("C77.6: CANCEL in the correction dialog fires NO governed call and leaves the identity exactly as it was", async () => {
  const seen: Seen = [];
  await withMockedEnv(mock(seen), async () => {
    const { h, body } = await mounted();
    try {
      await openCorrectDialog(h, body);

      const reg = findIn(body, (n) => n.id === "cp-identifiers-registration");
      assert.ok(reg, "the registration field is seeded from the CURRENT value");
      assert.equal(reg.value, "201801012345");
      await h.act(() => { setFieldValue(reg as never, "999999999999"); });
      for (let i = 0; i < 2; i++) await h.settle();

      const cancel = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Cancel");
      assert.ok(cancel, "Cancel sits beside Correct at equal weight");
      await h.act(async () => { await clickButton(cancel as never); });
      for (let i = 0; i < 6; i++) await h.settle();

      const writes = seen.filter((s) => s.fn === "set_counterparty_identifiers");
      assert.equal(writes.length, 0, "C77.6: the typed action that fired was CANCEL — no governed call reached the wire");
      const text = textOf(body as never);
      assert.match(text, /201801012345/, "and the identity on screen is the one the read returned");
      assert.equal(confirmButton(body), null, "the dialog actually closed — its own Correct control is gone");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("C77.6: CORRECT fires exactly ONE set_counterparty_identifiers carrying BOTH values, and the outcome is re-read rather than painted", async () => {
  const seen: Seen = [];
  await withMockedEnv(mock(seen), async () => {
    const { h, body } = await mounted();
    try {
      const readsBefore = seen.filter((s) => s.fn === "get_counterparty_identity").length;
      await openCorrectDialog(h, body);

      await h.act(() => { setFieldValue(findIn(body, (n) => n.id === "cp-identifiers-registration") as never, "202001019999"); });
      for (let i = 0; i < 2; i++) await h.settle();
      await h.act(async () => { await clickButton(confirmButton(body) as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      const writes = seen.filter((s) => s.fn === "set_counterparty_identifiers");
      assert.equal(writes.length, 1, "C77.6: exactly ONE governed call, never a batch and never a double-fire");
      const wrote = writes[0]!.body;
      assert.equal(wrote.p_registration_no, "202001019999");
      assert.equal(wrote.p_tin, "C123", "the UNEDITED half travels too — the door REPLACES the pair");
      assert.equal(typeof wrote.p_op_key, "string");

      const readsAfter = seen.filter((s) => s.fn === "get_counterparty_identity").length;
      assert.ok(readsAfter > readsBefore,
        `the outcome is re-read, never painted from the write's own response (before ${readsBefore}, after ${readsAfter})`);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("C77.6: a REFUSED correction keeps the dialog open with the typed draft intact, and renders the refusal verbatim where the human can read it", async () => {
  const seen: Seen = [];
  await withMockedEnv(mock(seen, true), async () => {
    const { h, body } = await mounted();
    try {
      await openCorrectDialog(h, body);
      await h.act(() => { setFieldValue(findIn(body, (n) => n.id === "cp-identifiers-registration") as never, "202001019999"); });
      for (let i = 0; i < 2; i++) await h.settle();
      await h.act(async () => { await clickButton(confirmButton(body) as never); });
      for (let i = 0; i < 8; i++) await h.settle();

      const field = findIn(body, (n) => n.id === "cp-identifiers-registration");
      assert.ok(field, "the dialog is STILL OPEN — a refusal is a request to change the input, not a dismissal");
      assert.equal(field.value, "202001019999", "the draft the refusal is about survived it");

      const text = textOf(body as never);
      assert.match(text, /already carries that registration number/, "the refusal renders verbatim");
      assert.match(text, /CLR23/);
      assert.match(text, /registration_collision/);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("C77.6: the correction dialog's Confirm is GATED, not live, when nothing was edited — the gate is asserted, never clicked through and hoped about", async () => {
  const seen: Seen = [];
  await withMockedEnv(mock(seen), async () => {
    const { h, body } = await mounted();
    try {
      await openCorrectDialog(h, body);
      assert.match(textOf(body as never), /Nothing has been changed yet/);
      const confirm = confirmButton(body);
      assert.ok(confirm, "the Correct control renders");
      assert.equal(confirm.disabled, true,
        "a correction that would change nothing is gated at the CONFIRM, never at the trigger (house lesson 8)");
      assert.equal(seen.filter((s) => s.fn === "set_counterparty_identifiers").length, 0);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("the correction TIMELINE renders both the before and the after value — the identifier is no longer overwritten without a trace", async () => {
  const seen: Seen = [];
  await withMockedEnv(mock(seen), async () => {
    const { h, body } = await mounted();
    try {
      const text = textOf(body as never);
      assert.match(text, /Revision 1/);
      assert.match(text, /Identifiers corrected/);
      assert.match(text, /registration \(none\) -> 201801012345/, "the basis the database synthesised carries both sides");
      assert.match(text, /1 correction/, "the count is the read's own");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
