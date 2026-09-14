import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { cellBudgetMs, ensureRealFocus, settleForScan, watchReactFaults } from "./helpers";
import { JOURNAL_WORK } from "./journal-work-mock.mjs";
import { MOTION_LOCAL_STORAGE_KEY } from "../lib/settings/motion-preference";

/**
 * #623 · THE BROWSER LEG for the first persistent Clara successor — journeys C3
 * (compose a documentless journal entry), B3 (the durable Work detail) and B6
 * (the accepted-Work card in a conversation).
 *
 * WHY THESE CLAIMS NEED A BROWSER. Every one of them is a property the unit
 * harness structurally cannot hold: a real `sessionStorage` that survives a
 * navigation, a real focus manager (first-invalid focus, heading focus on
 * arrival, and the half that matters more — a background poll that does NOT
 * steal focus), a real `fetch` whose response can genuinely be LOST, real timers
 * driving a 3-second poll, real layout geometry at 320 CSS px and at 200% zoom,
 * and a real `prefers-reduced-motion` media query. The unit cells prove the
 * rules; this proves the journey.
 *
 * WHAT IT DOES NOT PROVE, stated so a green here is not read as more than it is.
 * PostgREST and the runtime's `/api/work/*` legs are fixtures
 * (`journal-work-mock.mjs`). So nothing below establishes that
 * `clara.admit_journal_work` really keys idempotency on `(firm, intent_key)`,
 * that `clara.wake_record_journal_entry` refuses a closed period, or that
 * `claraWork_v1` ever runs. The database lane's suite and the runtime lane's
 * world e2e own those; this lane owns what the browser does with their answers.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = JOURNAL_WORK.clientId;
const COMPOSER_URL = `/clients/${CLIENT}/accounting/journal/new`;
const WORK_LIST_URL = `/clients/${CLIENT}/work`;

/** The scope key `lib/work/journal-draft.ts` files a draft under — the shared
 *  SUBJECT and FIRM_ID `serve-built.mjs` signs every walk in as. Written out
 *  here because this walk SEEDS a draft to reach the one validation rule the
 *  select cannot produce (see the unknown-account cell). */
const DRAFT_KEY = `clara:journal-draft:11111111-1111-1111-1111-111111111111:33333333-3333-4333-8333-333333333333:${CLIENT}`;

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

/**
 * Drive the fixture's Work state machine from inside the signed-in page.
 *
 * IT GOES THROUGH THE APP'S OWN PROXY, deliberately: `/api/runtime/…` is the
 * only door the browser has to the runtime, so the control call carries the real
 * session, passes the real firm-scope guard and proves the proxy is reachable
 * for this lane at the same time. The alternative — an app-origin backdoor —
 * would have been a second mechanism to trust.
 */
async function control(page: Page, body: Record<string, unknown>): Promise<void> {
  const status = await page.evaluate(
    async (call: { path: string; payload: Record<string, unknown> }) => {
      const res = await fetch(call.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(call.payload),
      });
      return res.status;
    },
    { path: `${JOURNAL_WORK.controlPath}?client=${encodeURIComponent(CLIENT)}`, payload: body },
  );
  expect(status, `the fixture control endpoint answered ${status}`).toBe(200);
}

/**
 * #631 · OPEN THE ACTIVITY TAB, which is where the Diagnostics section lives after wave-3
 * integration. #631 wrote the mount beneath the identity block because #641 was turning this
 * page into Tabs on another branch at the same time; the integrator moved it inside Activity,
 * exactly as #631's own mount comment said it would. The tab is NOT `keepMounted`, so the trace
 * read fires HERE and not on every visit to a Work detail — which is also why every cell below
 * opens the tab before asserting anything about the trace.
 */
async function openDiagnostics(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
}

/**
 * #760 — the settle-then-scan instrument moved to `./helpers` (`settleForScan`),
 * where its measured rationale now lives for every walk instead of this one. The
 * pointer park that used to open it is gone with it: `hover:bg-primary/80` was the
 * real AA shortfall behind it and is fixed at source (`components/ui/button.tsx`,
 * `components/ui/badge.tsx`, `/90` = 5.451:1), so the scans measure the hover state
 * for real rather than dodging it.
 */
async function scan(page: Page, what: string): Promise<void> {
  await settleForScan(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  // A positive control on the instrument itself: an empty `violations` array
  // proves nothing unless the scan actually looked at this page.
  expect(results.passes.length, `${what}: axe must actually have inspected the page`).toBeGreaterThan(0);
  expect(results.violations, `${what} axe violations`).toEqual([]);
}

/** The one balanced basis this walk composes: RM 1,200 office rent paid from
 *  Maybank — journey B6's own worked example, typed by hand in C3. */
async function fillBalancedBasis(page: Page): Promise<void> {
  await page.getByLabel("Posting date").fill("2026-09-01");
  await page.getByLabel("Memo").fill("Office rent paid from Maybank");
  await page.getByLabel("Account, line 1").selectOption(JOURNAL_WORK.rentAccount);
  await page.getByLabel("Debit, line 1").fill("1200.00");
  await page.getByLabel("Account, line 2").selectOption(JOURNAL_WORK.bankAccount);
  await page.getByLabel("Credit, line 2").fill("1200.00");
}

/** The id in `/clients/:clientId/work/:workId`, read off the address bar — the
 *  walk never learns a Work id any other way, which is what makes "it landed on
 *  the SAME Work" a claim about the product rather than about the fixture. */
function workIdIn(url: string): string {
  const found = /\/work\/([0-9a-f-]{36})(?:$|[?#])/i.exec(url);
  expect(found, `no work id in ${url}`).toBeTruthy();
  return found![1]!;
}

test.beforeEach(async ({ page }) => {
  // The fixture lives for the server's lifetime (`workers: 1`), so every cell
  // starts from the same seed rather than from whatever the last one left.
  await signInTo(page, WORK_LIST_URL);
  await control(page, { op: "reset" });
});

test("C3 → B3: compose, refuse the invalid drafts, submit, and watch ONE Work run to a posted entry", async ({ page }) => {
  // #706 — TWO fixture-driven status polls (Queued→Running, Running→Completed) and TWO full-page
  // axe scans (the balanced draft, then the completed detail — the step measured at 33 s under
  // load against 14.4 s alone). The flat 30 s default turned that into a timeout that read as a
  // product defect.
  test.setTimeout(cellBudgetMs({ polls: 2, scans: 2 }));
  // THE HUB'S PRIMARY ACT. Everything else on Accounting is a card that takes
  // you somewhere to look; this is the one thing a bookkeeper comes there to DO.
  await page.goto(`/clients/${CLIENT}/accounting`);
  const compose = page.getByRole("link", { name: "Record journal entry" });
  await expect(compose).toBeVisible();
  await compose.click();
  await expect(page).toHaveURL(new RegExp(`${COMPOSER_URL}$`));

  // The leaf DEEPENS the trail by one and its parent becomes a link — the row
  // the sidebar is still marking current is now an ancestor.
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link", { name: "Accounting", exact: true })).toBeVisible();
  await expect(crumbs.getByText("Record journal entry")).toBeVisible();

  // ── validation, and the FIRST INVALID CONTROL takes focus ──────────────────
  // Nothing is red before a submit: a form that reds every field before anyone
  // has typed is telling a human off for not having started.
  await expect(page.getByText("Enter a memo describing this entry.")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Enter a memo describing this entry.")).toBeVisible();
  await expect(page.getByText("Choose an account for this line.")).toHaveCount(2);
  await expect(page.getByText("Enter a debit or a credit for this line.")).toHaveCount(2);
  // Memo is the first invalid control in DOM order (the posting date defaults to
  // today), so it is the one that receives focus.
  await expect(page.getByLabel("Memo")).toBeFocused();

  // UNBALANCED. Per-line rules pass, so the only issue is the whole-table one —
  // and it is focusable precisely because `firstInvalidField` can name it.
  await page.getByLabel("Memo").fill("Office rent paid from Maybank");
  await page.getByLabel("Account, line 1").selectOption(JOURNAL_WORK.rentAccount);
  await page.getByLabel("Debit, line 1").fill("1200.00");
  await page.getByLabel("Account, line 2").selectOption(JOURNAL_WORK.bankAccount);
  await page.getByLabel("Credit, line 2").fill("1000.00");
  // The live difference is exact cents and is ALWAYS rendered, so a balanced
  // entry shows its zero rather than the row simply disappearing.
  const lines = page.getByRole("region", { name: "Journal entry lines" });
  await expect(lines.getByText("RM 200.00")).toBeVisible();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Debits and credits must be equal.")).toBeVisible();
  await expect(page.locator("#journal-basis-lines")).toBeFocused();

  // ONE SIDE PER LINE, enforced at the KEYSTROKE: typing a credit on a line that
  // already carries a debit zeroes the debit rather than waiting for a submit to
  // complain about a shape the form could simply keep.
  await page.getByLabel("Credit, line 1").fill("50.00");
  await expect(page.getByLabel("Debit, line 1")).toHaveValue("");
  await page.getByLabel("Debit, line 1").fill("1200.00");
  await expect(page.getByLabel("Credit, line 1")).toHaveValue("");
  await page.getByLabel("Credit, line 2").fill("1200.00");
  await expect(lines.getByText("RM 0.00").first()).toBeVisible();

  await scan(page, "journal composer, balanced draft");

  // ── submit → the durable Work ─────────────────────────────────────────────
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  const workId = workIdIn(page.url());

  // The address is the persistent outcome; the page states what it knows and
  // nothing else — no percentage, no estimate.
  await expect(page.getByRole("heading", { level: 1, name: "Journal entry" })).toBeVisible();
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  await expect(page.getByText("No source document — user-supplied basis")).toBeVisible();
  await expect(page.getByText("owner, at the time it was submitted")).toBeVisible();
  const basis = page.getByRole("region", { name: "Requested journal entry lines" });
  await expect(basis.getByText(`${JOURNAL_WORK.rentAccount} — Office rent`)).toBeVisible();
  await expect(basis.getByText("RM 1,200.00").first()).toBeVisible();
  // Nothing is claimed to have been recorded yet.
  await expect(page.getByText("What was recorded")).toHaveCount(0);

  // ── browser Back, over the navigation the composer itself pushed ──────────
  // §3's "Accepted long operation": the human may navigate away from an accepted
  // Work and come back. Back lands on the FORM they came from — and the form is
  // EMPTY, because the draft was retired the moment the runtime named the Work.
  // A composer that still held those figures would be offering a second
  // submission of an entry that is already durable.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${COMPOSER_URL}$`));
  await expect(page.getByLabel("Memo")).toHaveValue("");
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/work/${workId}$`));
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();

  // ── the run, observed ─────────────────────────────────────────────────────
  await control(page, { op: "run", workId });
  await expect(page.getByText("Running", { exact: true })).toBeVisible({ timeout: 15_000 });

  await control(page, { op: "complete", workId });
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("What was recorded")).toBeVisible();
  await expect(page.getByRole("link", { name: "View in Journals" })).toBeVisible();
  const posted = page.getByRole("region", { name: "Posted journal entry lines" });
  await expect(posted.getByText(`${JOURNAL_WORK.bankAccount} — Cash at bank — Maybank`)).toBeVisible();
  await scan(page, "work detail, completed");

  // EXACTLY ONE NEW WORK exists for this client — a submit that produced two
  // rows would still have rendered a plausible detail page. THREE rows: the
  // header, the Work the fixture seeds for the B6 conversation cell, and the one
  // this cell composed.
  await page.goto(WORK_LIST_URL);
  // #641 — the list on this page is now the server-backed durable Work list over
  // `clara.list_accounting_work`, and its table region is named "Durable work" (it was "Accounting
  // work" when the page read the table directly). `journal-work-mock.mjs`'s own
  // `journalWorkListPage` projects the SAME live `state.works` Map this walk admits into, so the
  // count below is still the count this lane actually minted.
  const list = page.getByRole("region", { name: "Durable work" });
  await expect(list.getByRole("row")).toHaveCount(3);
  await expect(list.getByText("Completed", { exact: true })).toHaveCount(2);
});

test("a restored draft carries its own figures, and an account the chart does not know is refused BESIDE the control", async ({ page }) => {
  // THE ONE VALIDATION RULE THE SELECT CANNOT PRODUCE. `accountUnknown` fires on
  // a code that is not in the client's active chart — and the picker only ever
  // offers codes that are. A draft restored from `sessionStorage` is untrusted
  // input like any other persisted payload, and it is exactly how such a code
  // reaches the form in production too (a chart edited after the draft was
  // typed). So this cell proves the restore AND the rule with one fixture.
  await page.evaluate(
    ([key, value]) => window.sessionStorage.setItem(key, value),
    [
      DRAFT_KEY,
      JSON.stringify({
        intentKey: "e2e-restored-draft-intent",
        postingDate: "2026-09-01",
        memo: "Restored from an earlier tab",
        lines: [
          { account_code: JOURNAL_WORK.unknownAccount, debit_cents: 120_000, credit_cents: 0, description: "" },
          { account_code: JOURNAL_WORK.bankAccount, debit_cents: 0, credit_cents: 120_000, description: "" },
        ],
      }),
    ] as const,
  );

  await page.goto(COMPOSER_URL);
  await expect(page.getByLabel("Memo")).toHaveValue("Restored from an earlier tab");
  await expect(page.getByLabel("Posting date")).toHaveValue("2026-09-01");
  await expect(page.getByText("This draft is kept in this tab for this client until you submit it.")).toBeVisible();
  // The retired account is not on offer, so the restored code cannot have come
  // from the picker.
  await expect(page.getByLabel("Account, line 1").locator("option")).toHaveCount(3); // placeholder + two ACTIVE codes

  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("This client's chart has no active account with that code.")).toBeVisible();
  await expect(page.locator("#journal-basis-line-0-account")).toBeFocused();
  // Nothing was admitted: the draft is intact and the list is still empty.
  await expect(page.getByLabel("Memo")).toHaveValue("Restored from an earlier tab");
});

test("B3 recovery: a typed refusal renders VERBATIM, and Retry starts a NEW run of the SAME Work", async ({ page }) => {
  // #706 — THREE 15 s fixture polls (Refused, then Queued after Retry, then Completed) plus a
  // full-page axe scan of the refused detail, all sharing one flat 30 s budget before this.
  test.setTimeout(cellBudgetMs({ polls: 3, scans: 1 }));
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  const workId = workIdIn(page.url());

  await control(page, { op: "run", workId });
  await control(page, {
    op: "refuse",
    workId,
    code: "CLR10",
    reason: "write_into_closed_period",
    message: "The period for 2026-09-01 is closed, so this entry was not posted.",
  });

  // THE DATABASE'S OWN WORDS. A refusal is a receipt; the UI renders it and its
  // typed code rather than re-wording either into something friendlier.
  await expect(page.getByText("Refused", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("The period for 2026-09-01 is closed, so this entry was not posted.")).toBeVisible();
  await expect(page.getByText("CLR10 · write_into_closed_period")).toBeVisible();
  // Two next actions, and only one of them is a write.
  await expect(page.getByRole("link", { name: "Edit as a new draft" })).toBeVisible();
  await scan(page, "work detail, refused");

  await page.getByRole("button", { name: "Run this again" }).click();
  // The SAME address, so the same durable record and the same logical operation.
  await expect(page).toHaveURL(new RegExp(`/work/${workId}$`));
  await expect(page.getByText("Queued", { exact: true })).toBeVisible({ timeout: 15_000 });

  await control(page, { op: "complete", workId });
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("What was recorded")).toBeVisible();

  // STILL EXACTLY ONE WORK FOR THIS INTENT. A retry that had admitted a second
  // one would look identical on this page and be a duplicated accounting
  // operation. Three rows again: header, the seeded conversation Work, and this
  // cell's one.
  await page.goto(WORK_LIST_URL);
  await expect(page.getByRole("region", { name: "Durable work" }).getByRole("row")).toHaveCount(3);
});

test("a 400 focuses the control the SERVER named, and the wire's line index is ONE-BASED", async ({ page }) => {
  // WHY A BROWSER FOR THIS. `fieldForServerPath` has unit cells, but only a real
  // form can prove that the string the runtime sends reaches a control that
  // exists and takes focus. The refusal is INJECTED (see the mock's header:
  // nothing this composer can build reaches the route invalid), and the walk
  // states the exact wire path — `lines[2].credit_cents` — so a mapper that read
  // the index as zero-based would focus the THIRD row, which does not exist, and
  // red this cell instead of silently misdirecting a preparer.
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);
  await control(page, { op: "refuse_basis", field: "lines[2].credit_cents", reason: "exactly_one_side" });

  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("The server did not accept these figures")).toBeVisible();
  // The server's own machine-readable reason, verbatim beside the message.
  await expect(page.getByText("exactly_one_side")).toBeVisible();
  // `lines[2]` IS THE SECOND ROW.
  await expect(page.locator("#journal-basis-line-1-credit")).toBeFocused();
  // Nothing was admitted and the draft is untouched.
  await expect(page).toHaveURL(new RegExp(`${COMPOSER_URL}$`));
  await expect(page.getByLabel("Memo")).toHaveValue("Office rent paid from Maybank");

  // The SAME path one row up lands one row up. Two cells' worth of claim in one
  // walk, because the offset is the whole risk here.
  await control(page, { op: "refuse_basis", field: "lines[1].account_code", reason: "nonempty" });
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator("#journal-basis-line-0-account")).toBeFocused();
});

test("a 409 says the figures differ from what that identity already named, and LINKS the Work it named", async ({ page }) => {
  // THE CONFLICT ARM, reached the way production reaches it: a draft whose
  // `intentKey` the firm has ALREADY spent, carrying different figures. The
  // seeded conversation Work owns that key (the fixture registers it, as
  // `unique (firm_id, intent_key)` guarantees a real row does), so submitting a
  // different basis under it is exactly `intent_payload_conflict`.
  await page.evaluate(
    ([key, value]) => window.sessionStorage.setItem(key, value),
    [
      DRAFT_KEY,
      JSON.stringify({
        intentKey: JOURNAL_WORK.seededIntentKey,
        postingDate: "2026-09-01",
        memo: "Office rent paid from Maybank",
        lines: [
          // RM 900, not the seeded RM 1,200 — a DIFFERENT payload under the same
          // identity, which is the only thing that earns a 409.
          { account_code: JOURNAL_WORK.rentAccount, debit_cents: 90_000, credit_cents: 0, description: "" },
          { account_code: JOURNAL_WORK.bankAccount, debit_cents: 0, credit_cents: 90_000, description: "" },
        ],
      }),
    ] as const,
  );

  await page.goto(COMPOSER_URL);
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("This draft was already submitted with different figures")).toBeVisible();
  // THE LINK IS THE POINT OF THE FINDING THAT MINTED THIS CELL. The 409 carries
  // `work_id`; without a route to it a human is told a Work exists and given no
  // way to look at it.
  const open = page.getByRole("link", { name: "Open the existing work" });
  await expect(open).toBeVisible();
  await open.click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT}/work/${JOURNAL_WORK.seededWorkId}$`));
  // It really is the Work that identity named — RM 1,200, not the RM 900 on the
  // form that was refused.
  await expect(
    page.getByRole("region", { name: "Requested journal entry lines" }).getByText("RM 1,200.00").first(),
  ).toBeVisible();

  // Back on the form (its draft intact, because nothing was admitted), the OTHER
  // next action rotates the identity and keeps the typed figures — and the very
  // same submit is then admitted as its own Work.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${COMPOSER_URL}$`));
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("This draft was already submitted with different figures")).toBeVisible();
  await page.getByRole("button", { name: "Start a new draft with these figures" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  expect(workIdIn(page.url()), "a rotated identity is a NEW Work").not.toBe(JOURNAL_WORK.seededWorkId);
  await expect(
    page.getByRole("region", { name: "Requested journal entry lines" }).getByText("RM 900.00").first(),
  ).toBeVisible();
});

test("AWAITING INPUT shows the question the run is parked on, not just that there is one", async ({ page }) => {
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  const workId = workIdIn(page.url());

  await control(page, { op: "run", workId });
  await control(page, {
    op: "ask",
    workId,
    question: "Which Maybank account did this rent leave from?",
    context: "This client has two accounts coded 1100.",
  });

  await expect(page.getByText("Waiting for an answer").first()).toBeVisible({ timeout: 15_000 });
  // THE QUESTION ITSELF, read off `clara.agent_interruptions` under the caller's
  // own RLS — on a page that had already read the task it belongs to.
  await expect(page.getByText("Which Maybank account did this rent leave from?")).toBeVisible();
  await expect(page.getByText("This client has two accounts coded 1100.")).toBeVisible();
  // Answering is another surface's job, so the route to it is still offered.
  await expect(page.getByRole("link", { name: "Open what needs you" })).toBeVisible();
  await scan(page, "work detail, awaiting input");
});

test("EDIT AS A NEW DRAFT lands on a composer already holding these figures, under a NEW identity", async ({ page }) => {
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);
  await page.getByLabel("Description, line 1").fill("September rent");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  const workId = workIdIn(page.url());
  // THE BASELINE THE SEEDING IS MEASURED AGAINST: the draft was retired the
  // moment the runtime named the Work, so anything the composer holds after the
  // link below can only have come from this page.
  expect(
    await page.evaluate((key) => window.sessionStorage.getItem(key), DRAFT_KEY),
    "the draft is retired on a 202",
  ).toBeNull();

  await control(page, { op: "run", workId });
  await control(page, { op: "refuse", workId });
  await expect(page.getByText("Refused", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "Edit as a new draft" }).click();
  await expect(page).toHaveURL(new RegExp(`${COMPOSER_URL}$`));

  // THE COMPOSER IS SEEDED. Before this fix the link opened an empty form and a
  // human had to retype a basis the page was already showing them.
  await expect(page.getByLabel("Memo")).toHaveValue("Office rent paid from Maybank");
  await expect(page.getByLabel("Posting date")).toHaveValue("2026-09-01");
  await expect(page.getByLabel("Account, line 1")).toHaveValue(JOURNAL_WORK.rentAccount);
  await expect(page.getByLabel("Account, line 2")).toHaveValue(JOURNAL_WORK.bankAccount);
  await expect(page.getByLabel("Description, line 1")).toHaveValue("September rent");
  // The AMOUNTS came across as exact cents — asserted through the form's own
  // live totals rather than a formatted input string, so the claim is about the
  // money rather than about a display convention.
  const seeded = page.getByRole("region", { name: "Journal entry lines" });
  await expect(seeded.getByText("RM 1,200.00").first()).toBeVisible();
  await expect(seeded.getByText("RM 0.00").first()).toBeVisible();

  // AND IT CARRIES A NEW IDENTITY. Submitting these edited figures must admit a
  // SECOND Work rather than earning `intent_payload_conflict` for doing exactly
  // what the link offered.
  await page.getByLabel("Debit, line 1").fill("1000.00");
  await page.getByLabel("Credit, line 2").fill("1000.00");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  expect(workIdIn(page.url()), "a new intent is a NEW Work, never the refused one").not.toBe(workId);
  await expect(
    page.getByRole("region", { name: "Requested journal entry lines" }).getByText("RM 1,000.00").first(),
  ).toBeVisible();
});

test("a LOST acknowledgement resolves to the SAME Work, because the re-post carries the SAME intent key", async ({ page }) => {
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);

  // THE LOSS IS ENGINEERED IN THE BROWSER'S NETWORK LAYER, and that is the only
  // place it can be. A runtime that simply died would reach this page as the
  // proxy's own 502 (`app/api/runtime/[...path]/route.ts` catches the failed
  // fetch), which is `unavailable` — the server ANSWERED and said no. `lost`
  // means NO answer was observed while the request may well have been admitted,
  // so the request has to REACH the fixture and the response has to vanish on
  // the way back. `route.fetch()` performs it; `route.abort()` drops the answer.
  let posts = 0;
  await page.route("**/api/runtime/work/journal", async (route) => {
    posts += 1;
    if (posts === 1) {
      await route.fetch(); // the fixture admits the Work…
      await route.abort(); // …and the page never learns that it did
      return;
    }
    // A beat on the resolution attempt, so the "Checking…" status is observable
    // rather than a frame nobody could catch.
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  await page.getByRole("button", { name: "Submit" }).click();
  // §3's lost-response rule: read the current state BEFORE offering a distinct
  // resubmit. The form says so, in a live region, because "Checking…" REPLACES
  // "Submitting…" mid-flight.
  await expect(page.getByText("Checking whether this was already accepted…")).toBeVisible({ timeout: 15_000 });

  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const workId = workIdIn(page.url());
  expect(posts, "the composer must have re-sent exactly once, not looped").toBe(2);

  // THE PROOF THAT IT RESOLVED RATHER THAN ADMITTED: the fixture holds ONE Work,
  // and it is the one this page is showing. A second admission would have left
  // two rows here and the human looking at whichever the navigation picked.
  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  await page.goto(WORK_LIST_URL);
  const list = page.getByRole("region", { name: "Durable work" });
  // Header, the seeded conversation Work, and ONE admitted Work — not two.
  await expect(list.getByRole("row")).toHaveCount(3);
  await expect(list.getByText("Queued", { exact: true })).toHaveCount(1);
  // Newest first, so the row this cell admitted is the first one — and following
  // its own link is what proves the list addresses the same durable record.
  //
  // #641 — THE ROW LINK IS THE MEMO, not a separate "Open work" cell. The rebuilt list keeps the
  // primary action VISIBLE on the row itself (appendix C §3: a primary next action never lives only
  // inside an overflow menu) and the row's own text is what it names, so the address is reached by
  // clicking what a person reads rather than a repeated verb in a trailing column.
  // Both rows carry this memo (the seeded Work and the one this cell admitted were submitted with
  // the same basis text), so `.first()` is the NEWEST — which is the row this cell is about.
  await list.getByRole("link", { name: "Office rent paid from Maybank" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/work/${workId}$`));
});

test("B6: the accepted-Work card in a conversation links to the durable record it names", async ({ page }) => {
  await page.goto(WORK_LIST_URL);
  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();

  // THE THREE DURABLE-WORK KINDS, read off a transcript rather than handed to a
  // component as props: the accepted receipt, the run's compact status line, and
  // the committed effect.
  await expect(rail.getByText("Accounting work accepted")).toBeVisible();
  await expect(rail.getByText(`work:${JOURNAL_WORK.seededWorkId}:journal_entry:1`)).toBeVisible();
  await expect(rail.getByText("Work status")).toBeVisible();
  await expect(rail.getByText("Journal entry posted")).toBeVisible();
  // NO AMOUNT IN A CHAT CARD. The figures are read live on the Work's own page;
  // a number copied into a transcript is a number that goes stale.
  await expect(rail.getByText("RM 1,200.00")).toHaveCount(0);

  await rail.getByRole("link", { name: "Open this work" }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT}/work/${JOURNAL_WORK.seededWorkId}$`));
  await expect(page.getByText("From a Clara conversation")).toBeVisible();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
});

test("a malformed work id is the scoped NOT-FOUND state, never a database error", async ({ page }) => {
  // #614's lesson, applied to the second uuid this app takes off a URL: a
  // malformed `id=eq.not-a-work` on a uuid column is PostgREST 400 `22P02`,
  // which THROWS and reaches the error boundary instead of this page's own state.
  await page.goto(`/clients/${CLIENT}/work/not-a-work`);
  await expect(page.getByText("This work record was not found")).toBeVisible();
  await expect(page.getByText("Something went wrong")).toHaveCount(0);

  // A well-formed id that names nothing is the SAME state, reached the other way.
  await page.goto(`/clients/${CLIENT}/work/00000000-0000-4000-8000-000000000000`);
  await expect(page.getByText("This work record was not found")).toBeVisible();
});

test("320 CSS px and 200% zoom: the money grids scroll inside their own named viewports, the page does not", async ({ page }) => {
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  const workId = workIdIn(page.url());
  await control(page, { op: "run", workId });
  await control(page, { op: "complete", workId });
  await expect(page.getByText("What was recorded")).toBeVisible({ timeout: 15_000 });

  // 200% browser zoom is EXACTLY a halving of the CSS viewport (WCAG 2.2 SC
  // 1.4.10 is written in CSS pixels), and 320 is the reflow floor itself.
  for (const [label, size] of [
    ["200% zoom", { width: 640, height: 720 }],
    ["320 CSS px", { width: 320, height: 720 }],
  ] as const) {
    await page.setViewportSize(size);
    for (const [face, url] of [
      ["work detail", `/clients/${CLIENT}/work/${workId}`],
      ["composer", COMPOSER_URL],
    ] as const) {
      await page.goto(url);
      await expect(
        page.getByRole("region", { name: face === "composer" ? "Journal entry lines" : "Requested journal entry lines" }),
      ).toBeVisible();
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        `${face} at ${label}: the document scrolls sideways (${overflow.scrollWidth} > ${overflow.clientWidth})`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    }
  }

  // THE TABLE'S OWN VIEWPORT is what makes that true: a genuinely
  // two-dimensional money grid is allowed its own labelled horizontal scroller
  // (§4), and it must be a real one — reachable, named, and actually scrollable
  // at this width rather than merely clipped.
  const region = page.getByRole("region", { name: "Journal entry lines" });
  const scroller = await region.evaluate((el) => ({
    tabIndex: el.tabIndex,
    scrollable: el.scrollWidth > el.clientWidth,
    overflowX: getComputedStyle(el).overflowX,
  }));
  expect(scroller.tabIndex, "the scroll region must be keyboard-reachable").toBe(0);
  expect(scroller.overflowX).toBe("auto");
  expect(scroller.scrollable, "the lines grid must scroll inside itself at 320 CSS px").toBe(true);

  await page.setViewportSize({ width: 1280, height: 720 });
});

test("reduced motion: nothing on these surfaces MOVES, and the opacity that remains is allowed to", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(WORK_LIST_URL);

  // The transcript's Work cards carry `enter-content`, the app's ONE
  // content-arrival transition. Under `reduce` it must drop `translate` from the
  // transitioned property list and keep `opacity` — the token contract's own
  // rule ("reduced motion removes position, scale, stagger and parallax; opacity
  // remains"), measured as computed style rather than read off a class string.
  const card = page.locator("[data-clara-rail] .enter-content").first();
  await expect(card).toBeVisible();
  const reduced = await card.evaluate((el) => {
    const s = getComputedStyle(el);
    return { property: s.transitionProperty, transform: s.transform, translate: s.translate };
  });
  expect(reduced.property.includes("translate"), `transition-property was "${reduced.property}"`).toBe(false);
  expect(reduced.property).toContain("opacity");
  expect(reduced.transform === "none" || reduced.transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);

  // The one Skeleton on this journey is the Work detail's first paint. Its
  // `animate-pulse` is an OPACITY animation and stays — what must not appear is
  // a transform.
  await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.seededWorkId}`);
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  const moved = await page.evaluate(() =>
    [...document.querySelectorAll("main *")].filter((el) => {
      const s = getComputedStyle(el);
      return s.transform !== "none" && s.transform !== "matrix(1, 0, 0, 1, 0, 0)";
    }).length,
  );
  expect(moved, "an element on the Work detail is transformed under reduced motion").toBe(0);
});

test("focus: the heading takes focus on arrival, and a background update never takes it back", async ({ page }) => {
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  const workId = workIdIn(page.url());

  // §4: "Work detail focuses its heading when reached by navigation."
  await expect(page.locator("#work-detail-heading")).toBeFocused();

  // …AND ITS OTHER HALF, which is the one a static read cannot establish:
  // "merely opening a background update does not steal focus". Move focus
  // somewhere a human would have put it, then let a poll observe a status change.
  await ensureRealFocus(page);
  await page.keyboard.press("Tab");
  const focusedBefore = await page.evaluate(() => document.activeElement?.tagName ?? null);
  expect(focusedBefore, "Tab must have moved focus off the heading").not.toBe("H1");

  await control(page, { op: "run", workId });
  await expect(page.getByText("Running", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#work-detail-heading")).not.toBeFocused();
  // Still running, so nothing claims to have been posted — the poll changed the
  // STATUS and nothing else.
  await expect(page.getByRole("link", { name: "View in Journals" })).toHaveCount(0);
});

/**
 * #727 — THE WORK DETAIL ROUTE HYDRATES CLEAN.
 *
 * The owner's 2026-09-11 signed-in walk read THREE `Minified React error #418` in the
 * console on `/clients/:id/work/:workId`. #418 is React's hydration mismatch: the HTML the
 * server rendered did not match what the client rendered first. It is invisible — the page
 * looks right, because React silently re-renders the whole subtree on the client — which is
 * exactly why it needs a collector rather than an eye.
 *
 * A BROWSER IS THE ONLY INSTRUMENT FOR IT. The node harness mounts a stub DOM with no HTML
 * parser, so it can render a tree but cannot HYDRATE one: there is no server-rendered markup
 * for a client render to disagree with. This cell runs against the real `next build` output
 * served by `next start`, so the server render, the shipped bundle and the browser's own
 * parser are all the production ones.
 */

// ===========================================================================================
// #631 · THE DIAGNOSTICS SECTION AND THE EGRESS REFUSAL FACE.
//
// WHY THESE NEED A BROWSER. The unit cells over `WorkDiagnostics` prove the five faces against an
// injected reader. What only a browser holds is the REAL door — `callDoor` posting
// `/rest/v1/rpc/get_work_execution_trace` through the real fetch, the real session and the real
// refusal parser — plus real layout at 320 CSS px (a six-column table inside a page that must not
// scroll sideways), real focus, and a real `prefers-reduced-motion` query over the loading
// skeleton's own animation.
// ===========================================================================================

test("#631 B3: Diagnostics says WHICH bundle ran, under WHICH purpose, and keeps the steps behind a disclosure", async ({ page }) => {
  await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.seededWorkId}`);
  await openDiagnostics(page);

  // The SUMMARY first: the one-line answer a reviewer opens this section for, before any table.
  await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
  await expect(
    page.getByText("A model was called for this client under an authorisation consumed for this run."),
  ).toBeVisible();
  await expect(page.getByText("This run has not settled yet.")).toHaveCount(0);

  // THE STEPS ARE BEHIND A LABELLED DISCLOSURE, not dumped on the page: a Work detail is a
  // bookkeeper's screen, and four rows of capability ids are a diagnostic, not the headline.
  const disclosure = page.getByRole("button", { name: /Show \d+ steps/ });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.click();
  await expect(page.getByRole("button", { name: "Hide steps" })).toHaveAttribute("aria-expanded", "true");

  // THE VERSIONED IDENTITY, which is the whole point: which bundle, which capability, which
  // purpose. The digest is shown as a comparable prefix with the full value in the title.
  const table = page.getByRole("region", { name: "Execution trace steps" });
  await expect(table.getByText("accounting_work.model_segment").first()).toBeVisible();
  await expect(table.getByText("accounting_work.record_journal_entry")).toBeVisible();
  await expect(table.getByText("clara-work/v3 · 345f2a38c3c8…").first()).toBeVisible();
  await expect(table.getByText("accounting_work", { exact: true }).first()).toBeVisible();

  // NO PAYLOAD, and this is the browser-level control for it: the relation has no payload column,
  // so no prompt, no transcript and no admitted figure may appear in this section.
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Diagnostics" }) });
  const diagnosticsText = (await section.first().innerText()).toLowerCase();
  expect(diagnosticsText).not.toContain("office rent");
  expect(diagnosticsText).not.toContain("120,000");
  expect(diagnosticsText).not.toContain("1,200.00");
});

test("#631 B3: a Work with no steps, and a viewer who may not read them, are DIFFERENT answers", async ({ page }) => {
  // A Work that has recorded nothing yet is a REAL state (a queued run), and it must not read as
  // "you may not see this" — the refresh spec's Empty row ("distinguish … unavailable capability").
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/);
  await openDiagnostics(page);
  await expect(page.getByText("No steps have been recorded for this Work yet.")).toBeVisible();
  await expect(page.getByText("You do not have access to diagnostics")).toHaveCount(0);

  try {
    await control(page, { op: "trace_denied" });
    await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.seededWorkId}`);
    await openDiagnostics(page);
    await expect(page.getByText("You do not have access to diagnostics")).toBeVisible();
    await expect(page.getByText("Diagnostics are available to bookkeepers and above.")).toBeVisible();
    await expect(page.getByText("No steps have been recorded for this Work yet.")).toHaveCount(0);
    // …and the rest of the page is UNAFFECTED: a denied diagnostic is not a denied Work.
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  } finally {
    await control(page, { op: "reset" }).catch(() => {});
  }
});

test("#631 B3: an egress refusal names the AGREEMENT and no provider, and its trace shows no model call", async ({ page }) => {
  await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.seededWorkId}`);
  try {
    await control(page, { op: "egress_refused" });
    await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.egressRefusedWorkId}`);

    // THE OWNER-FACING FACE, above the database's own words.
    await expect(
      page.getByText("Clara is not authorised to use a model on this client's books"),
    ).toBeVisible();
    await expect(
      page.getByText("An owner can restore it by accepting the current Terms and Data Processing Agreement"),
    ).toBeVisible();
    // THE TYPED PAIR is still on screen as the refusal's code — a receipt, not a paraphrase.
    await expect(page.getByText("CLR13 · egress_not_authorized")).toBeVisible();

    // …and the Diagnostics section is OPENED BEFORE the vendor scan below, so the scan covers the
    // trace's own rendered text too rather than only the outcome band.
    await openDiagnostics(page);

    // NO PROVIDER DISCLOSURE, asserted over the WHOLE rendered page rather than one element.
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const vendor of ["openai", "anthropic", "azure", "gemini", "gpt-", "claude-"]) {
      expect(body, `the refused Work detail names ${vendor}`).not.toContain(vendor);
    }

    // AND THE DURABLE EVIDENCE THAT NOTHING WAS SENT: a dispatch row, refused, and no model call.
    await expect(page.getByText("No model was called: the run stopped before anything was sent.")).toBeVisible();
    await page.getByRole("button", { name: /Show \d+ steps/ }).click();
    const table = page.getByRole("region", { name: "Execution trace steps" });
    await expect(table.getByText("Model call")).toHaveCount(0);
    await expect(table.getByText("egress_not_authorized").first()).toBeVisible();
  } finally {
    await control(page, { op: "reset" }).catch(() => {});
  }
});

test("#631 B3: at 320 CSS px the step table scrolls inside its OWN viewport, and the page does not", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.seededWorkId}`);
  await openDiagnostics(page);
  await page.getByRole("button", { name: /Show \d+ steps/ }).click();
  // #760 moved this walk's settle instrument to `./helpers` as `settleForScan`; #631's B3 cell was
  // written against the local `settle` that lived here, and means the same wait.
  await settleForScan(page);

  const region = page.getByRole("region", { name: "Execution trace steps" });
  await expect(region).toBeVisible();
  // ITS OWN labelled horizontal viewport (appendix C §4): the region scrolls, the document does
  // not. A section that widened the page would push the amount and the status off screen.
  const scrolls = await region.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(scrolls, "the step table must have its own horizontal viewport at 320 px").toBe(true);
  const pageScrolls = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(pageScrolls, "the PAGE must not scroll sideways at 320 CSS px").toBe(false);

  // AXE, on this face at this width — the section introduces a table, a caption and a focusable
  // region, all of which are ordinary a11y failure sites.
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test("#727: the Work detail route hydrates with no React fault in the console", async ({ page }) => {
  const collector = watchReactFaults(page);
  // The same walk also reported ONE `Failed to load resource: 400` on this route with no
  // path attached, so this collector is what would name it. Every read this page makes is a
  // RLS read or a governed RPC that the client is supposed to be able to issue; a 4xx among
  // them is either a malformed filter (the `22P02` class #614 recorded for a bad uuid
  // segment) or an affordance asking for something it may not have.
  //
  // SCOPED TO THIS ROUTE'S OWN DATA READS (review C6). An unscoped collector claims EVERY
  // 4xx the browser ever sees — a missing favicon, a font, a Next chunk probed after a
  // redeploy, anything the harness serves — and reds a HYDRATION cell over a request that
  // has nothing to do with hydration. The two prefixes below are the only doors this page
  // has: `/e2e-supabase/rest/v1/…` is where `NEXT_PUBLIC_SUPABASE_URL` points
  // (serve-built.mjs:68), covering both `getRows` table reads and `callDoor` RPCs, and
  // `/api/runtime/…` is the app's own same-origin proxy, which is how `lib/work/api.ts`
  // reaches `/api/runtime/work/*`. A refusal at either is a real finding about this route.
  const ROUTE_READS = /^\/e2e-supabase\/rest\/v1\/|^\/api\/runtime\//;
  const rejected: string[] = [];
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const path = new URL(response.url()).pathname;
    if (!ROUTE_READS.test(path)) return;
    rejected.push(`${response.status()} ${path}`);
  });

  // `park_card` below arms `state.showParkedCard`, which puts a SECOND `work_accepted`
  // message into the transcript the Clara rail renders on EVERY route — so a cell that
  // leaves it armed leaves a second `work-question-*` subtree beside every later cell's
  // own, which is the strict-mode two-element match journal-work-mock.mjs:245 records.
  // `reset` is what disarms it, in a `finally`, exactly as work-question-walk.spec.ts's
  // own B6 cell and this file's `beforeEach` spell it.
  try {
    // A SEEDED, COMPLETED Work — the fullest version of this page: the facts block, the
    // basis table, the posted-entry block and its links row. A skeleton-only page would
    // hydrate clean for the boring reason that it renders almost nothing.
    await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.seededWorkId}`);
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
    // AND THE RAIL, which is half of what the owner was actually looking at: the docked
    // Clara rail is mounted by `app/(firm)/layout.tsx` on every firm route, and on this one
    // it is rendering this lane's B6 transcript — a `work_accepted` card that hydrates its
    // Work on mount, a `work_status` line and a `work_result`. That subtree is inside the
    // same hydration pass as the Work detail below it, so asserting it is on screen is what
    // stops this cell from proving hydration only for a page with the rail empty.
    const rail = page.locator("[data-clara-rail]");
    await expect(rail).toBeVisible();
    await expect(rail.getByText("Accounting work accepted")).toBeVisible();
    await settleForScan(page);

    // And the PARKED face, which mounts the question panel and its form — the subtree #629
    // added to this route, and the one that reads a `localStorage` draft in a lazy state
    // initialiser (lib/work/questions.ts's `readWorkAnswerDraft`). A read like that during
    // the FIRST client render is the classic #418 shape, so it is walked rather than
    // reasoned about.
    await control(page, { op: "park_card" });
    await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.parkedCardWorkId}`);
    await expect(page.getByText("Waiting for an answer").first()).toBeVisible({ timeout: 15_000 });
    await settleForScan(page);

    expect(
      collector.faults(),
      "the Work detail route must hydrate with no React nested-update or hydration fault",
    ).toEqual([]);
    expect(rejected, "no read this route issues may be refused by the server").toEqual([]);
    // The vacuity control on the collector itself: a listener that was never attached, or a
    // page that never loaded, also produces an empty list. `page.evaluate` proves the
    // channel this cell reads is live.
    await page.evaluate(() => console.error("e2e-727-collector-probe"));
    expect(collector.seen(), "the console collector must actually be receiving errors").toContain("e2e-727-collector-probe");
  } finally {
    await control(page, { op: "reset" }).catch(() => {});
  }
});

/**
 * #727 — THE SAME ROUTE, ARRIVED AT BY A BROWSER THAT HAS BEEN HERE BEFORE.
 *
 * WHY A SECOND CELL EXISTS AT ALL. The cell above loads the route in a browser context
 * Playwright has just minted: empty `localStorage`, empty `sessionStorage`, no cookies
 * beyond the sign-in the `beforeEach` performed. The owner's browser was nothing like
 * that — it had been driving this app for a session, so it carried a collapsed-sidebar
 * cookie, a motion preference, and whatever half-typed drafts the app files. A hydration
 * mismatch is by definition a disagreement between a render that had NO client state (the
 * server's) and the first render that did, so persisted state is the one input a fresh
 * context structurally cannot supply — and therefore the one this cell supplies on purpose.
 *
 * WHAT IS SEEDED, AND WHY EACH ONE. Each is a real key this product writes, named with the
 * module that owns it, not a plausible-looking invention:
 *   1. `sidebar_state=false` — a COOKIE, and the only seeded item the SERVER can read
 *      (`app/(firm)/layout.tsx:73` reads it through `cookies()` and passes `defaultOpen`).
 *      It is the half of a mismatch a client-side seed cannot move. See the assertion
 *      below for what this build actually did with it.
 *   2. `MOTION_LOCAL_STORAGE_KEY` (lib/settings/motion-preference.ts) — the repeat-visit
 *      paint cache `components/app-shell/motion-preference-sync.tsx` reads. The route also
 *      needs `clara.get_my_preferences()` (the async authority the same sync effect always
 *      defers to, per that file's own header) answered with `motion: "reduced"` — otherwise
 *      the fixture's default "nothing saved yet" answer (serve-built.mjs's `get_my_preferences`
 *      handler) overwrites the cache-seeded hint the instant that fetch resolves, and a
 *      returning browser's motion preference was never merely a paint-cache question to begin
 *      with. The `page.route` override below is the SAME per-test pattern
 *      personal-settings-walk.spec.ts uses for the identical RPC.
 *   3. The work-answer draft (lib/work/questions.ts's `workAnswerDraftKey`) — read in a
 *      LAZY `useState` INITIALISER at `components/work/work-question-form.tsx:156-157`,
 *      which is the textbook #418 shape: `globalThis.localStorage` is undefined on the
 *      server and full on the client, so the two first renders disagree by construction
 *      wherever that subtree is server-rendered.
 *
 * WHAT IS NOT SEEDED, AND WHY NOT. The Clara rail's own state: `lib/clara/threadStore.ts` is
 * memory-only and says so at :100 ("no localStorage, no reload recovery promised"), and
 * `railOpen` initialises to `true` at :105 on the server and the client alike — there is no
 * persisted rail state in this product to carry into a first render. AND the journal draft
 * (`sessionStorage`, lib/work/journal-draft.ts) — a fix-round review found this cell seeding
 * it anyway: `readJournalDraft` is called from exactly one place, `journal-composer.tsx:168`,
 * which this route (`WorkDetailView`, components/work/work-detail.tsx) never mounts — so the
 * seed reached storage and reached nothing else. Its own walk is the composer's hydration
 * cell above, which mounts the component that actually reads it.
 */
const RETURNING_BROWSER = {
  /** `workAnswerDraftKey({userId, firmId, clientId, questionId, version})` — all five
   *  segments, in that order, joined with "." after the `clara.wq.draft` prefix. */
  answerDraftKey:
    `clara.wq.draft.11111111-1111-1111-1111-111111111111.33333333-3333-4333-8333-333333333333.` +
    `${CLIENT}.${JOURNAL_WORK.parkedCardQuestionId}.1`,
  /** A HALF-ANSWERED question: the date filled, the amount still missing. A complete draft
   *  would be a less interesting first render (the form would offer review, not editing). */
  answerDraft: { posting_date: "2026-09-30" },
} as const;

test("#727: the Work detail route hydrates clean for a browser carrying a PRIOR VISIT's state", async ({ page, baseURL }) => {
  const collector = watchReactFaults(page);

  // THE COOKIE FIRST, because it is the one the server reads. `addCookies` on the context
  // rather than `document.cookie` in the page: the value has to be on the REQUEST that
  // produces the server render, not written after it came back.
  await page.context().addCookies([
    { name: "sidebar_state", value: "false", url: baseURL ?? "https://127.0.0.1:3100" },
  ]);
  // The motion seed's OTHER half — see the doc block's item 2. Without this, the fixture's
  // generic "nothing saved yet" `get_my_preferences` answer (serve-built.mjs) overwrites the
  // cache-seeded "reduced" hint the instant `MotionPreferenceSync`'s own fetch resolves,
  // exactly as that component's header documents ("its answer always wins"). Registered
  // before `page.goto` so it is in place for the very first navigation, the same
  // last-registered-wins ordering personal-settings-walk.spec.ts's `installStatefulPreferences`
  // relies on.
  await page.route("**/e2e-supabase/rest/v1/rpc/get_my_preferences", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ version: 1, interface: { motion: "reduced" }, notifications: {}, updated_at: "2026-09-10T00:00:00.000Z" }),
    }),
  );
  // `addInitScript` runs in a fresh document BEFORE any of the page's own script, so the
  // values are already in storage when React's first client render reads them — which is
  // exactly the ordering a returning browser has and a fresh context never does.
  await page.addInitScript(
    (seed: { motionKey: string; answerDraftKey: string; answerDraft: unknown }) => {
      try {
        window.localStorage.setItem(seed.motionKey, "reduced");
        window.localStorage.setItem(seed.answerDraftKey, JSON.stringify(seed.answerDraft));
      } catch {
        /* a context with storage blocked would fail the assertions below, loudly */
      }
    },
    {
      motionKey: MOTION_LOCAL_STORAGE_KEY,
      answerDraftKey: RETURNING_BROWSER.answerDraftKey,
      answerDraft: RETURNING_BROWSER.answerDraft,
    },
  );

  try {
    await control(page, { op: "park_card" });
    await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.parkedCardWorkId}`);

    const workbench = page.locator("[data-firm-workbench]");
    await expect(workbench.getByText("Waiting for an answer").first()).toBeVisible({ timeout: 15_000 });
    // THE SEED REACHED THE RENDER — the vacuity control for this whole cell, and the reason
    // it asserts a VALUE rather than merely that the page loaded. An `addInitScript` that
    // silently threw, a key whose five segments drifted from `workAnswerDraftKey`, or a
    // form that stopped reading its draft would each leave this cell walking the same empty
    // browser the cell above already walks, and it would still be green.
    await expect(workbench.getByLabel("Posting date").first())
      .toHaveValue(RETURNING_BROWSER.answerDraft.posting_date);
    // The MOTION seed reached the render too — `MOTION_DATA_ATTRIBUTE` on the shell
    // (personal-settings-walk.spec.ts:173's own instrument), stable here because the
    // `page.route` above keeps the async authority agreeing with the cache-seeded hint —
    // see this file's motion-preference-sync.tsx citation for why an unmocked RPC would
    // make this assertion true for one frame and false by the time anything reads it.
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    // And the SERVER'S half of the seed: the collapsed-sidebar cookie is in the jar for
    // this origin, so it rode the request that produced the server render.
    const jarred = (await page.context().cookies(baseURL ?? "https://127.0.0.1:3100"))
      .filter((c) => c.name === "sidebar_state")
      .map((c) => c.value);
    expect(jarred, "the collapsed-sidebar cookie must be on the request that produced this render").toEqual(["false"]);
    // …AND THE SHELL HONOURS IT NOW (#733). This cell used to record the OPPOSITE,
    // with a long note: `app/(firm)/layout.tsx` imported `SIDEBAR_COOKIE_NAME`
    // from `components/ui/sidebar.tsx`, which opens with `"use client"`. A Server
    // Component may import a CLIENT COMPONENT from such a module and render it
    // (`SidebarProvider`/`SidebarInset`, on the same import line, work exactly
    // that way), but a plain string constant carries no client reference, so the
    // server-side import never produced the cookie's name and
    // `cookies().get(...)` found nothing whatever the request carried — measured
    // by sending the raw SSR request with `sidebar_state=false` and again with
    // `=true` and getting byte-identical `data-state="expanded"` back. #733 moved
    // both constants to `lib/navigation/sidebar-cookie.ts`, a plain module with no
    // client boundary for the value to fail to cross, and the client module
    // re-exports them so nothing else had to move.
    //
    // THE RAW SSR REQUEST IS THE DISCRIMINATING HALF, and it is why this cell no
    // longer stops at the rendered DOM. `data-state` on the hydrated page would
    // also read "collapsed" if the SERVER still rendered it open and the client
    // corrected it one frame later — which is precisely the open-then-snap the
    // server-side read exists to prevent. So the HTML is fetched through the
    // context's own request API (same cookie jar, same session, no browser
    // render) and asserted before any script has run.
    const ssr = await page.context().request.get(`/clients/${CLIENT}/work/${JOURNAL_WORK.parkedCardWorkId}`);
    expect(ssr.status(), "the raw SSR request must be served, not redirected to a login").toBe(200);
    const html = await ssr.text();
    const sidebarTag = /<[^>]*data-slot="sidebar"[^>]*>/.exec(html);
    expect(sidebarTag, "the server rendered no [data-slot=sidebar] at all").not.toBeNull();
    expect(
      sidebarTag![0],
      "SSR with sidebar_state=false must render the sidebar collapsed — the cookie is the server's to read",
    ).toContain('data-state="collapsed"');
    // …and the hydrated page agrees, which is the half that proves no snap-shut.
    await expect(page.locator("[data-slot=sidebar]").first()).toHaveAttribute("data-state", "collapsed");
    await settleForScan(page);

    // The COMPLETED face too, under the same carried state: a different subtree of this
    // route (facts, basis table, posted entry) inside the same hydration pass.
    await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.seededWorkId}`);
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
    await settleForScan(page);

    expect(
      collector.faults(),
      "a browser carrying a prior visit's cookie, motion preference and drafts must still hydrate this route clean",
    ).toEqual([]);
    await page.evaluate(() => console.error("e2e-727-seeded-collector-probe"));
    expect(collector.seen(), "the console collector must actually be receiving errors").toContain("e2e-727-seeded-collector-probe");
  } finally {
    await control(page, { op: "reset" }).catch(() => {});
  }
});

/**
 * #732 — THE SHELL HYDRATES CLEAN AT A NARROW VIEWPORT, NOT ONLY AT THE DEFAULT ONE.
 *
 * WHY THE TWO CELLS ABOVE WERE NOT ENOUGH, and the reading that makes this one
 * necessary. Both of them run at Playwright's `Desktop Chrome` default viewport
 * (1280×720), which is ABOVE every breakpoint this shell has: the sidebar is
 * docked (`md`, 768) and the Clara rail is docked (`lg`, 1024). They therefore
 * proved the hydration of ONE arm of a shell that has two, and the owner's
 * 2026-09-13 reproduction on `clara-web` 742b09e9 is what named the other: the
 * same route logged `Minified React error #418` on every load at 800 px and at
 * 375 px and none at all at 1280 px. The width decides it, and the width these
 * cells never varied.
 *
 * BOTH WIDTHS, IN ONE CELL, AND THE WIDE ONE IS THE CONTROL. A narrow-only cell
 * would go green just as happily if the whole shell stopped rendering; the wide
 * pass is what keeps "no #418 at 375" from being a claim about a page that
 * renders nothing.
 *
 * THE VIEWPORT IS SET BEFORE THE `goto`, which is the entire point: a hydration
 * mismatch is a property of the FIRST client render, so a resize afterwards
 * measures a tree React has already reconciled and can never reproduce it.
 */
const HYDRATION_WIDTHS = [
  { label: "375 px — the width the owner reproduced #418 at", size: { width: 375, height: 812 } },
  { label: "1280 px — the docked arm, the control", size: { width: 1280, height: 900 } },
] as const;

test("#732: the Work detail route hydrates clean at 375 px as well as at 1280 px", async ({ page }) => {
  const collector = watchReactFaults(page);
  try {
    await control(page, { op: "park_card" });
    for (const width of HYDRATION_WIDTHS) {
      await page.setViewportSize(width.size);
      await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.seededWorkId}`);
      await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
      await settleForScan(page);
      // The parked face too — the subtree that reads a `localStorage` draft in a
      // lazy state initialiser, walked at BOTH widths for the same reason the
      // completed face is.
      await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.parkedCardWorkId}`);
      await expect(page.getByText("Waiting for an answer").first()).toBeVisible({ timeout: 15_000 });
      await settleForScan(page);

      // #732 AC3 — a clean hydration is not the only thing this shell owes the
      // narrow arm: it must still END where it did before the fix, i.e. the
      // docked/launcher split `components/ui/sidebar.tsx` and
      // `components/clara/rail-launcher.tsx` already drew must not have moved
      // under #732's construction change (both arms now render together; CSS,
      // not an early return, decides which is seen — sidebar.tsx:312-343).
      const dockedSidebar = page.locator('[data-slot="sidebar"]');
      const railLauncher = page.locator("[data-clara-rail-launcher]");
      // ONE docked container at every width — #732's whole point is that this
      // element is never conditionally absent; only its own `hidden md:block`
      // class decides whether it paints.
      await expect(dockedSidebar).toHaveCount(1);
      // The Sheet arm (`SheetContent`, `data-slot="sheet-content"`) renders
      // nothing while closed (sidebar.tsx:337) — asserting its absence is what
      // rules out "the mobile drawer opened itself", not just "some sidebar
      // exists".
      await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
      if (width.size.width === 375) {
        // Below `md` (768): the docked column is in the DOM but `display: none`.
        await expect(dockedSidebar.first()).toBeHidden();
        // Below `lg` (1024, `rail-chrome.tsx`'s `NARROW_QUERY`): the rail's own
        // mount-time effect closes it, so the launcher — the narrow shell's
        // entry point back into Clara — is what a person actually sees.
        await expect(railLauncher).toBeVisible();
      } else {
        // At 1280 the docked column is the visible arm and the rail defaults
        // open on a fresh load, so there is no launcher to find.
        await expect(dockedSidebar.first()).toBeVisible();
        await expect(railLauncher).toHaveCount(0);
      }

      expect(
        collector.faults(),
        `${width.label}: the shell and the Work detail route must hydrate with no React fault`,
      ).toEqual([]);
    }
    await page.evaluate(() => console.error("e2e-732-collector-probe"));
    expect(collector.seen(), "the console collector must actually be receiving errors").toContain("e2e-732-collector-probe");
  } finally {
    await control(page, { op: "reset" }).catch(() => {});
  }
});
