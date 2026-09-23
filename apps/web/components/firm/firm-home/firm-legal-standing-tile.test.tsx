// #1009 — Firm Home's legal-standing prompt: the four faces (absent when current, the owner's
// call to accept, a non-owner's "who must" sentence, and a failed read), one seam at a time.
//
// THE SEAM is the RENDERED component, driven through an injected `loader` — the same shape
// `FirmSettingsPanelView`'s own `loaders` prop uses (`firm-admin/firm-settings-panel.tsx`) — so
// each cell puts the tile in exactly one state without touching global fetch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, type RenderHarness } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import messages from "../../../messages/en.json";
import type { FirmLegalStanding, LegalStandingDocument } from "../../../lib/firm/commercial-reads";
import { FirmLegalStandingTile } from "./firm-legal-standing-tile";

enableDomInspection();

function doc(over: Partial<LegalStandingDocument> = {}): LegalStandingDocument {
  return {
    kind: "terms",
    version: 2,
    status: "published",
    title: "Terms of Service (Clara beta)",
    effectiveFrom: "2026-09-12T16:00:00.000Z",
    publishedAt: "2026-09-18T13:46:54.777Z",
    firmAccepted: false,
    acceptedAt: null,
    acceptedBy: null,
    acceptedByName: null,
    myAcceptedVersion: null,
    myAcceptedAt: null,
    ...over,
  };
}

function standing(over: Partial<FirmLegalStanding> = {}): FirmLegalStanding {
  return {
    documents: [doc()],
    standingLive: false,
    canAcceptForFirm: true,
    masked: false,
    enforcementMode: "enforce",
    ...over,
  };
}

async function mount(loader: () => Promise<FirmLegalStanding>): Promise<RenderHarness> {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
      children: createElement(FirmLegalStandingTile, { loader }),
    }),
  );
  for (let i = 0; i < 6; i += 1) await h.settle();
  return h;
}

function tile(h: RenderHarness) {
  return h.find(
    (n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid")
      === "firm-home-legal-standing-tile",
  );
}

test("p1009.web.legal_absent_when_live — a current standing renders nothing", async () => {
  const h = await mount(() => Promise.resolve(standing({ standingLive: true })));
  try {
    assert.equal(tile(h), null, "the prompt has nothing to ask once nothing is outstanding");
  } finally { await h.unmount(); }
});

test("p1009.web.legal_owner_prompt — an owner sees the outstanding agreement, its version, and a link to the accept control", async () => {
  const h = await mount(() => Promise.resolve(standing({
    standingLive: false,
    canAcceptForFirm: true,
    documents: [doc({ kind: "terms", version: 3, effectiveFrom: "2026-10-01T00:00:00.000Z", firmAccepted: false })],
  })));
  try {
    assert.ok(tile(h), "the prompt is on screen while standing is not current");
    const text = h.text();
    assert.match(text, /Terms of Service/, "the agreement is named");
    assert.match(text, /version 3/i, "and its version");
    const link = h.find((n) => n.tagName === "A") as { getAttribute?: (k: string) => string | null } | null;
    assert.ok(link, "an owner is offered a link");
    assert.equal(link!.getAttribute!("href"), "/settings/firm", "landing on the existing accept control");
  } finally { await h.unmount(); }
});

test("p1009.web.legal_member_prompt — a member who cannot accept sees who must, and is offered no link", async () => {
  const h = await mount(() => Promise.resolve(standing({ standingLive: false, canAcceptForFirm: false })));
  try {
    assert.match(h.text(), /An owner of this firm needs to accept/, "who must act, not a demand on this reader");
    assert.equal(h.find((n) => n.tagName === "A"), null,
      "no accept control and no dead link for a reader who cannot use it");
  } finally { await h.unmount(); }
});

test("p1009.web.legal_read_failed — a failed read says the standing could not be read, and never renders as current", async () => {
  const h = await mount(() => Promise.reject(new Error("network boom")));
  try {
    assert.match(h.text(), /could not be read/i, "the failure is said, not swallowed into an absent prompt");
    assert.doesNotMatch(h.text(), /accepts the current versions|not all accepted/i,
      "an unread standing is never painted as current by default");
  } finally { await h.unmount(); }
});

test("p1009.web.legal_mode_copy — the body follows the platform's enforcement mode, never a second derivation", async () => {
  const promptCopy = await mount(() => Promise.resolve(standing({ standingLive: false, enforcementMode: "prompt" })));
  try {
    assert.match(promptCopy.text(), /does not stop Clara working/i, "prompt mode asks plainly and says nothing is switched off");
    assert.doesNotMatch(promptCopy.text(), /Clara cannot use a model/i);
  } finally { await promptCopy.unmount(); }

  const enforceCopy = await mount(() => Promise.resolve(standing({ standingLive: false, enforcementMode: "enforce" })));
  try {
    assert.match(enforceCopy.text(), /Clara cannot use a model on any client's books/i, "enforce mode says what is switched off");
    assert.doesNotMatch(enforceCopy.text(), /does not stop Clara working/i);
  } finally { await enforceCopy.unmount(); }
});

test("p1009.web.legal_two_outstanding — EACH outstanding agreement is named, an accepted kind is not, and a missing date is said rather than guessed", async () => {
  const h = await mount(() => Promise.resolve(standing({
    standingLive: false,
    documents: [
      doc({ kind: "terms", version: 4, firmAccepted: false, effectiveFrom: null }),
      doc({ kind: "dpa", version: 2, firmAccepted: false, effectiveFrom: "2026-08-30T16:00:00.000Z" }),
    ],
  })));
  try {
    const text = h.text();
    assert.match(text, /Terms of Service.*version 4/, "the first outstanding kind, named");
    assert.match(text, /no effective date recorded/, "and its missing date is said, not invented");
    assert.match(text, /Data processing agreement.*version 2.*effective/i, "the second outstanding kind, named too");
  } finally { await h.unmount(); }
});

test("p1009.web.legal_one_accepted_one_not — an already-accepted kind is not listed among what still needs accepting", async () => {
  const h = await mount(() => Promise.resolve(standing({
    standingLive: false,
    documents: [
      doc({ kind: "terms", version: 2, firmAccepted: false }),
      doc({ kind: "dpa", version: 1, firmAccepted: true }),
    ],
  })));
  try {
    const text = h.text();
    assert.match(text, /Terms of Service/, "the outstanding kind is named");
    assert.doesNotMatch(text, /Data processing agreement/,
      "a kind the firm already accepted is not offered as something still to accept");
  } finally { await h.unmount(); }
});
