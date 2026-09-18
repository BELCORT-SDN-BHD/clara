import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

import { cellBudgetMs, ensureRealFocus, signIn } from "./helpers";

// #635 (refresh spec; journey H) — `/settings/firm`'s real content, in a real browser.
//
// MOCKS ARE INSTALLED WITH `page.route` INSIDE THIS SPEC, and there is deliberately NO lane mock
// file (orchestrator ruling, brief §4). `e2e/serve-built.mjs` carries only the GENERIC honest
// defaults every OTHER spec needs now that this route reads three doors; every scenario below
// overrides them per test, which Playwright's last-registered-route-wins order allows. The
// consequence that matters to nine concurrent lanes: `LANE_MOCKS`, `LANE_DECLARATIONS` and
// `SHARED_RPC_VERBS` in `e2e/e2e-fixture-ownership.test.ts` need no edit at all.
//
// THE DOWNLOAD IS ASSERTED THROUGH AN OBJECT-URL RECORDER, NOT `waitForEvent('download')`.
// Playwright's `download` event does not fire under this harness
// (`e2e/documents-viewer-walk.spec.ts:498-501`, measured there and re-used here), so what is
// observable is the lifecycle: a URL was created, an anchor carried the filename, the URL was
// revoked. The CSV's BYTES are asserted in `lib/firm/usage-csv.test.ts`, where they can be read.
//
// ADMIN RANK IS NOT WALKED, AND THAT IS A NAMED RESIDUAL. `serve-built.mjs:553-577` derives the
// persona from the email prefix and has no rank-2 one (`owner@`=3, `bookkeeper@`=1, `viewer@`=0);
// adding one would edit a CORE arm nine lanes share. Admin is proven in the DB battery
// (`p635.db.commercial_admin_only`, `p635.db.usage_wrapper_admin_only`) and in the unit cells.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const OWNER = "owner@example.test";
const BOOKKEEPER = "bookkeeper@example.test";

const SUBJECT = "11111111-1111-1111-1111-111111111111";
const FIRM_ID = "33333333-3333-4333-8333-333333333333";

type Doc = {
  kind: "terms" | "dpa";
  version: number;
  status: "published" | "draft";
  title: string;
  effective_from: string | null;
  published_at: string | null;
  firm_accepted: boolean;
  accepted_at: string | null;
  accepted_by: string | null;
  accepted_by_name: string | null;
  my_accepted_version: number | null;
  my_accepted_at: string | null;
};

function doc(over: Partial<Doc> & Pick<Doc, "kind">): Doc {
  return {
    version: 1,
    status: "published",
    title: over.kind === "terms" ? "Terms of Service (Clara beta)" : "Data processing agreement",
    effective_from: "2026-09-12T16:00:00.000Z",
    published_at: "2026-09-18T13:46:54.777Z",
    firm_accepted: true,
    accepted_at: "2026-09-18T14:00:00.000Z",
    accepted_by: SUBJECT,
    accepted_by_name: "E2E Owner",
    my_accepted_version: 1,
    my_accepted_at: "2026-09-18T14:00:00.000Z",
    ...over,
  };
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const COMMERCIAL = {
  firm: { id: FIRM_ID, name: "E2E Accounting", created_at: "2026-08-31T00:05:00.000Z", is_operator: true },
  plan: { local_key: "clara-beta-2026", name: "Clara Beta", currency: "MYR", amount_cents: 0, amounts_ruled: false },
  payment: { recorded: true, recorded_at: "2026-02-03T08:00:00.000Z", subscription_present: true, customer_present: true },
  invoices: { available: false, reason: "not_collected" },
  capacity: { docs_per_day: 100, pages_per_day: 1000, ocr_concurrency: 2, llm_witness_concurrency: 2, source: "firm_document_limits" },
};

const USAGE_SEP = [
  { scope: "firm", call_kind: "chat", calls: "12", input_tokens: "3000000", output_tokens: "400000", priced_calls: "10", unpriced_calls: "2", spend_cents: "340", price_currency: "USD" },
  { scope: "platform", call_kind: "reporting", calls: "4", input_tokens: "100000", output_tokens: "20000", priced_calls: "4", unpriced_calls: "0", spend_cents: "90", price_currency: "USD" },
];
const USAGE_AUG = [
  { scope: "firm", call_kind: "document_extraction", calls: "7", input_tokens: "900000", output_tokens: "50000", priced_calls: "7", unpriced_calls: "0", spend_cents: "120", price_currency: "USD" },
];

/** A stateful standing + accept pair. The accept route behaves like the real door: it records the
 *  acceptance against the CURRENT version, and a REPLAY under the same op key answers the
 *  ORIGINAL instant (0185:766-775) rather than a fresh one. "Reload persists" is therefore proven
 *  against a fixture that behaves like the database, not one that echoes a canned success. */
async function installStandingPair(page: Page, initial: { terms: Doc; dpa: Doc; live: boolean; canAccept: boolean }) {
  const state = { ...initial };
  const acceptances = new Map<string, string>(); // op_key -> accepted_at
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_legal_standing", (route) =>
    fulfillJson(route, 200, {
      documents: [state.terms, state.dpa],
      standing_live: state.live,
      can_accept_for_firm: state.canAccept,
      masked: false,
    }));
  await page.route("**/e2e-supabase/rest/v1/rpc/get_current_legal_documents", (route) =>
    fulfillJson(route, 200, [
      { kind: "terms", version: state.terms.version, status: state.terms.status, title: state.terms.title,
        body: `Terms of Service, version ${state.terms.version}. The exact bytes the door returned.`,
        body_sha256: "a".repeat(64), effective_from: state.terms.effective_from, published_at: state.terms.published_at,
        accepted_at: state.terms.my_accepted_at, accepted_version: state.terms.my_accepted_version },
      { kind: "dpa", version: state.dpa.version, status: state.dpa.status, title: state.dpa.title,
        body: `Data processing agreement, version ${state.dpa.version}.`,
        body_sha256: "b".repeat(64), effective_from: state.dpa.effective_from, published_at: state.dpa.published_at,
        accepted_at: state.dpa.my_accepted_at, accepted_version: state.dpa.my_accepted_version },
    ]));
  await page.route("**/e2e-supabase/rest/v1/rpc/accept_legal_document", async (route) => {
    const body = route.request().postDataJSON() as { p_kind: "terms" | "dpa"; p_version: number; p_op_key: string };
    const existing = acceptances.get(body.p_op_key);
    if (existing !== undefined) {
      await fulfillJson(route, 200, { status: "already_accepted", kind: body.p_kind, version: body.p_version, accepted_at: existing, acceptance_id: "acc-1" });
      return;
    }
    const at = "2026-09-19T03:21:00.000Z";
    acceptances.set(body.p_op_key, at);
    const target = body.p_kind === "terms" ? state.terms : state.dpa;
    target.firm_accepted = true;
    target.accepted_at = at;
    target.accepted_by = SUBJECT;
    target.accepted_by_name = "E2E Owner";
    target.my_accepted_version = target.version;
    target.my_accepted_at = at;
    state.live = state.terms.firm_accepted && state.dpa.firm_accepted;
    await fulfillJson(route, 200, { status: "accepted", kind: body.p_kind, version: body.p_version, accepted_at: at, acceptance_id: "acc-1" });
  });
  return state;
}

async function installCommercial(page: Page, answer: { status: number; body: unknown }) {
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_commercial_state", (route) =>
    fulfillJson(route, answer.status, answer.body));
}

async function installUsage(page: Page, byMonth: Record<string, unknown>, fallback: unknown = []) {
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_ai_usage", (route) => {
    const body = route.request().postDataJSON() as { p_period?: string } | null;
    const month = (body?.p_period ?? "").slice(0, 7);
    return fulfillJson(route, 200, byMonth[month] ?? fallback);
  });
}

/** The object-URL recorder, installed before any app script runs. Copied from
 *  `documents-viewer-walk.spec.ts:497-533` for the reason recorded in this file's header. */
async function instrumentDownloads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __claraDownloads: { created: string[]; revoked: string[]; anchors: string[] } };
    w.__claraDownloads = { created: [], revoked: [], anchors: [] };
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      const url = createObjectURL(obj as Blob);
      w.__claraDownloads.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      w.__claraDownloads.revoked.push(url);
      revokeObjectURL(url);
    };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched(this: HTMLAnchorElement) {
      if (this.download) {
        w.__claraDownloads.anchors.push(this.download);
        return;
      }
      return click.call(this);
    };
  });
}

function downloadState(page: Page) {
  return page.evaluate(() => (window as unknown as {
    __claraDownloads: { created: string[]; revoked: string[]; anchors: string[] };
  }).__claraDownloads);
}

const liveStanding = { terms: doc({ kind: "terms" }), dpa: doc({ kind: "dpa" }), live: true, canAccept: true };

// ---------------------------------------------------------------------------
// (1) an owner lands, sees five cards and a live standing
// ---------------------------------------------------------------------------
test("an owner lands on /settings/firm and reads five cards, with a live legal standing", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, scans: 1 }));
  await installStandingPair(page, { ...liveStanding, terms: doc({ kind: "terms" }), dpa: doc({ kind: "dpa" }) });
  await installCommercial(page, { status: 200, body: COMMERCIAL });
  await installUsage(page, { "2026-09": USAGE_SEP });
  await signIn(page, OWNER);
  await page.goto("/settings/firm");

  await expect(page.getByRole("heading", { name: "Firm settings", level: 1 })).toBeVisible();
  // `.first()` on purpose: "This firm" is BOTH the identity card's h2 and the usage table's own
  // scope heading once rows render, and a bare locator matching two nodes is a strict-mode error
  // rather than a finding about the page.
  for (const heading of ["This firm", "Legal standing", "Plan and payment", "Model usage", "Processing capacity"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("An owner of this firm has accepted the current versions")).toBeVisible();
  // D1 — NOT ONE PRICE while amounts_ruled is false.
  await expect(page.getByText("Beta — no price has been set for this plan yet")).toBeVisible();
  await expect(page.getByText(/RM ?\d/)).toHaveCount(0);
  // The two legacy cards are still here, unchanged.
  await expect(page.getByText(/Change-threshold control is retired/)).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/firm as an owner").toEqual([]);
});

// ---------------------------------------------------------------------------
// (2) a new version withdraws standing; the owner accepts; the outcome PERSISTS
// ---------------------------------------------------------------------------
test("a newly published version withdraws standing, the owner accepts in-app, and the outcome survives a reload", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, scans: 1 }));
  await installStandingPair(page, {
    terms: doc({ kind: "terms", version: 2, firm_accepted: false, accepted_at: null, accepted_by: null, accepted_by_name: null, my_accepted_version: 1, my_accepted_at: "2026-09-18T14:00:00.000Z" }),
    dpa: doc({ kind: "dpa" }),
    live: false,
    canAccept: true,
  });
  await installCommercial(page, { status: 200, body: COMMERCIAL });
  await installUsage(page, {});
  await signIn(page, OWNER);
  await page.goto("/settings/firm");

  // THE CONSEQUENCE, IN THE ACCOUNTANT'S WORDS.
  await expect(page.getByText(/Clara cannot use a model on any client's books until an owner of this firm accepts the current versions/)).toBeVisible();
  await expect(page.getByText("Not yet accepted for this firm")).toBeVisible();

  await page.getByRole("button", { name: "Accept for this firm" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Terms of Service, version 2.")).toBeVisible();
  await page.getByRole("button", { name: "I accept this agreement" }).click();
  await expect(page.getByText(/Accepted on/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // A PERSISTENT OUTCOME, NOT A TOAST: the banner clears and it stays cleared across a reload.
  await expect(page.getByText("An owner of this firm has accepted the current versions")).toBeVisible();
  await page.reload();
  await expect(page.getByText("An owner of this firm has accepted the current versions")).toBeVisible();
  await expect(page.getByText(/Clara cannot use a model on any client's books/)).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/firm after accepting").toEqual([]);
});

// ---------------------------------------------------------------------------
// (3) a replayed accept reports the ORIGINAL instant
// ---------------------------------------------------------------------------
test("a replayed acceptance reports the original instant, and records nothing twice", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1 }));
  const seen: string[] = [];
  await installStandingPair(page, {
    terms: doc({ kind: "terms", version: 2, firm_accepted: false, accepted_at: null, accepted_by: null, accepted_by_name: null, my_accepted_version: null, my_accepted_at: null }),
    dpa: doc({ kind: "dpa" }),
    live: false,
    canAccept: true,
  });
  // A LOST RESPONSE on the first attempt: the door DID record it, the browser never heard. The
  // retry must replay under the SAME op key rather than accept a second time.
  await page.route("**/e2e-supabase/rest/v1/rpc/accept_legal_document", async (route) => {
    const body = route.request().postDataJSON() as { p_op_key: string };
    seen.push(body.p_op_key);
    if (seen.length === 1) {
      await route.abort("failed");
      return;
    }
    await fulfillJson(route, 200, {
      status: "already_accepted", kind: "terms", version: 2,
      accepted_at: "2026-09-19T03:21:00.000Z", acceptance_id: "acc-1",
    });
  });
  await installCommercial(page, { status: 200, body: COMMERCIAL });
  await installUsage(page, {});
  await signIn(page, OWNER);
  await page.goto("/settings/firm");

  await page.getByRole("button", { name: "Accept for this firm" }).click();
  await page.getByRole("button", { name: "I accept this agreement" }).click();
  await expect(page.getByText(/This did not reach the database\. Nothing was recorded/)).toBeVisible();
  await page.getByRole("button", { name: "I accept this agreement" }).click();
  await expect(page.getByText(/Already accepted on/)).toBeVisible();
  expect(seen.length, "two attempts").toBe(2);
  expect(seen[0], "the SAME op key — a retry replays, it does not accept twice").toBe(seen[1]);
});

// ---------------------------------------------------------------------------
// (4)(5) a bookkeeper: no commercial, no usage; a typed deep link meets the door's own refusal
// ---------------------------------------------------------------------------
test("a bookkeeper sees the legal standing but no commercial or usage figures, and the DB's own sentence instead", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, scans: 1 }));
  await installStandingPair(page, {
    terms: doc({ kind: "terms", my_accepted_version: null, my_accepted_at: null }),
    dpa: doc({ kind: "dpa", my_accepted_version: null, my_accepted_at: null }),
    live: true,
    canAccept: false,
  });
  await installCommercial(page, { status: 403, body: { code: "CLR04", message: "insufficient role", details: null } });
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_ai_usage", (route) =>
    fulfillJson(route, 403, { code: "CLR04", message: "insufficient role", details: null }));
  await signIn(page, BOOKKEEPER);
  // (5) A TYPED DEEP LINK, with a period the bookkeeper cannot read either.
  await page.goto("/settings/firm?period=2026-08");

  await expect(page.getByRole("heading", { name: "Legal standing", exact: true })).toBeVisible();
  // A BOOKKEEPER IS NOT MASKED. The door masks the attribution triple BELOW bookkeeper
  // (0141:526 is the row floor it mirrors), so rank 1 reads WHO accepted and WHEN — the masked
  // "Accepted for this firm" face belongs to a viewer, and asserting it here was this cell's own
  // error, caught by the first browser run.
  await expect(page.getByText(/Accepted by E2E Owner on/).first()).toBeVisible();
  // 裁-187 — ABSENT, not disabled: no figures, no download, no accept control.
  await expect(page.getByText("Clara Beta")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download CSV" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Accept for this firm" })).toHaveCount(0);
  // The DATABASE's own sentence, verbatim, with its code.
  await expect(page.getByText("insufficient role").first()).toBeVisible();
  await expect(page.getByText("CLR04").first()).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/firm as a bookkeeper").toEqual([]);
});

// ---------------------------------------------------------------------------
// (6) the month selector drives the URL, Back restores the previous month, two buckets
// ---------------------------------------------------------------------------
test("the month selector changes the URL, Back restores the previous month, and the two buckets render apart", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, scans: 1 }));
  await installStandingPair(page, { ...liveStanding, terms: doc({ kind: "terms" }), dpa: doc({ kind: "dpa" }) });
  await installCommercial(page, { status: 200, body: COMMERCIAL });
  await installUsage(page, { "2026-09": USAGE_SEP, "2026-08": USAGE_AUG });
  await signIn(page, OWNER);
  await page.goto("/settings/firm?period=2026-09");

  await expect(page.getByRole("heading", { name: "This firm", exact: true }).last()).toBeVisible();
  // TWO LABELLED GROUPS, never one figure (0110:718-727).
  await expect(page.getByRole("table", { name: "This firm" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Platform-wide" })).toBeVisible();
  await expect(page.getByText(/2 calls in this period have no price on record/)).toBeVisible();
  await expect(page.getByText(/Provider price \(USD\), not your books/)).toBeVisible();
  await expect(page.getByText(/Covering 01 Sept 2026 to 30 Sept 2026, counted in UTC/)).toBeVisible();

  await page.getByLabel("Month").selectOption("2026-08");
  await expect(page).toHaveURL(/period=2026-08/);
  await expect(page.getByText("document_extraction")).toBeVisible();
  await expect(page.getByText(/Covering 01 Aug 2026 to 31 Aug 2026, counted in UTC/)).toBeVisible();

  // BACK RESTORES THE PRIOR MONTH — a stable URL, not a local widget state.
  await page.goBack();
  await expect(page).toHaveURL(/period=2026-09/);
  await expect(page.getByText("document_extraction")).toHaveCount(0);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/firm with usage rows").toEqual([]);
});

// ---------------------------------------------------------------------------
// (7) the CSV action's whole object-URL lifecycle
// ---------------------------------------------------------------------------
test("Download CSV creates an object URL, names the file and revokes the URL", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1 }));
  await instrumentDownloads(page);
  await installStandingPair(page, { ...liveStanding, terms: doc({ kind: "terms" }), dpa: doc({ kind: "dpa" }) });
  await installCommercial(page, { status: 200, body: COMMERCIAL });
  await installUsage(page, { "2026-09": USAGE_SEP });
  await signIn(page, OWNER);
  await page.goto("/settings/firm?period=2026-09");

  const before = await downloadState(page);
  expect(before.created, "nothing is created before the press").toEqual([]);

  await page.getByRole("button", { name: "Download CSV" }).click();
  await expect.poll(async () => (await downloadState(page)).anchors.length).toBeGreaterThan(0);
  const after = await downloadState(page);
  expect(after.created.length, "an object URL was created").toBe(1);
  expect(after.anchors[0], "the anchor carries the month-named filename").toBe("clara-model-usage-2026-09-utc.csv");
  await expect.poll(async () => (await downloadState(page)).revoked.length).toBe(1);
});

// ---------------------------------------------------------------------------
// (8) MID-SESSION DEMOTION — the figures are gone rather than stale
// ---------------------------------------------------------------------------
test("a mid-session demotion clears the commercial figures on the next focus, rather than leaving them stale", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1 }));
  let demoted = false;
  await installStandingPair(page, { ...liveStanding, terms: doc({ kind: "terms" }), dpa: doc({ kind: "dpa" }) });
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_commercial_state", (route) =>
    demoted
      ? fulfillJson(route, 403, { code: "CLR04", message: "insufficient role", details: null })
      : fulfillJson(route, 200, COMMERCIAL));
  await page.route("**/e2e-supabase/rest/v1/rpc/get_firm_ai_usage", (route) =>
    demoted
      ? fulfillJson(route, 403, { code: "CLR04", message: "insufficient role", details: null })
      : fulfillJson(route, 200, USAGE_SEP));
  await signIn(page, OWNER);
  await page.goto("/settings/firm?period=2026-09");

  await expect(page.getByText("Clara Beta")).toBeVisible();
  await expect(page.getByText("Recorded on 03 Feb 2026")).toBeVisible();

  // The demotion lands in the database. NOTHING polls, so nothing changes yet.
  demoted = true;
  await expect(page.getByText("Clara Beta")).toBeVisible();

  // The tab is backgrounded and refocused; both governed reads are re-issued.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(page.getByText("Clara Beta")).toHaveCount(0);
  await expect(page.getByText("Recorded on 03 Feb 2026")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download CSV" })).toHaveCount(0);
  await expect(page.getByText("insufficient role").first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// (9)(10) 320px, 200% zoom, focus return after the dialog, axe on each
// ---------------------------------------------------------------------------
test("320px and 200% zoom carry no horizontal page scroll, and focus returns to the trigger after the dialog", async ({ page }) => {
  test.setTimeout(cellBudgetMs({ signIns: 1, scans: 2 }));
  await installStandingPair(page, {
    terms: doc({ kind: "terms", version: 2, firm_accepted: false, accepted_at: null, accepted_by: null, accepted_by_name: null, my_accepted_version: null, my_accepted_at: null }),
    dpa: doc({ kind: "dpa" }),
    live: false,
    canAccept: true,
  });
  await installCommercial(page, { status: 200, body: COMMERCIAL });
  await installUsage(page, { "2026-09": USAGE_SEP });
  await signIn(page, OWNER);
  await page.goto("/settings/firm?period=2026-09");
  await ensureRealFocus(page);

  // FOCUS RETURN: the trigger is focused, the dialog opens, it closes, focus is not stranded.
  const trigger = page.getByRole("button", { name: "Accept for this firm" });
  await trigger.focus();
  await trigger.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const focusTag = await page.evaluate(() => document.activeElement?.tagName ?? "NONE");
  expect(focusTag, "focus must not be stranded on <body> after the dialog closes").not.toBe("BODY");

  // 320px — the cards stack and the usage table scrolls inside its own region.
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.getByRole("heading", { name: "Model usage", exact: true })).toBeVisible();
  const narrow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(narrow.scrollWidth, "no horizontal PAGE scroll at 320px").toBeLessThanOrEqual(narrow.clientWidth + 1);
  let result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/firm at 320px").toEqual([]);

  // 200% zoom, emulated the way the rest of this suite does: half the viewport at the same scale.
  await page.setViewportSize({ width: 640, height: 512 });
  const zoomed = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(zoomed.scrollWidth, "no horizontal PAGE scroll at 200%").toBeLessThanOrEqual(zoomed.clientWidth + 1);
  result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/firm at 200% zoom").toEqual([]);
});
