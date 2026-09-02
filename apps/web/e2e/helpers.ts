import type { Page } from "@playwright/test";

/**
 * Shared e2e instrument: the ONE spelling of "this page can be trusted to
 * receive a keyboard event next" — anchor every keyboard-first walk on this
 * instead of a hand-rolled `bringToFront()` call or a sleep.
 *
 * WHY THIS EXISTS (PR #510). `page.bringToFront()` only activates the CDP
 * *target*; its promise can resolve before the renderer has actually been
 * GRANTED input focus. A `page.keyboard.press(...)` dispatched immediately
 * after can lose that race and be silently swallowed — measured on
 * `entry-faces-walk.spec.ts`'s login keyboard-pass cell, base-side, on
 * unmodified `main`: **6/10 failures**, always at the FIRST key press, always
 * "Received: inactive" after the full default retry window. That reading is
 * the tell that this is an ABSENT focus move, not a late one: a native
 * Tab-driven (or shortcut-driven) focus change is a one-shot browser action
 * with nothing left to retry once it has already fired against an unfocused
 * document, so a plain `expect(...).toBeFocused()` retry loop can never
 * recover from it no matter how long it polls.
 *
 * This is a POSITIVE PRECONDITION, not a sleep: `waitForFunction` polls the
 * browser's own `document.hasFocus()` and only returns once it is genuinely
 * true, so it costs nothing when focus is already granted and blocks for
 * exactly as long as the race actually takes otherwise.
 */
export async function ensureRealFocus(page: Page): Promise<void> {
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());
}
