#!/usr/bin/env node
// THE `reports/` PREFIX POSITIVE READ (design part2 §9, R18/MINOR 25; docs/ops/DR-render.md's
// first "not inherited" ceremony step).
//
// safeKey's live regex admits only `firms/…/docs/…`, and the storage role check is about the
// ROLE, not the PREFIX — so extending the shared `firm-docs` bucket's policy to `reports/` is a
// DELIBERATE act, not something that comes along for free. This script is the evidence that the
// act worked: it PUTs one object under the reports/ prefix and READS IT BACK BY KEY, comparing
// hashes.
//
// WHY A SCRIPT RATHER THAN A LINE IN A RUNBOOK. "The role already works for docs" is an
// inference; "I uploaded an object to reports/ and read the same bytes back" is a read. Without
// this, an unextended policy surfaces as a failed render at the first seal — the worst possible
// moment, because by then a preparer is waiting for a document and the queue has already spent a
// machine on it.
//
// SYNTHETIC BYTES ONLY. The probe object is a fixed JSON payload with no client data in it, and
// its key is derived from its own content hash like every other object in the family — so this
// leaves one inert, content-addressed artifact behind rather than anything a reader could mistake
// for a report. It is a `.json` object, which safeReportKey admits alongside `.pdf`.
//
// Run it at ceremony time, BEFORE the first seal:
//   CLARA_STORAGE_URL=… CLARA_STORAGE_ROLE_JWT=… CLARA_STORAGE_ROLE=… \
//   CLARA_REPORTS_PROBE_FIRM=<firm uuid> node scripts/verify-reports-prefix.mjs

import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  putReportCanonical, safeReportKey, verifyReportCanonical,
} from "../../runtime/lib/storage.mjs";

function fail(message, detail) {
  process.stderr.write(`reports-prefix: FAIL — ${message}\n`);
  if (detail) process.stderr.write(`${detail}\n`);
  process.exit(1);
}

async function main() {
  const firmId = process.env.CLARA_REPORTS_PROBE_FIRM;
  if (!/^[0-9a-f-]{36}$/i.test(String(firmId ?? ""))) {
    fail("CLARA_REPORTS_PROBE_FIRM must be a firm uuid — the probe writes under that firm's prefix, so it is never inferred");
  }
  // Fixed, synthetic, and content-addressed: re-running the probe writes the SAME key, which the
  // x-upsert:false PUT reports as an idempotent duplicate rather than an error.
  const payload = JSON.stringify({
    probe: "clara.reports-prefix/v1",
    purpose: "positive read that the storage role reaches the reports/ prefix",
    synthetic: true,
  });
  const sha256 = createHash("sha256").update(payload, "utf8").digest("hex");
  const key = safeReportKey(`firms/${firmId}/reports/${sha256}.json`);

  const dir = await mkdtemp(join(tmpdir(), "clara-reports-probe-"));
  const file = join(dir, "probe.json");
  try {
    await writeFile(file, payload, "utf8");

    let put;
    try {
      put = await putReportCanonical(file, key, "application/json");
    } catch (err) {
      fail("the PUT under reports/ was refused — the storage role's policy has NOT been extended to this prefix",
        `  key: ${key}\n  cause: ${err?.message ?? err}`);
    }

    // THE READ IS THE EVIDENCE. A successful PUT alone proves only that the write was accepted;
    // reading the object back BY KEY and re-hashing it proves the bytes are retrievable at the
    // address the artifact registry will record. A write nobody read back is not evidence.
    try {
      await verifyReportCanonical(key, sha256);
    } catch (err) {
      fail("the object was written but could not be read back and re-hashed at its key",
        `  key: ${key}\n  cause: ${err?.message ?? err}`);
    }

    process.stdout.write(
      `reports-prefix: PASS — ${put.created ? "wrote" : "found existing"} ${key}\n`
      + `  read back by key and re-hashed: ${sha256}\n`
      + "  the storage role reaches the reports/ prefix; the first seal may proceed.\n",
    );
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => fail(String(err?.message ?? err)));
