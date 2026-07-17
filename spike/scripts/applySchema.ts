import "dotenv/config";
import { readFileSync } from "node:fs";
import { describeTarget, makeClient, requireDatabaseUrl } from "./util.js";

// Applies schema.sql (idempotent) to the DATABASE_URL database.
const sql = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const client = makeClient();

try {
  await client.connect();
  console.log(`Applying schema.sql to ${describeTarget(requireDatabaseUrl())} ...`);
  await client.query(sql);
  console.log("Domain schema applied (spike.postings / receipts / completions / step_invocations).");
} finally {
  await client.end();
}
