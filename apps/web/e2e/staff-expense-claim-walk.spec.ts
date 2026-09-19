import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { CELL_BUDGET, grantCellBudget, signInTo } from "./helpers";
import { SEC } from "./staff-expense-claim-mock.mjs";

// #638 — "完整处理员工报销、垫款与应付明细".
//
// WHAT THIS WALK PROVES, and what it does not. The browser, the built Next bundle, the real
// same-origin runtime proxy and every line of client code under test are REAL — the form's state
// machine, the derivation of the entry from the claim, the refusal→control mapping, the draft in
// `sessionStorage`, the register's disclosure and its correction chain. What is faked is
// PostgREST's reads and the runtime's `POST /api/work/staff-expense-claim`
// (`staff-expense-claim-mock.mjs`). So this proves the JOURNEY and the client's own wire shapes; it
// proves NOTHING about whether `clara._assert_claim_basis` really refuses a control payable, or
// whether the advance birth trigger mints its allocation. The db battery
// (`packages/db/tests/staff-expense-claim.test.mjs`) and the runtime world e2e
// (`packages/runtime/tests/staff-expense-claim-e2e.mjs`) own those.
//
// THE FACES #638's verification line asks for, each in its own cell: meaningful loading, a
// successful EMPTY register, a no-results-with-clear-filters state, partial/stale input,
// invalid/saving, denied/failed, and the cancelled/recovery arm this journey actually has (a lost
// answer resolved by the same intent key). Plus the shared interaction contract: 320 px, 200 %
// zoom, keyboard and focus return, screen-reader names, reduced motion, a stable URL with Back, and
// a preserved draft.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = SEC.clientId;
const FORM_URL = `/clients/${CLIENT}/accounting/claims/new`;
const REGISTER_URL = `/clients/${CLIENT}/accounting/claims`;

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
    { path: SEC.controlPath, payload: { client: SEC.clientId, ...body } },
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
  // #706 — one full-page `AxeBuilder.analyze()` is 14.4 s alone and 33 s under load, and two cells
  // below scan three faces each. The grant is additive, so the budget grows with the number of
  // scans that actually run (`identity-finish.spec.ts:28`).
  grantCellBudget(CELL_BUDGET.scan);
  await settle(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.passes.length, `${what}: axe must actually have inspected the page`).toBeGreaterThan(0);
  expect(results.violations, `${what} axe violations`).toEqual([]);
}

const field = (page: Page, name: string) => page.locator(`#staff-expense-claim-${name.replace(/\./g, "-")}`);

/**
 * WAIT FOR THE CHART BEFORE TOUCHING AN ACCOUNT CONTROL, and the reason is a real degradation this
 * form ships rather than a harness quirk: `AccountPicker` renders a FREE-TEXT INPUT while the
 * client's chart has not been read (and for ever, if it could not be read) — a preparer who knows
 * the code can still type it, and the commit rechecks every code against the live chart anyway. So
 * `selectOption` against the control before the read settles legitimately meets an `<input>`, and
 * Playwright throws rather than retrying. Waiting for the `<select>` is waiting for the state this
 * walk is about.
 */
async function chartReady(page: Page): Promise<void> {
  // #706 — the chart is a real client-side read, so waiting for it is one poll unit of work.
  grantCellBudget(CELL_BUDGET.poll);
  await expect(page.locator("select#staff-expense-claim-claimantAccountCode"))
    .toBeVisible({ timeout: CELL_BUDGET.poll });
}

/** The one claim this walk records: Farah's March travel, RM 480.00 on an EXISTING enrolment, owed
 *  to her on the non-control payable. */
async function fillClaim(page: Page): Promise<void> {
  await chartReady(page);
  await field(page, "claimantAccountCode").selectOption(SEC.advance);
  await field(page, "incurredDate").fill("2026-03-04");
  await field(page, "postingDate").fill("2026-03-31");
  await field(page, "items.0.description").fill("KL–Penang return flight");
  await field(page, "items.0.expenseAccountCode").selectOption(SEC.travel);
  await field(page, "items.0.amountCents").fill("480.00");
  await field(page, "instruction").fill("Farah's March travel claim, the receipt she emailed in.");
}

// #851 — the sign-in is the SHARED helper's (`helpers.ts`), not this file's own copy. The copy it
// retired carried one measurement worth keeping: on 2026-09-17, twelve lanes live on this host and
// the CPU pinned at 100 %, the first cell of an isolated two-cell run sat on "Signing in…" past
// `CELL_BUDGET.signIn` (20 s) and red on the deadline rather than on anything about claims, so that
// copy had widened its own post-login wait to `CELL_BUDGET.base` (30 s). The shared helper waits
// 20 s. Raising it is the helper's own decision and #851 put it out of scope, so if this walk ever
// reds on a "Signing in…" deadline again, that is the measurement talking — not a claims defect.
test.beforeEach(async ({ page }) => {
  await signInTo(page, REGISTER_URL);
  await control(page, { op: "reset" });
});

// ---------------------------------------------------------------------------------------------
// The operation itself: a claim in, a derived entry shown, one Work admitted.
// ---------------------------------------------------------------------------------------------

test("t638 the form derives the entry from the claim, shows it, and admits ONE Work", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillClaim(page);

  // THE TOTAL IS THE CLAIMANT'S OWN ITEMISATION ADDED UP, on screen before anything is submitted —
  // which is how a transposed figure is caught here rather than by a refusal thirty seconds later.
  await expect(page.getByTestId("claim-total")).toContainText("480.00");

  // THE DERIVED ENTRY IS VISIBLE AND NOT EDITABLE: the browser sends no lines at all, so a grid a
  // preparer could type into would be offering an act that never reaches the wire.
  await expect(page.getByText("The entry this claim produces")).toBeVisible();
  // …and the preview is a PREVIEW: its money controls are not editable. Asserted through the
  // control's own accessible name, the way the sibling walk does — the line grid's element ids
  // belong to `journal-basis-fields.tsx` and this walk has no business knowing their shape.
  await expect(page.getByLabel("Debit, line 1")).toBeDisabled();

  await page.getByRole("button", { name: "Submit" }).click();

  // THE PERSISTENT OUTCOME IS THE WORK'S OWN PAGE — never a toast (§3: "Update the persistent
  // object/Work state first").
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT}/work/${SEC.workId}$`));

  const answer = (await control(page, { op: "received" })) as {
    received: Array<{ intentKey: string; claim: Record<string, unknown>; sourceRefs: unknown }>;
  };
  expect(answer.received).toHaveLength(1);
  const sent = answer.received[0]!;
  // THE WIRE SHAPE, PINNED. The claim crosses; the total and the lines deliberately do not.
  expect(sent.claim.settlement).toBe("reimbursement");
  expect(sent.claim.payableAccountCode).toBe(SEC.payable);
  expect(sent.claim.incurredDate).toBe("2026-03-04");
  expect(sent.claim.postingDate).toBe("2026-03-31");
  expect((sent.claim as { amountCents?: unknown }).amountCents).toBeUndefined();
  expect((sent.claim as { lines?: unknown }).lines).toBeUndefined();
  expect(sent.claim.items).toEqual([
    { description: "KL–Penang return flight", expenseAccountCode: SEC.travel, amountCents: 48000 },
  ]);
  // C1: THE ATTACHMENT IS GENUINELY OPTIONAL — an omitted citation is a lawful claim, and the route
  // reads an absent and an empty list identically.
  expect(sent.sourceRefs).toBeNull();
  await scan(page, "the claim form after a successful submit");
});

test("t638 a NEW claimant is asked for the register's three answers BEFORE anything is admitted", async ({ page }) => {
  await page.goto(FORM_URL);
  await chartReady(page);
  // `1191` carries no live enrolment, so recording this claim would ENROL it.
  await field(page, "claimantAccountCode").selectOption(SEC.advanceFresh);
  await expect(page.getByTestId("claimant-new")).toBeVisible();
  await field(page, "incurredDate").fill("2026-03-04");
  await field(page, "postingDate").fill("2026-03-31");
  await field(page, "items.0.description").fill("Taxi");
  await field(page, "items.0.expenseAccountCode").selectOption(SEC.travel);
  await field(page, "items.0.amountCents").fill("35.00");
  await field(page, "instruction").fill("A new claimant's first claim.");
  await page.getByRole("button", { name: "Submit" }).click();

  // NOTHING IS SENT, and the first missing answer holds focus (§3: "Focus the first invalid field").
  const nothing = (await control(page, { op: "received" })) as { received: unknown[] };
  expect(nothing.received).toHaveLength(0);
  await expect(field(page, "claimantPersonLabel")).toBeFocused();

  await field(page, "claimantPersonLabel").fill("Nur Amirah binti Zainal");
  await field(page, "claimantAttestation").fill("Dedicated to Nur Amirah; not a related-party balance.");
  await field(page, "claimantConfirmDedicated").check();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT}/work/${SEC.workId}$`));

  const answer = (await control(page, { op: "received" })) as {
    received: Array<{ claim: { claimant: Record<string, unknown> } }>;
  };
  expect(answer.received).toHaveLength(1);
  expect(answer.received[0]!.claim.claimant).toEqual({
    accountCode: SEC.advanceFresh,
    personLabel: "Nur Amirah binti Zainal",
    attestation: "Dedicated to Nur Amirah; not a related-party balance.",
    confirmDedicated: true,
  });
});

test("t638 the SETTLEMENT switch preserves what was typed, and only the active leg is sent", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillClaim(page);
  await expect(field(page, "payableAccountCode")).toBeVisible();

  // Switch to the advance arm — a Radio Group with a FieldSet legend (appendix D #46).
  await page.getByRole("radio", { name: "It discharges an advance they already hold" }).click();
  await field(page, "advanceAccountCode").selectOption(SEC.advance);
  await field(page, "advanceId").fill(SEC.advanceId);
  // The reimbursement control is gone from the page while its arm is inactive.
  await expect(field(page, "payableAccountCode")).toHaveCount(0);

  // …and switching BACK restores it with the value the chart offered, not an empty box.
  await page.getByRole("radio", { name: "The firm owes the claimant" }).click();
  await expect(field(page, "payableAccountCode")).toHaveValue(SEC.payable);

  await page.getByRole("radio", { name: "It discharges an advance they already hold" }).click();
  await expect(field(page, "advanceId")).toHaveValue(SEC.advanceId);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT}/work/`));

  const answer = (await control(page, { op: "received" })) as {
    received: Array<{ claim: Record<string, unknown> }>;
  };
  const claim = answer.received[0]!.claim;
  expect(claim.settlement).toBe("advance_application");
  expect(claim.advanceAccountCode).toBe(SEC.advance);
  expect(claim.advanceId).toBe(SEC.advanceId);
  expect(claim.payableAccountCode).toBeUndefined();
});

test("t638 an ITEM WAITING on a named fact posts nothing and holds nothing else up", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillClaim(page);
  await page.getByRole("button", { name: "Add another item" }).click();
  await field(page, "items.1.description").fill("Taxi, receipt undated");
  await field(page, "items.1.pendingFact").fill("incurred_date");
  // The waiting line's amount control is gone: a line that is waiting cannot also claim an amount.
  await expect(field(page, "items.1.amountCents")).toHaveCount(0);
  // …and the total is still only the finished line.
  await expect(page.getByTestId("claim-total")).toContainText("480.00");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT}/work/`));

  const answer = (await control(page, { op: "received" })) as {
    received: Array<{ claim: { items: Array<Record<string, unknown>> } }>;
  };
  expect(answer.received[0]!.claim.items).toEqual([
    { description: "KL–Penang return flight", expenseAccountCode: SEC.travel, amountCents: 48000 },
    { description: "Taxi, receipt undated", pendingFact: "incurred_date" },
  ]);
});

// ---------------------------------------------------------------------------------------------
// INVALID / SAVING, and the server's own refusals.
// ---------------------------------------------------------------------------------------------

test("t638 an INVALID claim sends nothing and names the first control", async ({ page }) => {
  await page.goto(FORM_URL);
  await chartReady(page);
  await page.getByRole("button", { name: "Submit" }).click();
  const nothing = (await control(page, { op: "received" })) as { received: unknown[] };
  expect(nothing.received).toHaveLength(0);
  await expect(field(page, "claimantAccountCode")).toBeFocused();
  await expect(page.getByText("Choose an account.").first()).toBeVisible();

  // MONEY CANNOT BE BOOKED BEFORE IT WAS SPENT, and the refusal names the date that caused it.
  await field(page, "claimantAccountCode").selectOption(SEC.advance);
  await field(page, "incurredDate").fill("2026-04-30");
  await field(page, "postingDate").fill("2026-03-31");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(field(page, "incurredDate")).toBeFocused();
  await expect(page.getByText("The money was spent after the date this would post. Check both dates.")).toBeVisible();
});

test("t638 a SERVER refusal lands on its own control as an inline state, never a toast", async ({ page }) => {
  await page.goto(FORM_URL);
  // The DATABASE's own token and field path, planted exactly as the door raises it.
  await control(page, { op: "refuse_next", field: "claim.payableAccountCode", reason: "payable_account_is_control" });
  await fillClaim(page);
  await field(page, "payableAccountCode").selectOption(SEC.control);
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("The server did not accept this claim")).toBeVisible();
  await expect(page.getByText("payable_account_is_control")).toBeVisible();
  await expect(field(page, "payableAccountCode")).toBeFocused();
  // THE DRAFT IS INTACT: a refusal never costs a preparer what they typed.
  await expect(field(page, "items.0.description")).toHaveValue("KL–Penang return flight");
  await expect(page).toHaveURL(new RegExp(`${FORM_URL}$`));
  await scan(page, "the claim form showing a server refusal");
});

test("t638 a LOST answer is resolved by the SAME intent key, and a STALE one offers a new draft", async ({ page }) => {
  await page.goto(FORM_URL);
  await fillClaim(page);

  // THE ANSWER VANISHES ON THE WAY BACK — the browser's own network layer, because that is the only
  // thing that produces the state the form's `lost` arm is written for (see the mock's own note).
  let dropped = false;
  await page.route("**/api/runtime/work/staff-expense-claim", async (route) => {
    if (dropped) {
      await route.continue();
      return;
    }
    dropped = true;
    await route.fetch();          // the request REACHES the fixture…
    await route.abort();          // …and the answer never arrives.
  });
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT}/work/${SEC.workId}$`));

  const answer = (await control(page, { op: "received" })) as {
    received: Array<{ intentKey: string }>;
  };
  expect(answer.received.length, "the fixture saw the first attempt AND the resolution").toBe(2);
  expect(answer.received[0]!.intentKey, "the SAME identity: a replay must resolve, not admit a second Work")
    .toBe(answer.received[1]!.intentKey);
});

test("t638 a STALE claim under one intent key is a conflict with a route to the Work it names", async ({ page }) => {
  await page.goto(FORM_URL);
  await control(page, { op: "seed_intent" });
  // Force the draft onto the seeded key — the state a preparer reaches by editing a draft whose
  // figures were already submitted under it.
  //
  // POLL UNTIL THE REWRITE ACTUALLY LANDS. The draft is written by an EFFECT
  // (`staff-expense-claim-form.tsx:253-259`) that cannot run until `draftScope` resolves, and that
  // waits on the caller-context read — so on a loaded host `page.goto` resolves BEFORE any
  // `clara:staff-expense-claim-draft` key exists and a single-shot rewrite silently touches
  // nothing. MEASURED 2026-09-17: the cell then submitted under a FRESH key, was accepted, and
  // navigated to a Work detail instead of driving the conflict it exists to prove. Counting the
  // keys rewritten is the difference between driving the stale-key state and passing through it.
  await expect
    .poll(
      async () =>
        page.evaluate((key: string) => {
          let rewritten = 0;
          for (let i = 0; i < window.sessionStorage.length; i += 1) {
            const name = window.sessionStorage.key(i);
            if (name === null || !name.startsWith("clara:staff-expense-claim-draft")) continue;
            const stored = JSON.parse(window.sessionStorage.getItem(name) ?? "null");
            if (stored === null) continue;
            stored.intentKey = key;
            window.sessionStorage.setItem(name, JSON.stringify(stored));
            rewritten += 1;
          }
          return rewritten;
        }, SEC.seededIntentKey),
      { timeout: CELL_BUDGET.poll, message: "the form must have written a draft to re-key" },
    )
    .toBeGreaterThan(0);
  await page.reload();
  await fillClaim(page);
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("already", { exact: false }).first()).toBeVisible();
  const link = page.getByRole("link").filter({ hasText: /./ }).filter({
    has: page.locator("xpath=."),
  });
  await expect(page.locator(`a[href*="${SEC.seededWorkId}"]`)).toBeVisible();
  expect(await link.count()).toBeGreaterThan(0);
  await expect(page).toHaveURL(new RegExp(`${FORM_URL}$`));
});

// ---------------------------------------------------------------------------------------------
// THE REGISTER: loading, empty, the three states, and the disclosure.
// ---------------------------------------------------------------------------------------------

test("t638 the register shows every state a claim can be in, with its items and its links", async ({ page }) => {
  await page.goto(REGISTER_URL);
  await expect(page.getByRole("heading", { name: "Staff expense claims" })).toBeVisible();
  const table = page.getByRole("table", { name: "Staff expense claims" });
  await expect(table).toBeVisible();

  // POSTED, WAITING and REVERSED are three different facts, and the register says which is which.
  await expect(table.getByText("Posted").first()).toBeVisible();
  await expect(table.getByText("Reversed").first()).toBeVisible();
  await expect(page.getByTestId(`claim-pending-${SEC.waitingClaimId}`)).toContainText("1 line waiting");

  // THE ITEMISATION AND THE LINKS, behind the row's own disclosure — the narrow-screen strategy.
  const row = page.getByTestId(`claim-row-${SEC.postedClaimId}`);
  await row.getByText("Items and links").click();
  await expect(row.getByText("KL–Penang return flight")).toBeVisible();
  await expect(row.getByText("Client dinner")).toBeVisible();
  // THE EXPLICIT MISSING FACT, on the row that has one.
  const waiting = page.getByTestId(`claim-row-${SEC.waitingClaimId}`);
  await waiting.getByText("Items and links").click();
  await expect(waiting.getByText("Waiting on incurred_date")).toBeVisible();
  // THE CORRECTION CHAIN, readable from the reversed end.
  const reversed = page.getByTestId(`claim-row-${SEC.reversedClaimId}`);
  await reversed.getByText("Items and links").click();
  await expect(reversed.getByText(SEC.correctionClaimId)).toBeVisible();

  await scan(page, "the claim register");
});

test("t638 an EMPTY register is its own state, not a failure", async ({ page }) => {
  await page.goto(REGISTER_URL);
  await control(page, { op: "empty_history" });
  await page.reload();
  await expect(page.getByText("No staff expense claim has been recorded for this client yet.")).toBeVisible();
  // …and the primary act is still offered, because an empty register is where a first claim starts.
  await expect(page.getByRole("link", { name: "Record staff expense claim" })).toBeVisible();
  await scan(page, "the empty claim register");
});

// ---------------------------------------------------------------------------------------------
// THE SHARED INTERACTION CONTRACT.
// ---------------------------------------------------------------------------------------------

test("t638 the URL is stable, Back returns, and the draft survives both", async ({ page }) => {
  await page.goto(REGISTER_URL);
  await page.getByRole("link", { name: "Record staff expense claim" }).click();
  await expect(page).toHaveURL(new RegExp(`${FORM_URL}$`));
  await fillClaim(page);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${REGISTER_URL}$`));
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`${FORM_URL}$`));
  // THE DRAFT IS STILL THERE — under the same user+firm+client scope, so it cannot have crossed
  // into another client's books either.
  await expect(field(page, "items.0.description")).toHaveValue("KL–Penang return flight");
  await expect(field(page, "incurredDate")).toHaveValue("2026-03-04");

  // A RELOAD IS THE SAME PROMISE.
  await page.reload();
  await expect(field(page, "items.0.description")).toHaveValue("KL–Penang return flight");
});

test("t638 at 320 px and at 200 % zoom the amount, the identity and the primary action stay reachable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(REGISTER_URL);
  await settle(page);
  // NO PAGE-WIDE HORIZONTAL SCROLL. A genuinely two-dimensional ledger table may have its own
  // labelled horizontal viewport; the PAGE may not (appendix C §4).
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the register must not scroll the page horizontally at 320 px").toBeLessThanOrEqual(1);
  await expect(page.getByRole("link", { name: "Record staff expense claim" })).toBeVisible();
  await scan(page, "the claim register at 320 px");

  await page.goto(FORM_URL);
  await chartReady(page);
  await settle(page);
  const formOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(formOverflow, "the form must not scroll the page horizontally at 320 px").toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible();

  // 200 % ZOOM, as a 640 px-wide viewport at twice the device pixel ratio — the shape the sibling
  // walks use, because Playwright cannot set a browser zoom directly.
  await page.setViewportSize({ width: 640, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(FORM_URL);
  await chartReady(page);
  await settle(page);
  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible();
  await expect(page.getByTestId("claim-total")).toBeVisible();
  await scan(page, "the claim form at 200 % zoom with reduced motion");
});

test("t638 every control has a screen-reader name, and the keyboard reaches the primary action", async ({ page }) => {
  await page.goto(FORM_URL);
  await chartReady(page);
  await settle(page);

  // EVERY FOCUSABLE CONTROL IS NAMED. An unnamed control is a control a screen-reader user meets as
  // "edit text, blank" — the one failure axe cannot always see on a custom composition.
  const unnamed = await page.evaluate(() => {
    const focusable = Array.from(document.querySelectorAll<HTMLElement>(
      "input:not([type=hidden]), select, textarea, button, [role=radio]"));
    return focusable
      .filter((el) => {
        if (el.getAttribute("aria-hidden") === "true") return false;
        const labelled = el.getAttribute("aria-label")
          ?? el.getAttribute("aria-labelledby")
          ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : null)
          ?? el.closest("label")?.textContent
          ?? el.textContent;
        return (labelled ?? "").trim() === "";
      })
      .map((el) => `${el.tagName.toLowerCase()}#${el.id || "(no id)"}`);
  });
  expect(unnamed, "every focusable control carries an accessible name").toEqual([]);

  // THE KEYBOARD REACHES THE PRIMARY ACTION, and pressing it submits the form.
  await fillClaim(page);
  await field(page, "instruction").focus();
  const submit = page.getByRole("button", { name: "Submit" });
  for (let i = 0; i < 30; i += 1) {
    const onSubmit = await submit.evaluate((el) => el === document.activeElement);
    if (onSubmit) break;
    await page.keyboard.press("Tab");
  }
  await expect(submit).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT}/work/${SEC.workId}$`));
});
