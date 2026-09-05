// CB-AE2E-019 — the rail's exit, proved at the two seams a browser leg cannot
// reach cheaply: the latch's own state machine, and the DRIFT between the
// millisecond this module hardcodes and the CSS token the animation actually
// runs at.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { renderHook } from "../../test/hookHarness";
import { RAIL_EXIT_MS, useRailPresence } from "./useRailPresence";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const globalsCss = readFileSync(join(WEB_ROOT, "app/globals.css"), "utf8");

describe("the Clara rail's exit — the presence latch and the token it is timed to", () => {
  it("RAIL_EXIT_MS IS --motion-duration-panel — the one number, read from the stylesheet", () => {
    // THE DRIFT GUARD. `useRailPresence` unmounts the panel on a JS timer while
    // `dock-panel` animates it on a CSS transition, and the two are timed by
    // different mechanisms that cannot see each other. Too short and the panel
    // vanishes mid-slide; too long and an invisible box sits over the workbench
    // eating clicks. Neither failure is visible in a screenshot, and both are
    // one token retune away — so the token is READ here rather than remembered.
    const declared = /--motion-duration-panel:\s*(\d+)ms/.exec(globalsCss);
    assert.ok(declared, "--motion-duration-panel is not declared in app/globals.css");
    assert.equal(RAIL_EXIT_MS, Number(declared[1]));
  });

  it("`dock-panel` declares the CLOSED arm and a reduced-motion arm for it", () => {
    const start = globalsCss.indexOf("@utility dock-panel");
    assert.ok(start >= 0, "the dock-panel utility is missing");
    const body = globalsCss.slice(start, globalsCss.indexOf("@utility", start + 10));
    // The exit exists at all…
    assert.match(body, /&\[data-state="closed"\]/);
    // …it animates the three properties the docked arm needs (the width is what
    // makes the reflow honest — a slide alone leaves a 320px gap that snaps)…
    assert.match(body, /transition:[\s\S]*?opacity[\s\S]*?translate[\s\S]*?width/);
    // …and reduced motion drops the movement and keeps the fade, in BOTH
    // directions: a reduced-motion arm that only handled the enter would leave
    // the exit sliding for the users who asked it not to.
    const reduced = body.slice(body.indexOf("prefers-reduced-motion"));
    assert.match(reduced, /&\[data-state="closed"\]/);
    assert.match(reduced, /transition: opacity/);
  });

  it("a rail that starts closed is `closed` immediately — no phantom exit on first paint", async () => {
    // The discriminating half of the seed: `useState(open)` rather than
    // `useState(false)`. If the latch seeded false it would report "closed" for
    // an OPEN rail on the first render, which is a hydration mismatch on every
    // page load (the store's own default is `railOpen: true`).
    const h = await renderHook(() => useRailPresence(false));
    try {
      assert.equal(h.current, "closed");
    } finally {
      await h.unmount();
    }
  });

  it("the CLOSING window is real: a rail that was open reports `closing`, not `closed`", async () => {
    // Drive the transition through a rerender, which is what the store does.
    let open = true;
    const h = await renderHook(() => useRailPresence(open));
    try {
      assert.equal(h.current, "open");
      open = false;
      await h.rerender();
      // STILL MOUNTED. This is the whole fix: the boolean says closed, the latch
      // says "closing", and the aside stays in the document to animate out.
      assert.equal(h.current, "closing");

      // …AND IT DOES LET GO. A latch that only ever said "closing" would hold an
      // invisible panel over the workbench forever, which is a worse defect than
      // the missing exit it replaced. Polled on the real clock rather than a fake
      // one, because the timer is the thing under test.
      const deadline = Date.now() + 5_000;
      while (h.current !== "closed") {
        if (Date.now() >= deadline) {
          throw new Error(`the latch never released: still "${h.current}" after 5s`);
        }
        await h.settle();
      }
      assert.equal(h.current, "closed");
    } finally {
      await h.unmount();
    }
  });

  it("REOPENING MID-EXIT cancels the unmount — the panel is never torn down under a live turn", async () => {
    // The cleanup on the effect is what does this. Without it, a rail closed and
    // immediately reopened would be unmounted by the FIRST close's timer a
    // moment after it came back — taking the composer draft and the attachment
    // tray with it, on a panel the user is looking at.
    let open = true;
    const h = await renderHook(() => useRailPresence(open));
    try {
      open = false;
      await h.rerender();
      assert.equal(h.current, "closing");
      open = true;
      await h.rerender();
      assert.equal(h.current, "open");
      // Past the original timer's deadline, and still open.
      const until = Date.now() + RAIL_EXIT_MS * 3;
      while (Date.now() < until) await h.settle();
      assert.equal(h.current, "open");
    } finally {
      await h.unmount();
    }
  });
});
