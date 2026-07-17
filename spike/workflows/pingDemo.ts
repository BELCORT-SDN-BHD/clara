import { createHook } from "workflow";
import type { Approval } from "../lib/types.js";

async function pingStep(key: string): Promise<string> {
  "use step";
  return `pong:${key}`;
}

/**
 * DB-free workflow with the same shape as close-demo (step -> hook -> return).
 * Used by `pnpm dryrun` to prove the harness (compiler, registration, start,
 * hook park/resume) against the Local World before DATABASE_URL exists.
 */
export async function pingDemo(key: string) {
  "use workflow";
  const pinged = await pingStep(key);

  const hook = createHook<Approval>({ token: `dryrun:${key}` });
  const approval = await hook;

  return { pinged, approved: approval.approved, approvedBy: approval.approver ?? null };
}
