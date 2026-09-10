import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

// #626 (refresh spec #612, journey D1) — `/settings/account`'s real content.
// Mocks are installed with `page.route`, per firm-navigation-walk.spec.ts's own
// convention ("the shared mock is a merge surface every lane in this sprint
// touches, and a spec that carries its own rows cannot collide with one") —
// e2e/serve-built.mjs carries only a GENERIC default `get_my_preferences`
// answer (used by every OTHER spec's now-global motion-preference read), which
// Playwright's last-registered-route-wins order lets every test below
// override for its own scenario.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function signIn(page: Page, email = "owner@example.test"): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

type Envelope = { version: number; interface: Record<string, string>; notifications: Record<string, never>; updated_at: string | null };

function envelope(version: number, iface: Record<string, string> = {}): Envelope {
  return { version, interface: iface, notifications: {}, updated_at: version === 0 ? null : "2026-09-10T00:00:00.000Z" };
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** A stateful `get_my_preferences` + `save_my_preferences` pair — the save
 *  route actually applies the shallow-merge patch semantics 0179 itself
 *  implements, so "reload persists" is proven against a fixture that behaves
 *  like the real door, not one that merely echoes a canned response. */
async function installStatefulPreferences(page: Page, initial: Envelope): Promise<{ current(): Envelope }> {
  let state = initial;
  await page.route("**/e2e-supabase/rest/v1/rpc/get_my_preferences", (route) => fulfillJson(route, 200, state));
  await page.route("**/e2e-supabase/rest/v1/rpc/save_my_preferences", async (route) => {
    const body = route.request().postDataJSON() as { p_expected_version: number; p_patch: { interface?: Record<string, string> } };
    if (body.p_expected_version !== state.version) {
      await fulfillJson(route, 400, {
        code: "CLR06",
        message: "preferences changed elsewhere",
        details: JSON.stringify({ reason: "stale_version" }),
      });
      return;
    }
    state = envelope(state.version + 1, { ...state.interface, ...(body.p_patch.interface ?? {}) });
    await fulfillJson(route, 200, state);
  });
  return { current: () => state };
}

const motionRadio = (page: Page, label: RegExp) => page.getByRole("radio", { name: label });
const saveButton = (page: Page) => page.getByRole("button", { name: "Save changes", exact: true });

test("loaded -> dirty -> save -> reload persists", async ({ page }) => {
  await installStatefulPreferences(page, envelope(0));
  await signIn(page);
  await page.goto("/settings/account");

  await expect(page.getByRole("heading", { name: "Interface", level: 2 })).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();

  await motionRadio(page, /Always reduce motion/).click();
  await expect(page.getByText("Unsaved")).toBeVisible();
  await expect(saveButton(page)).toBeEnabled();

  await saveButton(page).click();
  await expect(page.getByText("Preferences saved")).toBeVisible();
  await expect(page.getByText("Unsaved")).toHaveCount(0);
  await expect(saveButton(page)).toBeDisabled();

  // RELOAD PERSISTENCE — a fresh read must show the value that was actually saved.
  await page.reload();
  await expect(motionRadio(page, /Always reduce motion/)).toBeChecked();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/account, loaded and saved").toEqual([]);
});

test("dirty marker and Reset restore the authoritative value without saving", async ({ page }) => {
  await installStatefulPreferences(page, envelope(0));
  await signIn(page);
  await page.goto("/settings/account");

  await expect(motionRadio(page, /Match my system setting/)).toBeChecked();
  await motionRadio(page, /Always reduce motion/).click();
  await expect(page.getByText("Unsaved")).toBeVisible();

  await page.getByRole("button", { name: "Reset", exact: true }).first().click();
  await expect(motionRadio(page, /Match my system setting/)).toBeChecked();
  await expect(page.getByText("Unsaved")).toHaveCount(0);
  await expect(saveButton(page)).toBeDisabled();
});

test("save failure (CLR10) keeps the dirty field and focuses it", async ({ page }) => {
  await page.route("**/e2e-supabase/rest/v1/rpc/get_my_preferences", (route) => fulfillJson(route, 200, envelope(0)));
  await page.route("**/e2e-supabase/rest/v1/rpc/save_my_preferences", (route) =>
    fulfillJson(route, 400, {
      code: "CLR10",
      message: "unsupported value for interface.motion",
      details: JSON.stringify({ reason: "interface.motion" }),
    }));

  await signIn(page);
  await page.goto("/settings/account");
  await motionRadio(page, /Always reduce motion/).click();
  await saveButton(page).click();

  await expect(page.getByText("Couldn't save")).toBeVisible();
  // DIRTY FIELDS PRESERVED — the failed save must not revert the person's input.
  await expect(motionRadio(page, /Always reduce motion/)).toBeChecked();
  await expect(page.getByText("Unsaved")).toBeVisible();
  // FIRST-INVALID-FOCUS.
  await expect(motionRadio(page, /Always reduce motion/)).toBeFocused();
});

test("concurrent change (CLR06) shows 'changed elsewhere' and Reload-and-keep-my-edits preserves the draft", async ({ page }) => {
  let saveAttempts = 0;
  await page.route("**/e2e-supabase/rest/v1/rpc/get_my_preferences", async (route) => {
    // The SECOND read (the person's own "Reload and keep my edits" click) sees
    // the version another session already advanced to.
    await fulfillJson(route, 200, saveAttempts === 0 ? envelope(0) : envelope(3, { motion: "reduced" }));
  });
  await page.route("**/e2e-supabase/rest/v1/rpc/save_my_preferences", async (route) => {
    saveAttempts += 1;
    await fulfillJson(route, 400, {
      code: "CLR06",
      message: "preferences changed elsewhere",
      details: JSON.stringify({ reason: "stale_version" }),
    });
  });

  await signIn(page);
  await page.goto("/settings/account");
  await page.getByRole("radio", { name: /^Collapsed$/ }).click();
  await saveButton(page).click();

  await expect(page.getByText("Changed elsewhere")).toBeVisible();
  await page.getByRole("button", { name: "Reload and keep my edits" }).click();
  await expect(page.getByText("Changed elsewhere")).toHaveCount(0);
  // THE DRAFT SURVIVES the reload — the person's unsaved choice is still selected,
  // even though the authoritative base underneath it just moved to version 3.
  await expect(page.getByRole("radio", { name: /^Collapsed$/ })).toBeChecked();
  await expect(page.getByText("Unsaved")).toBeVisible();
});

test("denied: a signed-out read renders the honest denied state, never a crash", async ({ page }) => {
  await page.route("**/e2e-supabase/rest/v1/rpc/get_my_preferences", (route) =>
    fulfillJson(route, 401, { code: "PGRST301", message: "JWT expired" }));

  await signIn(page);
  await page.goto("/settings/account");
  await expect(page.getByText("Signed out")).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/account, denied").toEqual([]);
});

test("notifications section is honest about having no supported control yet", async ({ page }) => {
  await installStatefulPreferences(page, envelope(0));
  await signIn(page);
  await page.goto("/settings/account");
  await expect(page.getByRole("heading", { name: "Notifications", level: 2 })).toBeVisible();
  await expect(page.getByText("Not configured yet")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("a saved 'always reduce motion' sets data-motion=reduced regardless of the OS setting", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await installStatefulPreferences(page, envelope(1, { motion: "reduced" }));
  await signIn(page);
  await page.goto("/settings/account");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/account with reduced motion applied").toEqual([]);
});

test("OS-level reduced motion alone still applies with no saved preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installStatefulPreferences(page, envelope(0));
  await signIn(page);
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
});

test("keyboard-complete: reach the motion field, choose an option and save without a mouse", async ({ page }) => {
  await installStatefulPreferences(page, envelope(0));
  await signIn(page);
  await page.goto("/settings/account");

  await motionRadio(page, /Match my system setting/).focus();
  await page.keyboard.press("ArrowDown"); // native radio-group roving selection
  await expect(motionRadio(page, /Always reduce motion/)).toBeChecked();
  await expect(page.getByText("Unsaved")).toBeVisible();

  // Tab forward to the Save button and activate it with the keyboard alone. Selecting "Always
  // reduce motion" makes the motion field dirty, so its own per-field Reset link (and then the
  // sidebarDefault field's own radio group) are legitimate, keyboard-reachable stops BEFORE Save
  // — a fixed Tab count here would be exactly as brittle as the layout it is pinning, so this
  // walks forward (bounded) until Save itself is the focused element, proving reachability
  // without asserting how many stops the path happens to have today.
  for (let i = 0; i < 8 && !(await saveButton(page).evaluate((el) => el === document.activeElement)); i += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(saveButton(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Preferences saved")).toBeVisible();
});

test("narrow settings navigation (320px) stays usable and axe-clean", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await installStatefulPreferences(page, envelope(0));
  await signIn(page);
  await page.goto("/settings/account");

  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
  await expect(saveButton(page)).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, "no page-wide horizontal scroll at 320px").toBeLessThanOrEqual(clientWidth + 1);

  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(result.violations, "/settings/account at 320px").toEqual([]);
});

test("200% zoom (a halved 1280x720 viewport) keeps the primary action reachable", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await installStatefulPreferences(page, envelope(0));
  await signIn(page);
  await page.goto("/settings/account");
  await expect(saveButton(page)).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, "no page-wide horizontal scroll at 200% zoom").toBeLessThanOrEqual(clientWidth + 1);
});

test("deep link and Back: /settings/account is directly reachable and Back returns to the hub", async ({ page }) => {
  await installStatefulPreferences(page, envelope(0));
  await signIn(page);
  await page.goto("/settings");
  await page.goto("/settings/account"); // a fresh direct navigation, not a click-through
  await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/settings$/);
});
