import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pnpm dependencies can be junctioned into a nested worktree. Turbopack 16
  // refuses a linked dependency outside its inferred root, so anchor the root
  // at the physical workspace that contains both this app and node_modules.
  turbopack: {
    root: resolve(
      realpathSync(resolve(__dirname, "node_modules")),
      "../../..",
    ),
  },
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

// Reaches Cloudflare bindings (KV/R2/D1/service bindings, once wrangler.jsonc
// declares any) from `next dev`. A no-op today — apps/web declares no bindings
// yet. Verified empirically to build clean under plain `next build` on Windows
// (2026-08-27, this scaffold). The opennextjs-cloudflare BUILD/PREVIEW/DEPLOY
// commands themselves need Node >=22 (wrangler's floor, see package.json) and
// are documented-not-run here — the Cloudflare build runs on WSL CI. See
// README.md "Cloudflare" section.
initOpenNextCloudflareForDev();
