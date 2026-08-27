import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The document-intake "begin" call MUST be same-origin relative (never
  // runtimeBase-prefixed) — the runtime's PUT/finalize legs get CORS on the Fly
  // origin, but begin does not (lib/documents/intake.ts's own header). Ported
  // MECHANISM from apps/dashboard/next.config.mjs's `/api/intake/:path*` rewrite,
  // narrowed to the one route this app's P3 documents workbench uses — apps/web
  // is a full Next server on Cloudflare Workers (@opennextjs/cloudflare), not a
  // static export, so `rewrites()` runs at request time same as `next dev` (the
  // dashboard's own comment on why its Pages-Function static-export mode needs a
  // different mechanism does not apply here).
  async rewrites() {
    const runtime = process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL || "http://localhost:3200";
    return [{ source: "/api/intake/:path*", destination: `${runtime}/api/intake/:path*` }];
  },
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
