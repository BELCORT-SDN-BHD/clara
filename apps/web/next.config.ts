import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
