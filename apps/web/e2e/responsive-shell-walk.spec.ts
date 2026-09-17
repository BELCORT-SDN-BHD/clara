import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { cellBudgetMs, ensureRealFocus, watchReactFaults } from "./helpers";

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

/**
 * Sample the reflow invariants ON EVERY ANIMATION FRAME while `run()` plays out.
 *
 * WHY A REST MEASUREMENT IS NOT ENOUGH, and this is the whole reason the cell
 * exists: the two worst defects this train produced were both TRANSIENT. The
 * shell row gained 72px of horizontal scroll for the 200ms of the rail's exit
 * (a translated in-flow panel sticking out past the row), and the workbench was
 * squeezed and released across that same window (a wrapper keyed on `open` while
 * the panel stayed mounted on `presence`). A `boundingBox()` before and after
 * sees neither: both ends are clean and the middle is the bug. So the sampler
 * runs inside the page across the whole transition and reports the WORST frame.
 */
async function sampleAcross(
  page: Page,
  label: string,
  run: () => Promise<void>,
): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __clara: { over: number; minPane: number; frames: number } };
    w.__clara = { over: 0, minPane: Number.POSITIVE_INFINITY, frames: 0 };
    const tick = () => {
      const doc = document.documentElement;
      const pane = document.querySelector("[data-firm-workbench]");
      w.__clara.over = Math.max(w.__clara.over, doc.scrollWidth - doc.clientWidth);
      if (pane) w.__clara.minPane = Math.min(w.__clara.minPane, pane.getBoundingClientRect().width);
      w.__clara.frames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await run();
  // Past the full --motion-duration-panel plus a margin, so the sampler has
  // certainly covered the transition rather than stopping inside it.
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as { __clara: { frames: number } }).__clara.frames), {
      timeout: 5000,
    })
    .toBeGreaterThan(30);

  const worst = await page.evaluate(
    () => (window as unknown as { __clara: { over: number; minPane: number; frames: number } }).__clara,
  );
  // The sampler RAN — without this the two assertions below pass trivially on a
  // page where requestAnimationFrame never fired.
  expect(worst.frames, `${label}: the frame sampler never ran`).toBeGreaterThan(30);
  expect(
    worst.over,
    `${label}: the document scrolled sideways by ${worst.over}px during the transition`,
  ).toBeLessThanOrEqual(1);
  expect(
    worst.minPane,
    `${label}: the workbench narrowed to ${worst.minPane}px mid-transition — it was squeezed and released`,
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
  // #614: the layout's "Client: <name>" heading is gone — identity lives in the
  // breadcrumb (and, when the sidebar is docked, the group label). At this
  // NARROW width the sidebar is a closed sheet, so the breadcrumb is the one
  // that must still say which client this is.
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Rome Properties")).toBeVisible();
  await expectReflows(page, "client workspace");

  await page.goto(`/clients/${CLIENT_A}/journals`);
  await expectReflows(page, "client journals");

  // #625 — THE ROSTER FACE, which this loop had never measured. It carries the widest table on a
  // settings destination (five columns plus a per-row menu) and two dialogs, and until now nobody
  // had asked whether it fits the 320 CSS px workbench floor.
  await page.goto("/settings/members");
  await expect(page.getByRole("heading", { name: "Everyone with access", level: 2 })).toBeVisible();
  await expectReflows(page, "settings members");
});

/**
 * #625 — THE INVITE-ACCEPTANCE FACE at 640 and at 320 CSS px.
 *
 * It gets its own cell rather than a row in the loop above because it is an (entry)-group page
 * with no firm shell at all: `expectReflows` asks for `[data-firm-workbench]`, which this face
 * correctly does not have. What it OWES is the other half of the same acceptance — the document
 * must not scroll sideways, and the card's own primary action must stay reachable.
 */
test("#625: the invite-acceptance card reflows at 640 and at 320 CSS px", async ({ page }) => {
  // A token-shaped URL. Nothing is consumed on mount (`invite-accept-form.tsx`'s click gate), so
  // this face renders without any fixture behind it — which is exactly the state an invited person
  // meets before they press anything.
  const invite = `/invite/e2e-supabase-token-hash?ct=${"c".repeat(64)}`;
  for (const size of [NARROW, { width: 320, height: 720 }] as const) {
    await page.setViewportSize(size);
    await page.goto(invite);
    await expect(page.getByRole("heading", { name: "Accept your invitation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible();
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      overflow.scrollWidth,
      `invite acceptance at ${size.width}px: the document scrolls sideways (${overflow.scrollWidth} > ${overflow.clientWidth})`,
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  }
});

test("the client route carries exactly one h1 — identity now lives in the shell, not a second heading", async ({ page }) => {
  // #614 removed the layout's own "Client: <name>" heading (the pre-#614 pin
  // was TWO h1s on every client route — see shell-responsive.test.tsx's own
  // history). The client workspace home still renders its own single h1 (the
  // client's real name, via ClientIdentityBand) — that is the page's OWN
  // content heading, not shell chrome, and it is now the only one.
  await page.setViewportSize(NARROW);
  await signInTo(page, `/clients/${CLIENT_A}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Rome Properties")).toBeVisible();
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
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
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
  await expect(panel.getByRole("navigation", { name: "Main" })).toBeVisible();
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
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
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
  await page.getByRole("button", { name: "Toggle navigation" }).click();
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
  // #706 — a sign-in, two `dock-panel` entrance settles and a keyboard round trip through the
  // rail's own focus hand-off, all inside the flat 30 s default before this.
  test.setTimeout(cellBudgetMs({ signIns: 1, polls: 2 }));
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
  //
  // #706 — `toBeFocused()` on this walk's launcher was measured returning "inactive" under host
  // load. That reading is about the DOCUMENT, not the element: the page had not been granted
  // renderer focus yet, and a native key press dispatched into an unfocused document is a one-shot
  // action with nothing left to retry (see `ensureRealFocus`'s own doc in ./helpers). So each
  // keyboard step below waits for its own condition deterministically — the element becoming
  // `document.activeElement`, which is true whether or not the document itself is focused yet —
  // and `ensureRealFocus` closes the document half before the key that depends on it.
  const collapse = page.getByRole("button", { name: "Collapse Clara" });
  await collapse.focus();
  await expect.poll(async () => collapse.evaluate((el) => el === document.activeElement)).toBe(true);
  await ensureRealFocus(page);
  await expect(collapse).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rail).toHaveCount(0);

  // …focus lands on the launcher rather than on <body>, and the launcher REOPENS
  // it by keyboard, closing the loop. The hand-off is an EFFECT the rail runs as it unmounts, so
  // the poll below is on the condition itself rather than on a timer.
  const launcher = page.locator("[data-clara-rail-launcher]");
  await expect(launcher).toBeVisible();
  await expect.poll(async () => launcher.evaluate((el) => el === document.activeElement)).toBe(true);
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
  // …and there is no MOBILE SHEET in this arm. The trigger itself is NOT
  // hidden at this width any more — the vendored `SidebarTrigger` is the SAME
  // control that collapses the docked column at `md` and opens the sheet
  // below it (components/ui/sidebar.tsx), so its absence would be the wrong
  // claim now; the sheet's absence is the one that still distinguishes the
  // docked arm.
  await expect(page.locator("[data-slot=sheet-content]")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
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

test("the rail's EXIT never squeezes the workbench and never scrolls the page — sampled per frame", async ({ page }) => {
  // The regression guard for the two transient defects. Both were invisible to a
  // before/after measurement and both were shipped once.
  await page.setViewportSize(NARROW);
  await signInTo(page, `/clients/${CLIENT_A}`);
  await page.locator("[data-clara-rail-launcher]").click();
  await expect(page.locator("[data-clara-rail]")).toBeVisible();

  await sampleAcross(page, "the overlay rail's exit", async () => {
    await page.getByRole("button", { name: "Collapse Clara" }).click();
    await expect(page.locator("[data-clara-rail]")).toHaveCount(0);
  });

  // …and the ENTER too, which is where the horizontal overflow originally came
  // from: `dock-panel`'s `@starting-style` translates the panel in by its own
  // width, and that has always been true — nothing had ever measured it.
  await sampleAcross(page, "the overlay rail's enter", async () => {
    await page.locator("[data-clara-rail-launcher]").click();
    await expect(page.locator("[data-clara-rail]")).toBeVisible();
  });
});

test("the DOCKED rail's transition is clean too — the wide arm is sampled, not assumed", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await signInTo(page, `/clients/${CLIENT_A}`);
  await expect(page.locator("[data-clara-rail]")).toBeVisible();
  await sampleAcross(page, "the docked rail's exit", async () => {
    await page.getByRole("button", { name: "Collapse Clara" }).click();
    await expect(page.locator("[data-clara-rail]")).toHaveCount(0);
  });
});

test("the mobile sheet is 18rem (288px) — the vendored primitive's own width, not the docked rail's 224", async ({ page }) => {
  // MEASURED, because #614 replaced the bespoke drawer with the vendored
  // Sidebar's own sheet arm (components/ui/sidebar.tsx: `SIDEBAR_WIDTH_MOBILE`,
  // deliberately left at the vendored 18rem — see that file's hand-edit 2 for
  // why only the DESKTOP width was retuned to the old rail's 224px and the
  // sheet, which is not competing with anything else on screen, was not).
  await page.setViewportSize(NARROW);
  await signInTo(page, "/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  const panel = page.locator("[data-slot=sheet-content]");
  await expect(panel).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length))
    .toBe(0);

  const width = await panel.evaluate((el) => el.getBoundingClientRect().width);
  expect(width, `the sheet is ${width}px — it should be the primitive's own 18rem (288)`).toBeCloseTo(288, 0);
  // …and it is not merely narrow by accident: 85vw of this viewport is 544, so a
  // sheet that had lost the width entirely and was only being capped would read
  // 544 here, not 288.
  expect(width).toBeLessThan(NARROW.width * 0.85);
});

test("the SectionTabs strip is not pinned at 32px — six tabs at 640 do not wrap through their own rule", async ({ page }) => {
  // `tabsListVariants` carries `group-data-horizontal/tabs:h-8`, and a bare
  // `h-auto` in the skin does NOT beat it: both are (0,1,0) and the h-8 rule is
  // emitted later. The strip was a fixed 32px box with `flex-wrap`, so a six-tab
  // workbench at this width wrapped its second row straight through the list's
  // `border-b`. The height is the discriminating read; the class string is not.
  await page.setViewportSize(NARROW);
  await signInTo(page, `/clients/${CLIENT_A}`);

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

  const list = page.getByRole("tablist").first();
  const box = await list.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const tabs = [...el.querySelectorAll('[role="tab"]')].map((t) => t.getBoundingClientRect());
    return {
      height: rect.height,
      bottom: rect.bottom,
      tabCount: tabs.length,
      // A tab whose bottom sits past the list's own bottom edge is a wrapped row
      // painting outside the strip — the visible symptom of the 32px pin.
      overflowing: tabs.filter((t) => t.bottom > rect.bottom + 1).length,
      rows: new Set(tabs.map((t) => Math.round(t.top))).size,
    };
  });

  expect(box.tabCount, `${face}: expected a multi-tab strip`).toBeGreaterThan(1);
  expect(
    box.overflowing,
    `${face}: ${box.overflowing} of ${box.tabCount} tabs paint below the tablist's own box — the strip is height-pinned`,
  ).toBe(0);
  // If the strip wrapped to a second row it is TALLER than 32px, which is the
  // honest assertion: the fix is that the box grows to fit, not that it never wraps.
  if (box.rows > 1) {
    expect(box.height, `${face}: ${box.rows} rows of tabs inside a ${box.height}px strip`).toBeGreaterThan(32);
  }
});

test("DS-01 extended: the SHEET drops its slide under prefers-reduced-motion and keeps its fade", async ({ page }) => {
  // The fifth motion family. Its four side translates compiled with no enclosing
  // at-rule, so the drawer travelled for a user who had asked for less motion —
  // read out of the built stylesheet, and now read back as computed style.
  await page.setViewportSize(NARROW);
  await signInTo(page, "/");
  await page.emulateMedia({ reducedMotion: "reduce" });

  await page.getByRole("button", { name: "Toggle navigation" }).click();
  const panel = page.locator("[data-slot=sheet-content]");
  await expect(panel).toBeVisible();

  const style = await panel.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      translate: s.translate,
      transform: s.transform,
      opacity: s.opacity,
      duration: s.transitionDuration,
      property: s.transitionProperty,
    };
  });
  // NO MOVEMENT: `motion-safe:` compiles to
  // `@media (prefers-reduced-motion: no-preference)`, so under `reduce` the side
  // translate is simply not applied and the panel sits where it belongs.
  expect(
    style.translate === "none" || style.translate === "" || style.translate === "0px",
    `the sheet still translates under reduced motion: ${style.translate}`,
  ).toBe(true);
  expect(style.transform === "none" || style.transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);
  // …AND THE FADE REMAINS, which is the half the contract insists on ("opacity
  // and explicit state copy REMAIN"). A blanket motion-killer would read 0s here
  // and would be just as wrong as the slide.
  //
  // The fade is asserted as a DECLARATION plus a settled endpoint, not as an
  // instantaneous opacity: this cell first read `opacity` right after
  // `toBeVisible()` and measured 0.0855 — the fade caught mid-flight, which is
  // the correct behaviour failing a badly-shaped assertion. Reading the declared
  // property and duration proves the fade exists; polling to 1 proves it
  // completes and leaves the panel readable.
  expect(style.duration).toMatch(/0\.2s/);
  expect(style.property, "the sheet declares no opacity transition under reduce").toMatch(/opacity/);
  await expect.poll(async () => panel.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
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
  // THE DISCRIMINATING POST-CONDITION: the client's own workspace, by id, and
  // the sidebar's client group now names it — #614 retired the layout's
  // "Client: <name>" heading in favour of the shell's own identity surfaces.
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_B}$`));
  await expect(page.getByRole("navigation", { name: "Main" }).getByText("Bee Creative Solution", { exact: true })).toBeVisible();
});

test("C-43: ⌘K's Go list is rank-shaped — a bookkeeper sees exactly what their sidebar shows", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await signInTo(page, "/", "bookkeeper@example.test");
  const nav = page.getByRole("navigation", { name: "Main" });
  // Establish the ORACLE from the sidebar itself rather than from a list this
  // test typed: the claim is that the two agree, so one of them has to be read.
  await expect(nav.getByRole("link", { name: "Activity", exact: true })).toBeVisible();
  // #614 retired the "Admin"/"Firm" rank-shaped rename outright — the
  // destination is "Settings" at every rank now, so neither retired label may
  // resurface. `e2e/firm-navigation-walk.spec.ts` pins the same pair.
  await expect(nav.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Firm", exact: true })).toHaveCount(0);
  await nav.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);

  await ensureRealFocus(page);
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("option", { name: "Firm activity" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Vendor identity bindings" })).toBeVisible();
  // HIDDEN, matching the sidebar/hub. Before C-43 all three of these rendered.
  await expect(page.getByRole("option", { name: "Members", exact: true })).toHaveCount(0);
  // #615 — "Firm registrations" is gone from the catalogue entirely (the queue moved to the
  // operator destination), so asserting ITS absence would now be vacuous. The live property is the
  // one this row states: the operator destination is owner+operator-floored, so a bookkeeper is not
  // offered it here either. Its label carries the word "registrations" as a keyword, which is why
  // the row above still finds nothing under the old name.
  await expect(page.getByRole("option", { name: "Operator support" })).toHaveCount(0);
  // …AND THE LABEL AGREES TOO, not just the visibility. This is the half the
  // merge exposed: ⌘K kept its own catalogue and went on saying "Admin" while
  // the sidebar said "Firm" for the same href. Both halves of the agreement are
  // now asserted against the sidebar read above, in one persona — both retired
  // in favour of "Settings".
  await expect(page.getByRole("option", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Admin", exact: true })).toHaveCount(0);
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
    // #625 — the two membership faces. The roster's row menu, its two confirmations and the
    // invite card's single button are controls this scan had never seen at a narrow width, which
    // is exactly where a 24px target is easiest to ship by accident.
    ["settings members", "/settings/members"],
    ["invite acceptance", `/invite/e2e-supabase-token-hash?ct=${"c".repeat(64)}`],
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

  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(page.locator("[data-slot=sheet-content]")).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length))
    .toBe(0);
  const open = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(open.violations, "narrow firm home, drawer open").toEqual([]);
});

/**
 * #736 — THE RAIL LEAVES WHEN THE VIEWPORT BECOMES NARROW (the owner's option C).
 *
 * WHAT WAS WRONG. The rail-open flag defaults to open with no persistence, and a
 * single mount-time check closed it when the document LOADED narrow. It never
 * re-ran, so a rail opened at a wide viewport stayed open through a resize, a
 * rotation or a zoom that crossed `lg` — and at 320px an 85vw panel plus its
 * full-viewport scrim sat over the page's own controls. `work-cancel-walk.spec.ts`
 * had to open its confirm dialog wide and narrow afterwards to reach a button at
 * all; that workaround is retired in the same change as this cell.
 *
 * WHY A BROWSER. A crossing is a real `matchMedia` event produced by real layout.
 * The node cells beside the component (`components/clara/rail-chrome.test.tsx`)
 * drive the rule's three discriminating cases against a stub; only this leg can
 * say that a genuine 1280 -> 320 resize, and a genuine 200% zoom, produce one.
 */
test("#736: crossing from wide into narrow closes the rail by itself, through its own exit", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await signInTo(page, `/clients/${CLIENT_A}`);
  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();
  await expect(page.locator("[data-clara-rail-launcher]")).toHaveCount(0);

  // THE EXIT IS WATCHED, NOT INFERRED. `useRailPresence` keeps the panel MOUNTED
  // for one `--motion-duration-panel` after the flag goes false and flips
  // `data-state` to "closed" for that window — which IS the transition. A cell
  // that only asserted the panel had gone would pass just as happily for a rail
  // that vanished between frames, which is the thing the presence latch exists
  // to prevent. The observer is armed BEFORE the resize because the whole window
  // is 200ms long.
  const exited = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const aside = document.querySelector("[data-clara-rail]");
        if (aside === null) return resolve(false);
        const observer = new MutationObserver(() => {
          if (aside.getAttribute("data-state") === "closed" && aside.isConnected) {
            observer.disconnect();
            resolve(true);
          }
        });
        observer.observe(aside, { attributes: true, attributeFilter: ["data-state"] });
        setTimeout(() => { observer.disconnect(); resolve(false); }, 5_000);
      }),
  );
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await exited, "the rail was removed without ever entering its closing state").toBe(true);

  await expect(rail).toHaveCount(0);
  await expect(page.locator("[data-clara-rail-launcher]")).toBeVisible();
  // …and the workbench is operable: the page's own chrome takes the click that
  // the open panel used to intercept.
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(page.locator("[data-slot=sheet-content]")).toBeVisible();
});

test("#736: 200% zoom is a crossing too — the rail closes at 640 CSS px", async ({ page }) => {
  // WCAG 2.2 SC 1.4.10's own case, spelled the way THIS FILE's header already
  // spells it: "200% browser zoom is EXACTLY a halving of the CSS viewport: the
  // page lays out at 640 CSS px". It is not spelled as `documentElement.style.zoom`,
  // and that is a measurement rather than a preference — a first cut of this cell
  // applied 200% CSS `zoom` to a 1280px window and then asked the page
  // `matchMedia("(width < 64rem)").matches`, which answered FALSE (Chromium
  // 1234/Playwright 1.62.1, 2026-09-14). CSS `zoom` scales the rendering; it does
  // not move the media-query viewport, so a cell built on it would have proved
  // nothing about the arm it claims to cross.
  await page.setViewportSize(WIDE);
  await signInTo(page, `/clients/${CLIENT_A}`);
  await expect(page.locator("[data-clara-rail]")).toBeVisible();

  await page.setViewportSize(NARROW);
  // THE MECHANISM, ASSERTED BEFORE THE BEHAVIOUR. `(width < 64rem)` is
  // `components/clara/rail-chrome.tsx`'s own `NARROW_QUERY`; if a future change
  // moved the rail's breakpoint, the rail assertion below would go red with no
  // hint why.
  expect(
    await page.evaluate(() => window.matchMedia("(width < 64rem)").matches),
    "640 CSS px is not below the lg boundary the rail keys on",
  ).toBe(true);
  await expect(page.locator("[data-clara-rail]")).toHaveCount(0);
  await expect(page.locator("[data-clara-rail-launcher]")).toBeVisible();

  // CROSSING BACK TO WIDE NEITHER OPENS NOR CLOSES IT — the docked arm keeps
  // whatever state the human was left with, which is the half that keeps this
  // rule from being "the rail is closed below lg, always".
  await page.setViewportSize(WIDE);
  await expect(page.locator("[data-clara-rail]")).toHaveCount(0);
  await expect(page.locator("[data-clara-rail-launcher]")).toBeVisible();
});

test("#736: a rail opened by the human at a narrow width survives a client-side navigation", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await signInTo(page, "/");
  await page.locator("[data-clara-rail-launcher]").click();
  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();

  // ⌘K IS THE ONE CLIENT-SIDE NAVIGATION AVAILABLE WITH THE RAIL OPEN, and that
  // is not a convenience: the rail's scrim covers the viewport while it is open,
  // so every in-page link is behind it by construction. The palette is a modal
  // above the scrim, and selecting a client Go row is a real router push — the
  // same navigation C-43 walks at the wide viewport.
  await ensureRealFocus(page);
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("Search or ask Clara…").fill("bee creative");
  await page.getByRole("option", { name: "Bee Creative Solution" }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_B}$`));

  // STILL OPEN. `RailMount` sits outside the client key and the chrome mounts
  // once per document, so nothing about a route change re-runs the narrow rule —
  // and a rule that closed the rail here would be taking away something the
  // human opened.
  await expect(rail).toBeVisible();
  await expect(page.locator("[data-clara-rail-launcher]")).toHaveCount(0);
});

/**
 * #732 — THE ENTRY FACES HYDRATE CLEAN AT A NARROW VIEWPORT TOO.
 *
 * The owner's 2026-09-13 reproduction read `Minified React error #418` on every
 * narrow load of the Work detail route AND "on at least one of the signup /
 * pending / firm-home loads in the same narrow pane", which is what identified
 * the SHELL rather than the page as the subject. `journal-work-walk.spec.ts`
 * owns the firm-shell half (it has the Work fixture); this cell owns the entry
 * half, whose only shared ancestor with it is `app/layout.tsx`.
 *
 * `/pending` NEEDS A SESSION WITHOUT A FIRM, which is exactly what the fixture's
 * default persona is (`e2e/serve-built.mjs`'s `holding@example.test`): a member
 * is redirected off this route to `/`. The cell signs back in as the owner at the
 * end so the shared fixture is left as it was found.
 */
test("#732: /pending hydrates with no React fault at 375 px and at 1280 px", async ({ page }) => {
  const collector = watchReactFaults(page);
  // THE VIEWPORT IS SET BEFORE THE NAVIGATION, which is the whole point: a
  // mismatch is a property of the FIRST client render, so a resize afterwards
  // measures a tree React has already reconciled and can never reproduce one.
  await page.setViewportSize({ width: 375, height: 812 });
  await signInTo(page, "/pending", "holding@example.test");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(collector.faults(), "/pending at 375px must hydrate with no React fault").toEqual([]);

  // #732 AC3 — "the narrow shell still ends in the same state it has today"
  // read against THIS route's own today: `/pending` is `app/(entry)/pending`,
  // under `app/(entry)/layout.tsx`, not `app/(firm)/layout.tsx` — the firm
  // shell that owns the docked sidebar (`components/ui/sidebar.tsx`) and the
  // Clara rail launcher (`components/clara/rail-launcher.tsx`, mounted only
  // by `RailMount` in the firm layout) never mounts here at any width. So the
  // narrow "same state" claim for this face is that it stays exactly what it
  // is today — the identity card, nothing from the firm shell — rather than
  // picking up either sidebar arm by accident.
  await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
  await expect(page.locator("[data-clara-rail-launcher]")).toHaveCount(0);
  await expect(page.getByText("ClaraBook", { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="card"]').first()).toBeVisible();

  // 1280 IS THE CONTROL, and it is reached by a FULL document load rather than a
  // second sign-in: `goto` is what produces a fresh server render for the first
  // client render to disagree with, and the session is already in the jar.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/pending");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(collector.faults(), "/pending at 1280px must hydrate with no React fault").toEqual([]);

  // The control width must land on the identical entry-shell state, not just
  // an identical fault count: this route has no responsive shell to diverge.
  await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
  await expect(page.locator("[data-clara-rail-launcher]")).toHaveCount(0);
  await expect(page.getByText("ClaraBook", { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="card"]').first()).toBeVisible();

  await page.evaluate(() => console.error("e2e-732-pending-collector-probe"));
  expect(collector.seen(), "the console collector must actually be receiving errors").toContain(
    "e2e-732-pending-collector-probe",
  );
  // The fixture's signed-in persona is SERVER-side state shared by every later
  // cell (`e2e/serve-built.mjs` keys `caller_context` off the last sign-in), and
  // this is the one cell in the suite that signs in as anybody but the owner. Put
  // it back rather than leaving the next file to discover it.
  await signInTo(page, "/");
});
