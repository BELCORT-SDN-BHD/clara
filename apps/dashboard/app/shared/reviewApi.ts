// The Wave-A daily-loop wire client (contract §4/§5/§6/§7). Reads + governed writers
// are the HUMAN lane (PostgREST as clara_authenticated) — governance NEVER transits
// the runtime (§4.2); the ONE exception is the document-bytes stream, which rides the
// runtime's private-bucket signed read path (PIN-DELTA-4, the human sees bytes; the
// agent boundary is unchanged). Every writer carries a FRESH op_key per call (house
// idiom); the DB is idempotent on (firm, fn, op_key). All figures come from the DB —
// the UI computes none.

import { rpc, runtimeBase, supabaseBase } from "./wire";
import type { PgrestError } from "./wire";
import {
  toReviewQueue, toEntryDiff, toDocEntryDiff, toLintFindingDetail,
  type ReviewQueue, type EntryDiff, type DocEntryDiff, type LintFindingDetail,
} from "./reviewTypes";
import { toSweepRun, toOpenQuestion, toCodingRule, toCodingLane, type SweepRun, type OpenQuestion, type CodingRule, type CodingLane } from "./reviewCardTypes";
import { toRulePostRun, toAutopostRule, toNotification, type RulePostRun, type AutopostRule, type Notification } from "./reviewCardTypes";

const opKey = () => crypto.randomUUID();

// --- Reads (firm-scoped DEFINER fns; human lane) -------------------------------

export type QueueScope = Record<string, never> | { client_id: string };

/** The one firm review queue (contract §4). Scope `{}` or `{client_id}`; cursor =
 *  the last row's `sort` tuple (validated fail-closed in-fn → CLR10 on malformed). */
export async function listReviewQueue(
  token: string,
  scope: QueueScope,
  cursor: { tuple: string[] } | null,
  limit = 50,
): Promise<ReviewQueue> {
  const out = await rpc("list_review_queue", { p_scope: scope, p_cursor: cursor, p_limit: limit }, token);
  return toReviewQueue(out);
}

export async function getEntryDiff(token: string, entryId: string, clientId: string | null): Promise<EntryDiff> {
  return toEntryDiff(await rpc("get_entry_diff", { p_entry: entryId, p_client: clientId ?? null }, token));
}

export async function getDocEntryDiff(token: string, entryId: string, clientId: string | null): Promise<DocEntryDiff> {
  return toDocEntryDiff(await rpc("get_doc_entry_diff", { p_entry: entryId, p_client: clientId ?? null }, token));
}

export async function getSweepRun(token: string, runId: string): Promise<SweepRun> {
  return toSweepRun(await rpc("get_sweep_run", { p_run: runId }, token));
}

export async function getOpenQuestion(token: string, questionId: string): Promise<OpenQuestion> {
  return toOpenQuestion(await rpc("get_open_question", { p_question: questionId }, token));
}

export async function getCodingRule(token: string, ruleId: string): Promise<CodingRule> {
  return toCodingRule(await rpc("get_coding_rule", { p_rule: ruleId }, token));
}

/** Hydrate one lint finding + its append-only event trail (0017 L1/P18). Viewer
 *  floor; degrades to {finding:null, events:[]} — never throws — when the id is
 *  absent or belongs to another firm (get_lint_finding returns SQL NULL there). */
export async function getLintFinding(token: string, findingId: string): Promise<LintFindingDetail> {
  return toLintFindingDetail(await rpc("get_lint_finding", { p_finding: findingId }, token));
}

/** coding_lane returns table(lane, reasons[]); via PostgREST that is an array of rows. */
export async function getCodingLane(token: string, clientId: string, filingId: string): Promise<CodingLane> {
  const out = await rpc("coding_lane", { p_client: clientId, p_filing: filingId }, token);
  const row = Array.isArray(out) ? out[0] : out;
  return toCodingLane(row);
}

// --- Wave-A2 posted-by-rule + autopost-rule reads (human lane) -------------------
// ASSUMED read fns — the 0015 companion pins the writers + tables but not these
// hydrate reads (see LANE-D-NOTES). Arg names follow the house p_* convention.

/** Hydrate one posted-by-rule receipt (WA2 §6.4). Assumed fn `get_rule_post_run(p_run)`. */
export async function getRulePostRun(token: string, runId: string): Promise<RulePostRun> {
  return toRulePostRun(await rpc("get_rule_post_run", { p_run: runId }, token));
}

/** The autopost rules in scope (WA2 §6). Assumed fn `list_autopost_rules(p_scope)`. */
export async function listAutopostRules(token: string, scope: QueueScope): Promise<AutopostRule[]> {
  const out = await rpc("list_autopost_rules", { p_scope: scope }, token);
  const rows = Array.isArray(out) ? out : ((out as { rules?: unknown })?.rules ?? []);
  return (Array.isArray(rows) ? rows : []).map(toAutopostRule);
}

/** Rule-lifecycle nudges (WA2 §6.2 / L6). Assumed fn `list_notifications(p_scope,p_kinds)`. */
export async function listRuleNotifications(token: string, scope: QueueScope): Promise<Notification[]> {
  const kinds = ["autopost_renew_or_retire", "autopost_rule_expiring", "autopost_rule_retired"];
  const out = await rpc("list_notifications", { p_scope: scope, p_kinds: kinds }, token);
  const rows = Array.isArray(out) ? out : ((out as { notifications?: unknown })?.notifications ?? []);
  return (Array.isArray(rows) ? rows : []).map(toNotification);
}

// --- Governed writers (human lane; fresh op_key per call) ----------------------

/** Batch entry point (WA-R7/WA-D5): structurally refuses is_high_stakes rows in-DB
 *  (CLR05 routine_refuses_high_stakes) then delegates to the approval core. */
export async function approveRoutineEntry(token: string, entryId: string, expectedRevision: string): Promise<void> {
  await rpc("approve_routine_entry", { p_entry: entryId, p_expected_revision: expectedRevision, p_op_key: opKey() }, token);
}

/** Acknowledge a FINALIZED sweep run (WA-R5). Refuses non-finalized (CLR29) + agent identity. */
export async function acknowledgeSweepRun(token: string, runId: string): Promise<void> {
  await rpc("acknowledge_sweep_run", { p_run: runId, p_op_key: opKey() }, token);
}

export async function signCodingRule(token: string, ruleId: string): Promise<void> {
  await rpc("sign_coding_rule", { p_rule: ruleId, p_op_key: opKey() }, token);
}

export async function declineCodingRule(token: string, ruleId: string, reason: string): Promise<void> {
  await rpc("decline_coding_rule", { p_rule: ruleId, p_reason: reason, p_op_key: opKey() }, token);
}

export async function resolveOpenQuestion(token: string, questionId: string, resolution: string): Promise<void> {
  await rpc("resolve_open_question", { p_question: questionId, p_resolution: resolution, p_op_key: opKey() }, token);
}

/** Resolve an OPEN lint finding with a TYPED conclusion + a mandatory note (0017
 *  resolve_lint_finding; bookkeeper+ floor). Raises CLR33 malformed/not-open, CLR11
 *  wrong firm — never a typed {status:'refused'} return, so this stays void like
 *  resolveOpenQuestion/ackComplianceWatch. Fresh op_key per call. */
export async function resolveLintFinding(
  token: string, findingId: string, conclusion: string, note: string,
): Promise<void> {
  await rpc(
    "resolve_lint_finding",
    { p_finding: findingId, p_conclusion: conclusion, p_note: note, p_op_key: opKey() },
    token,
  );
}

export async function dismissOpenQuestion(token: string, questionId: string, reason: string): Promise<void> {
  await rpc("dismiss_open_question", { p_question: questionId, p_reason: reason, p_op_key: opKey() }, token);
}

// --- Wave-A2 governed writers (human lane; fresh op_key per call) ----------------

/** Acknowledge posted-by-rule receipts (WA2 §6.4). Bookkeeper+ floor; agent identity
 *  hard-refused (CLR03). Takes an array so the ack can batch multiple receipts. */
export async function acknowledgeRulePosts(token: string, runIds: string[]): Promise<void> {
  await rpc("acknowledge_rule_posts", { p_run_ids: runIds, p_op_key: opKey() }, token);
}

// --- Wave-A2.1 compliance-watch governed writers (0016 §2.3/§2.4; human lane) ----
// Bookkeeper+ floor; agent identity hard-refused (CLR03). The card hydrates from the
// queue envelope (no get_compliance_watch read); these only WRITE. Each carries a
// mandatory rationale/evidence the DB re-enforces + a fresh op_key (firm,fn,op_key
// idempotent). A resolve/snooze bound violation raises the governed CLR the refusal
// UI renders verbatim.

export async function ackComplianceWatch(token: string, watchId: string, rationale: string): Promise<void> {
  await rpc("ack_compliance_watch", { p_watch: watchId, p_rationale: rationale, p_op_key: opKey() }, token);
}

/** Snooze a watch to a future date (bounded to 60 days in-DB — CLR10 past the cap). */
export async function snoozeComplianceWatch(token: string, watchId: string, until: string, rationale: string): Promise<void> {
  await rpc("snooze_compliance_watch", { p_watch: watchId, p_until: until, p_rationale: rationale, p_op_key: opKey() }, token);
}

/** Resolve a watch with a TYPED conclusion + mandatory evidence
 *  (registration_recorded | not_liable_documented; not-liable is admin+ in-DB). */
export async function resolveComplianceWatch(token: string, watchId: string, conclusion: string, evidence: string): Promise<void> {
  await rpc("resolve_compliance_watch", { p_watch: watchId, p_conclusion: conclusion, p_evidence: evidence, p_op_key: opKey() }, token);
}

// --- Typed rule-write results (0016 ADV-R2#4 / ADV-R3#6) -------------------------
// propose/sign_autopost_rule REFUSE bounds violations as a TYPED HTTP-200 return
// ({status:'refused', reason}) — a durable audited refusal, not an exception. The
// callers must never treat that as success.

export type RuleWriteResult = { status: "ok" } | { status: "refused"; reason: string };

/** Narrow an RPC return into the rule-write union. Anything that is not an
 *  explicit typed refusal is success-shaped (legacy jsonb receipts included). */
export function narrowRuleWrite(out: unknown): RuleWriteResult {
  if (out && typeof out === "object" && (out as { status?: unknown }).status === "refused") {
    const reason = (out as { reason?: unknown }).reason;
    return { status: "refused", reason: typeof reason === "string" ? reason : "refused" };
  }
  return { status: "ok" };
}

/** A typed refusal raised error-shaped (PgrestError-compatible: clr + reason) so
 *  every existing catch path renders it through the refusal UI — never onChanged(). */
export function ruleWriteRefusedError(reason: string): PgrestError {
  const err = new Error(`refused: ${reason}`) as PgrestError;
  err.clr = "CLR27";
  err.reason = reason;
  return err;
}

/** Sign a proposed autopost rule → live (WA2-R8: admin+ only; re-verifies bounds sane,
 *  account postable, one-live). Named in 0015 companion S3. A typed bounds refusal
 *  THROWS error-shaped (rendered by the existing refusal UI). */
export async function signAutopostRule(token: string, ruleId: string): Promise<RuleWriteResult> {
  const r = narrowRuleWrite(await rpc("sign_autopost_rule", { p_rule: ruleId, p_op_key: opKey() }, token));
  if (r.status === "refused") throw ruleWriteRefusedError(r.reason);
  return r;
}

/** Retire a live/proposed autopost rule (WA2 §6.2 lifecycle). ASSUMED fn
 *  `retire_autopost_rule(p_rule,p_reason,p_op_key)` — the companion names only the
 *  reconciler auto-retire on expiry; the manual retire fn is unpinned (LANE-D-NOTES). */
export async function retireAutopostRule(token: string, ruleId: string, reason: string): Promise<void> {
  await rpc("retire_autopost_rule", { p_rule: ruleId, p_reason: reason, p_op_key: opKey() }, token);
}

/** Human-author an autopost-rule proposal (WA2 §6.2: bookkeeper+ may propose; only
 *  admin+ signs). Named in 0015 companion S3; args ride a jsonb proposal per the house
 *  "new inputs ride existing jsonb params, never change arity" law (ASSUMED shape). */
export async function proposeAutopostRule(token: string, proposal: Record<string, unknown>): Promise<RuleWriteResult> {
  const r = narrowRuleWrite(await rpc("propose_autopost_rule", { p_proposal: proposal, p_op_key: opKey() }, token));
  if (r.status === "refused") throw ruleWriteRefusedError(r.reason);
  return r;
}

// --- Document bytes (PIN-DELTA-4; runtime signed read path) ---------------------

export type DocumentBytes = { blobUrl: string; mime: string; revoke: () => void };

/** Stream a document's bytes for the human viewer via the runtime route (Bearer
 *  session JWT). The browser never holds a storage credential. The caller MUST call
 *  `revoke()` on unmount to release the object URL. Throws on any non-2xx (the card
 *  degrades to its honest "document unavailable" state). */
export async function fetchDocumentBytes(token: string, documentId: string): Promise<DocumentBytes> {
  const base = runtimeBase();
  const res = await fetch(`${base}/api/documents/${encodeURIComponent(documentId)}/bytes`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`document bytes failed (${res.status})`);
  const mime = res.headers.get("content-type") ?? "application/octet-stream";
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, mime, revoke: () => URL.revokeObjectURL(blobUrl) };
}

/** True when PostgREST is configured — the cards gate their human-lane reads on it
 *  (the honest "not configured" state, mirroring the /documents page). */
export function pgrestConfigured(): boolean {
  return supabaseBase() !== null;
}
