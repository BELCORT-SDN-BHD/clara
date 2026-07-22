// rclone → Cloudflare R2 (S3-compatible). The R2 API token NEVER appears in argv:
// it lives in rclone.conf (pointed at by RCLONE_CONFIG) or in RCLONE_CONFIG_<REMOTE>_*
// env vars, which the child inherits. These wrappers pass only the remote NAME,
// bucket, and paths on the command line.
//
// Custody rule: firm-document bytes are WRITE-ONCE and DELETE-NEVER, so the byte
// mirror uses `rclone copy` (additive) — never `sync` (which would delete on the
// destination to mirror a source deletion). The dated DB snapshots are pruned by an
// R2 Object-Lifecycle rule (or `rclone delete --min-age` as a fallback), not by sync.
import { spawnSync } from "node:child_process";

function run(rclone, args, { capture = false } = {}) {
  const r = spawnSync(rclone, args, {
    stdio: capture ? ["ignore", "pipe", "inherit"] : ["ignore", "inherit", "inherit"],
    encoding: "utf8",
    env: process.env, // carries RCLONE_CONFIG / RCLONE_CONFIG_<REMOTE>_* — never argv
  });
  if (r.error) throw new Error(`rclone failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`rclone ${args[0]} exited ${r.status}`);
  return capture ? r.stdout : null;
}

/** List existing object keys (relative to prefix) — used for the incremental mirror. */
export function rcloneListKeys({ remote, bucket, prefix, rclone = "rclone" }) {
  const dest = `${remote}:${bucket}/${prefix}`.replace(/\/+$/, "") + "/";
  const out = run(rclone, ["lsf", "--recursive", "--files-only", dest], { capture: true }) || "";
  return new Set(out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
}

/** Additive copy of a local dir into remote:bucket/destPrefix (never deletes). */
export function rcloneCopyDir({ srcDir, remote, bucket, destPrefix, rclone = "rclone", args = [], log = console.log }) {
  const dest = `${remote}:${bucket}/${destPrefix}`.replace(/\/+$/, "");
  log(`r2: rclone copy ${srcDir} -> ${remote}:${bucket}/${destPrefix}`);
  run(rclone, ["copy", "--immutable", ...args, srcDir, dest]);
}

/** Additive copy of a single local file into remote:bucket/destPrefix. */
export function rcloneCopyFile({ srcFile, remote, bucket, destPrefix, rclone = "rclone", log = console.log }) {
  const dest = `${remote}:${bucket}/${destPrefix}`.replace(/\/+$/, "");
  log(`r2: rclone copyto ${srcFile} -> ${remote}:${bucket}/${destPrefix}`);
  run(rclone, ["copy", srcFile, dest]);
}
