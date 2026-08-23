// AdjustmentTemplatePanel render cells — round 3 (createElement +
// renderToStaticMarkup, the ReconciliationPanel.test.tsx pattern, no jsdom).
//
// THE DEFECT: both advisory reads were swallowed with `.catch(() => null)`, so a
// failed `adjustment_run_due` rendered every template as un-blocked and
// never-due, and a failed `list_adjustment_runs` rendered every template as
// never-run. The house law is that an error reads as UNAVAILABLE, never as a
// confident empty.
//
// These cells assert the WORDS on the screen, not the state shape (that is
// adjustmentModel.test.ts's job) — because the defect was not a wrong value, it
// was a reassuring sentence. A row that says nothing says "fine".

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdvisoryBanners, ProposeWarningBanners, TemplateRow } from "./AdjustmentTemplatePanel";
import type { AdjustmentTemplateWarning } from "../shared/adjustmentApi";
import {
  advisoryOk, advisoryUnavailable, toAdjustmentRunDue, toListAdjustmentRunsRead,
  type AdjustmentRunDue, type ListAdjustmentRunsRead, type AdjustmentTemplateRow,
} from "./adjustmentModel";

const TEMPLATE: AdjustmentTemplateRow = {
  template_id: "5859ce7d-6c68-45bd-bc4a-4a0779124ecd", status: "live", name: "Audit fee accrual",
  cadence: "monthly", start_date: "2026-05-01", end_date: null, auto_reverse: true,
  lines: [
    { account_code: "900-D42", debit_cents: 40000, credit_cents: 0, description: null },
    { account_code: "400-D42", debit_cents: 0, credit_cents: 40000, description: null },
  ],
  memo_template: "Audit fee accrual", content_hash: "9f4ac0", proposed_by: "u1", signed_by: "u2",
  signed_at: "2026-08-03T00:04:56+08:00", retired_by: null, retired_at: null, retired_reason: null,
  created_at: "2026-08-03T00:04:56+08:00", occurrence_draft_entry_id: null,
  replaces_template_id: null,
};

const LIVE_DUE = advisoryOk(toAdjustmentRunDue({
  due: true, template_id: TEMPLATE.template_id, period_start: "2026-07-01", period_end: "2026-07-31", blocked: [],
}));
const GONE_DUE = advisoryUnavailable<AdjustmentRunDue>("resolve_and_book… PostgREST 404");
const LIVE_RUNS = advisoryOk(toListAdjustmentRunsRead({ runs: [] }));
const GONE_RUNS = advisoryUnavailable<ListAdjustmentRunsRead>("network");

function row(over: Partial<Parameters<typeof TemplateRow>[0]> = {}): string {
  return renderToStaticMarkup(createElement(TemplateRow, {
    token: "jwt", clientId: "c1", template: TEMPLATE, due: LIVE_DUE,
    runsAvailable: true, lastRun: null, predecessor: null, onChanged: () => {}, ...over,
  }));
}

test("[round-3 RED] a FAILED due advisory renders the template as UNKNOWN, never as un-blocked and not-due", () => {
  const html = row({ due: GONE_DUE });
  assert.match(html, /Blocked\?.*unknown/s, "the row must say it could not ask");
  assert.match(html, /NOT a clean bill of health/i, "…in words a bookkeeper cannot mistake for 'fine'");
  assert.match(html, /due\? unknown/i);
  // The old build rendered NEITHER of these and NO "due" badge — i.e. a silent
  // all-clear. It must also not have invented a positive claim.
  assert.ok(!/>due</.test(html), "an unavailable oracle must not claim the template IS due either");
});

test("[round-3] a LIVE due advisory still renders due/clear normally — the fix is not 'call everything unknown'", () => {
  const html = row();
  assert.match(html, />due</, "this template really is due, and must still say so");
  assert.ok(!/unknown/i.test(html), "nothing may be unknown when the oracle answered");
  assert.match(html, /Run 2026-07-01 → 2026-07-31/, "and the DB's OWN period drives the button label");
});

test("[round-3] a BLOCKED template still names the reason and points at the blocking draft", () => {
  const blocked = advisoryOk(toAdjustmentRunDue({
    due: false, blocked: [{ template_id: TEMPLATE.template_id, reason: "occurrence_draft_outstanding" }],
  }));
  const html = row({
    due: blocked,
    template: { ...TEMPLATE, occurrence_draft_entry_id: "846a4e3f-154f-4bde-9bd9-bcf976b442ae" },
  });
  assert.match(html, /Blocked: an occurrence draft is still outstanding/);
  assert.match(html, /846a4e3f/, "the remedy must be REACHABLE, not merely named");
  assert.ok(!/unknown/i.test(html));
});

test("[round-3 RED] a FAILED runs read renders 'last run unknown', never the silence that reads as 'never run'", () => {
  const html = row({ runsAvailable: false, lastRun: null });
  assert.match(html, /last run.*unknown/is);
  assert.ok(!/no run receipt for this template yet/i.test(html),
    "an unreadable list must not borrow the genuinely-never-run wording");
});

test("[round-3] a LIVE runs read distinguishes 'no receipt yet' from 'unknown', and renders a real receipt verbatim", () => {
  const none = row({ runsAvailable: true, lastRun: null });
  assert.match(none, /no run receipt for this template yet/i);
  assert.ok(!/unknown/i.test(none));

  const some = row({
    runsAvailable: true,
    lastRun: {
      id: "r1", client_id: "c1", template_id: TEMPLATE.template_id,
      period_start: "2026-07-01", period_end: "2026-07-31", mode: "draft",
      entry_id: "e1", reversal_entry_id: null, amount_cents: 40000, created_at: null,
      correctable: true, active_pair_id: null, active_pair_status: null,
      correction_verb: "clara.reverse_entry", correction_entry: "e1", correction_wall: null,
      correction_wall_advice: null,
    },
  });
  assert.match(some, /last run 2026-07-01 → 2026-07-31 · draft/);
  assert.match(some, /400\.00/, "the DB's own amount, rendered verbatim — the panel never sums one");
});

test("[round-3] the panel-level banners name WHICH advisory failed and why, and vanish when both are healthy", () => {
  const both = renderToStaticMarkup(createElement(AdvisoryBanners, { due: GONE_DUE, runs: GONE_RUNS }));
  assert.match(both, /adjustment_run_due.*is UNAVAILABLE/s);
  assert.match(both, /PostgREST 404/, "the underlying reason must survive to the screen");
  assert.match(both, /list_adjustment_runs.*are UNAVAILABLE/s);
  assert.match(both, /not .never run./is, "…and says explicitly that unknown is not 'never run'");

  const healthy = renderToStaticMarkup(createElement(AdvisoryBanners, { due: LIVE_DUE, runs: LIVE_RUNS }));
  assert.equal(healthy, "", "a healthy panel must carry no scare copy at all");
});

// [round-8 F3] `all_blocked` and `nothing_due` are BOTH well-formed `due:false`
// answers (`due.available` is true for each — round-8 F3's adjustmentModel.test.ts
// cells cover that), so the OLD `!due.available` banner alone could never tell
// them apart. The ABI as-built note: they are different facts, and the header
// must say so — never both silence.
test("[round-8 F3] all_blocked renders its OWN banner, distinct from the silent nothing_due case", () => {
  const allBlocked = advisoryOk(toAdjustmentRunDue({
    due: false, reason: "all_blocked",
    blocked: [{ template_id: TEMPLATE.template_id, reason: "occurrence_draft_outstanding" }],
  }));
  const html = renderToStaticMarkup(createElement(AdvisoryBanners, { due: allBlocked, runs: LIVE_RUNS }));
  assert.match(html, /Every live template is blocked/);
  assert.match(html, /different from .nothing due./i, "the banner must name the OTHER state it is not, so a reader cannot conflate them");

  const nothingDue = advisoryOk(toAdjustmentRunDue({ due: false, reason: "nothing_due", blocked: [] }));
  const quiet = renderToStaticMarkup(createElement(AdvisoryBanners, { due: nothingDue, runs: LIVE_RUNS }));
  assert.equal(quiet, "", "an ordinary caught-up cycle must stay silent — only all_blocked earns a banner");
});

// === ROUND-11 W2 FINDING 3 — THE PROPOSE ADVISORY REACHES A PIXEL ==================
// THE DEFECT: `ProposeTemplateForm` awaited the propose receipt and discarded it, setting
// only "Proposed — an admin must sign it before it runs." MEASURED emission in the
// propose-BEFORE-retire order (the natural one, and round 10's own money path): a
// colliding_live_sibling warning naming the periods the sibling already carries and
// spelling out that distinct codes would book them twice. The run gate stays fail-closed,
// so no wrong money posts — what was lost is the only advisory built to stop the DECISION,
// and it was lost between an admitted write and an admin's signature.
//
// The warning envelope below is the one r11-W2-report.json measured (probe p5-warnings.mjs),
// carried through the mapper's own shape.

const SIBLING_WARNING: AdjustmentTemplateWarning = {
  axis: "colliding_live_sibling", containment: "identical", standing_charges: 2,
  first_period: "2026-04-01", last_period: "2026-05-31",
  colliding_elements: ["400-D42:C", "900-D42:D"],
  message: "it already carries 2 standing charge(s) — IF this template replaces that one, retire it and correct those charges: giving this template distinct codes instead would book those periods twice.",
};
const REPLACED_OVERLAP_WARNING: AdjustmentTemplateWarning = {
  axis: "replaced_period_overlap", template_id: "t-old", name: "Audit fee accrual (2025)",
  status: "retired", standing_charges: 4, first_period: "2026-01-01", last_period: "2026-04-30",
  message: "the generation this replaces still carries 4 approved charge(s) in periods this template would book.",
};
const IMPLAUSIBLE_WARNING: AdjustmentTemplateWarning = {
  axis: "implausible_start_date", start_date: "2019-01-01", plausible_from: "2025-01-01",
  message: "that start date is years before this client's first period.",
};

test("[round-11 W2 F3] the propose advisory REACHES A PIXEL — all three axes, each carrying the DB's own sentence", () => {
  const html = renderToStaticMarkup(createElement(ProposeWarningBanners, {
    warnings: [SIBLING_WARNING, REPLACED_OVERLAP_WARNING, IMPLAUSIBLE_WARNING],
  }));
  // The DB's message is the payload and must survive verbatim on every axis.
  assert.match(html, /would book those periods twice/);
  assert.match(html, /still carries 4 approved charge\(s\)/);
  assert.match(html, /years before this client&#x27;s first period|years before this client's first period/);
  // …and each axis is TOLD APART, so a reader knows which kind of trouble they are in.
  assert.match(html, /A live template of this client already covers this shape/);
  assert.match(html, /The template this replaces still carries charges in periods this one would book/);
  assert.match(html, /That start date looks implausible/);
  // The measured facts ride along, so the advisory is followable without a second read.
  assert.match(html, /2026-04-01 → 2026-05-31/);
  assert.match(html, /400-D42:C 900-D42:D/);
  assert.match(html, /Audit fee accrual \(2025\)/);
  // It must not read as a FAILURE: the proposal was admitted and the signature is the gate.
  assert.match(html, /ADMITTED/);
});

test("[round-11 W2 F3] an axis this build does not know still renders, and an empty advisory stays silent", () => {
  const unknown = renderToStaticMarkup(createElement(ProposeWarningBanners, {
    warnings: [{ axis: "some_future_axis", message: "the DB said something new" }],
  }));
  assert.match(unknown, /some_future_axis/, "an unnamed axis renders by its own token rather than vanishing");
  assert.match(unknown, /the DB said something new/);
  assert.equal(renderToStaticMarkup(createElement(ProposeWarningBanners, { warnings: [] })), "",
    "a clean proposal carries no scare copy at all");
});

// [round-12, Codex CXR1] THE SAME ADVISORY IS RAISED AGAIN AT SIGN, and sign is the LAST HUMAN
// MOMENT before money can move — a propose-time snapshot can be honestly empty and the same pair
// be a doubling by the time an admin signs. The wrapper used to return void, which is exactly how
// a DB advisory reaches zero pixels. The banner needs its own sentence there: at propose the
// reader still has a signature to withhold; at sign the template is already live.
test("[round-12 CXR1] the SIGN moment gets its own advisory sentence, and the DB's message still rides verbatim", () => {
  const live = renderToStaticMarkup(createElement(ProposeWarningBanners, {
    warnings: [{ ...REPLACED_OVERLAP_WARNING, status: "live" }], moment: "sign" as const,
  }));
  assert.match(live, /It is now LIVE/, "the reader is told the state they are actually in");
  assert.match(live, /Nothing has posted yet/, "…and that the act is still ahead of the money");
  assert.doesNotMatch(live, /must weigh it before signing/,
    "the propose sentence would be false here — the signature has already happened");
  assert.match(live, /still carries 4 approved charge/, "the DB's own message, verbatim");
  // …and the default is unchanged, so every existing call site keeps the propose sentence.
  const proposed = renderToStaticMarkup(createElement(ProposeWarningBanners, {
    warnings: [REPLACED_OVERLAP_WARNING],
  }));
  assert.match(proposed, /ADMITTED/);
  assert.doesNotMatch(proposed, /It is now LIVE/);
  assert.equal(renderToStaticMarkup(createElement(ProposeWarningBanners, { warnings: [], moment: "sign" as const })), "",
    "a clean signing is silent too — an advisory key that is always present must render nothing when it says nothing");
});

// === ROUND-11 XP2 — THE LINEAGE RENDERS ===========================================
// MEASURED (W1 finding 3 / Codex r11 finding 2): `_adj_template_json` projected no
// `replaces_template_id` and no surface displayed a declaration, so even a lineage recorded
// by a hand-crafted PostgREST call was invisible in the product — and a blocked row's reason
// could not be explained by the row that caused it.

test("[round-11 XP2] a declared predecessor renders by NAME on the row", () => {
  const predecessor: AdjustmentTemplateRow = {
    ...TEMPLATE, template_id: "t-old", name: "Audit fee accrual (2025)", status: "retired",
  };
  const html = row({
    template: { ...TEMPLATE, replaces_template_id: "t-old" },
    predecessor,
  });
  assert.match(html, /replaces «Audit fee accrual \(2025\)» \(retired\)/);
});

test("[round-11 XP2] a declaration whose predecessor is NOT in this list still renders — an unresolvable lineage is the state a reader most needs told about", () => {
  const html = row({
    template: { ...TEMPLATE, replaces_template_id: "6770ea84-0000-0000-0000-000000000000" },
    predecessor: null,
  });
  assert.match(html, /replaces 6770ea84/, "the id itself must reach a pixel when the name cannot");
  // …and a template that declares NOTHING says nothing, rather than printing an empty lineage.
  assert.ok(!/replaces/.test(row()), "'replaces nothing' is silence on the row, not an empty chip");
});
