// #764 — THE CHAT LANE'S HONEST DELIVERY POSTURE (Half 2 of #720). Real Postgres, MOCKED WORLD
// (resumeHook / getRun are injected), so every cell below is deterministic: no engine, no network,
// no sleeping on a real hook. The sibling battery for the WORK lane is
// `control-work-question.test.mjs` (#629); this file is its chat-lane twin and deliberately mirrors
// its shape rather than inventing a second one.
//
// WHAT THIS FILE RETIRES. `deliverInterruptions` stamped `delivered_at` on ANY HookNotFoundError
// raised for a CHAT clarification — the pre-0180 assumption, kept deliberately through #629 and
// #720 Half 1 because a chat turn had no reconciler to pick a `hook_missing` row back up. The cost
// is the one 0198 §R names: the task never leaves `awaiting_input`, the session's live-turn slot
// (`uq_agent_task_one_live_turn`, 0006:165) stays held, and every further message in that
// conversation is refused CLR13 — while the books say the answer was delivered. #764 gives the lane
// BOTH halves at once: the resting state AND the reconciler arm that settles it.
//
// THE LEGACY STATE IS AN ARM OF ITS OWN. 0198 §R's release query counted the rows the pre-#764
// listener had already stamped `delivered` onto a still-parked turn
// (`chat_rows_delivered_onto_a_still_parked_turn`). The release session recorded **0** for it
// (#764, belcorttao 2026-09-14) because the chat backlog was 0, NOT because the asymmetry was
// exercised — so the arm still has to key on that state, and the cell at the end of this file is
// what keeps it keyed on it.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { deliverInterruptions, expirePastDueInterruptions } from "../lib/control.mjs";
import { CHAT_CLARIFY_FRAMING, chatClarifyClosedPart, reconcileChatClarifies } from "../lib/reconciler-chat-clarify.mjs";
import * as rig from "./rig.mjs";

/** #720 Half 1 (migration 0198) is this ticket's stated precondition: the 14-day expiry applies to
 *  chat rows. Gated on the migration's STABLE STEM, never its number — numbers are claimed at
 *  merge, and this battery runs against databases pinned at earlier frontiers. */
async function chatExpiryReady() {
  try {
    const r = await rig.rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ 'chat_clarify_expiry$'");
    return (r.rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

const READY = (await rig.runtimeReady()) && (await chatExpiryReady());
const SKIP = READY ? false : "migration 0198 (#720 Half 1, chat-clarify expiry) is not on this database";

after(async () => {
  await rig.endPool();
});

const hookNotFound = () => {
  const e = new Error("Hook not found");
  e.name = "HookNotFoundError";
  throw e;
};
const runStatus = (status) => () => ({ status: Promise.resolve(status) });
/** The run the engine has FORGOTTEN — `getRun` itself throws, which is how a reaped run looks. */
const runReaped = () => {
  throw Object.assign(new Error("run not found"), { name: "RunNotFoundError" });
};

/** A chat turn, bound to a run, with ONE checkpointed segment of real work behind it, parked on a
 *  PAST-DUE clarification that the expiry sweep has already moved to `expired`. Every step through
 *  the lane's own verbs — `begin_chat_turn`, `checkpoint_turn`, `expire_due_interruptions`. */
async function parkedChatClarify(label) {
  const { owner, firm, client } = await rig.buildFirm(label);
  const session = await rig.createChatSession({ author: owner, client });
  const { task_id: taskId } = await rig.beginChatTurn({ session, author: owner, turnKey: `t1-${label}-${randomUUID()}` });
  const runId = `run-${label}-${randomUUID()}`;
  await rig.bindRun(taskId, runId);                       // queued -> running, with an engine run
  // The turn's OWN EFFECT, durably recorded before it parked. The settle this ticket adds must
  // carry it into the assistant message rather than writing a lone `clarify_closed` over it.
  await rig.checkpointTurn({ task: taskId, segment: 0, tokens: 11, parts: [{ type: "text", text: `working on ${label}` }] });
  await rig.driveTask(taskId, ["awaiting_input"]);
  const clarifyId = await rig.insertInterruption({ task: taskId, expiresInDays: -1 });
  const swept = await rig.asRuntime((c) => expirePastDueInterruptions(c, { onlyFirm: firm }));
  assert.equal(swept.expired, 1, "fixture: the past-due chat clarification is swept by #720's enforcer");
  return { owner, firm, client, session, runId, taskId, clarifyId };
}

/** Drive ONE control cycle whose hook is gone while the engine still believes the run is alive —
 *  the state #764 gives the chat lane a name for. */
async function restAtHookMissing(p) {
  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: hookNotFound, getRun: runStatus("running"), onlyFirm: p.firm }));
  return res;
}

/** Push a `delivery_state` stamp back past any plausible grace. `delivery_state_at` is in the
 *  trigger's FREE set (runtime bookkeeping), so this is a lawful write, not a doctored row — the
 *  same idiom `control-work-question.test.mjs`'s own `ageHookMissing` uses. */
async function ageDeliveryState(clarifyId, interval = "1 hour") {
  await rig.rootQuery(
    "update clara.agent_interruptions set delivery_state_at = clock_timestamp() - ($2)::interval where id = $1",
    [clarifyId, interval]);
}

// ===========================================================================================
// 1 · THE RESTING STATE. HookNotFound on a chat row is no longer delivery.
// ===========================================================================================

test("chat.hook-missing: a live run whose hook is gone is NOT delivered — the chat row rests at hook_missing with a timestamp", { skip: SKIP }, async () => {
  const p = await parkedChatClarify("cc764a");

  const res = await restAtHookMissing(p);
  assert.equal(res.delivered, 0, "hook-missing: nothing was delivered, and nothing pretends otherwise");
  assert.equal(res.hookMissing, 1, "hook-missing: the chat row is counted as what it is");

  const row = await rig.readInterruption(p.clarifyId);
  assert.equal(row.delivered_at, null, "hook-missing: the row is NOT stamped delivered");
  assert.equal(row.delivery_state, "hook_missing");
  assert.ok(row.delivery_state_at instanceof Date, "hook-missing: …and the rest carries its own instant");
  assert.equal(row.claim_lease_until, null, "hook-missing: the lease is released rather than left to rot");
  assert.equal((await rig.readTask(p.taskId)).status, "awaiting_input",
    "hook-missing: the turn is still parked — the reconciler, not the listener, settles it");
});

test("chat.hook-missing: a TERMINAL run still proves the resume already landed — stamp delivered", { skip: SKIP }, async () => {
  const p = await parkedChatClarify("cc764b");
  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: hookNotFound, getRun: runStatus("completed"), onlyFirm: p.firm }));
  assert.equal(res.delivered, 1, "hook-missing: a completed run consumed its hook — that IS delivery, for chat as for Work");
  assert.equal(res.hookMissing, 0);
  assert.equal((await rig.readInterruption(p.clarifyId)).delivery_state, "delivered");
});

test("chat.hook-missing: a row already at hook_missing is not re-leased by the delivery scan", { skip: SKIP }, async () => {
  const p = await parkedChatClarify("cc764c");
  await restAtHookMissing(p);

  let attempts = 0;
  const res = await rig.asRuntime((c) =>
    deliverInterruptions(c, { resumeHook: async () => { attempts += 1; }, getRun: runStatus("running"), onlyFirm: p.firm }));
  assert.equal(res.leased, 0, "hook-missing: NO RESUME STORM — the scan excludes it; the reconciler owns it now");
  assert.equal(attempts, 0);
  assert.equal((await rig.readInterruption(p.clarifyId)).delivery_attempts, 1,
    "hook-missing: and no second attempt is spent on it per poll");
});

// ===========================================================================================
// 2 · THE RECONCILER ARM. After the grace it re-probes, and the two answers are different.
// ===========================================================================================

test("chat.reconcile: hook missing then RUN ALIVE — the re-probe resumes it and the turn is not settled", { skip: SKIP }, async () => {
  const p = await parkedChatClarify("cc764d");
  await restAtHookMissing(p);
  await ageDeliveryState(p.clarifyId);

  const payloads = [];
  const out = await rig.asRuntime((c) =>
    reconcileChatClarifies(c, {
      resumeHook: async (_token, payload) => { payloads.push(payload); },
      getRun: runStatus("running"),
      onlyFirm: p.firm,
    }));
  assert.equal(out.chatClarifyResumed, 1, "reconcile: a run that is alive is RESUMED, not expired away");
  assert.equal(out.chatClarifyExpired, 0);
  assert.deepEqual(payloads, [{ kind: "expired" }],
    "reconcile: the parked hook is resumed with the resolution the chat turn is already typed for");

  const row = await rig.readInterruption(p.clarifyId);
  assert.notEqual(row.delivered_at, null, "reconcile: the delivery that finally landed is stamped");
  assert.equal(row.delivery_state, "delivered");
  assert.equal((await rig.readTask(p.taskId)).status, "awaiting_input",
    "reconcile: the RUN settles its own turn — this belt wrote no terminal over it");
  assert.equal(await rig.readAssistantMessage(p.taskId), null,
    "reconcile: …and put no words in the conversation's mouth");
});

test("chat.reconcile: hook missing then RUN GONE — the turn settles expired, with a clarification-closed part, and the conversation is usable again", { skip: SKIP }, async () => {
  const p = await parkedChatClarify("cc764e");
  await restAtHookMissing(p);
  await ageDeliveryState(p.clarifyId);

  // THE COST THE TICKET EXISTS TO END, stated before the fix: the parked turn holds the session's
  // one live-turn slot, so every further message in that conversation is refused.
  await assert.rejects(
    () => rig.beginChatTurn({ session: p.session, author: p.owner, turnKey: `t2-${randomUUID()}` }),
    (e) => e.code === "CLR13",
    "reconcile: the parked turn blocks the conversation — that is the harm",
  );

  const out = await rig.asRuntime((c) =>
    reconcileChatClarifies(c, { resumeHook: hookNotFound, getRun: runReaped, onlyFirm: p.firm }));
  assert.equal(out.chatClarifyExpired, 1, "reconcile: a run that is gone settles the turn, rather than leaving it parked for ever");
  assert.equal(out.chatClarifyResumed, 0);

  assert.equal((await rig.readTask(p.taskId)).status, "expired", "reconcile: the turn settles expired");
  const msg = await rig.readAssistantMessage(p.taskId);
  assert.ok(
    msg.parts.some((x) => x.type === "clarify_closed" && x.reason === "expired" && x.framing === CHAT_CLARIFY_FRAMING),
    "reconcile: …and the conversation records WHY it stopped, rather than going silent",
  );
  assert.ok(
    msg.parts.some((x) => x.type === "text" && x.text === "working on cc764e"),
    "reconcile: THE RECEIPT COMES FIRST — the work the turn had already checkpointed is carried into the settle, not written over",
  );

  const second = await rig.beginChatTurn({ session: p.session, author: p.owner, turnKey: `t3-${randomUUID()}` });
  assert.ok(second.task_id && second.task_id !== p.taskId,
    "reconcile: the live-turn slot is released — a new message in the same conversation is accepted");
});

test("chat.reconcile: the hook is gone and the run is ALIVE BUT SUSPENDED FOR EVER — the turn is settled rather than stranded", { skip: SKIP }, async () => {
  const p = await parkedChatClarify("cc764j");
  await restAtHookMissing(p);
  await ageDeliveryState(p.clarifyId);

  // The engine still believes the run is in flight, and its single-shot hook is gone: a suspended
  // run with no hook can never resume. That is the SAME fact #629 settles a parked Work on
  // (`terminalForUnreachableQuestion`), and the chat lane's honest terminal for it is the one the
  // turn's own parked hook would have produced.
  const out = await rig.asRuntime((c) =>
    reconcileChatClarifies(c, { resumeHook: hookNotFound, getRun: runStatus("running"), onlyFirm: p.firm }));
  assert.equal(out.chatClarifyExpired, 1);
  assert.equal((await rig.readTask(p.taskId)).status, "expired",
    "reconcile: the live-turn slot is released rather than held for ever by a run that cannot move");
});

test("chat.reconcile: a hook_missing stamped MOMENTS ago is not yet evidence — the grace holds", { skip: SKIP }, async () => {
  const p = await parkedChatClarify("cc764f");
  await restAtHookMissing(p);

  let attempts = 0;
  const out = await rig.asRuntime((c) =>
    reconcileChatClarifies(c, {
      resumeHook: async () => { attempts += 1; },
      getRun: runReaped,
      onlyFirm: p.firm,
    }));
  assert.equal(out.chatClarifyResumed, 0, "grace: a fresh stamp decides nothing");
  assert.equal(out.chatClarifyExpired, 0);
  assert.equal(attempts, 0, "grace: …and spends no resume on it either");
  assert.equal((await rig.readTask(p.taskId)).status, "awaiting_input");
});

test("chat.reconcile: a delivery that landed JUST BEFORE the probe is not resumed twice and not settled", { skip: SKIP }, async () => {
  const p = await parkedChatClarify("cc764g");
  await restAtHookMissing(p);
  await ageDeliveryState(p.clarifyId);
  // The workflow's own `markRunningStep`: the answer reached the run and it went back to work.
  await rig.asRuntime((c) => c.query("update clara.agent_tasks set status='running' where id=$1", [p.taskId]));

  let attempts = 0;
  const out = await rig.asRuntime((c) =>
    reconcileChatClarifies(c, {
      resumeHook: async () => { attempts += 1; },
      getRun: runReaped,
      onlyFirm: p.firm,
    }));
  assert.equal(attempts, 0, "reconcile: NO DOUBLE RESUME — a turn that has left awaiting_input is nobody's to resume");
  assert.equal(out.chatClarifyExpired, 0, "reconcile: …and nothing false is written over a turn that continued");
  assert.equal((await rig.readTask(p.taskId)).status, "running");
});

test("chat.reconcile: a run state that cannot be READ decides nothing — the row stays at hook_missing", { skip: SKIP }, async () => {
  const p = await parkedChatClarify("cc764h");
  await restAtHookMissing(p);
  await ageDeliveryState(p.clarifyId);

  const out = await rig.asRuntime((c) =>
    reconcileChatClarifies(c, {
      resumeHook: hookNotFound,
      getRun: () => { throw new Error("the world is unreachable"); },
      onlyFirm: p.firm,
    }));
  assert.equal(out.chatClarifyExpired, 0, "reconcile: not knowing is never rounded to 'expire it'");
  assert.equal(out.chatClarifyProbeFailed, 1, "reconcile: …and the cycle says so rather than failing silently");
  assert.equal((await rig.readTask(p.taskId)).status, "awaiting_input");
  assert.equal((await rig.readInterruption(p.clarifyId)).delivery_state, "hook_missing",
    "reconcile: the row is left exactly as it was — the next sweep decides with fresh facts");
});

// ===========================================================================================
// 3 · THE LEGACY ARM (0198 §R). A row the PRE-#764 listener stamped `delivered` onto a turn that
//     is demonstrably still parked. The release count was 0 (#764, 2026-09-14) because the chat
//     backlog was 0, not because the asymmetry was exercised — the arm covers it regardless.
// ===========================================================================================

test("chat.reconcile.legacy: an `expired`+`delivered` row over a STILL-PARKED turn is inside the arm's reach", { skip: SKIP }, async () => {
  const p = await parkedChatClarify("cc764i");
  // EXACTLY what the pre-#764 listener wrote: delivered stamped on HookNotFound, with no resume
  // having happened, so the task never left `awaiting_input`. 0198 §R's own release query is
  // `i.status='expired' and i.delivery_state='delivered' and t.status='awaiting_input'`.
  await rig.rootQuery(
    `update clara.agent_interruptions
        set delivered_at = clock_timestamp() - interval '1 hour', delivery_state = 'delivered',
            delivery_state_at = clock_timestamp() - interval '1 hour'
      where id = $1`, [p.clarifyId]);
  const planted = await rig.rootQuery(
    `select count(*)::int as n from clara.agent_interruptions i
       join clara.agent_tasks t on t.id = i.task_id
      where i.id = $1 and i.work_id is null and i.status = 'expired'
        and i.delivery_state = 'delivered' and t.status = 'awaiting_input'`, [p.clarifyId]);
  assert.equal(planted.rows[0].n, 1, "legacy: the fixture IS the state 0198 §R counts");

  const out = await rig.asRuntime((c) =>
    reconcileChatClarifies(c, { resumeHook: hookNotFound, getRun: runReaped, onlyFirm: p.firm }));
  assert.equal(out.chatClarifyExpired, 1, "legacy: the backlog is inside the arm's reach, not permanently outside it");
  assert.equal((await rig.readTask(p.taskId)).status, "expired");
  const msg = await rig.readAssistantMessage(p.taskId);
  assert.ok(msg.parts.some((x) => x.type === "clarify_closed" && x.reason === "expired"));
});

// ===========================================================================================
// 4 · PURITY + PROVENANCE.
// ===========================================================================================

test("chat.part: the clarification-closed part this belt writes is the one the deployed chatTurn writes", () => {
  assert.deepEqual(chatClarifyClosedPart(), { type: "clarify_closed", reason: "expired", framing: CHAT_CLARIFY_FRAMING });
  const promptSrc = readFileSync(new URL("../workflows/chatTurn.v10.prompt.ts", import.meta.url), "utf8");
  assert.ok(promptSrc.includes(`export const CLARIFY_FRAMING = ${JSON.stringify(CHAT_CLARIFY_FRAMING)};`),
    "chat.part: the framing literal this module restates is the one the prompt module declares");
  const registrySrc = readFileSync(new URL("../workflows/registry.ts", import.meta.url), "utf8");
  const pin = registrySrc.match(/^\s*chatTurn:\s*chatTurn_(v\d+),/m)?.[1];
  assert.ok(pin, "chat.part: workflows/registry.ts still spells its chatTurn pin as `chatTurn: chatTurn_vN,`");
  const pinnedSrc = readFileSync(new URL(`../workflows/chatTurn.${pin}.ts`, import.meta.url), "utf8");
  assert.ok(
    pinnedSrc.includes('pushPart(allParts, { type: "clarify_closed", reason: resolution.kind, framing: CLARIFY_FRAMING });'),
    "chat.part: the registry-pinned chatTurn records the same part on the same resolution",
  );
});

test("chat.wiring: ONE caller drives this belt, and it is handed a real world resume", () => {
  // #852 moved the call from leader.mjs into runReconcilerSweep (the import edge that forced it
  // outside — chat-clarify -> control -> reconciler — was cut by lib/hook-resume.mjs). The ORDER
  // this cell used to scan leader.mjs for is still load-bearing — reconcileTasks' section C would
  // settle a parked chat turn with a lost run `cancelled`/engine_lost, so the chat-clarify arm has
  // to decide first or #764's `expired` + clarify_closed terminal never happens — but it is now
  // proven BEHAVIOURALLY, one file over: chat-clarify-sweep-wiring.test.mjs's `#852 order` drives a
  // whole sweep against a scripted client and reads the real statement order off it. Repointing
  // this cell's indexOf at `await belt("chat clarify reconcile"` in reconciler.mjs would have made
  // it the /tdd "implementation-coupled" shape (review finding STD-09-2): folding the belt
  // registrations into a config array iterated in order preserves the order exactly and would red
  // a cell whose subject never regressed. Verified before removing it, by moving the registration
  // below `task reconcile`: the behavioural cell reds on "the chat-clarify belt is the FIRST belt",
  // and reconciler.mjs was restored byte for byte (`sha256sum -c`). What stays here is what that
  // file does not cover twice — this belt's own no-double-caller law, and the production wiring.
  const leaderSrc = readFileSync(new URL("../lib/leader.mjs", import.meta.url), "utf8");
  assert.ok(!/reconcileChatClarifies/.test(leaderSrc),
    "wiring: the leader no longer calls the belt itself — two callers a cycle would double-probe every resting row");

  const startWorldSrc = readFileSync(new URL("../plugins/startWorld.ts", import.meta.url), "utf8");
  assert.ok(/import \{ start, getRun, resumeHook \} from "workflow\/api";/.test(startWorldSrc)
    && /^\s*resumeHook,$/m.test(startWorldSrc),
    "wiring: the production leader is handed the real world resume — otherwise the belt is a permanent no-op");
});

test("chat.reconcile: WITHOUT an injected resumeHook the arm is a clean no-op — it never guesses a world", async () => {
  const statements = [];
  const stub = { query: async (text) => { statements.push(String(text)); return { rows: [], rowCount: 0 }; } };
  const out = await reconcileChatClarifies(stub, { getRun: runStatus("running") });
  assert.equal(out.chatClarifyResumed, 0);
  assert.equal(out.chatClarifyExpired, 0);
  assert.equal(statements.length, 0, "no-op: not one statement is issued without a world to resume into");
});
