// firm-docs byte mirror — the document BYTES live in Supabase Storage (S3-backed),
// NOT in Postgres, so the DB dump captures neither the bytes nor storage.objects. We
// mirror them via the Storage REST API (the DR-drill storage-copy.mjs pattern),
// verifying the content-address (object names are firms/<uuid>/docs/<sha256>.<ext> —
// a built-in integrity anchor) on download.
//
// R2 layout = an INCREMENTAL, INDIVIDUALLY age-ENCRYPTED mirror under a single
// near-static prefix `firm-docs-mirror/`. firm-docs are write-once + content-addressed,
// so an object once encrypted+uploaded never changes: we encrypt+stage ONLY objects
// whose `.age` key is not already in R2 (existingKeys), and the orchestrator `rclone
// copy`s them (additive; delete-never). This avoids re-storing the whole ~GB mirror
// every day (docs/ops/DR.md §9 retention). age is non-deterministic, so we must NOT
// re-encrypt already-present objects — the existingKeys skip is what keeps it stable.
//
// The service_role key is read LAZILY from a file named by env and is NEVER logged.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ageEncryptBuffer } from "./bundle.mjs";
import { readSecretFile } from "./env.mjs";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const expectedShaOf = (path) => (path.match(/\/docs\/([0-9a-f]{64})\.[a-z0-9]{1,12}$/) || [])[1] || null;

function hdrs(cfg) {
  const key = readSecretFile(cfg.storageKeyFileEnv, "the Supabase service_role key (firm-docs LIST/READ)");
  return { Authorization: `Bearer ${key}`, apikey: key };
}

async function listAll(base, bucket, h, prefix = "") {
  const out = [];
  const res = await fetch(`${base}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
  });
  if (!res.ok) throw new Error(`storage list ${prefix || "(root)"} -> HTTP ${res.status}`);
  for (const item of await res.json()) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) out.push(...(await listAll(base, bucket, h, path)));
    else out.push({ path, mimetype: item.metadata?.mimetype || "application/octet-stream", size: item.metadata?.size ?? null });
  }
  return out;
}

/**
 * Download + verify + incrementally encrypt the firm-docs mirror.
 * @returns {Promise<{
 *   count: number, totalBytes: number, combinedSha256: string,
 *   newEncrypted: number, addressMismatches: number,
 *   index: {path:string,sha256:string,bytes:number,mimetype:string}[],
 *   encStageDir: string | null
 * }>}
 */
export async function mirrorFirmDocs({ cfg, runDir, recipients, existingKeys = new Set(), ageBin = "age", log = console.log }) {
  if (cfg.dryRun) {
    log("mirror(firm-docs): DRY-RUN — skipping Storage REST calls; wiring only.");
    return { count: 0, totalBytes: 0, combinedSha256: "", newEncrypted: 0, addressMismatches: 0, index: [], encStageDir: null };
  }
  const base = cfg.storageUrl;
  const bucket = cfg.storageBucket;
  const h = hdrs(cfg);
  const encStageDir = join(runDir, "firm-docs-enc");
  mkdirSync(encStageDir, { recursive: true });

  const objects = await listAll(base, bucket, h);
  log(`mirror(firm-docs): ${objects.length} object(s) in ${bucket}`);

  const index = [];
  const shaList = [];
  let totalBytes = 0;
  let newEncrypted = 0;
  let addressMismatches = 0;

  for (const o of objects) {
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${o.path}`, { headers: h });
    if (!res.ok) throw new Error(`storage download ${o.path} -> HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = sha256(buf);
    const want = expectedShaOf(o.path);
    if (want && hash !== want) {
      // A false content-address is a SOURCE-side finding, not a copy failure (the bytes
      // still round-trip). Mirror the REAL bytes, record, continue (storage-copy.mjs precedent).
      addressMismatches++;
      log(`mirror(firm-docs): WARN content-address FALSE ${o.path} (name ${want.slice(0, 12)}… vs bytes ${hash.slice(0, 12)}…; copied faithfully)`);
    }
    index.push({ path: o.path, sha256: hash, bytes: buf.length, mimetype: o.mimetype });
    shaList.push(hash);
    totalBytes += buf.length;

    const encKey = `${o.path}.age`;
    if (existingKeys.has(encKey)) continue; // already in R2 — write-once, never re-encrypt
    const outPath = join(encStageDir, `${o.path}.age`);
    mkdirSync(dirname(outPath), { recursive: true });
    ageEncryptBuffer({ input: buf, outPath, recipients, age: ageBin });
    newEncrypted++;
  }

  // Order-independent fingerprint of "which docs exist" — carried by the UN-encrypted
  // manifest WITHOUT exposing any client uuid path.
  const combinedSha256 = sha256(Buffer.from(shaList.sort().join("\n"), "utf8"));

  // The DETAILED per-object index (carries client uuid paths) goes INSIDE the encrypted
  // bundle only — written to the bundle dir by the orchestrator, never to the plaintext manifest.
  return {
    count: objects.length,
    totalBytes,
    combinedSha256,
    newEncrypted,
    addressMismatches,
    index,
    encStageDir,
  };
}

/** Persist the detailed firm-docs index into the (to-be-encrypted) bundle dir. */
export function writeFirmDocsIndex({ bundleDir, index, log = console.log }) {
  const out = join(bundleDir, "firm-docs-index.json");
  writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), objects: index }, null, 2));
  log(`mirror(firm-docs): detailed index (${index.length} objects) -> ${out} (encrypted with the bundle)`);
  return out;
}
