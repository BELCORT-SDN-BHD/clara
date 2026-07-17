import "dotenv/config";
import { baseUrl, postJson } from "./util.js";

// Starts a close-demo run via the worker's control route.
// Usage: pnpm enqueue [opKey] [amountCents]
const opKey = process.argv[2];
const amountCents = process.argv[3] ? Number(process.argv[3]) : undefined;

try {
  const { status, json } = await postJson("/demo/enqueue", {
    ...(opKey ? { opKey } : {}),
    ...(amountCents !== undefined ? { amountCents } : {}),
  });
  if (status !== 200) {
    console.error(`enqueue failed (${status}):`, json);
    process.exit(1);
  }
  console.log("run started");
  console.log(`  runId:     ${json.runId}`);
  console.log(`  opKey:     ${json.opKey}`);
  console.log(`  amount:    ${json.amountCents} cents`);
  console.log(`  hookToken: ${json.hookToken}`);
  console.log("");
  console.log(`next: pnpm resume ${json.hookToken}`);
} catch (err) {
  console.error(`Could not reach the worker at ${baseUrl()} - is it running? (pnpm worker)`);
  console.error(String(err));
  process.exit(1);
}
