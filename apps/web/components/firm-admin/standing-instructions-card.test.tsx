// #1050 — the standing-instruction card: the surface that makes the firm's own instruction to
// Clara something a member can give, see and take back.
//
// WHY THE CARD EXISTS. Migration 0338 re-opened the clocked `close_prep` lane behind a firm-level
// standing instruction recorded by a named member. Until this card there was no way to record or
// withdraw one from the product at all, and the refusal a firm would meet named two SQL functions
// as its remedy — which the standing owner ruling of 2026-09-20 ("beta: nothing dark") does not
// allow. These cells drive the card's own contract: what it says in each of the two states, what
// it hands its writers, and that a refusal reaches the person VERBATIM with its code and reason.
//
// The card is presentational. The parent (`FirmSettingsPanelView`) owns the door calls, the fresh
// op key per submission and the re-read that follows each one — exactly as it already owns the
// caps write — so the stubs here record what the card handed them.
//
// AXE LIVES IN `firm-settings-a11y.test.tsx`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { StandingInstructionsCard, type StandingInstructionWriter } from "./standing-instructions-card";
import type { FirmStandingInstruction, StandingInstructionOutcome } from "../../lib/firm/standing-instructions";
import type { FirmSettingsView } from "./firm-settings-view";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;
type View = FirmSettingsView<FirmStandingInstruction | null>;

const LIVE: FirmStandingInstruction = {
  id: "bbbbbbbb-2222-4222-8222-222222222222",
  instructionKey: "prepayment_schedule_at_close",
  reason: "Our subscriptions are all annual and we close monthly.",
  recordedBy: "cccccccc-3333-4333-8333-333333333333",
  recordedAt: "2026-09-25T02:00:00.000Z",
};

const RECORDED: StandingInstructionOutcome = { kind: "recorded", instructionId: LIVE.id };
const WITHDRAWN: StandingInstructionOutcome =
  { kind: "withdrawn", instructionId: LIVE.id, plansStillPosting: 0 };

async function mount(view: View, writers: {
  record?: StandingInstructionWriter;
  withdraw?: StandingInstructionWriter;
} = {}) {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(StandingInstructionsCard, { view, ...writers }),
    }),
  );
}

const reasonField = (h: { find: (p: (n: Stub) => boolean) => Stub | null }) =>
  h.find((n) => n.tagName === "INPUT" && n.id === "firm-standing-instruction-reason");

const buttonMatching = (h: { find: (p: (n: Stub) => boolean) => Stub | null }, re: RegExp) =>
  h.find((n) => n.tagName === "BUTTON" && re.test(textOf(n)));

test("ticket 1050 — a firm that has instructed nothing is TOLD SO, in words, and is offered the control that changes it", async () => {
  const h = await mount({ status: "ready", data: null }, { record: async () => RECORDED });
  try {
    // ABSENCE IS A STATE, NOT AN EMPTY BOX. The sentence says what Clara does instead, which is
    // the fact a bookkeeper needs: it asks rather than acts.
    assert.match(h.text(), /has not told Clara to establish prepayment schedules at close/i);
    assert.ok(buttonMatching(h, /let clara do this/i), "the feature is unreachable from the product");
    assert.equal(buttonMatching(h, /take this back/i), null, "nothing to take back");
  } finally { await h.unmount(); }
});

test("ticket 1050 — a LIVE instruction says Clara may act, quotes the firm's own sentence, and offers only the withdrawal", async () => {
  const h = await mount({ status: "ready", data: LIVE }, {
    record: async () => RECORDED, withdraw: async () => WITHDRAWN,
  });
  try {
    assert.match(h.text(), /Clara may establish prepayment schedules at close/i);
    // THE FIRM'S OWN WORDS, shown as recorded: the row is the record of record and the basis
    // every plan written under it cites.
    assert.ok(h.text().includes(LIVE.reason), `the recorded reason is not shown: ${h.text()}`);
    assert.ok(buttonMatching(h, /take this back/i), "a standing instruction that cannot be withdrawn is a switch");
    assert.equal(buttonMatching(h, /let clara do this/i), null, "it already stands");
  } finally { await h.unmount(); }
});

test("ticket 1050 — the card hands its writer the firm's own sentence, and nothing else", async () => {
  const given: string[] = [];
  const h = await mount({ status: "ready", data: null }, {
    record: async (reason) => { given.push(reason); return RECORDED; },
  });
  try {
    await h.act(() => { setFieldValue(reasonField(h) as Stub, "We close monthly and this is routine."); });
    await clickButton(buttonMatching(h, /let clara do this/i) as Stub);
    await h.settle();
    assert.deepEqual(given, ["We close monthly and this is routine."]);
    assert.match(h.text(), /Recorded\. Clara may now establish prepayment schedules at close/i);
    // AN ACCEPTED ACT CLEARS THE FIELD; a refusal does not (next cell).
    assert.equal(reasonField(h)?.value, "");
  } finally { await h.unmount(); }
});

test("ticket 1050 — the withdrawal goes to the OTHER writer, with its own sentence", async () => {
  const given: string[] = [];
  const h = await mount({ status: "ready", data: LIVE }, {
    record: async () => { throw new Error("the record door must not be called to withdraw"); },
    withdraw: async (reason) => { given.push(reason); return WITHDRAWN; },
  });
  try {
    await h.act(() => { setFieldValue(reasonField(h) as Stub, "We will set these up by hand this year."); });
    await clickButton(buttonMatching(h, /take this back/i) as Stub);
    await h.settle();
    assert.deepEqual(given, ["We will set these up by hand this year."]);
    assert.match(h.text(), /Taken back\. Clara will ask again/i);
  } finally { await h.unmount(); }
});

test("ticket 1050 — a governed refusal reaches the person VERBATIM, with its code and reason, and leaves their words where they typed them", async () => {
  const h = await mount({ status: "ready", data: null }, {
    record: async () => ({
      kind: "refused",
      code: "CLR10",
      reason: "firm_standing_instruction_invalid",
      axis: "reason_missing",
      message: "a standing instruction requires the one-line reason it is given under",
    }),
  });
  try {
    await h.act(() => { setFieldValue(reasonField(h) as Stub, "   "); });
    await clickButton(buttonMatching(h, /let clara do this/i) as Stub);
    await h.settle();
    const text = h.text();
    assert.ok(text.includes("a standing instruction requires the one-line reason it is given under"),
      `the database's own sentence was re-worded: ${text}`);
    assert.ok(text.includes("CLR10"), "the refusal is shown without its code");
    assert.ok(text.includes("firm_standing_instruction_invalid"), "the refusal is shown without its reason token");
    // THE PERSON'S WORDS STAY. The refusal tells them what to change; snapping the field back
    // would take away the thing they have to edit.
    assert.equal(reasonField(h)?.value, "   ");
  } finally { await h.unmount(); }
});

test("ticket 1050 — a denied, failed or still-loading read renders NO control at all", async () => {
  for (const view of [
    { status: "denied", message: "actor has no active membership" } as View,
    { status: "failed", message: "transport" } as View,
    { status: "loading" } as View,
  ]) {
    const h = await mount(view, { record: async () => RECORDED, withdraw: async () => WITHDRAWN });
    try {
      assert.equal(reasonField(h), null, `${view.status}: no field`);
      assert.equal(buttonMatching(h, /let clara do this/i), null, `${view.status}: no control`);
      assert.equal(buttonMatching(h, /take this back/i), null, `${view.status}: no control`);
      if (view.status === "denied" || view.status === "failed") {
        // THE DATABASE'S OWN SENTENCE, unedited — this page's one rule for a refused read.
        assert.ok(h.text().includes(view.message), `${view.status}: its own sentence is not shown`);
      }
    } finally { await h.unmount(); }
  }
});

test("ticket 1050 — the card states the two facts a firm must know before it decides: the instruction is firm-wide, and withdrawing it does not stop what is already running", async () => {
  const h = await mount({ status: "ready", data: LIVE }, { withdraw: async () => WITHDRAWN });
  try {
    assert.match(h.text(), /covers every client of this firm/i);
    assert.match(h.text(), /keeps posting to the end of its term/i);
  } finally { await h.unmount(); }
});

// #1147 — WHAT A WITHDRAWAL DOES NOT STOP, SAID ON SCREEN.
//
// The plans a standing instruction already authorised keep posting under the member who authorised
// them, and until #1147 the card said so only as a standing note: a firm that had just taken the
// instruction back learned nothing about what it had NOT stopped. Migration 0362 §B makes the
// withdraw door answer with `plans_still_posting`; these cells drive what the card does with it.
//
// WHAT WITHDRAWAL DOES TO A PLAN IS UNCHANGED, and that is the point: the card's job here is to
// stop a firm believing it stopped something.

const withdrawnWith = (plansStillPosting: number | null): StandingInstructionOutcome =>
  ({ kind: "withdrawn", instructionId: LIVE.id, plansStillPosting });

test("ticket 1147 — a withdrawal that leaves schedules running SAYS SO, with the number, and says they keep posting under the member who authorised them", async () => {
  const h = await mount({ status: "ready", data: LIVE }, { withdraw: async () => withdrawnWith(3) });
  try {
    await h.act(() => { setFieldValue(reasonField(h) as Stub, "We will set these up by hand."); });
    await clickButton(buttonMatching(h, /take this back/i) as Stub);
    await h.settle();
    const text = h.text();
    assert.match(text, /Taken back\. Clara will ask again/i, `the 1050 receipt line is gone: ${text}`);
    // THE NUMBER THE DATABASE ANSWERED WITH, not a word for "some".
    assert.match(text, /3 schedules/i, `the count of plans still posting is not shown: ${text}`);
    assert.match(text, /keep posting/i, `what those plans do is not said: ${text}`);
    assert.match(text, /authorised/i, `who they post under is not said: ${text}`);
  } finally { await h.unmount(); }
});

test("ticket 1147 — ONE is one, and a withdrawal that stopped nothing running says WHAT WAS TRUE AT THE MOMENT, not what will be true afterwards", async () => {
  for (const [count, pattern] of
    [[1, /One schedule/i], [0, /was running when you took it back/i]] as const) {
    const h = await mount({ status: "ready", data: LIVE }, { withdraw: async () => withdrawnWith(count) });
    try {
      await clickButton(buttonMatching(h, /take this back/i) as Stub);
      await h.settle();
      assert.match(h.text(), pattern, `plans_still_posting=${count} reads wrong: ${h.text()}`);
      // …and never the plural sentence for a singular fact.
      if (count === 1) assert.doesNotMatch(h.text(), /1 schedules/i, "a plural sentence for one schedule");
      // FIX ROUND (ADV-04). The count is the withdrawing transaction's SNAPSHOT. The wake arm of
      // clara._prepayment_schedule_core resolves the live instruction with a plain
      // `select … limit 1` and takes no share lock (read off the installed body on clara_c01), and
      // the withdraw door's own `for update` is on the instruction ROW, so an unattended close_prep
      // run already in flight can commit a plan a moment later. A `=0` sentence that asserted
      // "nothing keeps posting" would then be a firm-facing false statement in exactly the window
      // this key exists to close. The zero arm therefore states what was MEASURED, at the moment it
      // was measured, and promises nothing about afterwards.
      if (count === 0) {
        assert.doesNotMatch(h.text(), /nothing keeps posting/i,
          `the zero arm promises a future this transaction cannot see: ${h.text()}`);
      }
    } finally { await h.unmount(); }
  }
});

test("ticket 1147 — a count the door did not answer with is NOT painted as zero: the card says nothing about the number rather than telling a firm it stopped everything", async () => {
  // `plansStillPosting: null` is what a database below 0362 produces (`lib/firm/standing-
  // instructions.ts`). Silence is the honest rendering; the standing note below still says a
  // running schedule is not stopped.
  const h = await mount({ status: "ready", data: LIVE }, { withdraw: async () => withdrawnWith(null) });
  try {
    await clickButton(buttonMatching(h, /take this back/i) as Stub);
    await h.settle();
    const text = h.text();
    assert.match(text, /Taken back\. Clara will ask again/i);
    assert.doesNotMatch(text, /was running when you took it back/i,
      `an unknown count was painted as zero: ${text}`);
    assert.doesNotMatch(text, /schedules? opened under it/i, `an unknown count was painted: ${text}`);
  } finally { await h.unmount(); }
});

test("ticket 1147 — and the card says HOW TO STOP ONE, in its own key, whether or not a withdrawal has happened: a firm reads it before it decides", async () => {
  const h = await mount({ status: "ready", data: LIVE }, { withdraw: async () => withdrawnWith(2) });
  try {
    // The 1050 note (what withdrawal does not do) and the 1147 note (what to do instead) sit
    // together, and both are there BEFORE anybody presses anything.
    assert.match(h.text(), /keeps posting to the end of its term/i);
    // SPECIFIC ON PURPOSE. `standingWithdrawalNote` already contains the word "end" ("to the end
    // of its term"), so a loose /end/ would have passed before this key existed.
    assert.match(h.text(), /pause or end/i,
      `the card does not say how a running schedule is stopped: ${h.text()}`);
    assert.match(h.text(), /Client → Plans/,
      `the card does not say WHERE it is stopped: ${h.text()}`);
  } finally { await h.unmount(); }
});
