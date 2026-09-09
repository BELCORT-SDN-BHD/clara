import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { DOCS } from "./documents-viewer-mock.mjs";
import { ensureRealFocus } from "./helpers";

/**
 * #614 — THE UNIFIED SHELL'S OWN WALK (裁-86).
 *
 * Everything else in `e2e/` was written against the pre-#614 firm sidebar, the
 * "Menu" drawer and the client workspace's nine-tab strip; those specs were
 * updated in place to speak the new shell's vocabulary (`nav[aria-label="Main"]`,
 * "Toggle navigation", the sidebar's client/firm groups, `/settings/*`,
 * `/work`). This file is the NEW coverage #614 itself asks for — the journeys
 * that did not exist before this train:
 *
 *   A7  the scope switcher — same destination kind, a different client,
 *       reached and operated entirely by keyboard, with the isolation
 *       guarantee `components/client-scope-provider.tsx` and
 *       `lib/client-scope.ts` promise never silently regressing.
 *   D5  the legacy-route redirect matrix, a scope mismatch mid-session
 *       (a client that stops being visible) rendering the honest not-found
 *       state INSIDE the shell rather than a redirect to Home, and the
 *       Work/Activity split (the live queue moved, the audit trail stayed).
 *   D6  the client-not-found boundary itself, and the retired entries
 *       (autodraft's relabel, the vendor-bindings banner, the reports page's
 *       "Internal processing" section) that came along with the same train.
 *   AC6 acceptance criterion 6's own two follow-up cells, closing the gaps a
 *       later spec review found: a client that goes invisible MID-SESSION
 *       (not just a bogus id from the first request) rendering the same
 *       not-found boundary, driven by a real toggle rather than a
 *       `page.route` that cannot reach the server component making the read;
 *       and the Clara rail overlay plus the mobile nav Sheet open TOGETHER at
 *       640 CSS px, proving one focus trap and one Escape per layer.
 *
 * Fixtures: `serve-built.mjs`'s shared owner@example.test / bookkeeper@example.test
 * personas and its two clients, Rome Properties (CLIENT_A) and Bee Creative
 * Solution (CLIENT_B), firm "E2E Accounting". Every per-test need beyond that
 * is met with `page.route`, the idiom every other spec in this directory
 * already uses for a fixture too small to earn a shared-server relation — the
 * ONE exception is AC6's live-permission-loss cell, which needs a real
 * same-process toggle (`POST /e2e-control/clients/<id>/visibility` in
 * `serve-built.mjs`) because the read it drives happens on the SERVER, not in
 * the browser tab `page.route` can see.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const CLIENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WIDE = { width: 1280, height: 720 };
const NARROW = { width: 640, height: 720 };
const NARROWEST = { width: 320, height: 720 };

async function signInTo(page: Page, destination: string, email = "owner@example.test"): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Clara-e2e-password-1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
}

/** A minimal, honest `list_review_queue` envelope, one row, distinguishable
 *  by its client id and question text — the same shape
 *  `firm-navigation-walk.spec.ts`'s own `reviewQueueEnvelope` uses. */
function reviewQueueEnvelope(clientId: string, questionText: string) {
  return {
    watermark: "w-shell-migration",
    counts: {
      ready: 0, needs_review: 0, needs_you: 1, open_drafts: 0,
      open_questions: 1, open_tasks: 0, compliance_watches: 0, lint_findings: 0,
    },
    sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
    rows: [{
      row_kind: "open_question", section: "needs_you", client_id: clientId, counterparty_id: null,
      filing_id: null, entry_id: null, question_id: "22222222-2222-4222-8222-222222222222",
      task_id: null, document_id: null, lane: "needs_you", auto: true, rule_backed: true,
      high_stakes: false, aged_since: "2026-09-01T00:00:00.000Z", amount_cents: null, period: null,
      question_text: questionText,
      created_at: "2026-09-01T00:00:00.000Z", id: "22222222-2222-4222-8222-222222222222",
      coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null,
      advance_id: null, client_name: null, batch_ids: null, open_proposal_count: null,
    }],
    next_cursor: null,
  };
}

const EMPTY_QUEUE = {
  watermark: "w-empty",
  counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [],
  next_cursor: null,
};

function jsonRoute(body: unknown) {
  return (route: import("@playwright/test").Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

/** Focus `[data-scope-switcher]`, open it with Enter, wait for the target
 *  client's row to be in the DOM (the register loads asynchronously on
 *  open), then walk it by ArrowDown and Enter to select it — the sequence
 *  A7 asks for, keyboard-only throughout.
 *
 *  Measured, not assumed, how many ArrowDown presses that takes: Base UI's
 *  Menu auto-highlights the FIRST item ("Firm home") on a keyboard-driven
 *  open, but `serve-built.mjs`'s own `/rest/v1/clients` handler does not
 *  apply `loadClientRegister`'s `order=name.asc` at all — it returns the
 *  fixture's `clients` array in DECLARATION order (Rome Properties, then Bee
 *  Creative Solution), not alphabetically. So the row order is fixture order,
 *  not name order, and this walks ArrowDown until the target row is actually
 *  highlighted rather than hard-coding a press count that only happens to be
 *  right for one direction of switch. */
async function switchClientByKeyboard(page: Page, toClientName: string): Promise<void> {
  const trigger = page.locator("[data-scope-switcher]");
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const targetRow = page.getByRole("menuitem", { name: toClientName });
  await expect(targetRow).toBeVisible();
  for (let i = 0; i < 8; i++) {
    const highlighted = await targetRow.evaluate((el) => el.getAttribute("data-highlighted") !== null);
    if (highlighted) break;
    await page.keyboard.press("ArrowDown");
  }
  await expect(targetRow).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("Enter");
}

// ---------------------------------------------------------------------------
// D5 — the legacy-route redirect matrix. lib/navigation/legacy-routes.ts's
// own LEGACY_ROUTES table, walked row for row: the old address lands on the
// new one, the page renders, and the back button returns to whatever was on
// screen before the old link was followed (never a redirect loop).
// ---------------------------------------------------------------------------

const REDIRECT_ROWS: readonly [string, string, string][] = [
  ["/needs-you", "/work?view=needs-you", "Work"],
  ["/admin", "/settings", "Settings"],
  ["/admin/members", "/settings/members", "Members"],
  ["/admin/settings", "/settings/firm", "Firm settings"],
  ["/admin/compliance", "/settings/compliance", "Compliance register"],
  ["/admin/vendor-bindings", "/settings/vendor-bindings", "Vendor identity bindings"],
  ["/admin/registrations", "/settings/registrations", "Firm registrations"],
];

test.describe("D5: the legacy /admin and /needs-you addresses redirect to their new homes", () => {
  for (const [oldPath, newPath, heading] of REDIRECT_ROWS) {
    test(`${oldPath} -> ${newPath}`, async ({ page }) => {
      await signInTo(page, "/");
      const escapedNew = newPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await page.goto(oldPath);
      await expect(page).toHaveURL(new RegExp(`${escapedNew}$`));
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      // BACK returns to the page visited BEFORE the old link, not to the old
      // link itself — a 307 issued server-side never adds a second history
      // entry for the intermediate address, so this also proves no redirect
      // loop was introduced.
      await page.goBack();
      await expect(page).toHaveURL(/\/$/);
    });
  }

  test("a query string passes through the redirect", async ({ page }) => {
    await signInTo(page, "/");
    await page.goto("/admin/members?x=1");
    await expect(page).toHaveURL(/\/settings\/members\?x=1$/);
    await expect(page.getByRole("heading", { name: "Members", level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });
});

// ---------------------------------------------------------------------------
// Identity at every width — the breadcrumb's scope crumb is one of the two
// crumbs `components/app-shell/app-breadcrumb.tsx` NEVER collapses (the other
// is the current page), so it is the one identity surface guaranteed to be
// on screen regardless of whether the sidebar is docked or a closed sheet.
// ---------------------------------------------------------------------------

test.describe("identity survives every width on /clients/A/journals", () => {
  for (const [label, size] of [["1280", WIDE], ["640", NARROW], ["320", NARROWEST]] as const) {
    test(`at ${label}px the client name and the current page stay in the breadcrumb`, async ({ page }) => {
      await page.setViewportSize(size);
      await signInTo(page, `/clients/${CLIENT_A}/journals`);
      const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(breadcrumb.getByText("Rome Properties")).toBeVisible();
      await expect(page.locator('[data-slot="breadcrumb-page"]')).toHaveText("Journals");

      if (label === "320") {
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(
          overflow.scrollWidth,
          `320px: the document scrolls sideways (${overflow.scrollWidth} > ${overflow.clientWidth})`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
        const workbench = await page.locator("[data-firm-workbench]").boundingBox();
        expect(workbench, "320px: no workbench column").not.toBeNull();
        expect(
          workbench?.width ?? 0,
          `320px: the workbench is ${workbench?.width}px — below the 288 CSS px floor (320 - 32 PageShell padding, sidebar a closed sheet)`,
        ).toBeGreaterThanOrEqual(288);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// A7 — the scope switcher.
// ---------------------------------------------------------------------------

test("A7: the scope switcher moves the SAME destination kind to another client, by keyboard", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await signInTo(page, `/clients/${CLIENT_A}/registers?tab=fixedAssets`);
  await ensureRealFocus(page);

  await switchClientByKeyboard(page, "Bee Creative Solution");

  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_B}/registers\\?tab=fixedAssets$`));
  const mainNav = page.getByRole("navigation", { name: "Main" });
  await expect(mainNav.getByText("Bee Creative Solution", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Bee Creative Solution")).toBeVisible();
  await expect(mainNav.getByRole("link", { name: "Assets", exact: true })).toHaveAttribute("aria-current", "page");
  // Exactly one current destination in the WHOLE nav — the firm group's
  // Clients row must not also claim to be current while a client is open.
  await expect(mainNav.locator('[aria-current="page"]')).toHaveCount(1);

  // Focus is inside the new page or back on the switcher — never dumped to
  // <body>, which would strand a keyboard user after the navigation.
  const focus = await page.evaluate(() => ({
    isBody: document.activeElement === document.body || document.activeElement === null,
  }));
  expect(focus.isBody, "focus fell back to <body> after the scope switch").toBe(false);

  // BACK returns to A, on the SAME tab, and the label reads "Rome Properties" again.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_A}/registers\\?tab=fixedAssets$`));
  await expect(mainNav.getByText("Rome Properties", { exact: true })).toBeVisible();
});

test("A7 isolation: a client-A response released AFTER the switch never paints under client B", async ({ page }) => {
  // `lib/client-scope.ts`'s own claim: ClientScopeProvider unmounts A's whole
  // subtree on the switch, so even a response that resolves LATE for A must
  // never reach the screen. Proven here as a real network race rather than
  // inferred from source: A's read is held open, the switch happens while it
  // is still pending, and only THEN is it released.
  let releaseA: (() => void) | undefined;
  const gateA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });

  await page.route("**/e2e-supabase/rest/v1/rpc/list_review_queue", async (route) => {
    const body = route.request().postDataJSON() as { p_scope?: { client_id?: string } } | null;
    const clientId = body?.p_scope?.client_id;
    if (clientId === CLIENT_A) {
      await gateA;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(reviewQueueEnvelope(CLIENT_A, "ISOLATION MARKER — CLIENT A ONLY")),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(reviewQueueEnvelope(CLIENT_B, "ISOLATION MARKER — CLIENT B ONLY")),
    });
  });

  await signInTo(page, `/clients/${CLIENT_A}/work`);
  await ensureRealFocus(page);
  // A's read is now hung on `gateA` — the client's own subtree is still
  // waiting on it when the switch below happens.
  await switchClientByKeyboard(page, "Bee Creative Solution");

  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_B}/work$`));
  await expect(page.locator("[data-client-scope]")).toHaveAttribute("data-client-scope", CLIENT_B);
  await expect(page.getByText("ISOLATION MARKER — CLIENT B ONLY")).toBeVisible();

  // NOW release A's held response.
  releaseA?.();
  // There is no positive event to wait on here — the claim under test is an
  // ABSENCE over time, so this gives the released promise a real window to
  // reach a still-mounted component before asserting nothing changed.
  await page.waitForTimeout(500);
  await expect(page.getByText("ISOLATION MARKER — CLIENT A ONLY")).toHaveCount(0);
  await expect(page.locator("[data-client-scope]")).toHaveAttribute("data-client-scope", CLIENT_B);
});

// ---------------------------------------------------------------------------
// Mobile sheet, keyboard-only.
// ---------------------------------------------------------------------------

test("mobile sheet: skip link then the toggle is the tab order, and it opens/closes by keyboard", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await signInTo(page, `/clients/${CLIENT_A}`);
  await ensureRealFocus(page);

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();

  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await page.keyboard.press("Tab");
  await expect(toggle).toBeFocused();

  const toggleNode = page.locator("[data-firm-drawer-toggle]");
  await expect(toggleNode).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");

  const panel = page.locator("[data-slot=sheet-content]");
  await expect(panel).toBeVisible();
  await expect(toggleNode).toHaveAttribute("aria-expanded", "true");
  expect(
    await page.evaluate(() => {
      const popup = document.querySelector("[data-slot=sheet-content]");
      return Boolean(popup && document.activeElement && popup.contains(document.activeElement));
    }),
    "focus never entered the sheet",
  ).toBe(true);

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(toggleNode).toHaveAttribute("aria-expanded", "false");

  // Clicking a link inside the sheet navigates AND closes it — it must never
  // sit over the page it just opened.
  await toggle.click();
  await expect(panel).toBeVisible();
  await panel.getByRole("link", { name: "Clients", exact: true }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.locator("[data-slot=sheet-content]")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// The Accounting group.
// ---------------------------------------------------------------------------

test("Accounting group: open under it, closed elsewhere, opens by keyboard, Tax carries Beta, the index lists all eight", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await signInTo(page, `/clients/${CLIENT_A}/journals`);
  const mainNav = page.getByRole("navigation", { name: "Main" });

  await expect(mainNav.getByRole("link", { name: "Journals", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(mainNav.getByRole("link", { name: "Bank", exact: true })).toBeVisible();

  await page.goto(`/clients/${CLIENT_A}/documents`);
  // Closed elsewhere: the sub-list is removed from the accessibility tree.
  await expect(mainNav.getByRole("link", { name: "Bank", exact: true })).toHaveCount(0);
  const chevron = mainNav.getByRole("button", { name: "Toggle Accounting" });
  await expect(chevron).toHaveAttribute("aria-expanded", "false");

  await chevron.focus();
  await page.keyboard.press("Enter");
  await expect(chevron).toHaveAttribute("aria-expanded", "true");
  const taxLink = mainNav.getByRole("link", { name: "Tax", exact: true });
  await expect(taxLink).toBeVisible();
  await expect(mainNav.getByText("Beta")).toBeVisible();

  await mainNav.getByRole("link", { name: "Accounting", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_A}/accounting$`));
  const hub = page.getByRole("navigation", { name: "Accounting surfaces" });
  // Each card's `<Link>` wraps its whole CardTitle AND CardDescription
  // (`components/accounting/accounting-hub.tsx`, "the same idiom as the
  // settings hub"), so the LINK's own accessible name is both concatenated.
  // The card's `<h2>` carries only the label itself, so that is the
  // unambiguous thing to assert on.
  for (const label of [
    "Journals", "Bank", "Receivables & payables", "Assets", "Plans", "Accounts", "Close", "Tax",
  ]) {
    await expect(hub.getByRole("heading", { name: label, exact: true, level: 2 })).toBeVisible();
  }
});

// ---------------------------------------------------------------------------
// Reduced motion.
// ---------------------------------------------------------------------------

test("reduced motion: the sidebar toggle and the scope menu run no animation", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInTo(page, `/clients/${CLIENT_A}`);

  // MOVEMENT only. app/globals.css's motion law is "drop movement, keep the
  // fade" under reduced motion, so a running opacity-only transition (a row
  // arriving through `enter-content` while the async reads land) is the
  // contract working, not a violation. What must be zero is any running
  // animation that moves or resizes something: width/height, offsets,
  // margins, transforms/translate, or any keyframe animation.
  // Returns DESCRIPTORS of the offending animations rather than a bare count,
  // so a failure names the element and the property that moved.
  const runningAnimations = () =>
    page.evaluate(() =>
      document.getAnimations().filter((a) => {
        if (a.playState !== "running") return false;
        const prop = (a as unknown as { transitionProperty?: string }).transitionProperty;
        if (prop !== undefined) {
          return !/^(opacity|color|background-color|border-color|fill|stroke)$/.test(prop);
        }
        // A KEYFRAME animation. The overlay primitives (dropdown menu, select,
        // tooltip) enter through tw-animate's `animate-in`, whose `enter`
        // keyframes read the movement from `--tw-enter-{scale,translate-*,
        // rotate}` custom properties that the `zoom-*`/`slide-in-*` utilities
        // set — and those utilities are behind `motion-safe:` in every house
        // primitive. `animate-in` itself pins every movement variable to its
        // IDENTITY (scale 1, translate 0, rotate 0; measured on the open menu),
        // so under reduce the keyframes vary opacity ONLY — the fade the
        // contract keeps. A keyframe animation counts as MOVEMENT when one of
        // those variables holds a non-identity value (a primitive whose
        // zoom/slide is not gated) or when it is not tw-animate's enter/exit.
        const el = (a as unknown as { effect?: { target?: Element | null } }).effect?.target ?? null;
        if (!(el instanceof Element)) return true;
        const name = (a as unknown as { animationName?: string }).animationName ?? "";
        if (!/^(enter|exit)$/.test(name)) return true;
        const cs = getComputedStyle(el);
        const identity = (v: string, value: string) =>
          value === "" || value === "initial" || value === "none" ||
          (/scale$/.test(v) ? /^1(.0+)?$/.test(value) : /^0(.0+)?(px|deg|%|rem|em)?$/.test(value));
        const moves = [
          "--tw-enter-scale", "--tw-enter-translate-x", "--tw-enter-translate-y", "--tw-enter-rotate",
          "--tw-exit-scale", "--tw-exit-translate-x", "--tw-exit-translate-y", "--tw-exit-rotate",
        ].some((v) => !identity(v, cs.getPropertyValue(v).trim()));
        return moves;
      }).map((a) => {
        const el = (a as unknown as { effect?: { target?: Element | null } }).effect?.target ?? null;
        const attrs = el instanceof Element
          ? `${el.tagName.toLowerCase()}[data-slot=${el.getAttribute("data-slot")}][data-sidebar=${el.getAttribute("data-sidebar")}][role=${el.getAttribute("role")}] class="${(el.getAttribute("class") ?? "").slice(0, 120)}"`
          : "(no target)";
        const prop = (a as unknown as { transitionProperty?: string }).transitionProperty;
        const name = (a as unknown as { animationName?: string }).animationName;
        const vars = el instanceof Element
          ? ["--tw-enter-scale", "--tw-enter-translate-x", "--tw-enter-translate-y", "--tw-enter-rotate", "--tw-exit-scale", "--tw-exit-translate-x", "--tw-exit-translate-y", "--tw-exit-rotate"]
              .map((v) => `${v}=${JSON.stringify(getComputedStyle(el).getPropertyValue(v))}`)
              .join(",")
          : "";
        return `${a.constructor.name} ${prop ?? name ?? "?"} on ${attrs} {${vars}}`;
      }),
    );

  await ensureRealFocus(page);
  await page.keyboard.press("Control+b");
  const afterToggle = await runningAnimations();
  expect(
    afterToggle,
    `Ctrl+B's sidebar toggle started a running MOVEMENT animation under reduced motion: ${afterToggle.join("; ")}`,
  ).toEqual([]);
  // `components/ui/sidebar.tsx`'s gap/container carry `motion-panel` (an
  // UNCONDITIONAL `transition-duration`, per app/globals.css's own note that
  // durations are not globally zeroed), an unconditional property list, and
  // `motion-reduce:transition-none` — so under reduce the computed
  // `transitionProperty` is `none`. (The first cut used a `motion-safe:`-only
  // property list, which left the browser default `all` in force under
  // reduce, and this cell caught the gap and the container travelling.) A
  // computed `transitionDuration` of "0s" and a `transitionProperty` that does
  // not name `width`/`left`/`right` are the two shapes that both count as
  // "no transition" for this claim.
  const gap = page.locator('[data-slot="sidebar-gap"]');
  const gapStyle = await gap.evaluate((el) => {
    const s = getComputedStyle(el);
    return { duration: s.transitionDuration, property: s.transitionProperty };
  });
  const gapHasNoTransition =
    gapStyle.duration === "0s" || !/width|left|right/.test(gapStyle.property);
  expect(
    gapHasNoTransition,
    `the sidebar gap's transition is { duration: ${gapStyle.duration}, property: ${gapStyle.property} } under reduced motion — expected 0s duration or a property list without width/left/right`,
  ).toBe(true);

  // Restore the sidebar before opening the scope menu, so the menu's own
  // trigger is on screen regardless of collapse state.
  await page.keyboard.press("Control+b");

  const trigger = page.locator("[data-scope-switcher]");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  const afterMenu = await runningAnimations();
  expect(
    afterMenu,
    `opening the scope menu started a running MOVEMENT animation under reduced motion: ${afterMenu.join("; ")}`,
  ).toEqual([]);
  await page.keyboard.press("Escape");
});

// ---------------------------------------------------------------------------
// D5/D6 — live permission loss / scope mismatch mid-session.
// ---------------------------------------------------------------------------

test("D6: an invisible/nonexistent client renders the not-found state INSIDE the shell, never a redirect to Home", async ({ page }) => {
  // A BOGUS ID, NOT A LIVE TOGGLE — kept beside "AC6: live permission loss"
  // below rather than folded into it, because the two prove different things.
  // `loadClientById` runs inside `app/(firm)/clients/[clientId]/layout.tsx`,
  // an async SERVER COMPONENT — its fetch to `.../e2e-supabase/rest/v1/clients`
  // is issued by the Next.js SERVER PROCESS during SSR/RSC, never by the
  // browser tab, so `page.route` cannot reach it and cannot simulate a client
  // that STOPS being visible mid-session. This cell only needs the SAME
  // `notFound()` boundary (`app/(firm)/clients/not-found.tsx`) reached the
  // honest way every persona already can: a client id absent from the
  // register from the very first request. The cell below drives the real
  // toggle `serve-built.mjs` now carries for exactly the case this one
  // cannot reach.
  await signInTo(page, "/");
  await page.goto("/clients/not-a-client");
  // URL is STILL /clients/not-a-client — D6's whole point is an explicit
  // state at the address the human actually asked for, never a silent bounce
  // to Home.
  await expect(page).toHaveURL(/\/clients\/not-a-client$/);
  await expect(page.getByRole("heading", { name: "This client isn't visible to your firm", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  const waysBack = page.getByRole("navigation", { name: "Ways back" });
  await expect(waysBack.getByRole("link", { name: "Clients", exact: true })).toBeVisible();
  await expect(waysBack.getByRole("link", { name: "Firm home", exact: true })).toBeVisible();
});

test.describe("AC6: live permission loss", () => {
  // `workers: 1`, one shared mock process — a toggle left set would poison
  // every spec that runs after this one, including the cell above. Reset
  // unconditionally regardless of how the test finishes, on top of the
  // test's own restore below (defence in depth, cheap here).
  test.afterEach(async ({ page }) => {
    await page.request.post("/e2e-control/reset");
  });

  test("a client that stops being visible mid-session renders the not-found state on the next real request, and the switcher stops offering it", async ({ page }) => {
    await signInTo(page, `/clients/${CLIENT_A}/journals`);
    const mainNav = page.getByRole("navigation", { name: "Main" });
    await expect(mainNav.getByText("Rome Properties", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Rome Properties")).toBeVisible();

    const hide = await page.request.post(`/e2e-control/clients/${CLIENT_A}/visibility`, { data: { visible: false } });
    expect(hide.ok(), "the e2e visibility toggle did not answer").toBeTruthy();

    // A FULL NAVIGATION, NOT A SIDEBAR `<Link>` CLICK — measured, not assumed.
    // `[clientId]/layout.tsx` is a SHARED segment between `/journals` and
    // `/documents`; Next's own Partial Rendering keeps a shared layout's
    // already-rendered output alive across a sibling navigation and does not
    // re-invoke it, so a plain click on "Documents" here never re-issues
    // `loadClientById` at all — the mock's own request log stayed silent for
    // it across every run this was measured against, prefetch blocked or not.
    // A real round trip to the new address is what "the server re-reads the
    // client" actually needs, and it is still the same in-session browser —
    // the same address a bookmark or a typed URL would reach.
    await page.goto(`/clients/${CLIENT_A}/documents`);
    await expect(page).toHaveURL(new RegExp(`/clients/${CLIENT_A}/documents$`));
    await expect(page.getByRole("heading", { name: "This client isn't visible to your firm", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(mainNav.getByText("E2E Accounting", { exact: true })).toBeVisible();
    // NEVER Rome Properties again — measured: the sidebar's client GROUP still
    // renders here (`resolveActive` reads the client id straight off the URL,
    // independently of whether the layout below it threw `notFound()`), under
    // the neutral placeholder label ("Client", `AppShell.scope.
    // clientPlaceholder`) rather than being absent outright — but the one
    // security property the design actually promises, and the one this
    // asserts, is that the STALE name never leaks back onto the screen.
    await expect(mainNav.getByText("Rome Properties", { exact: true })).toHaveCount(0);
    const waysBack = page.getByRole("navigation", { name: "Ways back" });
    await expect(waysBack.getByRole("link", { name: "Clients", exact: true })).toBeVisible();
    await expect(waysBack.getByRole("link", { name: "Firm home", exact: true })).toBeVisible();

    // THE SWITCHER AGREES — a live, client-side read, not the SSR boundary.
    const trigger = page.locator("[data-scope-switcher]");
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Bee Creative Solution" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Rome Properties" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // RESTORED, and a reload shows the client again — the toggle is a two-way
    // door, not a one-shot fixture mutation.
    const show = await page.request.post(`/e2e-control/clients/${CLIENT_A}/visibility`, { data: { visible: true } });
    expect(show.ok(), "the e2e visibility toggle did not answer").toBeTruthy();
    await page.goto(`/clients/${CLIENT_A}`);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Rome Properties")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// AC6: one overlay stack — the Clara rail and the mobile nav Sheet, together.
// ---------------------------------------------------------------------------

test("AC6: one overlay stack — the rail and the nav Sheet each own exactly one Escape", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await signInTo(page, `/clients/${CLIENT_A}`);

  await page.locator("[data-clara-rail-launcher]").click();
  const rail = page.locator("[data-clara-rail]");
  await expect(rail).toBeVisible();

  // KEYBOARD, not a click — measured, not assumed: below `lg` the rail's own
  // full-viewport scrim (`motion-panel fixed inset-0 z-30 bg-black/10 …
  // lg:hidden`) sits over the header while the rail is open and intercepts
  // every pointer event there, so a mouse click on "Toggle navigation" never
  // lands (Playwright's own actionability retry times out on it). The control
  // stays natively focusable throughout, so a keyboard user still reaches it.
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  const sheet = page.locator("[data-slot=sheet-content]");
  await expect(sheet).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length))
    .toBe(0);
  expect(
    await page.evaluate(() => {
      const popup = document.querySelector("[data-slot=sheet-content]");
      return Boolean(popup && document.activeElement && popup.contains(document.activeElement));
    }),
    "focus never entered the sheet",
  ).toBe(true);

  // NO SIDEWAYS SCROLL while both overlays are up.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `the document scrolls sideways with both overlays open (${overflow.scrollWidth} > ${overflow.clientWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);

  // THE RAIL MUST BE OUTSIDE THE MODAL — pulled from the accessibility tree
  // the way `[data-slot="sidebar-inset"]` (the main content column) actually
  // IS while this Sheet is open: measured, that element and none of the
  // rail's own ancestors up to `<body>` carry `aria-hidden` or `inert`. The
  // rail is a THIRD sibling under the sidebar wrapper, alongside the sidebar
  // and the inset, and Base UI's hide-others sweep on this vendored Sheet
  // does not reach it.
  const railHidden = await page.evaluate(() => {
    let el = document.querySelector("[data-clara-rail]");
    while (el && el !== document.body) {
      if (el.getAttribute("aria-hidden") === "true" || el.hasAttribute("inert")) return true;
      el = el.parentElement;
    }
    return false;
  });
  expect(
    railHidden,
    "the Clara rail (and none of its ancestors up to <body>) is aria-hidden or inert while the nav Sheet is open — it stays live in the accessibility tree behind a true modal",
  ).toBe(true);

  // ONE FOCUS TRAP. Tab from the sheet's OWN last focusable item — the
  // footer's Sign out button, DOM order measured rather than assumed — and
  // focus must stay inside rather than escaping to the page behind it.
  const lastFocusable = sheet.getByRole("button", { name: "Sign out", exact: true });
  await expect(lastFocusable).toBeVisible();
  await lastFocusable.focus();
  await expect(lastFocusable).toBeFocused();
  await page.keyboard.press("Tab");
  // POLLED, not read at the instant: Base UI's modal trap parks focus on its
  // focus-guard `<span>` for one frame and then wraps it to the sheet's first
  // item (measured: the guard, then the scope switcher ~100ms later). The
  // claim is that focus ENDS inside the sheet, never on the page behind it.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const popup = document.querySelector("[data-slot=sheet-content]");
          return Boolean(popup && document.activeElement && popup.contains(document.activeElement));
        }),
      { message: "Tab from the sheet's last focusable item left focus outside it — the modal focus trap does not hold" },
    )
    .toBe(true);

  // ESCAPE CLOSES ONE LAYER AT A TIME — never both, and never the wrong one.
  // First: the sheet only. The rail is still on screen and the sheet is gone.
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(rail).toBeVisible();
  await expect(toggle).toBeFocused();

  // Second: FROM INSIDE THE RAIL, its own existing Escape behaviour
  // (`responsive-shell-walk.spec.ts`'s "Escape closes the overlay rail" cell)
  // closes it, and only it — the rail's Escape handler never fired on the
  // first press because focus was on the toggle, outside the rail.
  const collapse = page.getByRole("button", { name: "Collapse Clara" });
  await collapse.focus();
  await page.keyboard.press("Escape");
  await expect(rail).toHaveCount(0);
  await expect(page.locator("[data-clara-rail-launcher]")).toBeFocused();
});

// ---------------------------------------------------------------------------
// D5/D6 — Work's destination split, and the settings hub's rank shaping.
// ---------------------------------------------------------------------------

test("D5: /work?view=needs-you shows the review-queue rows and marks the saved view current", async ({ page }) => {
  await page.route("**/e2e-supabase/rest/v1/rpc/list_review_queue", jsonRoute(reviewQueueEnvelope(CLIENT_A, "Which account should this bank fee post to?")));
  for (const relation of ["firm_open_questions_visible", "client_identifier_promotions_visible"]) {
    await page.route(`**/e2e-supabase/rest/v1/${relation}**`, jsonRoute([]));
  }
  await signInTo(page, "/");
  await page.goto("/work?view=needs-you");

  await expect(page.getByRole("heading", { name: "Work", level: 1 })).toBeVisible();
  const views = page.getByRole("navigation", { name: "Saved views" });
  await expect(views.getByRole("link", { name: "Needs you", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Which account should this bank fee post to?")).toBeVisible();
  await expect(page.getByText(/Client: ?Rome Properties/)).toBeVisible();
});

test("D5/D6: plain /work also renders the agent-task panel and the not-built note; /activity has no Details button", async ({ page }) => {
  await page.route("**/e2e-supabase/rest/v1/rpc/list_review_queue", jsonRoute(EMPTY_QUEUE));
  await page.route("**/e2e-supabase/rest/v1/agent_tasks_visible**", jsonRoute([]));
  await page.route("**/e2e-supabase/rest/v1/agent_receipts_visible**", jsonRoute([]));
  await signInTo(page, "/");
  await page.goto("/work");

  await expect(page.getByRole("heading", { name: "Work", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Running agent tasks", level: 2 })).toBeVisible();
  await expect(page.getByText(/durable Work records/)).toBeVisible();

  await page.goto("/activity");
  await expect(page.getByRole("button", { name: "Details", exact: true })).toHaveCount(0);
});

test("D6: /settings is rank-shaped — bookkeeper, owner and operator owner see different sections", async ({ page }) => {
  // Asserted on the card's `<h2>`, not the wrapping `<Link>` — the link's own
  // accessible name is its whole card (title AND description,
  // `components/settings/settings-hub.tsx`), and several descriptions say
  // "firm" in passing ("access to this firm", "across the firm", "firms on
  // ClaraBook"), which would make a substring match on the link's name
  // ambiguous for exactly the "Firm settings" section. The `<h2>` carries
  // only the label itself.
  //
  // "Firm" -> "Firm settings", "Compliance" -> "Compliance register",
  // "Registrations" -> "Firm registrations": the hub's card labels now read
  // exactly what each destination's own `<h1>` already said — see the "Firm
  // settings" `<h1>` `firm-navigation-walk.spec.ts` pins on `/settings/firm`.
  // "Account" and "Members" are unchanged, and the ⌘K option for Members
  // stays "Members" (a different catalogue, `lib/command/routes.ts`, whose
  // own labels were already settled).
  await signInTo(page, "/", "bookkeeper@example.test");
  await page.goto("/settings");
  const heading = (name: string) => page.getByRole("heading", { name, exact: true, level: 2 });
  await expect(heading("Account")).toBeVisible();
  await expect(heading("Firm settings")).toBeVisible();
  await expect(heading("Compliance register")).toBeVisible();
  const vendorBindingsCard = page.getByRole("link", { name: /Vendor identity bindings/ });
  await expect(heading("Vendor identity bindings")).toBeVisible();
  await expect(vendorBindingsCard.getByText("Legacy")).toBeVisible();
  await expect(heading("Members")).toHaveCount(0);
  await expect(heading("Firm registrations")).toHaveCount(0);
  await page.context().clearCookies();

  // The only owner fixture this suite has (`owner@example.test`) is ALSO the
  // operator persona (`serve-built.mjs`'s `caller_context`: `is_operator:
  // owner`) — there is no separate non-operator-owner persona to isolate the
  // two claims with, so both are asserted together, honestly, in one sign-in.
  await signInTo(page, "/", "owner@example.test");
  await page.goto("/settings");
  await expect(heading("Members")).toBeVisible();
  await expect(heading("Firm registrations")).toBeVisible();
});

test("⌘K: typing a settings section or the saved view navigates straight to it", async ({ page }) => {
  await signInTo(page, "/");
  await ensureRealFocus(page);

  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("Search or ask Clara…").fill("members");
  await page.getByRole("option", { name: "Members", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/members$/);

  await ensureRealFocus(page);
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("Search or ask Clara…").fill("needs");
  await page.getByRole("option", { name: "Needs you", exact: true }).click();
  await expect(page).toHaveURL(/\/work\?view=needs-you$/);
});

// ---------------------------------------------------------------------------
// Retired entries.
// ---------------------------------------------------------------------------

test("retired entries: 'Start processing again' replaces 'Request autodraft', Internal processing trails the reports panels, the vendor-bindings banner explains the retirement", async ({ page }) => {
  await signInTo(page, "/");

  // The filings-history relabel (D6). CLIENT_A carries no filing in the
  // shared fixture, so this reuses the documents-viewer walk's own client —
  // the one fixture in this suite that actually files a document.
  await page.goto(`/clients/${DOCS.clientId}/documents`);
  await expect(page.getByRole("heading", { name: "Filed to this client" })).toBeVisible();
  await page.getByRole("button", { name: /invoice-april\.pdf/ }).click();
  await expect(page.getByRole("button", { name: "Start processing again", exact: true })).toBeVisible();
  await expect(page.getByText("Request autodraft")).toHaveCount(0);

  // Internal processing (reports page), AFTER the reports panels — DOM order,
  // not just presence.
  await page.goto(`/clients/${CLIENT_A}/reports`);
  const headingOrder = await page.evaluate(() =>
    [...document.querySelectorAll("h2")].map((h) => h.textContent?.trim() ?? ""),
  );
  const statutoryIndex = headingOrder.indexOf("Statutory close reports");
  const internalIndex = headingOrder.indexOf("Internal processing");
  expect(statutoryIndex, "the statutory reports heading is missing").toBeGreaterThanOrEqual(0);
  expect(internalIndex, "the Internal processing heading is missing").toBeGreaterThanOrEqual(0);
  expect(internalIndex, "Internal processing must trail the reports panels").toBeGreaterThan(statutoryIndex);
  await expect(page.locator("#internal-processing")).toBeVisible();

  // The vendor-bindings "no longer a prerequisite" banner.
  await page.goto("/settings/vendor-bindings");
  await expect(page.getByText(/no longer a prerequisite for processing documents/)).toBeVisible();
});

// ---------------------------------------------------------------------------
// axe.
// ---------------------------------------------------------------------------

test.describe("axe: the new shell's own surfaces are clean under WCAG 2.1 AA", () => {
  const ROUTES: readonly [string, string][] = [
    ["work", "/work"],
    ["settings hub", "/settings"],
    ["client accounting hub", `/clients/${CLIENT_A}/accounting`],
    ["client work", `/clients/${CLIENT_A}/work`],
    ["client journals", `/clients/${CLIENT_A}/journals`],
  ];

  for (const [face, url] of ROUTES) {
    test(`${face} (docked sidebar)`, async ({ page }) => {
      await page.setViewportSize(WIDE);
      await page.route("**/e2e-supabase/rest/v1/rpc/list_review_queue", jsonRoute(EMPTY_QUEUE));
      await page.route("**/e2e-supabase/rest/v1/agent_tasks_visible**", jsonRoute([]));
      await page.route("**/e2e-supabase/rest/v1/agent_receipts_visible**", jsonRoute([]));
      await signInTo(page, "/");
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(result.violations, `${face} axe violations`).toEqual([]);
    });
  }

  test("the open mobile sheet at 640", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await signInTo(page, "/");
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await expect(page.locator("[data-slot=sheet-content]")).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length))
      .toBe(0);
    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(result.violations, "mobile sheet open axe violations").toEqual([]);
  });
});
