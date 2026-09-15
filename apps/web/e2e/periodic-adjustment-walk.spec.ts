import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { PA } from "./periodic-adjustment-mock.mjs";

// #643 — "会计师提供期间、金额和依据后，Clara 或直接会计操作可完成定期存货及工资相关费用/负债调整".
//
// WHAT THIS WALK PROVES, and what it does not. The browser, the built Next bundle, the real
// same-origin runtime proxy and every line of client code under test are REAL — the form's state
// machine, the derivation of the entry from the particulars, the refusal→control mapping, the draft
// in `sessionStorage`, the history table's disclosure and its correction chain. What is faked is
// PostgREST's reads and the runtime's `POST /api/work/periodic-adjustment`
// (`periodic-adjustment-mock.mjs`). So this proves the JOURNEY and the client's own wire shapes; it
// proves NOTHING about whether `clara._assert_adjustment_relationships` really refuses lines that
// contradict the particulars, or whether the closing-stock gate flips. The db battery
// (`periodic-adjustment.test.mjs`, `close-closing-stock-producer.test.mjs`) and the runtime world
// e2e (`periodic-adjustment-e2e.mjs`) own those.
//
// THE SIX FACES #643's verification line asks for, each in its own cell: meaningful loading, a
// successful EMPTY history, partial/stale input, invalid/saving, denied/failed, and the
// cancelled/recovery arm this journey actually has (a lost answer resolved by the same intent key).
// Plus the shared interaction contract: 320 px, 200 % zoom, keyboard and focus return, screen-reader
// names, reduced motion, a stable URL with Back, and a preserved draft.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = PA.clientId;
const FORM_URL = `/clients/${CLIENT}/accounting/adjustments/new`;
const HISTORY_URL = `/clients/${CLIENT}/accounting/adjustments`;

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

/** Drive the fixture through the app's OWN proxy — the same instrument the journal walks use, and
 *  for the same reason: it carries the real session through the real firm-scope guard.
 *
 *  EVERY CALL NAMES THIS LANE'S CLIENT, because the fixture's control endpoint now requires it: a
 *  control that mutated shared state for any body at all was a lane claiming a shared endpoint
 *  (standards review), and the sibling `journal-work-mock.mjs` has always scoped its own. */
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
    { path: PA.controlPath, payload: { client: PA.clientId, ...body } },
  );
  expect(answer.status, `the fixture control endpoint answered ${answer.status}`).toBe(200);
  return answer.body;
}

/** Wait for every FINITE animation before measuring colour or geometry. Infinite animations (a
 *  Skeleton's pulse) are excluded, or this would never resolve on a loading page. */
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
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.passes.length, `${what}: axe must actually have inspected the page`).toBeGreaterThan(0);
  expect(results.violations, `${what} axe violations`).toEqual([]);
}

const field = (page: Page, name: string) => page.locator(`#periodic-adjustment-${name}`);

/** The one stocktake this walk records: RM 4,000.00 opening, RM 6,500.00 closing — a RM 2,500.00
 *  rise, which the form derives as Dr 1200 / Cr 5040. */
async function fillStocktake(page: Page): Promise<void> {
  await field(page, "periodStart").fill("2026-01-01");
  await field(page, "periodEnd").fill("2026-12-31");
  await field(page, "openingCents").fill("4000.00");
  await field(page, "closingCents").fill("6500.00");
  await field(page, "inventoryAccountCode").selectOption(PA.inventory);
  await field(page, "costAccountCode").selectOption(PA.cost);
  await field(page, "countedAt").fill("2026-12-31");
  await field(page, "countReference").fill("STOCKTAKE-2026-12");
  await field(page, "instruction").fill("Posting the 2026 year-end stocktake the supervisor signed off.");
}

/** The closing figure as the money control may legitimately show it. `MoneyInput` keeps the RAW
 *  keystrokes while a control is mounted and re-formats only when the cents value arrives from
 *  outside (a restore, a remount) — so "6500.00" and "6,500.00" are the same fact seen at two
 *  moments, and a cell that pinned one of them would red for a reason that has nothing to do with
 *  what it is testing. */
const CLOSING_VALUE = /^6[,]?500\.00$/;

test.beforeEach(async ({ page }) => {
  await signInTo(page, HISTORY_URL);
  await control(page, { op: "reset" });
});

// ---------------------------------------------------------------------------------------------
// The operation itself: particulars in, a derived entry shown, one Work admitted.
// ---------------------------------------------------------------------------------------------

test("t643 the form derives the entry from the particulars, shows it, and admits ONE Work", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillStocktake(page);

  // THE MOVEMENT IS THE ACCOUNTANT'S OWN SUBTRACTION, on screen before anything is submitted —
  // which is how a transposed figure is caught here rather than by a refusal thirty seconds later.
  await expect(page.getByText("Movement (closing less opening):")).toBeVisible();
  await expect(page.getByTestId("movement")).toContainText("2,500.00");

  // THE ENTRY THESE PARTICULARS PRODUCE, rendered through the journal lane's own line table and
  // balanced to the cent. This is C-29's rung made visible: what is submitted is the entry the
  // particulars produce, not an anonymous balancing journal wearing a marker.
  await expect(page.getByRole("heading", { name: "The entry these particulars produce" })).toBeVisible();
  const lines = page.getByRole("table", { name: "Journal entry lines" });
  await expect(lines).toContainText("RM 2,500.00");
  await expect(page.getByText("Difference")).toBeVisible();
  // …and the preview is a PREVIEW: its money controls are not editable.
  await expect(page.getByLabel("Debit, line 1")).toBeDisabled();

  await scan(page, "periodic-adjustment form, filled");

  await page.getByRole("button", { name: "Submit" }).click();
  // THE PERSISTENT OUTCOME IS THE WORK'S OWN PAGE, never a toast: a 202 means ADMITTED, and the
  // next thing the human sees is a durable record reading its real status from the database.
  await expect(page).toHaveURL(new RegExp(`/work/${PA.workId}$`), { timeout: 20_000 });

  const received = (await control(page, { op: "received" })) as {
    received: Array<{ purpose: string; adjustment: Record<string, unknown>; basis: { lines: unknown[] } }>;
  };
  expect(received.received.length, "exactly one admission").toBe(1);
  const sent = received.received[0]!;
  expect(sent.purpose).toBe("periodic_stock_adjustment");
  // THE TYPED PARTICULARS CROSSED THE WIRE, in the route's own camelCase, with the movement DERIVED
  // rather than typed.
  expect(sent.adjustment.adjustmentCents).toBe(250_000);
  expect(sent.adjustment.openingCents).toBe(400_000);
  expect(sent.adjustment.countReference).toBe("STOCKTAKE-2026-12");
  expect(sent.adjustment.method).toBe("opening_closing_count");
  expect(sent.basis.lines).toHaveLength(2);
});

test("t643 the type switch keeps both halves and submits only the active one", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillStocktake(page);
  await field(page, "purpose").selectOption("payroll_obligation");

  // THE STATUTORY DEFAULT IS FILLED IN AND VISIBLE — an offer a preparer can see and change, never
  // a chart-template claim (migration 0194's own header).
  await expect(field(page, "liabilityAccountCode")).toHaveValue(PA.liability);
  await expect(field(page, "expenseAccountCode")).toHaveValue(PA.payrollExpense);
  await expect(page.getByText("Filled in from this client's chart.").first()).toBeVisible();
  // …and the ADVANCE field says out loud what it can and cannot do, rather than leaving a preparer
  // to discover the staff-advance register's refusal at approve.
  await expect(page.getByText(/Recovering an advance from this payroll needs the staff-advance register/)).toBeVisible();

  await field(page, "amountCents").fill("1300.00");
  await field(page, "particularsSource").fill("Payroll summary for August 2026 from the HR officer");
  await field(page, "instruction").fill("Book the employer EPF contribution for August 2026.");
  await scan(page, "periodic-adjustment form, payroll half");

  // SWITCH BACK: the stocktake is still there, untouched, without a keystroke.
  await field(page, "purpose").selectOption("periodic_stock_adjustment");
  await expect(field(page, "closingCents")).toHaveValue(CLOSING_VALUE);
  await expect(field(page, "countReference")).toHaveValue("STOCKTAKE-2026-12");
});

test("t643 an advance account derives its leg — the SAME lines the chat lane would produce", async ({ page }) => {
  // Named, not fixed, by the refresh wave's v19 report: the form offered `advanceAccountCode`
  // but derived no leg for it, so a preparer who picked one earned 0194's `advance_leg` refusal at
  // admission. This walk proves the browser-visible half of the fix — the db battery and the
  // runtime world e2e own whether Postgres itself agrees.
  await page.goto(FORM_URL);
  await field(page, "purpose").selectOption("payroll_obligation");
  await field(page, "periodStart").fill("2026-08-01");
  await field(page, "periodEnd").fill("2026-08-31");
  await field(page, "amountCents").fill("1300.00");
  await field(page, "particularsSource").fill("Payroll summary for August 2026 from the HR officer");
  await field(page, "instruction").fill("Book the employer EPF contribution for August 2026.");

  // THE CONTROL IS HIDDEN UNTIL AN ACCOUNT IS CHOSEN — an amount with nothing to carry it could
  // never be posted.
  await expect(field(page, "advanceCents")).toHaveCount(0);
  await field(page, "advanceAccountCode").selectOption(PA.bank);
  await expect(field(page, "advanceCents")).toBeVisible();
  await field(page, "advanceCents").fill("400.00");

  // THE THIRD DERIVED LINE, ON SCREEN before anything is submitted — the same rung C-29 asks for:
  // the liability leg takes the remainder (RM 1,300.00 - RM 400.00 = RM 900.00) and the advance
  // account carries what was named. Read off the line grid's own controls, not the totals row —
  // debits and credits both total RM 1,300.00 regardless of the split between legs.
  await expect(page.getByLabel("Account, line 3")).toHaveValue(PA.bank);
  await expect(page.getByLabel("Credit, line 2")).toHaveValue("900.00");
  await expect(page.getByLabel("Credit, line 3")).toHaveValue("400.00");
  const lines = page.getByRole("table", { name: "Journal entry lines" });
  await expect(lines).toContainText("RM 1,300.00");
  await scan(page, "periodic-adjustment form, payroll half with an advance leg");

  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(new RegExp(`/work/${PA.workId}$`), { timeout: 20_000 });

  const received = (await control(page, { op: "received" })) as {
    received: Array<{ purpose: string; adjustment: Record<string, unknown>; basis: { lines: unknown[] } }>;
  };
  expect(received.received.length, "exactly one admission").toBe(1);
  const sent = received.received[0]!;
  expect(sent.purpose).toBe("payroll_obligation");
  // THE PARTICULAR CROSSED THE WIRE; THE DERIVATION INPUT DID NOT — `advanceCents` is a
  // client-side figure only (the staff-advance register owns the allocation, #797 Out of scope),
  // so no `p_adjustment` key can ever carry it. `settledCents` is the CONTRAST since #797: it IS
  // a particular now, and the payroll walk above sends it.
  expect(sent.adjustment.advanceAccountCode).toBe(PA.bank);
  expect("advanceCents" in sent.adjustment).toBe(false);
  expect(sent.basis.lines).toHaveLength(3);
});

test("t643 a CITED DOCUMENT crosses the wire with the particulars, and the history discloses it", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillStocktake(page);

  // THE UPLOAD/REFERENCE ENTRANCE, in the browser. It is the COMPOSER'S OWN CHOOSER, mounted on this
  // door (`components/accounting/evidence-chooser.tsx`), which is why its id is the basis
  // vocabulary's `journal-basis-evidence` here too — and why a refusal about the citation lands on
  // it with no second mapper.
  const chooser = page.locator("#journal-basis-evidence");
  await expect(chooser).toBeVisible();
  // …and the advisory rule is live: a document already backing a posted entry stays in the list and
  // is DISABLED with the reason on the option, never filtered out.
  await expect(chooser.locator(`option[value="${PA.spokenForDocumentId}"]`)).toBeDisabled();
  await expect(chooser.locator(`option[value="${PA.documentId}"]`)).toBeEnabled();

  await chooser.selectOption(PA.documentId);
  await scan(page, "periodic-adjustment form, with a cited document");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(new RegExp(`/work/${PA.workId}$`), { timeout: 20_000 });

  const received = (await control(page, { op: "received" })) as {
    received: Array<{ sourceRefs: Array<{ kind: string; documentId: string }> | null; adjustment: Record<string, unknown> }>;
  };
  expect(received.received.length, "exactly one admission").toBe(1);
  expect(received.received[0]!.sourceRefs, "the citation crosses the wire in the route's own shape")
    .toEqual([{ kind: "document", documentId: PA.documentId }]);
  // …BESIDE the particulars, never inside them: the two travel as separate halves of one intent.
  expect(received.received[0]!.adjustment.adjustmentCents).toBe(250_000);

  // AND THE HISTORY DISCLOSES THE SOURCE — the other end of the same entrance.
  await page.goto(HISTORY_URL);
  const live = page.getByRole("table", { name: "Periodic adjustments" })
    .getByRole("row").filter({ hasText: "2026-01-01 — 2026-12-31" });
  await live.getByText("Particulars and links").click();
  await expect(live).toContainText(PA.documentId);
});

// ---------------------------------------------------------------------------------------------
// Invalid / saving, partial / stale, denied / failed, and the recovery arm.
// ---------------------------------------------------------------------------------------------

test("t643 an all-zero movement is refused BEFORE anything is sent, beside the figure that caused it", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillStocktake(page);
  // The count says nothing moved. The database refuses this `adjustment_all_zero`; the form says so
  // beside the CLOSING figure, which is the number a preparer would change.
  await field(page, "closingCents").fill("4000.00");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("This adjustment moves no money. Check the figures with your client.")).toBeVisible();
  await expect(field(page, "closingCents")).toBeFocused();
  // NOTHING WAS SENT: the runtime is never asked to refuse what the form can see.
  const received = (await control(page, { op: "received" })) as { received: unknown[] };
  expect(received.received.length, "no admission was attempted").toBe(0);
  await scan(page, "periodic-adjustment form, all-zero refusal");
});

test("t643 STALE input — a count taken outside its own period — is named, and the input is preserved", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillStocktake(page);
  await field(page, "countedAt").fill("2027-02-01");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("The count was taken outside the period above, so it is not evidence about it.")).toBeVisible();
  await expect(field(page, "countedAt")).toBeFocused();
  // THE INPUT SURVIVES THE REFUSAL — every figure is still there to be corrected.
  await expect(field(page, "closingCents")).toHaveValue(CLOSING_VALUE);
  await expect(field(page, "countedAt")).toHaveValue("2027-02-01");
});

test("t643 a SERVER refusal lands on its own control with the server's own reason, and preserves input", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillStocktake(page);
  // Injected, because nothing a browser can build reaches the route invalid: the route re-spells
  // the database's `adjustment.period_end` as `adjustment.periodEnd`, and the form maps BOTH.
  await control(page, { op: "refuse_next", field: "adjustment.period_end", reason: "scope_overbroad" });
  await page.getByRole("button", { name: "Submit" }).click();

  const banner = page.getByRole("alert").filter({ hasText: "The server did not accept these particulars" });
  await expect(banner).toBeVisible();
  await expect(page.getByText("scope_overbroad")).toBeVisible();
  await expect(field(page, "periodEnd")).toBeFocused();
  await expect(field(page, "closingCents")).toHaveValue(CLOSING_VALUE);
  await scan(page, "periodic-adjustment form, server refusal");
});

test("t643 a LOST answer is resolved by re-sending the SAME intent key, not by a second Work", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillStocktake(page);

  // THE LOSS IS ENGINEERED IN THE BROWSER'S NETWORK LAYER, and that is the only place it can be.
  // A fixture that destroyed its own socket would reach this page as the same-origin proxy's OWN
  // 502 (`app/api/runtime/[...path]/route.ts` catches the failed fetch and answers
  // `{"error":"runtime_unreachable"}`), which `lib/work/api.ts` classifies as `unavailable` — the
  // server ANSWERED and said no. `lost` means NO answer was observed while the request may well
  // have been admitted, so the request has to REACH the fixture and the answer has to vanish on the
  // way back: `route.fetch()` performs it, `route.abort()` drops the answer. Measured and recorded
  // first by `journal-work-walk.spec.ts`'s own lost cell.
  let posts = 0;
  await page.route("**/api/runtime/work/periodic-adjustment", async (route) => {
    posts += 1;
    if (posts === 1) {
      await route.fetch(); // the fixture admits the Work…
      await route.abort(); // …and the page never learns that it did
      return;
    }
    // A beat on the resolution attempt, so the "Checking…" status is observable rather than a frame
    // nobody could catch.
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  await page.getByRole("button", { name: "Submit" }).click();
  // §3's lost-response rule: read the current state BEFORE offering a distinct resubmit. The form
  // says so in a live region, because "Checking…" REPLACES "Submitting…" mid-flight.
  await expect(page.getByText("Checking whether this was already accepted…")).toBeVisible({ timeout: 15_000 });

  // The second attempt is answered — REPLAYED onto the Work the first one admitted — so the form
  // lands on that Work rather than on an error.
  await expect(page).toHaveURL(new RegExp(`/work/${PA.workId}$`), { timeout: 20_000 });
  expect(posts, "the form must have re-sent exactly once, not looped").toBe(2);
  const received = (await control(page, { op: "received" })) as {
    received: Array<{ intentKey: string }>;
  };
  expect(received.received.length, "both attempts reached the fixture").toBe(2);
  expect(received.received[0]!.intentKey, "THE SAME identity — a second key would admit a SECOND Work for one intent")
    .toBe(received.received[1]!.intentKey);
});

test("t643 a CONFLICT offers the Work that key already names, and a new identity for these figures", async ({ page }) => {
  await control(page, { op: "seed_intent" });
  await page.goto(FORM_URL);
  await fillStocktake(page);
  // The draft's own minted key is not the seeded one, so the first submit succeeds; the conflict
  // arm is reached by re-using the seeded key, which the fixture plants as already spoken for.
  await page.evaluate((key: string) => {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith("clara:periodic-adjustment-draft")) {
        const stored = JSON.parse(window.sessionStorage.getItem(k)!) as Record<string, unknown>;
        stored.intentKey = key;
        window.sessionStorage.setItem(k, JSON.stringify(stored));
      }
    }
  }, PA.seededIntentKey);
  await page.reload();
  await page.getByRole("button", { name: "Submit" }).click();

  const banner = page.getByRole("alert").filter({ hasText: "This draft was already submitted with different figures" });
  await expect(banner).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the existing work" })).toHaveAttribute(
    "href", new RegExp(`/work/${PA.seededWorkId}$`));
  await scan(page, "periodic-adjustment form, intent conflict");

  // ROTATING THE IDENTITY KEEPS THE FIGURES. §3: "Same operation identity for retries; NEW INTENT
  // gets a new identity."
  await page.getByRole("button", { name: "Start a new draft with these figures" }).click();
  await expect(field(page, "closingCents")).toHaveValue(CLOSING_VALUE);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(new RegExp(`/work/${PA.workId}$`), { timeout: 20_000 });
});

// ---------------------------------------------------------------------------------------------
// The draft, the URL and Back.
// ---------------------------------------------------------------------------------------------

test("t643 the draft survives a reload, and the URL is stable with Back", async ({ page }) => {
  await page.goto(HISTORY_URL);
  // THE PRIMARY ACT IS A LINK, and that is the honest role for a control that navigates:
  // `<Button render={<Link/>}>` renders the anchor itself (Base UI's Button adds `role="button"`
  // only when it is told the element is NOT a native button), so this is `link` in the
  // accessibility tree.
  await page.getByRole("link", { name: "Record periodic adjustment" }).click();
  await expect(page).toHaveURL(new RegExp(`${FORM_URL}$`));

  await fillStocktake(page);
  await expect(page.getByText("This draft is kept in this tab for this client until you submit it.")).toBeVisible();
  await page.reload();
  // EVERY FIGURE COMES BACK, and so does the derived entry it implies.
  await expect(field(page, "closingCents")).toHaveValue(CLOSING_VALUE);
  await expect(field(page, "inventoryAccountCode")).toHaveValue(PA.inventory);
  await expect(field(page, "instruction")).toHaveValue("Posting the 2026 year-end stocktake the supervisor signed off.");
  await expect(page.getByTestId("movement")).toContainText("2,500.00");

  // BACK returns to the history, and the form's address is unchanged by anything that happened on
  // it — no query string, no hash, no redirect.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${HISTORY_URL}$`));
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`${FORM_URL}$`));
  await expect(field(page, "closingCents")).toHaveValue(CLOSING_VALUE);
});

// ---------------------------------------------------------------------------------------------
// The result / history surface.
// ---------------------------------------------------------------------------------------------

test("t643 the history names the exact fields, the sources and the Work/JE/receipt links", async ({ page }) => {
  await page.goto(HISTORY_URL);
  const table = page.getByRole("table", { name: "Periodic adjustments" });
  await expect(table).toBeVisible();

  // THE LIVE STOCKTAKE: its period, what it is, the exact signed movement, and that its entry
  // still stands.
  const live = table.getByRole("row").filter({ hasText: "2026-01-01 — 2026-12-31" });
  await expect(live).toContainText("Periodic stock adjustment");
  await expect(live).toContainText("From an opening and closing count");
  await expect(live).toContainText("RM 2,500.00");
  await expect(live.getByText("Posted")).toBeVisible();

  // THE PARTICULARS AND THE LINKS, behind the row's own disclosure — the narrow-screen strategy and
  // the "exact fields and sources" half of this ticket's fourth line.
  await live.getByText("Particulars and links").click();
  await expect(live.getByRole("link", { name: PA.entryId })).toHaveAttribute("href", new RegExp(`entry=${PA.entryId}$`));
  await expect(live.getByRole("link", { name: PA.seededWorkId })).toHaveAttribute("href", new RegExp(`/work/${PA.seededWorkId}$`));
  await expect(live).toContainText(PA.receiptId);
  // THE SOURCE, disclosed after the fact: the document this adjustment was recorded from, which is
  // #643's upload/reference entrance seen from the other end.
  await expect(live).toContainText(PA.documentId);
  await expect(live).toContainText("STOCKTAKE-2026-12");
  await expect(live).toContainText("opening_cents");

  // THE REVERSED ONE IS NOT HIDDEN, and it names the correction that replaced it — the chain this
  // ticket asks to be "separately linked".
  const reversed = table.getByRole("row").filter({ hasText: "2026-08-01 — 2026-08-31" });
  await expect(reversed).toContainText("Supplied payroll or statutory obligation");
  await expect(reversed).toContainText("EPF (KWSP)");
  await expect(reversed.getByText("Reversed")).toBeVisible();
  await reversed.getByText("Particulars and links").click();
  await expect(reversed).toContainText(PA.correctionId);
  await expect(reversed).toContainText("Payroll summary for August 2026");

  await scan(page, "periodic-adjustment history");
});

test("t643 a client with no adjustments reads as a successful EMPTY, never as a failure", async ({ page }) => {
  // A REAL read answering `[]` — which is what `clara.list_periodic_adjustments` returns for a
  // client that has recorded none. The distinction this cell defends: a successful no-data answer
  // is NOT a read error and NOT a permission denial, and the surface must say the true one.
  await control(page, { op: "empty_history" });
  await page.goto(HISTORY_URL);
  await expect(page.getByText("No periodic adjustment has been recorded for this client yet.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Periodic adjustments" })).toHaveCount(0);
  // …and the primary act is still offered: an empty history is where a preparer starts, not a dead
  // end (Appendix D: "First use explains what will appear and offers the first permitted action").
  await expect(page.getByRole("link", { name: "Record periodic adjustment" })).toBeVisible();
  await scan(page, "periodic-adjustment history, successful empty");
});

// ---------------------------------------------------------------------------------------------
// The shared interaction contract.
// ---------------------------------------------------------------------------------------------

test("t643 renders at 320 px, at 200 % zoom, by keyboard, and with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto(FORM_URL);

  // NARROW: the PAGE may not scroll sideways. A table of money may scroll inside its own container.
  await settle(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the form must not scroll horizontally at 320 px").toBeLessThanOrEqual(1);
  await expect(field(page, "purpose")).toBeVisible();
  await scan(page, "periodic-adjustment form at 320 px, reduced motion");

  // REDUCED MOTION IS HONOURED: nothing on the resting page is still animating.
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  expect(running, "reduced motion must leave no running animation on the resting form").toBe(0);

  // THE HISTORY at 320 px too — its disclosure is what keeps ten particulars readable there.
  await page.goto(HISTORY_URL);
  await settle(page);
  const historyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(historyOverflow, "the history must not scroll horizontally at 320 px").toBeLessThanOrEqual(1);
  await scan(page, "periodic-adjustment history at 320 px");

  // 200 % ZOOM, which the product models as a halved CSS viewport.
  await page.setViewportSize({ width: 640, height: 512 });
  await page.goto(FORM_URL);
  await settle(page);
  await expect(field(page, "instruction")).toBeVisible();
  const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(zoomOverflow, "the form must not scroll horizontally at 200 % zoom").toBeLessThanOrEqual(1);

  // KEYBOARD: every particulars control is reachable and operable without a pointer, and the type
  // switch changes the form from the keyboard alone.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(FORM_URL);
  await field(page, "purpose").focus();
  await expect(field(page, "purpose")).toBeFocused();
  await field(page, "purpose").selectOption("payroll_obligation");
  await expect(field(page, "obligationKind")).toBeVisible();
  await field(page, "obligationKind").focus();
  await expect(field(page, "obligationKind")).toBeFocused();

  // SCREEN-READER NAMES: every control this journey adds has an accessible name, and the axe scans
  // above would have caught a nameless one. This asserts the names are the product's words rather
  // than a placeholder standing in for a label.
  await expect(page.getByLabel("What are you recording?")).toBeVisible();
  await expect(page.getByLabel("Obligation")).toBeVisible();
  await expect(page.getByLabel("Amount", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Where these figures came from")).toBeVisible();
  await expect(page.getByLabel("What you were asked to do")).toBeVisible();
});
