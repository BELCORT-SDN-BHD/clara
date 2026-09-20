// #624 — THE FOUR STATES, and the one thing this panel must never do: show a success that did
// not happen.
//
// The headline cell is the payroll PDF. Its bytes are sealed, its OCR finished, and the facts
// router terminated the pair with `skipped_kind` at filing time — so the OLD surface rendered
// "extraction: done" and nothing else, and a professional reasonably concluded Clara had
// understood the document. Every assertion below exists to make that reading impossible: the
// four states are separately named, the facts state says "none for this type" with the registry's
// own sentence beneath it, and no success word reaches the facts or operation row.
//
// THE READ IS MOCKED AT `fetch`, never at the component's own module boundary: the panel calls
// `getDocumentState` -> `callDoor` -> a real PostgREST POST, and mocking any layer above the wire
// would prove only that this test can call its own stub. The coding-lane a11y battery's
// `withMockedEnv` idiom, reused verbatim.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { DocumentStatePanel } from "./document-state-panel";
import messages from "../../messages/en.json";
import type { DocumentStateResult } from "../../lib/documents/document-state";

enableDomInspection();

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

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

type Stub = {
  tagName?: string;
  childNodes?: Stub[];
  getAttribute?: (key: string) => string | null;
};

/** Every `role="group"` node's own `aria-label`, in document order — the harness exposes
 *  attributes through `getAttribute` (hookHarness.ts:175-179), never as a plain object. */
function groupLabels(root: Stub): string[] {
  const out: string[] = [];
  const walk = (n: Stub) => {
    if (n.getAttribute?.("role") === "group") {
      const label = n.getAttribute("aria-label");
      if (label) out.push(label);
    }
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(root);
  return out;
}

/** Mount the panel against ONE `get_document_state` answer. */
async function mount(result: DocumentStateResult | null, run: (text: () => string, container: Stub) => Promise<void>) {
  await withMockedEnv(
    (async (u: string | URL | Request) => {
      const url = String(u);
      if (url.includes("/rpc/get_document_state")) return jsonResponse(result);
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App(createElement(DocumentStatePanel, {
        documentId: "doc-1", clientId: "client-1",
      })));
      try {
        await h.settle();
        await run(() => h.text(), h.container as unknown as Stub);
      } finally {
        await h.unmount();
      }
    },
  );
}

/** The payroll PDF: stored, byte-extracted, and deliberately nothing further. Every value is the
 *  one `clara.get_document_state` actually returns for that pair on a migrated rig — the registry
 *  row is `pdf x payroll_summary` -> byte_extraction supported, typed_facts stored_only,
 *  business_operation stored_only... except that payroll IS a codeable kind, so the operation row
 *  is the "a person completes this" state, not a promise Clara will. */
const PAYROLL: DocumentStateResult = {
  document_id: "doc-1",
  document_kind: "payroll_summary",
  mime_type: "application/pdf",
  format: "pdf",
  capability: {
    format: "pdf", document_kind: "payroll_summary", mime_type: "application/pdf",
    custody: "supported", byte_extraction: "supported",
    typed_facts: "stored_only", business_operation: "stored_only",
    engine_id: "azure-di:prebuilt-layout:2024-11-30", engine_byte: "azure-di:prebuilt-layout:2024-11-30",
    registry_version: 1,
    basis: "Bytes are sealed at intake and read by azure-di:prebuilt-layout:2024-11-30. The facts router terminates this pair cleanly (skipped_kind / skipped_type): the document stays stored and readable and Clara derives no typed facts from it. The filing appears as work a person completes; Clara derives nothing to drive it.",
    limits: {}, known_pair: true, kind_known: true,
  },
  custody: {
    state: "verified", sha256: "abcdef0123456789abcdef", byte_size: 1024,
    bytes_verified_at: "2026-04-01T00:00:00Z", legal_hold: false, legal_hold_reason: null,
    retention_state: "anchored", retain_until: "2035-12-31", capability: "supported",
  },
  byte_extraction: {
    status: "done", page_count: 2, capability: "supported",
    engine_id: "azure-di:prebuilt-layout:2024-11-30",
    tasks: [{
      id: "t1", lane: "ocr", status: "done", engine_id: "azure-di:prebuilt-layout:2024-11-30",
      version_n: 1, attempt_count: 1, error_code: null, finished_at: "2026-04-01T00:01:00Z",
    }, {
      id: "t2", lane: "invoice_facts", status: "failed", engine_id: "azure-di:prebuilt-invoice:2024-11-30",
      version_n: 1, attempt_count: 0, error_code: "skipped_kind", finished_at: "2026-04-01T00:01:00Z",
    }],
  },
  facts: { capability: "stored_only", limits: {}, extractions: [], validations: [] },
  operation: { capability: "stored_only", codeable_kind: true, entries: [], statements: [] },
  lineage: {
    sha256: "abcdef0123456789abcdef", intakes: [], filings: [], corrections: [],
    authoritative_extraction_id: null,
  },
};

/** An invoice PDF whose six-term identity FAILED. Facts landed, they are readable, and the
 *  failing check is named. */
const INVALID_INVOICE: DocumentStateResult = {
  ...PAYROLL,
  document_kind: "invoice",
  capability: {
    ...PAYROLL.capability,
    document_kind: "invoice", typed_facts: "supported", business_operation: "supported",
    engine_id: "llm-openai:gpt-5.6-terra:v2",
    basis: "Bytes are sealed at intake and read by azure-di:prebuilt-layout:2024-11-30. Typed facts are persisted with source regions by llm-openai:gpt-5.6-terra:v2. A filed document of this kind carries a business operation Clara can drive from those facts.",
    limits: { invoice_line_items: "accepted_limitation", invoice_line_items_reason: "no_consumer_reads_line_facts" },
  },
  facts: {
    capability: "supported",
    limits: { invoice_line_items: "accepted_limitation", invoice_line_items_reason: "no_consumer_reads_line_facts" },
    extractions: [{
      id: "ext-1", engine_kind: "llm_text_facts", engine_id: "llm-openai:gpt-5.6-terra:v2",
      version_n: 3, status: "done", superseded_by: null,
      extracted_at: "2026-04-01T00:05:00Z", region_count: 7,
    }],
    validations: [{
      check_name: "invoice.six_term_identity", outcome: "fail",
      detail: { total_cents: 12852, residual_cents: 100 },
      extraction_id: "ext-1", statement_id: null,
      engine_id: "llm-openai:gpt-5.6-terra:v2", evaluated_at: "2026-04-01T00:05:00Z",
    }],
  },
  operation: { capability: "supported", codeable_kind: true, entries: [], statements: [] },
};

/** An OFX bank statement: bytes sealed, never read at intake, facts impossible by format. */
const OFX_STATEMENT: DocumentStateResult = {
  ...PAYROLL,
  document_kind: "bank_statement",
  mime_type: "application/x-ofx",
  format: "ofx",
  capability: {
    ...PAYROLL.capability,
    format: "ofx", document_kind: "bank_statement", mime_type: "application/x-ofx",
    byte_extraction: "stored_only", typed_facts: "unsupported", business_operation: "stored_only",
    engine_id: "clara-store-only:v1", engine_byte: "clara-store-only:v1",
    basis: "Bytes are sealed at intake and deliberately NOT read there (clara-store-only:v1). The OFX reader parses the file, but OFX carries no opening balance, so the statement identity can never close and corroboration refuses header_unreadable. No typed facts are possible for this pair.",
    limits: { opening_balance: "absent_in_format" },
  },
  byte_extraction: {
    status: "pending", page_count: 1, capability: "stored_only",
    engine_id: "clara-store-only:v1", tasks: [],
  },
  facts: { capability: "unsupported", limits: { opening_balance: "absent_in_format" }, extractions: [], validations: [] },
};

/** The same invoice, coded and posted. Its operation row must offer a LINK, not a count. */
const POSTED_INVOICE: DocumentStateResult = {
  ...INVALID_INVOICE,
  facts: {
    ...INVALID_INVOICE.facts,
    validations: [{
      check_name: "invoice.six_term_identity", outcome: "pass", detail: { residual_cents: 0 },
      extraction_id: "ext-1", statement_id: null,
      engine_id: "llm-openai:gpt-5.6-terra:v2", evaluated_at: "2026-04-01T00:05:00Z",
    }],
  },
  operation: {
    capability: "supported", codeable_kind: true, statements: [],
    entries: [{ entry_id: "11111111-2222-4333-8444-555555555555", status: "approved" }],
  },
};

/** #988 — the same document, at business_operation's FIFTH level. Clara reads the pair and
 *  derives a real proposal, and stops there: a person confirms before anything is booked.
 *  Nothing is coded yet, which is the ONE state where this level and the store-only level had
 *  been telling a professional the same thing. */
const PROPOSAL_ONLY: DocumentStateResult = {
  ...PAYROLL,
  operation: { capability: "proposal_only", codeable_kind: true, entries: [], statements: [] },
};

const SUCCESS_WORDS = /\bvalidated\b|\bverified facts\b|\bcomplete\b|\bsuccess\b/i;

/** Every anchor's href, in document order. */
function hrefs(root: Stub): string[] {
  const out: string[] = [];
  const walk = (n: Stub) => {
    if (n.tagName === "A") {
      const href = n.getAttribute?.("href");
      if (href) out.push(href);
    }
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(root);
  return out;
}

test("a payroll_summary PDF renders custody=verified, extraction=done, facts=none-for-this-type, operation=a person's — four SEPARATE states", async () => {
  await mount(PAYROLL, async (text) => {
    const t = text();
    assert.match(t, /Bytes verified/, "custody is its own state");
    assert.match(t, /Done/, "extraction is its own state");
    assert.match(t, /None for this type/, "facts is its own state, and it is not a success");
    assert.match(t, /Not coded yet/, "operation is its own state");
    // The registry's own sentence, verbatim — this is the thing that explains the other four.
    assert.match(t, /terminates this pair cleanly/,
      "the capability basis must be rendered verbatim, not paraphrased by the UI");
    assert.match(t, /capability registry v1/, "the registry version is stated so a later answer can be told from this one");
  });
});

test("a payroll_summary PDF NEVER shows a facts or operation success badge — the placeholder-success class, closed", async () => {
  await mount(PAYROLL, async (text) => {
    const t = text();
    assert.doesNotMatch(t, /Recorded and checked/, "a kind with no facts lane must never read as checked facts");
    assert.doesNotMatch(t, /\bPosted\b/, "nothing was posted");
    assert.doesNotMatch(t, SUCCESS_WORDS, "no success word may reach this document's states");
    // …and the message KEYS themselves must never leak, which a dynamic-key cast would cause.
    assert.doesNotMatch(t, /stateFacts\.|stateOperation\.|capabilityLimit\./,
      "a translation key reached the user — the checked-lookup discipline was broken");
  });
});

test("the extraction row names EVERY task with its engine and its error code — 'done' can never stand in for 'understood'", async () => {
  await mount(PAYROLL, async (text) => {
    const t = text();
    assert.match(t, /azure-di:prebuilt-layout:2024-11-30/, "the byte-extraction engine is named");
    assert.match(t, /skipped_kind/,
      "the router's own terminal receipt is shown — it is the reason the facts row says what it says");
  });
});

test("the four states are announced BY NAME: each row is a labelled group of '<axis>: <state>'", async () => {
  await mount(PAYROLL, async (_text, container) => {
    assert.deepEqual(groupLabels(container), [
      "Custody: Bytes verified",
      "Extraction: Done",
      "Facts: None for this type",
      "Operation: Not coded yet",
    ], "each axis must carry its own accessible name pairing the axis with its state");
  });
});

test("a FAILED arithmetic check names the check, keeps the facts readable, and states the source version", async () => {
  await mount(INVALID_INVOICE, async (text) => {
    const t = text();
    assert.match(t, /Failed a check/, "the facts state says a check failed");
    // "the invoice arithmetic tie" rather than "invoice totals identity", and the reason is a
    // measured one: the browser walk's own pre-existing cells locate the facts table by
    // `getByText("Invoice total")`, and a label containing that substring made two of them fail
    // on a strict-mode violation — the panel's own sentence and the table cell both matched.
    // A check label must not collide with the name of a field it judges.
    assert.match(t, /the invoice arithmetic tie/, "…and names WHICH check");
    assert.match(t, /stay readable below/,
      // NOTE: ticket numbers are spelled without the hash inside a STRING here — the repo's
      // no-raw-colour rule reads `#624` as a three-digit hex literal in app/** and components/**
      // (eslint.config.mjs's NO_RAW_COLOR_VALUES), and it is right to: a real `#abc` would be
      // invisible to the contrast gate. Comments are unaffected.
      "invalid facts remain visible (ticket 624, acceptance 2) — the panel says so rather than hiding them");
    assert.match(t, /version 3/, "the source extraction version is stated beside the facts");
    assert.match(t, /7 region/, "…with the region count that backs them");
    assert.match(t, /llm-openai:gpt-5\.6-terra:v2/, "…and the engine that produced them");
    // H-23: a named population WITHOUT its freshness is the ambiguous unencoded count H-23
    // exists to replace. The instant is rendered in the BUSINESS timezone (Asia/Kuala_Lumpur),
    // so 2026-04-01T00:05:00Z reads as 1 April 08:05 for every viewer, wherever they are.
    assert.match(t, /read 1 Apr 2026, 8:05 am/,
      "the reading's own freshness must be stated, in the business timezone rather than the viewer's");
  });
});

test("a supported invoice still declares its LINE-ITEM limit — header facts are not per-line facts", async () => {
  await mount(INVALID_INVOICE, async (text) => {
    const t = text();
    assert.match(t, /Per-line invoice facts: an accepted limitation/,
      "the registry's named limit must reach the reader, or 'facts recorded' overstates what was read");
    assert.doesNotMatch(t, /planned/i,
      "ticket 782: invoice line items are a standing limitation, never described as coming");
    assert.match(t, /Reason: nothing Clara posts through reads a per-line fact/,
      "the limitation carries its own reason, not a bare verdict (ticket 782)");

    // …AND THE REGISTRY'S MACHINE TOKENS DO NOT REACH THE ACCOUNTANT. `limits` is a
    // machine-readable column; the panel renders each pair through its OWN message key, which is
    // document-state.ts's stated reason for returning [name, level] pairs at all. Before this
    // fix the sentence read "Per-line invoice facts: accepted_limitation." — a snake_case
    // identifier is neither a sentence nor a reason a professional can act on.
    assert.doesNotMatch(t, /accepted_limitation/,
      "the limit's VALUE is rendered through its own message key, never interpolated raw");
    assert.doesNotMatch(t, /no_consumer_reads_line_facts/,
      "…and so is its reason");
  });
});

test("an unpublished limit VALUE degrades to the raw token rather than to a wrong sentence", async () => {
  const invented: DocumentStateResult = {
    ...INVALID_INVOICE,
    capability: { ...INVALID_INVOICE.capability, limits: { invoice_line_items: "some_future_value" } },
    facts: { ...INVALID_INVOICE.facts, limits: { invoice_line_items: "some_future_value" } },
  };
  await mount(invented, async (text) => {
    assert.match(text(), /Per-line invoice facts: some_future_value/,
      "a value this app has no phrase for is shown as it is — an honest unknown, the same rule "
      + "the panel already follows for an unnamed limit KEY, never a guessed sentence and never "
      + "a rendered message key");
    assert.doesNotMatch(text(), /capabilityLimitLevel/,
      "…and never the key itself, which is what a dynamic t(`x.${value}`) cast would print");
  });
});

test("an OFX bank statement is honestly stored: extraction NOT ATTEMPTED, facts impossible, and the format reason given", async () => {
  await mount(OFX_STATEMENT, async (text) => {
    const t = text();
    assert.match(t, /Not attempted/,
      "OFX takes the store-only intake lane; there is no failure to report because nothing ran");
    assert.match(t, /Cannot be read from this file/, "the facts state distinguishes 'no lane' from 'wrong kind'");
    assert.match(t, /no opening balance/, "the registry's measured reason is rendered verbatim");
    assert.doesNotMatch(t, /Failed/, "nothing failed — presenting this as a failure would be a different lie");
  });
});

test("a proposal_only pairing reads DIFFERENTLY from a store-only one on the operation row (ticket 988)", async () => {
  let storeOnly = "";
  await mount(PAYROLL, async (text) => { storeOnly = text(); });
  assert.match(storeOnly, /Not coded yet/,
    "the store-only pairing is the control: Clara derives nothing, so nothing is coded");

  await mount(PROPOSAL_ONLY, async (text) => {
    const t = text();
    assert.match(t, /Proposed, needs your confirmation/,
      "the fifth level gets its own word on the one row a professional opens for a filed document");
    assert.doesNotMatch(t, /Not coded yet/,
      "…and it must NOT reuse the store-only sentence, which is ticket 988's whole complaint: "
      + "'Clara derives nothing' and 'Clara has a proposal for you' are opposite facts");
    assert.match(t, /never posts it on her own/,
      "the row says WHY nothing is coded, so the state word is not the only thing a reader gets");
    assert.doesNotMatch(t, SUCCESS_WORDS, "a proposal is not a success: nothing is booked yet");
  });
});

test("a POSTED document offers a LINK to its journal entry, not merely a count of entries", async () => {
  await mount(POSTED_INVOICE, async (text, container) => {
    const t = text();
    assert.match(t, /Posted/, "the operation state is Posted");
    assert.match(t, /Recorded and checked/, "…and its facts passed their check, so this IS the success case");
    // A count tells a professional that something was booked; only the link lets them read it.
    assert.deepEqual(
      hrefs(container),
      ["/clients/client-1/journals?entry=11111111-2222-4333-8444-555555555555"],
      "the posted entry must be addressable through the ONE journals link builder, not a second spelling",
    );
  });
});

test("an UNCODED document offers no entry link at all — never a control that goes nowhere", async () => {
  await mount(INVALID_INVOICE, async (_text, container) => {
    assert.deepEqual(hrefs(container), [],
      "with no entry there is nothing to link to, and a dead link is worse than none");
  });
});

test("a document this caller may not read under this client renders an honest 'not available', never an empty success", async () => {
  await mount(null, async (text) => {
    const t = text();
    assert.match(t, /not available for this document under this client/);
    assert.doesNotMatch(t, /Bytes verified|Done|Recorded/, "a null read must not paint any state at all");
  });
});
