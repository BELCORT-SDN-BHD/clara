// Runtime entry (boots the built Nitro server).
//
// Maps DATABASE_URL -> WORKFLOW_POSTGRES_URL because the WDK world's RUNTIME
// reads only WORKFLOW_POSTGRES_URL (the documented DATABASE_URL fallback exists
// only in the bootstrap CLI — verified in the Slice-0 spike). Defaults
// WORKFLOW_TARGET_WORLD + PORT. Relevant only when the world is enabled
// (CLARA_START_WORLD=1); in skeleton mode the server just serves health/ready.
if (!process.env.WORKFLOW_POSTGRES_URL && process.env.DATABASE_URL) {
  process.env.WORKFLOW_POSTGRES_URL = process.env.DATABASE_URL;
}
process.env.WORKFLOW_TARGET_WORLD ??= "@workflow/world-postgres";
process.env.PORT ??= "3200";

// Fail CLOSED at boot if the production pool DSNs are missing (S4-AB8/FX7) — every
// supported entry point asserts, not just serve.mjs.
const { assertProductionPoolConfig } = await import("../lib/pools.mjs");
assertProductionPoolConfig();

await import(new URL("../.output/server/index.mjs", import.meta.url).href);
