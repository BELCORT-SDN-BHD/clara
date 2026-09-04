// WHAT / WHY / NEXT / WHEN on a Needs-you row (E-3 / CB-AE2E-026), and the
// per-kind `period` label that replaced one word meaning three things.
//
// The derivations are pinned as PURE functions first (lib/firm/needs-you-row-facts.ts),
// then the row is RENDERED so the cells prove the derivation actually reaches a
// human — a pure-function green over a component that never calls it is exactly
// the vacuous shape this repo keeps paying for.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { NeedsYouRow } from "./needs-you-row";
import messages from "../../messages/en.json";
import type { ReviewQueueRow } from "../../lib/firm/needs-you";
import {
  reviewQueuePeriodKind,
  reviewQueueTier,
  reviewQueueWhyChips,
  reviewQueueWhyKey,
  waitingDays,
} from "../../lib/firm/needs-you-row-facts";

enableDomInspection();

const BASE: ReviewQueueRow = {
  row_kind: "draft", section: "needs_review", client_id: "c1", counterparty_id: null, filing_id: null,
  entry_id: "e1", question_id: null, task_id: null, document_id: null, lane: "needs_review", auto: false,
  rule_backed: false, high_stakes: false, aged_since: null, amount_cents: null, period: null,
  question_text: null, created_at: "2026-04-01T00:00:00Z", id: "e1",
  coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null, advance_id: null,
  client_name: null, batch_ids: null, open_proposal_count: null,
};

const row = (patch: Partial<ReviewQueueRow>): ReviewQueueRow => ({ ...BASE, ...patch });

async function renderRow(r: ReviewQueueRow, clientName: string | null = "Acme Sdn Bhd") {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement("ul", null, createElement(NeedsYouRow, {
        row: r, clientName, busy: false, error: null, onAct: async () => true,
      })),
    }),
  );
}

// --- the pure derivations ---------------------------------------------------

test("reviewQueueWhyKey: the LANE decides when the DB classified the row, the SECTION when it did not", () => {
  assert.equal(reviewQueueWhyKey({ lane: "needs_you", section: "needs_you" }), "laneNeedsYou");
  assert.equal(reviewQueueWhyKey({ lane: "needs_review", section: "needs_review" }), "laneNeedsReview");
  assert.equal(reviewQueueWhyKey({ lane: "ready", section: "needs_review" }), "laneReady");
  // The six kinds the queue never lane-classifies (coding_task, compliance_watch,
  // lint_finding, fixed_asset_incomplete, staff_advance_incomplete, seeding_proposal)
  // all arrive with lane NULL and fall back to their own section.
  assert.equal(reviewQueueWhyKey({ lane: null, section: "needs_you" }), "sectionNeedsYou");
  assert.equal(reviewQueueWhyKey({ lane: null, section: "needs_review" }), "sectionNeedsReview");
  // A lane value outside the closed set must not reach t() with a key path.
  assert.equal(reviewQueueWhyKey({ lane: "something_new", section: "needs_review" }), "sectionNeedsReview");
});

test("reviewQueueWhyChips: only TRUE flags produce a chip — never an absence", () => {
  assert.deepEqual(reviewQueueWhyChips({ auto: false, rule_backed: false }), []);
  assert.deepEqual(reviewQueueWhyChips({ auto: true, rule_backed: false }), ["auto"]);
  assert.deepEqual(reviewQueueWhyChips({ auto: true, rule_backed: true }), ["auto", "ruleBacked"]);
});

test("reviewQueueTier: two vocabularies on ONE column are keyed by the PAIR, and an unknown value renders raw", () => {
  assert.deepEqual(reviewQueueTier({ row_kind: "compliance_watch", tier: "overdue" }), { key: "compliance_watch.overdue" });
  assert.deepEqual(reviewQueueTier({ row_kind: "lint_finding", tier: "critical" }), { key: "lint_finding.critical" });
  // 'critical' is a LINT severity, not a watch state — the same token must not
  // borrow the other kind's label.
  assert.deepEqual(reviewQueueTier({ row_kind: "compliance_watch", tier: "critical" }), { raw: "critical" });
  assert.equal(reviewQueueTier({ row_kind: "draft", tier: null }), null);
});

test("reviewQueuePeriodKind: exactly the three kinds whose `period` has its own meaning", () => {
  assert.equal(reviewQueuePeriodKind("draft"), "draft");
  assert.equal(reviewQueuePeriodKind("uncoded_filing"), "uncoded_filing");
  assert.equal(reviewQueuePeriodKind("compliance_watch"), "compliance_watch");
  assert.equal(reviewQueuePeriodKind("open_question"), null);
  assert.equal(reviewQueuePeriodKind("seeding_proposal"), null);
});

test("waitingDays: floors whole days, clamps a future instant to 0, and answers null on nothing to measure", () => {
  const now = new Date("2026-09-04T10:00:00Z");
  assert.equal(waitingDays("2026-08-29T10:00:00Z", now), 6);
  assert.equal(waitingDays("2026-09-04T09:00:00Z", now), 0);
  assert.equal(waitingDays("2026-09-05T10:00:00Z", now), 0, "a clock skew must not render a negative age");
  assert.equal(waitingDays(null, now), null, "no instant means render nothing, never 'waiting 0 days'");
  assert.equal(waitingDays("not-a-date", now), null);
});

// --- the rendered row -------------------------------------------------------

test("a row answers WHAT (client + kind), WHY (a sentence and its chips), NEXT and WHEN", async () => {
  // RELATIVE TO NOW, not a fixed instant. The component reads the real clock, so
  // a hard-coded `aged_since` makes the expected age drift with the calendar and
  // the time of day — a test that goes red on a Tuesday teaches nothing.
  const sixDaysAgo = new Date(Date.now() - 6 * 86_400_000 - 60_000).toISOString();
  const h = await renderRow(row({
    row_kind: "open_question", section: "needs_you", lane: "needs_you", question_id: "q1", id: "q1",
    auto: true, rule_backed: true, aged_since: sixDaysAgo,
  }));
  try {
    await h.settle();
    const text = h.text();
    // WHAT — the client's NAME, which no row carried before this train.
    assert.match(text, /Client: ?Acme Sdn Bhd/, "the cross-client queue must name the client");
    assert.match(text, /Open question/, "and the kind, in plain words");
    // WHY — the derived sentence plus the two flag chips.
    assert.match(text, /Clara could not settle this on its own/, "the WHY sentence must render");
    assert.match(text, /Clara raised this unattended/, "`auto` must render as a chip — it was read and never shown");
    assert.match(text, /A saved coding rule already matched/, "`rule_backed` likewise");
    // NEXT — the link, named as an action rather than floating among badges.
    assert.match(text, /Next:/, "the link must be labelled as the next action");
    assert.match(text, /Open the documents tab/, "and keep its destination-specific label");
    // WHEN — the instant AND a plain age, and never the word "due".
    assert.match(text, /Waiting since/);
    assert.match(text, /Waiting 6 days/, "`aged_since` must render as an age — this queue ships no deadline column");
    assert.doesNotMatch(text, /\bdue\b/i, "nothing on this queue is DUE; saying so would invent a deadline");
  } finally {
    await h.unmount();
  }
});

test("a row with no client_id says FIRM-WIDE, and an unnamed client falls back to a short id — never a guessed name", async () => {
  const firmWide = await renderRow(row({ client_id: null }), null);
  try {
    await firmWide.settle();
    assert.match(firmWide.text(), /Firm-wide — no single client/);
  } finally {
    await firmWide.unmount();
  }
  const unnamed = await renderRow(row({ client_id: "3f2a1b8c-0000-4000-8000-000000000000" }), null);
  try {
    await unnamed.settle();
    assert.match(unnamed.text(), /Client 3f2a1b8c/, "an unresolved client renders its short id");
    assert.doesNotMatch(unnamed.text(), /Acme/, "and never a name from anywhere else");
  } finally {
    await unnamed.unmount();
  }
});

test("PERIOD carries a per-kind label — the three-meanings-one-word regression", async () => {
  const cases: [string, RegExp][] = [
    ["draft", /posting date/],
    ["uncoded_filing", /invoice date/],
    ["compliance_watch", /watch window ends/],
  ];
  const seen: string[] = [];
  for (const [kind, label] of cases) {
    const h = await renderRow(row({ row_kind: kind, period: "2026-07-31" }));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, label, `${kind}'s period must carry its own label`);
      assert.doesNotMatch(text, /\bperiod\b/, `${kind} must not fall back to the bare word "period"`);
      seen.push((label.source));
    } finally {
      await h.unmount();
    }
  }
  assert.equal(new Set(seen).size, 3, "the three labels must be DIFFERENT — that is the whole defect");
});

test("the uncoded-filing label makes no fiscal-year claim (E-5 / H-23: two populations, one word)", async () => {
  const h = await renderRow(row({ row_kind: "uncoded_filing", filing_id: "f1", id: "f1", lane: "needs_you" }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /Filing awaiting an entry/, "the queue label states what the row IS");
    assert.doesNotMatch(
      text,
      /Uncoded filing/,
      "the old label collided with the close gate's own 'uncoded_documents' census, which counts only FY-DATED filings",
    );
    assert.doesNotMatch(text, /fiscal year|FY-dated|this year/i, "the queue has NO date predicate, so it may not imply one");
  } finally {
    await h.unmount();
  }
});

test("a compliance_watch renders its tier as a STATE label, not the raw token", async () => {
  const h = await renderRow(row({ row_kind: "compliance_watch", section: "needs_you", lane: null, tier: "overdue", watch_id: "w1", id: "w1" }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /Registration overdue/, "the watch state must render in words");
    assert.doesNotMatch(text, /\boverdue\b(?! )/, "and not as its raw DB token alone");
    assert.match(text, /This kind always waits on a person/, "a lane-less kind falls back to its section for the WHY sentence");
  } finally {
    await h.unmount();
  }
});
