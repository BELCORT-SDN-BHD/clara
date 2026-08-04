// The `staff_advance` card — round-3 render cells (createElement +
// renderToStaticMarkup, no jsdom; the OpeningDryRunCard.test.tsx precedent).
//
// THE DEFECT: the card rendered a COMPLETELY BLANK body (title + id chip, no
// error, no "not found") when `getStaffAdvance` returned null — and null was
// reachable for an advance that GENUINELY EXISTS, because the card read a
// date-windowed register summary at the BROWSER's UTC "today" while the register
// is anchored to the DB's Asia/Kuala_Lumpur date. Two fixes, two kinds of cell:
// the date anchoring lives in advancesApi.test.ts (which asserts p_as_of is sent
// as SQL null); the honest empties live here.
//
// A blank card is the most dangerous empty state in this product: it looks like
// a card that has nothing to report, which is exactly what a missing debt looks
// like.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffAdvanceCard, StaffAdvanceCardView } from "./StaffAdvanceCard";
import type { GetStaffAdvanceRead } from "../advancesApi";
import type { StaffAdvanceSummaryRow } from "../../advances/advancesModel";
import type { StaffAdvancePart } from "../parts";

const PART = {
  kind: "staff_advance",
  client_id: "567aa2d4-776c-4e76-9c82-e019e632c2fd", // gitleaks:allow -- the sandbox client UUID from the captured envelope, a tenant identifier and not a credential
  advance_id: "3a6d8f07-beb2-4d90-ba5c-21fb17f08297",
} as unknown as StaffAdvancePart;

/** Renders the card's FIRST paint (no effects run under renderToStaticMarkup),
 *  optionally with fetch stubbed — the states below are driven through the real
 *  loader by pre-seeding fetch, so nothing here mocks the component itself. */
function render(token: string | null): string {
  return renderToStaticMarkup(createElement(StaffAdvanceCard, { token, part: PART }));
}

test("[round-3] with no token the card says what to do — it never renders a bare shell", () => {
  const html = render(null);
  assert.match(html, /Paste a session JWT/);
  assert.match(html, /Staff advance/);
});

test("[round-3 RED] the card's first paint is NEVER a title-and-chip blank", () => {
  // Before this round, the whole body was `{data ? (...) : null}` plus an error
  // slot — so a null read painted the head and stopped. The card must always
  // carry at least one sentence of state.
  const html = render("jwt");
  const body = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const withoutHead = body.replace(/Staff advance/, "").replace(/[0-9a-f]{4,8}…?/gi, "").trim();
  assert.ok(withoutHead.length > 10,
    `the card painted only its head: "${body}" — a blank card reads as "nothing to report"`);
  assert.match(html, /has not been loaded|Loading advance/i);
});

/** The card's body, rendered for real in each of its four states. */
function view(read: GetStaffAdvanceRead | null, loading = false, err: string | null = null): string {
  return renderToStaticMarkup(createElement(StaffAdvanceCardView, { part: PART, read, loading, err }));
}

const ROW: StaffAdvanceSummaryRow = {
  enrolment_id: "300111aa-fb81-45dd-a5a7-a784d7fdf062", account_code: "350-V42",
  person_label: "Staff a1", advance_id: PART.advance_id, issue_date: "2026-05-04",
  amount_cents: 1_500_000, outstanding_cents: 300_000, days_outstanding: 91,
  purpose: null, reference: null, particulars_complete: false, enrolment_active: true, voided: false,
};

test("[round-3 RED] an UNREADABLE register says UNAVAILABLE — it never borrows the 'not found' wording", () => {
  const html = view({ advance: null, available: false, as_of: null });
  assert.match(html, /UNAVAILABLE, not/);
  assert.ok(!/Not on the register/.test(html),
    "a failed read must not claim the advance is absent — we do not know that");
  // The pre-round-3 body for this exact input was empty. Prove it is not now.
  assert.ok(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length > 60);
});

test("[round-3 RED] a GENUINE miss names the DB's own date and explains the register's date window", () => {
  const html = view({ advance: null, available: true, as_of: "2026-08-03" });
  assert.match(html, /Not on the register as of the DB.{0,8}s own date \(2026-08-03\)/);
  assert.match(html, /issue date onward/i, "the reader must learn WHY a real advance can be absent today");
  assert.ok(!/UNAVAILABLE/.test(html), "a known miss is not an unavailable read");
});

test("[round-3] a LOADED advance still renders every DB figure verbatim, plus the register date it is as of", () => {
  const html = view({ advance: ROW, available: true, as_of: "2026-08-03" });
  assert.match(html, /15,000\.00/, "issued — the DB's own cents");
  assert.match(html, /3,000\.00/, "outstanding — the DB's own cents");
  assert.match(html, /outstanding<\/span>|>outstanding</, "the badge states the live state");
  assert.match(html, /register date \(2026-08-03\)/, "the card names WHICH day's register it is showing");
  assert.match(html, /Particulars incomplete/);
  assert.ok(!/Not on the register|UNAVAILABLE|has not been loaded/.test(html),
    "no empty-state copy may leak into a loaded card");
});

test("[round-3] the four states are MUTUALLY EXCLUSIVE — exactly one empty message can ever show", () => {
  const messages = [/UNAVAILABLE, not/, /Not on the register/, /has not been loaded/, /Loading advance/];
  const states: [string, string][] = [
    ["unavailable", view({ advance: null, available: false, as_of: null })],
    ["miss", view({ advance: null, available: true, as_of: "2026-08-03" })],
    ["unloaded", view(null)],
    ["loading", view(null, true)],
    ["loaded", view({ advance: ROW, available: true, as_of: "2026-08-03" })],
  ];
  for (const [label, html] of states) {
    const hits = messages.filter((m) => m.test(html)).length;
    assert.equal(hits, label === "loaded" ? 0 : 1, `${label}: expected exactly one empty message, got ${hits}`);
  }
});

test("[round-3] the card computes NO date of its own — the DB owns the register's date", async () => {
  const src = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("./StaffAdvanceCard.tsx", import.meta.url), "utf8"));
  assert.ok(!/new Date\(\)/.test(src),
    "a browser clock in this file is the round-3 defect returning (UTC vs Asia/Kuala_Lumpur)");
  assert.match(src, /read\?\.as_of|read\.as_of/, "it renders the DB's answer date instead");
});
