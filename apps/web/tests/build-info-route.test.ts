import "./next-runtime-globals";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { SCOPE_ENTRANCES } from "../lib/require-firm-scope";

/**
 * CB-AE2E-035, the WEB half. The route's BEHAVIOUR under a granted/denied session is already
 * covered structurally by the scope-spine census (`tests/firm-scope-surfaces.test.ts` classifies
 * every route leaf and proves the guard call is real, executed and returned). What THIS file
 * pins is the part that census cannot see: the honesty of the sha, and the two places the sha
 * must NOT come from.
 */

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = join(WEB_ROOT, "app", "api", "build-info", "route.ts");
const NEXT_CONFIG = join(WEB_ROOT, "next.config.ts");
const WRANGLER = join(WEB_ROOT, "wrangler.jsonc");

describe("web build-info", () => {
  it("is registered as a firm-scope ENTRANCE that 403s, never redirects", () => {
    const entry = SCOPE_ENTRANCES.find((e) => e.path === "app/api/build-info/route.ts");
    assert.ok(entry, "the route must be in SCOPE_ENTRANCES — the census reds on an unclassified leaf");
    assert.equal(entry.onDenial, "403", "a redirect is not an answer to a data request");
  });

  it("reads the sha from the build-time constant and reports NULL when it is empty", () => {
    const src = readFileSync(ROUTE, "utf8");
    assert.match(src, /process\.env\.CLARA_WEB_BUILD_SHA/, "the sha comes from the baked build-time name");
    // The honesty rung. An empty string must become null, not be served as an empty sha.
    assert.match(src, /git_sha: WEB_BUILD_SHA \? WEB_BUILD_SHA : null/, "empty is reported as null");
    for (const placeholder of ['"unknown"', '"dev"', '"HEAD"', '"none"']) {
      assert.ok(!src.includes(`git_sha: ${placeholder}`), `git_sha must never fall back to ${placeholder}`);
    }
  });

  it("does NOT expose the sha through a NEXT_PUBLIC_ name (never inlined into the browser bundle)", () => {
    const src = readFileSync(ROUTE, "utf8");
    const config = readFileSync(NEXT_CONFIG, "utf8");
    assert.ok(!/NEXT_PUBLIC_[A-Z_]*BUILD/.test(src), "the route reads no NEXT_PUBLIC_ build name");
    assert.ok(!/NEXT_PUBLIC_[A-Z_]*BUILD/.test(config), "the config bakes no NEXT_PUBLIC_ build name");
  });

  it("does NOT take the sha from wrangler.jsonc, whose vars block is replaced on every upload", () => {
    // The drift this endpoint exists to DETECT would otherwise be its own source: that block is
    // overwritten by each `wrangler deploy`, so a hand-edited sha there is a value someone must
    // remember to change. The file states this about itself; this cell holds it to it.
    const wrangler = readFileSync(WRANGLER, "utf8");
    assert.ok(!/BUILD_SHA/.test(wrangler), "no build-sha name may live in the replaced vars block");
  });

  it("resolves the sha ONCE at build time, from an explicit name then the CI commit variables", () => {
    const config = readFileSync(NEXT_CONFIG, "utf8");
    assert.match(config, /const webBuildSha\s*=/, "resolved once, at module scope, i.e. at next build");
    for (const name of ["CLARA_BUILD_SHA", "WORKERS_CI_COMMIT_SHA", "CF_PAGES_COMMIT_SHA"]) {
      assert.ok(config.includes(name), `${name} is one of the sources`);
    }
    assert.match(config, /CLARA_WEB_BUILD_SHA: webBuildSha/, "and frozen into the bundle under the name the route reads");
  });
});
