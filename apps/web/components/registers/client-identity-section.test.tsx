// #647 — H-20's missing face, and H-34's REDESIGN obligation, on ONE Identity section.
//
// H-20 said `clara.add_client_identifier` "has no face": before this slice the only way a human
// could state a client identifier was to RATIFY an agent proposal
// (components/firm/identifier-promotion-row.tsx). These cells prove the other half exists, that
// it reads the rows DIRECTLY under RLS rather than through an invented door, and that the
// database's own duplicate refusal reaches the human verbatim.
//
// H-34's rule, applied to a NEW surface rather than re-asserted about the old one:
//   · every count comes from a read that actually ran — here, from
//     `clara.list_counterparty_identity`'s own aggregates, never from `rows.length` of a filtered
//     array;
//   · a successful EMPTY says what was asked;
//   · FILTERED-TO-NOTHING is a different sentence from an empty, keeps the filter, says how many
//     really exist and offers the way back.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ClientIdentitySection } from "./client-identity-section";

enableDomInspection();

// The Add-identifier dialog PORTALS onto document.body, so the cells that drive it mount the
// container into the body and walk from there (counterparty-hygiene-keyboard.test.tsx's idiom).
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

function listRow(over: Record<string, unknown> = {}) {
  return {
    id: "cp1", kind: "vendor", name: "Acme Sdn Bhd", registration_no: "201801012345", tin: "C123",
    merged_into: null, retired_at: null, status: "live",
    alias_count: 3, live_alias_count: 2, revision_count: 5,
    last_revision_at: "2026-03-01T02:00:00Z", merge_count: 1, unsourced_alias_count: 1,
    ...over,
  };
}

const IDENTIFIER = {
  id: "ci1", client_id: "c1", kind: "ssm", value_normalized: "201801012345",
  added_by: "u1", added_at: "2026-01-05T02:00:00Z",
};

type MockOpts = {
  counterparties?: unknown[];
  identifiers?: unknown[];
  corrections?: unknown[];
  identifierStatus?: number;
  onRpc?: (fn: string, body: Record<string, unknown>) => Response | null;
  seenIdentifierUrls?: string[];
};

function mock(opts: MockOpts): typeof fetch {
  return (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) {
      const fn = rpc[1] ?? "";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      const custom = opts.onRpc?.(fn, body);
      if (custom) return custom;
      if (fn === "list_counterparty_identity") {
        return jsonResponse({
          client_id: "c1", kind: body.p_kind ?? null, as_of: "2026-09-16T10:00:00",
          counterparties: opts.counterparties ?? [],
        });
      }
      if (fn === "list_counterparty_merge_corrections") {
        return jsonResponse({ client_id: "c1", as_of: "2026-09-16T10:00:00", merges: opts.corrections ?? [] });
      }
      return jsonResponse({});
    }
    if (url.includes("/rest/v1/client_identifiers")) {
      opts.seenIdentifierUrls?.push(url);
      return jsonResponse(opts.identifiers ?? [], opts.identifierStatus ?? 200);
    }
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
    children: createElement(ClientIdentitySection, { clientId: "c1" }),
  });
}

test("H-20: the client's OWN identifiers are listed from a DIRECT RLS read, and the Add control exists at last", async () => {
  const seen: string[] = [];
  await withMockedEnv(mock({ identifiers: [IDENTIFIER], counterparties: [listRow()], seenIdentifierUrls: seen }), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const text = h.text();
      assert.match(text, /This client's own identifiers/);
      assert.match(text, /201801012345/);
      assert.match(text, /ssm/);
      assert.match(text, /Add identifier/, "H-20's missing control now exists");
      // A DIRECT table read — no invented list door over rows the caller can already select.
      assert.equal(seen.length, 1, `exactly one client_identifiers read ran; saw ${seen.length}`);
      const read = seen[0] ?? "";
      assert.match(read, /client_id=eq\.c1/);
      assert.doesNotMatch(read, /\/rpc\//, "the rows are read directly under RLS, never wrapped in a door");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("H-20: a duplicate (kind, value) renders uq_client_identifiers_client_kind_value's typed refusal VERBATIM in a persistent banner", async () => {
  await withMockedEnv(
    mock({
      identifiers: [IDENTIFIER],
      counterparties: [listRow()],
      onRpc: (fn) =>
        fn === "add_client_identifier"
          ? jsonResponse({
              code: "CLR10", message: "this identifier is already recorded for this client",
              details: JSON.stringify({ reason: "already_recorded", class: "identifier" }), hint: null,
            }, 400)
          : null,
    }),
    async () => {
      const h = await renderComponent(App());
      const body = docBody();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Add identifier"));
        assert.ok(trigger);
        await h.act(async () => { await clickButton(trigger as never); });
        for (let i = 0; i < 6; i++) await h.settle();

        const kind = findIn(body, (n) => n.id === "client-identifier-kind");
        const value = findIn(body, (n) => n.id === "client-identifier-value");
        assert.ok(kind && value, "both fields render");
        await h.act(() => { setFieldValue(kind as never, "ssm"); });
        await h.act(() => { setFieldValue(value as never, "201801012345"); });
        for (let i = 0; i < 2; i++) await h.settle();

        const confirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Add");
        assert.ok(confirm);
        await h.act(async () => { await clickButton(confirm as never); });
        for (let i = 0; i < 8; i++) await h.settle();

        const text = textOf(body as never);
        assert.match(text, /this identifier is already recorded for this client/, "verbatim, never re-worded");
        assert.match(text, /CLR10/);
        assert.match(text, /already_recorded/, "the typed reason travels with the code");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("H-20: a required field that is empty fails validation, keeps the OTHER field's text, and never reaches the door", async () => {
  let doorCalls = 0;
  await withMockedEnv(
    mock({
      counterparties: [listRow()],
      onRpc: (fn) => { if (fn === "add_client_identifier") doorCalls += 1; return null; },
    }),
    async () => {
      const h = await renderComponent(App());
      const body = docBody();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        await h.act(async () => {
          await clickButton(findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Add identifier")) as never);
        });
        for (let i = 0; i < 6; i++) await h.settle();
        await h.act(() => { setFieldValue(findIn(body, (n) => n.id === "client-identifier-kind") as never, "ssm"); });
        for (let i = 0; i < 2; i++) await h.settle();
        await h.act(async () => {
          await clickButton(findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Add") as never);
        });
        for (let i = 0; i < 6; i++) await h.settle();

        assert.equal(doorCalls, 0, "the door is never called with something it would only refuse");
        assert.match(textOf(body as never), /Enter the identifier value before adding it/);
        assert.equal(findIn(body, (n) => n.id === "client-identifier-kind")?.value, "ssm",
          "the draft survives the validation failure (appendix C: preserve user input)");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("H-34: FILTERED-TO-NOTHING is a different sentence from a successful empty — it says how many exist and offers the way back", async () => {
  await withMockedEnv(mock({ counterparties: [listRow({ kind: "vendor" })] }), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      // Both roles are read; the filter is a presentation choice over already-fetched facts.
      assert.match(h.text(), /Acme Sdn Bhd/);
      const customers = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Customers");
      assert.ok(customers, "the role filter renders as a Toggle Group item");
      await h.act(async () => { await clickButton(customers as never); });
      for (let i = 0; i < 6; i++) await h.settle();

      const text = h.text();
      assert.match(text, /1 counterparty is recorded for this client, but none is a customer/,
        "the count comes from the read that ran, and the sentence names the filter");
      assert.match(text, /Show both roles/, "the way back is offered");
      assert.doesNotMatch(text, /No counterparties are recorded for this client yet/,
        "filtered-to-nothing must never borrow the successful-empty sentence");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("H-34: a SUCCESSFUL EMPTY says what was asked, and every count on a real row is the database's own", async () => {
  await withMockedEnv(mock({ counterparties: [] }), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      assert.match(h.text(), /No counterparties are recorded for this client yet/);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });

  await withMockedEnv(mock({ counterparties: [listRow({ live_alias_count: 2, revision_count: 5, unsourced_alias_count: 1 })] }), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const text = h.text();
      assert.match(text, /2 live aliases/);
      assert.match(text, /5 corrections/);
      assert.match(text, /1 live alias names no source/,
        "how much of an identity rests on a source is measured, not assumed");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("H-20: the Kind control is the DATABASE's own closed vocabulary — three options, no free text, and no hint pointing at a kind the CHECK refuses", async () => {
  // `clara.client_identifiers.kind` is a three-value CHECK (`tin`, `ssm`, `bank_account`;
  // 0007:227) and `clara.add_client_identifier` maps only `unique_violation` — so a kind outside
  // that set comes back as a bare 23514 with no CLR code and no typed reason, which
  // `toDialogRefusal` can only paint as a raw Postgres sentence. A free-text box (and a hint that
  // named `sst`, a kind the CHECK does not admit) steered the human straight at it.
  const posted: Record<string, unknown>[] = [];
  await withMockedEnv(
    mock({
      counterparties: [listRow()],
      onRpc: (fn, body) => { if (fn === "add_client_identifier") posted.push(body); return null; },
    }),
    async () => {
      const h = await renderComponent(App());
      const body = docBody();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        await h.act(async () => {
          await clickButton(findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Add identifier")) as never);
        });
        for (let i = 0; i < 6; i++) await h.settle();

        const kind = findIn(body, (n) => n.id === "client-identifier-kind");
        assert.ok(kind, "the Kind control renders");
        assert.equal(kind?.tagName, "SELECT", "the kind is CHOSEN from the database's vocabulary, never typed");
        // The option's value is read off the ATTRIBUTE, the journal-composer cell's own idiom:
        // this DOM stub does not reflect a select option's `value` property.
        const attrOf = (n: unknown, k: string) =>
          (n as { getAttribute?: (name: string) => string | null }).getAttribute?.(k) ?? null;
        const options = ((kind as { childNodes?: { tagName?: string }[] }).childNodes ?? [])
          .filter((n) => n.tagName === "OPTION")
          .map((n) => attrOf(n, "value"));
        assert.deepEqual(options, ["ssm", "tin", "bank_account"],
          "exactly the three values clara.client_identifiers.kind's CHECK admits, and nothing the door would refuse");

        const text = textOf(body as never);
        assert.doesNotMatch(text, /sst/i, "no copy steers the human at a kind the database refuses");

        // …and what the door receives is one of the three, taken from the control itself.
        await h.act(() => { setFieldValue(findIn(body, (n) => n.id === "client-identifier-value") as never, "C24680135790"); });
        await h.act(() => { setFieldValue(kind as never, "tin"); });
        for (let i = 0; i < 2; i++) await h.settle();
        await h.act(async () => {
          await clickButton(findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Add") as never);
        });
        for (let i = 0; i < 8; i++) await h.settle();
        assert.equal(posted.length, 1, "the door was called once");
        assert.equal(posted[0]?.p_kind, "tin", "…with a kind the CHECK admits");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("AC6 loading: before any read has answered, the section shows its LOADING face — and that face is terminal, replaced by data once the reads land", async () => {
  // AC6 names `loading` as a journey state of its own. Every read here is held until the cell
  // releases it, so the loading face is REACHED rather than raced past.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  const impl = (async (u: RequestInfo | URL) => {
    await held;
    const url = String(u);
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url);
    if (rpc) {
      const fn = rpc[1] ?? "";
      if (fn === "list_counterparty_identity") {
        return jsonResponse({ client_id: "c1", kind: null, as_of: "2026-09-16T10:00:00", counterparties: [listRow()] });
      }
      if (fn === "list_counterparty_merge_corrections") {
        return jsonResponse({ client_id: "c1", as_of: "2026-09-16T10:00:00", merges: [] });
      }
      return jsonResponse({});
    }
    if (url.includes("/rest/v1/client_identifiers")) return jsonResponse([IDENTIFIER]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      const loading = h.text();
      assert.match(loading, /Loading…/, "the loading face is shown while the reads are in flight");
      assert.doesNotMatch(loading, /No identifier has been recorded for this client yet/,
        "a read that has not answered is never painted as a successful empty");
      assert.doesNotMatch(loading, /No counterparties are recorded for this client yet/);

      release();
      for (let i = 0; i < 10; i++) await h.settle();
      const settled = h.text();
      assert.doesNotMatch(settled, /Loading…/, "Skeleton stops on the terminal face (appendix D 53)");
      assert.match(settled, /Acme Sdn Bhd/);
      assert.match(settled, /201801012345/);
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("AC6 partial: one read failing is not a failed page — the halves that answered still render, and the half that failed says so in its OWN place", async () => {
  // The three reads of this section are independent on purpose. A 500 on the merge-corrections
  // read must not blank the identifiers or the counterparties, and must never be shown as
  // "nothing has been merged" — a failed read and a valid no-data answer are different facts
  // (H-34's rule, and appendix C's stale/partial state).
  await withMockedEnv(
    mock({
      identifiers: [IDENTIFIER],
      counterparties: [listRow()],
      onRpc: (fn) =>
        fn === "list_counterparty_merge_corrections"
          ? jsonResponse({ message: "merge corrections read failed" }, 500)
          : null,
    }),
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 10; i++) await h.settle();
        const text = h.text();
        assert.match(text, /201801012345/, "the identifiers half still renders its rows");
        assert.match(text, /Acme Sdn Bhd/, "the counterparty half still renders its rows");
        assert.match(text, /2 live aliases/, "…including the counts from the read that DID answer");
        assert.match(text, /Something went wrong/, "the failed read is reported where it failed");
        assert.doesNotMatch(text, /No counterparty of this client has been merged/,
          "a failed read is never painted as a successful empty");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("AC3: the bounded discovery separates a representable merge from a legacy one, and says out loud that no un-merge exists", async () => {
  await withMockedEnv(
    mock({
      counterparties: [listRow()],
      corrections: [
        {
          merged_id: "cp-dead", merged_name: "Acme Trading", kind: "vendor",
          survivor_id: "cp1", survivor_name: "Acme Sdn Bhd",
          merged_at: "2026-03-01T02:00:00Z", merged_by: "u1", merged_by_name: "Aisyah",
          merge_id: "m1", merge_reason: "same SSM, two spellings", alias_id: "al9",
          representable: true, reason: "carrier_recorded", unmerged_at: null,
        },
        {
          merged_id: "cp-old", merged_name: "Legacy Party", kind: "vendor",
          survivor_id: "cp1", survivor_name: "Acme Sdn Bhd",
          merged_at: null, merged_by: null, merged_by_name: null,
          merge_id: null, merge_reason: null, alias_id: null,
          representable: false, reason: "legacy_no_carrier", unmerged_at: null,
        },
      ],
    }),
    async () => {
      const h = await renderComponent(App());
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        const text = h.text();
        assert.match(text, /A correction could be described: the merge recorded what it did/);
        assert.match(text, /A correction cannot be described: this merge predates the lineage record/);
        assert.match(text, /There is no un-merge action anywhere in Clara/);
        assert.match(text, /same SSM, two spellings/);
        // A missing reason is shown as absent, never invented.
        assert.doesNotMatch(text, /Reason: null/);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
