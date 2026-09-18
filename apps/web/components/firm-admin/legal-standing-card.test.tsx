// #635 — the legal standing card's seven faces, each its own cell.
//
// The card is presentational: the view-state ladder it renders comes from `FirmSettingsPanel`'s
// three reads, so a cell here can put the card in ANY of its faces without a fetch and assert
// exactly what a person would read.
//
// AXE LIVES IN `firm-settings-a11y.test.tsx`, NOT HERE, and that is deliberate: a card mounted
// ALONE starts at h2 with no h1 above it, which the heading-order rule correctly flags as a
// defect OF THE MOUNT rather than of the component. The a11y file mounts the whole page
// composition — the real `PageHeader`'s own h1 and all five cards — at four ranks, which is where
// heading order can be judged honestly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { LegalStandingCard } from "./legal-standing-card";
import type { FirmLegalStanding, LegalStandingDocument } from "../../lib/firm/commercial-reads";
import type { FirmSettingsView } from "./firm-settings-view";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const OWNER = "11111111-1111-4111-8111-111111111111";

function doc(over: Partial<LegalStandingDocument> = {}): LegalStandingDocument {
  return {
    kind: "terms",
    version: 2,
    status: "published",
    title: "Terms of Service (Clara beta)",
    effectiveFrom: "2026-09-12T16:00:00.000Z",
    publishedAt: "2026-09-18T13:46:54.777Z",
    firmAccepted: true,
    acceptedAt: "2026-09-19T01:00:00.000Z",
    acceptedBy: OWNER,
    acceptedByName: "Alice Tan",
    myAcceptedVersion: 2,
    myAcceptedAt: "2026-09-19T01:00:00.000Z",
    ...over,
  };
}

function standing(over: Partial<FirmLegalStanding> = {}): FirmLegalStanding {
  return {
    documents: [doc(), doc({ kind: "dpa", title: "Data processing agreement" })],
    standingLive: true,
    canAcceptForFirm: true,
    masked: false,
    ...over,
  };
}

async function mount(view: FirmSettingsView<FirmLegalStanding>) {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(LegalStandingCard, { view, onRetry: () => {}, onAccepted: () => {} }),
    }),
  );
}

/** NEVER hand one of these stubs to `assert.equal(..., null)`: node serialises the whole DOM node
 *  into the failure message and the process runs out of memory before it can print. Compare
 *  `acceptTrigger(h) !== null` instead — measured while writing this ticket's dialog cells. */
function acceptTrigger(h: { find: (p: (n: Stub) => boolean) => Stub | null }): Stub | null {
  return h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Accept for this firm"));
}

test("p635.web.legal_live an accepted, current standing says so and offers nothing to accept", async () => {
  const h = await mount({ status: "ready", data: standing() });
  try {
    const text = h.text();
    assert.match(text, /An owner of this firm has accepted the current versions/);
    assert.match(text, /Accepted by Alice Tan on/, "the attribution is rendered at bookkeeper and above");
    assert.equal(acceptTrigger(h) !== null, false, "there is nothing outstanding, so no control is offered");
  } finally { await h.unmount(); }
});

test("p635.web.legal_not_live_with_accept an owner sees the consequence in the accountant's words AND the control", async () => {
  const h = await mount({
    status: "ready",
    data: standing({
      standingLive: false,
      canAcceptForFirm: true,
      documents: [doc({ version: 3, firmAccepted: false, acceptedAt: null, acceptedBy: null, acceptedByName: null, myAcceptedVersion: 2 }), doc({ kind: "dpa" })],
    }),
  });
  try {
    const text = h.text();
    assert.match(text, /Clara cannot use a model on any client's books until an owner of this firm accepts the current versions/,
      "the consequence, not the mechanism — ARCHITECTURE §5.E's third recovery path");
    assert.match(text, /Not yet accepted for this firm/);
    assert.ok(acceptTrigger(h), "an owner gets the control that is the remedy");
  } finally { await h.unmount(); }
});

test("p635.web.legal_not_live_without_accept a non-owner is told WHO must act, and is offered no control", async () => {
  const h = await mount({
    status: "ready",
    data: standing({
      standingLive: false,
      canAcceptForFirm: false,
      documents: [doc({ version: 3, firmAccepted: false, acceptedAt: null, acceptedBy: null, acceptedByName: "Alice Tan", myAcceptedVersion: null, myAcceptedAt: null }), doc({ kind: "dpa" })],
    }),
  });
  try {
    const text = h.text();
    assert.match(text, /An owner of this firm must accept the current versions/);
    assert.equal(acceptTrigger(h) !== null, false,
      "裁-187: a control this caller's rank cannot use is NOT RENDERED — not disabled, not at all");
  } finally { await h.unmount(); }
});

test("p635.web.legal_draft_preview a draft is labelled and carries no accept control, even for an owner", async () => {
  const h = await mount({
    status: "ready",
    data: standing({
      standingLive: false,
      canAcceptForFirm: true,
      documents: [doc({ status: "draft", firmAccepted: false, acceptedAt: null, acceptedBy: null, acceptedByName: null })],
    }),
  });
  try {
    const text = h.text();
    assert.match(text, /Draft — being prepared/);
    assert.match(text, /It cannot be accepted, and nothing in Clara depends on it yet/);
    assert.equal(acceptTrigger(h) !== null, false,
      "accept_legal_document refuses a draft CLR09/not_published — offering the control is how somebody comes to believe they signed an unfinished agreement");
  } finally { await h.unmount(); }
});

test("p635.web.legal_viewer_masked a masked payload shows WHETHER without WHO, and never reads as an absence", async () => {
  const h = await mount({
    status: "ready",
    data: standing({
      masked: true,
      canAcceptForFirm: false,
      documents: [doc({ acceptedAt: null, acceptedBy: null, acceptedByName: null })],
    }),
  });
  try {
    const text = h.text();
    assert.match(text, /Accepted for this firm/, "WHETHER is not masked");
    assert.doesNotMatch(text, /Alice Tan/, "WHO is");
    assert.doesNotMatch(text, /Not yet accepted for this firm/,
      "a masked NULL must never be rendered as 'nobody accepted' — that is what firmAccepted is for");
    assert.match(text, /Who accepted an agreement, and when, is shown to bookkeepers and above/,
      "the withholding is stated, not left as a blank");
  } finally { await h.unmount(); }
});

test("p635.web.legal_your_own_acceptance is rendered at every rank, because it is the reader's own act", async () => {
  const h = await mount({
    status: "ready",
    data: standing({
      masked: true,
      documents: [doc({ acceptedAt: null, acceptedBy: null, acceptedByName: null, myAcceptedVersion: 2, myAcceptedAt: "2026-09-19T01:00:00.000Z" })],
    }),
  });
  try {
    assert.match(h.text(), /You accepted version 2 on/);
  } finally { await h.unmount(); }
});

test("p635.web.legal_read_failed offers a retry and the technical detail, and paints no standing at all", async () => {
  const h = await mount({ status: "failed", data: undefined as never, message: "network" } as never);
  try {
    const text = h.text();
    assert.match(text, /This could not be read\./);
    assert.doesNotMatch(text, /has accepted the current versions/,
      "a failed read must not paint the reassuring face");
    assert.doesNotMatch(text, /Clara cannot use a model/,
      "…nor the alarming one: neither is known");
    assert.ok(h.find((n) => (n as Stub).tagName === "BUTTON" && textOf(n as Stub).includes("Try again")));
  } finally { await h.unmount(); }
});

test("p635.web.legal_denied renders the DATABASE's own sentence, verbatim, with its code", async () => {
  const h = await mount({ status: "denied", message: "actor has no active membership" });
  try {
    const text = h.text();
    assert.match(text, /actor has no active membership/, "0004:299-309's own words, not a paraphrase");
    assert.match(text, /CLR04/);
    assert.doesNotMatch(text, /Accepted for this firm/, "nothing of the payload survives a refusal");
  } finally { await h.unmount(); }
});
