// ComplianceWatchCard tests (the regionOverlay.test.tsx pattern: createElement +
// renderToStaticMarkup, no jsdom). The card hydrates from props (no network read), so
// a static render exercises the full surface: tier chip per state, the three basis-
// labelled DB figures, the always-on statutory qualification, the disabled-on-empty
// ack gate, and the inert terminal render. The internal-state refusal + the snooze
// date-cap + the matching/parse helpers are covered as PURE helpers (renderToStatic
// can't drive useState — the card renders those helpers faithfully).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ComplianceWatchCard } from "./ComplianceWatchCard";
import {
  tierBand, isTerminalState, showStatutoryCountdown, ackEnabled, complianceFigures,
  parseServiceGroup, matchComplianceClient, snoozeMaxDate, isSnoozeWithinCap,
  refusalLabel, refusalHint,
} from "./complianceWatch";
import type { QueueRow, ComplianceClient } from "../reviewTypes";

function mkWatch(p: Partial<QueueRow>): QueueRow {
  return {
    row_kind: "compliance_watch", section: "needs_you", sort: [], client_id: "cl1", counterparty_id: null,
    filing_id: null, entry_id: null, question_id: null, task_id: null, document_id: null,
    lane: null, auto: false, rule_backed: false, high_stakes: false, aged_since: null,
    amount_cents: null, period: "2026-07-31", question_text: "SST registration threshold watch (G)",
    created_at: null, id: "cw1", coding_kind: null, watch_id: "cw1", tier: "crossed", ...p,
  };
}
function mkClient(p: Partial<ComplianceClient>): ComplianceClient {
  return {
    client_id: "cl1", service_group: "G", state: "crossed", confirmed_included_cents: 50000000,
    unknown_or_mixed_cents: 1200000, screening_proxy_cents: 51200000, earliest_crossing_month: "2026-06",
    application_due: "2026-09-30", future_method_status: "not_assessed", ...p,
  };
}
function render(props: Partial<Parameters<typeof ComplianceWatchCard>[0]> = {}): string {
  return renderToStaticMarkup(createElement(ComplianceWatchCard, {
    token: "jwt", row: mkWatch({}), client: mkClient({}), watchId: "cw1", onChanged: () => {}, ...props,
  }));
}

const QUALIFICATION = "DB-computed screening estimate — not a legal determination. Professional review required.";

// --- render: tier chip per state ------------------------------------------------

test("the tier chip renders label + tone band per state", () => {
  const crossed = render({ row: mkWatch({ tier: "crossed" }), client: mkClient({ state: "crossed" }) });
  assert.ok(crossed.includes("bandYou") && crossed.includes(">crossed<"), "crossed → alarm band");
  const warn = render({ row: mkWatch({ tier: "early_warning" }), client: mkClient({ state: "early_warning" }) });
  assert.ok(warn.includes("bandReview") && warn.includes(">early warning<"), "early_warning → warn band");
  const neutral = render({ row: mkWatch({ tier: "monitored" }), client: mkClient({ state: "monitored" }) });
  assert.ok(neutral.includes(">monitored<") && !neutral.includes("bandYou"), "monitored → neutral chip");
});

// --- render: the three basis-labelled DB figures --------------------------------

test("the three figures render with their basis labels + fmtCents", () => {
  const html = render();
  assert.ok(html.includes("confirmed included turnover"));
  assert.ok(html.includes("unknown/mixed-classification turnover"));
  assert.ok(html.includes("all-income screening proxy"));
  assert.ok(html.includes("RM 500,000.00"), "confirmed_included_cents rendered by fmtCents");
  assert.ok(html.includes("RM 12,000.00"), "unknown_or_mixed_cents rendered");
  assert.ok(html.includes("RM 512,000.00"), "screening_proxy_cents rendered");
});

test("a null figure degrades to the safe unavailable marker, never a crash", () => {
  const html = render({ client: mkClient({ confirmed_included_cents: null }) });
  assert.ok(html.includes("confirmed included turnover"));
  assert.ok(html.includes("—"), "absent cents → the — marker");
});

// --- render: the always-on qualification ----------------------------------------

test("the statutory qualification renders ALWAYS, independent of state", () => {
  assert.ok(render({ row: mkWatch({ tier: "crossed" }), client: mkClient({ state: "crossed" }) }).includes(QUALIFICATION));
  assert.ok(render({ row: mkWatch({ tier: "monitored" }), client: mkClient({ state: "monitored" }) }).includes(QUALIFICATION));
});

// --- render: statutory countdown gate -------------------------------------------

test("the statutory countdown (s.13) shows only once crossed/overdue, citing the DB date", () => {
  const crossed = render({ row: mkWatch({ tier: "crossed" }), client: mkClient({ state: "crossed", application_due: "2026-09-30" }) });
  assert.ok(crossed.includes("s.13(1) Service Tax Act 2018"));
  assert.ok(crossed.includes("2026-09-30"), "the DB-computed application_due is rendered verbatim");
  assert.ok(crossed.includes("s.13(3)"));
  const monitored = render({ row: mkWatch({ tier: "monitored" }), client: mkClient({ state: "monitored" }) });
  assert.ok(!monitored.includes("s.13(1)"), "no countdown before crossing");
});

// --- render: the ack gate + terminal inert --------------------------------------

test("the acknowledge button is disabled while the rationale is empty", () => {
  const html = render();
  assert.match(html, /<button[^>]*disabled[^>]*>Acknowledge<\/button>/);
});

test("a resolved watch renders inert — no action buttons", () => {
  const html = render({ row: mkWatch({ tier: "resolved" }), client: mkClient({ state: "resolved" }) });
  assert.ok(html.includes("This watch is resolved."));
  assert.ok(!html.includes("Acknowledge"), "no ack control on a terminal watch");
  assert.ok(!html.includes(">Snooze<") && !html.includes(">Resolve<"), "no snooze/resolve controls");
});

test("with no token the card asks for a JWT and renders no figures", () => {
  const html = render({ token: null });
  assert.ok(html.includes("Paste a session JWT"));
  assert.ok(!html.includes("confirmed included turnover"));
});

// --- pure: refusal (verbatim) ---------------------------------------------------

test("refusalLabel renders the CLR code + reason verbatim; refusalHint maps the floors", () => {
  assert.equal(refusalLabel({ code: "CLR03", reason: "agent_identity" }), "CLR03 · agent_identity");
  assert.equal(refusalLabel({ code: "CLR11", reason: null }), "CLR11");
  assert.equal(refusalHint("CLR03"), "Human bookkeeper+ only.");
  assert.equal(refusalHint("CLR04"), "Admin required.");
  assert.equal(refusalHint("CLR10"), "");
});

// --- pure: snooze date cap ------------------------------------------------------

test("the snooze date cap is a bounded 60-day window strictly after today", () => {
  const now = new Date(2026, 6, 23); // 2026-07-23 local
  const max = snoozeMaxDate(now);
  assert.equal(isSnoozeWithinCap("2026-07-24", now), true); // tomorrow
  assert.equal(isSnoozeWithinCap("2026-07-23", now), false); // today is not strictly after
  assert.equal(isSnoozeWithinCap(max, now), true); // exactly the cap is allowed
  assert.equal(isSnoozeWithinCap("2026-12-31", now), false); // well past 60 days
  assert.equal(isSnoozeWithinCap("", now), false);
  assert.equal(isSnoozeWithinCap(null, now), false);
  assert.equal(isSnoozeWithinCap("garbage", now), false);
});

// --- pure: tier band + terminal/countdown gates + ack --------------------------

test("tierBand maps every state to a label + tone", () => {
  assert.deepEqual(tierBand("crossed"), { label: "crossed", tone: "alarm" });
  assert.deepEqual(tierBand("overdue"), { label: "overdue", tone: "alarm" });
  assert.deepEqual(tierBand("early_warning"), { label: "early warning", tone: "warn" });
  assert.deepEqual(tierBand("monitored"), { label: "monitored", tone: "neutral" });
  assert.deepEqual(tierBand("resolved"), { label: "resolved", tone: "neutral" });
  assert.deepEqual(tierBand(null), { label: "watch", tone: "neutral" });
});

test("isTerminalState / showStatutoryCountdown / ackEnabled gate correctly", () => {
  assert.equal(isTerminalState("resolved"), true);
  assert.equal(isTerminalState("crossed"), false);
  assert.equal(showStatutoryCountdown("crossed"), true);
  assert.equal(showStatutoryCountdown("overdue"), true);
  assert.equal(showStatutoryCountdown("early_warning"), false);
  assert.equal(ackEnabled("  "), false);
  assert.equal(ackEnabled(" ok "), true);
});

// --- pure: parse + match --------------------------------------------------------

test("parseServiceGroup extracts the trailing paren group, else null", () => {
  assert.equal(parseServiceGroup("SST registration threshold watch (G)"), "G");
  assert.equal(parseServiceGroup("SST registration threshold watch (Group B)"), "Group B");
  assert.equal(parseServiceGroup("no parens here"), null);
  assert.equal(parseServiceGroup(null), null);
});

test("matchComplianceClient prefers the service group, then the tier, else the first", () => {
  const clients = [mkClient({ service_group: "G", state: "monitored" }), mkClient({ service_group: "H", state: "crossed" })];
  assert.equal(matchComplianceClient(clients, { clientId: "cl1", serviceGroup: "H", tier: null })?.service_group, "H");
  assert.equal(matchComplianceClient(clients, { clientId: "cl1", serviceGroup: null, tier: "crossed" })?.service_group, "H");
  assert.equal(matchComplianceClient(clients, { clientId: "cl1", serviceGroup: null, tier: null })?.service_group, "G");
  assert.equal(matchComplianceClient(clients, { clientId: "other", serviceGroup: "G", tier: null }), null);
});

test("complianceFigures returns three labelled figures; a null client degrades each to null", () => {
  const some = complianceFigures(mkClient({}));
  assert.deepEqual(some.map((f) => f.label), ["confirmed included turnover", "unknown/mixed-classification turnover", "all-income screening proxy"]);
  assert.equal(some[0]?.cents, 50000000);
  const none = complianceFigures(null);
  assert.ok(none.every((f) => f.cents === null), "no client → every figure null");
});
