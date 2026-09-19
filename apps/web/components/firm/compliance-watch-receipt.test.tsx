// #659 / C88.10 — THE ACKNOWLEDGEMENT ECHO. `compliance-watch-affordance.test.tsx` proves the
// three ACTS; this file proves the half C88.10 actually names and that has never existed: after an
// acknowledgement, the card can say WHO did it and WHEN — and still says it after a reload, because
// the receipt is table state read back through `clara.get_compliance_watch_disposition`, not
// anything this component remembers.
//
// IT IS DRIVEN THROUGH THE REAL INBOX MOUNT, like its sibling: the affordance is dispatched by
// `needs-you-affordances.tsx`'s registry, and a hand-mounted component would prove the receipt
// renders somewhere rather than that it renders where a person will meet it. The SAME component is
// what `components/tax/SstWatchSection.tsx` mounts on `/clients/:id/tax`, which is why one edit
// reached both altitudes and why the browser cell stands in for that mount (its e2e fixtures belong
// to another lane's mock).
//
// AND IT NAMES NO VERSION. The acceptance criterion asks for actor / time / version; this schema
// carries no version column at all, so the receipt renders `state_before → state_after` and says so
// in words. The last cell asserts the absence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { NeedsYouInbox } from "./needs-you-inbox";
import messages from "../../messages/en.json";
import type { ReviewQueueEnvelope } from "../../lib/firm/needs-you";

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

function envelope(): ReviewQueueEnvelope {
  return {
    watermark: "w1",
    counts: { ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 1, lint_findings: 0 },
    sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
    rows: [{
      row_kind: "compliance_watch", section: "needs_you", client_id: "c1", counterparty_id: null, filing_id: null,
      entry_id: null, question_id: null, task_id: null, document_id: null, lane: null, auto: false,
      rule_backed: false, high_stakes: false, aged_since: "2026-07-01T00:00:00Z", amount_cents: null, period: "2026-07-31",
      question_text: "SST registration threshold watch (digital_services)", created_at: "2026-07-01T00:00:00Z", id: "w1",
      coding_kind: null, watch_id: "w1", tier: "crossed", finding_id: null, asset_id: null, advance_id: null,
      client_name: null, batch_ids: null, open_proposal_count: null,
    }],
    next_cursor: null,
  };
}

const NO_GAPS = {
  "/rest/v1/firm_open_questions_visible": [],
  "/rest/v1/client_identifier_promotions_visible": [],
  "/rest/v1/clients": [],
};

const ACKNOWLEDGED = {
  watch_id: "w1", client_id: "c1", service_group: "digital_services",
  watch_kind: "sst_registration", state: "crossed",
  acknowledged_by: "8a7b6c5d-0000-4000-8000-000000000001",
  acknowledged_at: "2026-09-18T02:30:00Z",
  snoozed_until: null, resolved_conclusion: null, resolved_by: null, resolved_at: null,
  resolved_evidence: null, updated_at: "2026-09-18T02:30:00Z",
  events: [
    {
      event_kind: "created", state_before: null, state_after: "monitored",
      figures: {}, actor: null, rationale: null, created_at: "2026-07-01T00:00:00Z",
    },
    {
      event_kind: "acknowledged", state_before: "crossed", state_after: "crossed",
      figures: {}, actor: "8a7b6c5d-0000-4000-8000-000000000001",
      rationale: "Client informed; registration in progress.",
      created_at: "2026-09-18T02:30:00Z",
    },
  ],
};

/** The firm roster the receipt resolves its actor through — `clara.firm_members_visible`, the same
 *  relation the activity band's `ActivityActorLine` already uses. */
const ROSTER = [
  {
    user_id: "8a7b6c5d-0000-4000-8000-000000000001",
    display_name: "Siti Rahman",
    role: "bookkeeper",
    created_at: "2026-01-01T00:00:00Z",
  },
];

const NOT_ACKNOWLEDGED = { ...ACKNOWLEDGED, acknowledged_by: null, acknowledged_at: null, events: [ACKNOWLEDGED.events[0]] };

/** `disposition` is a FUNCTION of the call index, so a cell can make the FIRST read answer
 *  "nothing recorded" and the read after the act answer the receipt — which is what a real
 *  acknowledgement looks like from the browser's side. */
function mockFetchFactory(opts: {
  disposition: (call: number) => unknown;
  act?: { url: string; body: unknown; status: number };
  /** #659 fix round 1 (A7): the firm roster the receipt resolves its actor through. `undefined`
   *  means "this read fails", which is the state every cell was in before A7 and the state a real
   *  browser is in when the roster read is refused — the receipt must still name the act. */
  roster?: unknown[];
}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  let dispositionCalls = 0;
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (init?.body) calls.push({ url: u, body: JSON.parse(String(init.body)) });
    if (u.includes("/rpc/get_compliance_watch_disposition")) {
      dispositionCalls += 1;
      const answer = opts.disposition(dispositionCalls);
      if (answer === null) return jsonResponse({ code: "CLR11", message: "watch not found" }, 400);
      return jsonResponse(answer);
    }
    if (opts.act && u.includes(opts.act.url)) return jsonResponse(opts.act.body, opts.act.status);
    if (u.includes("/rpc/list_review_queue")) return jsonResponse(envelope());
    if (u.includes("/firm_members_visible")) {
      if (opts.roster === undefined) return jsonResponse({ message: "roster unavailable" }, 403);
      return jsonResponse(opts.roster);
    }
    for (const [path, body] of Object.entries(NO_GAPS)) {
      if (u.includes(path)) return jsonResponse(body);
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  return { impl, calls, dispositionCalls: () => dispositionCalls };
}

async function mount() {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement("div", null, createElement("h1", null, "Needs you"), createElement(NeedsYouInbox)),
    }),
  );
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 5; i++) await h.settle();
  return { h, body };
}

// ===========================================================================================

test("C88.10: the receipt names the ACTOR and the INSTANT the write stamped, and the transition the table actually holds", async () => {
  const { impl } = mockFetchFactory({ disposition: () => ACKNOWLEDGED, roster: ROSTER });
  await withMockedEnv(impl, async () => {
    const { h } = await mount();
    try {
      const text = h.text();
      assert.match(text, /Disposition/, "the card carries a named block, not a loose sentence");
      assert.match(text, /Acknowledged by Siti Rahman/,
        "the actor is the one the DATABASE stamped — resolved to the colleague's NAME, never the reader's");
      assert.doesNotMatch(text, /8a7b6c5d-0000-4000-8000-000000000001/,
        "and a professional reads a person, not a uuid");
      assert.match(text, /State crossed → crossed/,
        "an acknowledgement is an overlay — it never erases the condition");
      assert.match(text, /Client informed; registration in progress\./,
        "with the rationale the door demanded");
    } finally { await h.unmount(); for (let i = 0; i < 3; i++) await h.settle(); }
  });
});

test("C88.10: it SURVIVES a remount — the receipt is table state, read back, not anything this component kept", async () => {
  const { impl, dispositionCalls } = mockFetchFactory({ disposition: () => ACKNOWLEDGED, roster: ROSTER });
  await withMockedEnv(impl, async () => {
    const first = await mount();
    let firstText = "";
    try { firstText = first.h.text(); } finally { await first.h.unmount(); for (let i = 0; i < 3; i++) await first.h.settle(); }
    assert.match(firstText, /Acknowledged by/);

    // A REMOUNT is what a browser reload is, from this component's point of view: every piece of
    // memory it holds is gone and the only thing that can bring the receipt back is a read.
    const second = await mount();
    try {
      assert.match(second.h.text(), /Acknowledged by Siti Rahman/,
        "the act, its actor and its instant all come from the table — the roster read is remade too");
      assert.ok(dispositionCalls() >= 2, "and it came back because the door was asked again");
    } finally { await second.h.unmount(); for (let i = 0; i < 3; i++) await second.h.settle(); }
  });
});

test("C88.10: before any act the card says NOTHING has been recorded — not a blank, and not a fabricated actor", async () => {
  const { impl } = mockFetchFactory({ disposition: () => NOT_ACKNOWLEDGED });
  await withMockedEnv(impl, async () => {
    const { h } = await mount();
    try {
      assert.match(h.text(), /Nothing has been recorded on this watch yet/);
      assert.doesNotMatch(h.text(), /Acknowledged by/);
      assert.doesNotMatch(h.text(), /State .* →/, "a `created` sweep row is the evaluator's, not a person's act");
    } finally { await h.unmount(); for (let i = 0; i < 3; i++) await h.settle(); }
  });
});

test("C88.10: a read that did not answer says SO — absence of evidence is not evidence of absence", async () => {
  const { impl } = mockFetchFactory({ disposition: () => null });
  await withMockedEnv(impl, async () => {
    const { h } = await mount();
    try {
      assert.match(h.text(), /could not be read/);
      assert.doesNotMatch(h.text(), /Nothing has been recorded/,
        "a failed read must never be reported as an empty disposition");
    } finally { await h.unmount(); for (let i = 0; i < 3; i++) await h.settle(); }
  });
});

test("C88.10: a REFUSED acknowledgement leaves the typed rationale standing AND the standing disposition unchanged", async () => {
  // The receipt re-reads after EVERY act, refused ones included, precisely so this cell can prove
  // the standing disposition was not disturbed by a refusal — rather than assuming it.
  const { impl, calls, dispositionCalls } = mockFetchFactory({
    disposition: () => NOT_ACKNOWLEDGED,
    act: { url: "/rpc/ack_compliance_watch", body: { code: "CLR10", message: "a resolved watch cannot be acknowledged" }, status: 400 },
  });
  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const before = dispositionCalls();
      const trigger = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Acknowledge");
      assert.ok(trigger);
      await h.fireEvent(trigger! as never, "click");
      await h.settle();

      const typed = "Client says the registration was filed; awaiting the receipt.";
      const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(textarea);
      await h.act(() => { setFieldValue(textarea as never, typed); });

      const confirm = findIn(body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Acknowledge" && (n as unknown) !== (trigger as unknown));
      assert.ok(confirm);
      await h.act(() => { clickButton(confirm as never); });
      for (let i = 0; i < 6; i++) await h.settle();

      assert.ok(calls.some((c) => c.url.includes("/rpc/ack_compliance_watch")), "the door was called");
      assert.match(h.text(), /a resolved watch cannot be acknowledged/, "and its refusal renders VERBATIM");

      const stillThere = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(stillThere, "the form stayed open");
      assert.equal((stillThere as unknown as { value?: string }).value, typed,
        "a refusal must not discard what the human typed");

      assert.ok(dispositionCalls() > before, "the receipt was re-read after the refusal");
      assert.match(h.text(), /Nothing has been recorded on this watch yet/,
        "and the standing disposition is exactly what it was — a refusal changed nothing");
    } finally { await h.unmount(); for (let i = 0; i < 3; i++) await h.settle(); }
  });
});

test("C88.10: the receipt names NO version number, and says why", async () => {
  const { impl } = mockFetchFactory({ disposition: () => ACKNOWLEDGED });
  await withMockedEnv(impl, async () => {
    const { h } = await mount();
    try {
      assert.match(h.text(), /carries no version number/,
        "the absence is NAMED rather than filled with a figure nothing produced");
      assert.doesNotMatch(h.text(), /[Vv]ersion \d/, "and certainly not with an invented one");
    } finally { await h.unmount(); for (let i = 0; i < 3; i++) await h.settle(); }
  });
});

test("C88.10 (fix round 1, A7): an UNREADABLE roster falls back to the shortened id — never a blank, never a guess", async () => {
  // The roster read can be refused, and the receipt is still the evidence that an act happened.
  // `MemberName`'s own fallback is what renders here — the shortened id in the monospace treatment
  // the product already uses for ids — so this surface cannot invent a name and cannot print
  // nothing. `roster: undefined` makes the read answer 403, which is the real shape.
  const { impl } = mockFetchFactory({ disposition: () => ACKNOWLEDGED });
  await withMockedEnv(impl, async () => {
    const { h } = await mount();
    try {
      const text = h.text();
      assert.match(text, /Acknowledged by 8a7b6c5d/, "the id, shortened, rather than a blank");
      assert.doesNotMatch(text, /Acknowledged by on/, "and never an empty actor slot");
      assert.match(text, /State crossed → crossed/, "the rest of the receipt is unaffected");
    } finally { await h.unmount(); for (let i = 0; i < 3; i++) await h.settle(); }
  });
});
