import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * P6-6's 裁-86 browser leg — the identity finish, walked in a real browser
 * against the BUILT app: the Ledger Fold mark on every entry face (R1), the
 * Clara mascot in the docked rail's welcome state (裁-14), §7's reduced-motion
 * arm, and axe over every face touched.
 *
 * WHAT A BROWSER PROVES HERE THAT THE NODE SUITE CANNOT. The node cells assert
 * what the components RENDER; only a browser can say the bytes actually
 * arrived (`naturalWidth`), that the asset is reachable through the proxy's
 * matcher rather than 302'd to /login, that the composited CSS resolves the
 * motion tokens to real values, and that `prefers-reduced-motion` genuinely
 * changes the transition the engine computes.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const LEDGER_FOLD = "/brand/logo/clarabook-ledger-fold-brand-ink-v1.0.png";
const MASCOT = "/brand/clara/clara-quiet-clerk-neutral-v1.0.png";

async function scan(page: Page, face: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, `${face} axe violations`).toEqual([]);
}

/** The measurement that separates "an `<img>` element exists" from "the image
 *  loaded": a broken or 404'd image has `naturalWidth === 0` while still being
 *  a perfectly visible, perfectly present element. */
async function loadedIntrinsicSize(page: Page, src: string): Promise<{ w: number; h: number }> {
  const img = page.locator(`img[src*="${src}"]`).first();
  await expect(img).toBeVisible();
  return img.evaluate((el) => {
    const image = el as HTMLImageElement;
    return { w: image.naturalWidth, h: image.naturalHeight };
  });
}

const ENTRY_FACES: Array<[name: string, path: string, heading: RegExp]> = [
  ["login", "/login", /^Sign in$/],
  ["signup", "/signup", /^Create your account$/],
  ["forgot-password", "/forgot-password", /^Reset your password$/],
  ["confirm", "/auth/confirm", /^Enter your confirmation code$/],
];

for (const [name, path, heading] of ENTRY_FACES) {
  test(`R1: the ${name} face carries the Ledger Fold lockup, and the mark actually loads`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();

    // The mark is served straight out of public/ — `proxy.ts`'s matcher
    // excludes `brand/`, so an unauthenticated visitor gets the PNG and not a
    // redirect to /login. A 302 here would leave naturalWidth at 0.
    const size = await loadedIntrinsicSize(page, LEDGER_FOLD);
    expect(size, `${name}: the Ledger Fold PNG must have decoded at its own intrinsic size`).toEqual({ w: 1024, h: 1024 });

    // The wordmark beside it — real text, so it is the accessible name of the
    // lockup and the mark is free to be decorative.
    await expect(page.getByText("ClaraBook", { exact: true })).toBeVisible();

    // 裁-2 4a: the white card on the identity canvas is still what it sits on.
    await expect(page.locator("main.bg-identity-canvas")).toBeVisible();

    await scan(page, name);
  });
}

test("the mark is decorative in the accessibility tree, not a second product name", async ({ page }) => {
  await page.goto("/login");
  const mark = page.locator(`img[src*="${LEDGER_FOLD}"]`);
  await expect(mark).toHaveAttribute("alt", "");
  await expect(mark).toHaveAttribute("aria-hidden", "true");
  // Discriminating: a screen reader must hear the product name exactly once on
  // this face. `getByText` counts rendered text; the image contributes none.
  await expect(page.getByText("ClaraBook", { exact: true })).toHaveCount(1);
});

test("the mark is fetched eagerly, never deferred below the entry card", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator(`img[src*="${LEDGER_FOLD}"]`)).toHaveAttribute("loading", "eager");
});

test("裁-137: the wordmark is COMPOSITED lowercase, and its text is still ClaraBook", async ({ page }) => {
  // The node cell asserts the class is on the span. This asserts the browser
  // actually applied it — the difference matters, because a class name that
  // Tailwind failed to emit a rule for (a typo, a purge, a renamed utility)
  // would keep that cell green and leave the wordmark title-case on screen.
  await page.goto("/login");
  const wordmark = page.getByText("ClaraBook", { exact: true });
  await expect(wordmark).toBeVisible();

  const transform = await wordmark.evaluate((el) => getComputedStyle(el).textTransform);
  expect(transform, "裁-137's glyph half, measured on the live element").toBe("lowercase");

  // R1's half, and the whole reason a transform was used instead of a second
  // string: the accessible name is unchanged, so nothing that reads the page
  // by text — a screen reader, this matcher, the firm shell's prose — moves.
  await expect(wordmark).toHaveText("ClaraBook");
});

test("§7's welcome motion resolves to real token values, and reduced motion drops the movement", async ({ page }) => {
  // MOTION ON: the composited transition must name both properties at the
  // ratified 220ms. Reading `transitionProperty`/`Duration` off the live
  // element is what makes this a measurement rather than a class-name check —
  // a typo'd token would leave the class present and the duration at 0s.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/login");
  const lockup = page.locator(".enter-welcome").first();
  await expect(lockup).toBeVisible();

  const full = await lockup.evaluate((el) => {
    const s = getComputedStyle(el);
    return { property: s.transitionProperty, duration: s.transitionDuration };
  });
  expect(full.property, "opacity AND translate both transition when motion is allowed").toContain("translate");
  expect(full.property).toContain("opacity");
  expect(full.duration, "§7's rare-welcome tier is 220ms").toContain("0.22s");

  // MOTION REDUCED: the 4px rise is dropped and the fade is KEPT — the token
  // contract's own rule ("reduced motion removes position … opacity remains"),
  // which is why this asserts a SURVIVING opacity transition rather than none.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  const reduced = page.locator(".enter-welcome").first();
  await expect(reduced).toBeVisible();

  const armed = await reduced.evaluate((el) => {
    const s = getComputedStyle(el);
    return { property: s.transitionProperty, duration: s.transitionDuration };
  });
  expect(armed.property, "movement must be gone under reduced motion").not.toContain("translate");
  expect(armed.property, "…and the fade must survive it").toContain("opacity");
  expect(armed.duration).toContain("0.22s");
});

test("nothing on an entry face loops: the mark carries no animation at all", async ({ page }) => {
  await page.goto("/login");
  const animationName = await page
    .locator(`img[src*="${LEDGER_FOLD}"]`)
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName, "§7 bars perpetual animation; the welcome is a one-shot TRANSITION on the block").toBe("none");
});

// ---------------------------------------------------------------------------
// 裁-14 — the mascot, in the one place it is allowed to be
// ---------------------------------------------------------------------------

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Firm navigation" })).toBeVisible();
}

const E2E_THREAD = "eeeeeeee-1111-4111-8111-eeeeeeeeeeee";

/**
 * The rail's whole chat surface, stubbed at the network edge.
 *
 * WHY NOT USE THE SHARED HARNESS FIXTURE. `serve-built.mjs` answers
 * `GET /api/chat/sessions` with three sessions owned by ONE fixed subject and
 * always returns exactly one message per thread — so this persona resolves no
 * own session, falls through to `createSession`, and hits a route the mock does
 * not implement (`POST /api/chat/sessions` → 404). Stubbing here rather than
 * teaching the shared server a fourth persona keeps this walk self-contained
 * and changes nothing for the four other specs sharing that server.
 *
 * `transcript: "never"` leaves the messages read in flight for the life of the
 * test — the only way to hold the rail in its loading state on purpose.
 */
async function stubChat(page: Page, transcript: unknown[] | "never"): Promise<void> {
  await page.route("**/api/chat/sessions", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session_id: E2E_THREAD }) })
      : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessions: [] }) }),
  );
  // Registered second, so it wins for the `/messages` sub-path (Playwright
  // matches routes in reverse registration order).
  await page.route("**/api/chat/sessions/*/messages", (route) => {
    if (transcript === "never") return;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: transcript }) });
  });
}

test("裁-14: an empty conversation shows the mascot welcome in the docked rail", async ({ page }) => {
  await stubChat(page, []);
  await signIn(page);

  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();
  await expect(rail.getByText("I'm Clara.")).toBeVisible();

  const size = await loadedIntrinsicSize(page, MASCOT);
  expect(size, "the mascot PNG must have decoded at its own intrinsic size").toEqual({ w: 1001, h: 1357 });

  // Decorative beside a literal Clara label, exactly as the state/a11y
  // contract requires — and the rail as a whole still passes axe.
  await expect(page.locator(`img[src*="${MASCOT}"]`)).toHaveAttribute("alt", "");
  await scan(page, "firm home with the Clara welcome");
});

test("裁-14, the negative: a conversation WITH messages shows no mascot", async ({ page }) => {
  // The discriminating counterpart. Without it, the cell above proves only
  // that the mascot CAN render, never that it is confined to the empty state —
  // the difference between the two runs is one array element.
  await stubChat(page, [
    { id: "m1", role: "assistant", parts: [{ type: "text", text: "The May close is open." }], turn_key: null, task_id: null, seq: 1, created_at: "2026-09-02T03:00:00.000Z" },
  ]);
  await signIn(page);

  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();
  await expect(rail.getByText("The May close is open.")).toBeVisible();
  await expect(page.locator(`img[src*="${MASCOT}"]`)).toHaveCount(0);
  await expect(rail.getByText("I'm Clara.")).toHaveCount(0);
});

test("裁-14: the mascot never stands in for a loading state", async ({ page }) => {
  // The transcript read is held open, so the rail sits in exactly the state
  // 裁-14 forbids the mascot from occupying, and the browser is asked what is
  // actually on screen there.
  await stubChat(page, "never");
  await signIn(page);

  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();
  await expect(rail.getByText("Loading the conversation…")).toBeVisible();
  await expect(page.locator(`img[src*="${MASCOT}"]`)).toHaveCount(0);
});

test("R1: the firm shell names the platform ClaraBook, and the mascot is not on it", async ({ page }) => {
  await stubChat(page, []);
  await signIn(page);
  await expect(page.getByText("ClaraBook", { exact: true }).first()).toBeVisible();
  // FD-036/FD-037: the mascot is the subordinate AGENT persona and never the
  // platform's own chrome. The sidebar is the platform's chrome.
  await expect(page.locator("aside.bg-sidebar").locator("img")).toHaveCount(0);
});
