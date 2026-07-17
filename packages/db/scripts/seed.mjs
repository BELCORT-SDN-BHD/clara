// Seed runner — applies seeds/NNNN_*.sql (SYNTHETIC data only).
// Seeds must be idempotent (the smoke seed truncates then inserts).
// Connection comes from the environment only (see lib/pg.mjs).

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeClient, targetLabel, isMain } from "../lib/pg.mjs";

const SEEDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "seeds");

export async function seed({ log = console.log } = {}) {
  const client = makeClient();
  await client.connect();
  try {
    const files = readdirSync(SEEDS_DIR)
      .filter((f) => /^\d+.*\.sql$/.test(f))
      .sort();
    for (const file of files) {
      const sql = readFileSync(join(SEEDS_DIR, file), "utf8");
      await client.query(sql);
      log(`  seeded ${file}`);
    }
    log(`seed: ${files.length} seed file(s) applied · target ${targetLabel()}`);
    return { seeded: files.length };
  } finally {
    await client.end();
  }
}

if (isMain(import.meta.url)) {
  seed().catch((err) => {
    console.error("seed: FAIL —", err.message);
    process.exit(1);
  });
}
