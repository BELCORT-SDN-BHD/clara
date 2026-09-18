// #659 — Firm Home's URL state. The cell that matters most is the LAST one: a filter change drops
// the cursor. Every other axis could round-trip perfectly and the board would still show a page of
// rows nobody asked for, because a cursor is a fence into ONE ordered result set and carrying it
// across a filter change fences a DIFFERENT one at a position that never belonged to it. That bug
// does not throw, does not log, and looks exactly like a correct page.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_PORTFOLIO_FILTERS,
  EMPTY_PORTFOLIO_STATE,
  PORTFOLIO_ATTENTION_VALUES,
  PORTFOLIO_FILTER_AXES,
  applyPortfolioUrlState,
  countPortfolioFilters,
  hasPortfolioFilters,
  isPortfolioAttention,
  parsePortfolioUrlState,
  portfolioStateQuery,
} from "./portfolio-url-state";

const parse = (qs: string) => parsePortfolioUrlState(new URLSearchParams(qs));

test("every axis round-trips through the URL and back", () => {
  const state = parse("status=active,onboarding&attention=failed&q=Rome&cursor=Y3Vyc29y");
  assert.deepEqual(state.status, ["active", "onboarding"]);
  assert.equal(state.attention, "failed");
  assert.equal(state.q, "Rome");
  assert.equal(state.cursor, "Y3Vyc29y");

  const written = applyPortfolioUrlState(new URLSearchParams(), state);
  assert.deepEqual(parsePortfolioUrlState(written), state, "written and re-parsed is the same state");
});

test("an empty URL is the empty state, and the empty state writes an empty URL", () => {
  assert.deepEqual(parse(""), EMPTY_PORTFOLIO_STATE);
  assert.equal(applyPortfolioUrlState(new URLSearchParams(), EMPTY_PORTFOLIO_STATE).toString(), "");
  assert.equal(hasPortfolioFilters(EMPTY_PORTFOLIO_STATE), false);
  assert.equal(countPortfolioFilters(EMPTY_PORTFOLIO_STATE), 0);
});

test("a malformed value degrades to its empty default — the URL is user-editable input, not a wire contract", () => {
  // A client status the CHECK constraint does not admit, and an attention word this build has not
  // enumerated. Both are DROPPED rather than narrowed on or sent anywhere: the board would either
  // show nothing at all for a status nothing carries, or pass a word no reader understands.
  const state = parse("status=active,deleted,../../etc&attention=whatever&q=%20%20");
  assert.deepEqual(state.status, ["active"], "only statuses this build knows survive");
  assert.equal(state.attention, null, "an unknown attention word narrows nothing");
  assert.equal(state.q, null, "a whitespace-only query is no query");
  assert.equal(countPortfolioFilters(state), 1, "exactly one axis is narrowing");
});

test("a prototype-shaped status is a string like any other and is simply not admitted", () => {
  assert.deepEqual(parse("status=constructor").status, []);
  assert.deepEqual(parse("status=__proto__,toString").status, []);
});

test("the cursor is passed through as TYPED — its grammar belongs to the door, not to this module", () => {
  // `lower(name)|uuid` base64. A browser that re-derived that shape would be a second spelling of a
  // contract this build does not own; a malformed one comes back CLR10 `invalid_cursor` and the
  // board renders the typed refusal.
  const weird = "bm90IGEgcmVhbCBjdXJzb3I=";
  assert.equal(parse(`cursor=${weird}`).cursor, weird);
  assert.equal(parse("cursor=   ").cursor, null, "but blank is absent, not a cursor");
});

test("A FILTER CHANGE DROPS THE CURSOR — every axis, every time", () => {
  const paged = new URLSearchParams("status=active&cursor=YWJj");
  for (const axis of PORTFOLIO_FILTER_AXES) {
    const patch = axis === "status" ? { status: ["archived"] }
      : axis === "attention" ? { attention: "active" as const }
        : { q: "Bee" };
    const next = applyPortfolioUrlState(paged, patch);
    assert.equal(next.get("cursor"), null, `touching ${axis} must fence a fresh result set from page 1`);
  }
});

test("…unless the SAME patch sets a cursor explicitly, which is what Previous/Next do", () => {
  const next = applyPortfolioUrlState(new URLSearchParams("cursor=YWJj"), { cursor: "ZGVm" });
  assert.equal(next.get("cursor"), "ZGVm");
});

test("clearing the filters clears every axis and the page with them", () => {
  const next = applyPortfolioUrlState(
    new URLSearchParams("status=active&attention=needs_you&q=Rome&cursor=YWJj"),
    EMPTY_PORTFOLIO_FILTERS,
  );
  assert.equal(next.toString(), "", "no dead `?q=&attention=` noise is left behind either");
});

test("a patch leaves every param it does not name untouched", () => {
  const next = applyPortfolioUrlState(new URLSearchParams("status=active&unrelated=keep"), { q: "Bee" });
  assert.equal(next.get("unrelated"), "keep");
  assert.equal(next.get("status"), "active");
  assert.equal(next.get("q"), "Bee");
});

test("the canonical query sorts list values, so one filter set chosen in two orders is ONE string", () => {
  const a = parse("status=onboarding,active&attention=failed");
  const b = parse("status=active,onboarding&attention=failed");
  assert.equal(portfolioStateQuery(a), portfolioStateQuery(b));
  assert.match(portfolioStateQuery(a), /status=active%2Conboarding/);
});

test("the canonical query KEEPS the cursor — it names a page a person was looking at, not a saved filter set", () => {
  // This is the one place this module diverges from `lib/work/work-list-url-state.ts`'s
  // `workListStateQuery`, and the reason is the subject: that string is stored as a saved VIEW and
  // would open on a fence into nothing; this one is what browser Back lands on.
  assert.match(portfolioStateQuery(parse("cursor=YWJj")), /cursor=YWJj/);
});

test("countPortfolioFilters counts AXES, not tokens", () => {
  assert.equal(countPortfolioFilters(parse("status=active,onboarding,archived")), 1,
    "three statuses are ONE narrowing of the status axis");
  assert.equal(countPortfolioFilters(parse("status=active&q=Bee")), 2);
});

test("every enumerated attention word is admitted, and the roster is the one the board branches on", () => {
  for (const word of PORTFOLIO_ATTENTION_VALUES) {
    assert.equal(isPortfolioAttention(word), true);
    assert.equal(parse(`attention=${word}`).attention, word);
  }
  assert.equal(isPortfolioAttention("caught-up"), false, "the spelling is the contract");
});
