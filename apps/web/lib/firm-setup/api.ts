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
// exception is a LOST RESPONSE, where the caller holds the SAME key and presses again so the
// server replays its receipt instead of acting twice; `firmSetupOpKey` below is how a caller keeps
// one stable across a retry, and it is derived from the intent (plan, item, value) so an EDITED
// draft is a new intent with its own key.
//
// HYDRATE-NEVER-TRUST. None of these resolve a value a caller may paint as the new truth: every
// caller re-reads `loadFirmSetup` afterwards (through `useAsyncRead`'s `act`, which reloads
// unconditionally after every write, success or failure).

import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type { FirmSetupEnvelope } from "./types";

type CallOpts = { session?: SessionTokenAccessor; signal?: AbortSignal };

const freshOpKey = (): string => crypto.randomUUID();

/**
 * A STABLE op key for one intent. Same plan + item + value ⇒ same key, so a press after a lost
 * acknowledgement REPLAYS the receipt rather than answering twice; a changed value is a different
 * intent and gets its own key, which is what makes `_reserve_op`'s receipt-hash refusal impossible
 * to trip by accident. FNV-1a in two 32-bit halves, the `answerOpKey` derivation (lib/work/questions.ts:222).
 */
export function firmSetupOpKey(verb: string, plan: string, itemKey: string, value: unknown): string {
  const canonical = JSON.stringify([verb, plan, itemKey, value ?? null]);
  let hi = 0x811c9dc5;
  let lo = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    const c = canonical.charCodeAt(i);
    lo = Math.imul(lo ^ (c & 0xff), 0x01000193) >>> 0;
    hi = Math.imul(hi ^ ((c >>> 8) & 0xff) ^ lo, 0x01000193) >>> 0;
  }
  return `fs:${verb}:${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`;
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
  return callDoor("seed_firm_setup_plan", { p_op_key: opts.opKey ?? freshOpKey() }, opts);
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
    p_op_key: args.opKey ?? firmSetupOpKey("answer", args.plan, args.itemKey, args.answer),
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
    p_op_key: args.opKey ?? firmSetupOpKey("defer", args.plan, args.itemKey, args.reason),
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
    p_op_key: args.opKey ?? firmSetupOpKey("commit", args.plan, "", args.expectedRevision),
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
