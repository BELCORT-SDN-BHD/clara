import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string): string => readFileSync(join(WEB_ROOT, path), "utf8");

describe("裁-117 prototype-parity wiring", () => {
  it("keys the rail thread view by altitude and selects the caller's own session", () => {
    const rail = read("components/clara/ClaraRail.tsx");
    const active = read("lib/clara/useActiveThread.ts");
    assert.match(rail, /<ClaraThreadView\s+key=\{clientId \?\? ["']firm["']\}/);
    assert.match(active, /created_by\s*===\s*callerSubject/);
    assert.match(active, /claraThreadStore\.reset\(/);
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

  it("mounts the open rail as a width-owning sibling instead of a fixed overlay", () => {
    const layout = read("app/(firm)/layout.tsx");
    const rail = read("components/clara/ClaraRail.tsx");
    const contentAt = layout.indexOf("data-firm-workbench");
    const railAt = layout.indexOf("<RailMount />");
    const rowCloseAt = layout.indexOf("</div>", railAt);
    assert.ok(contentAt >= 0 && railAt > contentAt && rowCloseAt > railAt, "rail is not inside the shell flex row after the workbench");
    assert.match(rail, /data-clara-rail/);
    assert.doesNotMatch(rail, /enter-panel fixed/);
    assert.match(rail, /h-dvh w-80 shrink-0/);
  });
});
