// Seed runner — applies seeds/NNNN_*.sql (SYNTHETIC data only).
//
// GUARDED (finding 6): seeds TRUNCATE tables, so this refuses unless
// CLARA_ALLOW_DESTRUCTIVE=1 AND the target is disposable or explicitly named —
// the same destructive-target guard as reset (see lib/guard.mjs). CI sets the
// sentinel against the ephemeral clara_ci, so CI still seeds.
//
// ORDERING + ATOMICITY (finding 5): seed filenames use the SAME fixed-width
// NNNN_ grammar as migrations (so 10_ can't sort before 2_), duplicate version
// numbers are rejected, and each seed file runs in its OWN transaction so a
// failure rolls that file back instead of leaving a half-applied seed.
//
// Seeds must be idempotent (the smoke seed truncates then inserts).
// Connection comes from the environment only (see lib/pg.mjs).

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeClient, targetLabel, isMain } from "../lib/pg.mjs";
import { assertDestructiveAllowed } from "../lib/guard.mjs";

const SEEDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "seeds");

// Same grammar as migrate.mjs: exactly 4 leading digits, then _name.sql. Rejecting
// a variable-width prefix is what makes lexical sort == numeric sort safe.
const SEED_NAME = /^(\d{4})_[A-Za-z0-9][A-Za-z0-9._-]*\.sql$/;
// A seed looks like a seed if it starts with digits + .sql — used to catch a
// badly-named file (e.g. "10_x.sql") instead of silently skipping it.
const SEED_LIKE = /^\d+.*\.sql$/;

/** Read + validate the on-disk seed set (fixed-width grammar + no duplicates). */
function loadSeedFiles(dir) {
  const seeds = [];
  const seen = new Map(); // version -> filename
  for (const file of readdirSync(dir).sort()) {
    if (!SEED_LIKE.test(file)) continue; // not a seed file at all
    const m = SEED_NAME.exec(file);
    if (!m) {
      throw new Error(
        `seed filename "${file}" is malformed — seeds must be fixed-width NNNN_name.sql (four leading digits, e.g. 0002_more.sql). Variable-width prefixes sort incorrectly (10_ before 2_).`,
      );
    }
    const num = m[1];
    if (seen.has(num)) {
      throw new Error(
        `duplicate seed version ${num}: "${seen.get(num)}" and "${file}". Each version number must be unique.`,
      );
    }
    seen.set(num, file);
    seeds.push({ file, num: Number(num) });
  }
  // Numeric order (defensive — fixed width already makes lexical == numeric).
  seeds.sort((a, b) => a.num - b.num);
  return seeds;
}

export async function seed({ log = console.log } = {}) {
  // Seeds truncate — same destructive-target guard as reset (finding 6).
  assertDestructiveAllowed({ action: "seed (truncates + reloads synthetic data)" });

  const seeds = loadSeedFiles(SEEDS_DIR);
  const client = makeClient();
  await client.connect();
  try {
    for (const { file } of seeds) {
      const sql = readFileSync(join(SEEDS_DIR, file), "utf8");
      // Each seed file in its own transaction: a failure rolls THAT file back
      // instead of leaving a half-applied seed.
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw new Error(`seed ${file} failed and was rolled back: ${err.message}`);
      }
      log(`  seeded ${file}`);
    }
    log(`seed: ${seeds.length} seed file(s) applied · target ${targetLabel()}`);
    return { seeded: seeds.length };
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
