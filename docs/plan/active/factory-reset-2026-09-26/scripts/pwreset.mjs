// Re-set the passwords of the three re-minted login roles from the DSNs the runtime already holds.
// Runs as the child of via-probe.sh (DATABASE_URL = postgres over the pooler). LANE_DSNS carries the
// three lane DSNs, one per line, fetched from the probe's environment by the caller; nothing is printed
// except the role names and a count. Pooler usernames are "<role>.<projectref>"; the role is the part
// before the dot.
import pg from "pg";
const dsns = (process.env.LANE_DSNS || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
if (dsns.length !== 3) { console.log("expected 3 lane DSNs, got", dsns.length); process.exit(2); }
const c = new pg.Client({ connectionString: process.env.DATABASE_URL});
await c.connect();
let n = 0;
for (const d of dsns) {
  const u = new URL(d);
  const role = decodeURIComponent(u.username).split(".")[0];
  const pw = decodeURIComponent(u.password);
  if (!/^clara_(auth_wall|invite_preview|stripe_webhook)_login$/.test(role)) { console.log("unexpected role, skipped:", role); continue; }
  const exists = await c.query("select 1 from pg_roles where rolname = $1", [role]);
  if (!exists.rowCount) { console.log("role missing (the chain should have minted it):", role); process.exitCode = 3; continue; }
  await c.query(`alter role "${role}" with login password '${pw.replace(/'/g, "''")}'`);
  const pinned = new URL(d); pinned.searchParams.set("sslmode", "verify-full"); if (process.env.DIRECT_HOST) { pinned.hostname = process.env.DIRECT_HOST; pinned.port = "5432"; pinned.username = role; pinned.searchParams.delete("sslrootcert"); pinned.searchParams.delete("uselibpqcompat"); } else if (process.env.PGSSLROOTCERT) pinned.searchParams.set("sslrootcert", process.env.PGSSLROOTCERT);
  const probe = new pg.Client({ connectionString: pinned.toString() });
  try { await probe.connect(); const r = await probe.query("select current_user"); console.log("ok", role, "login verified as", r.rows[0].current_user.split(".")[0]); n++; await probe.end(); }
  catch (e) { console.log("LOGIN FAILED after reset for", role, e.code || "", e.message.slice(0, 80)); process.exitCode = 4; }
}
console.log("passwords re-set:", n, "of 3");
await c.end();
