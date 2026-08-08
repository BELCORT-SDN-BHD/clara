// WAVE E / F9 — THE RETRY LEG of autoDraft_v7's outcome reduction.
//
// SPLIT OUT of wave-e-f9-autodraft-v7.test.mjs (which reached the 500-line cap): that file's
// subject is the toolface and the resolver; this one's is what the workflow DOES with a model
// loop that refused once and then succeeded — the sequence F9's own system classification
// invites ("read the document again and re-cite").
//
// WHY IT EXISTS. The cross-model re-verify found, by execution, that the reducer returned on
// the FIRST draft_journal_entry result while the AI SDK's content getter flattens EVERY step
// of the loop chronologically (ai@7.0.31 dist/index.js:9679). So [transient refusal,
// successful draft] reduced to `refused` and the run settled FAILED over a draft that already
// stood. The native round-3 re-check then found the same class one level down: within the
// refused class, plain recency buried a CLR23 vendor conflict behind a transient idx slip, so
// no scoped open-question was opened for a decision only a human can make.
//
// THE RULE THESE CELLS PIN: drafted > noop_existing > (last question-shaped refusal) >
// (last refusal) > none. Aligned with stoppedOnSuccessfulDraft, which ends the loop on ANY
// successful result in the LAST step — which is why a success WINS rather than merely coming
// last: two draft calls can land in one step.

import { test } from "node:test";
import assert from "node:assert/strict";
import { src } from "./wave-e-f9-testkit.mjs";

const { register } = await import("tsx/esm/api");
register();

const promptV7 = await import("../workflows/autoDraft.v7.prompt.ts");
const promptV6 = await import("../workflows/autoDraft.v6.prompt.ts");

const DOC = "11111111-1111-1111-1111-111111111111";

const draftResult = (output, id = "call-1") => ({ type: "tool-result", toolCallId: id, toolName: "draft_journal_entry", output });
const TRANSIENT = { ok: false, refusal: { type: "refusal", code: "transient", reason: "evidence_snapshot_changed", message: "…re-read and re-cite." } };
const SUCCESS = {
  ok: true,
  je_review: { type: "je_review", entry_id: "entry-9", revision_token: "rev-9", client_id: "c1", document_id: DOC, provenance_tier: "model_read" },
};
const DOUBLE_CODED = { ok: false, refusal: { type: "refusal", code: "CLR29", reason: "double_coded", message: "already being coded" } };
const OTHER_REFUSAL = { ok: false, refusal: { type: "refusal", code: "CLR21", reason: "coding_incomplete", message: "no lawful draft" } };

test("THE RETRY CELL: [transient refusal, then a successful draft] reduces to DRAFTED — the run must not settle failed over a draft that stands", () => {
  // The AI SDK's `content` getter flattens EVERY step of the model loop chronologically, so
  // this is the exact array the workflow reduces after a transient the model recovered from.
  // The pre-fix reducer returned on the FIRST draft result and answered "refused" here.
  const outcome = promptV7.toAutoDraftOutcome([
    { type: "text", text: "reading the document" },
    draftResult(TRANSIENT, "call-1"),
    { type: "text", text: "re-reading and re-citing" },
    draftResult(SUCCESS, "call-2"),
  ]);
  assert.equal(outcome.kind, "drafted", "a successful retry must win — the DB write already happened, and a failed settle would be a receipt that lies");
  assert.equal(outcome.entryId, "entry-9");
});

test("…and the reverse order is the control: [success, then a later transient] is still DRAFTED (precedence, not position)", () => {
  const outcome = promptV7.toAutoDraftOutcome([draftResult(SUCCESS, "call-1"), draftResult(TRANSIENT, "call-2")]);
  assert.equal(outcome.kind, "drafted", "a plain LAST-result rule would have reported the transient and buried a real draft");
});

test("the SAME-STEP edge the stop condition forces: two draft calls in one step, [success, refusal], is DRAFTED — stoppedOnSuccessfulDraft ends the loop on ANY successful result in the last step, wherever it sits", () => {
  const outcome = promptV7.toAutoDraftOutcome([draftResult(SUCCESS, "a"), draftResult(OTHER_REFUSAL, "b")]);
  assert.equal(outcome.kind, "drafted");
  // …and the alignment is a real property of the source, not a claim: the stop condition
  // keys on output.ok === true, which runDraftJournalEntry only ever pairs with je_review.
  const implSrc = src("autoDraft.v7.impl.ts");
  assert.match(implSrc, /r\.toolName === DRAFT_TOOL && !!r\.output && typeof r\.output === "object" && \(r\.output as \{ ok\?: unknown \}\)\.ok === true/);
});

test("among refusals the LAST wins (the freshest state the model reached), and double_coded outranks any later transient — 'already coded' must never become 'failed'", () => {
  const twoRefusals = promptV7.toAutoDraftOutcome([draftResult(OTHER_REFUSAL, "a"), draftResult(TRANSIENT, "b")]);
  assert.equal(twoRefusals.kind, "refused");
  assert.equal(twoRefusals.refusal.reason, "evidence_snapshot_changed", "the freshest refusal is the honest one to record");
  for (const seq of [[TRANSIENT, DOUBLE_CODED], [DOUBLE_CODED, TRANSIENT]]) {
    const o = promptV7.toAutoDraftOutcome(seq.map((x, i) => draftResult(x, `c${i}`)));
    assert.equal(o.kind, "noop_existing", `WA-L8: a double_coded refusal reports work that EXISTS, in either order (${JSON.stringify(seq.map((s) => s.refusal.reason))})`);
  }
  assert.equal(promptV7.toAutoDraftOutcome([{ type: "text", text: "explained a block" }]).kind, "none");
});

test("within the refused class a QUESTION-SHAPED refusal outranks a later system one, in BOTH orderings — the vendor conflict a human must resolve is never buried behind a retry artefact", () => {
  const vendorConflict = { ok: false, refusal: { type: "refusal", code: "CLR23", reason: "vendor_unresolved", message: "The counterparty could not be resolved as proposed." } };
  for (const [label, seq] of [
    ["conflict first, transient on the retry", [vendorConflict, TRANSIENT]],
    ["transient first, conflict on the retry", [TRANSIENT, vendorConflict]],
  ]) {
    const outcome = promptV7.toAutoDraftOutcome(seq.map((x, i) => draftResult(x, `q${i}`)));
    assert.equal(outcome.kind, "refused", label);
    assert.equal(outcome.refusal.code, "CLR23", `${label}: the actionable refusal must survive the reduction`);
    assert.equal(promptV7.isQuestionShaped(outcome.refusal), true, `${label}: …so the sweep still opens the scoped open-question a human can answer`);
  }
  // Recency still decides between two refusals of the SAME kind — the rule narrows the
  // precedence, it does not abandon freshness.
  const twoSystem = promptV7.toAutoDraftOutcome([
    draftResult({ ok: false, refusal: { type: "refusal", code: "transient", reason: "evidence_not_read", message: "read first" } }, "s0"),
    draftResult(TRANSIENT, "s1"),
  ]);
  assert.equal(twoSystem.refusal.reason, "evidence_snapshot_changed", "two system refusals: the freshest wins, as before");
  const twoQuestioned = promptV7.toAutoDraftOutcome([
    draftResult(vendorConflict, "q0"),
    draftResult({ ok: false, refusal: { type: "refusal", code: "CLR21", reason: "currency_unsupported", message: "MYR only" } }, "q1"),
  ]);
  assert.equal(twoQuestioned.refusal.reason, "currency_unsupported", "two question-shaped refusals: the freshest wins too");
  // …and a successful draft still beats both — the outer precedence is unchanged.
  assert.equal(promptV7.toAutoDraftOutcome([draftResult(vendorConflict, "a"), draftResult(SUCCESS, "b")]).kind, "drafted");
});

test("the reducer's answer really is what the workflow settles on — the branch mapping is pinned in autoDraft.v7.ts's own source", () => {
  const entry = src("autoDraft.v7.ts");
  assert.match(entry, /if \(outcome\.kind === "drafted"\) \{\s*\n\s*await settle\("drafted", seg\.usageTokens, outcome\.entryId, null\);/, "drafted -> settle('drafted') with the entry id");
  assert.match(entry, /if \(outcome\.kind === "noop_existing"\) \{[\s\S]{0,400}?await settle\("noop_existing"/, "noop_existing -> the success-shaped settle");
  assert.match(entry, /await settle\("failed", seg\.usageTokens, null, refusal\);/, "everything else -> the failed settle");
});

test("THE DEFECT IS PRE-EXISTING AND v6 IS UNTOUCHED: the frozen v6 reducer still returns on the FIRST draft result, and answers 'refused' to the very sequence v7 now answers 'drafted'", () => {
  // This is the evidence for shipping the correction in v7/v10 only. v6 is deployed and
  // frozen; what v7 changed is the REACHABILITY of the defect, by inviting in-run retries.
  const seq = [draftResult(TRANSIENT, "call-1"), draftResult(SUCCESS, "call-2")];
  assert.equal(promptV6.toAutoDraftOutcome(seq).kind, "refused", "v6 must still show the old behaviour — if this flips, a frozen body was edited");
  assert.equal(promptV7.toAutoDraftOutcome(seq).kind, "drafted");
  const v6Body = src("autoDraft.v6.prompt.ts");
  assert.match(v6Body, /if \(isJeReview\(output\.je_review\)\) \{\s*\n\s*return \{ kind: "drafted"/, "v6 returns on the first result — the shape this fix replaces");
});

