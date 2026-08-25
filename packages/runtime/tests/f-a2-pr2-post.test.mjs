// F-A2 PR-2 — the runtime half's battery. PURE: no DB, no network, no model. Every cell here
// exercises a decision this closure OWNS; the walls themselves live in the DB and are proven by
// `packages/db`'s F-A2 ladder battery, not here.
//
// WHAT THIS FILE IS FOR, STATED SO NOBODY LATER "STRENGTHENS" IT INTO A SECOND LADDER. The
// runtime never decides whether a post is lawful. It assembles inputs the agent may not pick,
// carries the DB's verdict without re-deriving it, and settles the sweep task honestly. These
// cells prove exactly those three things — plus the two guards that turn a mistake into a
// readable refusal, and the consumer contract, which is the one place a runtime bug could turn a
// refusal into an admission.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { register } = await import("tsx/esm/api");
register();

const tools = await import("../workflows/autoDraft.v9.tools.ts");
const prompt = await import("../workflows/autoDraft.v9.prompt.ts");
const errors = await import("../workflows/autoDraft.v9.errors.ts");
const settle = await import("../workflows/autoDraft.v9.settle.ts");
const postcall = await import("../workflows/autoDraft.v9.postcall.ts");
const impl = await import("../workflows/autoDraft.v9.impl.ts");
const usage = await import("../workflows/autoDraft.v9.usage.ts");
const chatPost = await import("../workflows/chatTurn.v13.post.ts");
const chatPrompt = await import("../workflows/chatTurn.v13.prompt.ts");
const chatImpl = await import("../workflows/chatTurn.v13.impl.ts");
const chatUsage = await import("../workflows/chatTurn.v13.usage.ts");
const registry = await import("../workflows/registry.ts");

const PASS_VECTOR = Object.freeze(
  Object.fromEntries(errors.TIER_B_RUNGS.map((r) => [r, "pass"])),
);

// =============================================================================================
// 1 · GB-1's deliberate widening. The generic kind is NOT in either bound family, and that is a
//     decision with a reason — these cells are what stop a later reader "restoring" it.
// =============================================================================================

test("f-a2.pr2.generic-not-in-bound-families: journal_entry is admitted by NEITHER bound direction, and the two bound arms are byte-identical to v8's", () => {
  assert.deepEqual(tools.allowedCodingKindsForDirection("sales"), ["sales_invoice", "sales_credit_note"]);
  assert.deepEqual(tools.allowedCodingKindsForDirection("purchase"), ["supplier_bill"]);
  for (const dir of ["sales", "purchase"]) {
    assert.ok(
      !tools.allowedCodingKindsForDirection(dir).includes("journal_entry"),
      `journal_entry must never join the ${dir} family — B15 refuses a generic entry anchored to a directional document`,
    );
  }
});

test("f-a2.pr2.generic-reaches-the-db-when-direction-is-unresolved: D18 survives its own new wall", () => {
  // A null direction returns null = "no early family to check", so a genuinely
  // direction-unresolved document still reaches the DB and B15 judges the DOCUMENT's own class.
  // The runtime never decides that question; it only declines to contradict an admission bound
  // that already did.
  assert.equal(tools.allowedCodingKindsForDirection(null), null);
});

test("f-a2.pr2.generic-derives-no-counterparty: v8's ternary would have defaulted it to 'customer'", () => {
  assert.equal(tools.deriveCounterpartyKind("supplier_bill"), "vendor");
  assert.equal(tools.deriveCounterpartyKind("sales_invoice"), "customer");
  assert.equal(tools.deriveCounterpartyKind("sales_credit_note"), "customer");
  assert.equal(tools.deriveCounterpartyKind("journal_entry"), null, "a generic entry names no party — null, never a defaulted customer");
});

// =============================================================================================
// 2 · The draft schema's generic arm, in BOTH directions.
// =============================================================================================

const baseDraft = {
  posting_date: "2026-08-01",
  lines: [
    { account_code: "5000", debit_cents: 1000, credit_cents: 0 },
    { account_code: "1000", debit_cents: 0, credit_cents: 1000 },
  ],
  document_id: "11111111-1111-4111-8111-111111111111",
  evidence: [{ region_idx: 1, quote: "1,000.00", field_path: "invoice.total" }],
};

test("f-a2.pr2.schema-generic-forbids-a-counterparty: a document with a party is DIRECTIONAL and must be coded as one", () => {
  const withParty = prompt.draftJournalEntryInputSchema.safeParse({
    ...baseDraft,
    coding_kind: "journal_entry",
    counterparty: { existing_id: "22222222-2222-4222-8222-222222222222" },
  });
  assert.equal(withParty.success, false);
  const bare = prompt.draftJournalEntryInputSchema.safeParse({ ...baseDraft, coding_kind: "journal_entry" });
  assert.equal(bare.success, true, "a generic entry with no counterparty is the lawful shape");
});

test("f-a2.pr2.schema-directional-still-requires-a-counterparty: making the field optional must not make it optional for the other three kinds", () => {
  for (const kind of ["supplier_bill", "sales_invoice", "sales_credit_note"]) {
    const r = prompt.draftJournalEntryInputSchema.safeParse({ ...baseDraft, coding_kind: kind });
    assert.equal(r.success, false, `${kind} must still require a counterparty`);
  }
});

// =============================================================================================
// 3 · THE CONSUMER CONTRACT (design §3.2, D26). The one place a runtime bug could turn a
//     refusal into an admission — so every non-'pass' shape is forced, individually.
// =============================================================================================

test("f-a2.pr2.consumer-contract: only the exact string 'pass' admits — fail, not_evaluable, an UNKNOWN future value, a JSON null and a MISSING key are all non-admitting", () => {
  for (const bad of ["fail", "not_evaluable", "some_value_minted_after_this_file_was_written", null, undefined, "", "PASS", true]) {
    const vector = { ...PASS_VECTOR, B7: bad };
    assert.equal(errors.rungAdmits(vector, "B7"), false, `value ${JSON.stringify(bad)} must not admit`);
    assert.equal(errors.vectorAdmits(vector), false, `a vector carrying ${JSON.stringify(bad)} must not admit`);
  }
  const missing = { ...PASS_VECTOR };
  delete missing.B15;
  assert.equal(errors.vectorAdmits(missing), false, "a MISSING key must not admit — this is the shape a rung added later arrives in");
  assert.deepEqual(errors.nonAdmittingRungs(missing), ["B15"]);
  assert.equal(errors.vectorAdmits(PASS_VECTOR), true, "the positive control: an all-pass vector DOES admit");
});

test("f-a2.pr2.consumer-contract-absence: an absent vector never admits — a read that cannot say NO has a meaningless YES", () => {
  for (const v of [null, undefined, {}]) {
    assert.equal(errors.vectorAdmits(v), false);
    assert.equal(errors.rungAdmits(v, "B1"), false);
  }
});

test("f-a2.pr2.rung-roster-is-closed-and-keeps-B12/B13-RETIRED: the gap between B11 and B14 is deliberate", () => {
  assert.deepEqual([...errors.TIER_B_RUNGS], ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B14", "B15"]);
  assert.ok(!errors.TIER_B_RUNGS.includes("B12"));
  assert.ok(!errors.TIER_B_RUNGS.includes("B13"));
  // The chat lane must carry the IDENTICAL roster — two closures, one contract.
  assert.deepEqual([...chatPost.TIER_B_RUNGS], [...errors.TIER_B_RUNGS]);
});

// =============================================================================================
// 4 · Reading the post receipt. FAIL-CLOSED on every shape it does not recognise.
// =============================================================================================

const POSTED_RECEIPT = Object.freeze({
  entry_id: "33333333-3333-4333-8333-333333333333",
  posted: true,
  status: "approved",
  post_receipt_id: "44444444-4444-4444-8444-444444444444",
  rung_vector: PASS_VECTOR,
  verdict: { corroborated: true, extraction_id: "55555555-5555-4555-8555-555555555555" },
});

test("f-a2.pr2.receipt-posted: a well-formed posted receipt yields the card, carrying the DB's vector VERBATIM", () => {
  const r = postcall.readPostReceipt(POSTED_RECEIPT);
  assert.equal(r.ok, true);
  assert.equal(r.posted.post_receipt_id, POSTED_RECEIPT.post_receipt_id);
  assert.deepEqual(r.posted.rung_vector, PASS_VECTOR, "the vector is carried, never re-derived");
  assert.deepEqual(r.posted.verdict, POSTED_RECEIPT.verdict);
});

test("f-a2.pr2.receipt-posted-but-vector-disagrees: posted:true with a NON-ADMITTING vector is refused as unreadable, never reported as a post", () => {
  // A DIFFERENTIAL cell: the only difference from the passing case above is one rung's value.
  // Believing the boolean over the vector is precisely the failure §6 calls a finding.
  const contradictory = { ...POSTED_RECEIPT, rung_vector: { ...PASS_VECTOR, B2: "fail" } };
  const r = postcall.readPostReceipt(contradictory);
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "post_receipt_unreadable");
});

test("f-a2.pr2.receipt-posted-missing-receipt-id: a post with no receipt row id is unreadable — the receipt IS the evidence", () => {
  const r = postcall.readPostReceipt({ ...POSTED_RECEIPT, post_receipt_id: null });
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "post_receipt_unreadable");
});

test("f-a2.pr2.receipt-tier-b: a Tier-B refusal keeps its token and its full vector", () => {
  const vector = { ...PASS_VECTOR, B15: "fail" };
  const r = postcall.readPostReceipt({
    entry_id: POSTED_RECEIPT.entry_id,
    posted: false,
    status: "draft",
    refusal: { tier: "B", reason: "generic_on_directional_document", rung: "B15" },
    rung_vector: vector,
    post_receipt_id: null,
  });
  assert.equal(r.ok, false);
  assert.equal(r.tier, "B");
  assert.equal(r.refusal.reason, "generic_on_directional_document");
  assert.deepEqual(r.rung_vector, vector);
  assert.match(r.refusal.message, /direction/i);
});

test("f-a2.pr2.receipt-tier-c: a Tier-C conversion keeps its CLR code and pair reason", () => {
  const r = postcall.readPostReceipt({
    entry_id: POSTED_RECEIPT.entry_id,
    posted: false,
    status: "draft",
    refusal: { tier: "C", reason: "customer_identity_name_only", clr: "CLR10" },
    rung_vector: {},
    post_receipt_id: null,
  });
  assert.equal(r.ok, false);
  assert.equal(r.tier, "C");
  assert.equal(r.refusal.code, "CLR10");
  assert.match(r.refusal.message, /NAME ONLY/i, "constraint 12's wall must read as itself, not as a generic refusal");
});

test("f-a2.pr2.receipt-unknown-shapes: null, a non-object, an empty object and an unknown tier are all refused, never coerced", () => {
  for (const bad of [null, undefined, 7, "posted", {}, { posted: false }, { posted: false, refusal: { tier: "Z", reason: "x" } }]) {
    const r = postcall.readPostReceipt(bad);
    assert.equal(r.ok, false, `${JSON.stringify(bad)} must not read as a post`);
  }
});

test("f-a2.pr2.tier-d-capture: a named belt is named, an UNNAMED reason is recorded as unnamed rather than mislabelled", () => {
  const named = errors.tierDCapture({ code: "CLR40", detail: '{"reason":"fa_belt_unregistered_movement"}' });
  assert.equal(named.tier, "D");
  assert.equal(named.belt, true);
  assert.equal(named.reason, "fa_belt_unregistered_movement");

  const axis = errors.tierDCapture({ code: "CLR40", detail: '{"reason":"advance_movement_unregistered","axis":"unregistered_mirror"}' });
  assert.equal(axis.axis, "unregistered_mirror", "M-5: the mirror case is reported separately from the general one");

  const unnamed = errors.tierDCapture({ code: "CLR99", detail: '{"reason":"something_new"}' });
  assert.equal(unnamed.belt, false, "an unnamed reason must be visibly unnamed — that is what makes it findable");
  assert.equal(unnamed.reason, "something_new", "and its own token is kept, never replaced by a known one");

  const unparseable = errors.tierDCapture({ code: "CLR40", detail: "not json" });
  assert.equal(unparseable.reason, null, "absence recorded as absence — never a guessed token");
});

// =============================================================================================
// 5 · The outcome reducer. Precedence, and the entry id recovered from the PAIRED call.
// =============================================================================================

const toolResult = (toolName, output, toolCallId = "call-1") => ({ type: "tool-result", toolCallId, toolName, output });
const toolCall = (toolName, input, toolCallId = "call-1") => ({ type: "tool-call", toolCallId, toolName, input });

const JE = {
  type: "je_review",
  entry_id: POSTED_RECEIPT.entry_id,
  revision_token: "66666666-6666-4666-8666-666666666666",
  client_id: "77777777-7777-4777-8777-777777777777",
  document_id: baseDraft.document_id,
  provenance_tier: "verified",
};

test("f-a2.pr2.outcome-posted-outranks-drafted: a run that drafted AND posted settles posted", () => {
  const out = prompt.toAutoDraftOutcome([
    toolResult(prompt.DRAFT_TOOL, { ok: true, je_review: JE }, "d1"),
    toolResult(prompt.POST_TOOL, { ok: true, posted: { type: "entry_posted", ...POSTED_RECEIPT, client_id: "c" } }, "p1"),
  ]);
  assert.equal(out.kind, "posted");
  assert.equal(out.entryId, POSTED_RECEIPT.entry_id);
});

test("f-a2.pr2.outcome-post_refused-outranks-its-own-successful-draft: reporting 'drafted' would HIDE that a post was attempted and refused", () => {
  const out = prompt.toAutoDraftOutcome([
    toolResult(prompt.DRAFT_TOOL, { ok: true, je_review: JE }, "d1"),
    toolCall(prompt.POST_TOOL, { entry_id: JE.entry_id }, "p1"),
    toolResult(prompt.POST_TOOL, { ok: false, tier: "B", refusal: { type: "refusal", code: "CLR-POST-B", reason: "not_corroborated", message: "m" } }, "p1"),
  ]);
  assert.equal(out.kind, "post_refused");
  assert.equal(out.tier, "B");
  assert.equal(out.entryId, JE.entry_id, "the entry is recovered from the PAIRED tool call, not from 'the last draft we saw'");
});

test("f-a2.pr2.outcome-unknown-tier-falls-to-D: an unrecognised refusal class is never filed as a committed admission verdict", () => {
  const out = prompt.toAutoDraftOutcome([
    toolCall(prompt.POST_TOOL, { entry_id: JE.entry_id }, "p1"),
    toolResult(prompt.POST_TOOL, { ok: false, tier: "Q", refusal: { type: "refusal", code: "X", reason: "y", message: "m" } }, "p1"),
  ]);
  assert.equal(out.kind, "post_refused");
  assert.equal(out.tier, "D", "unknown tier => the non-admitting, task-failing branch");
});

test("f-a2.pr2.outcome-draft-only-is-unchanged: v8's four outcomes still reduce exactly as before", () => {
  assert.equal(prompt.toAutoDraftOutcome([toolResult(prompt.DRAFT_TOOL, { ok: true, je_review: JE })]).kind, "drafted");
  assert.equal(
    prompt.toAutoDraftOutcome([toolResult(prompt.DRAFT_TOOL, { ok: false, refusal: { type: "refusal", code: "CLR29", reason: "double_coded", message: "m" } })]).kind,
    "noop_existing",
  );
  assert.equal(
    prompt.toAutoDraftOutcome([toolResult(prompt.DRAFT_TOOL, { ok: false, refusal: { type: "refusal", code: "CLR21", reason: "coding_incomplete", message: "m" } })]).kind,
    "refused",
  );
  assert.equal(prompt.toAutoDraftOutcome([]).kind, "none");
});

// =============================================================================================
// 6 · The settle classifier, widened for `posted` — and still fail-closed everywhere else.
// =============================================================================================

const successReceipt = (outcome, entryId) => ({
  task_id: "t1",
  status: outcome === "failed" ? "failed" : "completed",
  outcome,
  entry_id: entryId,
  tokens_spent: 10,
  tokens_refunded: 0,
});

test("f-a2.pr2.settle-posted: a posted settle is recognised, and it MUST carry its entry id", () => {
  assert.equal(settle.classifySettleReceipt(successReceipt("posted", "e1")), "settled");
  assert.throws(
    () => settle.classifySettleReceipt(successReceipt("posted", null)),
    /unrecognized receipt shape/,
    "the DB's re-cut ck_sweep_run_items_shape REQUIRES an entry id on a posted row",
  );
});

test("f-a2.pr2.settle-carried-shapes: drafted/skipped/noop/failed and the four benign no-ops are unchanged", () => {
  assert.equal(settle.classifySettleReceipt(successReceipt("drafted", "e1")), "settled");
  assert.equal(settle.classifySettleReceipt(successReceipt("skipped_lane", null)), "settled");
  assert.equal(settle.classifySettleReceipt(successReceipt("noop_existing", null)), "settled");
  assert.equal(settle.classifySettleReceipt(successReceipt("failed", null)), "settled");
  assert.throws(() => settle.classifySettleReceipt(successReceipt("drafted", null)), /unrecognized receipt shape/);
  assert.throws(() => settle.classifySettleReceipt(successReceipt("skipped_lane", "e1")), /unrecognized receipt shape/);
  assert.equal(settle.classifySettleReceipt({ task_id: "t1", status: "completed", replayed: true }), "settled");
  assert.equal(
    settle.classifySettleReceipt({ task_id: "t1", status: "running", settled: false, outcome: "not_settled", reason: "registry_superseded" }),
    "benign-no-op",
  );
});

test("f-a2.pr2.settle-fails-closed: a missing row, a non-object, an extra field and a cross-paired status/outcome all THROW", () => {
  for (const bad of [null, undefined, "x", {}, { ...successReceipt("posted", "e1"), extra: 1 }, { ...successReceipt("posted", "e1"), status: "failed" }]) {
    assert.throws(() => settle.classifySettleReceipt(bad), /unrecognized receipt/);
  }
});

// =============================================================================================
// 7 · The chat lane.
// =============================================================================================

test("f-a2.pr2.chat-promotes-the-posted-card: a post result yields a top-level entry_posted part, not a bare tool_result", () => {
  const posted = { type: "entry_posted", ...POSTED_RECEIPT, client_id: "c" };
  const parts = chatPrompt.toTypedParts_v13([
    toolCall(chatPost.POST_TOOL, { entry_id: JE.entry_id }, "p1"),
    toolResult(chatPost.POST_TOOL, { ok: true, posted }, "p1"),
  ]);
  const cards = parts.filter((p) => p.type === "entry_posted");
  assert.equal(cards.length, 1, "the human must see that the books changed — a bare tool_result renders nothing");
  assert.equal(cards[0].post_receipt_id, POSTED_RECEIPT.post_receipt_id);
});

test("f-a2.pr2.chat-promotes-the-question: an opened question becomes its own part", () => {
  const parts = chatPrompt.toTypedParts_v13([
    toolResult(chatPost.OPEN_QUESTION_TOOL, { ok: true, question_opened: { type: "question_opened", question_id: "q1", scope_kind: "document", question: "which bill?" } }, "q"),
  ]);
  assert.equal(parts.filter((p) => p.type === "question_opened").length, 1);
});

test("f-a2.pr2.chat-coding-intent-covers-the-post: a turn that POSTED and produced no card must not settle silently", () => {
  assert.equal(chatPrompt.hasCodingIntent_v13([toolCall(chatPost.POST_TOOL, {}, "p1")]), true);
  assert.equal(chatPrompt.hasCodingIntent_v13([toolCall(chatPrompt.DRAFT_TOOL, {}, "d1")]), true);
  assert.equal(chatPrompt.hasCodingIntent_v13([toolCall("read_document", {}, "r1")]), false);
});

test("f-a2.pr2.chat-receipt-classifier-agrees-with-the-unattended-one on the contradiction case", () => {
  const contradictory = { ...POSTED_RECEIPT, rung_vector: { ...PASS_VECTOR, B2: "fail" } };
  assert.equal(chatPost.readChatPostReceipt(contradictory).ok, false);
  assert.equal(chatPost.readChatPostReceipt(POSTED_RECEIPT).ok, true);
});

test("f-a2.pr2.chat-open-question-refuses-without-a-client-pin: the wall is the PIN, so no client means no question", async () => {
  const r = await chatPost.runOpenClientQuestion({ firmId: "f", clientId: null, createdBy: "u", taskId: "t" }, { scope_kind: "client", question: "?" });
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "question_needs_client_pin");
});

test("f-a2.pr2.chat-post-refuses-without-a-client-session", async () => {
  const r = await chatPost.runChatPostJournalEntry(
    { firmId: "f", clientId: null, createdBy: "u", taskId: "t" },
    { entry_id: JE.entry_id, revision_token: JE.revision_token, rationale: "why" },
    "gpt-5.6-terra",
  );
  assert.equal(r.ok, false);
  assert.equal(r.refusal.reason, "post_needs_client_session");
});

test("f-a2.pr2.chat-question-uses-the-pinned-kind-ALONE: ordinary chat reads and posts keep plain interactive", async () => {
  const prior = globalThis.__claraPools;
  const calls = [];
  globalThis.__claraPools = {
    mintWakeCredential: async () => { throw new Error("firm-wide interactive mint is not used by this closure"); },
    mintWakeCredentialObo: async (...args) => { calls.push(["interactive", ...args]); return { credentialId: "i", secret: "plain" }; },
    mintWakeCredentialClientObo: async (...args) => { calls.push(["interactive_client", ...args]); return { credentialId: "ic", secret: "pinned" }; },
    withReadWakeScoped: async (secret, fn) => fn({ query: async () => ({ rows: [{ pack: { books_version: 7 } }], rowCount: 1, secret }) }),
    withWriteWakeScoped: async (secret, fn) => fn({
      query: async (sql) => ({
        rows: [{ receipt: sql.includes("wake_open_question") ? { question_id: "q1" } : POSTED_RECEIPT }],
        rowCount: 1,
        secret,
      }),
    }),
    withRuntime: async () => { throw new Error("not used directly"); },
  };
  try {
    const ctx = { firmId: "f", clientId: "c", createdBy: "u", taskId: "t" };
    const question = await chatPost.runOpenClientQuestion(ctx, { scope_kind: "client", question: "Which treatment?" });
    assert.equal(question.ok, true);
    const posted = await chatPost.runChatPostJournalEntry(
      ctx,
      { entry_id: JE.entry_id, revision_token: JE.revision_token, rationale: "The cited amount and coding tie." },
      "gpt-5.6-terra",
    );
    assert.equal(posted.ok, true);
    assert.deepEqual(calls[0], ["interactive_client", "f", "u", "c"], "the question alone gets the client-pinned kind");
    assert.deepEqual(calls.slice(1), [["interactive", "f", "u"], ["interactive", "f", "u"]], "the post's read and write stay plain interactive");
  } finally {
    globalThis.__claraPools = prior;
  }
});

test("f-a2.pr2.startup-injects-the-client-pinned-mint: the workflow helper is present in the live pool bundle", async () => {
  const source = await readFile(new URL("../plugins/startWorld.ts", import.meta.url), "utf8");
  assert.match(source, /import\s*\{[\s\S]*?mintWakeCredentialClientObo,[\s\S]*?\}\s*from\s*"\.\.\/lib\/pools\.mjs"/);
  assert.match(source, /__claraPools\s*=\s*\{[\s\S]*?mintWakeCredentialClientObo,/);
});

// =============================================================================================
// 8 · The named bounds, the deterministic keys, and the two metering signatures.
// =============================================================================================

test("f-a2.pr2.step-budgets-are-NAMED-and-exported: the unowned stepCountIs(8) constant is gone from both lanes", () => {
  assert.equal(typeof impl.AUTODRAFT_STEP_BUDGET, "number");
  assert.equal(typeof chatImpl.CHAT_STEP_BUDGET, "number");
  assert.equal(impl.AUTODRAFT_STEP_BUDGET, 8, "F-A2 names and retains the eight-round unattended bound");
  assert.equal(chatImpl.CHAT_STEP_BUDGET, 8, "v13 claims the inherited attended bound without expanding it");
});

test("f-a2.pr2.op-keys-are-DETERMINISTIC: the same task and entry always produce the same key, so a WDK replay reuses the reservation", () => {
  assert.equal(postcall.postOpKey("t1", "e1"), postcall.postOpKey("t1", "e1"));
  assert.notEqual(postcall.postOpKey("t1", "e1"), postcall.postOpKey("t1", "e2"));
  assert.notEqual(postcall.postOpKey("t1", "e1"), postcall.postOpKey("t2", "e1"));
  assert.equal(chatPost.chatPostOpKey("t1", "e1"), chatPost.chatPostOpKey("t1", "e1"));
  assert.notEqual(postcall.postOpKey("t1", "e1"), chatPost.chatPostOpKey("t1", "e1"), "the two lanes must not collide on one key");
});

test("f-a2.pr2.model-snapshot-is-complete: provider, model and version are all non-blank, or wake_post_entry refuses the post", () => {
  for (const snap of [postcall.modelSnapshot("gpt-5.6-terra"), chatPost.chatModelSnapshot("gpt-5.6-terra")]) {
    for (const k of ["provider", "model", "version"]) {
      assert.ok(String(snap[k] ?? "").trim().length > 0, `${k} must be non-blank — it is the wall recording WHICH model posted`);
    }
  }
  assert.notEqual(postcall.modelSnapshot("m").version, chatPost.chatModelSnapshot("m").version, "the version names the CLOSURE, so the two lanes differ");
});

test("f-a2.pr2.usage-signature-pinned-identically-in-both-closures: two frozen copies, one contract", () => {
  assert.equal(usage.AGENT_USAGE_IDENT, chatUsage.AGENT_USAGE_IDENT);
  assert.match(usage.AGENT_USAGE_IDENT, /p_call_kind text/);
  assert.match(usage.AGENT_USAGE_IDENT, /p_input_tokens integer/, "the CATALOG's spelling ('integer'), not the declaration's ('int')");
  assert.equal(usage.AUTODRAFT_CALL_KIND, "unattended_posting");
  assert.equal(chatUsage.CHAT_CALL_KIND, "chat");
  assert.notEqual(usage.AUTODRAFT_CALL_KIND, chatUsage.CHAT_CALL_KIND, "the two lanes are different purchases and must be distinguishable in the ledger");
  for (const k of [usage.AUTODRAFT_CALL_KIND, chatUsage.CHAT_CALL_KIND]) {
    assert.notEqual(k, "document_extraction", "the agent door REFUSES the extraction kind — metering through it would stamp a lie");
  }
});

test("f-a2.pr2.chat-usage-writes-through-F-A9-agent-door with the attended identity fields", async () => {
  const prior = globalThis.__claraPools;
  const calls = [];
  globalThis.__claraPools = {
    withRuntime: async (fn) => fn({
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql.includes("pg_get_function_identity_arguments")) {
          return { rows: [{ ident: chatUsage.AGENT_USAGE_IDENT }], rowCount: 1 };
        }
        return { rows: [{ id: "usage-1" }], rowCount: 1 };
      },
    }),
  };
  try {
    await chatUsage.recordChatUsage(
      { firmId: "firm", clientId: "client", createdBy: "actor", taskId: "task" },
      chatUsage.chatEngineId("gpt-5.6-terra"),
      { inputTokens: 12, outputTokens: 8, durationMs: 44 },
      "success",
    );
  } finally {
    globalThis.__claraPools = prior;
  }
  assert.equal(calls.length, 2, "one positive catalog read, then one usage write");
  assert.match(calls[1].sql, /clara\.record_agent_usage_event\(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,\$10,\$11,\$12,\$13,\$14,\$15\)/);
  assert.deepEqual(calls[1].params, [
    "firm", "chat", "llm-openai:gpt-5.6-terra:chatturn-v13", "success", "client",
    null, null, "task", "actor", "interactive", null, null, 12, 8, 44,
  ]);
});

// =============================================================================================
// 9 · The registry repoints, and the frozen predecessors still exported.
// =============================================================================================

test("f-a2.pr2.registry: chatTurn and autoDraft are repointed, and v8/v12/v13 stay EXPORTED so no parked run is stranded", () => {
  assert.equal(registry.workflows.autoDraft.name, "autoDraft_v9");
  assert.equal(registry.workflows.chatTurn.name, "chatTurn_v14", "F-A3 PR-3 (OQ-6) repointed chatTurn: past this PR's own v13 pin");
  assert.equal(typeof registry.autoDraft_v8, "function", "policy (c): never delete an export with in-flight runs");
  assert.equal(typeof registry.chatTurn_v13, "function", "policy (c): this PR's own pin stays exported once superseded");
  assert.equal(typeof registry.chatTurn_v12, "function");
  assert.equal(registry.autoDraft_v9, registry.workflows.autoDraft, "the newly pinned body stays directly addressable by workflow id");
  assert.equal(registry.chatTurn_v14, registry.workflows.chatTurn);
  for (let n = 1; n <= 7; n += 1) assert.equal(typeof registry[`autoDraft_v${n}`], "function");
  for (let n = 1; n <= 11; n += 1) assert.equal(typeof registry[`chatTurn_v${n}`], "function");
});
