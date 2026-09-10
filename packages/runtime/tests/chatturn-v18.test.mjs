// #623 — chatTurn_v18: the registry pin, the ONE added tool, the ONE added wire kind, and the
// byte-untouched predecessors.
//
// The four claims a version bump has to earn in this estate, each asserted rather than described:
//   1. THE PIN. registry.ts routes `chatTurn:` at v18 and adds `claraWork:` as a NEW class.
//   2. THE PREDECESSORS DID NOT MOVE. Every chatTurn v1..v17 file still hashes to the value the
//      frozen manifest recorded — freeze-lint's own check, narrowed to the chat closures so a
//      failure here names WHICH body moved instead of just failing the repo-wide gate.
//   3. ONE TOOL, ONE KIND. v18's tool set is v17's plus exactly `start_journal_work`; the wire
//      union gains exactly `work_accepted`; the prompt is v17's with one paragraph appended.
//   4. THE CARD IS MINTED OFF THE DATABASE'S ANSWER, deduped by work_id, and joined to the C-19
//      terminal set (a turn that admitted Work has something to show for it).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { register } = await import("tsx/esm/api");
register();

const RUNTIME_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const registry = await import("../workflows/registry.ts");
const v18Tools = await import("../workflows/chatTurn.v18.tools.ts");
const v18Prompt = await import("../workflows/chatTurn.v18.prompt.ts");
const v18Parts = await import("../workflows/chatTurn.v18.parts.ts");
const v17Tools = await import("../workflows/chatTurn.v17.tools.ts");
const v17Prompt = await import("../workflows/chatTurn.v17.prompt.ts");
const workParts = await import("../workflows/claraWork.v1.parts.ts");

const { checkPartsParity, readDeclarerSources } = await import("../scripts/check-parts-parity.mjs");
const { fakeWorkPools, installWorkTestDoubles } = await import("./work-scripted-model.mjs");

const REGISTRY_SRC = await readFile(join(RUNTIME_ROOT, "workflows/registry.ts"), "utf8");
const MANIFEST = JSON.parse(await readFile(join(REPO_ROOT, "frozen-workflows.json"), "utf8"));

const CTX = {
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  taskId: "77777777-7777-4777-8777-777777777777",
};
const SESSION = "88888888-8888-4888-8888-888888888888";
const WORK_ID = "11111111-1111-4111-8111-111111111111";
const LOGICAL = `work:${WORK_ID}:journal_entry:1`;

function goodInput() {
  return {
    posting_date: "2026-09-01",
    memo: "office rent paid from Maybank",
    lines: [
      { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
      { account_code: "1100", debit_cents: 0, credit_cents: 120000 },
    ],
    rationale: "the human named the date, the amount and both accounts",
  };
}

/** A runtime-pool double that answers the two statements this tool issues. */
function runtimeDouble({ admit, calls }) {
  return (sql, params) => {
    if (/select session_id from clara\.agent_tasks/.test(sql)) return { rows: [{ session_id: SESSION }], rowCount: 1 };
    if (/clara\.admit_journal_work/.test(sql)) {
      calls.admits.push(params);
      return { rows: [{ r: admit(params, calls.admits.length - 1) }], rowCount: 1 };
    }
    throw new Error(`chatturn-v18 double: unexpected statement ${sql}`);
  };
}

async function runTool(input, admit) {
  const calls = { admits: [] };
  const { api } = fakeWorkPools({ runtime: runtimeDouble({ admit, calls }) });
  const restore = installWorkTestDoubles({ pools: api, model: undefined });
  try {
    const result = await v18Tools.runStartJournalWork(CTX, input, "gpt-5.6-terra");
    return { result, calls };
  } finally {
    restore();
  }
}

const ADMITTED = { work_id: WORK_ID, task_id: "99999999-9999-4999-8999-999999999999", logical_op_id: LOGICAL, status: "queued", replayed: false };

// --- 1. the pin ------------------------------------------------------------

test("623.v18: the registry pins chatTurn at v18 and adds claraWork as a NEW class", () => {
  assert.equal(registry.workflows.chatTurn, registry.chatTurn_v18, "chatTurn: routes to the v18 body");
  assert.ok(typeof registry.workflows.claraWork === "function", "claraWork: is registered");
  assert.ok(registry.workflowNames.includes("claraWork"), "the class name is dispatchable by string too");
  // #623 ADDED `claraWork` AS A NEW CLASS; #629 THEN REPOINTED IT v1 -> v2 (the typed shared
  // question). The claim this cell was written for is unchanged and still asserted — the key is
  // dispatchable, chatTurn is untouched by the Work lane's own cutover, and every predecessor
  // stays EXPORTED under policy (c) — so the pin is updated rather than the cell deleted.
  assert.match(REGISTRY_SRC, /claraWork: claraWork_v2/);
  assert.ok(typeof registry.claraWork_v1 === "function", "v1 is still exported for parked runs and rollback");
  assert.ok(typeof registry.claraWork_v2 === "function", "…and the pinned body is exported too");
  assert.match(REGISTRY_SRC, /chatTurn: chatTurn_v18/);
  // v17 stays EXPORTED (policy (c)) so a parked run resumes and a rollback has a target.
  assert.ok(typeof registry.chatTurn_v17 === "function", "v17 is still exported");
});

test("623.v18: the registry comment states the deploy order in the direction that is owed", () => {
  const paragraph = /#623 \(THE FIRST PERSISTENT CLARA SUCCESSOR\)[\s\S]*?chatTurn: chatTurn_v18/.exec(REGISTRY_SRC)?.[0];
  assert.ok(paragraph, "the repoint carries its own note");
  const flat = paragraph.replace(/\s*\n\s*\/\/\s?/g, " ");
  assert.match(flat, /MIGRATION 0178 MUST BE LIVE ON THE DATABASE BEFORE THIS IMAGE ADMITS ANY WORK/, "it names the migration and the direction plainly");
  assert.match(flat, /REVERSE order is\s+free/, "and says the reverse order costs nothing");
});

// --- 2. the predecessors did not move --------------------------------------

test("623.v18: every chatTurn v1..v17 body still hashes to its recorded frozen value", () => {
  const chatEntries = Object.entries(MANIFEST.workflows).filter(([path]) =>
    /^packages\/runtime\/workflows\/chatTurn\.(?:v(?:[1-9]|1[0-7])\b|impl|prompt)/.test(path),
  );
  assert.ok(chatEntries.length >= 60, `control: the manifest carries the chat closures (found ${chatEntries.length})`);
  for (const [path, entry] of chatEntries) {
    const actual = createHash("sha256").update(readFileSync(join(REPO_ROOT, path), "utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");
    assert.equal(actual, entry.sha256, `${path} MOVED — a frozen body is immutable; ship a new _vN`);
  }
});

// --- 3. one tool, one kind, one paragraph ----------------------------------

test("623.v18: the tool set is v17's plus exactly one tool", () => {
  const v17 = Object.keys(v17Tools.buildToolsV17(CTX, "gpt-5.6-terra", 0)).sort();
  const v18 = Object.keys(v18Tools.buildToolsV18(CTX, "gpt-5.6-terra", 0)).sort();
  const added = v18.filter((name) => !v17.includes(name));
  const removed = v17.filter((name) => !v18.includes(name));
  assert.deepEqual(added, ["start_journal_work"], "exactly one tool is added");
  assert.deepEqual(removed, [], "nothing v17 could do stops being possible");
  assert.equal(v18Tools.START_JOURNAL_WORK_TOOL, "start_journal_work");
});

test("623.v18: the wire union gains exactly work_accepted, declared beside its producer", () => {
  assert.deepEqual([...v18Parts.CHATTURN_V18_PART_KINDS], ["work_accepted"]);
  assert.deepEqual([...workParts.CLARA_WORK_PART_KINDS], ["work_status", "work_result"], "the run's own kinds live with the run");
});

test("623.v18: the system prompt is v17's, byte-identical, with one paragraph appended", () => {
  assert.ok(v18Prompt.SYSTEM_PROMPT_V18.startsWith(v17Prompt.SYSTEM_PROMPT_V17), "every prior word is carried unchanged");
  const appended = v18Prompt.SYSTEM_PROMPT_V18.slice(v17Prompt.SYSTEM_PROMPT_V17.length);
  assert.equal(appended, `\n\n${v18Prompt.JOURNAL_WORK_CHAT_GUIDANCE}`);
  assert.match(appended, /QUEUE THE WORK, DO NOT CLAIM THE POSTING/, "the honesty rule is stated, not implied");
  assert.match(appended, /integer CENTS/);
});

test("623.v18: parts parity passes across the full declarer set", () => {
  const result = checkPartsParity({
    declarerSources: readDeclarerSources(),
    readerSource: readFileSync(join(REPO_ROOT, "apps/web/lib/parts/types.ts"), "utf8"),
  });
  assert.equal(result.ok, true, `parity refused: missing=${result.missing.join(",")}`);
  for (const kind of ["work_accepted", "work_status", "work_result"]) {
    assert.ok(result.emittable.includes(kind), `${kind} is emittable`);
    assert.ok(result.reader.includes(kind), `the web reader declares ${kind}`);
    const entry = result.census.find((c) => c.kind === kind);
    assert.ok(entry.constructionSites.length > 0, `${kind} has a real construction site in packages/runtime`);
  }
});

// --- 4. the card ------------------------------------------------------------

test("623.v18: start_journal_work admits Work and returns the card the database confirmed", async () => {
  const { result, calls } = await runTool(goodInput(), () => ADMITTED);
  assert.equal(result.ok, true);
  assert.deepEqual(result.work_accepted, {
    type: "work_accepted",
    work_id: WORK_ID,
    client_id: CTX.clientId,
    purpose: "journal_entry",
    logical_op_id: LOGICAL,
  });
  assert.equal(result.status, "queued", "the tool reports QUEUED — never posted");
  assert.equal(result.replayed, false);

  const params = calls.admits[0];
  assert.equal(params[0], CTX.clientId, "the client comes from the conversation's pin, not from the model");
  assert.equal(params[1], CTX.createdBy, "the author is the initiating human");
  assert.match(String(params[2]), /^eta-start_journal_work-/, "a DETERMINISTIC intent key, not a fresh uuid");
  assert.deepEqual(JSON.parse(params[3]), {
    posting_date: "2026-09-01",
    memo: "office rent paid from Maybank",
    currency: "MYR",
    lines: [
      { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
      { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: null },
    ],
  });
  assert.equal(params[4], "clara_interpreted", "a chat-originated basis is labelled as interpreted");
  assert.deepEqual(JSON.parse(params[5]), [{ kind: "chat_task", task_id: CTX.taskId, session_id: SESSION }]);
  assert.equal(params[6], "gpt-5.6-terra");
});

test("623.v18: the intent key is stable for the same input and different for a changed one (C54.1)", async () => {
  const first = await runTool(goodInput(), () => ADMITTED);
  const second = await runTool(goodInput(), () => ADMITTED);
  assert.equal(first.calls.admits[0][2], second.calls.admits[0][2], "same task + same tool + same input = same key");

  const changed = goodInput();
  changed.lines[0].debit_cents = 130000;
  changed.lines[1].credit_cents = 130000;
  const third = await runTool(changed, () => ADMITTED);
  assert.notEqual(first.calls.admits[0][2], third.calls.admits[0][2], "a materially different basis is a different intent");
});

test("623.v18: a replay reports the SAME Work and mints no second card", async () => {
  const replayed = Object.assign({}, ADMITTED, { replayed: true });
  const { result } = await runTool(goodInput(), () => replayed);
  assert.equal(result.ok, true);
  assert.equal(result.replayed, true);
  assert.equal(result.work_accepted.work_id, WORK_ID);

  const parts = v18Prompt.toTypedParts_v18([
    { type: "tool-result", toolName: "start_journal_work", output: result },
    { type: "tool-result", toolName: "start_journal_work", output: result },
  ]);
  // v10's carried promotion also mints a `tool_result` part per result — that is the transcript's
  // own record of the call and is untouched here. What must be exactly one is the CARD.
  const cards = parts.filter((p) => p.type === "work_accepted");
  assert.equal(cards.length, 1, "two results, ONE card — deduped on work_id");
  assert.equal(cards[0].work_id, WORK_ID);
});

test("623.v18: the card is promoted off the RESULT, never off the call, and never off a refusal", () => {
  assert.equal(v18Prompt.admittedWorkAccepted(null), null);
  assert.equal(v18Prompt.admittedWorkAccepted({ ok: false, code: "CLR03" }), null, "a refusal mints no card");
  assert.equal(v18Prompt.admittedWorkAccepted({ ok: true }), null, "an ok with no payload mints no card");
  assert.equal(
    v18Prompt.admittedWorkAccepted({ ok: true, work_accepted: { type: "work_accepted", work_id: "", client_id: "c", purpose: "journal_entry", logical_op_id: "l" } }),
    null,
    "a blank identifier mints no card",
  );
  // A tool CALL alone is not an admitted Work: the transcript records the call, but no card.
  const fromCall = v18Prompt.toTypedParts_v18([{ type: "tool-call", toolName: "start_journal_work", input: {} }]);
  assert.equal(fromCall.some((p) => p.type === "work_accepted"), false);
  // Nor is a REFUSED result.
  const fromRefusal = v18Prompt.toTypedParts_v18([
    { type: "tool-result", toolName: "start_journal_work", output: { ok: false, code: "CLR10", reason: "invalid_basis" } },
  ]);
  assert.equal(fromRefusal.some((p) => p.type === "work_accepted"), false);
});

test("623.v18: admitting Work is acting intent, and work_accepted is in the C-19 terminal set", async () => {
  assert.equal(
    v18Prompt.hasCodingIntent_v18([{ type: "tool-call", toolName: "start_journal_work", input: {} }]),
    true,
    "queueing an entry acts on the client's books",
  );
  assert.equal(v18Prompt.hasCodingIntent_v18([{ type: "text", text: "hello" }]), false);

  const body = await readFile(join(RUNTIME_ROOT, "workflows/chatTurn.v18.ts"), "utf8");
  const terminal = /if \(codingIntended && outcome === "completed"\)[\s\S]*?codingIncompleteRefusal\(\)\);/.exec(body)?.[0];
  assert.ok(terminal, "the C-19 invariant is present");
  assert.match(terminal, /p\.type === "work_accepted"/, "and work_accepted counts as something to show for the act");
  assert.match(body, /x\.type === "work_accepted" && x\.work_id === p\.work_id/, "pushPart dedupes on work_id");
});

// --- refusals ---------------------------------------------------------------

test("623.v18: a conversation with no client pin is refused by NAME, with a fix", async () => {
  const calls = { admits: [] };
  const { api } = fakeWorkPools({ runtime: runtimeDouble({ admit: () => ADMITTED, calls }) });
  const restore = installWorkTestDoubles({ pools: api, model: undefined });
  try {
    const result = await v18Tools.runStartJournalWork(Object.assign({}, CTX, { clientId: null }), goodInput(), "gpt-5.6-terra");
    assert.equal(result.ok, false);
    assert.equal(result.code, "CLR03");
    assert.equal(result.reason, "journal_work_needs_client_pin");
    assert.match(result.fix, /client workspace/);
    assert.equal(calls.admits.length, 0, "nothing reached the database");
  } finally {
    restore();
  }
});

test("623.v18: an unbalanced or two-sided basis is refused BEFORE the database round trip", () => {
  const unbalanced = goodInput();
  unbalanced.lines[1].credit_cents = 110000;
  const a = v18Tools.localBasisRefusal(unbalanced);
  assert.equal(a.reason, "invalid_basis");
  assert.equal(a.details.field, "lines");
  assert.match(a.message, /120000 cents.*110000 cents/);

  const twoSided = goodInput();
  twoSided.lines[0].credit_cents = 1;
  const b = v18Tools.localBasisRefusal(twoSided);
  assert.equal(b.details.field, "lines[0]");
  assert.match(b.message, /exactly one/);

  const zeroSided = goodInput();
  zeroSided.lines[0].debit_cents = 0;
  zeroSided.lines[1].credit_cents = 0;
  assert.equal(v18Tools.localBasisRefusal(zeroSided).details.field, "lines[0]");

  assert.equal(v18Tools.localBasisRefusal(goodInput()), null, "a balanced, one-sided basis passes");
});

test("623.v18: a database refusal rides back typed, never as a retry with different figures", async () => {
  const { result, calls } = await runTool(goodInput(), () => {
    throw Object.assign(new Error("that intent key already carries different figures"), {
      code: "CLR10",
      detail: JSON.stringify({ reason: "intent_payload_conflict", existing_work_id: WORK_ID }),
    });
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "CLR10");
  assert.equal(result.reason, "intent_payload_conflict");
  assert.equal(result.details.existing_work_id, WORK_ID, "the payload's extra keys reach the model verbatim");
  assert.equal(calls.admits.length, 1, "the tool tried ONCE — it does not retry a conflict");
});

test("623.v18: the tool schema is strict and closed", () => {
  const schema = v18Tools.startJournalWorkInputSchema;
  assert.equal(schema.safeParse(goodInput()).success, true);
  const extra = Object.assign(goodInput(), { post_immediately: true });
  assert.equal(schema.safeParse(extra).success, false, "a key the model invented is refused");
  const oneLine = goodInput();
  oneLine.lines = [oneLine.lines[0]];
  assert.equal(schema.safeParse(oneLine).success, false, "one line is not a journal entry");
  const fractional = goodInput();
  fractional.lines[0].debit_cents = 1200.5;
  assert.equal(schema.safeParse(fractional).success, false, "there is no fractional cent in this lane");
  const badDate = goodInput();
  badDate.posting_date = "01/09/2026";
  assert.equal(schema.safeParse(badDate).success, false);
});
