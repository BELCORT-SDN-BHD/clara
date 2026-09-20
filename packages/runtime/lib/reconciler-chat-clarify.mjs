// #764 (Half 2 of #720) — THE CHAT LANE'S CLARIFICATION RECONCILER. The belt that makes the chat
// lane's `hook_missing` resting state safe to enter, and it ships in the SAME change as the
// listener half for exactly that reason: a resting state with nothing to pick it back up is
// strictly worse than the assumption it replaces, which is the argument `lib/control.mjs` and
// migration 0198 §G′ both carried while this module did not exist.
//
// WHAT IT OWNS. A CHAT clarification (`work_id is null`) that is terminal, whose turn is still
// parked at `awaiting_input`, and that is resting in one of the two states in which nobody is
// coming for it:
//
//   ·  `delivery_state = 'hook_missing'` — #764's new resting state. The control listener asked
//      the engine, the run had not moved on, and the hook was not there.
//   ·  `delivery_state = 'delivered'` over a STILL-PARKED turn — the LEGACY state 0198 §R names.
//      The pre-#764 listener stamped `delivered` on HookNotFound with no resume having happened,
//      so the task never left `awaiting_input` and the session's live-turn slot
//      (`uq_agent_task_one_live_turn`, 0006:165) stayed held. The release session counted
//      `chat_rows_delivered_onto_a_still_parked_turn = 0` (#764, 2026-09-14) — and recorded that
//      the zero came from an EMPTY chat backlog, not from the asymmetry having been exercised. An
//      arm that keyed only on `hook_missing` would leave that backlog permanently out of reach, so
//      this one keys on both.
//
// THE SHAPE IS #629's, DELIBERATELY. A grace (a stamp written moments ago is not yet evidence —
// the listener probes BETWEEN the engine consuming the hook and the resumed run's own
// `markRunningStep`), then a SECOND LOOK before anything is written, then a decision. The Work
// lane's twin is `reconciler-work.mjs`'s `questionUnreachableForTask` /
// `confirmQuestionUnreachable` pair; this is the chat-lane half of the same fact, and the two are
// meant to read as one design rather than two.
//
// WHERE IT DIFFERS FROM THE WORK LANE, AND WHY. The Work belt settles from a distance because a
// Work's hook belongs to a run it cannot talk to. This belt RE-PROBES BY RESUMING: the hook token
// is right there on the row, the resume is idempotent-or-provably-already-done (the engine hook is
// single-shot), and a hook that has become reachable again is a turn that should CONTINUE rather
// than be expired away. So the order is: resume first, settle only once the engine has confirmed
// the hook really is gone.
//
// ORDERING INSIDE THE SWEEP IS LOAD-BEARING. This belt is the FIRST belt `runReconcilerSweep`
// runs (#852 moved it there from leader.mjs, which had carried it outside the sweep only because
// of the import edge the leaf above removed), so it runs BEFORE `reconcileTasks`, and that is
// not cosmetic: `terminalFor('awaiting_input', 'lost')` settles a parked chat turn `cancelled`
// with `engine_lost` — a generic engine-truth mirror that says nothing about the question the turn
// was waiting on. For a turn whose clarification is UNREACHABLE the honest terminal is the one the
// chat turn's own parked hook would have produced: `expired`, carrying a `clarify_closed` part. So
// the specific arm decides first and the generic mirror never sees the row. Every OTHER parked
// chat turn — one whose clarify is still pending, or delivered onto a turn that moved on — is
// untouched here and still belongs to `reconcileTasks`.
//
// THE RECEIPT COMES FIRST, the same law `reconciler-work.mjs` states for the Work lane. A chat
// turn's receipt is its DURABLE CHECKPOINTS (`clara.task_checkpoints`, written per segment by
// `checkpointStep`): the words it had already produced before it parked. `settleChatTurnUnreachable`
// reads them and settles with them, so the assistant message records the work that happened AND
// the reason it stopped — never a lone `clarify_closed` written over a turn that had said things.
// (`clara.settle_chat_turn` concatenates the checkpoints itself when handed no parts; this belt
// hands it the concatenation PLUS the closing part, which is the only way to get both.)

// THE ONE hook-not-found predicate and THE ONE resume-payload builder, read from the LEAF that
// declares them (#852). They lived in `control.mjs` until this belt moved inside
// `runReconcilerSweep`: control.mjs imports reconciler.mjs, so THIS edge was the one that closed
// `reconciler -> chat-clarify -> control -> reconciler` and kept the belt — and its counters —
// outside the sweep receipt. lib/hook-resume.mjs imports nothing first-party, so the two symbols
// stay singly-declared AND the graph stays a DAG.
import { isHookNotFound, resumePayloadFor } from "./hook-resume.mjs";
// THE ONE run-not-found predicate in this package, imported from the module that DECLARES it
// (reconciler-documents.mjs) rather than restated — the same edge `control.mjs` and
// `reconciler-work.mjs` take, and for the reason their own comments give: a `/not found/i`
// restatement matches every estate refusal containing those two words, and a false positive here
// settles a live conversation.
import { isRunNotFound } from "./reconciler-documents.mjs";

/** How long a resting stamp must REST before it is evidence. It FOLLOWS the Work lane's question
 *  grace, because it answers the same question — has the estate had a fair chance to finish what
 *  it started — and carries its own knob so the two can be tuned apart if they ever need to be. */
const CHAT_CLARIFY_GRACE =
  process.env.CLARA_CHAT_CLARIFY_GRACE || process.env.CLARA_WORK_QUESTION_GRACE
  || process.env.CLARA_WORK_REENQUEUE_GRACE || "2 seconds";

/** How many rows one cycle may reconcile — the sweep's own per-belt bound, §A/§B's `limit 20`. */
const CHAT_CLARIFY_BATCH = 20;

/**
 * chatTurn's clarify framing — the exact literal `chatTurn.v10.prompt.ts` DECLARES and every later
 * version re-exports. RESTATED here rather than imported, because this module is plain ESM and the
 * prompt module is TypeScript (the same restatement `control-work-question.test.mjs` makes, for the
 * same reason). `control-chat-clarify.test.mjs`'s `chat.part` cell pins the restatement against the
 * declaring file AND against the registry-pinned chatTurn body, so a copy-edit to either is a
 * failing test rather than a conversation that closes with words nothing else uses.
 */
export const CHAT_CLARIFY_FRAMING = "This question and its answer are visible to your firm.";

/**
 * THE CLOSING PART, ONCE. Byte-identical to what the registry-pinned chatTurn pushes on an
 * `expired` resolution (`{ type: "clarify_closed", reason: resolution.kind, framing:
 * CLARIFY_FRAMING }`) — this belt settles a turn the run could not settle itself, so it must close
 * the conversation with the run's own words and not a second vocabulary.
 * PURE.
 */
export function chatClarifyClosedPart() {
  return { type: "clarify_closed", reason: "expired", framing: CHAT_CLARIFY_FRAMING };
}

/**
 * TRUE once `clara.agent_interruptions` carries #629's delivery columns (0180).
 *
 * PROBED FOR ITS COLUMNS FIRST, and that is the deploy-order law this package holds itself to
 * rather than defensiveness: a statement naming a column that does not exist fails at PARSE time,
 * so an ungated read here would break the whole reconcile sweep on a runtime image that started
 * ahead of the migration. Memoised only on TRUE — a database gains the columns exactly once and
 * never loses them, while a FALSE answer must stay re-askable so a long-lived process picks the new
 * lane up after the migration lands instead of needing a restart.
 */
let deliveryColumnsPresent = false;
async function hasDeliveryColumns(client) {
  if (deliveryColumnsPresent) return true;
  const r = await client.query(
    `select count(*)::int as n from information_schema.columns
      where table_schema = 'clara' and table_name = 'agent_interruptions'
        and column_name in ('work_id','delivery_state','delivery_state_at')`,
  );
  deliveryColumnsPresent = (r.rows[0]?.n ?? 0) === 3;
  return deliveryColumnsPresent;
}

/** The task as it is RIGHT NOW — never as the sweep's opening scan remembered it. Returns null when
 *  the row cannot be read, which decides nothing. */
async function readTaskNow(client, taskId, log) {
  try {
    const r = await client.query(
      "select status, workflow_run_id from clara.agent_tasks where id = $1 and kind = 'chat_turn'", [taskId]);
    return r.rows[0] ?? null;
  } catch (err) {
    log(`[reconcile] chat-clarify task read failed task=${taskId}: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * THE TURN'S OWN RECEIPT: its durable per-segment checkpoints, concatenated in segment/element
 * order — exactly the order `clara.settle_chat_turn` itself uses when it is handed no parts
 * (0006:1030-1037). `clara_runtime` holds SELECT on `clara.task_checkpoints` (0006:795).
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {string} taskId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function chatTurnCheckpointedParts(client, taskId) {
  const r = await client.query(
    `select coalesce(jsonb_agg(e.value order by tc.segment, e.ord), '[]'::jsonb) as parts
       from clara.task_checkpoints tc,
            lateral jsonb_array_elements(tc.parts) with ordinality as e(value, ord)
      where tc.task_id = $1`,
    [taskId],
  );
  const parts = r.rows[0]?.parts ?? [];
  return Array.isArray(parts) ? parts : [];
}

/**
 * SETTLE A PARKED CHAT TURN WHOSE CLARIFICATION CAN NEVER BE DELIVERED — receipt first.
 *
 * `expired`, because that is what the turn's own parked hook would have settled on
 * `{kind:'expired'}` and because a parked task may only terminal to expired/cancelled (S4-AB11).
 * The parts are the turn's checkpointed receipt PLUS the closing part, so the conversation records
 * both what happened and why it stopped. `clara.settle_chat_turn` is idempotent by task: a turn
 * that settled itself in the window answers `replayed: true` and nothing is written over it.
 *
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {string} taskId
 * @returns {Promise<{task_id:string, status:string, replayed:boolean, tokens:number}>}
 */
export async function settleChatTurnUnreachable(client, taskId) {
  const parts = await chatTurnCheckpointedParts(client, taskId);
  parts.push(chatClarifyClosedPart());
  const r = await client.query(
    "select clara.settle_chat_turn($1, $2::jsonb, $3, $4, $5) as receipt",
    [taskId, JSON.stringify(parts), 0, "expired", null],
  );
  return r.rows[0]?.receipt ?? null;
}

/**
 * The chat-clarify reconcile belt. Returns its own counters, named so a failed cycle is visible in
 * the sweep receipt rather than only in the log.
 *
 * A CLEAN NO-OP without an injected `resumeHook`: this belt's whole re-probe IS a resume, and a
 * belt that cannot resume must not settle anything on the strength of half a probe. It issues no
 * statement at all in that case — the same posture `reconcileAccountingWorkTasks` takes for its own
 * missing `getRun`.
 *
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{resumeHook?:(token:string,payload:unknown)=>Promise<unknown>, getRun?:Function,
 *          onlyFirm?:string|null, chatClarifyGrace?:string, log?:(m:string)=>void}} deps
 */
export async function reconcileChatClarifies(client, deps = {}) {
  const {
    resumeHook, getRun, onlyFirm = null, chatClarifyGrace = CHAT_CLARIFY_GRACE, log = () => {},
  } = deps;
  const out = {
    chatClarifyResumed: 0, chatClarifyExpired: 0, chatClarifyLanded: 0,
    chatClarifyProbeFailed: 0, chatClarifySettleFailed: 0,
  };
  if (typeof resumeHook !== "function") return out;
  if (!(await hasDeliveryColumns(client))) return out;

  // The two resting states, one scan. `delivery_state_at` is the instant the listener decided
  // (0180); `created_at` stands in for a row stamped by an image that predates that column.
  //
  // NO LEASE IS TAKEN, and none is needed: the sweep is leader-guarded (one sweeper at a time), and
  // NEITHER resting state is reachable by the control listener's own delivery scan — `hook_missing`
  // is excluded by its predicate (control.mjs) and a `delivered` row has a non-null `delivered_at`,
  // which that predicate also excludes. There is no second writer to race.
  const resting = await client.query(
    `select i.id, i.hook_token, i.status, i.answer, i.task_id, i.delivery_state, i.delivered_at
       from clara.agent_interruptions i
       join clara.agent_tasks t on t.id = i.task_id
      where i.work_id is null
        and t.kind = 'chat_turn'
        and t.status = 'awaiting_input'
        and i.status in ('answered','expired','cancelled')
        and (
              (i.delivery_state = 'hook_missing' and i.delivered_at is null)
           or (i.delivery_state = 'delivered' and i.delivered_at is not null)
            )
        and coalesce(i.delivery_state_at, i.created_at) < clock_timestamp() - ($1)::interval
        and ($2::uuid is null or i.firm_id = $2)
      order by i.created_at
      limit ${CHAT_CLARIFY_BATCH}`,
    [chatClarifyGrace, onlyFirm],
  );

  for (const row of resting.rows) {
    // 1 · ASK AGAIN BEFORE SPENDING A RESUME. The scan read the task before the loop; a turn that
    // has LEFT `awaiting_input` since then had its answer land, and resuming it a second time is
    // exactly the double resume this arm must not perform.
    const before = await readTaskNow(client, row.task_id, log);
    if (before === null) continue;                       // unreadable decides nothing
    if (before.status !== "awaiting_input") {
      out.chatClarifyLanded += 1;
      continue;
    }

    // 2 · RE-PROBE BY RESUMING. A hook that is reachable again is a turn that should continue.
    try {
      await resumeHook(row.hook_token, resumePayloadFor(row));
      await stampDelivered(client, row, log);
      out.chatClarifyResumed += 1;
      log(`[reconcile] chat-clarify resumed on the re-probe interruption=${row.id} task=${row.task_id}`);
      continue;
    } catch (err) {
      if (!isHookNotFound(err)) {
        // A transient world error is not evidence of anything. Decide nothing; ask again next sweep.
        out.chatClarifyProbeFailed += 1;
        log(`[reconcile] chat-clarify re-probe failed interruption=${row.id} (${err?.message ?? err}) — deciding nothing this cycle`);
        continue;
      }
    }

    // 3 · THE HOOK IS CONFIRMED GONE — and the window between the two is exactly where a landing
    // resume lives. Ask the TASK once more before writing a terminal over it.
    const after = await readTaskNow(client, row.task_id, log);
    if (after === null) continue;
    if (after.status !== "awaiting_input") {
      out.chatClarifyLanded += 1;
      log(`[reconcile] chat-clarify the turn moved on between the two probes interruption=${row.id} — settling nothing`);
      continue;
    }

    // 4 · AND ASK THE ENGINE. A run state that cannot be READ is neither "gone" nor "alive", and
    // must not be rounded to either: the row stays resting and the next sweep asks again. A run
    // that IS readable settles the turn either way — a terminal or forgotten run has nothing left
    // to resume, and a live run whose single-shot hook is gone is suspended for ever, which is the
    // same fact #629 settles a parked Work on.
    if (typeof getRun !== "function" || !after.workflow_run_id) {
      out.chatClarifyProbeFailed += 1;
      log(`[reconcile] chat-clarify no run to probe for interruption=${row.id} — deciding nothing this cycle`);
      continue;
    }
    let gone;
    try {
      const status = await getRun(after.workflow_run_id).status;
      gone = status === "completed" || status === "failed" || status === "cancelled";
    } catch (err) {
      if (!isRunNotFound(err)) {
        out.chatClarifyProbeFailed += 1;
        log(`[reconcile] chat-clarify run probe failed interruption=${row.id}: ${err?.message ?? err} — deciding nothing this cycle`);
        continue;
      }
      gone = true;                                       // the engine forgot the run entirely
    }

    try {
      const receipt = await settleChatTurnUnreachable(client, row.task_id);
      if (receipt?.replayed === true) {
        out.chatClarifyLanded += 1;                      // the turn settled itself in the window
        continue;
      }
      out.chatClarifyExpired += 1;
      log(`[reconcile] chat-clarify settled expired interruption=${row.id} task=${row.task_id} run=${gone ? "gone" : "suspended with no hook"} — the session's live-turn slot is released`);
    } catch (err) {
      out.chatClarifySettleFailed += 1;
      log(`[reconcile] chat-clarify settle failed task=${row.task_id}: ${err?.message ?? err}`);
    }
  }

  return out;
}

/** Stamp a re-probed delivery that LANDED. `delivered_at` is left alone when it is already set (the
 *  legacy arm's rows carry one), so the instant a row records is never rewritten. */
async function stampDelivered(client, row, log) {
  try {
    await client.query(
      `update clara.agent_interruptions
          set delivered_at = coalesce(delivered_at, now()), delivery_state = 'delivered',
              delivery_state_at = now()
        where id = $1`,
      [row.id],
    );
  } catch (err) {
    // The resume HAPPENED; only the bookkeeping failed. Say so loudly rather than pretending the
    // delivery did not land — the next sweep re-reads the row and, finding the turn moved on,
    // takes the `landed` arm instead of resuming twice.
    log(`[reconcile] chat-clarify delivered stamp failed interruption=${row.id}: ${err?.message ?? err}`);
  }
}
