import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * P6-3 · THE BROWSER LEG (裁-86). Every claim below needs the three things the
 * unit harness does not have: real layout geometry, a real focus manager, and a
 * real `prefers-reduced-motion` media query. The unit suites prove structure;
 * this proves behaviour, and the PR body says which instrument proved what.
 *
 *   裁-13  axe-core's REAL `target-size` rule, with the spacing exception the
 *          class-string gate deliberately does not fake.
 *   DS-02  the skip link is reachable by one Tab and actually MOVES focus past
 *          the sidebar — the half no attribute read can establish.
 *   DS-01  the dropdown menu genuinely stops moving under reduced motion.
 *   裁-1   the recut ring and the recut --input reach the browser as computed
 *          style, not just as class strings.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const FACES = [
  ["home", "/"],
  ["admin hub", "/admin"],
  ["members", "/admin/members"],
  ["journals", `/clients/${CLIENT_A}/journals`],
] as const;

async function signInTo(page: Page, destination: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

/**
 * Navigate, then WAIT FOR THE ENTRANCE TRANSITION TO FINISH before measuring.
 *
 * This is not defensive padding, it is a correctness requirement, and it cost
 * this lane a false positive to learn: globals.css's `enter-content` utility
 * fades a table in from `opacity: 0` on first paint, and an axe `color-contrast`
 * scan started before that transition settles measures the COMPOSITED
 * mid-fade colour. On /admin/members that read `--muted-foreground` as #7e8585
 * (3.76:1) instead of its real #687171 (4.86:1) and reported a violation that
 * does not exist — the same element measures clean one frame later. Anything
 * reading COLOUR off a freshly-navigated page has to wait for the paint the
 * user actually sees.
 */
async function gotoSettled(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect
    .poll(async () =>
      page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length),
    )
    .toBe(0);
}

test("裁-13: axe-core's own target-size rule is clean on the firm surfaces this train touched", async ({ page }) => {
  // The rule this repo's a11yRules.ts target-size check stands in for, run for
  // real — with layout geometry and with SC 2.5.8's spacing exception, neither
  // of which the class-string gate implements or pretends to.
  await signInTo(page, "/");
  for (const [face, url] of FACES) {
    await gotoSettled(page, url);
    const result = await new AxeBuilder({ page }).withRules(["target-size"]).analyze();
    expect(result.violations, `${face} target-size violations`).toEqual([]);
  }
});

test("裁-13 CONTROL: the target-size rule actually RAN — it is not silently unsupported", async ({ page }) => {
  // A `withRules` run against a rule id axe does not know returns zero
  // violations and zero passes, which is indistinguishable from a clean page.
  // This asserts the rule appears in the RESULT INVENTORY, so the arm above is
  // a measurement rather than an absence.
  await signInTo(page, "/");
  const result = await new AxeBuilder({ page }).withRules(["target-size"]).analyze();
  const seen = [...result.passes, ...result.violations, ...result.incomplete, ...result.inapplicable];
  expect(seen.map((r) => r.id)).toContain("target-size");
});

test("DS-02: one Tab reaches the skip link, and activating it moves focus past the whole sidebar", async ({ page }) => {
  await signInTo(page, "/");
  // A FRESH navigation, and deliberately NO click anywhere first: clicking sets
  // Chrome's sequential-focus navigation starting point to the clicked element,
  // so the "first Tab" would resume from wherever the pointer landed rather
  // than from the top of the document. On a freshly-loaded document the first
  // Tab is genuinely the first focusable element in DOM order, which is the
  // fact this test is about.
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  // Hidden until focused: sr-only clips it to a 1px box; focused, it is a real
  // visible control. Both halves, measured as geometry rather than as classes.
  await expect(skip).toBeVisible();
  expect((await skip.boundingBox())?.width ?? 0).toBeGreaterThan(40);

  await page.keyboard.press("Enter");
  const landed = await page.evaluate(() => document.activeElement?.id ?? "");
  expect(landed).toBe("main-content");

  // THE DISCRIMINATING HALF, and the reason `tabIndex={-1}` is on the anchor:
  // without it the browser scrolls to the id but never moves focus, so the next
  // Tab resumes from the skip link and walks straight back into the sidebar —
  // a bypass that bypasses nothing. Asserted as "the sidebar is BEHIND us"
  // rather than "we are inside #main-content": the home face's content column
  // has no focusable descendant of its own, so on that page the next stop is
  // legitimately the Clara rail, which is also past the nav. Both outcomes are
  // the bypass working; landing back in the <aside> is the failure.
  await page.keyboard.press("Tab");
  const where = await page.evaluate(() => {
    const el = document.activeElement;
    const aside = document.querySelector("aside");
    return {
      inSidebar: Boolean(el && aside?.contains(el)),
      isSkipLink: el instanceof HTMLAnchorElement && el.getAttribute("href") === "#main-content",
    };
  });
  expect(where.inSidebar, "focus fell back into the sidebar — the skip did not move focus").toBe(false);
  expect(where.isSkipLink, "focus never left the skip link").toBe(false);
});

test("DS-01: the dropdown popup drops its movement under prefers-reduced-motion and keeps its fade", async ({ page }) => {
  await signInTo(page, "/admin/members");

  await page.emulateMedia({ reducedMotion: "reduce" });
  // components/admin/member-row-menu.tsx:112 — the only live DropdownMenu in
  // the product ("Actions for {name}", Members.roster.rowMenuLabel).
  await page.getByRole("button", { name: /^Actions for / }).first().click();
  const popup = page.locator("[data-slot=dropdown-menu-content]");
  await expect(popup).toBeVisible();

  const reduced = await popup.evaluate((el) => {
    const s = getComputedStyle(el);
    return { name: s.animationName, duration: s.animationDuration, transform: s.transform };
  });
  // `motion-safe:` compiles to `@media (prefers-reduced-motion: no-preference)`,
  // so under `reduce` the zoom and slide keyframes are simply not applied and
  // the element is left untransformed.
  expect(reduced.transform === "none" || reduced.transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(true);
  // The duration is the token, not a hardcoded 100ms — 160ms is
  // --motion-duration-standard, contract §7's "Popover, dropdown" tier.
  expect(reduced.duration).toBe("0.16s");
});

test("裁-1 / 裁-2 4c: the recut ring and the recut control edge reach the browser as computed style", async ({ page }) => {
  await signInTo(page, "/admin/members");

  // The ring token at 70%: read the resolved custom properties off :root, so a
  // token that never compiled (a typo, a stripped declaration) is caught here
  // and not only in the source-reading unit gate.
  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      alpha: s.getPropertyValue("--focus-ring-alpha").trim(),
      input: s.getPropertyValue("--input").trim(),
      targetMin: s.getPropertyValue("--target-min").trim(),
      ring: s.getPropertyValue("--ring").trim(),
    };
  });
  // Compared as a NUMBER: Chrome serialises the custom property's value as
  // authored-then-normalised and returns ".7", not "0.7". A string compare here
  // would red on a spelling, which is not what this asserts.
  expect(Number(tokens.alpha)).toBe(0.7);
  expect(tokens.input.toLowerCase()).toBe("#8b8981");
  expect(tokens.targetMin).toBe("24px");

  // And the ring actually PAINTS. Reached by keyboard, deliberately: Chrome
  // matches `:focus-visible` on a keyboard-initiated focus, and a programmatic
  // `.focus()` on a <button> does not match it at all — reading box-shadow
  // after `.focus()` returns "none" and would look like the ring was missing.
  const button = page.getByRole("button", { name: /^Actions for / }).first();
  await expect(button).toBeVisible();
  await page.keyboard.press("Tab");
  await button.evaluate((el) => (el as HTMLElement).focus());
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();

  expect(await button.evaluate((el) => el.matches(":focus-visible"))).toBe(true);

  // WAIT FOR THE TRANSITION. buttonVariants transitions box-shadow over
  // --motion-duration-fast (120ms); reading immediately catches the ring
  // part-grown — measured here at 0.27px wide and alpha 0.038, which looks
  // exactly like a ring that was never applied. Poll until the value settles.
  await expect
    .poll(async () => button.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 5000 })
    .toMatch(/0px 0px 0px 2px/);

  const shadow = await button.evaluate((el) => getComputedStyle(el).boxShadow);
  // 裁-64③'s offset: the ground-coloured 2px gap layer, opaque white
  // (--background), sitting between the button's own edge and the halo.
  expect(shadow, "the ring-offset gap layer").toMatch(/rgb\(255,\s*255,\s*255\)\s+0px 0px 0px 2px/);
  // …and the halo outside it, at ring width 3 + offset 2 = 5px. Tailwind v4
  // emits the `/70` modifier as `color-mix(in oklab, …)`, which Chrome resolves
  // to an `oklab(… / 0.7)` computed value — so the alpha is asserted on the
  // colour function the browser actually produced, not on an rgba() spelling
  // this build never emits.
  expect(shadow, "the 70% halo at ring-3 + offset-2").toMatch(/oklab\([^)]*\/\s*0?\.7\s*\)\s+0px 0px 0px 5px/);
});

test("the touched faces stay clean under the full WCAG 2.1 AA scan", async ({ page }) => {
  await signInTo(page, "/");
  for (const [face, url] of FACES) {
    await gotoSettled(page, url);
    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(result.violations, `${face} axe violations`).toEqual([]);
  }
});
