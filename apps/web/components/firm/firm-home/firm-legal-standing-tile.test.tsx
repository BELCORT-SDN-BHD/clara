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
