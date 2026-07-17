// Reset — drops ONLY the `clara` schema (schema_migrations + app tables).
//
// Scoped on purpose: this never touches `public`, `spike`, `workflow`,
// `graphile_worker`, or any Supabase-managed schema. On the shared project the
// Slice-0 spike still holds a live parked run in `workflow`/`graphile_worker` —
// dropping `clara` leaves it untouched.
//
// Connection comes from the environment only (see lib/pg.mjs).

import { makeClient, targetLabel, isMain } from "../lib/pg.mjs";

export async function reset({ log = console.log } = {}) {
  const client = makeClient();
  await client.connect();
  try {
    await client.query("drop schema if exists clara cascade;");
    log(`reset: dropped schema "clara" · target ${targetLabel()}`);
    return { ok: true };
  } finally {
    await client.end();
  }
}

if (isMain(import.meta.url)) {
  reset().catch((err) => {
    console.error("reset: FAIL —", err.message);
    process.exit(1);
  });
}
