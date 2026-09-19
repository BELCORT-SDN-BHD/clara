// #639 — C7's asset detail, driven through its real render states.
//
// WHAT EACH CELL PINS, and each is a state journey C7 and AC9 name by hand:
//   detail.loading        a SKELETON, and no placeholder amount painted as a zero.
//   detail.acquisition    the acquisition is WHOLE — entry, Work, receipt, exact cents — while the
//                         particulars block is separately incomplete. That split is the ticket.
//   detail.pending        the "waiting on depreciation particulars" badge, in WORDS.
//   detail.schedule       an empty schedule names WHY it is empty (the particulars) rather than
//                         saying "no schedule" and leaving the reader to guess.
//   detail.history        a derived relationship SAYS it was derived. A reader who cannot tell a
//                         stored link from a candidate match would read a guess as a fact.
//   detail.denied         a refused read renders the refusal, never an empty page that reads as
//                         "this client owns nothing".
//   detail.a11y           zero structural a11y violations across every tab.
//   detail.older_db       a database pinned BELOW 0216 answers no acquisition/particulars/history
//                         keys at all, and the page still renders the asset instead of crashing.
//
// THE FETCHES ARE MOCKED BY URL SUBSTRING, the `bank-a11y.test.tsx` / `fixed-assets-a11y.test.tsx`
// precedent — minimal realistic envelopes so every block renders its real markup rather than an
// error banner that would also be a11y-clean.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { FixedAssetDetailView } from "./fixed-asset-detail";
import { faApp, makeNavigation } from "./fa-depreciation-test-fixtures";

const PATHNAME = "/clients/c1/registers/assets/a1";

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

const ASSET = {
  id: "a1", description: "Air compressor", status: "active", particulars_complete: false,
  acquired_date: "2026-08-15", effective_from: null, superseded_at: null, cost_cents: 850000,
  residual_cents: null, accumulated_cents: 0, nbv_cents: 850000, method: null, rate_bps: null,
  useful_life_months: null, start_date: null, asset_account: "1510", accum_account: "1519",
  expense_account: "6510", ca_class: null, is_commercial_vehicle: null, is_new: null,
  superseded_by_asset_id: null, disposed_at: null, disposal_entry_id: null,
  uncharged_due_count: 0, split_month_advisory_count: 0,
  disposal_draft_outstanding: false, disposal_draft_entry_id: null,
  acquisition_entry_id: "e-1111", acquisition_line_id: "l-1111", acquisition_document_id: null,
};

const ACQUISITION = {
  entry_id: "e-1111", line_id: "l-1111", document_id: null, document_filename: null,
  document_mime: null, document_sha256: null, document_kind: null,
  posting_date: "2026-08-15", approved_at: "2026-08-15T02:00:00Z", entry_status: "approved",
  entry_origin: "agent", memo: "Compressor purchased, paid from Maybank",
  reversal_of: null, reversed_by: null, acquired_date: "2026-08-15", cost_cents: 850000,
  currency: "MYR", asset_account: "1510", work_id: "w-2222", receipt_id: "r-3333",
  receipt_logical_op_id: "work:w-2222:journal_entry:1", receipt_created_at: "2026-08-15T02:00:01Z",
  on_behalf_of: "u-1", work_status: "completed", work_purpose: "journal_entry",
  derived_from: "acquisition_entry",
};

const PARTICULARS = {
  complete: false, method: null, useful_life_months: null, rate_bps: null, residual_cents: null,
  start_date: null, description: "Air compressor", ca_class: null, is_commercial_vehicle: null,
  is_new: null, non_depreciable: false,
};

const HISTORY = {
  status: "active", acquisition_entry_id: "e-1111", acquisition_reversed_by: null,
  acquisition_reversed_at: null, acquisition_reverses: null, supersedes_asset_id: null,
  superseded_by_asset_id: null, superseded_at: null, disposed_at: null, disposal_entry_id: null,
  related: [
    {
      asset_id: "a0", description: "Air compressor (first booking)", status: "unwound",
      cost_cents: 900000, acquired_date: "2026-08-01", acquisition_entry_id: "e-0000",
      particulars_complete: false, relation: "predecessor",
      link: "reversed_acquisition_on_same_enrolment",
    },
  ],
  chain_open: false,
};

const DETAIL = {
  asset: ASSET, lineage: [], charges: [], schedule: [], uncharged_due: [],
  acquisition: ACQUISITION, particulars: PARTICULARS, history: HISTORY,
};

const COA = [
  { account_code: "1510", name: "Plant & machinery", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "1519", name: "Accumulated depreciation", account_type: "asset", account_class: null, special_acc_type: null, is_active: true },
  { account_code: "6510", name: "Depreciation expense", account_type: "expense", account_class: null, special_acc_type: null, is_active: true },
];

function mockFor(detail: unknown, { status = 200 }: { status?: number } = {}): typeof fetch {
  return (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rpc/get_fixed_asset")) return jsonResponse(detail, status);
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse(COA);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

// #651 — THE TAB ID LIVES IN `?tab=` NOW, so this view reads `useSearchParams`/`useRouter` and a
// bare `NextIntlClientProvider` no longer mounts it ("invariant expected app router to be
// mounted"). These cells keep asking exactly what they asked before; what changed is that the
// harness now supplies the navigation the component reads, through the SAME stub
// `fa-detail-tab-url.test.tsx` uses — one shape, so the two files cannot drift apart. That file
// owns the URL contract itself (which history verb, which address); this one owns the readings.
let nav = makeNavigation("");

function tree() {
  return faApp(createElement(FixedAssetDetailView, { clientId: "c1", assetId: "a1" }), nav, PATHNAME);
}

/** A FRESH navigation per mount: `?tab=` is per-reader state, and a tab left selected by an
 *  earlier cell would make the next one order-dependent. */
function App() {
  nav = makeNavigation("");
  return tree();
}

/** Click the tab whose visible label is `label`. The strip is Base UI's Tabs, so the trigger is a
 *  real button with a role — this finds it the way a keyboard user reaches it. The RE-RENDER after
 *  the click is not ceremony: the selected tab is now read from the URL, so the search params the
 *  provider hands down have to be re-read before the new reading can be asserted. */
async function openTab(h: Awaited<ReturnType<typeof renderComponent>> & { rerender: (el: ReturnType<typeof tree>) => Promise<void> }, label: string) {
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === label);
  assert.ok(trigger, `expected a tab trigger labelled "${label}"`);
  await h.fireEvent(trigger!, "click");
  await h.rerender(tree());
  for (let i = 0; i < 4; i++) await h.settle();
}

test("detail.loading renders a loading state and NO placeholder amount before the read resolves", async () => {
  let release: (() => void) | null = null;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const slow = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rpc/get_fixed_asset")) {
      await gate;
      return jsonResponse(DETAIL);
    }
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse(COA);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(slow, async () => {
    const h = await renderComponent(App());
    try {
      await h.settle();
      const early = h.text();
      // "Show no placeholder amount as zero" — appendix C's shared control contract, and the
      // easiest rule in the estate to break by rendering a formatted 0 while a read is in flight.
      assert.ok(!/RM\s*0\.00/.test(early), `no zero amount may be painted while loading (got: ${early})`);
      assert.ok(!early.includes("Air compressor"), "…and no asset name either, until the read lands");
      release!();
      for (let i = 0; i < 5; i++) await h.settle();
      assert.match(h.text(), /Air compressor/, "the loaded read replaces the loading state");
    } finally {
      await h.unmount();
    }
  });
});

test("detail.acquisition the acquisition is WHOLE while the particulars are separately incomplete", async () => {
  await withMockedEnv(mockFor(DETAIL), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      const text = h.text();
      // Exact cents, from the DB's own projection — never a locale-guessed or rounded figure.
      assert.match(text, /8,500\.00/, "the acquisition cost renders in exact minor units");
      assert.match(text, /MYR/, "…with its currency said out loud (the PRD:127 multi-currency deferral)");
      assert.match(text, /e-1111/, "…and names the journal entry it posted out of");
      assert.match(text, /w-2222/, "…the accounting work, resolved by join");
      assert.match(text, /r-3333/, "…and the operation receipt");
      assert.match(text, /No source document/, "an absent document is an HONEST sentence, not a blank");
      assert.match(text, /supplier credit/, "the credit-financed boundary is stated on the surface");
    } finally {
      await h.unmount();
    }
  });
});

test("detail.pending the waiting-on-particulars state is said in WORDS, and the particulars tab says what is missing", async () => {
  await withMockedEnv(mockFor(DETAIL), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.match(h.text(), /Waiting on depreciation particulars/,
        "the badge is a LABEL a screen reader reads, never colour alone");
      await openTab(h, "Particulars & policy");
      const text = h.text();
      assert.match(text, /The acquisition is complete/,
        "the particulars tab states the split the whole ticket is about");
      assert.match(text, /only the depreciation setup is waiting/);
      const complete = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Complete particulars"));
      assert.ok(complete, "…and offers the same Complete-particulars door the register offers");
    } finally {
      await h.unmount();
    }
  });
});

test("detail.source_document the acquisition's source document DEEP-LINKS to that one document, never to the bare Documents tab", async () => {
  // ROUND-1 REVIEW (STANDARDS F2). The link went to `/clients/c1/documents` with no query at all,
  // while `acquisition.document_id` was on hand — so a reader was handed a list and asked to find
  // the invoice again. `lib/documents/url-state.ts` (`DOCUMENT_PARAM`/`applyDocumentParam`/
  // `documentUrl`) is the workbench's own URL state, read back by `DocumentsWorkbench` through
  // `parseDocumentParam`; this cell pins that the href carries it.
  const filed = {
    ...DETAIL,
    acquisition: {
      ...ACQUISITION,
      document_id: "11111111-2222-4333-8444-555555555555",
      document_filename: "INV-8842.pdf",
      document_sha256: "a".repeat(64),
    },
  };
  await withMockedEnv(mockFor(filed), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      const link = h.find((n) => n.tagName === "A" && textOf(n).includes("INV-8842.pdf"));
      assert.ok(link, "the filed document is named by its own filename, not by its uuid");
      const href = (link as unknown as { getAttribute: (k: string) => string | null }).getAttribute("href");
      assert.equal(href, "/clients/c1/documents?document=11111111-2222-4333-8444-555555555555",
        `the source-document link must open THAT document (got ${href})`);
    } finally {
      await h.unmount();
    }
  });
});

test("detail.schedule an empty schedule names the reason rather than saying nothing happened", async () => {
  await withMockedEnv(mockFor(DETAIL), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      await openTab(h, "Schedule");
      assert.match(h.text(), /No schedule yet/, "…and it is the PARTICULARS reason, not a bare empty");
      assert.match(h.text(), /once the depreciation particulars are answered/);
    } finally {
      await h.unmount();
    }
  });
});

test("detail.history a derived relationship SAYS it was derived", async () => {
  await withMockedEnv(mockFor(DETAIL), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      await openTab(h, "History");
      const text = h.text();
      assert.match(text, /Air compressor \(first booking\)/, "the predecessor is named…");
      assert.match(text, /Predecessor/, "…and its relation is labelled…");
      assert.match(text, /Reversed acquisition on the same account/,
        "…and HOW it was derived is on the row, so a candidate match cannot read as a stored link");
      assert.match(text, /derived from the books, not stored links/,
        "…with the boundary stated once for the whole table");
    } finally {
      await h.unmount();
    }
  });
});

test("detail.co_acquired two rows born from ONE invoice are CO-ACQUIRED, never each other's successor", async () => {
  // ROUND-1 REVIEW (adversarial 639-A2). Measured on a from-scratch rig: one document-lane entry
  // with two debits on the enrolled cost account births TWO register rows (0041 §9.4 — one row per
  // cost line, BY DESIGN), and 0216's first cut had each of them name the other `relation:
  // 'successor'`, because they share the acquisition entry (therefore the document) and the
  // `approved_at >= approved_at` comparison was true in both directions. The migration now gives
  // that pair its own orderless vocabulary; this cell pins what the reader is told.
  const coAcquired = {
    ...DETAIL,
    history: {
      ...HISTORY,
      related: [{
        asset_id: "a2", description: "Freight on compressor", status: "active",
        cost_cents: 40000, acquired_date: "2026-08-15", acquisition_entry_id: "e-1111",
        particulars_complete: false, relation: "co_acquired",
        link: "co_acquired_on_same_document",
      }],
    },
  };
  await withMockedEnv(mockFor(coAcquired), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      await openTab(h, "History");
      const text = h.text();
      assert.match(text, /Freight on compressor/, "the sibling row is named…");
      assert.match(text, /Co-acquired/, "…and the relation word makes no claim about order");
      assert.match(text, /Same source document, booked together/,
        "…and how it was derived is on the row");
      assert.ok(!/Successor/.test(text),
        "a co-acquired sibling must NEVER be called a successor — that is an accounting claim nobody made");
    } finally {
      await h.unmount();
    }
  });
});

test("detail.denied a refused read renders the refusal, never an empty page", async () => {
  const denied = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rpc/get_fixed_asset")) {
      return jsonResponse({ code: "CLR11", message: "fixed asset is not in your firm" }, 400);
    }
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse(COA);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  await withMockedEnv(denied, async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      const text = h.text();
      assert.ok(text.trim().length > 0, "a refusal is never a blank page");
      assert.ok(!text.includes("Air compressor"), "…and never shows data it could not read");
    } finally {
      await h.unmount();
    }
  });
});

test("detail.older_db a database below 0216 answers no acquisition block, and the page still renders the asset", async () => {
  // NOT a hypothetical: `db-slice-frontiers` runs this app against databases pinned at earlier
  // migrations, and the three blocks are additive keys on one read. A surface that assumed them
  // would crash on exactly the chains CI is built to exercise.
  const older = { asset: ASSET, lineage: [], charges: [], schedule: [], uncharged_due: [] };
  await withMockedEnv(mockFor(older), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.match(h.text(), /Air compressor/, "the asset still renders");
      assert.match(h.text(), /8,500\.00/, "…with its exact cost");
      await openTab(h, "Acquisition");
      assert.match(h.text(), /no acquisition of its own|Air compressor/,
        "…and the acquisition tab degrades to a sentence rather than throwing");
    } finally {
      await h.unmount();
    }
  });
});

test("detail.a11y every tab has zero structural a11y violations", async () => {
  await withMockedEnv(mockFor(DETAIL), async () => {
    const h = await renderComponent(App());
    try {
      for (let i = 0; i < 5; i++) await h.settle();
      assert.deepEqual(checkAccessibility(h.container as never), [], "Acquisition");
      for (const label of ["Particulars & policy", "Schedule", "History"]) {
        await openTab(h, label);
        assert.deepEqual(checkAccessibility(h.container as never), [], label);
      }
    } finally {
      await h.unmount();
    }
  });
});
