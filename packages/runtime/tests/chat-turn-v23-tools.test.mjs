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
const v22Prompt = await import("../workflows/chatTurn.v22.prompt.ts");
const v23Reads = await import("../workflows/chatTurn.v23.reads.ts");
const v23Tenancy = await import("../workflows/chatTurn.v23.tenancy.ts");
const v23Tools = await import("../workflows/chatTurn.v23.tools.ts");
const v23Prompt = await import("../workflows/chatTurn.v23.prompt.ts");
const v23Impl = await import("../workflows/chatTurn.v23.impl.ts");
const v23Usage = await import("../workflows/chatTurn.v23.usage.ts");
const registry = await import("../workflows/registry.ts");

const CTX = {
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  taskId: "77777777-7777-4777-8777-777777777777",
};
const DOC = "66666666-6666-4666-8666-666666666666";
const MODEL = "gpt-5.6-terra";

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

// ---------------------------------------------------------------------------
// 2 · `read_payroll_settlement_state` (#947, contract in waveS-lane08-ticket1136.md §2)
// ---------------------------------------------------------------------------

test("v23.payroll_settlement: the client is required and the document is OPTIONAL, `.strict()`", () => {
  const schema = v23Reads.readPayrollSettlementStateInputSchema;
  assert.equal(schema.safeParse({ client_id: CTX.clientId }).success, true,
    "omitting the document reports EVERY unsettled run for this client — #947's own contract");
  assert.equal(schema.safeParse({ client_id: CTX.clientId, document_id: DOC }).success, true);
  assert.deepEqual(Object.keys(schema.shape).sort(), ["client_id", "document_id"]);
  assert.equal(schema.safeParse({ document_id: DOC }).success, false, "the client is never optional");
  // #947 AC4's law carried into conversation: the tool never picks a candidate, so it takes none.
  for (const invented of ["line_id", "match_id", "candidate", "bank_account_id"]) {
    assert.equal(schema.safeParse({ client_id: CTX.clientId, [invented]: "x" }).success, false,
      `${invented}: a candidate is a person's adjudication, never an input`);
  }
  assert.equal(v23Reads.READ_PAYROLL_SETTLEMENT_STATE_TOOL, "read_payroll_settlement_state");
});

test("v23.payroll_settlement: the client wall is v22's, and the door is the wake candidate read", () => {
  const src = codeOf(new URL("../workflows/chatTurn.v23.reads.ts", import.meta.url));
  assert.match(src, /clara\.wake_get_payroll_settlement_candidates\(\$1::uuid\)/);
  // #1136's "what the cut must NOT do": no settle tool for this family, at this cut or in this
  // module. 0352's tail asserts `clara.settle_payroll_net_pay` is 42501 from every machine role.
  assert.ok(!/settle_payroll_net_pay/.test(src));
  return Promise.all([
    v23Reads.runReadPayrollSettlementState({ ...CTX, clientId: null }, { client_id: CTX.clientId })
      .then((r) => {
        assert.equal(r.ok, false);
        assert.equal(r.reason, "payroll_settlement_state_needs_client_pin");
      }),
    v23Reads.runReadPayrollSettlementState(CTX, { client_id: "11111111-1111-4111-8111-111111111111" })
      .then((r) => {
        assert.equal(r.ok, false);
        assert.equal(r.reason, "client_not_in_conversation");
      }),
  ]);
});

test("v23.payroll_settlement: the empty answer is the panel's own sentence, and CLR11 masks a stranger", () => {
  // The refusal table's sentences, spelled once so the two surfaces cannot drift.
  assert.equal(
    v23Reads.PAYROLL_SETTLEMENT_STATE_REFUSALS.not_permitted,
    "I cannot read this client's payroll in this conversation.",
  );
  assert.equal(
    v23Reads.PAYROLL_SETTLEMENT_STATE_REFUSALS.client_not_found,
    "I cannot find that client under your firm.",
  );
  // NOT a refusal, and it is the panel's own empty-state sentence, reused verbatim.
  assert.equal(
    v23Reads.NO_PAYROLL_RUN_AWAITING_PAYMENT,
    "No payroll run is waiting on its bank payment.",
  );
});

// ---------------------------------------------------------------------------
// 3 · `read_agreement_terms` (#948, contract in waveS-lane08-ticket1136.md §3,
//     AMENDED by waveS-lane08-fix.md §7.4: the input is {document_id, client_id})
// ---------------------------------------------------------------------------

test("v23.agreement_terms: the input carries the client the §7.4 amendment ADDED", () => {
  const schema = v23Reads.readAgreementTermsInputSchema;
  assert.deepEqual(Object.keys(schema.shape).sort(), ["client_id", "document_id"]);
  // #948's ORIGINAL input was the document alone. Both doors this tool calls take a client, and a
  // document-only tool would have to DISCOVER the client first — the existence oracle the tenant
  // wall exists to prevent (waveS-lane08-fix.md §7.4).
  assert.equal(schema.safeParse({ document_id: DOC }).success, false, "the client is not optional");
  assert.equal(schema.safeParse({ client_id: CTX.clientId, document_id: DOC }).success, true);
  assert.equal(schema.safeParse({ client_id: CTX.clientId, document_id: DOC, terms: [] }).success, false);
  assert.equal(v23Reads.READ_AGREEMENT_TERMS_TOOL, "read_agreement_terms");
});

test("v23.agreement_terms: §7.4's obligation — a firm-level session CANNOT supply a client, and is refused", async () => {
  // The amendment's own words: "The cut must confirm the chat surface can always supply a client
  // for this tool; a firm-level (unpinned) session has no `ctx.clientId`". IT CANNOT, so the tool
  // refuses rather than discovering one — which is the narrower buy the report asked for, and it
  // is DRIVEN here rather than asserted in prose.
  const unpinned = await v23Reads.runReadAgreementTerms(
    { ...CTX, clientId: null }, { client_id: CTX.clientId, document_id: DOC });
  assert.equal(unpinned.ok, false);
  assert.equal(unpinned.code, "CLR03");
  assert.equal(unpinned.reason, "agreement_terms_needs_client_pin");
  assert.match(unpinned.message, /not bound to a client/);

  const other = await v23Reads.runReadAgreementTerms(
    CTX, { client_id: "11111111-1111-4111-8111-111111111111", document_id: DOC });
  assert.equal(other.ok, false);
  assert.equal(other.reason, "client_not_in_conversation");
});

test("v23.agreement_terms: the doors are the extract and the queue row, never the ungranted verdict", () => {
  const src = codeOf(new URL("../workflows/chatTurn.v23.reads.ts", import.meta.url));
  assert.match(src, /clara\.get_document_extract\(\$1::uuid, \$2::uuid, \$3::int\)/);
  assert.match(src, /\[input\.document_id, clientId, AGREEMENT_EXTRACT_MAX_CHARS\]/);
  // the posting verdict is read the way a PERSON reads it — as the queue's own row
  assert.match(src, /agreement_posting_blocked/);
  assert.ok(!/_agreement_posting_verdict/.test(src),
    "granted to nobody on purpose; the sentence reaches the chat lane through the queue row");
  // #1136's prohibition: no record-terms tool, no settle tool in this closure's read module
  assert.ok(!/record_contract_terms/.test(src));
});

test("v23.agreement_terms: the banked PAIR is both channels, and its absence is `not_read_yet`", () => {
  // "no banked pair" is #1136's own wording. The pair is the agreement lane's two channels, which
  // the estate names in `agreementFacts.v1.services.mjs`: `agreement_text_facts` and
  // `agreement_vision_facts`. An extract carrying one of them is a reading still in flight.
  assert.deepEqual(
    [...v23Reads.AGREEMENT_FACT_ENGINE_KINDS].sort(),
    ["agreement_text_facts", "agreement_vision_facts"],
  );
  const pair = { extractions: [{ engine_kind: "agreement_text_facts" }, { engine_kind: "agreement_vision_facts" }] };
  const half = { extractions: [{ engine_kind: "agreement_text_facts" }] };
  assert.equal(v23Reads.agreementBankedPair(pair), true);
  assert.equal(v23Reads.agreementBankedPair(half), false);
  assert.equal(v23Reads.agreementBankedPair({ extractions: [] }), false);
  assert.equal(v23Reads.agreementBankedPair(null), false);
  assert.equal(
    v23Reads.AGREEMENT_TERMS_REFUSALS.not_read_yet,
    "That agreement has not been read yet.",
  );
  assert.equal(
    v23Reads.AGREEMENT_TERMS_REFUSALS.not_permitted,
    "I cannot read this client's documents in this conversation.",
  );
  assert.equal(
    v23Reads.AGREEMENT_TERMS_REFUSALS.client_not_found,
    "I cannot find that client under your firm.",
  );
});

// ---------------------------------------------------------------------------
// 4 · the roster — the ruling v22's own cell recorded, unwound HERE and nowhere else
// ---------------------------------------------------------------------------

test("v23.roster: v23 is v22's forty-five plus EXACTLY the seven the last cut deferred", () => {
  const v22 = Object.keys(v22Tools.buildToolsV22(CTX, MODEL, 0)).sort();
  const v23 = Object.keys(v23Tools.buildToolsV23(CTX, MODEL, 0)).sort();
  // THE ONE PLACE THIS CUT'S ROSTER IS ENUMERATED, and the seven are named one by one: they are
  // exactly the names `chat-turn-v22-tools.test.mjs`'s deferral cell asserts absent from v22.
  assert.deepEqual(v23.filter((n) => !v22.includes(n)), [
    "confirm_tenancy_rent_plan",
    "confirm_tenancy_rent_plan_revision",
    "read_agreement_terms",
    "read_payroll_posting_state",
    "read_payroll_settlement_state",
    "read_rent_settlement_candidates",
    "read_tenancy_terms",
  ].sort());
  assert.deepEqual(v22.filter((n) => !v23.includes(n)), [], "nothing v22 could do stops being possible");
  // ENUMERATED RATHER THAN ASSUMED, v22's own cell's rule: the counts are measured by BUILDING
  // the maps, never read off a header comment.
  assert.equal(v22.length, 45, "v22's measured roster");
  assert.equal(v23.length, 52, "v22's forty-five plus seven");
  // and this cut REPLACES nothing: every one of the seven is a new name.
  for (const name of v23.filter((n) => !v22.includes(n))) assert.ok(!v22.includes(name));
});

test("v23.roster: the two prohibitions v22 carried forward are STILL absent, and that is still a ruling", () => {
  const built = Object.keys(v23Tools.buildToolsV23(CTX, MODEL, 0));
  for (const absent of [
    // #940/#939's prohibitions: enrolling an account and stating a service period are a person's
    // judgements, and the doors hold no agent grant by owner default.
    "enrol_prepayment_account",
    "record_prepayment_stated_term",
    // carried forward from v21's and v22's own absence lists, unchanged by this cut
    "open_intake_batch",
    "record_counterparty_alias",
    // #1136 and #1137's own "what the cut must NOT do": no settle tool for either family, and no
    // record-terms tool.
    "settle_payroll_net_pay",
    "settle_rent_payable",
    "record_contract_terms",
  ]) {
    assert.ok(!built.includes(absent), `${absent} is NOT in v23 — its absence is a ruling, not an oversight`);
  }
});

test("v23.roster: every tool name reaches the map from the module that DECLARES its literal", () => {
  // `check-parts-parity.mjs` resolves a computed key by dereferencing the identifier through its
  // import chain and refuses a chain whose next hop is a RE-EXPORT rather than a binding. v22's
  // header records that this rule has been paid for three times; it is not paid for a fourth here.
  const src = codeOf(new URL("../workflows/chatTurn.v23.tools.ts", import.meta.url));
  assert.match(src, /import \{[\s\S]*?READ_PAYROLL_POSTING_STATE_TOOL[\s\S]*?\} from "\.\/chatTurn\.v23\.reads\.js";/);
  assert.match(src, /import \{[\s\S]*?CONFIRM_TENANCY_RENT_PLAN_TOOL[\s\S]*?\} from "\.\/chatTurn\.v23\.tenancy\.js";/);
  // and the names are the DECLARED constants rather than string literals in the map
  assert.match(src, /\[READ_PAYROLL_POSTING_STATE_TOOL\]: tool\(\{/);
  assert.match(src, /\[CONFIRM_TENANCY_RENT_PLAN_REVISION_TOOL\]: tool\(\{/);
  // …and every declared constant is a key the built map actually carries, so a rename in either
  // declaring module cannot leave the roster naming a tool the model is never handed.
  const built = Object.keys(v23Tools.buildToolsV23(CTX, MODEL, 0));
  for (const name of [
    v23Reads.READ_PAYROLL_POSTING_STATE_TOOL,
    v23Reads.READ_PAYROLL_SETTLEMENT_STATE_TOOL,
    v23Reads.READ_AGREEMENT_TERMS_TOOL,
    v23Tenancy.READ_TENANCY_TERMS_TOOL,
    v23Tenancy.READ_RENT_SETTLEMENT_CANDIDATES_TOOL,
    v23Tenancy.CONFIRM_TENANCY_RENT_PLAN_TOOL,
    v23Tenancy.CONFIRM_TENANCY_RENT_PLAN_REVISION_TOOL,
  ]) {
    assert.ok(built.includes(name), `${name} is declared and handed to the model`);
  }
});

// ---------------------------------------------------------------------------
// 5 · the prompt — one stanza per tool, and every prior word byte-identical
// ---------------------------------------------------------------------------

test("v23.prompt: SYSTEM_PROMPT_V23 is v22's text plus this cut's OWN stanzas, byte for byte", () => {
  assert.ok(v23Prompt.SYSTEM_PROMPT_V23.startsWith(v22Prompt.SYSTEM_PROMPT_V22),
    "every prior word stays byte-identical — v22's eight stanzas included");
  const added = v23Prompt.SYSTEM_PROMPT_V23.slice(v22Prompt.SYSTEM_PROMPT_V22.length);
  assert.match(added, /WHY A PAYROLL RUN DID NOT POST/);                      // #946
  assert.match(added, /WHETHER A PAYROLL RUN'S NET PAY HAS LEFT THE BANK/);   // #947
  assert.match(added, /Eleven terms are recorded/);                            // #948
  assert.match(added, /When someone asks what a tenancy says/);                // #949 item 1
  assert.match(added, /A month of rent stays open until the payment appears/); // #949 item 4
  assert.match(added, /A recurring rent plan never starts because you read a contract/); // item 2
  assert.match(added, /A rent review changes nothing by itself/);              // item 3
});

test("v23.prompt: the stanzas are the reports' own words on the three clauses that decide behaviour", () => {
  const p = v23Prompt.SYSTEM_PROMPT_V23;
  // the database's sentence is reported VERBATIM and never reworded
  assert.match(p, /report the sentence it\nreturns VERBATIM/);
  // never picking a candidate, even when only one exists — #947 AC4 and #949 item 4
  assert.match(p, /never picking one for the person, even\nwhen only one candidate exists/);
  // the awaiting_checker trap, carried from wave4-lane01-fix.md §8 into BOTH settlement stanzas
  assert.equal((p.match(/awaiting_checker, which is a draft waiting for a second pair of eyes/g) ?? []).length, 2);
  // the act is recorded as the PERSON, and only on their word in this conversation
  assert.match(p, /the act is recorded as the person you are working for, not as you/);
});

// ---------------------------------------------------------------------------
// 6 · the identity — the stamp, the pin, the roster, and policy (c)
// ---------------------------------------------------------------------------

test("v23.identity: the engine stamp is `chatturn-v23` and the registry pins v23", () => {
  // `scripts/check-workflow-bundle.mjs` DERIVES the expected stamp from whatever version the
  // registry pins and refuses a built bundle that does not carry it, so a metering ledger can
  // never attribute a v23 turn to the v22 body.
  assert.equal(v23Usage.chatEngineId("gpt-5.6-terra"), "llm-openai:gpt-5.6-terra:chatturn-v23");
  assert.equal(registry.workflowPins.chatTurn, "chatTurn_v23");
  assert.equal(registry.workflows.chatTurn, registry.chatTurn_v23);
  assert.ok(registry.workflowBodies.includes("chatTurn_v23"));
  // POLICY (c): every superseded body stays imported, exported and rostered. Removing one strands
  // parked runs and refuses World startup database-wide.
  for (let n = 2; n <= 22; n += 1) {
    assert.ok(registry.workflowBodies.includes(`chatTurn_v${n}`), `chatTurn_v${n} is still rostered`);
  }
  // the bundle gate's other hard name
  assert.equal(typeof v23Impl.runModelSegmentStepV23, "function");
});
