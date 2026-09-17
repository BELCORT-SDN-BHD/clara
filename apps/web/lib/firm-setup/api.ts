// #648 (journey A5) — the firm setup write seam and its ONE read.
//
// Every call here is an RPC, so it rides `callDoor` (../doors) — the same transport
// `lib/registers/knowledge.ts` uses for `list_client_knowledge`. A read RPC is not a governed act,
// but it is still an RPC POST.
//
// ONE READ, AND NO PARALLEL PATH. `clara.get_firm_setup()` is the only thing this surface reads.
// There is deliberately no `getRows("onboarding_plan_items", …)` beside it: the DB battery proves
// the door, and a second path would mean the battery proves a door the browser never calls.
//
// EVERY WRITE MINTS A FRESH op_key PER ATTEMPT — doors.ts's "never retry a refusal" law. The one
// exception is a LOST RESPONSE, where the caller presses again holding the SAME key AND the same
// arguments, so the server replays its receipt instead of acting twice.
//
// AN OP KEY IS A PROPERTY OF ONE ATTEMPT, NEVER OF AN INTENT. This module used to DERIVE the key
// from (verb, plan, item_key, value), which looks like idempotency and is not: `clara._reserve_op`
// hashes the WHOLE argument list — `p_expected_revision` included (0004_governed_fns.sql:46-60) —
// so the same key against a plan that has moved on is a DIFFERENT request and is refused CLR10
// "op_key reused with different args", permanently. Two consequences, both proven on a real rig by
// `p648.opkey.attempt` (packages/db/tests/firm-setup.test.mjs): a value that was ever recorded
// could never be recorded again (A → B → back to A dead-ends), and the lost-response retry the
// surface advertises always refused, because the surface re-reads the plan before offering it.
//
// So the key is minted here, fresh, per call; the CALLER remembers the exact triple it put on the
// wire (op key + expected revision + answer) and re-sends THAT for a retry — the only thing
// `_reserve_op` replays rather than refuses, because it short-circuits before the CAS check.
//
// HYDRATE-NEVER-TRUST. None of these resolve a value a caller may paint as the new truth: every
// caller re-reads `loadFirmSetup` afterwards (through `useAsyncRead`'s `act`, which reloads
// unconditionally after every write, success or failure).

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type { FirmSetupEnvelope } from "./types";

type CallOpts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** ONE ATTEMPT'S key. Callers that need to replay an attempt keep the key they were handed rather
 *  than deriving a new one that happens to match — see this module's header. */
export function firmSetupOpKey(): string {
  return crypto.randomUUID();
}

/** `clara.get_firm_setup()` — admin+. The plan, every catalogue row with its state, the measured
 *  required-answered/required-total counter, the outstanding required keys and the confirmed firm
 *  profile facts with scope, source, actor and a CURRENT-rank authority verdict. */
export function loadFirmSetup(opts: CallOpts = {}): Promise<FirmSetupEnvelope> {
  return callDoor<FirmSetupEnvelope>("get_firm_setup", {}, opts);
}

/** `clara.seed_firm_setup_plan` — admin+. A RECONCILIATION: only the catalogue rows this firm's
 *  plan is missing are added, and an answer already on the plan is never rewritten or re-asked. */
export function seedFirmSetup(
  opts: CallOpts & { opKey?: string } = {},
): Promise<{ plan_id: string; revision_token: string; seeded: number; catalogue_total: number }> {
  return callDoor("seed_firm_setup_plan", { p_op_key: opts.opKey ?? firmSetupOpKey() }, opts);
}

/** `clara.answer_firm_setup_item` — admin+, and then the catalogue row's own `min_role`. A stale
 *  `expectedRevision` is refused CLR06 with `reason: "stale_plan"`; the caller converges inline. */
export function answerFirmSetupItem(
  args: { plan: string; expectedRevision: string; itemKey: string; answer: unknown; opKey?: string },
  opts: CallOpts = {},
): Promise<{ plan_id: string; revision_token: string; item_key: string; knowledge: unknown }> {
  return callDoor("answer_firm_setup_item", {
    p_plan: args.plan,
    p_expected_revision: args.expectedRevision,
    p_item_key: args.itemKey,
    p_answer: args.answer,
    p_op_key: args.opKey ?? firmSetupOpKey(),
  }, opts);
}

/** `clara.defer_firm_setup_item` — admin+. Only a row that is NOT `required_for_commit`, and only
 *  with a stated reason: the door refuses an empty one rather than recording a blank. */
export function deferFirmSetupItem(
  args: { plan: string; expectedRevision: string; itemKey: string; reason: string; opKey?: string },
  opts: CallOpts = {},
): Promise<{ plan_id: string; revision_token: string; item_key: string; deferred_reason: string }> {
  return callDoor("defer_firm_setup_item", {
    p_plan: args.plan,
    p_expected_revision: args.expectedRevision,
    p_item_key: args.itemKey,
    p_reason: args.reason,
    p_op_key: args.opKey ?? firmSetupOpKey(),
  }, opts);
}

/** `clara.commit_firm_setup` — admin+. Refuses CLR10 `required_items_outstanding`, naming the
 *  catalogue rows still waiting, until every required fact is answered or deferred. */
export function commitFirmSetup(
  args: { plan: string; expectedRevision: string; opKey?: string },
  opts: CallOpts = {},
): Promise<{ plan_id: string; state: string; committed_at: string }> {
  return callDoor("commit_firm_setup", {
    p_plan: args.plan,
    p_expected_revision: args.expectedRevision,
    p_op_key: args.opKey ?? firmSetupOpKey(),
  }, opts);
}

// ---------------------------------------------------------------------------------------------
// DRAFTS. Preserved per user / firm / item — deliberately NOT per revision.
//
// A revision in the key would wipe a half-typed answer every time ANOTHER item on the same plan
// was answered, which is the opposite of the contract ("preserve unsent input… tabs and an
// explanatory Popover do not submit or discard it") and the opposite of what a CLR06 convergence
// is supposed to feel like. The revision the text was typed against is stored INSIDE the value
// instead, so the stale face can say the draft is older than the plan rather than throw it away.
//
// Every access is wrapped: a private window, cleared site data or a browser configured to block
// storage all THROW on access, and a form that cannot remember a draft must still render.
// ---------------------------------------------------------------------------------------------

export function firmSetupDraftKey(scope: { userId: string; firmId: string; itemKey: string }): string {
  return `clara.fs.draft.${scope.userId}.${scope.firmId}.${scope.itemKey}`;
}

export function readFirmSetupDraft(key: string): { value: string; revision: string | null } | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.value !== "string") return null;
    return { value: record.value, revision: typeof record.revision === "string" ? record.revision : null };
  } catch {
    return null;
  }
}

export function writeFirmSetupDraft(key: string, draft: { value: string; revision: string | null }): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(draft));
  } catch {
    /* storage is unavailable — the draft lives in component state for this visit */
  }
}

export function clearFirmSetupDraft(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* nothing to do — see above */
  }
}
