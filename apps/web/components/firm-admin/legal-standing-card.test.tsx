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
    // #1008: `enforce` by default, so every cell written before the mode existed keeps asserting
    // the copy the estate showed then. The two cells that are ABOUT the mode set it explicitly.
    enforcementMode: "enforce",
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
      // THE SHAPE THE DOOR CAN ACTUALLY EMIT (spec F1): `firm_accepted` and `accepted_by_name`
      // come from the SAME lateral per document (0233:267-272), so an unaccepted kind carries
      // no name. The name in the hint therefore comes from the OTHER kind, which is still
      // accepted — the ordinary "a new version was published" state.
      documents: [doc({ version: 3, firmAccepted: false, acceptedAt: null, acceptedBy: null, acceptedByName: null, myAcceptedVersion: null, myAcceptedAt: null }), doc({ kind: "dpa" })],
    }),
  });
  try {
    const text = h.text();
    assert.match(text, /An owner of this firm must accept the current versions\. The most recent acceptance on record was made by Alice Tan\./,
      "the whole sentence, named — not the leading clause both variants share");
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

// ───────────────────────────────────────────────────────────────────────────
// FIX ROUND 1 — the SPLIT-ACCEPTANCE state (adversarial A1) and the NAMED hint
// (spec F1 / standards F1). Both were reachable and neither was covered.
// ───────────────────────────────────────────────────────────────────────────

function triggerCount(h: { text: () => string }): number {
  return (h.text().match(/Accept for this firm/g) ?? []).length;
}

test("p635.web.legal_split_acceptance an owner still gets the control that makes standing live", async () => {
  // TWO OWNERS HOLD THE TWO HALVES. `standing_live` (0195:896-906) needs ONE active owner
  // holding BOTH current acceptances, so a firm where owner B accepted terms v2 and owner A
  // accepted dpa v1 reads `firm_accepted: true` on BOTH kinds and `standing_live: false`.
  // The database battery asserts exactly this state (p635.db.legal_standing_two_people).
  // Gating the control on `!firmAccepted` left the firm with NO in-app remedy in the one
  // state the remedy exists for.
  const h = await mount({
    status: "ready",
    data: standing({
      standingLive: false,
      canAcceptForFirm: true,
      documents: [
        // terms v2 — accepted for the firm by the OTHER owner; this caller has not accepted it.
        doc({ version: 2, firmAccepted: true, acceptedByName: "Bob Lim", acceptedAt: "2026-09-19T02:00:00.000Z", myAcceptedVersion: 1, myAcceptedAt: "2026-09-01T00:00:00.000Z" }),
        // dpa v2 — this caller's own acceptance, still current.
        doc({ kind: "dpa", version: 2, firmAccepted: true, myAcceptedVersion: 2 }),
      ],
    }),
  });
  try {
    assert.match(h.text(), /Clara cannot use a model on any client's books/, "the warning is right");
    assert.equal(triggerCount(h), 1,
      "exactly one control: for the kind THIS owner has not accepted at its current version");
  } finally { await h.unmount(); }
});

test("p635.web.legal_live_offers_nothing_even_to_an_owner_who_never_accepted", async () => {
  // The other direction of the same gate: standing is LIVE (some owner holds both), so there is
  // nothing outstanding — a second owner who has accepted neither is offered no control.
  const h = await mount({
    status: "ready",
    data: standing({
      standingLive: true,
      canAcceptForFirm: true,
      documents: [
        doc({ myAcceptedVersion: null, myAcceptedAt: null }),
        doc({ kind: "dpa", myAcceptedVersion: null, myAcceptedAt: null }),
      ],
    }),
  });
  try {
    assert.equal(triggerCount(h), 0, "a live standing needs no repair");
    assert.match(h.text(), /You have not accepted this version/, "…and the reader's own state is still stated");
  } finally { await h.unmount(); }
});

test("p635.web.legal_named_hint names the MOST RECENT acceptance, not the first row carrying a name", async () => {
  // The hint used to take `documents.find(d => d.acceptedByName !== null)` — array order, which
  // is kind order — and say that person "accepted the previous ones". In a split state that
  // names whichever kind sorts first, and asserts something that did not happen. It now names
  // the most recent acceptance on record, which is true in every reachable state.
  const h = await mount({
    status: "ready",
    data: standing({
      standingLive: false,
      canAcceptForFirm: false,
      masked: false,
      documents: [
        doc({ version: 2, firmAccepted: true, acceptedByName: "Alice Tan", acceptedAt: "2026-09-01T00:00:00.000Z" }),
        doc({ kind: "dpa", version: 2, firmAccepted: true, acceptedByName: "Bob Lim", acceptedAt: "2026-09-19T02:00:00.000Z" }),
      ],
    }),
  });
  try {
    const text = h.text();
    assert.match(text, /An owner of this firm must accept the current versions\. The most recent acceptance on record was made by Bob Lim\./,
      "the exact sentence, so a cell cannot pass on the shared leading clause alone");
    assert.doesNotMatch(text, /made by Alice Tan/, "the earlier acceptance is not the one named");
  } finally { await h.unmount(); }
});

test("p635.web.legal_named_hint_masked falls back to the unnamed sentence", async () => {
  const h = await mount({
    status: "ready",
    data: standing({
      standingLive: false,
      canAcceptForFirm: false,
      masked: true,
      documents: [doc({ acceptedAt: null, acceptedBy: null, acceptedByName: null })],
    }),
  });
  try {
    const text = h.text();
    assert.match(text, /An owner of this firm must accept the current versions\./);
    assert.doesNotMatch(text, /most recent acceptance on record/,
      "a masked payload carries no name, so the named variant must not render at all");
  } finally { await h.unmount(); }
});

// ───────────────────────────────────────────────────────────────────────────
// #1008 — THE COPY PER MODE. In `prompt` (the beta) the card asks the owner to accept and must
// NOT say the model is switched off, because it is not: migration 0234 makes the derived basis
// live on any real acceptance the firm's active owner holds. `standing_live` still arrives false,
// deliberately — that is the fact the card needs in order to ASK.
// ───────────────────────────────────────────────────────────────────────────

test("p1008.web.legal_prompt_copy in prompt mode the card asks for the acceptance and never says the model is off", async () => {
  const h = await mount({
    status: "ready",
    data: standing({
      enforcementMode: "prompt",
      standingLive: false,
      canAcceptForFirm: true,
      documents: [
        doc({ version: 3, firmAccepted: false, acceptedAt: null, acceptedBy: null, acceptedByName: null, myAcceptedVersion: null, myAcceptedAt: null }),
        doc({ kind: "dpa" }),
      ],
    }),
  });
  try {
    const text = h.text();
    assert.doesNotMatch(text, /cannot use a model/,
      "the beta ruling: the state of a firm's agreements must never be reported as switching a capability off");
    assert.match(text, /Please accept the current versions/,
      "…and the card still ASKS, which is the whole point of `prompt`");
    assert.ok(acceptTrigger(h), "an owner still gets the control that is the remedy");
  } finally { await h.unmount(); }
});

test("p1008.web.legal_enforce_copy in enforce mode the consequence sentence is back, unchanged", async () => {
  const h = await mount({
    status: "ready",
    data: standing({
      enforcementMode: "enforce",
      standingLive: false,
      canAcceptForFirm: true,
      documents: [
        doc({ version: 3, firmAccepted: false, acceptedAt: null, acceptedBy: null, acceptedByName: null, myAcceptedVersion: null, myAcceptedAt: null }),
        doc({ kind: "dpa" }),
      ],
    }),
  });
  try {
    const text = h.text();
    assert.match(text, /Clara cannot use a model on any client's books until an owner of this firm accepts the current versions/,
      "enforce is today's copy, byte for byte");
    assert.doesNotMatch(text, /Please accept the current versions/);
  } finally { await h.unmount(); }
});

test("p1008.web.legal_live_copy a live standing reads the same in both modes", async () => {
  for (const mode of ["prompt", "enforce"] as const) {
    const h = await mount({ status: "ready", data: standing({ enforcementMode: mode }) });
    try {
      const text = h.text();
      assert.match(text, /An owner of this firm has accepted the current versions of both agreements/,
        `${mode}: a live standing is a live standing`);
      assert.equal(acceptTrigger(h) !== null, false, `${mode}: nothing is outstanding`);
    } finally { await h.unmount(); }
  }
});
