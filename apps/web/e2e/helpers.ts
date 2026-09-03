import type { Page } from "@playwright/test";

/**
 * Shared e2e instrument: the ONE spelling of "this page can be trusted to
 * receive a keyboard event next" — anchor every keyboard-first walk on this
 * instead of a hand-rolled `bringToFront()` call or a sleep.
 *
 * WHY THIS EXISTS (PR #510). A `page.keyboard.press(...)` dispatched right
 * after a fresh `goto`/`bringToFront()` can lose a real focus-grant race and
 * be silently swallowed — measured on `entry-faces-walk.spec.ts`'s login
 * keyboard-pass cell, base-side, on unmodified `main`: 6/10 failures on one
 * host, 9/10 on another (host-dependent rate, same defect), always at the
 * FIRST key press, always "Received: inactive" after the full default retry
 * window. That reading is the tell that this is an ABSENT focus move, not a
 * late one: a native Tab-driven (or shortcut-driven) focus change is a
 * one-shot browser action with nothing left to retry once it has already
 * fired against an unfocused document, so a plain `expect(...).toBeFocused()`
 * retry loop can never recover from it no matter how long it polls.
 *
 * THE MECHANISM, measured (independent fresh-context review, PR #510 fold).
 * `bringToFront()`'s own promise is NOT what closes the race — dropping the
 * call entirely and keeping only the `waitForFunction` below was clean 40/40
 * in that review's probes. The actual grant is Playwright's own
 * `Emulation.setFocusEmulationEnabled`, sent at browser-session init;
 * `document.hasFocus()` reads that same renderer-level bit, and on the hosts
 * measured so far it is already true by the time this function's first poll
 * runs. `bringToFront()` is kept here for headed-run hygiene, not because it
 * is load-bearing for the fix.
 *
 * WHY THIS AND NOT A FIXED SLEEP. On the hosts measured, a bare ~30ms delay
 * of almost any shape (a timer, an unrelated `evaluate`, an axe scan running
 * first) is equally effective, because the real grant is that fast there.
 * `waitForFunction`'s value over a magic-number sleep is therefore not a
 * different OUTCOME today — it is that it FAILS HARD (rejects) if
 * `document.hasFocus()` never becomes true, bounded by the test's normal
 * timeout, and it has headroom a fixed sleep does not: a slower host that
 * needs longer than 30ms still gets a correct wait instead of a silently
 * too-short delay.
 */
export async function ensureRealFocus(page: Page): Promise<void> {
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus());
}
