// The two READ-ONLY chatTurn_v16 cards — `agent_receipt` and `freeform_result`
// (P6-2, ruling Q8). The act-bearing pair has its own suite beside its own
// component (./v16-act-cards.test.tsx), and 裁-20's sweep upgrade its own
// (./sweep-receipt-card.test.tsx).
//
// THE ASSERTION SHAPE — "the DB row, rendered; the model's payload, not."
// Unlike the v14 receipt cards (which render the wire and stop), these HYDRATE,
// so a green here has to prove three different things and each has its own cell:
//
//   1. THE READ IS ADDRESSED CORRECTLY. Asserted against the actual request URL,
//      not against what the card displayed afterwards — a card can render the
//      right-looking text off a wrong query that happened to return one row.
//   2. THE DB'S OWN VALUES REACH THE SCREEN, verbatim.
//   3. A MODEL-AUTHORED PAYLOAD DOES NOT. Each card has exactly one open
//      `Record<string, unknown>` its own header says it never walks; each of
//      those gets a mutant carrying a distinctive numeral, and the cell reds if
//      that numeral is ever formatted onto the screen (hard constraint 2:
//      "no model-generated numeral enters a durable artifact"). A test that only
//      asserted the good fields render would pass just as happily with the card
//      dumping `JSON.stringify(verdict)` beside them.
//
// AND THE FAIL-CLOSED CELL PER CARD, which asserts the ABSENCE OF A REQUEST and
// not merely the presence of a notice: a card whose wire payload cannot address
// an object must not fire `id=eq.undefined` at the database and then render
// whatever came back as if it were the addressed row.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { PartRenderer, FALLBACK_UNSUPPORTED_PREFIX } from "./PartRenderer";
import type { AgentReceiptPart, ClaraPart, FreeformResultPart } from "../../lib/parts/types";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Every URL the card actually requested, in order — the instrument cell 1
 *  above measures. */
type Seen = { urls: string[] };

function withMockedEnv(impl: (url: string) => Response, run: (seen: Seen) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const seen: Seen = { urls: [] };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (u: unknown) => {
    const url = String(u);
    seen.urls.push(url);
    return impl(url);
  }) as typeof fetch;
  configureSessionTokenSource(async () => "tok");
  return run(seen).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function App(part: ClaraPart): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(PartRenderer, { part }),
  });
}

/** Every <a href> the card rendered, in document order. */
function hrefs(h: { container: Stub }): string[] {
  const out: string[] = [];
  const walkNode = (n: Stub) => {
    if (n.tagName === "A") {
      const href = (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href");
      if (href) out.push(href);
    }
    for (const c of ((n.childNodes as Stub[] | undefined) ?? [])) walkNode(c);
  };
  walkNode(h.container);
  return out;
}

// --- agent_receipt -----------------------------------------------------------

const RECEIPT: AgentReceiptPart = {
  type: "agent_receipt",
  receipt_kind: "entry_post",
  receipt_id: "receipt-7f10",
  client_id: "client-9b71",
};

/** One `clara.agent_receipts_visible` row, the 19-column contract. `verdict` is
 *  the open jsonb the card's header says it never walks — the numeral inside is
 *  the mutant cell 3 hunts for, and it is here in the BASELINE row on purpose:
 *  every positive cell below therefore also proves the payload stayed off the
 *  screen while the good fields reached it. */
const RECEIPT_ROW = {
  receipt_kind: "entry_post",
  receipt_id: "receipt-7f10",
  firm_id: "firm-1",
  client_id: "client-9b71",
  subject_id: "entry-4d21",
  acting_actor: "clara-agent",
  on_behalf_of: "user-tao",
  occurred_at: "2026-08-30T02:15:00Z",
  model: "claude-fable-5",
  model_version: "2026-08-01",
  rationale: "Vendor matched an existing coding rule.",
  verdict: { admitted: true, model_total_cents: 505050 },
  failing_rungs: ["counterparty_resolved"],
  via_wake_kind: "interactive",
  trigger_kind: "document",
  trigger_id: "doc-1",
  authorization_id: null,
  adopted_verbatim: true,
  scope: "client",
};

test("agent_receipt addresses its read by the PAIR (receipt_kind, receipt_id) — never by the id alone", async () => {
  await withMockedEnv(
    () => jsonResponse([RECEIPT_ROW]),
    async (seen) => {
      const h = await renderComponent(App(RECEIPT));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const read = seen.urls.find((u) => u.includes("/rest/v1/agent_receipts_visible"));
        assert.ok(read, "the card must read agent_receipts_visible");
        // The address is the PAIR: receipt_id is a member table's primary key,
        // unique inside that table and nowhere else, so a single-column filter
        // does not name a row of this UNION view at all.
        assert.match(read, /receipt_kind=eq\.entry_post/, "receipt_kind is the discriminator — it MUST be in the filter");
        assert.match(read, /receipt_id=eq\.receipt-7f10/, "receipt_id must be in the filter");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("agent_receipt renders the DB row's own facts and links to the client workspace that owns the act", async () => {
  await withMockedEnv(
    () => jsonResponse([RECEIPT_ROW]),
    async () => {
      const h = await renderComponent(App(RECEIPT));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const text = h.text();
        assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX), "agent_receipt must never reach the unsupported-part chip");
        assert.match(text, /Agent receipt/);
        assert.match(text, /entry_post/, "the receipt kind must render");
        assert.match(text, /clara-agent/, "acting_actor must render");
        assert.match(text, /user-tao/, "on_behalf_of must render");
        assert.match(text, /claude-fable-5 2026-08-01/, "model and model_version are two typed columns, joined for display only");
        assert.match(text, /Vendor matched an existing coding rule/, "the agent's stated reason is DB-stored prose — rendered verbatim");
        assert.match(text, /counterparty_resolved/, "a failing rung must render");
        assert.deepEqual(hrefs(h), ["/clients/client-9b71"], "a client-scoped receipt links to that client's workspace");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("agent_receipt fails closed when the hydrated row belongs to a different client than the wire part", async () => {
  await withMockedEnv(
    () => jsonResponse([{ ...RECEIPT_ROW, client_id: "client-other" }]),
    async () => {
      const h = await renderComponent(App(RECEIPT));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const text = h.text();
        assert.match(text, /could not be opened/, "a client mismatch must use the malformed-part fallback");
        assert.doesNotMatch(text, /clara-agent/, "no fact from the mismatched hydrated row may render");
        assert.doesNotMatch(text, /Vendor matched an existing coding rule/, "no receipt prose may cross the identity wall");
        assert.deepEqual(hrefs(h), [], "a mismatched row proves no destination");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("agent_receipt fails closed when the wire declares firm altitude but hydration returns a client row", async () => {
  await withMockedEnv(
    () => jsonResponse([RECEIPT_ROW]),
    async () => {
      const h = await renderComponent(App({ ...RECEIPT, client_id: null }));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const text = h.text();
        assert.match(text, /could not be opened/, "wire null versus hydrated non-null is an identity mismatch");
        assert.doesNotMatch(text, /client-9b71/, "the client-scoped row must not be laundered into a firm-altitude receipt");
        assert.deepEqual(hrefs(h), [], "the mismatched client route must not render");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("agent_receipt NEVER formats a numeral out of the model-authored `verdict` payload", async () => {
  await withMockedEnv(
    () => jsonResponse([RECEIPT_ROW]),
    async () => {
      const h = await renderComponent(App(RECEIPT));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const text = h.text();
        // `verdict` is an open Record<string, unknown> the agent's own lane
        // shaped. A figure inside it is model-authored by construction, so
        // rendering one would put a model-generated numeral on a professional's
        // screen dressed as a ledger fact (hard constraint 2).
        assert.doesNotMatch(text, /505050/, "a numeral inside `verdict` must never reach the screen");
        assert.doesNotMatch(text, /\[object Object\]/, "an open payload has no honest rendering — it must not be stringified either");
        // The card must not have gone silent to achieve that: the good fields
        // are still asserted present, so this cell cannot pass vacuously.
        assert.match(text, /clara-agent/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("agent_receipt on a structurally client-less act renders firm-altitude and links to the firm feed — never an invented client route", async () => {
  await withMockedEnv(
    () => jsonResponse([{ ...RECEIPT_ROW, client_id: null, scope: "firm" }]),
    async () => {
      // The wire part's own client_id is null too — the view's ordinal 4 case:
      // "NULL where the act is structurally client-less".
      const h = await renderComponent(App({ ...RECEIPT, client_id: null }));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const text = h.text();
        assert.match(text, /firm-wide \(no client\)/, "a null client must render as firm-altitude, never be inferred");
        assert.doesNotMatch(text, /\/clients\/\//, "never a client route built out of an absent id");
        assert.deepEqual(hrefs(h), ["/activity"], "a firm-altitude receipt links to the feed built over this very view");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("agent_receipt with a BLANK receipt_id fails closed: a visible notice, and NO request is ever made", async () => {
  await withMockedEnv(
    () => {
      throw new Error("no request may be made for an unaddressable part");
    },
    async (seen) => {
      const h = await renderComponent(App({ ...RECEIPT, receipt_id: "   " }));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        // Refusing to READ is the point; the notice is only how it is made
        // visible. A card that hydrated on a blank id would fire
        // `receipt_id=eq.` at the database and render whatever came back.
        assert.deepEqual(seen.urls, [], "an unaddressable part must never reach the network");
        assert.match(h.text(), /could not be opened/, "the failure must be VISIBLE, never a silent null");
        assert.match(h.text(), /receipt_kind, receipt_id/, "the notice names which fields are missing, so it is diagnosable from the screen");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("agent_receipt renders the honest 'not visible' state when RLS admits no such row — never a fabricated receipt", async () => {
  await withMockedEnv(
    () => jsonResponse([]),
    async () => {
      const h = await renderComponent(App(RECEIPT));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const text = h.text();
        assert.match(text, /not visible to your session/, "an empty read is the DB's honest answer, not an error it never raised");
        assert.doesNotMatch(text, /clara-agent/, "no field of a row that was not returned may appear");
        assert.deepEqual(hrefs(h), [], "no row means no proven destination, so no link");
      } finally {
        await h.unmount();
      }
    },
  );
});

// --- freeform_result ---------------------------------------------------------

const FREEFORM: FreeformResultPart = { type: "freeform_result", read_id: "90071992547409911" };

/** One `clara.freeform_read_log` row. `rung_vector` and `model_snapshot` are the
 *  two open payloads this card's header says it never walks; both carry a
 *  distinctive numeral for the same reason `verdict` does above. `row_count`,
 *  `byte_count` and `duration_ms` are typed DB columns and MUST render. */
const FREEFORM_ROW = {
  id: 90071992547409911,
  firm_id: "firm-1",
  credential_id: "cred-1",
  query_text: "select account_code, sum(amount_cents) from clara.journal_entry_legs group by 1",
  purpose: "Checking which accounts moved this month.",
  at: "2026-08-30T03:00:00Z",
  verb: "wake_freeform_read",
  scope: "client",
  client_scope: ["client-9b71"],
  acting_actor: "clara-agent",
  on_behalf_of: "user-tao",
  via_wake_kind: "interactive_client",
  task_id: "task-1",
  op_key: "op-1",
  settled_at: "2026-08-30T03:00:02Z",
  outcome: "ok",
  refusal_reason: null,
  rung_vector: { scope_compiled: "pass", model_row_estimate: 777777 },
  relations_read: ["clara.journal_entry_legs"],
  row_count: 42,
  byte_count: 1180,
  duration_ms: 37,
  model_snapshot: { provider: "anthropic", model_reported_rows: 888888 },
};

test("freeform_result renders the audited receipt: the SQL the DATABASE ran, and the DB's own counts", async () => {
  await withMockedEnv(
    () => jsonResponse([FREEFORM_ROW]),
    async (seen) => {
      const h = await renderComponent(App(FREEFORM));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const text = h.text();
        assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX), "freeform_result must never reach the unsupported-part chip");
        // The bigint id stays a STRING the whole way — it is filtered as text,
        // never converted through a JS number that could come back wrong.
        const read = seen.urls.find((u) => u.includes("/rest/v1/freeform_read_log"));
        assert.ok(read, "the card must read freeform_read_log");
        assert.match(read, /id=eq\.90071992547409911/, "the receipt is addressed by its own primary key, verbatim");
        assert.match(text, /Freeform read/);
        assert.ok(text.includes(FREEFORM_ROW.query_text), "the SQL the database ran must render verbatim");
        assert.match(text, /Checking which accounts moved this month/, "the stated purpose is DB-stored prose");
        assert.match(text, /clara\.journal_entry_legs/, "a relation read must render");
        // DB-OWNED FIGURES: typed columns, printed as the DB wrote them.
        assert.match(text, /42/, "row_count is a typed DB column and must render");
        assert.match(text, /1180/, "byte_count is a typed DB column and must render");
        assert.match(text, /37/, "duration_ms is a typed DB column and must render");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("freeform_result NEVER formats a numeral out of `rung_vector` or `model_snapshot`", async () => {
  await withMockedEnv(
    () => jsonResponse([FREEFORM_ROW]),
    async () => {
      const h = await renderComponent(App(FREEFORM));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        const text = h.text();
        assert.doesNotMatch(text, /777777/, "a numeral inside `rung_vector` must never reach the screen");
        assert.doesNotMatch(text, /888888/, "a numeral inside `model_snapshot` must never reach the screen");
        assert.doesNotMatch(text, /\[object Object\]/);
        // Non-vacuity: the DB-owned counts DID render in the same paint, so this
        // cell is measuring a distinction the card draws, not a blank screen.
        assert.match(text, /1180/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("freeform_result links to a client's reports ONLY when the receipt names exactly one", async () => {
  await withMockedEnv(
    () => jsonResponse([FREEFORM_ROW]),
    async () => {
      const h = await renderComponent(App(FREEFORM));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.deepEqual(hrefs(h), ["/clients/client-9b71/reports"], "exactly one client in scope is a destination the row PROVES");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("freeform_result offers NO link when the read names two clients, or none — picking one would be inventing a destination", async () => {
  await withMockedEnv(
    () => jsonResponse([{ ...FREEFORM_ROW, client_scope: ["client-9b71", "client-other"] }]),
    async () => {
      const h = await renderComponent(App(FREEFORM));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /Freeform read/, "the card itself must still render");
        assert.deepEqual(hrefs(h), [], "two clients in scope means no single honest destination");
      } finally {
        await h.unmount();
      }
    },
  );

  await withMockedEnv(
    // 0131's own CHECK forces client_scope NULL whenever scope = 'firm'.
    () => jsonResponse([{ ...FREEFORM_ROW, scope: "firm", client_scope: null }]),
    async () => {
      const h = await renderComponent(App(FREEFORM));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(h.text(), /Freeform read/);
        assert.deepEqual(hrefs(h), [], "a firm-scope read has no client page to point at");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("freeform_result with a BLANK read_id fails closed: a visible notice, and NO request is ever made", async () => {
  await withMockedEnv(
    () => {
      throw new Error("no request may be made for an unaddressable part");
    },
    async (seen) => {
      const h = await renderComponent(App({ ...FREEFORM, read_id: "" }));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.deepEqual(seen.urls, [], "an unaddressable part must never reach the network");
        assert.match(h.text(), /could not be opened/);
        assert.match(h.text(), /read_id/, "the notice names the missing field");
      } finally {
        await h.unmount();
      }
    },
  );
});
