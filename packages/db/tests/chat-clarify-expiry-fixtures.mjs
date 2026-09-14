// #720 Half 1 — THE CHAT LANE'S 14-DAY ENFORCER: the battery's gate, world and planting helpers
// (NOT a test file: the name does not end in `.test.mjs`, so `node --test` ignores it).
//
// BUILT ON TWO EXISTING RIGS RATHER THAN A THIRD WORLD. The Work half of every assertion needs
// #629's world (`work-question-fixtures.mjs` → `work-journal-fixtures.mjs` → `rig-fixtures.mjs`),
// and that world already carries the firms, members and clients a chat session needs — so the chat
// half is built here out of the SAME world through 0006's own verbs (`begin_chat_turn`,
// `open_interruption`) rather than by standing up the Slice-4 rig's second world beside it.
//
// THE FRONTIER GATE keys on the migration's STABLE STEM, never its number — numbers are claimed at
// MERGE (standing law), and a `like '0198_%'` gate would stop gating the moment the file is
// renumbered. `db-slice-frontiers` runs this package against databases pinned at EARLIER
// frontiers, where an unconditional assertion about a not-yet-loosened predicate reds the leg
// while saying nothing about the thing under test.

import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, humanQuery, namedCall, opk, buildWorkWorld, endPool,
  assertRaises, detailOf, noteLane, printLaneNotes, printSkipCount,
  admitJournalWork, claimWorkRun, parkedWork, interruptionRow, expireDueInterruptions,
  questionPayload, twoFields, twoFieldAnswer, answerWorkQuestion, QREASON, CLR,
} from "./work-question-fixtures.mjs";
import { getPool } from "./rig-helpers.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

export {
  ROLES, rootQuery, roleQuery, humanQuery, namedCall, opk, buildWorkWorld, endPool,
  assertRaises, detailOf, noteLane, printLaneNotes, printSkipCount,
  admitJournalWork, claimWorkRun, parkedWork, interruptionRow, expireDueInterruptions,
  questionPayload, twoFields, twoFieldAnswer, answerWorkQuestion, QREASON, CLR, getPool,
};

// ===========================================================================================
// 1 · The frontier gate.
// ===========================================================================================

/** The #720 migration's STABLE STEM. */
export const CHAT_EXPIRY_STEM = "chat_clarify_expiry$";

let _ready = null;
/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
export async function chatExpiryLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [CHAT_EXPIRY_STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

/** `if (await gateChatExpiry(t)) return;` — the house per-cell frontier gate, with a COUNTED skip. */
export async function gateChatExpiry(t) {
  if (await chatExpiryLaneReady()) return false;
  markSkip();
  t.skip(`#720 chat-clarify expiry absent (no ${CHAT_EXPIRY_STEM} migration applied)`);
  return true;
}

// ===========================================================================================
// 2 · The chat half of the world.
//
// A CHAT CLARIFICATION IS OPENED THROUGH THE REAL VERB (`clara.open_interruption`, 0006) wherever
// the deadline does not have to be in the past. `expires_at` is IMMUTABLE (0006), so a
// FOURTEEN-DAY-OLD row cannot be produced by ageing one — it is PLANTED at insert time, which is
// the same idiom `work-question-reads.test.mjs` uses for a past-due Work question and the only way
// to test a fourteen-day deadline without waiting fourteen days.
// ===========================================================================================

/** A chat session owned by `author` in `firm`, parked on a live chat turn. Returns the ids the
 *  cells need: the session, the task, and the turn key that admitted it. */
export async function parkedChatTurn({ firm, author, client = null }) {
  const session = await rootQuery(
    `insert into clara.chat_sessions (firm_id, created_by, client_id, visibility)
       values ($1,$2,$3,'private') returning id`,
    [firm, author, client]).then((r) => r.rows[0].id);
  const turnKey = `w720-${randomUUID().slice(0, 12)}`;
  const receipt = await roleQuery(ROLES.runtime, namedCall("begin_chat_turn", [
    { name: "p_session", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_turn_key", cast: "text" }, { name: "p_user_parts", cast: "jsonb" },
    { name: "p_model", cast: "text" },
  ]), [session, author, turnKey, JSON.stringify([{ type: "text", text: "book this" }]), "gpt-5.6-terra"])
    .then((r) => r.rows[0].result);
  // queued -> running is the engine's own claim; the rig drives it so `open_interruption` can park.
  await rootQuery("update clara.agent_tasks set status='running' where id=$1", [receipt.task_id]);
  return { session, taskId: receipt.task_id, turnKey };
}

/** Open a chat clarification through the REAL runtime verb — a LIVE one (14 days out, 0006's own
 *  default). Parks the task at `awaiting_input` exactly as the chat turn does. */
export async function openChatClarify({ task, hookToken = null, question = null }) {
  const r = await roleQuery(ROLES.runtime, namedCall("open_interruption", [
    { name: "p_task", cast: "uuid" }, { name: "p_hook_token", cast: "text" },
    { name: "p_question", cast: "jsonb" }, { name: "p_asked_of", cast: "uuid" },
  ]), [task, hookToken ?? `w720-hook-${randomUUID()}`,
    JSON.stringify(question ?? { type: "clarify", question: "Which client is this?", context: null }), null]);
  return r.rows[0].result;
}

/** PLANT a past-due chat clarification on `task`: `work_id` NULL, `expires_at` already behind us.
 *  Root-lane INSERT because `expires_at` is immutable and no verb accepts a deadline. `status` is
 *  NOT settable — `clara._tf_interruption_insert` (0006:522) stamps every new row `pending`. */
export async function plantPastDueChatClarify({ task, pastBy = "1 hour" }) {
  const r = await rootQuery(
    `insert into clara.agent_interruptions (task_id, hook_token, question, expires_at)
       values ($1, $2, $3::jsonb, clock_timestamp() - $4::interval)
     returning id`,
    [task, `w720-past-${randomUUID()}`,
      JSON.stringify({ type: "clarify", question: "Which client is this?", context: null, framing: "visible to your firm" }),
      pastBy]);
  // …and PARK the turn, which is what `clara.open_interruption` does for a live clarify (0006:1100)
  // and what a planted row otherwise skips. It is not cosmetic: `running` consumes one of the
  // firm's three compute slots (0006's begin_chat_turn cap) while `awaiting_input` consumes none,
  // so a battery that plants several parked turns in one firm would otherwise refuse itself CLR14.
  await rootQuery(
    "update clara.agent_tasks set status='awaiting_input' where id=$1 and status='running'", [task]);
  return r.rows[0].id;
}

/** PLANT a past-due WORK question on an already-parked Work — the #629 shape, so a single sweep
 *  call can be asserted to move BOTH lanes. Mirrors `work-question-reads.test.mjs`'s own plant. */
export async function plantPastDueWorkQuestion({ task, work, pastBy = "1 hour" }) {
  const r = await rootQuery(
    `insert into clara.agent_interruptions
       (task_id, hook_token, question, expires_at, work_id, client_id, question_version,
        basis_digest, fields)
     select $1, $2, $3::jsonb, clock_timestamp() - $4::interval, w.id, w.client_id,
            1 + (select count(*)::int from clara.agent_interruptions i where i.work_id = w.id),
            w.basis_digest, $5::jsonb
       from clara.accounting_work w where w.id = $6
     returning id`,
    [task, `w720-wq-${randomUUID()}`, JSON.stringify(questionPayload()), pastBy,
      JSON.stringify(twoFields()), work]);
  return r.rows[0].id;
}

/** The human answer door for a CHAT clarify (0006's `answer_interruption`, untouched by #720). */
export async function answerInterruption(sub, { id, answer = { text: "the one you asked about" }, opKey = null }) {
  const r = await humanQuery(sub, namedCall("answer_interruption", [
    { name: "p_id", cast: "uuid" }, { name: "p_answer", cast: "jsonb" }, { name: "p_op_key", cast: "text" },
  ]), [id, JSON.stringify(answer), opKey ?? opk("w720-ans")]);
  return r.rows[0].result;
}

/** Every audit row this sweep wrote for one question id. */
export async function sweepAuditRows(questionId) {
  const r = await rootQuery(
    `select args, args->'work' as work_key, args ? 'work' as has_work_key
       from clara.audit_log
      where fn = 'expire_due_interruptions' and args->>'question' = $1
      order by at`,
    [questionId]);
  return r.rows;
}
