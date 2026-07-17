// Worker entry. Maps DATABASE_URL -> WORKFLOW_POSTGRES_URL because the
// world's RUNTIME reads only WORKFLOW_POSTGRES_URL (default
// postgres://world:world@localhost:5432/world); the documented DATABASE_URL
// fallback exists only in the bootstrap CLI (verified in dist/index.js vs
// dist/cli.js of @workflow/world-postgres@4.3.0).
if (!process.env.WORKFLOW_POSTGRES_URL && process.env.DATABASE_URL) {
  process.env.WORKFLOW_POSTGRES_URL = process.env.DATABASE_URL;
}
process.env.WORKFLOW_TARGET_WORLD ??= "@workflow/world-postgres";
process.env.PORT ??= "3100";

await import(new URL("../.output/server/index.mjs", import.meta.url).href);
