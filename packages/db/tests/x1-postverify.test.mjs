// Extraction slice X1 (0022) — the SHIPPED ceremony post-verify, run VERBATIM.
//
// The artifact the owner runs at the end of the 0022 deploy ceremony
// (packages/db/deploy/extraction-slice-0022-postverify.sql). Running it here is the only
// thing that keeps it honest between deploys: it raises on the first failed invariant, so
// a green run IS the assertion (the wb-0021 idiom). Probe 1 asserts 0022 is the HEAD —
// correct for a ceremony, and false on a rig database once 0023 lands, so this cell opts
// out EXPLICITLY through the GUC the file documents rather than the file weakening its
// own predicate.

import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rootQuery, has0022, fail0022 } from "./x1-helpers.mjs";

const DEPLOY_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "deploy");

test("[0022] the SHIPPED post-verify file passes, run VERBATIM", async () => {
  fail0022(await has0022());
  const sql = readFileSync(join(DEPLOY_DIR, "extraction-slice-0022-postverify.sql"), "utf8");
  await rootQuery(`set local clara.postverify_allow_later = 'on'; ${sql}`);
});
