import pg from "pg";
const c = new pg.Client({});
await c.connect();
const r = await c.query(process.argv[2]);
for (const row of r.rows) console.log(Object.values(row).map(String).join(" :: "));
await c.end();
