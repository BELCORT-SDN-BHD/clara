import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ACTIVITY } from "./activity-mock.mjs";
import { settleForScan, signInTo } from "./helpers";

// #804 — this file's own sign-in never checked `navigation[name=Main]` (several of its cells sign
// in at a NARROW viewport, where the sidebar is a closed Sheet and that landmark is not visible by
// design), so it composes the shared `signInTo` at "/" rather than the shared `signIn`, which does
// check it.
const signIn = (page: Page) => signInTo(page, "/");

/**
 * #632 (refresh spec #612, journey B5) — the attributable Activity feed's real content:
 * `/activity` used to lead with a `NotBuiltNote` over a flat, unpaginated receipts-only list
 * (CB-AE2E-018); this proves the rebuilt page — filters written to the URL, keyset pagination
 * with a dedupe-aware "Load more", the event detail Sheet's focus/Escape/Back contract, a
 * correction's two-sided link, live permission loss clearing the list, and the no-oracle denied
 * detail state — end to end in a real browser.
 *
 * WHAT IT DOES NOT PROVE. `clara.list_activity`/`get_activity_event` themselves are fixtures
 * (`activity-mock.mjs`), including the CLR04/CLR11 refusals this walk needs. So nothing below
 * establishes that the real door unions its three sources correctly, floors at bookkeeper, or
 * pages a real keyset tie the way it claims to — `packages/db/tests/activity-feed.test.mjs`
 * owns that half. This proves what the browser does with the DOOR'S answers.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];


const documentRowButton = (page: Page) =>
  page.getByRole("button", { name: "A document was actively filed to a client." });

test("initial read: representative rows carry actor, client, the DB's own sentence, time, status and a truncated-page note", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");

  await expect(page.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible();
  // #733's sweep — THE SERVER-RENDERED `<h1>` CARRIES THE LITERAL ID, which only a browser can
  // say: the page is a Server Component and the id used to be imported across a `"use client"`
  // boundary, where the RSC bundler hands the server a client reference rather than the string
  // (`lib/navigation/heading-ids.ts`). The feed focuses this id by `getElementById` after a filter
  // change, so a wrong or absent id is a silently dead focus move, not a visible fault.
  await expect(page.locator("h1#activity-feed-heading")).toBeVisible();
  await expect(documentRowButton(page)).toBeVisible();
  await expect(page.getByText("A fiscal period close was begun.")).toBeVisible();
  await expect(page.getByText("Recorded a journal entry")).toBeVisible();

  // Attribution present on every row (C77.3) — the shared subject resolves to its real
  // display name through the firm_members_visible roster (serve-built.mjs's generic fixture),
  // so it is never a blank cell.
  await expect(page.getByText("E2E Owner").first()).toBeVisible();

  // The client name resolves through the register read, not a raw id.
  await expect(page.getByText(ACTIVITY.clientName).first()).toBeVisible();

  // The page fixture is deliberately truncated. Review finding 12 renamed this copy — the old
  // "may not show every matching event yet" fired on every non-final page and read as a false
  // claim that SOME matching event might be missing, when `truncated` only ever means "there is
  // more to load".
  await expect(page.getByText(/There is more to load below/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
});

test("kind filter chips narrow the list and write ?kinds= to the URL", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  await expect(documentRowButton(page)).toBeVisible();

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(/[?&]kinds=close(&|$)/);
  await expect(page.getByText("A fiscal period close was begun.")).toBeVisible();
  await expect(documentRowButton(page)).toHaveCount(0);

  // Clearing filters restores the full page.
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/kinds=/);
  await expect(documentRowButton(page)).toBeVisible();
});

test("client filter narrows to the selected client via the URL", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  await page.getByLabel("Client").selectOption(ACTIVITY.clientId).catch(async () => {
    // Base UI Select is not a native <select>; open it and choose the option by name instead.
    await page.getByLabel("Client").click();
    await page.getByRole("option", { name: ACTIVITY.clientName }).click();
  });
  await expect(page).toHaveURL(new RegExp(`[?&]client=${ACTIVITY.clientId}(&|$)`));
});

test("load more appends the next page and dedupes a repeated row, saying so", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  await expect(documentRowButton(page)).toBeVisible();

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("Vendor-neutral document extraction completed.")).toBeVisible();
  // The duplicated document row is dropped, not shown twice.
  await expect(documentRowButton(page)).toHaveCount(1);
  await expect(page.getByText(/event you already saw was skipped/)).toBeVisible();
});

test("a correction links both ways: the original names its replacement and vice versa", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  await expect(page.getByText("A posted entry was reversed.")).toBeVisible();
  await expect(page.getByText("An approved entry was recorded.")).toBeVisible();
  await expect(page.getByText("Links to the entry that replaced it.")).toBeVisible();
  await expect(page.getByText("Links to the original entry it replaced.")).toBeVisible();
});

test("opening a row's detail: Title, initial focus, Escape closes it and returns focus to the row", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  const trigger = documentRowButton(page);
  await trigger.click();

  await expect(page).toHaveURL(new RegExp(`[?&]event=event%3A${ACTIVITY.documentEventId}(&|$)`));
  const title = page.locator('[data-slot="sheet-title"]');
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
  await expect(page.getByText("What happened, who acted, and what it is linked to.")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/event=/);
  await expect(trigger).toBeFocused();
});

test("Back closes the detail Sheet and the list keeps its filters and position", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity?kinds=documents");
  await documentRowButton(page).click();
  await expect(page).toHaveURL(/event=/);

  await page.goBack();
  await expect(page).not.toHaveURL(/event=/);
  await expect(page).toHaveURL(/kinds=documents/);
  await expect(documentRowButton(page)).toBeVisible();
  // #728 finding 4 — the physical/history Back path (unlike the in-page Escape/Close, which
  // browser-walked correctly before this fix) never itself held DOM focus, so without the fix
  // the Next.js re-render that follows a pop leaves focus on <body>. The row that opened the
  // Sheet is the address that fix returns focus to.
  await expect(documentRowButton(page)).toBeFocused();
});

test("#728 finding 1: a kept sweep heartbeat reads 'Clara (system)' under kind Agent, and no row on the page is unattributed", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  await expect(page.getByText("An autodraft sweep run completed.")).toBeVisible();
  // C77.3: attribution present on every row — the system marker, not the honest-but-useless
  // em dash MemberName would otherwise render for the door's own null actor on this row.
  // `.first()` since #742: the sweep heartbeat is no longer the only system-attributed row on this
  // page — the four document-pipeline rows carry the same marker. The sweep row's OWN marker is
  // proven by the kind=agent filter below, which leaves only it on screen.
  await expect(page.getByText("Clara (system)").first()).toBeVisible();

  // The sweep row sorts under kind=Agent (never Documents — the 0181 fall-through 0183 retires
  // for this event_type). The kind chips are TOGGLES (multi-select, activity-filters.tsx's own
  // toggleKind), so "Agent" is deselected again before selecting "Documents" rather than the two
  // filters compounding into kinds=agent,documents.
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  await expect(page).toHaveURL(/[?&]kinds=agent(&|$)/);
  await expect(page.getByText("An autodraft sweep run completed.")).toBeVisible();
  // Narrowed to kind=agent, the sweep row is the only event row left — so this marker is ITS own.
  await expect(page.getByText("Clara (system)")).toBeVisible();
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(page).toHaveURL(/[?&]kinds=documents(&|$)/);
  await expect(page.getByText("An autodraft sweep run completed.")).toHaveCount(0);
});

test("a denied detail (a direct deep link to a refused id) shows a not-found state, never a crash", async ({ page }) => {
  await signIn(page);
  await page.goto(`/activity?event=event%3A${ACTIVITY.deniedEventId}`);
  await expect(page.locator('[data-slot="sheet-title"]')).toBeVisible();
  await expect(page.getByText(/activity event not found/i)).toBeVisible();

  // Closing a DEEP-LINKED sheet (never pushed) rewrites the URL rather than leaving the app.
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/event=/);
  await expect(page).toHaveURL(/\/activity$/);
});

test("live permission loss clears the list on a focus recheck and explains the access state", async ({ page }) => {
  await signIn(page);
  await page.goto(`/activity?client=${ACTIVITY.flipClientId}`);
  // A client filter is already active, so the honest empty copy is "no MATCHES", not "first use".
  await expect(page.getByText("No activity matches these filters.")).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Activity is not available")).toBeVisible();
  // Denied targets never leak stale accounting data: the (already-empty) list stays cleared,
  // and the filter bar's own client Select is still usable to change scope.
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("320px stays usable with no page-wide horizontal scroll, and is axe-clean", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await signIn(page);
  await page.goto("/activity");
  await expect(documentRowButton(page)).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, "no page-wide horizontal scroll at 320px").toBeLessThanOrEqual(clientWidth + 1);

  // #760 — the row `enter-content` fade settles before axe looks: mid-fade this scan read
  // the resting muted-foreground pair as #6a7373 on #f5f6f4 (4.49:1), a transition artefact.
  await settleForScan(page);
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/activity at 320px").toEqual([]);
});

test("200% zoom (a halved 1280x720 viewport) keeps the feed reachable with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await signIn(page);
  await page.goto("/activity");
  await expect(documentRowButton(page)).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, "no page-wide horizontal scroll at 200% zoom").toBeLessThanOrEqual(clientWidth + 1);
});

test("reduced motion: the event Sheet still opens and closes correctly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await page.goto("/activity");
  await documentRowButton(page).click();
  await expect(page.locator('[data-slot="sheet-title"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="sheet-content"]')).toHaveCount(0);
});

/**
 * #742 — C77.3 ON A WHOLE PAGE, not one row.
 *
 * The live feed's first 25 rows carried 7 unattributed cells, every one of them a document-pipeline
 * event whose machine writer passes no actor (`_append_event`'s fourth argument). The web rendered
 * those as "—". This sweeps EVERY row's actor cell on the first page and refuses the em dash
 * anywhere — the assertion the per-type unit cells (components/firm/activity/activity-row.test.tsx)
 * cannot make, because it is about the page, not the component.
 */
test("#742: every row on the first page carries an attribution — no actor cell is the unattributed em dash", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");
  await expect(documentRowButton(page)).toBeVisible();

  const actors = page.locator("[data-activity-actor]");
  const count = await actors.count();
  expect(count, "the fixture's first page should carry rows to check").toBeGreaterThan(0);
  // "the first 25 rows" is the first page; the fixture's page 1 is smaller than that cap, so this
  // walks all of it rather than pretending to a slice it does not have.
  expect(count, "the first page must not exceed the 25-row page this ticket measured").toBeLessThanOrEqual(25);

  for (let i = 0; i < count; i++) {
    const text = ((await actors.nth(i).textContent()) ?? "").trim();
    expect(text, `row ${i}'s actor cell is empty`).not.toBe("");
    expect(text, `row ${i} is unattributed (C77.3)`).not.toContain("\u2014");
  }

  // The four machine-written pipeline rows read as Clara, and the HUMAN-written row of the SAME
  // event type still reads its person — the discriminator is the null actor, and it holds on a page
  // that carries both.
  await expect(page.getByText("A filed document's text was extracted.")).toBeVisible();
  await expect(page.getByText("A document was classified.")).toBeVisible();
  await expect(page.getByText("Invoice facts were witnessed for a document.")).toBeVisible();
  await expect(page.getByText("An open question was raised about a document.")).toBeVisible();
  await expect(page.getByText("A person set the document kind.")).toBeVisible();
  expect(await page.getByText("Clara (system)").count(), "the four machine pipeline rows plus the sweep heartbeat").toBe(5);
});

// ---------------------------------------------------------------------------
// #719 — THE OBJECT LINKS NAME THE ITEM, not just the tab.
//
// This walk's own assertions used to stop at the TAB, because that was the honest destination:
// neither the Journals workbench nor the Documents page read a per-item parameter. Journals reads
// `?entry=` (#634) and Documents reads `?document=` (#719's Documents half), so the tightening
// below is the whole point of the ticket — a link that lands on a list of a hundred documents has
// not taken the reader to the one the row is about.
// ---------------------------------------------------------------------------

test("#719: a document row's object link lands on the DOCUMENT, not merely the Documents tab", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");

  const row = page.locator("li").filter({ has: documentRowButton(page) }).first();
  const link = row.getByRole("link", { name: "View in books" });
  // THE HREF IS THE ASSERTION, read before the click: the destination page's own fixtures are
  // another lane's business, and this walk owns the address, not what the Documents tab does with
  // it (documents-viewer-walk.spec.ts owns that half, `?document=` and all).
  await expect(link).toHaveAttribute(
    "href",
    `/clients/${ACTIVITY.clientId}/documents?document=${ACTIVITY.documentId}`,
  );

  await link.click();
  await expect(page).toHaveURL(new RegExp(`/clients/${ACTIVITY.clientId}/documents\\?document=${ACTIVITY.documentId}$`));
});

test("#719: an entry row's object link lands on the ENTRY, and a correction's two links name their own entries", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity");

  const original = page.locator("li").filter({ hasText: "A posted entry was reversed." }).first();
  await expect(original.getByRole("link", { name: "Links to the entry that replaced it." })).toHaveAttribute(
    "href",
    `/clients/${ACTIVITY.clientId}/journals?entry=${ACTIVITY.entryReplacementId}`,
  );
  await expect(original.getByRole("link", { name: "View in books" })).toHaveAttribute(
    "href",
    `/clients/${ACTIVITY.clientId}/journals?entry=${ACTIVITY.entryOriginalId}`,
  );

  // AND NO `?tab=`, stated as its own claim rather than left implicit in the string above. That
  // absence is the whole defect this cell now fences: the workbench opened on Drafts unless `?tab=`
  // said otherwise, the addressed read lives on the POSTED tab, so this link used to land a reader
  // on a tab that never looked at the id they arrived with. `openingJournalsTab`
  // (components/journals/journals-workbench.tsx) makes a bare `?entry=` open Posted.
  //
  // WHERE THE LANDING ITSELF IS WALKED: `journals-table-walk.spec.ts`, "#719: the ACTIVITY FEED's
  // own href shape …". This lane's fixture (`activity-mock.mjs`) answers `list_activity` and
  // `get_activity_event` only — it has no journal entries for `ACTIVITY.clientId`, so clicking
  // through from here would measure a loading banner, not the tab rule.
  for (const name of ["View in books", "Links to the entry that replaced it."]) {
    await expect(original.getByRole("link", { name })).not.toHaveAttribute("href", /[?&]tab=/);
  }
});

test("#719: a report-kind row now offers a link at all — the Reports tab, which is all this feed can name", async ({ page }) => {
  await signIn(page);
  await page.goto("/activity?kinds=report");

  // Before this the `report` group was the one kind with NO object arm, so its rows carried no link
  // whatsoever. The feed carries no artifact id for them (`object_kind` is never 'report'), so the
  // builder names the tab and says so rather than fabricating one — the `?report=` item parameter
  // exists and is proven by the Reports tab's own cells.
  const row = page.locator("li").filter({ hasText: "Report agent" }).first();
  await expect(row.getByRole("link", { name: "View in books" })).toHaveAttribute(
    "href",
    `/clients/${ACTIVITY.clientId}/reports`,
  );
});

