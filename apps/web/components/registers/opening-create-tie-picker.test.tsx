// #656 — the tie-document picker on `CreateOpeningSeedDialog`.
//
// `opening-seed-lifecycle.tsx:62` used to send `tieDocumentId: null, tieSha256: null`
// UNCONDITIONALLY, so no browser could ever create a document-sourced opening basis: the whole
// document half of this lane was unreachable from the app, and the seed's own XOR guard never had
// anything to guard. These cells hold the four things the picker has to get right:
//
//   1. it offers ONLY this client's active, verified filings of the two kinds
//      `clara.create_opening_seed` admits — a row it cannot succeed with is a control that lies;
//   2. selecting one sends BOTH `tieDocumentId` and `tieSha256` (the door's XOR guard is CLR10
//      otherwise, so sending one alone would produce a refusal the human cannot act on);
//   3. "No document — I will key the balances" is an EXPLICIT second choice, never a silent
//      fallback, and picking it sends both as null;
//   4. every NEW input is a `Field` inside a `FieldGroup` with its own accessible name (design
//      lens F4), and the typed as-of survives.
//
// The governed call is observed at the WIRE (`/rest/v1/rpc/create_opening_seed`), the way every
// other registers battery in this repo observes one — an ESM namespace cannot be monkey-patched,
// and mocking `fetch` is also the only version of this test that proves the real argument names
// the door is granted under.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { tieCandidatesFrom } from "../../lib/registers/opening-source";
import { CreateOpeningSeedDialog } from "./opening-seed-lifecycle";
import messages from "../../messages/en.json";

enableDomInspection();

/** The dialog renders in a PORTAL, so it lives under `document.body` rather than under the mount
 *  container `renderComponent().find` walks. Same walker `components/clara/
 *  onboarding-begin-keyboard.test.tsx:27` carries, for the same reason. */
type Node = Record<string, unknown> & { tagName?: string; childNodes?: Node[] };
function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The candidate set — pure, and the part that decides what a person is even offered.
// ---------------------------------------------------------------------------------------------

const filing = (documentId: string, filedAt: string) => ({ document_id: documentId, filed_at: filedAt });
const doc = (over: { id: string } & Partial<{
  sha256: string; original_filename: string | null; document_kind: string | null; bytes_verified_at: string | null;
}>) => ({
  sha256: `${over.id}`.padEnd(64, "0"),
  original_filename: `${over.id}.pdf`,
  document_kind: "opening_balance_doc",
  bytes_verified_at: "2026-01-02T00:00:00Z",
  ...over,
});

test("the picker offers ONLY active verified filings of the two kinds the door admits", () => {
  const filings = [
    filing("d-ob", "2026-01-05T00:00:00Z"),
    filing("d-mgmt", "2026-01-04T00:00:00Z"),
    filing("d-prior", "2026-01-03T00:00:00Z"),
    filing("d-unverified", "2026-01-02T00:00:00Z"),
    filing("d-invoice", "2026-01-01T00:00:00Z"),
  ];
  const documents = [
    doc({ id: "d-ob" }),
    doc({ id: "d-mgmt", document_kind: "management_account" }),
    // `prior_gl` is a CLR02 tie today (0017:2913-2917) and stays one — a prior general ledger is
    // the seeding lane's source, not an opening basis's tie.
    doc({ id: "d-prior", document_kind: "prior_gl" }),
    // Unverified bytes are CLR02 from `clara._active_document_filing`, so offering the row would
    // be offering a control that can only fail.
    doc({ id: "d-unverified", bytes_verified_at: null }),
    doc({ id: "d-invoice", document_kind: "invoice" }),
    // Filed nowhere for this client: never offered, whatever its kind.
    doc({ id: "d-unfiled" }),
  ];
  const out = tieCandidatesFrom(filings, documents);
  assert.deepEqual(out.map((c) => c.documentId), ["d-ob", "d-mgmt"], "newest filing first");
  assert.equal(out[0]?.sha256, "d-ob".padEnd(64, "0"), "the sha travels with the candidate — the door needs BOTH");
});

test("a client with no filed documents yields an empty candidate set rather than an error", () => {
  assert.deepEqual(tieCandidatesFrom([], []), []);
  assert.deepEqual(tieCandidatesFrom([filing("x", "2026-01-01T00:00:00Z")], []), []);
});

// ---------------------------------------------------------------------------------------------
// The dialog.
// ---------------------------------------------------------------------------------------------

const SHA = "a".repeat(64);
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type DoorCall = Record<string, unknown>;

async function withDialog(run: (ctx: {
  h: Awaited<ReturnType<typeof renderComponent>>;
  body: Node & { appendChild: (c: unknown) => void };
  calls: DoorCall[];
}) => Promise<void>): Promise<void> {
  const calls: DoorCall[] = [];
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  configureSessionTokenSource(async () => "tok");
  globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    if (url.includes("/rest/v1/document_filings")) {
      return jsonResponse([{
        id: "f1", document_id: "doc-1", client_id: "c1", filed_at: "2026-01-05T00:00:00Z",
        filed_by: "u1", basis: "human", retired_at: null, retirement_reason: null, revision_token: "r1",
      }]);
    }
    if (url.includes("/rest/v1/rpc/create_opening_seed")) {
      calls.push(JSON.parse(String(init?.body ?? "{}")) as DoorCall);
      return jsonResponse({ seed_id: "s1" });
    }
    if (url.includes("/rest/v1/documents")) {
      return jsonResponse([{
        id: "doc-1", sha256: SHA, original_filename: "TB-2025.pdf", mime_type: "application/pdf",
        byte_size: 1, storage_path: "p", uploaded_by: "u1", created_at: "2026-01-01T00:00:00Z",
        bytes_verified_at: "2026-01-02T00:00:00Z", page_count: 1, extraction_status: "done",
        document_kind: "opening_balance_doc", financial_date: null, retention_state: "unanchored",
        retain_until: null, retention_basis: null, legal_hold: false, legal_hold_reason: null,
      }]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  const el = createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null,
      createElement("h1", null, "Registers"),
      createElement(CreateOpeningSeedDialog, {
        clientId: "c1",
        planId: "plan-1",
        busy: false,
        act: async (fn: () => Promise<void>) => { await fn(); return true; },
      })),
  });

  const h = await renderComponent(el);
  const body = (globalThis as unknown as { document: { body: Node & { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 8; i++) await h.settle();
    await run({ h, body, calls });
  } finally {
    await h.unmount();
    for (let i = 0; i < 4; i++) await h.settle();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

async function openDialog(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Create opening seed"));
  assert.ok(trigger, "the create trigger must be reachable");
  await h.fireEvent(trigger, "click");
  for (let i = 0; i < 8; i++) await h.settle();
}

/** The dialog's OWN confirm: the last control carrying the label (the trigger is the first). */
function confirmOf(body: Node): Node {
  let last: Node | null = null;
  findIn(body, (n) => {
    if (n.tagName === "BUTTON" && textOf(n as never) === "Create opening seed") last = n;
    return false;
  });
  assert.ok(last, "the dialog must offer its own confirm");
  return last as unknown as Node;
}

function require_(body: Node, id: string): Node {
  const node = findIn(body, (n) => n.id === id);
  assert.ok(node, `${id} must render inside the dialog`);
  return node;
}

test("the picker names each candidate and offers the keyed choice explicitly", async () => {
  await withDialog(async ({ h, body }) => {
    await openDialog(h);
    const picker = require_(body, "opening-seed-tie-document");
    assert.equal(picker.tagName, "SELECT");
    // THE KEYED CHOICE IS THE DEFAULT AND IT SAYS WHAT IT MEANS — not an empty first row a person
    // falls into without noticing they chose it.
    assert.match(textOf(picker as never), /No document/);
    assert.match(textOf(picker as never), /key the balances/);
    assert.match(textOf(picker as never), /TB-2025\.pdf/, "the filed candidate is offered by NAME");
    assert.match(textOf(picker as never), /sha aaaaaaaaaaaa/, "…with the first twelve characters of its sha");
    assert.match(textOf(picker as never), /filed 2026-01-05/, "…and the date it was filed");
  });
});

test("the keyed choice sends BOTH tie arguments as null", async () => {
  await withDialog(async ({ h, body, calls }) => {
    await openDialog(h);
    // The dialog's own confirm is the LAST matching control (the trigger is the first).
    await h.act(async () => { await clickButton(confirmOf(body) as never); });
    for (let i = 0; i < 8; i++) await h.settle();
    assert.equal(calls.length, 1, "exactly one governed call");
    assert.equal(calls[0]?.p_tie_document, null, "the keyed choice binds no document");
    assert.equal(calls[0]?.p_tie_sha256, null, "…and no sha — the door's XOR guard is satisfied in the same direction");
  });
});

test("selecting a filed document sends BOTH its id and its sha", async () => {
  await withDialog(async ({ h, body, calls }) => {
    await openDialog(h);
    const picker = require_(body, "opening-seed-tie-document");
    await h.act(async () => {
      (picker as unknown as { value: string }).value = "doc-1";
      const key = Object.keys(picker).find((k) => k.startsWith("__reactProps"));
      const onChange = key
        ? (picker as unknown as Record<string, { onChange?: (e: unknown) => unknown }>)[key]?.onChange
        : undefined;
      assert.ok(onChange, "the picker must be a controlled select");
      await onChange({ target: picker, currentTarget: picker });
    });
    for (let i = 0; i < 6; i++) await h.settle();

    await h.act(async () => { await clickButton(confirmOf(body) as never); });
    for (let i = 0; i < 8; i++) await h.settle();

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.p_tie_document, "doc-1");
    assert.equal(calls[0]?.p_tie_sha256, SHA,
      "BOTH travel or NEITHER does — one alone is CLR10 from the door's own XOR guard");
  });
});

test("the as-of input and the picker are Fields in ONE FieldGroup, each with its own accessible name", async () => {
  await withDialog(async ({ h, body }) => {
    await openDialog(h);
    for (const id of ["opening-seed-as-of", "opening-seed-tie-document"]) {
      require_(body, id);
      const labelNode = findIn(body, (n) => {
        if (n.tagName !== "LABEL") return false;
        const key = Object.keys(n).find((k) => k.startsWith("__reactProps"));
        const props = key ? (n as Record<string, { htmlFor?: string }>)[key] : undefined;
        return n.htmlFor === id || props?.htmlFor === id;
      });
      assert.ok(labelNode, `${id} must be named by a <label for>`);
      assert.ok(textOf(labelNode as never).trim().length > 0, `${id}'s label must carry text`);
    }
    // `data-slot` is a real ATTRIBUTE on the stub DOM (domInspect.ts's attribute store), not a
    // property — reading it as `n["data-slot"]` finds nothing, which is how this cell first passed
    // its own predicate and failed its assertion.
    const slot = (n: Node): string => String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-slot") ?? "");
    const group = findIn(body, (n) => slot(n) === "field-group");
    assert.ok(group, "the new inputs must be composed through FieldGroup, not a bare grid");

    let fieldCount = 0;
    const walk = (n: Node) => {
      if (slot(n) === "field") fieldCount += 1;
      for (const c of n.childNodes ?? []) walk(c);
    };
    walk(group);
    assert.ok(fieldCount >= 2,
      "the pre-Field as-of input moved into the SAME FieldGroup as the picker — one dialog, one composition");

    // THE TYPED AS-OF STANDS. The dialog stays open on a refusal (CB-AE2E-004), so what a person
    // typed has to still be there when they read the refusal and try again.
    const asOf = require_(body, "opening-seed-as-of");
    await h.act(async () => { setFieldValue(asOf as never, "2025-12-31"); });
    for (let i = 0; i < 4; i++) await h.settle();
    assert.equal(require_(body, "opening-seed-as-of").value, "2025-12-31");
  });
});
