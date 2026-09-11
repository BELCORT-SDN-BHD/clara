import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ensureRealFocus } from "./helpers";
import { JOURNAL_WORK } from "./journal-work-mock.mjs";

/**
 * #634 · THE BROWSER LEG for optional and LATE evidence on the expert journal
 * path — journey C3's composer, and the B3 Work detail's late attachment.
 *
 * WHY THESE CLAIMS NEED A BROWSER. Each one is a property the unit harness
 * structurally cannot hold: a real `sessionStorage` that carries the chosen
 * document across a reload, a real focus manager (the evidence control taking
 * focus when the server names it, and focus RETURNING to the trigger when a
 * Dialog closes), a real address bar for the `?entry=` link a conflict offers,
 * real layout at 320 CSS px and 200 % zoom, and a real
 * `prefers-reduced-motion` query.
 *
 * WHAT IT DOES NOT PROVE, said plainly so a green here is not read as more than
 * it is. PostgREST and the runtime's `/api/work/*` legs are FIXTURES
 * (`journal-work-mock.mjs`). Nothing below establishes that
 * `clara.admit_journal_work` really refuses a document that already backs a
 * posted entry, that `clara.attach_entry_evidence` really writes no column of a
 * posted entry, or that `clara.list_entry_links` is firm-scoped. The database
 * lane's `journal-work-evidence.test.mjs` and the runtime lane's world e2e
 * (`work-journal-e2e.mjs` leg 8) own those; this lane owns what the browser does
 * with their answers.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT = JOURNAL_WORK.clientId;
const COMPOSER_URL = `/clients/${CLIENT}/accounting/journal/new`;
const WORK_LIST_URL = `/clients/${CLIENT}/work`;

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

/** Drive the fixture's Work state machine through the app's OWN proxy — the
 *  same instrument `journal-work-walk.spec.ts` uses, and for the same reason:
 *  it carries the real session through the real firm-scope guard. */
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

/** Wait for every FINITE animation before measuring colour or geometry — see
 *  `journal-work-walk.spec.ts`'s own note for why this is a measurement rule
 *  rather than hygiene. Infinite animations (a Skeleton's pulse) are excluded. */
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

/** The one balanced basis this walk composes — RM 1,200 office rent paid from
 *  Maybank, the same worked example every other #623/#634 leg uses. */
async function fillBalancedBasis(page: Page): Promise<void> {
  await page.getByLabel("Posting date").fill("2026-09-01");
  await page.getByLabel("Memo").fill("Office rent paid from Maybank");
  await page.getByLabel("Account, line 1").selectOption(JOURNAL_WORK.rentAccount);
  await page.getByLabel("Debit, line 1").fill("1200.00");
  await page.getByLabel("Account, line 2").selectOption(JOURNAL_WORK.bankAccount);
  await page.getByLabel("Credit, line 2").fill("1200.00");
}

function workIdIn(url: string): string {
  const found = /\/work\/([0-9a-f-]{36})(?:$|[?#])/i.exec(url);
  expect(found, `no work id in ${url}`).toBeTruthy();
  return found![1]!;
}

const evidence = (page: Page) => page.locator("#journal-basis-evidence");

/** One Work composed with NO document and run through to a posted entry — the
 *  state the late door exists for. Returns the Work id. */
async function postedDocumentlessWork(page: Page): Promise<string> {
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const workId = workIdIn(page.url());
  await control(page, { op: "run", workId });
  await control(page, { op: "complete", workId });
  await page.reload();
  return workId;
}

test.beforeEach(async ({ page }) => {
  await signInTo(page, WORK_LIST_URL);
  await control(page, { op: "reset" });
});

test("C3: evidence is OPTIONAL, and the chosen document survives a reload under the same intent", async ({ page }) => {
  await page.goto(COMPOSER_URL);

  // IT OPENS ON "No document", IN WORDS. The raw balanced JV is the expert path
  // and an entry may be recorded with no source at all — a chooser whose empty
  // state were merely blank would leave that a guess.
  await expect(page.getByText("A journal entry may be recorded with no document at all", { exact: false })).toBeVisible();
  await expect(evidence(page)).toHaveValue("");
  await expect(evidence(page).getByRole("option", { name: "No document" })).toHaveCount(1);

  await fillBalancedBasis(page);
  await evidence(page).selectOption(JOURNAL_WORK.freeDocumentId);
  await expect(evidence(page)).toHaveValue(JOURNAL_WORK.freeDocumentId);

  await scan(page, "journal composer with evidence chosen");

  // THE DRAFT CARRIES THE EVIDENCE, and a real reload is the only way to prove
  // it: `sessionStorage` is written on every edit and restored in a lazy state
  // initialiser, i.e. before the first paint.
  await page.reload();
  await expect(evidence(page)).toHaveValue(JOURNAL_WORK.freeDocumentId);
  await expect(page.getByLabel("Memo")).toHaveValue("Office rent paid from Maybank");

  // ── submit → the durable Work, which carries the document it cited ─────────
  await page.getByRole("button", { name: "Submit" }).click();
  // A GENEROUS wait, not the 5-second default: this assertion is about WHERE the
  // submit lands, and the round trip goes through the app's own proxy to the
  // runtime and back. Measured on a loaded host, where the default timed out on a
  // navigation that then happened.
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const workId = workIdIn(page.url());
  await control(page, { op: "run", workId });
  await control(page, { op: "complete", workId });
  await page.reload();

  // THE POSTED ENTRY'S SOURCE IS READ BACK FROM THE DATABASE, not from what was
  // submitted — the same read that would show a LATE attachment.
  await expect(page.getByRole("heading", { level: 2, name: "What was recorded" })).toBeVisible();
  await expect(page.getByText(JOURNAL_WORK.freeDocumentId, { exact: false })).toBeVisible();
  // …and the late door is NOT offered on an entry that already has a source.
  await expect(page.getByRole("button", { name: "Attach evidence" })).toHaveCount(0);
});

test("C3: a document that already backs a posted entry is a persistent Alert with a link, and no second submit", async ({ page }) => {
  // #728 finding 5, review round — THE USER-REACHABLE ROUTE TO THE DOOR'S OWN REFUSAL. The picker
  // now disables a document that already backs a posted entry, so ordinary interaction cannot
  // reach this refusal WHILE the advisory read is answering. It can when that read is
  // UNAVAILABLE — a real production state (`clara.list_spoken_for_documents` is advisory; the door
  // is the law), and the one the composer reports as "we could not check". Armed here, the option
  // is selectable again and the person meets the typed conflict on submit, exactly as they did
  // before this ticket. No DOM injection: every step below is one a person can perform.
  await control(page, { op: "break_spoken_for" });
  await page.goto(COMPOSER_URL);
  await expect(page.getByText("could not check which documents already back a posted entry", { exact: false })).toBeVisible();
  await fillBalancedBasis(page);
  await evidence(page).selectOption(JOURNAL_WORK.takenDocumentId);
  await page.getByRole("button", { name: "Submit" }).click();

  // A REFUSAL, NOT A TOAST: an inline Alert naming the concrete constraint.
  await expect(page.getByText("That document already backs a posted entry")).toBeVisible();
  // THE INPUT IS PRESERVED and the offending control takes focus, so the next
  // act is one keystroke away rather than a re-typed table of money.
  await expect(page.getByLabel("Memo")).toHaveValue("Office rent paid from Maybank");
  await expect(evidence(page)).toHaveValue(JOURNAL_WORK.takenDocumentId);
  await expect(evidence(page)).toBeFocused();
  // NO "start a new draft": rotating the intent key cannot free a document that
  // is already spoken for, and offering it would invite the second effect the
  // rule exists to prevent.
  await expect(page.getByRole("button", { name: "Start a new draft" })).toHaveCount(0);
  await scan(page, "journal composer, source conflict");

  // THE ONE FORWARD MOVE THE REFUSAL OFFERS goes somewhere real, and Back
  // returns the reader to the draft they were holding.
  const link = page.getByRole("link", { name: "Open that journal entry" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`entry=${JOURNAL_WORK.seededEntryId}`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${COMPOSER_URL}$`));
  await expect(page.getByLabel("Memo")).toHaveValue("Office rent paid from Maybank");

  // Choosing a DIFFERENT document retires the Alert — the form must not describe
  // a state that has passed.
  await evidence(page).selectOption(JOURNAL_WORK.freeDocumentId);
  await expect(page.getByText("That document already backs a posted entry")).toHaveCount(0);
  await page.getByRole("button", { name: "Submit" }).click();
  // A GENEROUS wait, not the 5-second default: this assertion is about WHERE the
  // submit lands, and the round trip goes through the app's own proxy to the
  // runtime and back. Measured on a loaded host, where the default timed out on a
  // navigation that then happened.
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/, { timeout: 20_000 });
});

test("C3: a refusal NAMING the evidence array lands on the evidence control, with the draft intact", async ({ page }) => {
  // The wire path is stated by the WALK and sent VERBATIM by the fixture, so a
  // mapper that mis-read `sourceRefs[N]` reds here instead of quietly focusing
  // another control. 1-BASED, because the database generates its own paths from
  // `with ordinality`.
  await page.goto(COMPOSER_URL);
  await control(page, { op: "refuse_basis", field: "sourceRefs[1]", reason: "invalid_source_ref" });
  await fillBalancedBasis(page);
  await evidence(page).selectOption(JOURNAL_WORK.freeDocumentId);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(evidence(page)).toBeFocused();
  await expect(page.getByText("That document is not an active filed document of this client", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Debit, line 1")).toHaveValue("1,200.00");
});

test("#728 finding 5: the composer's OWN evidence picker disables a document that already backs a posted entry, and it cannot be chosen", async ({ page }) => {
  await page.goto(COMPOSER_URL);
  await expect(evidence(page).locator(`option[value="${JOURNAL_WORK.takenDocumentId}"]`)).toBeDisabled();
  await expect(evidence(page).locator(`option[value="${JOURNAL_WORK.freeDocumentId}"]`)).toBeEnabled();
  // THE REASON RIDES THE OPTION'S OWN LABEL (bounded — one option, one label), and ONE summary
  // line sits beside the select. The per-document paragraph-and-link the first cut rendered for
  // every spoken-for document is gone: that list is the client's whole filing history.
  await expect(evidence(page).locator(`option[value="${JOURNAL_WORK.takenDocumentId}"]`))
    .toContainText("already backs a posted entry");
  await expect(page.getByText("already backs a posted journal entry and cannot be chosen", { exact: false })).toBeVisible();

  // AND IT CANNOT BE CHOSEN. Playwright's actionability is the browser's own: a `selectOption`
  // against a disabled option never succeeds, it times out waiting for it to become enabled. This
  // is the property the fix actually claims, asserted as a property rather than read off an
  // attribute — and it is why the door's own refusal needed the user-reachable route the C3
  // conflict cell now takes (the advisory read being unavailable).
  const selectError = await evidence(page)
    .selectOption(JOURNAL_WORK.takenDocumentId, { timeout: 2500 })
    .then(() => null, (error: unknown) => error);
  expect(selectError, "a disabled option cannot be chosen — the call must not succeed").not.toBeNull();
  await expect(evidence(page)).toHaveValue("");

  // AND THE PICKER DEGRADES HONESTLY when the advisory read does not answer: it says so, offers
  // every document again, and claims nothing about which are free — the summary line and the
  // disabled options both go, because "we could not check" must never be rendered as "we checked".
  // (The SELECTED document's own reason-and-link is the one paragraph that earns a link; it needs
  // the conflicted document to BE the selection, which only a restored draft produces, so it is
  // pinned in the RTL cells rather than here.)
  await control(page, { op: "break_spoken_for" });
  await page.reload();
  await expect(page.getByText("could not check which documents already back a posted entry", { exact: false })).toBeVisible();
  await expect(page.getByText("already backs a posted journal entry and cannot be chosen", { exact: false })).toHaveCount(0);
  await expect(evidence(page).locator(`option[value="${JOURNAL_WORK.takenDocumentId}"]`)).toBeEnabled();
  await expect(page.getByRole("link", { name: "View that journal entry" })).toHaveCount(0);
});

test("B3: LATE attachment on a posted documentless entry — happy, replay, and the two conflicts", async ({ page }) => {
  // A Work with NO document, run through to a posted entry: the state the late
  // door exists for.
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);
  await page.getByRole("button", { name: "Submit" }).click();
  // A GENEROUS wait, not the 5-second default: this assertion is about WHERE the
  // submit lands, and the round trip goes through the app's own proxy to the
  // runtime and back. Measured on a loaded host, where the default timed out on a
  // navigation that then happened.
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const workId = workIdIn(page.url());
  await control(page, { op: "run", workId });
  await control(page, { op: "complete", workId });
  await page.reload();

  // "No document" IS WRITTEN OUT rather than left as an empty slot: an entry
  // recorded without evidence is a legitimate state, not a gap in the record.
  await expect(page.getByRole("heading", { level: 2, name: "What was recorded" })).toBeVisible();
  await expect(page.getByText("No document", { exact: true }).first()).toBeVisible();

  const trigger = page.getByRole("button", { name: "Attach evidence" });
  await expect(trigger).toBeVisible();
  // A REAL window focus before anything about focus is asserted — a headless
  // page that is not the foreground one never moves `document.activeElement`.
  await ensureRealFocus(page);
  await trigger.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Attach evidence to this entry" })).toBeVisible();
  // INITIAL FOCUS IS THE ONE CONTROL — the dialog is a single choice, and the
  // shortest keyboard path to making it is landing on the chooser.
  await expect(dialog.locator("#attach-evidence-document")).toBeFocused();
  await scan(page, "attach-evidence dialog");

  // #728 finding 5 — the picker ALREADY knows `takenDocumentId` backs the seeded posted entry
  // (`clara.list_spoken_for_documents`, an advisory read the mock derives from the same
  // `state.links` `attach_entry_evidence` itself reads) and disables it BEFORE any submit —
  // never hidden: the reason rides the option's own label and ONE summary line sits beside the
  // select. AND IT CANNOT BE CHOSEN: Playwright's actionability is the browser's own, so a
  // `selectOption` on a disabled option never succeeds — which is the fix, stated as a property
  // rather than asserted from the attribute alone.
  await expect(dialog.locator(`option[value="${JOURNAL_WORK.takenDocumentId}"]`)).toBeDisabled();
  await expect(dialog.locator(`option[value="${JOURNAL_WORK.freeDocumentId}"]`)).toBeEnabled();
  await expect(dialog.getByText("already backs a posted journal entry and cannot be chosen", { exact: false })).toBeVisible();
  const dialogSelectError = await dialog
    .locator("#attach-evidence-document")
    .selectOption(JOURNAL_WORK.takenDocumentId, { timeout: 2500 })
    .then(() => null, (error: unknown) => error);
  expect(dialogSelectError, "a disabled option cannot be chosen — the call must not succeed").not.toBeNull();
  await expect(dialog.locator("#attach-evidence-document")).toHaveValue("");

  // THE CONFLICT ARM, reached the way a person reaches it: with the advisory read UNAVAILABLE.
  // The dialog re-reads it every time it opens, so closing and re-opening is all this takes —
  // and it proves both halves at once (the picker degrades honestly, the door still refuses).
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await control(page, { op: "break_spoken_for" });
  await page.getByRole("button", { name: "Attach evidence" }).click();
  await expect(dialog.getByText("could not check which documents already back a posted entry", { exact: false })).toBeVisible();
  await expect(dialog.locator(`option[value="${JOURNAL_WORK.takenDocumentId}"]`)).toBeEnabled();
  await dialog.locator("#attach-evidence-document").selectOption(JOURNAL_WORK.takenDocumentId);
  await dialog.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(dialog.getByText("already backs another posted entry", { exact: false })).toBeVisible();
  await expect(dialog.locator("#attach-evidence-document")).toHaveValue(JOURNAL_WORK.takenDocumentId);
  await expect(dialog.getByRole("link", { name: "Open that journal entry" })).toBeVisible();

  // …then the happy path, in the same open dialog.
  await dialog.locator("#attach-evidence-document").selectOption(JOURNAL_WORK.freeDocumentId);
  await expect(dialog.getByText("already backs another posted entry", { exact: false })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(JOURNAL_WORK.freeDocumentId, { exact: false })).toBeVisible();
  // #728 finding 3 — the dialog and its trigger are BOTH gone (the entry now carries a source),
  // so focus must land somewhere real rather than falling to <body>: the "What was recorded"
  // section heading, the landmark #629's own pattern established.
  await expect(page.getByRole("heading", { level: 2, name: "What was recorded" })).toBeFocused();

  // THE ENTRY NOW CARRIES ITS SOURCE, read back from the database — and the door
  // is gone, because there is nothing left for it to do.
  await page.reload();
  await expect(page.getByText(JOURNAL_WORK.freeDocumentId, { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Attach evidence" })).toHaveCount(0);
});

test("B3: the late door refuses a STALE view of the entry and says so inline, keeping the choice", async ({ page }) => {
  await page.goto(COMPOSER_URL);
  await fillBalancedBasis(page);
  await page.getByRole("button", { name: "Submit" }).click();
  // A GENEROUS wait, not the 5-second default: this assertion is about WHERE the
  // submit lands, and the round trip goes through the app's own proxy to the
  // runtime and back. Measured on a loaded host, where the default timed out on a
  // navigation that then happened.
  await expect(page).toHaveURL(/\/work\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const workId = workIdIn(page.url());
  await control(page, { op: "run", workId });
  await control(page, { op: "complete", workId });
  await page.reload();
  const entryId = await page.evaluate(async (id: string) => {
    const res = await fetch(`/api/runtime/work/${id}`);
    const body = (await res.json()) as { work?: { result?: { entry_id?: string } } };
    return body.work?.result?.entry_id ?? "";
  }, workId);
  expect(entryId, "the completed Work names its posted entry").not.toBe("");

  await page.getByRole("button", { name: "Attach evidence" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#attach-evidence-document").selectOption(JOURNAL_WORK.freeDocumentId);
  // THE RACE, made real: the entry moves AFTER this page read its revision and
  // BEFORE the door is called. Nothing here forges a request — the client sends
  // exactly what it read.
  await control(page, { op: "bump_revision", entryId });
  await dialog.getByRole("button", { name: "Attach", exact: true }).click();

  await expect(dialog.getByText("changed since you opened it", { exact: false })).toBeVisible();
  // THE DIALOG STAYS OPEN AND THE CHOICE SURVIVES: the fix is a fresh read, not
  // finding the file again.
  await expect(dialog.locator("#attach-evidence-document")).toHaveValue(JOURNAL_WORK.freeDocumentId);
  // …and nothing was recorded.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("No document", { exact: true }).first()).toBeVisible();
});

// THE `t634` PREFIX IS NOT A TYPO. A string literal containing `#634` is a valid
// three-digit CSS hex colour, and this app's `no-restricted-syntax` raw-colour
// rule (owner ruling Q4) reds every one of them. Ticket ids stay in COMMENTS,
// where the rule does not look; test NAMES carry the bare number.


test("t634 renders at 320 px, at 200 % zoom, by keyboard, and with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto(COMPOSER_URL);

  // NARROW: no horizontal scroll of the page itself. A table of money may scroll
  // inside its own container; the page may not.
  await settle(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "the composer must not scroll horizontally at 320 px").toBeLessThanOrEqual(1);
  await expect(evidence(page)).toBeVisible();
  await scan(page, "journal composer at 320 px, reduced motion");

  // REDUCED MOTION IS HONOURED: nothing on the resting page is still animating.
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  expect(running, "reduced motion must leave no running animation on the resting composer").toBe(0);

  // 200 % ZOOM, which the product models as a halved CSS viewport.
  await page.setViewportSize({ width: 640, height: 512 });
  await page.goto(COMPOSER_URL);
  await settle(page);
  await expect(evidence(page)).toBeVisible();
  const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(zoomOverflow, "the composer must not scroll horizontally at 200 % zoom").toBeLessThanOrEqual(1);

  // KEYBOARD: the evidence control is reachable and operable without a pointer.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(COMPOSER_URL);
  await ensureRealFocus(page);
  await evidence(page).focus();
  await expect(evidence(page)).toBeFocused();
  await evidence(page).selectOption(JOURNAL_WORK.freeDocumentId);
  await expect(evidence(page)).toHaveValue(JOURNAL_WORK.freeDocumentId);
});

test("B3: ESCAPE closes the attach dialog and RETURNS focus to the trigger", async ({ page }) => {
  // §4's dialog law, and the half only a real browser can hold: `Escape`, and
  // focus RETURNING to the control the dialog was opened from. An earlier cut of
  // this walk carried a comment claiming the return and asserted only that a
  // document was on screen — the comment was doing the work the cell was not.
  await postedDocumentlessWork(page);

  const trigger = page.getByRole("button", { name: "Attach evidence" });
  await expect(trigger).toBeVisible();
  await ensureRealFocus(page);
  await trigger.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#attach-evidence-document")).toBeFocused();
  // A CHOICE MADE, THEN ABANDONED: Escape must not be a way to half-commit it.
  await dialog.locator("#attach-evidence-document").selectOption(JOURNAL_WORK.freeDocumentId);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // NOTHING WAS ATTACHED — the entry still says so, and the door is still there.
  await expect(page.getByText("No document", { exact: true }).first()).toBeVisible();
  await expect(trigger).toBeVisible();

  // …and the CHOICE SURVIVES a re-open, so abandoning a dialog is not the same
  // as losing the one piece of state the human just produced.
  await trigger.click();
  await expect(page.getByRole("dialog").locator("#attach-evidence-document"))
    .toHaveValue(JOURNAL_WORK.freeDocumentId);
});

test("t634: an UNVERIFIED filed document is offered by NEITHER chooser", async ({ page }) => {
  // Cross-model review, confirmed against migration 0182:
  // `clara._journal_document_filed` requires `bytes_verified_at is not null`, so
  // an unverified upload can only ever come back `not_filed`. A chooser that
  // offers it is a form inviting a refusal it could have predicted.
  await page.goto(COMPOSER_URL);
  await expect(evidence(page)).toBeVisible();
  await expect(evidence(page).locator("option", { hasText: JOURNAL_WORK.freeDocumentName })).toHaveCount(1);
  await expect(evidence(page).locator("option", { hasText: JOURNAL_WORK.unverifiedDocumentName })).toHaveCount(0);

  // The LATE door's chooser is the same list, and must agree.
  await postedDocumentlessWork(page);
  await ensureRealFocus(page);
  await page.getByRole("button", { name: "Attach evidence" }).click();
  const chooser = page.getByRole("dialog").locator("#attach-evidence-document");
  await expect(chooser.locator("option", { hasText: JOURNAL_WORK.freeDocumentName })).toHaveCount(1);
  await expect(chooser.locator("option", { hasText: JOURNAL_WORK.unverifiedDocumentName })).toHaveCount(0);
});
