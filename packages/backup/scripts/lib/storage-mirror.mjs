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

// Supabase Storage `list` returns at most this many rows per call; a prefix with more
// objects MUST be paged (offset += PAGE_SIZE) until a short/empty page, or the tail is
// silently dropped and the backup reports a false SUCCESS with an incomplete evidence
// archive — a DR-correctness hole (Wave A2 FIX-13).
const PAGE_SIZE = 1000;

function hdrs(cfg) {
  const key = readSecretFile(cfg.storageKeyFileEnv, "the Supabase service_role key (firm-docs LIST/READ)");
  return { Authorization: `Bearer ${key}`, apikey: key };
}

/**
 * Object names come from the Storage API; before one is turned into a LOCAL filesystem
 * path (join(encStageDir, path)) or spliced into a fetch URL, refuse path-traversal and
 * absolute escapes. Legitimate firm-docs names are `firms/<uuid>/docs/<sha>.<ext>` and
 * never contain a ".." segment or a leading separator. Fail-closed: an anomalous name
 * means the mirror cannot be trusted complete, so we abort the whole run (Wave A2 FIX-16).
 */
export function assertSafeObjectName(name, path = name) {
  for (const s of [name, path]) {
    if (typeof s !== "string" || s === "") throw new Error("storage: refusing empty/invalid object name");
    if (s.includes("\0")) throw new Error(`storage: refusing object name with a NUL byte: ${JSON.stringify(s)}`);
    if (s.startsWith("/") || s.startsWith("\\")) throw new Error(`storage: refusing object name with a leading separator: ${JSON.stringify(s)}`);
    if (s.split(/[\\/]/).includes("..")) throw new Error(`storage: refusing object name containing a ".." segment: ${JSON.stringify(s)}`);
  }
}

async function listPage(base, bucket, h, prefix, offset) {
  const res = await fetch(`${base}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } }),
  });
  if (!res.ok) throw new Error(`storage list ${prefix || "(root)"} @offset ${offset} -> HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`storage list ${prefix || "(root)"} -> non-array response`);
  return rows;
}

/**
 * Recursively list every object under `prefix`, PAGING each prefix to exhaustion and
 * de-duplicating by path (offset paging can repeat a boundary row). Returns one entry
 * per distinct object, carrying its source-reported size for the download-integrity check.
 */
export async function listAll(base, bucket, h, prefix = "", seen = new Map()) {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const rows = await listPage(base, bucket, h, prefix, offset);
    if (rows.length === 0) break;
    for (const item of rows) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      assertSafeObjectName(item.name, path);
      if (item.id === null) {
        await listAll(base, bucket, h, path, seen); // a "folder" placeholder — recurse (own paging)
      } else if (!seen.has(path)) {
        seen.set(path, {
          path,
          mimetype: item.metadata?.mimetype || "application/octet-stream",
          size: item.metadata?.size ?? null,
        });
      }
    }
    if (rows.length < PAGE_SIZE) break; // last (short) page for this prefix
  }
  return [...seen.values()];
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
    if (o.size != null && Number(o.size) !== buf.length) {
      // Source-reported size disagreeing with the bytes we actually received is a
      // TRUNCATED/short download — a copy failure, not a source-side quirk. Fail the run
      // rather than record an incomplete object into the DR archive (Wave A2 FIX-13).
      throw new Error(`storage download ${o.path} size mismatch — source reports ${o.size} byte(s), received ${buf.length}; refusing to record an incomplete mirror.`);
    }
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

  // DR-CORRECTNESS GATE (Wave A2 FIX-13): every listed object must have been downloaded
  // and recorded in the manifest index, and the tallied bytes must equal the sum of what
  // we indexed. A silently short-listed prefix or a dropped object surfaces HERE as a hard
  // failure — never a green run reporting SUCCESS over an incomplete evidence archive.
  if (index.length !== objects.length) {
    throw new Error(`mirror(firm-docs): manifest incomplete — listed ${objects.length} object(s) but indexed ${index.length}.`);
  }
  const indexBytes = index.reduce((n, e) => n + e.bytes, 0);
  if (indexBytes !== totalBytes) {
    throw new Error(`mirror(firm-docs): byte accounting diverged — index sums ${indexBytes} but running tally is ${totalBytes}.`);
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
