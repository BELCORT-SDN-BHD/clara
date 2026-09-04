// The chatTurn_v14 receipt cards, one component-harness test per kind (MBB-4,
// docs/plan/active/mohe-alignment-audit-2026-08-29.md §2).
//
// THE ASSERTION SHAPE — "the wire body, rendered". Each test builds the part
// EXACTLY as the live emitter constructs it (the citations are in
// lib/parts/types.ts, field for field) and then asserts that every value that part
// carries appears in the rendered output. That is the property that was actually
// broken: the emitter put four kinds on the wire (chatTurn.v14.prompt.ts:27,
// pushed at :92/:94) and both renderers answered with the "Unsupported part"
// warning chip, so no test here passes unless the wire body itself made it to the
// screen. Every test additionally asserts the fallback chip is ABSENT — a card that
// renders the chip plus some incidental text would otherwise still match.
//
// It also asserts what must NOT appear: a fabricated figure, a broken link, or the
// literal "null"/"undefined" from a nullable wire field. apps/web/AGENTS.md — "the
// UI never invents a number, verb, receipt, or link."
//
// INSTRUMENT: test/hookHarness.ts's `renderComponent` (a real react-dom/client
// mount) plus test/domInspect.ts, which is what makes `getAttribute("href")`
// readable — hookHarness's own `setAttribute` is a no-op, so an href assertion
// without domInspect would silently pass against nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { PartRenderer, FALLBACK_UNSUPPORTED_PREFIX } from "./PartRenderer";
import type { BankActPart, BankPackPart, ClaraPart, EntryPostedPart, QuestionOpenedPart } from "../../lib/parts/types";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function App(part: ClaraPart): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(PartRenderer, { part }),
  });
}

/** Every <a href> the card rendered, in document order. */
function hrefs(h: { container: Stub }): string[] {
  const out: string[] = [];
  const walk = (n: Stub) => {
    if (n.tagName === "A") {
      const href = (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href");
      if (href) out.push(href);
    }
    for (const c of ((n.childNodes as Stub[] | undefined) ?? [])) walk(c);
  };
  walk(h.container);
  return out;
}

// --- entry_posted ------------------------------------------------------------
// Wire body per packages/runtime/workflows/chatTurn.v13.post.ts:101-108 / :218-228.

const POSTED: EntryPostedPart = {
  type: "entry_posted",
  entry_id: "5f0c2a1e-je",
  client_id: "9b71cc40-client",
  post_receipt_id: "c31d77aa-receipt",
  rung_vector: { document_present: "pass", amount_corroborated: "pass", generic_on_directional_document: "n_a" },
  verdict: { admitted: true, tier: "A" },
};

test("entry_posted renders the posted-entry receipt: every wire identifier, the DB's own rung vector, and a link to the client's journals workbench", async () => {
  const h = await renderComponent(App(POSTED));
  try {
    await h.settle();
    const text = h.text();
    assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX), "entry_posted must never reach the unsupported-part chip");
    assert.match(text, /Entry posted/);
    // The wire body, field by field.
    assert.match(text, /5f0c2a1e-je/, "entry_id must render");
    assert.match(text, /9b71cc40-client/, "client_id must render");
    assert.match(text, /c31d77aa-receipt/, "post_receipt_id must render");
    for (const [rung, outcome] of Object.entries(POSTED.rung_vector)) {
      assert.match(text, new RegExp(`${rung}: ${outcome}`), `rung_vector entry ${rung} must render with the DB's own outcome token`);
    }
    // The link is a REAL route in this app's tree (app/(firm)/clients/[clientId]/journals/page.tsx).
    assert.deepEqual(hrefs(h), ["/clients/9b71cc40-client/journals"]);
    // Nothing this card could only have invented: the wire carries no amount.
    assert.doesNotMatch(text, /RM|0\.00/, "the card must never render a figure — the wire carries none");
  } finally {
    await h.unmount();
  }
});

test("entry_posted with an EMPTY rung_vector renders the receipt without an empty vector block", async () => {
  const bare: EntryPostedPart = { ...POSTED, rung_vector: {} };
  const h = await renderComponent(App(bare));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /5f0c2a1e-je/, "the receipt itself must still render");
    assert.doesNotMatch(text, /Receipt vector/, "an empty vector must render no vector heading at all, never an empty labelled block");
  } finally {
    await h.unmount();
  }
});

test("entry_posted with an unfilled client_id renders the receipt but NO link — never /clients//journals", async () => {
  // The emitter constructs the part with client_id: "" (chatTurn.v13.post.ts:223)
  // and fills it at :333. A card that built the href regardless would ship a 404
  // wearing an affordance's clothes.
  const h = await renderComponent(App({ ...POSTED, client_id: "" }));
  try {
    await h.settle();
    assert.match(h.text(), /5f0c2a1e-je/, "the receipt itself must still render");
    assert.deepEqual(hrefs(h), [], "no client id on the wire means no link at all");
  } finally {
    await h.unmount();
  }
});

// --- question_opened ---------------------------------------------------------
// Wire body per packages/runtime/workflows/chatTurn.v13.post.ts:111-116 / :403-405.

const QUESTION: QuestionOpenedPart = {
  type: "question_opened",
  question_id: "a17be004-question",
  scope_kind: "document",
  question: "Is the BRIGHTPATH invoice a repair or a capital improvement?",
};

test("question_opened renders the question VERBATIM with its id, scope and the Needs-you link", async () => {
  const h = await renderComponent(App(QUESTION));
  try {
    await h.settle();
    const text = h.text();
    assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX), "question_opened must never reach the unsupported-part chip");
    assert.match(text, /Question opened/);
    assert.match(text, /a17be004-question/, "question_id must render");
    assert.match(text, /document/, "scope_kind must render");
    // The DB's own bytes, never re-worded.
    assert.ok(text.includes(QUESTION.question), "the question text must render verbatim");
    // The part carries no client_id, so the only honest destination is the firm
    // inbox the durable question actually lands in.
    assert.deepEqual(hrefs(h), ["/needs-you"]);
  } finally {
    await h.unmount();
  }
});

// --- bank_act ----------------------------------------------------------------
// Wire body per packages/runtime/workflows/chatTurn.v14.bank.ts:77.

const ACT: BankActPart = {
  type: "bank_act",
  verb: "settle_from_bank_line",
  subject_id: "77b0e1c4-line",
  op_key: "op-77b0e1c4",
  result: { settled: true, allocation_id: "alloc-1" },
};

test("bank_act renders the governed verb verbatim with its subject and op key", async () => {
  const h = await renderComponent(App(ACT));
  try {
    await h.settle();
    const text = h.text();
    assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX), "bank_act must never reach the unsupported-part chip");
    assert.match(text, /Bank act/);
    // The verb IS the receipt's claim about what happened — rendered as the door
    // names it, never re-labelled into friendlier prose.
    assert.match(text, /settle_from_bank_line/);
    assert.match(text, /77b0e1c4-line/, "subject_id must render");
    assert.match(text, /op-77b0e1c4/, "op_key must render");
  } finally {
    await h.unmount();
  }
});

test("bank_act with a null subject_id renders the act without the row — never the literal 'null'", async () => {
  const h = await renderComponent(App({ ...ACT, verb: "complete_bank_reconciliation", subject_id: null, result: {} }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /complete_bank_reconciliation/, "the act must still render");
    assert.doesNotMatch(text, /null|undefined/, "a nullable wire field must drop out of the card, never print as a word");
  } finally {
    await h.unmount();
  }
});

// --- bank_pack ---------------------------------------------------------------
// Wire body per packages/runtime/workflows/chatTurn.v14.bank.ts:79.

const PACK: BankPackPart = {
  type: "bank_pack",
  bank_account_id: "e4402f19-account",
  digest: "sha256:9f2c11ab77",
  pack: { lines: 12, as_of: "2026-08-29" },
};

test("bank_pack renders the read receipt with the account and the grounding digest every act must cite", async () => {
  const h = await renderComponent(App(PACK));
  try {
    await h.settle();
    const text = h.text();
    assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX), "bank_pack must never reach the unsupported-part chip");
    assert.match(text, /Bank pack read/);
    assert.match(text, /e4402f19-account/, "bank_account_id must render");
    assert.match(text, /sha256:9f2c11ab77/, "the digest is the whole point of this receipt — it must render");
    // C6 NARROWED THIS, AND THIS FIXTURE IS NOW THE FAIL-CLOSED CONTROL. The card
    // reads a pack that DECLARES `schema: "clara.bank-pack/v1"` (the cell below);
    // this payload declares nothing, so it must still render identifiers only and
    // leak no count out of an unrecognised shape.
    assert.doesNotMatch(text, /\[object Object\]/);
    assert.doesNotMatch(text, /12/, "an UNDECLARED pack payload must not have a count read out of it");
  } finally {
    await h.unmount();
  }
});

// --- C6: the payloads that were already on the wire and were being dropped ----

test("bank_act renders the LEDGER's own string and boolean result fields, keyed by the DB's field names", async () => {
  // `_agent_match_bank_line_core` returns the delegate's own row and
  // `classifyBankResult` passes it through verbatim (chatTurn.v14.bank.ts), so
  // `match_id` and `status` are the ledger's, not this UI's.
  const h = await renderComponent(App({
    ...ACT,
    verb: "match_bank_line",
    result: { match_id: "match-9911", status: "live", reversed: false },
  }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /The ledger's own answer/, "the block is labelled, so a reader knows whose words these are");
    assert.match(text, /match_id/, "the DB's own field name is the label");
    assert.match(text, /match-9911/, "and its value is the DB's own token");
    assert.match(text, /status/);
    assert.match(text, /live/);
    assert.match(text, /reversed/);
    assert.match(text, /false/, "a boolean verdict renders as the DB's own value");
    assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX));
  } finally {
    await h.unmount();
  }
});

test("bank_act NEVER renders a numeral out of its unversioned result payload", async () => {
  // The structural half of hard constraint 2 for this card: `result` carries no
  // version token, so nothing here can vouch for a figure inside it. A cents amount
  // is exactly the value a bookkeeper would read as authoritative.
  const h = await renderComponent(App({
    ...ACT,
    verb: "match_bank_line",
    result: { match_id: "match-9911", matched_cents: 125000, line_count: 3 },
  }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /match-9911/, "the identifier still renders — this is a refusal to print FIGURES, not the payload");
    assert.doesNotMatch(text, /125000/, "a cents figure out of an unversioned payload must never reach the screen");
    assert.doesNotMatch(text, /matched_cents/, "and neither must its label, which would imply a hidden amount");
  } finally {
    await h.unmount();
  }
});

test("bank_act never walks a nested result value into `[object Object]`", async () => {
  const h = await renderComponent(App({
    ...ACT,
    result: { rung_vector: { m11: "pass" }, entries: ["e-1"], match_id: "match-77" },
  }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /match-77/);
    assert.doesNotMatch(text, /\[object Object\]/);
    assert.doesNotMatch(text, /rung_vector/);
  } finally {
    await h.unmount();
  }
});

test("bank_pack renders the DB's OWN counts when the pack declares clara.bank-pack/v1", async () => {
  // Postgres computed both with `jsonb_array_length` in the same statement that built
  // the pack this digest hashes (0121_f_a3_pr1b_agent_limb.sql).
  const h = await renderComponent(App({
    ...PACK,
    pack: { schema: "clara.bank-pack/v1", budget: { lines: 12, candidates: 4, truncated: false } },
  }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /What this pack held/);
    assert.match(text, /12 unmatched lines/, "the DB's own line count, printed as handed over");
    assert.match(text, /4 match candidates/);
    assert.match(text, /sha256:9f2c11ab77/, "the digest still renders — the new block is additive");
    assert.doesNotMatch(text, /truncated/i, "a pack the DB reported COMPLETE must not carry a truncation warning");
  } finally {
    await h.unmount();
  }
});

test("bank_pack warns when the LEDGER said the pack was truncated, and stays silent when it did not say", async () => {
  const truncated = await renderComponent(App({
    ...PACK,
    pack: { schema: "clara.bank-pack/v1", budget: { lines: 200, candidates: 40, truncated: true } },
  }));
  try {
    await truncated.settle();
    assert.match(truncated.text(), /reported this pack as truncated/, "the human deciding on this act has to know it is partial");
  } finally {
    await truncated.unmount();
  }

  // ABSENCE IS NOT EVIDENCE: no flag is not a claim of completeness, and it is not a
  // claim of truncation either. Nothing is said.
  const unknown = await renderComponent(App({
    ...PACK,
    pack: { schema: "clara.bank-pack/v1", budget: { lines: 5, candidates: 1 } },
  }));
  try {
    await unknown.settle();
    const text = unknown.text();
    assert.match(text, /5 unmatched lines/);
    assert.doesNotMatch(text, /truncated/i);
  } finally {
    await unknown.unmount();
  }
});

test("bank_pack singularises from the DB's own count rather than printing a bare number", async () => {
  const h = await renderComponent(App({
    ...PACK,
    pack: { schema: "clara.bank-pack/v1", budget: { lines: 1, candidates: 1, truncated: false } },
  }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /1 unmatched line[^s]/, "one line, not '1 unmatched lines'");
    assert.match(text, /1 match candidate[^s]/);
  } finally {
    await h.unmount();
  }
});

test("bank_act renders the LIVE settle return without its cents figure — the numeral arrived as TEXT", async () => {
  // The exact object `clara._settle_from_bank_line_core` returns
  // (0121_f_a3_pr1b_agent_limb.sql:1628 builds `'residue_cents', v_res->>'residue_cents'`,
  // and `->>` is TEXT), carried verbatim to `bank_act.result`. Filtering by JSON TYPE
  // alone put "1250" on this card as if the ledger had asked the human to read it.
  const h = await renderComponent(App({
    ...ACT,
    verb: "settle_from_bank_line",
    result: {
      match_id: "m-1",
      status: "live",
      group_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      residue_cents: "1250",
    },
  }));
  try {
    await h.settle();
    const text = h.text();
    assert.doesNotMatch(text, /1250/, "a cents figure that arrived as a string must not reach the card");
    assert.doesNotMatch(text, /residue_cents/, "and neither must its label, which would imply a hidden amount");
    // The rest of the receipt still renders — this is a refusal to print FIGURES, not the
    // payload. The uuid is the discriminating one: it is full of digits and must survive.
    assert.match(text, /m-1/);
    assert.match(text, /live/);
    assert.match(text, /3f2504e0-4f89-41d3-9a0c-0305e82c3301/);
    assert.match(text, /group_id/);
  } finally {
    await h.unmount();
  }
});

test("bank_pack NAMES a schema it cannot read, and says nothing about a payload that declares none", async () => {
  const skewed = await renderComponent(App({
    ...PACK,
    pack: { schema: "clara.bank-pack/v2", budget: { lines: 12, candidates: 4 } },
  }));
  try {
    await skewed.settle();
    const text = skewed.text();
    // The token is the DB's own and renders verbatim — a human reading "came back as
    // clara.bank-pack/v2" learns the runtime moved ahead of this page.
    assert.match(text, /clara\.bank-pack\/v2/);
    assert.match(text, /cannot read/);
    // And still no count out of the unread shape.
    assert.doesNotMatch(text, /12 unmatched/);
  } finally {
    await skewed.unmount();
  }

  // A payload that declares NOTHING has nothing to report, and inventing a sentence for
  // it would be noise on a card that is otherwise correct.
  const undeclared = await renderComponent(App(PACK));
  try {
    await undeclared.settle();
    assert.doesNotMatch(undeclared.text(), /cannot read/);
    assert.match(undeclared.text(), /sha256:9f2c11ab77/, "the identifiers still render");
  } finally {
    await undeclared.unmount();
  }
});

