import { test, type Page } from "@playwright/test";

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

/**
 * EVERY WAY REACT SAYS IT LOST ITS FOOTING, in ONE regex (#727).
 *
 * The four minified codes are the ones a production `next build` throws instead of a
 * sentence: 185 is the nested-update ceiling ("Maximum update depth exceeded"), 418/423/425
 * are the hydration family (mismatch, an error while hydrating, text content that did not
 * match). The prose alternatives catch a DEVELOPMENT build saying the same things, so one
 * instrument covers both kinds of run — and the apostrophe is spelled both ways because
 * React's own copy has used each.
 *
 * NO `g` FLAG, deliberately: a global regex carries `lastIndex` between `.test()` calls and
 * would silently skip every other message it was handed.
 */
export const REACT_FAULTS =
  /Minified React error #(185|418|423|425)|Maximum update depth exceeded|Hydration failed|hydration-mismatch|did(?:n['’]t| not) match/i;

/**
 * The shared console/`pageerror` collector for the faults above.
 *
 * BOTH CHANNELS OR NEITHER. React reports a RECOVERABLE hydration mismatch through
 * `onRecoverableError`, which reaches the console; a thrown one reaches `pageerror`. A cell
 * that listened to only one of them would be green about the half it never watched, which
 * is the failure mode this helper exists to make impossible to reproduce by hand.
 *
 * `seen()` is every console error the page produced — a cell uses it for its own vacuity
 * probe (push a known `console.error` through and assert it arrives, so an empty
 * `faults()` is evidence rather than an artefact of a listener that was never attached).
 * `faults()` is the subset this repo treats as a defect.
 */
export function watchReactFaults(page: Page): { seen: () => string[]; faults: () => string[] } {
  const seen: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") seen.push(message.text());
  });
  page.on("pageerror", (error) => seen.push(error.message));
  return { seen: () => seen, faults: () => seen.filter((m) => REACT_FAULTS.test(m)) };
}

/**
 * THE ONE SPELLING OF "this page has stopped moving, measure it now" (#760).
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT HYGIENE. Three walks failed intermittently on the
 * same axe `color-contrast` shape and passed standalone — chat-parity's composer-attachment
 * face (#727a7a on #ffffff, 4.39:1), chat-parity's C6 settled transcript (#6b7474 on
 * #f5f6f4, 4.42:1) and activity-feed at 320px (#6a7373 on #f5f6f4, 4.49:1). None of those
 * foregrounds is a token: each is the RESTING `--muted-foreground` composited at α≈0.93–0.97,
 * i.e. the `enter-content` / `enter-panel` mount fade (`--motion-duration-standard`, 160ms;
 * `app/globals.css`) caught mid-frame. The resting pairs measure 5.013:1 on `--background`,
 * 4.636:1 on `--identity-canvas` and 4.624:1 on `--muted` — all above AA. A scan that runs
 * during a transition therefore measures a frame nobody ever fails on, and "fixing" it would
 * mean weakening a token that was never wrong.
 *
 * TWO CONDITIONS, BOTH NEEDED.
 *  1. Every `.enter-content` / `.enter-panel` element reads `opacity: 1`. Both utilities
 *     declare `opacity: 1` at rest and start from `@starting-style`, so anything below 1 is
 *     a fade still in flight. This is the direct, state-based reading of the defect.
 *  2. `document.getAnimations()` carries no RUNNING finite animation. This catches the other
 *     movers (translate, the panel slide, a row stagger) that the opacity probe cannot see.
 *     INFINITE animations are excluded rather than waited for: `animate-pulse` on a Skeleton
 *     never ends by design, and waiting for it would hang instead of measure.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not park the pointer at (0,0). Every walk used
 * to, because a cursor resting on a primary control made axe measure that button HOVERED and
 * `hover:bg-primary/80` composited to #4a71e0 under white 14px text = 4.440:1. That shortfall
 * was real and estate-wide, and it is FIXED AT THE SOURCE — `components/ui/button.tsx` and
 * `components/ui/badge.tsx` carry `/90` (#3460dc = 5.451:1), pinned by
 * `scripts/check-token-contrast.mjs`'s `primary-foreground-on-primary-hover` row. Dodging the
 * hover state is what stops a scan catching the NEXT one, so the dodge is gone everywhere.
 *
 * It also does not emulate `reducedMotion: 'reduce'`: several walks assert the full-motion
 * arm on the same page they scan, and a scan-only media emulation would make the scan measure
 * a page the rest of the cell never saw.
 */
export async function settleForScan(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const entering = document.querySelectorAll(".enter-content, .enter-panel");
    for (const element of entering) {
      if (getComputedStyle(element).opacity !== "1") return false;
    }
    return document.getAnimations().every((animation) => {
      if (animation.playState !== "running") return true;
      const iterations = animation.effect?.getComputedTiming().iterations ?? 1;
      return iterations === Infinity;
    });
  });
}

/**
 * THE PER-CELL TIME BUDGET, written down ONCE (#706).
 *
 * WHY A BUDGET AT ALL. Playwright's config sets no per-test timeout, so every cell in this
 * suite gets the same flat 30 s regardless of how much work it does. Measured under host
 * load (three suites on one machine, 2026-09-11/14): the journal-work "C3 → B3" cell's final
 * `AxeBuilder.analyze()` took 33 s where it takes 14.4 s alone; the "B3 recovery" cell holds
 * three 15 s fixture polls inside that same 30 s; the personal-settings, home-board,
 * agentic-finish, identity-finish and firm-navigation cells each pay a real sign-in round
 * trip before they start. Every one of them then fails as a TIMEOUT, which reads as a product
 * defect and is not one.
 *
 * WHY THIS SHAPE AND NOT A BIGGER FLAT NUMBER. A flat raise hides the one thing the budget
 * should say out loud: what this cell is waiting FOR. `cellBudgetMs({ polls: 3, scans: 2 })`
 * is a sentence about the work — three fixture-driven state changes and two full-page axe
 * scans — so adding a face or a poll to a cell cannot silently re-open the same failure, and
 * a cell that blows a budget this size is a real stall rather than a slow host. The a11y
 * finish walk's own `test.setTimeout(30_000 * (FACES.length + 1))` is the same idea, written
 * before there was a shared place to put it.
 *
 * A BUDGET IS A CEILING, NEVER A WAIT. Nothing below makes any cell slower: a cell that
 * finishes in 8 s still finishes in 8 s. The per-assertion timeouts are what actually bound
 * each step, and they are unchanged.
 */
export const CELL_BUDGET = {
  /** Playwright's own default, kept as every cell's floor. */
  base: 30_000,
  /** One fixture-driven state change awaited with `{ timeout: 15_000 }`-shaped polling. */
  poll: 15_000,
  /** One full-page `AxeBuilder.analyze()`: 14.4 s alone, 33 s under load (#706's measurement). */
  scan: 35_000,
  /** One form sign-in — a real round trip through the mock auth server plus a server-rendered
   *  redirect, which several walks already give 20 s of its own. */
  signIn: 20_000,
} as const;

export function cellBudgetMs(work: { polls?: number; scans?: number; signIns?: number }): number {
  return (
    CELL_BUDGET.base +
    (work.polls ?? 0) * CELL_BUDGET.poll +
    (work.scans ?? 0) * CELL_BUDGET.scan +
    (work.signIns ?? 0) * CELL_BUDGET.signIn
  );
}

/**
 * ADD one budget unit to the CURRENT cell's timeout, rather than replacing it (#706).
 *
 * WHY ADDITIVE. Several walks pay their cost inside a shared helper — `signIn()` is called once
 * by most cells and twice or three times by the rank-sweep ones — so the honest budget is a
 * function of how many times the work actually happens, not of what the cell looks like from
 * the outside. `test.setTimeout()` REPLACES, so a helper that called it would quietly undo any
 * budget the cell set for itself; reading `test.info().timeout` first makes each grant stack.
 *
 * Still a ceiling, never a wait: a cell that finishes early finishes early.
 */
export function grantCellBudget(ms: number): void {
  test.setTimeout(test.info().timeout + ms);
}
