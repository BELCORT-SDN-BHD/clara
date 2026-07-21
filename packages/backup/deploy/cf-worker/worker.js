// clara-backup — OPTIONAL Cloudflare Worker freshness monitor (CORROBORATION ONLY).
//
// The PRIMARY absence alarm is the dead-man's-switch (healthchecks.io): the backup job
// pings on success; no ping within the 26h grace ⇒ healthchecks emails tools@belcort.com.
// This Worker is a SECOND, independent signal that also catches "pinged success but
// uploaded nothing / a stale object" — it lists the R2 db-snapshots prefix on a cron and
// alerts when the NEWEST snapshot is older than the freshness threshold (26h, matching the
// docs/ops/DR.md §7 "backup age > 26h" SLO).
//
// A lone Worker's own death is silent, so this NEVER replaces the dead-man's-switch — it
// corroborates it. Bindings/vars are declared in wrangler.toml (see wrangler.toml.example):
//   [[r2_buckets]] binding = "DR_BUCKET"           → the R2 DR bucket
//   [vars] SNAPSHOT_PREFIX = "db-snapshots/"        → where the dated DB snapshots land
//   [vars] MAX_AGE_HOURS   = "26"
//   [vars] ALERT_WEBHOOK   = "https://…"            → a webhook that emails the owner
//                                                     (or wire Cloudflare Email Routing)

const DEFAULT_PREFIX = "db-snapshots/";
const DEFAULT_MAX_AGE_HOURS = 26;

async function newestSnapshotAgeMs(bucket, prefix) {
  let newest = null;
  let cursor;
  // R2 list is paginated; walk it so a busy prefix does not hide the newest object.
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const obj of page.objects) {
      if (!newest || obj.uploaded > newest) newest = obj.uploaded;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  if (!newest) return { newest: null, ageMs: Infinity };
  return { newest, ageMs: Date.now() - newest.getTime() };
}

async function alert(env, message) {
  if (!env.ALERT_WEBHOOK) {
    console.log(`clara-backup-freshness ALERT (no ALERT_WEBHOOK configured): ${message}`);
    return;
  }
  try {
    await fetch(env.ALERT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "clara-backup-freshness", severity: "critical", message }),
    });
  } catch (e) {
    console.log(`clara-backup-freshness: alert webhook failed — ${e.message}`);
  }
}

export default {
  async scheduled(_event, env, _ctx) {
    const prefix = env.SNAPSHOT_PREFIX || DEFAULT_PREFIX;
    const maxAgeMs = (Number(env.MAX_AGE_HOURS) || DEFAULT_MAX_AGE_HOURS) * 3600 * 1000;
    const { newest, ageMs } = await newestSnapshotAgeMs(env.DR_BUCKET, prefix);
    if (newest === null) {
      await alert(env, `NO DR snapshot found under ${prefix} — the off-site backup has never landed or the bucket/prefix is wrong.`);
      return;
    }
    if (ageMs > maxAgeMs) {
      const ageH = (ageMs / 3600 / 1000).toFixed(1);
      await alert(env, `DR snapshot STALE: newest under ${prefix} is ${ageH}h old (threshold ${(maxAgeMs / 3600 / 1000)}h). The daily backup may have failed silently.`);
    } else {
      console.log(`clara-backup-freshness OK: newest snapshot ${(ageMs / 3600 / 1000).toFixed(1)}h old.`);
    }
  },
};
