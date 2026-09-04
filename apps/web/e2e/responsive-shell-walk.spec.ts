import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { ensureRealFocus } from "./helpers";

/**
 * CB-AE2E-019 · H-31 · C-43 — THE BROWSER LEG (裁-86).
 *
 * Every claim here needs one of the three things the node harness does not
 * have: real layout geometry, a real focus manager, or a real HTTP response.
 *
 *   CB-AE2E-019  the workbench is ≥ 320 CSS px and the document does not scroll
 *                sideways at 640 CSS px; the firm drawer opens and closes by
 *                KEYBOARD with focus returned; the Clara rail is an overlay that
 *                costs the workbench no width; SectionTabs' roving focus (the
 *                one claim the node cell explicitly declined to make, because
 *                the roving tabindex needs a focus manager).
 *   H-31         /favicon.ico and the App Router icon route actually 200. An
 *                absence of a 404 in the console is not evidence the icon loaded.
 *   C-43         ⌘K reaches a client BY NAME from firm altitude, and hides from a
 *                bookkeeper the rows that persona's sidebar also hides.
 *
 * WHY 640×720 AND NOT `deviceScaleFactor`. The audit names "1280×720 at 200%
 * zoom" and 200% browser zoom is EXACTLY a halving of the CSS viewport: the page
 * lays out at 640 CSS px. `deviceScaleFactor` changes device pixels per CSS
 * pixel, which is a RESOLUTION knob and leaves layout at 1280 — using it here
 * would produce a crisper screenshot of the very bug this walks. WCAG 2.2 SC
 * 1.4.10 (Reflow) is written in CSS pixels for the same reason.
 */

const NARROW = { width: 640, height: 720 };
const WIDE = { width: 1280, height: 720 };
const CLIENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function signInTo(page: Page, destination: string, email = "owner@example.test"): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

/** The two halves of WCAG 1.4.10 Reflow this shell was failing, measured. */
async function expectReflows(page: Page, face: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${face}: the document scrolls sideways (${overflow.scrollWidth} > ${overflow.clientWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);

  const workbench = await page.locator("[data-firm-workbench]").boundingBox();
  expect(workbench, `${face}: no workbench column`).not.toBeNull();
  expect(
    workbench?.width ?? 0,
    `${face}: the workbench is ${workbench?.width}px — below the 320 CSS px floor`,
  ).toBeGreaterThanOrEqual(320);
}

test("at 640 CSS px the workbench keeps 320px and the page never scrolls sideways", async ({ page }) => {
  // THE ACCEPTANCE, on the two altitudes with different chrome. Before this
  // train the firm shell spent 224 + 320 + 64 = 608px on chrome unconditionally,
  // so this viewport left the workbench about 32px wide.
  await page.setViewportSize(NARROW);
  await signInTo(page, "/");
  await expectReflows(page, "firm home");

  await page.goto(`/clients/${CLIENT_A}`);
  await expect(page.getByRole("heading", { name: "Client: Rome Properties", level: 1 })).toBeVisible();
  await expectReflows(page, "client workspace");

  await page.goto(`/clients/${CLIENT_A}/journals`);
  await expectReflows(page, "client journals");
});

test("the client's name is the level-1 heading — the altitude had no h1 at all", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await signInTo(page, `/clients/${CLIENT_A}`);
  const h1 = page.getByRole("heading", { level: 1, name: /^Client: / });
  await expect(h1).toBeVisible();
  await expect(h1).toHaveText("Client: Rome Properties");
});

test("the firm drawer opens and closes BY KEYBOARD, and focus returns to the toggle", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await signInTo(page, "/");
  await ensureRealFocus(page);

  // TWO LOCATORS FOR ONE BUTTON, and the reason is a property of the fix rather
  // than a convenience. Once the sheet opens, Base UI marks the rest of the
  // document `aria-hidden` — correctly, because the toggle really is out of the
  // accessibility tree while a modal is up — so a ROLE query stops resolving and
  // `toHaveAttribute` reports "element(s) not found". The role locator is what a
  // user reaches (and is what proves the accessible name), the structural one is
  // what a test reads state through while the modal is up.
  const toggle = page.getByRole("button", { name: "Menu" });
  const toggleNode = page.locator("[data-firm-drawer-toggle]");
  await expect(toggle).toBeVisible();
  await expect(toggleNode).toHaveAttribute("aria-expanded", "false");

  // Reached and activated by keyboard, never clicked: Chrome only matches
  // `:focus-visible` and only runs its real focus-restoration path for a
  // keyboard-driven open, and a click would also move the sequential-focus
  // starting point, hiding a broken `finalFocus` behind the pointer.
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");

  const panel = page.locator("[data-slot=sheet-content]");
  await expect(panel).toBeVisible();
  await expect(toggleNode).toHaveAttribute("aria-expanded", "true");
  // …and the toggle really IS out of the accessibility tree while the modal is
  // up, which is the behaviour that forced the second locator. Asserted rather
  // than worked around silently.
  await expect(toggle).toHaveCount(0);
  // The SAME nav, not a second copy of it — the sidebar's own landmark name.
  await expect(panel.getByRole("navigation", { name: "Firm navigation" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Clients", exact: true })).toBeVisible();

  // FOCUS IS INSIDE. Without this the Escape below would be pressed against the
  // document and the "it closes" assertion would pass for the wrong reason.
  expect(
    await page.evaluate(() => {
      const popup = document.querySelector("[data-slot=sheet-content]");
      return Boolean(popup && document.activeElement && popup.contains(document.activeElement));
    }),
    "focus never entered the drawer",
  ).toBe(true);

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  // THE DISCRIMINATING HALF: focus back on the control that opened it, not on
  // <body>. A drawer that dumps focus to the top of the document on close makes
  // a keyboard user re-walk the whole page to get back to where they were.
  await expect(toggle).toBeFocused();
  await expect(toggleNode).toHaveAttribute("aria-expanded", "false");
});

test("the drawer closes on the navigation it performs — it never sits over the page it just opened", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await signInTo(page, "/");
  const toggle = page.getByRole("button", { name: "Menu" });
  await toggle.click();
  const panel = page.locator("[data-slot=sheet-content]");
  await expect(panel).toBeVisible();
  await panel.getByRole("link", { name: "Clients", exact: true }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(panel).toHaveCount(0);
  // …and the destination is genuinely reachable, not behind an invisible panel.
  await expect(page.getByRole("link", { name: "Rome Properties" })).toBeVisible();
});

test("below lg the rail does NOT open itself — the workbench is the work", async ({ page }) => {
  // The store initialises `railOpen: true` with no persistence, so before this
  // train every page load opened the rail. In the overlay arm that is a 320px
  // panel PLUS a backdrop over the whole viewport: the first version of this
  // walk could not click the drawer toggle at all, because the scrim intercepted
  // every pointer event on a shell whose entire purpose was to be usable at this
  // width. The launcher stays the entry point.
  await page.setViewportSize(NARROW);
  await signInTo(page, `/clients/${CLIENT_A}`);
  await expect(page.locator("[data-clara-rail-launcher]")).toBeVisible();
  await expect(page.locator("[data-clara-rail]")).toHaveCount(0);
  // …and the drawer toggle is genuinely reachable, which is the thing the scrim
  // was preventing.
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.locator("[data-slot=sheet-content]")).toBeVisible();
});

test("at lg and above the rail is STILL open by default — the narrow default is arm-scoped", async ({ page }) => {
  // The discriminating other half. Without it, "the rail is closed" would pass
  // just as happily if the auto-close had been made unconditional, which would
  // be a silent change to the docked shell every existing walk depends on.
  await page.setViewportSize(WIDE);
  await signInTo(page, `/clients/${CLIENT_A}`);
  await expect(page.locator("[data-clara-rail]")).toBeVisible();
  await expect(page.locator("[data-clara-rail-launcher]")).toHaveCount(0);
});

test("below lg the Clara rail is an OVERLAY: it covers the workbench instead of shrinking it", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await signInTo(page, `/clients/${CLIENT_A}`);

  // OPENED BY THE HUMAN, through the launcher — which is now the only way it
  // opens at this width, and is itself the journey worth walking.
  await page.locator("[data-clara-rail-launcher]").click();
  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();
  // Settle the entrance before measuring geometry: `dock-panel` translates the
  // panel in over 200ms, so a bounding box read on the first visible frame is a
  // measurement of the animation, not of the layout.
  await expect
    .poll(async () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length))
    .toBe(0);
  await expect.poll(async () => (await rail.boundingBox())?.x ?? -1).toBeLessThan(NARROW.width);
  const railBox = await rail.boundingBox();
  const workbench = await page.locator("[data-firm-workbench]").boundingBox();
  expect(railBox).not.toBeNull();
  expect(workbench).not.toBeNull();

  // THE OVERLAY CLAIM, as geometry: the rail's left edge is INSIDE the
  // workbench's box (they overlap), which is precisely what a docked column
  // never does — and the workbench still clears the 320px floor because the rail
  // costs it nothing.
  expect(railBox!.x).toBeLessThan(workbench!.x + workbench!.width);
  expect(workbench!.width).toBeGreaterThanOrEqual(320);
  // …and it is `position: fixed`, read as computed style rather than inferred.
  expect(await rail.evaluate((el) => getComputedStyle(el.parentElement!).position)).toBe("fixed");

  // CLOSE BY KEYBOARD, from inside the rail, and it goes away.
  const collapse = page.getByRole("button", { name: "Collapse Clara" });
  await collapse.focus();
  await expect(collapse).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rail).toHaveCount(0);

  // …focus lands on the launcher rather than on <body>, and the launcher REOPENS
  // it by keyboard, closing the loop.
  const launcher = page.locator("[data-clara-rail-launcher]");
  await expect(launcher).toBeVisible();
  await expect(launcher).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rail).toBeVisible();
});

test("Escape closes the overlay rail, and the exit is a real transition rather than a vanish", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await signInTo(page, `/clients/${CLIENT_A}`);
  await page.locator("[data-clara-rail-launcher]").click();
  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();

  // THE EXIT. `data-state` flips to "closed" while the element is STILL in the
  // document — the whole point of the presence latch — and the transition the
  // `dock-panel` utility declares is what the browser is running during that
  // window. Read as computed style, so a utility that never compiled is caught
  // here and not only in the source-reading unit gate.
  const declared = await rail.evaluate((el) => getComputedStyle(el).transitionProperty);
  expect(declared, "the rail declares no transition — dock-panel did not compile").toMatch(/opacity/);
  expect(declared).toMatch(/width/);
  expect(await rail.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/0\.2s/);

  await page.getByRole("button", { name: "Collapse Clara" }).focus();
  await page.keyboard.press("Escape");
  await expect(rail).toHaveCount(0);
  await expect(page.locator("[data-clara-rail-launcher]")).toBeVisible();
});

test("at 1280 the rail is still DOCKED — the wide arm is untouched by the overlay work", async ({ page }) => {
  // The other half of the re-scope: parity-holes.spec.ts proves the docked
  // measurements, and this asserts the ARM SELECTION itself — that the same
  // build serves a non-fixed, width-owning rail at the wide viewport. Without
  // it, a breakpoint typo that made the overlay unconditional would leave both
  // specs measuring the overlay and agreeing with each other.
  await page.setViewportSize(WIDE);
  await signInTo(page, `/clients/${CLIENT_A}`);
  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();
  expect(await rail.evaluate((el) => getComputedStyle(el.parentElement!).display)).toBe("contents");
  const railBox = await rail.boundingBox();
  const workbench = await page.locator("[data-firm-workbench]").boundingBox();
  // Docked: the workbench ENDS where the rail begins. No overlap.
  expect((workbench?.x ?? 0) + (workbench?.width ?? 0)).toBeLessThanOrEqual((railBox?.x ?? 0) + 1);
  // …and the drawer toggle is not on screen at all in this arm.
  await expect(page.getByRole("button", { name: "Menu" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Firm navigation" })).toBeVisible();
});

test("SectionTabs is ONE tab stop and the arrow keys move between tabs — the roving focus the primitive brought", async ({ page }) => {
  // THE CLAIM THE NODE CELL DECLINED TO MAKE. A roving tabindex needs a real
  // focus manager; in the node harness every tab rendered `tabindex="-1"`, so
  // asserting it there would have measured the harness. Here it is real.
  await page.setViewportSize(WIDE);
  await signInTo(page, `/clients/${CLIENT_A}`);

  // WHICH FACE, and why this is a search rather than a fixed URL. Four client
  // workbenches compose `SectionTabs` (bank, documents, journals, registers) and
  // each renders it only once its own read lands. The e2e mock does not serve
  // every one of those reads — journals, for instance, renders its honest
  // "not available right now" state here — so a hardcoded face would make this
  // cell a hostage to mock coverage rather than a test of the widget. It walks
  // the candidates and uses the first that actually renders a tablist, and it
  // FAILS if none does; it never silently skips.
  const candidates = ["registers", "bank", "documents", "journals"] as const;
  let face: string | null = null;
  for (const candidate of candidates) {
    await page.goto(`/clients/${CLIENT_A}/${candidate}`);
    await page.waitForLoadState("networkidle");
    if ((await page.getByRole("tab").count()) > 1) {
      face = candidate;
      break;
    }
  }
  expect(face, `none of ${candidates.join(", ")} rendered a SectionTabs under the e2e mock`).not.toBeNull();

  const tabs = page.getByRole("tab");
  expect(await tabs.count()).toBeGreaterThan(1);

  // Exactly one tab is in the sequential focus order.
  const stops = await page.evaluate(
    () => [...document.querySelectorAll('[role="tab"]')].filter((t) => t.getAttribute("tabindex") !== "-1").length,
  );
  expect(stops, `${face}: a tablist must be ONE tab stop, not one per tab`).toBe(1);

  await tabs.first().focus();
  const before = await page.evaluate(() => document.activeElement?.textContent ?? "");
  await page.keyboard.press("ArrowRight");
  const after = await page.evaluate(() => document.activeElement?.textContent ?? "");
  expect(after, "ArrowRight did not move focus — the tablist is still not roving").not.toBe(before);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("tab");
});

test("H-31: the favicon and the App Router icon actually 200", async ({ page }) => {
  await page.goto("/login");
  // The browser's own root probe. The handover row named this 404 explicitly.
  const ico = await page.request.get("/favicon.ico");
  expect(ico.status(), "/favicon.ico").toBe(200);
  expect(Number(ico.headers()["content-length"] ?? "1")).toBeGreaterThan(0);

  // The file-convention icon, fetched at the URL Next actually emitted — read
  // from the DOM rather than guessed, because Next content-hashes the path.
  const href = await page.getAttribute('link[rel~="icon"]', "href");
  expect(href, "no <link rel=icon> reached the document").toBeTruthy();
  const icon = await page.request.get(href!);
  expect(icon.status(), `icon at ${href}`).toBe(200);
  expect(icon.headers()["content-type"]).toMatch(/image\//);
});

test("C-43: ⌘K reaches a client BY NAME from firm altitude, in one selection", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await signInTo(page, "/");
  await ensureRealFocus(page);
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("Search or ask Clara…").fill("bee creative");
  const row = page.getByRole("option", { name: "Bee Creative Solution" });
  await expect(row).toBeVisible();
  await row.click();
  // THE DISCRIMINATING POST-CONDITION: the client's own workspace, by id.
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_B}$`));
  await expect(page.getByRole("heading", { name: "Client: Bee Creative Solution", level: 1 })).toBeVisible();
});

test("C-43: ⌘K's Go list is rank-shaped — a bookkeeper sees exactly what their sidebar shows", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await signInTo(page, "/", "bookkeeper@example.test");
  const nav = page.getByRole("navigation", { name: "Firm navigation" });
  // Establish the ORACLE from the sidebar itself rather than from a list this
  // test typed: the claim is that the two agree, so one of them has to be read.
  await expect(nav.getByRole("link", { name: "Activity", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(nav.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);

  await ensureRealFocus(page);
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("option", { name: "Firm activity" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Vendor identity bindings" })).toBeVisible();
  // HIDDEN, matching the sidebar. Before C-43 all three of these rendered.
  await expect(page.getByRole("option", { name: "Members", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Firm registrations" })).toHaveCount(0);
});

test("裁-13: target-size is clean at the NARROW viewport too, where the new controls live", async ({ page }) => {
  // The existing a11y walk runs every scan at the config's 1280px, so the drawer
  // toggle, the overlay rail's controls and the scrolling tab strip had never
  // been scanned at all — they do not exist in that arm.
  await page.setViewportSize(NARROW);
  await signInTo(page, "/");
  for (const [face, url] of [
    ["firm home", "/"],
    ["client workspace", `/clients/${CLIENT_A}`],
  ] as const) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await expect
      .poll(async () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length))
      .toBe(0);
    const result = await new AxeBuilder({ page }).withRules(["target-size"]).analyze();
    expect(result.violations, `${face} target-size violations at 640px`).toEqual([]);
    const seen = [...result.passes, ...result.violations, ...result.incomplete, ...result.inapplicable];
    // The CONTROL the sibling walk records: a rule id axe does not know returns
    // zero of everything, which is indistinguishable from a clean page.
    expect(seen.map((r) => r.id)).toContain("target-size");
  }
});

test("the narrow shell stays clean under the full WCAG 2.1 AA scan, drawer open and closed", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await signInTo(page, "/");
  const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

  await page.waitForLoadState("networkidle");
  const closed = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(closed.violations, "narrow firm home, drawer closed").toEqual([]);

  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.locator("[data-slot=sheet-content]")).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length))
    .toBe(0);
  const open = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(open.violations, "narrow firm home, drawer open").toEqual([]);
});
