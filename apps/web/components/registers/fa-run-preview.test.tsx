// #651 — the depreciation run PREVIEW, driven through its real render states.
//
// WHAT EACH CELL PINS:
//   preview.figures      the exact period the DATABASE chose, the per-asset amounts, the two GL
//                        legs, and whether the run will post or wait. The two date inputs this
//                        dialog used to carry are GONE, because the only lawful value a person
//                        could type was the one the database already knew.
//   preview.skips        all FIVE measured reasons in words, plus an UNKNOWN one rendering as its
//                        verbatim code rather than vanishing.
//   preview.collapse     the skipped list renders OPEN when any reason is work somebody still owes
//                        (appendix D row 17) and may collapse only when every reason is benign.
//   preview.states       loading is shape-matched and stops on the answer; a denied/failed read is
//                        NOT empty data (appendix D row 27) and renders verbatim with its code; a
//                        not-due answer names the database's own reason and still shows the floor.
//   preview.closed       a period the oracle skipped for a closed financial year is STATED. A skip
//                        nobody can see is the same defect as a silent post.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { FaRunPreviewBody } from "./fa-run-preview";
import { intlApp, faPreview, findAll, tid, attr } from "./fa-depreciation-test-fixtures";

enableDomInspection();

const render = (props: {
  preview?: unknown; loading?: boolean; error?: string | null; onRecordArrears?: unknown;
}) =>
  renderComponent(intlApp(createElement(FaRunPreviewBody, {
    preview: (props.preview ?? null) as never,
    loading: props.loading ?? false,
    error: props.error ?? null,
    onRecordArrears: props.onRecordArrears as never,
  })));

test("preview.figures the period is the DATABASE'S, the amounts and both legs render exactly, and the dialog says what it will do", async () => {
  const h = await render({ preview: faPreview() });
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const text = h.text();
    const period = h.find((n) => tid(n) === "fa-preview-period");
    assert.ok(period, "the period renders as its own labelled element");
    assert.match(textOf(period!), /2026-07-01/);
    assert.match(textOf(period!), /2026-07-31/);
    assert.match(text, /The period is the register's, not yours/,
      "…and the surface SAYS whose period it is, which is why the two date inputs are gone");
    assert.match(text, /Air compressor/, "the per-asset charge");
    assert.match(text, /75\.00/, "…in exact minor units");
    assert.match(text, /6510/, "the expense leg's account");
    assert.match(text, /1519/, "…and the accumulated one");
    assert.match(textOf(h.find((n) => tid(n) === "fa-preview-mode")!), /Will wait for approval/,
      "an unearned ramp WAITS, and the preview says so before anything is written");
    assert.match(textOf(h.find((n) => tid(n) === "fa-preview-total")!), /75\.00/);
    assert.match(textOf(h.find((n) => tid(n) === "fa-preview-floor")!), /2026-03-01/,
      "the authority window's floor is on the surface, not only in a refusal");
  } finally {
    await h.unmount();
  }
});

test("preview.skips all FIVE measured reasons render in words, and an UNKNOWN reason renders as its verbatim code rather than vanishing", async () => {
  const skipped = [
    { asset_id: "a-inc", reason: "incomplete" },
    { asset_id: "a-nis", reason: "not_in_service" },
    { asset_id: "a-fd", reason: "fully_depreciated" },
    { asset_id: "a-nm", reason: "none_method" },
    { asset_id: "a-dd", reason: "disposal_draft_outstanding" },
    { asset_id: "a-six", reason: "some_sixth_reason" },
  ];
  const h = await render({ preview: faPreview({ skipped }) });
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const text = h.text();
    assert.match(text, /waiting on depreciation particulars/);
    assert.match(text, /not yet in service/);
    assert.match(text, /fully depreciated/);
    assert.match(text, /stated as not depreciated/);
    assert.match(text, /a disposal draft is waiting on this asset/,
      "the FIFTH reason — the one clara._fa_asset_charges can never return, written by clara._fa_compute_charges itself");
    // THE DEGRADE. A vocabulary measured once can grow; dropping the row would tell a professional
    // an asset was charged when it was not, and guessing a sentence would be worse.
    assert.match(text, /some_sixth_reason/,
      "an unmapped reason renders as its VERBATIM code beside a neutral sentence");
    const rows = findAll(h.container as never, (n) => tid(n).startsWith("fa-preview-skip-"));
    assert.equal(rows.length, 6, "every skipped asset gets a row, known reason or not");
  } finally {
    await h.unmount();
  }
});

test("preview.collapse the skipped list renders OPEN when any reason is work somebody still owes, and may collapse only when every reason is benign", async () => {
  const benign = await render({
    preview: faPreview({ skipped: [{ asset_id: "a1", reason: "fully_depreciated" }, { asset_id: "a2", reason: "none_method" }] }),
  });
  try {
    for (let i = 0; i < 3; i++) await benign.settle();
    const node = benign.find((n) => tid(n) === "fa-preview-skipped");
    assert.ok(node, "the disclosure renders");
    assert.equal(attr(node as never, "data-starts-open"), "false",
      "a list of settled facts may collapse");
  } finally {
    await benign.unmount();
  }

  const owed = await render({
    preview: faPreview({ skipped: [{ asset_id: "a1", reason: "fully_depreciated" }, { asset_id: "a2", reason: "incomplete" }] }),
  });
  try {
    for (let i = 0; i < 3; i++) await owed.settle();
    assert.equal(attr(owed.find((n) => tid(n) === "fa-preview-skipped") as never, "data-starts-open"), "true",
      "appendix D row 17: one asset waiting on its particulars opens the whole list — never hide an unresolved question by default");
  } finally {
    await owed.unmount();
  }
});

test("preview.states loading is shape-matched, a refusal is NOT empty data, and a not-due answer names the database's own reason", async () => {
  const loading = await render({ preview: null, loading: true });
  try {
    await loading.settle();
    assert.ok(loading.find((n) => tid(n) === "fa-preview-loading"), "a shape-matched skeleton, not a spinner");
    assert.doesNotMatch(loading.text(), /0\.00/, "and NO placeholder amount painted as a zero");
  } finally {
    await loading.unmount();
  }

  const denied = await render({ preview: null, error: "CLR11 · client is not in your firm" });
  try {
    await denied.settle();
    assert.ok(denied.find((n) => tid(n) === "fa-preview-error"), "a refusal renders as a refusal");
    assert.match(denied.text(), /CLR11/, "…with its CODE, verbatim");
    assert.match(denied.text(), /client is not in your firm/, "…and the door's own words, un-re-worded");
    assert.doesNotMatch(denied.text(), /Nothing is due/,
      "appendix D row 27: permission denial and fetch failure are NOT empty data");
  } finally {
    await denied.unmount();
  }

  const notDue = await render({
    preview: faPreview({ due: false, reason: "period_not_ended", charges: [], legs: [], charged_cents: 0, entries: 0 }),
  });
  try {
    for (let i = 0; i < 3; i++) await notDue.settle();
    assert.ok(notDue.find((n) => tid(n) === "fa-preview-not-due"));
    assert.match(notDue.text(), /the next period has not ended/,
      "the DATABASE's own reason, in words");
    assert.match(textOf(notDue.find((n) => tid(n) === "fa-preview-floor")!), /2026-03-01/,
      "…and the floor is still shown, because 'nothing is due' on a client with old uncharged assets needs a WHY");
  } finally {
    await notDue.unmount();
  }

  const unknownReason = await render({
    preview: faPreview({ due: false, reason: "some_new_reason", charges: [], legs: [], charged_cents: 0, entries: 0 }),
  });
  try {
    for (let i = 0; i < 3; i++) await unknownReason.settle();
    assert.match(unknownReason.text(), /some_new_reason/,
      "…and a reason this surface does not know is printed rather than swallowed");
  } finally {
    await unknownReason.unmount();
  }
});

test("preview.closed a period the oracle skipped for a CLOSED financial year is stated, with the year and what happens to its arrears", async () => {
  const h = await render({
    preview: faPreview({
      skipped_closed: [
        { period_start: "2026-05-01", period_end: "2026-05-31", fiscal_year_id: "fy1", fy_label: "2026", fy_status: "closed" },
        { period_start: "2026-06-01", period_end: "2026-06-30", fiscal_year_id: "fy1", fy_label: "2026", fy_status: "closed" },
      ],
    }),
  });
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const node = h.find((n) => tid(n) === "fa-preview-skipped-closed");
    assert.ok(node, "a skip nobody can see is the same defect as a silent post");
    const text = textOf(node!);
    assert.match(text, /2 period\(s\) were skipped because their financial year is closed/);
    assert.match(text, /2026-05-01/);
    assert.match(text, /2026-06-30/);
    assert.match(text, /\(2026\)/, "…and the year is NAMED");
    assert.match(text, /never run in its own right/i,
      "…and the reader is told the money is not gone: `skipped_closed` means 'never run in its own right'");
    // #975 — THE SENTENCE MUST NOT PROMISE THE FOLD. Before 0279 this note said the arrears "are
    // charged by the next open period", full stop. They are not: the next run STOPS and asks
    // whether the omission is immaterial (IAS 8), and a machine run parks until somebody answers.
    // A surface that still promised the fold would be telling a professional that a charge is
    // automatic when it is a question addressed to them.
    assert.doesNotMatch(text, /arrears are charged by the next open period/i,
      "the note no longer promises a fold the run will not make on its own");
    assert.match(text, /IAS 8/, "…it names the standard the two resolutions come from");
    assert.match(text, /immaterial/i, "…and the judgement being asked for");
  } finally {
    await h.unmount();
  }
});

test("preview.closed_arrears the amount the next run would fold forward is STATED with its year, and the standing answer once one exists", async () => {
  const skipped = [
    { period_start: "2026-05-01", period_end: "2026-05-31", fiscal_year_id: "fy1", fy_label: "2026", fy_status: "closed" },
  ];
  const h = await render({
    preview: faPreview({
      skipped_closed: skipped,
      closed_arrears: {
        arrears_cents: 123_456,
        fiscal_years: [{
          fiscal_year_id: "fy1", fy_label: "2026", fy_status: "closed",
          fy_starts_on: "2026-01-01", fy_ends_on: "2026-06-30",
          arrears_cents: 123_456, resolution: null,
        }],
      },
    }),
  });
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const text = textOf(h.find((n) => tid(n) === "fa-preview-skipped-closed")!);
    assert.match(text, /RM 1,234\.56/, "the AMOUNT the next run would fold forward is stated");
    assert.match(text, /2026/, "…beside the year it belongs to");
    assert.match(text, /not been answered|waiting/i,
      "…and that nobody has judged its materiality yet");
  } finally {
    await h.unmount();
  }

  const answered = await render({
    preview: faPreview({
      skipped_closed: skipped,
      closed_arrears: {
        arrears_cents: 123_456,
        fiscal_years: [{
          fiscal_year_id: "fy1", fy_label: "2026", fy_status: "closed",
          fy_starts_on: "2026-01-01", fy_ends_on: "2026-06-30",
          arrears_cents: 123_456,
          resolution: { id: "r1", choice: "fold_current", arrears_cents: 123_456, decided_by: "u1", decided_at: "2026-07-01T00:00:00Z", reason: null },
        }],
      },
    }),
  });
  try {
    for (let i = 0; i < 3; i++) await answered.settle();
    const text = textOf(answered.find((n) => tid(n) === "fa-preview-skipped-closed")!);
    assert.match(text, /folded into the current period/i,
      "once answered, the STANDING RULING is what the surface states — not the question again");
    assert.doesNotMatch(text, /not been answered/i);
  } finally {
    await answered.unmount();
  }
});

// #975 — THE QUESTION MUST BE ANSWERABLE FROM THE SCREEN. The run now REFUSES until a person has
// judged the closed year's arrears, so a surface that only stated the question would have made
// depreciation unrunnable for that client: a wall, not a prompt. The two resolutions are two
// controls, neither preselected, and the handler is given exactly what the door needs.
test("preview.closed_arrears_answer the two resolutions are offered as controls, neither preselected, and each hands the door its own choice with the year and the amount", async () => {
  const calls: Array<{ fiscalYearId: string; choice: string; arrearsCents: number; reason: string }> = [];
  const h = await render({
    preview: faPreview({
      skipped_closed: [],
      closed_arrears: {
        arrears_cents: 25_000,
        fiscal_years: [{
          fiscal_year_id: "fy9", fy_label: "2025", fy_status: "closed",
          fy_starts_on: "2025-01-01", fy_ends_on: "2025-12-31",
          arrears_cents: 25_000, resolution: null,
        }],
      },
    }),
    onRecordArrears: async (a: { fiscalYearId: string; choice: string; arrearsCents: number; reason: string }) => {
      calls.push(a);
    },
  });
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const fold = h.find((n) => tid(n) === "fa-arrears-fold-fy9");
    const restate = h.find((n) => tid(n) === "fa-arrears-restate-fy9");
    assert.ok(fold && restate, "both resolutions are reachable, and neither is chosen for the person");

    await h.act(() => { clickButton(fold as never); });
    for (let i = 0; i < 3; i++) await h.settle();
    assert.equal(calls.length, 1);
    assert.deepEqual(
      { fiscalYearId: calls[0]!.fiscalYearId, choice: calls[0]!.choice, arrearsCents: calls[0]!.arrearsCents },
      { fiscalYearId: "fy9", choice: "fold_current", arrearsCents: 25_000 },
      "the door is handed the YEAR it is about and the AMOUNT that was judged, never a recomputed one",
    );

    await h.act(() => { clickButton(restate as never); });
    for (let i = 0; i < 3; i++) await h.settle();
    assert.equal(calls[1]!.choice, "reopen_prior", "…and the other control is the other resolution");
  } finally {
    await h.unmount();
  }
});

// #975 FIX ROUND (adversarial review ADV-L04-2) — A JUDGEMENT LICENSES THE FIGURE IT WAS MADE
// ABOUT. `clara._fa_run_period_core` now refuses (or parks) on `arrears_changed_since_judgement`
// when the year's arrears no longer match the amount the standing ruling was made about, so a
// surface that kept saying "you judged it immaterial" and withheld the controls would leave the
// person reading a settled sentence beside a run nobody could unblock.
test("preview.closed_arrears_moved a standing ruling made about ANOTHER amount states both figures and offers the two controls again", async () => {
  const calls: Array<{ fiscalYearId: string; choice: string; arrearsCents: number }> = [];
  const h = await render({
    preview: faPreview({
      skipped_closed: [],
      closed_arrears: {
        arrears_cents: 40_000,
        fiscal_years: [{
          fiscal_year_id: "fy9", fy_label: "2025", fy_status: "closed",
          fy_starts_on: "2025-01-01", fy_ends_on: "2025-12-31", arrears_cents: 40_000,
          resolution: { id: "r9", choice: "fold_current", arrears_cents: 25_000, decided_by: "u1", decided_at: "2026-01-01T00:00:00Z", reason: null },
        }],
      },
    }),
    onRecordArrears: async (a: { fiscalYearId: string; choice: string; arrearsCents: number }) => {
      calls.push(a);
    },
  });
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const text = textOf(h.find((n) => tid(n) === "fa-preview-skipped-closed")!);
    assert.match(text, /RM 250\.00/, "the amount that WAS judged is stated…");
    assert.match(text, /RM 400\.00/, "…beside the amount that now stands");
    assert.doesNotMatch(text, /folded into the current period/i,
      "the stale ruling is NOT presented as the settled answer");

    const fold = h.find((n) => tid(n) === "fa-arrears-fold-fy9");
    assert.ok(fold, "the two controls are offered again, so the person can judge the amount that will move");
    assert.ok(h.find((n) => tid(n) === "fa-arrears-restate-fy9"));
    await h.act(() => { clickButton(fold as never); });
    for (let i = 0; i < 3; i++) await h.settle();
    assert.deepEqual(
      { fiscalYearId: calls[0]!.fiscalYearId, choice: calls[0]!.choice, arrearsCents: calls[0]!.arrearsCents },
      { fiscalYearId: "fy9", choice: "fold_current", arrearsCents: 40_000 },
      "…and the door is handed the CURRENT amount, which is the one it re-measures",
    );
  } finally {
    await h.unmount();
  }
});

test("preview.closed_arrears_answered an ANSWERED year offers no controls — the standing ruling replaces the question", async () => {
  const h = await render({
    preview: faPreview({
      skipped_closed: [],
      closed_arrears: {
        arrears_cents: 25_000,
        fiscal_years: [{
          fiscal_year_id: "fy9", fy_label: "2025", fy_status: "closed",
          fy_starts_on: "2025-01-01", fy_ends_on: "2025-12-31", arrears_cents: 25_000,
          resolution: { id: "r9", choice: "fold_current", arrears_cents: 25_000, decided_by: "u1", decided_at: "2026-01-01T00:00:00Z", reason: null },
        }],
      },
    }),
    onRecordArrears: async () => {},
  });
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    assert.equal(h.find((n) => tid(n) === "fa-arrears-fold-fy9"), null,
      "a judgement already made is not asked for again");
    assert.equal(h.find((n) => tid(n) === "fa-arrears-restate-fy9"), null);
  } finally {
    await h.unmount();
  }
});
