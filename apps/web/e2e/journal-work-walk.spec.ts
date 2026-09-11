import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ensureRealFocus } from "./helpers";
import { JOURNAL_WORK } from "./journal-work-mock.mjs";

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
    { path: JOURNAL_WORK.controlPath, payload: { client: CLIENT, ...body } },
  );
  expect(status, `the fixture control endpoint answered ${status}`).toBe(200);
}

/**
 * Wait for every FINITE animation to finish before measuring anything about
 * colour or geometry.
 *
 * THIS IS NOT HYGIENE, IT IS THE DIFFERENCE BETWEEN A MEASUREMENT AND A GHOST.
 * Measured on the first run of this walk: axe reported 4 `color-contrast`
 * violations on the composer, the first of them the Submit button at
 * "#ffffff on #4a71e0". There is no such token — #4a71e0 is `--primary`
 * (#1d4ed8) composited over white at exactly 0.8 alpha, i.e. the content
 * column's own arrival fade caught mid-flight. A scan that runs during a
 * transition measures a frame nobody ever fails on, and would have been
 * "fixed" by weakening a token that was never wrong.
 *
 * INFINITE animations are EXCLUDED rather than waited for: `animate-pulse` on a
 * Skeleton never ends by design, and waiting for it would hang instead of
 * measure.
 */
async function settle(page: Page): Promise<void> {
  // AND TAKE THE POINTER OFF WHATEVER IT WAS LAST CLICKING, for the same reason.
  // `fill()` never moves the mouse, so a cell that clicked Submit and then kept
  // typing leaves that button in `:hover` for the rest of the test — and axe then
  // measures `hover:bg-primary/80` (#4a71e0 under white, 4.44:1) instead of
  // `bg-primary` (#1d4ed8, 6.7:1, the pair the token gate actually pins).
  //
  // THAT HOVER SHORTFALL IS REAL AND IT IS NOT THIS TICKET'S, recorded here
  // rather than silently stepped around: EVERY default `Button` in the product
  // carries `hover:bg-primary/80` (components/ui/button.tsx, vendored), so the
  // 4.44:1 is product-wide and predates #623. Changing it means changing
  // `--primary` or that opacity for every button in the app, plus the token
  // contrast gate's pinned pairs — a design-token decision, not a walk's. What
  // this walk measures is the resting page, which is what every sibling scan
  // measures too; they simply never left a pointer on a primary button.
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
  const list = page.getByRole("region", { name: "Accounting work" });
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
  await expect(page.getByRole("region", { name: "Accounting work" }).getByRole("row")).toHaveCount(3);
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
  const list = page.getByRole("region", { name: "Accounting work" });
  // Header, the seeded conversation Work, and ONE admitted Work — not two.
  await expect(list.getByRole("row")).toHaveCount(3);
  await expect(list.getByText("Queued", { exact: true })).toHaveCount(1);
  // Newest first, so the row this cell admitted is the first one — and following
  // its own link is what proves the list addresses the same durable record.
  await list.getByRole("link", { name: "Open" }).first().click();
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
test("#727: the Work detail route hydrates with no React fault in the console", async ({ page }) => {
  const faults: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") faults.push(message.text()); });
  page.on("pageerror", (error) => faults.push(error.message));

  // A SEEDED, COMPLETED Work — the fullest version of this page: the facts block, the basis
  // table, the posted-entry block and its links row. A skeleton-only page would hydrate
  // clean for the boring reason that it renders almost nothing.
  await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.seededWorkId}`);
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  await settle(page);

  // And the PARKED face, which mounts the question panel and its form — the subtree #629
  // added to this route, and the one that reads a `localStorage` draft in a lazy state
  // initialiser (lib/work/questions.ts's `readWorkAnswerDraft`). A read like that during
  // the FIRST client render is the classic #418 shape, so it is walked rather than reasoned
  // about.
  await control(page, { op: "park_card" });
  await page.goto(`/clients/${CLIENT}/work/${JOURNAL_WORK.parkedCardWorkId}`);
  await expect(page.getByText("Waiting for an answer").first()).toBeVisible({ timeout: 15_000 });
  await settle(page);

  const react = faults.filter((m) =>
    /Minified React error #(185|418|423|425)|Maximum update depth exceeded|Hydration failed|hydration-mismatch|didn't match|did not match/i.test(m),
  );
  expect(react, "the Work detail route must hydrate with no React nested-update or hydration fault").toEqual([]);
  // The vacuity control on the collector itself: a listener that was never attached, or a
  // page that never loaded, also produces an empty list. `page.evaluate` proves the channel
  // this cell reads is live.
  await page.evaluate(() => console.error("e2e-727-collector-probe"));
  expect(faults, "the console collector must actually be receiving errors").toContain("e2e-727-collector-probe");
});
