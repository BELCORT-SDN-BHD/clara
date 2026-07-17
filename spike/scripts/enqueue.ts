import "dotenv/config";
import { baseUrl, postJson } from "./util.js";

// Starts a close-demo run via the worker's control route.
// Usage: pnpm enqueue [opKey] [amountCents] [--v2]
// --v2 targets the name-versioned closeDemoV2 workflow (T6 mitigation).
const args = process.argv.slice(2);
const useV2 = args.includes("--v2");
const positional = args.filter((a) => !a.startsWith("--"));
const opKey = positional[0];
const amountCents = positional[1] ? Number(positional[1]) : undefined;

try {
  const { status, json } = await postJson("/demo/enqueue", {
    ...(opKey ? { opKey } : {}),
    ...(amountCents !== undefined ? { amountCents } : {}),
    ...(useV2 ? { workflow: "v2" } : {}),
  });
  if (status !== 200) {
    console.error(`enqueue failed (${status}):`, json);
    process.exit(1);
  }
  console.log("run started");
  console.log(`  runId:     ${json.runId}`);
  console.log(`  opKey:     ${json.opKey}`);
  console.log(`  amount:    ${json.amountCents} cents`);
  console.log(`  workflow:  ${json.workflow ?? "closeDemo"}`);
  console.log(`  hookToken: ${json.hookToken}`);
  console.log("");
  console.log(`next: pnpm resume ${json.hookToken}`);
} catch (err) {
  console.error(`Could not reach the worker at ${baseUrl()} - is it running? (pnpm worker)`);
  console.error(String(err));
  process.exit(1);
}
