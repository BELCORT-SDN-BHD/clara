// CommitGate render tests (createElement + renderToStaticMarkup, no jsdom). Locks F-M15:
// the commit verb is NEVER disabled by locally-derived readiness — the button stays enabled
// and the DB refusal renders verbatim; the local checklist is a labeled, non-authoritative
// preview. Only an in-flight commit disables the button. seedId=null so the self-hydrating
// OpeningDryRunCard (a network read in a useEffect) is not rendered.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CommitGate } from "./CommitGate";
import type { CommitReadiness } from "./model";

test("F-M15: the commit verb stays ENABLED even when local readiness is not met", () => {
  const readiness: CommitReadiness = {
    ready: false,
    blockers: [{ kind: "required_unresolved", items: [] }, { kind: "opening_position_unconfirmed" }],
  };
  const html = renderToStaticMarkup(createElement(CommitGate, {
    token: "jwt", seedId: null, readiness, refusal: null, committing: false, onCommit: () => {}, onReReview: () => {},
  }));
  assert.doesNotMatch(html, /<button[^>]*disabled[^>]*>Commit onboarding<\/button>/, "the commit button is NOT disabled by local readiness");
  assert.ok(html.includes("Preview only"), "the checklist is labeled a non-authoritative preview");
});

test("F-M15: the commit verb is disabled only while a commit is in flight", () => {
  const readiness: CommitReadiness = { ready: false, blockers: [] };
  const html = renderToStaticMarkup(createElement(CommitGate, {
    token: "jwt", seedId: null, readiness, refusal: null, committing: true, onCommit: () => {}, onReReview: () => {},
  }));
  assert.match(html, /<button[^>]*disabled[^>]*>Committing…<\/button>/, "an in-flight commit disables the button (busy label)");
});
