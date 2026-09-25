// Try every runtime lane DSN through the pooler (names and outcomes only, never a value). LANE_ENV carries
// "NAME=dsn" lines fetched from the probe's environment by the caller. A failed login is retried once after
// 4 s, because the pooler refreshes a stale cached secret on the first wrong-password answer.
import pg from "pg";
const lines = (process.env.LANE_ENV || "").split(/\r?\n/).map((s) => s.trim()).filter((s) => s.includes("="));
for (const line of lines) {
  const name = line.slice(0, line.indexOf("=")); const dsn = line.slice(line.indexOf("=") + 1);
  let role = "?"; try { role = decodeURIComponent(new URL(dsn).username).split(".")[0]; } catch {}
  const pinned = new URL(dsn); pinned.searchParams.set("sslmode", "verify-full"); if (process.env.PGSSLROOTCERT) pinned.searchParams.set("sslrootcert", process.env.PGSSLROOTCERT);
  let verdict = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const c = new pg.Client({ connectionString: pinned.toString(), connectionTimeoutMillis: 20000 });
    try { await c.connect(); const r = await c.query("select current_user"); verdict = `ok (attempt ${attempt}) as ${r.rows[0].current_user.split(".")[0]}`; await c.end(); break; }
    catch (e) { verdict = `FAIL ${e.code || ""} ${e.message.slice(0, 60)}`; if (attempt === 1) await new Promise((r) => setTimeout(r, 4000)); }
  }
  console.log(name.padEnd(36), role.padEnd(28), verdict);
}
