import "dotenv/config";
import { baseUrl, postJson } from "./util.js";

// Resumes a parked approval hook.
// Usage: pnpm resume <hookToken> [--deny] [--approver <name>]
const args = process.argv.slice(2);
const token = args.find((a) => !a.startsWith("--"));
if (!token) {
  console.error("usage: pnpm resume <hookToken> [--deny] [--approver <name>]");
  process.exit(1);
}
const approved = !args.includes("--deny");
const approverIdx = args.indexOf("--approver");
const approver = approverIdx >= 0 ? args[approverIdx + 1] : "spike-operator";

try {
  const { status, json } = await postJson("/demo/resume", { token, approved, approver });
  if (status !== 200) {
    console.error(`resume failed (${status}):`, json);
    process.exit(1);
  }
  console.log(`hook resumed: token=${token} approved=${approved} approver=${approver}`);
  console.log(`  runId: ${json.runId}`);
} catch (err) {
  console.error(`Could not reach the worker at ${baseUrl()} - is it running? (pnpm worker)`);
  console.error(String(err));
  process.exit(1);
}
