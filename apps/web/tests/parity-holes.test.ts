import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string): string => readFileSync(join(WEB_ROOT, path), "utf8");

describe("裁-117 prototype-parity wiring", () => {
  // P6-5 MOVED THE KEY, SO THIS PIN MOVES WITH IT — and it is a stronger pin now, not a
  // relocated one. #507 keyed `<ClaraThreadView>` INSIDE `ClaraRail`, which fenced that one
  // component; the structural boundary keys `<ClaraRail>` at `RailMount`, the single mount
  // point for the whole rail subtree, so the composer, the attachment tray, the interview
  // card and everything a later feature adds are inside the fence too. Same altitude key,
  // one level up — pinning the OLD site would now pin a boundary that no longer exists and
  // pass while the real one rotted.
  //
  // `claraThreadStore.reset(` is DELIBERATELY NO LONGER PINNED, and its absence is the
  // point: that call deleted the outgoing thread's store entry on an altitude change, which
  // is the one thing that could destroy a RUNNING turn's SSE state on a switch away and
  // back. The wall it was standing in for is `visibleThreadForAltitude` (pinned below) plus
  // the mount-level key — both structural, neither a delete. See useActiveThread.ts's own
  // note. A pin asserting the call still exists would now be a pin AGAINST the fix.
  it("keys the whole rail subtree by altitude and selects the caller's own session", () => {
    const mount = read("components/clara/rail-mount.tsx");
    const rail = read("components/clara/ClaraRail.tsx");
    const active = read("lib/clara/useActiveThread.ts");
    assert.match(mount, /<ClaraRail\s+key=\{clientId \?\? ["']firm["']\}/);
    assert.match(active, /created_by\s*===\s*callerSubject/);
    // The altitude fence that keeps a resolution for one altitude off another's screen.
    assert.match(active, /resolved\.altitude === altitude/);
    // And the rail still hands the view its own altitude, so the fence has something to fence.
    assert.match(rail, /useActiveThreadId\(auth, clientId\)/);
  });

  it("checks the addressed session before mounting a client full-screen thread", () => {
    const page = read("app/(full)/clients/[clientId]/clara/[threadId]/page.tsx");
    assert.match(page, /loadChatSession\(/);
    assert.match(page, /sessionBelongsToClient\(session, clientId\)/);
    assert.match(page, /notFound\(\)/);
  });

  it("renders the DB-read client name in the workspace header", () => {
    const layout = read("app/(firm)/clients/[clientId]/layout.tsx");
    assert.match(layout, /loadClientById\(/);
    assert.match(layout, /client\.name/);
  });

  it("ships recovery-backed error boundaries for every route family", () => {
    for (const group of ["(entry)", "(firm)", "(full)"]) {
      const path = `app/${group}/error.tsx`;
      assert.equal(existsSync(join(WEB_ROOT, path)), true, `${path} is missing`);
      const source = read(path);
      assert.match(source, /reset=\{reset\}/);
      assert.match(source, /error=\{error\}/);
    }
  });

  it("wires the recovery request and PKCE callback faces from login", () => {
    assert.match(read("components/login-form.tsx"), /href=["']\/forgot-password["']/);
    assert.equal(existsSync(join(WEB_ROOT, "app/(entry)/forgot-password/page.tsx")), true);
    assert.equal(existsSync(join(WEB_ROOT, "app/(entry)/auth/recover/route.ts")), true);
    assert.equal(existsSync(join(WEB_ROOT, "app/(entry)/auth/recover/password/page.tsx")), true);
    assert.match(read("components/entry/password-recovery-form.tsx"), /resetPasswordForEmail/);
  });

  it("RED-BEFORE F3: selects the route-error probe at build time, never from a page request", () => {
    const page = read("app/(entry)/forgot-password/page.tsx");
    const config = read("next.config.ts");
    const runner = read("e2e/run.mjs");
    assert.doesNotMatch(page, /process\.env|CLARA_E2E_TRIGGER_ROUTE_ERROR/);
    assert.match(page, /RouteErrorProbe/);
    assert.match(config, /CLARA_E2E_ROUTE_ERROR_PROBE/);
    assert.match(config, /resolveAlias/);
    assert.match(runner, /CLARA_E2E_ROUTE_ERROR_PROBE/);
    assert.doesNotMatch(runner, /CLARA_E2E_TRIGGER_ROUTE_ERROR/);
  });

  // CB-AE2E-019 RE-SCOPED THIS CELL TO THE WIDE ARM AND ADDED THE NARROW ONE.
  // It is NOT relaxed: every claim it made still holds where it was true, and the
  // arm that did not exist before now has its own claim. The panel's class string
  // moved from ClaraRail.tsx to rail-chrome.tsx's `RAIL_PANEL_CLASS` when the
  // rail's chrome was split from its content, so this reads it at its new home
  // AND asserts ClaraRail consumes it — a pin on the constant alone would pass
  // while the rail rendered something else entirely (spelling is not identity).
  it("mounts the open rail as a width-owning sibling at lg and above, and as a fixed overlay below it", () => {
    const layout = read("app/(firm)/layout.tsx");
    const rail = read("components/clara/ClaraRail.tsx");
    const chrome = read("components/clara/rail-chrome.tsx");
    const mount = read("components/clara/rail-mount.tsx");

    // THE ROW POSITION — unchanged, and still the thing that makes the wide arm
    // a sibling of the workbench rather than something floating over it.
    const contentAt = layout.indexOf("data-firm-workbench");
    const railAt = layout.indexOf("<RailMount />");
    const rowCloseAt = layout.indexOf("</div>", railAt);
    assert.ok(
      contentAt >= 0 && railAt > contentAt && rowCloseAt > railAt,
      "rail is not inside the shell flex row after the workbench",
    );

    // THE PANEL still owns width and is still not fixed — the original claim,
    // asserted against the constant that now carries it.
    assert.match(rail, /data-clara-rail/);
    assert.match(chrome, /RAIL_PANEL_CLASS\s*=[\s\S]{0,200}h-dvh w-80 max-w-\[85vw\] shrink-0/);
    assert.doesNotMatch(
      chrome.slice(chrome.indexOf("RAIL_PANEL_CLASS ="), chrome.indexOf("export function ClaraRailChrome")),
      /\bfixed\b/,
      "the rail PANEL must never be fixed — its chrome is what floats, in the narrow arm only",
    );
    // …and the rail actually wears it.
    assert.match(rail, /className=\{RAIL_PANEL_CLASS\}/);
    assert.match(rail, /RAIL_PANEL_CLASS.*from "@\/components\/clara\/rail-chrome"/);

    // THE WIDE ARM HAS NO WRAPPER BOX AT ALL. `lg:contents` is the mechanism —
    // not "a wrapper that happens to be transparent", but no generated box, so
    // the panel is a direct flex child of the shell row exactly as before.
    assert.match(mount, /<ClaraRailChrome>/);
    assert.match(chrome, /lg:contents/);

    // THE NARROW ARM IS the fixed overlay this cell used to forbid outright, and
    // the wide arm collapses it to `contents` so the panel is a direct flex child
    // of the shell row exactly as before.
    assert.match(chrome, /className="fixed inset-y-0 right-0 z-40 flex outline-none lg:contents"/);

    // …AND THE OVERLAY CLASSES ARE NOT CONDITIONAL. This is the pin, and it is
    // written as a prohibition because the defect was a plausible-looking
    // `open ? "fixed …" : "contents"`: `ClaraRail` keeps its aside MOUNTED for one
    // --motion-duration-panel after `open` goes false, so a wrapper keyed on
    // `open` handed the still-mounted 320px panel back to the flex row for the
    // whole exit and the workbench was squeezed and released. Keyed on nothing,
    // the property holds by construction. The browser leg samples it per frame.
    const wrapper = chrome.slice(chrome.indexOf("<div"), chrome.indexOf("onKeyDown"));
    assert.doesNotMatch(
      wrapper,
      /open\s*\?/,
      "the overlay wrapper is keyed on `open` again — it must not be: the panel outlives `open` by one exit",
    );
  });
});
