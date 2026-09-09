import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

import { legacyRedirects } from "./lib/navigation/legacy-routes";

const moneyInputHarnessEnabled = process.env.CLARA_E2E_MONEY_INPUT_HARNESS === "1";
const routeErrorProbeEnabled = process.env.CLARA_E2E_ROUTE_ERROR_PROBE === "1";

// CB-AE2E-035. Resolved ONCE, at `next build`, from whichever commit variable the builder sets:
// an explicit `CLARA_BUILD_SHA` first (so a deploy can state it), then Cloudflare's own CI
// variables. Empty when NONE resolves — a local build has no honest sha, and the route reports
// null rather than inventing one.
const webBuildSha =
  process.env.CLARA_BUILD_SHA ||
  process.env.WORKERS_CI_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Freeze the test-harness switch into the emitted bundles. The route module
  // and both auth-wall registries must agree on one build-time decision.
  env: {
    CLARA_E2E_MONEY_INPUT_HARNESS: moneyInputHarnessEnabled ? "1" : "0",
    // CB-AE2E-035: the commit this bundle was built from, read server-side by
    // app/api/build-info/route.ts. Deliberately NOT `NEXT_PUBLIC_` (never inlined
    // into the browser bundle) and deliberately NOT a `wrangler.jsonc` var — that
    // block is replaced on every upload, so a hand-edited sha there is exactly the
    // drift this endpoint exists to detect. Empty when nothing resolved; the route
    // reports null rather than a placeholder, because a fabricated sha is believed.
    CLARA_WEB_BUILD_SHA: webBuildSha,
  },
  // pnpm dependencies can be junctioned into a nested worktree. Turbopack 16
  // refuses a linked dependency outside its inferred root, so anchor the root
  // at the physical workspace that contains both this app and node_modules.
  turbopack: {
    root: resolve(
      realpathSync(resolve(__dirname, "node_modules")),
      "../../..",
    ),
    // Two independent e2e opt-ins, each swapping ONE module and each decided at
    // BUILD time so no production request can turn either on through env.
    // Ordinary builds compile the inert stub in both cases: the money-input
    // route resolves to a 404 stub, so production never compiles the journal
    // editor into a public entry route's client graph, and the route-error
    // probe resolves to a module that does not throw.
    resolveAlias: {
      ...(moneyInputHarnessEnabled
        ? {
            "@/components/e2e/money-input-harness-route":
              "@/components/e2e/money-input-harness-route-enabled",
          }
        : {}),
      ...(routeErrorProbeEnabled
        ? {
            "@/components/e2e/route-error-probe":
              "@/components/e2e/route-error-probe-enabled",
          }
        : {}),
    },
  },
  // #614 — THE LEGACY ROUTE MATRIX, as data, in one place
  // (`lib/navigation/legacy-routes.ts`, which carries the reasoning and the
  // `permanent: false` decision). `/needs-you` and the whole `/admin` subtree
  // moved; their old addresses are in browser histories, in Slack messages and
  // in deep links a Needs-you row already handed out, so each one redirects
  // rather than 404s.
  //
  // ORDER OF OPERATIONS, because it surprises: Next applies `redirects()` BEFORE
  // `proxy.ts`. An unauthenticated hit on `/admin/members` therefore redirects
  // first and meets the auth gate at the NEW path, landing on
  // `/login?next=/settings/members` — which is the behaviour we want, and it
  // means the auth wall never sees the old path.
  //
  // Unlike `rewrites()` (see the note below), a redirect destination is a
  // literal path with no environment in it, so baking it into
  // `routes-manifest.json` at build time is correct rather than the F1/F2 defect.
  redirects: async () => legacyRedirects(),
  // DELIBERATELY no `rewrites()` for the runtime proxy (independent review
  // 2026-08-27, F1/F2): a `rewrites()` destination is baked into
  // `.next/routes-manifest.json` at BUILD time, so `process.env` is read once at
  // `next build` and the literal value ships in the deployed bundle regardless of
  // the runtime's actual deploy-time env — the review caught a shipped
  // `localhost:3200`. `app/api/runtime/[...path]/route.ts` replaces it: a Route
  // Handler reads `process.env.CLARA_RUNTIME_URL` at REQUEST time and allow-lists
  // exactly the headers it forwards (never the framework rewrite's wholesale
  // header/cookie copy — see that file's own header for the full finding).
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);

// Makes bindings declared in wrangler.jsonc available to `next dev`. There are
// no KV, R2, D1, or service bindings today, so this is currently a no-op. The
// OpenNext/Wrangler commands need Node 22 or newer; see README.md.
initOpenNextCloudflareForDev();
