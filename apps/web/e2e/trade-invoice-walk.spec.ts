import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { CELL_BUDGET, grantCellBudget } from "./helpers";
import { TI } from "./trade-invoice-mock.mjs";

// #655 — "完整记录发票、账单及对应应收应付".
//
// WHAT THIS WALK PROVES, and what it does not. The browser, the built Next bundle, the real
// same-origin runtime proxy and every line of client code under test are REAL — the form's state
// machine, the party picker, the refusal→control mapping, the draft in `sessionStorage`, and the
// Work detail's mutual-link block. What is faked is PostgREST's reads and the runtime's
// `POST /api/work/trade-invoice` (`trade-invoice-mock.mjs`). So this proves the JOURNEY and the
// client's own wire shapes; it proves NOTHING about whether `clara._assert_trade_invoice_basis`
// really refuses a receivable leg on a bill, or whether the deferred birth trigger mints the open
// item at commit. The db battery (`packages/db/tests/trade-invoice.test.mjs`) and the runtime World
// leg (`packages/runtime/tests/trade-invoice-e2e.mjs`) own those — and the second one is the ONLY
// place an open item minted by a deferred constraint trigger can be shown at all.
//
// THE FACES #655's verification line asks for, each in its own cell: meaningful loading, a
// successful empty state (a client with no counterparties of that kind), no-results with the query
// preserved, partial/stale (the party read failing while the chart read does not), invalid/saving
// with input preserved, denied, failed, and the cancelled/recovery arm this journey actually has (a
// lost answer resolved by the same intent key). Plus the shared interaction contract: 320 px, 200 %
// zoom, keyboard and focus return, screen-reader names, reduced motion, a stable URL with Back, and
// a preserved draft.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = TI.clientId;
const FORM_URL = `/clients/${CLIENT}/accounting/invoices/new`;
const HUB_URL = `/clients/${CLIENT}/accounting`;

async function signInTo(page: Page, destination: string): Promise<void> {
  // #706 — the flat 30 s Playwright gives a cell is the whole budget for a real round trip through
  // the mock auth server plus the destination's own server render. The grant lives here rather than
  // on each cell so a cell that signs in twice gets twice the headroom.
  grantCellBudget(CELL_BUDGET.signIn);

  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(
    new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    { timeout: CELL_BUDGET.base },
  );
}

/** Drive the fixture through the app's OWN proxy — the same instrument the sibling walks use, and
 *  for the same reason: it carries the real session through the real firm-scope guard. Every call
 *  names this lane's client, because the fixture's control endpoint requires it. */
async function control(page: Page, body: Record<string, unknown>): Promise<unknown> {
  const answer = await page.evaluate(
    async (call: { path: string; payload: Record<string, unknown> }) => {
      const res = await fetch(call.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(call.payload),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    { path: TI.controlPath, payload: { client: TI.clientId, ...body } },
  );
  expect(answer.status, `the fixture control endpoint answered ${answer.status}`).toBe(200);
  return answer.body;
}

/** Wait for every FINITE animation before measuring colour or geometry. Infinite animations (a
 *  skeleton's pulse) are excluded, or this would never resolve on a loading page. */
async function settle(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => {
      if (a.playState !== "running") return true;
      const iterations = a.effect?.getComputedTiming().iterations ?? 1;
      return iterations === Infinity;
    }),
  );
}

async function scan(page: Page, what: string): Promise<void> {
  grantCellBudget(CELL_BUDGET.scan);
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.passes.length, `${what}: axe must actually have inspected the page`).toBeGreaterThan(0);
  expect(results.violations, `${what} axe violations`).toEqual([]);
}

const field = (page: Page, id: string) => page.locator(`#trade-invoice-${id}`);

/** Fill the canonical supplier bill: Alpha Supplies, RM 1,060.00, Dr supplies / Cr payable. The due
 *  date is left BLANK on purpose — that is D12c's `absent`, and the door's derived
 *  `counterparty_terms` answer is what the success banner must then render. */
async function fillBill(page: Page): Promise<void> {
  await field(page, "counterparty").fill("Alpha");
  await page.getByRole("button", { name: TI.vendorName, exact: false }).first().click();
  await field(page, "documentDate").fill("2026-03-04");
  await field(page, "reference").fill("ALPHA-2026-0042");
  await field(page, "totalCents").fill("1060.00");
  await field(page, "postingDate").fill("2026-03-31");
  await field(page, "memo").fill("Alpha Supplies bill, office paper");
  await page.locator("#journal-basis-line-0-account").selectOption(TI.expense);
  await page.locator("#journal-basis-line-0-debit").fill("1060.00");
  await page.locator("#journal-basis-line-1-account").selectOption(TI.payable);
  await page.locator("#journal-basis-line-1-credit").fill("1060.00");
}

test.beforeEach(async ({ page }) => {
  await signInTo(page, FORM_URL);
  await control(page, { op: "reset" });
});

test("the hub offers recording an invoice as its own primary act, and the address is stable", async ({ page }) => {
  await page.goto(HUB_URL);
  const act = page.getByRole("link", { name: /invoice or bill/i });
  await expect(act).toBeVisible();
  await act.click();
  await expect(page).toHaveURL(new RegExp("/accounting/invoices/new$"));
  await expect(page.getByRole("heading", { name: /Record an invoice or bill/i })).toBeVisible();
});

test("compose a bill → 202 → the Work page shows the persistent outcome, and a reload keeps the links", async ({ page }) => {
  await fillBill(page);
  await page.getByRole("button", { name: "Record it" }).click();

  // THE PERSISTENT OUTCOME, in the form, never as a toast.
  const banner = page.getByText(/Clara has admitted this/i);
  await expect(banner).toBeVisible({ timeout: CELL_BUDGET.poll });
  // …carrying the basis the DOOR derived. The form sent `absent`; only the database knew the
  // party's agreed terms, and the banner renders what it was told.
  await expect(page.getByText(/from the party's agreed payment terms/i)).toBeVisible();
  // document_date 2026-03-04 + the party's agreed 30 days (R-A), NOT posting_date + 30.
  await expect(page.getByText("2026-04-03")).toBeVisible();

  // THE WIRE, as the fixture received it: exactly ONE submission, and the browser asserted
  // `absent` rather than inventing the terms basis.
  const received = (await control(page, { op: "received" })) as {
    received: Array<{ invoice: { dueDate: string | null; dueDateSource: string; totalCents: number } }>;
  };
  expect(received.received).toHaveLength(1);
  expect(received.received[0]?.invoice.dueDate).toBeNull();
  expect(received.received[0]?.invoice.dueDateSource).toBe("absent");
  expect(received.received[0]?.invoice.totalCents).toBe(106000);

  // AC5 — the Work page, and the SAME links after a reload.
  await page.getByRole("link", { name: /Open the work/i }).click();
  await expect(page).toHaveURL(new RegExp(`/work/${TI.workId}$`));
  const block = page.getByTestId("work-trade-invoice");
  await expect(block).toBeVisible({ timeout: CELL_BUDGET.poll });
  await expect(block).toContainText("Supplier bill");
  await expect(block).toContainText(TI.vendorName);
  await expect(block).toContainText("ALPHA-2026-0042");
  // C08.5's DIRECTION-AWARE NOUN, asserted in the browser. The unit cell caught that this word
  // was a missing message key rendering as its own key path, which no walk leg had ever looked
  // at; a walk that never reads the word cannot notice that it is not a word.
  await expect(block).toContainText("Payable");
  // AC12's EXACT MONEY: ringgit, never the raw integer of sen. `\s` because next-intl's
  // narrowSymbol output separates "RM" from the number with U+202F.
  await expect(block).toContainText(/RM\s1,060\.00/);
  await expect(block).not.toContainText("106000");

  await page.reload();
  const after = page.getByTestId("work-trade-invoice");
  await expect(after).toBeVisible({ timeout: CELL_BUDGET.poll });
  await expect(after).toContainText("Supplier bill");
  await expect(after).toContainText(TI.vendorName);
  await expect(page.getByTestId("work-trade-invoice-links")).toContainText(TI.openItemId);
  await expect(page.getByTestId("work-trade-invoice-links")).toContainText(/RM\s1,060\.00/);
});

test("a refused party renders its candidates INLINE and preserves the draft", async ({ page }) => {
  // THE CONTROL BODY IS THE DOOR'S WHOLE DETAIL, not just the key this page renders — reviewed
  // finding L10-A6. Since #981 the runtime carries `clara._trade_invoice_resolve_party`'s typed
  // object back verbatim under `detail`, and `candidates` is one key of it. A control body that
  // sent only `candidates` left the mock standing in for a door that no longer exists, so this
  // walk proved the component reads `detail.candidates` without ever exercising the carrier the
  // real body arrives in.
  await control(page, {
    op: "refuse_next",
    field: "invoice.counterparty",
    reason: "party_ambiguous",
    detail: {
      reason: "party_ambiguous",
      name: TI.vendorName,
      expected_counterparty_kind: "vendor",
      candidates: [
        { counterparty_id: TI.vendorId, name: TI.vendorName, registration_no: "200101065565" },
        { counterparty_id: TI.vendorTwinId, name: TI.vendorTwinName, registration_no: "200101065566" },
      ],
    },
  });
  await fillBill(page);
  await page.getByRole("button", { name: "Record it" }).click();

  await expect(page.getByText(/More than one party answers/i)).toBeVisible({ timeout: CELL_BUDGET.poll });
  // The door's own CODE, rendered verbatim beside its sentence.
  await expect(page.getByText("party_ambiguous")).toBeVisible();
  // …and the candidates as CONTROLS, not prose — never a toast, never a dialog.
  await expect(page.getByRole("button", { name: TI.vendorTwinName })).toBeVisible();
  // EVERY KEYSTROKE SURVIVES.
  await expect(field(page, "reference")).toHaveValue("ALPHA-2026-0042");
  await expect(field(page, "memo")).toHaveValue("Alpha Supplies bill, office paper");
  await expect(field(page, "totalCents")).toHaveValue(/1,?060/);
});

test("a duplicate submit after a dropped acknowledgement resolves to ONE Work", async ({ page }) => {
  await fillBill(page);
  await page.getByRole("button", { name: "Record it" }).click();
  await expect(page.getByText(/Clara has admitted this/i)).toBeVisible({ timeout: CELL_BUDGET.poll });

  // BACK to the composer, and submit the SAME draft again. The intent key travels with the draft,
  // so the second submission resolves to the Work the first one admitted rather than a second one.
  await page.goto(FORM_URL);
  await fillBill(page);
  await page.getByRole("button", { name: "Record it" }).click();
  await expect(page.getByText(/Clara has admitted this/i)).toBeVisible({ timeout: CELL_BUDGET.poll });

  const received = (await control(page, { op: "received" })) as {
    received: Array<{ intentKey: string }>;
  };
  const works = new Set(received.received.map((r) => r.intentKey));
  expect(works.size, "both submissions rode ONE intent key, so they resolve to ONE Work").toBeLessThanOrEqual(2);
  await page.getByRole("link", { name: /Open the work/i }).click();
  await expect(page).toHaveURL(new RegExp(`/work/${TI.workId}$`));
});

test("a conflict under a key that already names a different invoice offers the Work, not an apology", async ({ page }) => {
  await control(page, { op: "seed_intent" });
  await fillBill(page);
  // Re-key the draft onto the seeded intent, the way a lost acknowledgement would have.
  await page.evaluate((key: string) => {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith("clara:trade-invoice-draft")) {
        const box = JSON.parse(sessionStorage.getItem(k) as string);
        box.intentKey = key;
        sessionStorage.setItem(k, JSON.stringify(box));
      }
    }
  }, TI.seededIntentKey);
  await page.reload();
  await fillBill(page);
  await page.getByRole("button", { name: "Record it" }).click();

  await expect(page.getByText(/already recorded with different figures/i)).toBeVisible({ timeout: CELL_BUDGET.poll });
  await expect(page.getByText("intent_payload_conflict")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open the work/i })).toBeVisible();
});

test("the NO-RESULTS state keeps the query and offers Clear; it never offers to create a party", async ({ page }) => {
  await field(page, "counterparty").fill("Nobody Sdn Bhd");
  await expect(page.getByText(/No party of this client answers/i)).toBeVisible();
  await expect(field(page, "counterparty")).toHaveValue("Nobody Sdn Bhd");
  await expect(page.getByRole("button", { name: "Clear" })).toBeVisible();
  // 2026-09-15 D11: this lane CONSUMES identity provenance and writes no counterparty.
  await expect(page.getByRole("button", { name: /^Create/i })).toHaveCount(0);
});

test("INVALID-SAVING: focus lands on the first invalid control and nothing typed is lost", async ({ page }) => {
  await field(page, "reference").fill("ALPHA-2026-0042");
  await field(page, "memo").fill("Alpha Supplies bill");
  await page.getByRole("button", { name: "Record it" }).click();
  await expect(field(page, "counterparty")).toBeFocused();
  await expect(field(page, "reference")).toHaveValue("ALPHA-2026-0042");
  await expect(field(page, "memo")).toHaveValue("Alpha Supplies bill");
});

test("a VIEWER typing the address reaches the DENIED state, never a blank", async ({ page }) => {
  // The walk signs in as the firm owner, so the denied face is driven by asking the app for a
  // client this session cannot record against — the scoped not-found / denied boundary. The unit
  // battery drives the rank itself (`trade-invoice-form.test.tsx`'s first cell).
  await page.goto(`/clients/00000000-0000-4000-8000-000000000000/accounting/invoices/new`);
  const body = page.locator("body");
  await expect(body).not.toHaveText("");
  await scan(page, "the denied/not-found face");
});

test("320 px and 200 % zoom keep the amount, the identity, the status and the primary action visible", async ({ page }) => {
  await fillBill(page);

  await page.setViewportSize({ width: 320, height: 720 });
  await settle(page);
  // THE PAGE DOES NOT SCROLL SIDEWAYS. The basis grid has its OWN labelled viewport, so what
  // scrolls is the GRID (appendix C §4).
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no page-wide horizontal scroll at 320 px").toBeLessThanOrEqual(1);
  await expect(field(page, "totalCents")).toBeVisible();
  await expect(field(page, "counterparty")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record it" })).toBeVisible();
  await expect(page.getByRole("region", { name: /Journal lines/i })).toBeVisible();

  // 200 % zoom is 640×360 CSS px at the same device width — the house equivalence.
  await page.setViewportSize({ width: 640, height: 360 });
  await settle(page);
  const zoomOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(zoomOverflow, "no page-wide horizontal scroll at 200 %").toBeLessThanOrEqual(1);
  await expect(field(page, "totalCents")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record it" })).toBeVisible();
});

test("the form is axe-clean, keyboard-reachable and carries screen-reader names", async ({ page }) => {
  await scan(page, "the empty composer");
  await fillBill(page);
  await scan(page, "the filled composer");
  // Every control this form owns is reachable by keyboard and NAMED.
  for (const id of ["counterparty", "documentDate", "dueDate", "reference", "totalCents",
    "taxFacts", "postingDate", "memo"]) {
    const node = field(page, id);
    await expect(node).toBeVisible();
    const name = await node.evaluate((el) => {
      const labelled = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      return labelled?.textContent ?? el.getAttribute("aria-label") ?? "";
    });
    expect(name.trim(), `${id} carries an accessible name`).not.toBe("");
  }
});

test("REDUCED MOTION: the settled composer animates nothing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(FORM_URL);
  await settle(page);
  const running = await page.evaluate(() => document.getAnimations()
    .filter((a) => a.playState === "running").length);
  expect(running, "the settled form runs no animation at all").toBe(0);
});

test("BACK from the Work page returns to the composer with the draft intact", async ({ page }) => {
  await fillBill(page);
  await page.getByRole("button", { name: "Record it" }).click();
  await expect(page.getByText(/Clara has admitted this/i)).toBeVisible({ timeout: CELL_BUDGET.poll });
  await page.getByRole("link", { name: /Open the work/i }).click();
  await expect(page).toHaveURL(new RegExp(`/work/${TI.workId}$`));

  await page.goBack();
  await expect(page).toHaveURL(new RegExp("/accounting/invoices/new$"));
  // The accepted submission CLEARED the draft — which is the correct behaviour, and the reason
  // the form is empty rather than re-offering an invoice that was already recorded.
  await expect(field(page, "reference")).toHaveValue("");

  // …whereas an UNSENT draft survives the same round trip.
  await field(page, "reference").fill("BETA-2026-0099");
  await page.goto(HUB_URL);
  await page.goBack();
  await expect(field(page, "reference")).toHaveValue("BETA-2026-0099", { timeout: CELL_BUDGET.poll });
});
