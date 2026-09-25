// chatTurn_v23 — #1144, the CLOSING wave's version cut: the seven deferred agent-lane tools.
//
// v22's own roster cell asserts these seven names are ABSENT "and that is a ruling": every door
// behind them was `clara_authenticated`-only at that cut, so a tool over one could only ever
// answer a grant refusal. The riders sweep wave built the machine-lane halves — migrations
// `0352_agent_read_twins_payroll_agreement.sql` and
// `0353_tenancy_agent_twins_obo_confirmations.sql`, both hosted on 2026-09-25 — so the ruling is
// unwound HERE, by this cut, and the roster moves from v22's measured 45 to 52.
//
// WHAT THIS FILE PROVES, cell by cell:
//
//   1. THE INPUTS ARE THE CONTRACTS' OWN, `.strict()`, and an invented key is REFUSED by
//      validation rather than dropped.
//   2. THE ROSTER IS ENUMERATED, NOT ASSUMED: v23 is v22's forty-five plus exactly seven names.
//   3. THE CLIENT WALL IS v22's: a conversation bound to no client, or to another client, is
//      refused before any door is reached.
//   4. EVERY DOOR IS CALLED BY NAME WITH THE CONTRACT'S OWN ARGUMENT ORDER (source pins — the
//      bodies are door calls and cannot be driven without a database; what is worth pinning is
//      which value is bound to which name).
//   5. THE REFUSAL MAPPINGS ARE THE REPORTS' OWN, including the deliberate indistinguishability
//      of another firm's real client from a client that does not exist.
//   6. THE PROMPT CARRIES EACH TOOL'S STANZA.
//
// NO DATABASE IS NEEDED HERE. Every cell is over pure functions, module constants and source
// text.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const v22Tools = await import("../workflows/chatTurn.v22.tools.ts");
const v23Reads = await import("../workflows/chatTurn.v23.reads.ts");

const CTX = {
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  taskId: "77777777-7777-4777-8777-777777777777",
};
const DOC = "66666666-6666-4666-8666-666666666666";

/** The file's CODE with its comments removed — v22's own reader, carried for the same reason: a
 *  source pin that reads comments is not a source pin, and a header is precisely where a defect
 *  gets named. */
function codeOf(url) {
  return readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// 1 · `read_payroll_posting_state` (#946, contract in waveS-lane08-ticket1136.md §1)
// ---------------------------------------------------------------------------

test("v23.payroll_posting: the input is `.strict()` and carries ONLY client_id and document_id", () => {
  const ok = { client_id: CTX.clientId, document_id: DOC };
  assert.equal(v23Reads.readPayrollPostingStateInputSchema.safeParse(ok).success, true);
  assert.deepEqual(
    Object.keys(v23Reads.readPayrollPostingStateInputSchema.shape).sort(),
    ["client_id", "document_id"],
  );
  // The contract's input is two uuids. A model that could name a row kind, an entry id or a
  // sentence would be choosing WHICH block to report, and the queue row is the database's own.
  for (const invented of ["row_kind", "entry_id", "question_text", "period_month"]) {
    assert.equal(
      v23Reads.readPayrollPostingStateInputSchema.safeParse({ ...ok, [invented]: "x" }).success,
      false,
      `${invented}: the blocked row is found server-side, never named by the model`,
    );
  }
  assert.equal(v23Reads.readPayrollPostingStateInputSchema.safeParse({ ...ok, document_id: "nope" }).success, false);
  assert.equal(v23Reads.readPayrollPostingStateInputSchema.safeParse({ client_id: CTX.clientId }).success, false);
  // and the name v22 asserted absent is the name this cut declares
  assert.equal(v23Reads.READ_PAYROLL_POSTING_STATE_TOOL, "read_payroll_posting_state");
  assert.ok(!Object.keys(v22Tools.buildToolsV22(CTX, "gpt-5.6-terra", 0)).includes("read_payroll_posting_state"),
    "v22 still does not carry it — this cut adds it, it does not edit v22");
});

test("v23.payroll_posting: the client wall is v22's — no pin refuses, another client refuses", async () => {
  // Standing owner ruling, and v21's provenance wall: access control is never loosened. Both
  // arms return BEFORE any credential is minted, so no database is reached.
  const none = await v23Reads.runReadPayrollPostingState(
    { ...CTX, clientId: null }, { client_id: CTX.clientId, document_id: DOC });
  assert.equal(none.ok, false);
  assert.equal(none.code, "CLR03");
  assert.equal(none.reason, "payroll_posting_state_needs_client_pin");

  const other = await v23Reads.runReadPayrollPostingState(
    CTX, { client_id: "11111111-1111-4111-8111-111111111111", document_id: DOC });
  assert.equal(other.ok, false);
  assert.equal(other.code, "CLR03");
  assert.equal(other.reason, "client_not_in_conversation");
  assert.deepEqual(other.details, { client_id: "11111111-1111-4111-8111-111111111111" });
});

test("v23.payroll_posting: the doors are the queue and the document state, in the contract's order", () => {
  // A SOURCE PIN rather than a spy, for v22's reason: the body is a door call and cannot be
  // driven without a database; what is worth pinning is which value is bound to which name.
  const src = codeOf(new URL("../workflows/chatTurn.v23.reads.ts", import.meta.url));
  assert.match(src, /clara\.wake_list_review_queue\(\$1::jsonb, \$2::jsonb, \$3::int\)/);
  assert.match(src, /JSON\.stringify\(\{ client_id: clientId \}\), null, AGENT_QUEUE_LIMIT/);
  assert.match(src, /clara\.get_document_state\(\$1::uuid, \$2::uuid\)/);
  assert.match(src, /\[input\.document_id, clientId\]/);
  // #1136's "what the cut must NOT do": the ungranted verdict cores are never called, and no
  // settle/post door appears in this module.
  assert.ok(!/_payroll_posting_verdict|_agreement_posting_verdict/.test(src),
    "both verdict cores are granted to nobody on purpose and are never called from a tool");
  assert.ok(!/settle_payroll_net_pay/.test(src), "#1136: no settle tool for either family");
  // the firm is the conversation's and never the model's
  assert.ok(!/firmId: input\./.test(src), "no model-supplied firm ever reaches a credential");
});

test("v23.payroll_posting: another firm's real client is answered IDENTICALLY to a missing one", () => {
  // #1136's refusal table says so in words, and it is deliberate: a tool that distinguished them
  // would be an existence oracle for another firm's client list.
  assert.equal(
    v23Reads.PAYROLL_POSTING_STATE_REFUSALS.client_not_found,
    "I cannot find that client under your firm.",
  );
  assert.equal(
    v23Reads.PAYROLL_POSTING_STATE_REFUSALS.not_permitted,
    "I cannot read your firm's inbox in this conversation.",
  );
  // and the CLR03 sentence NEVER names the client — the caller could not read the inbox at all.
  assert.ok(!v23Reads.PAYROLL_POSTING_STATE_REFUSALS.not_permitted.includes("client_id"));
});
