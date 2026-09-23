// #979 [0251] — THE RETIRED-AUTHORITY SURFACE. `AuthorityCeremony` is pure-props (its `data`
// comes from the caller, not from a fetch it owns), so this battery renders it directly with a
// crafted envelope — no fetch mocking needed at all.
//
//   retired.facts    a client whose read reports a RETIRED authority renders its reason, its
//                     retiring author (short id) and its window floor — the same window-floor
//                     line a LIVE authority renders (au.status widened, one shared testid),
//                     never the bare "none proposed" a fresh client renders.
//   retired.actions  a retired authority offers Propose (a fresh one), never a second Retire —
//                     retiring an already-retired authority is a CLR38 `authority_not_live`
//                     refusal waiting to happen. A live or a proposed authority still offers
//                     Retire, unchanged.
//   retired.badge    the status badge reads "Retired" (the `secondary` variant house style
//                     already uses for a retired counterparty alias —
//                     counterparty-identity-panel.tsx's own `aliasRetired` badge).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { AuthorityCeremony } from "./fa-authority-ceremony";
import { intlApp, faAuthorityEnvelope, findAll, tid, attr, type StubNode } from "./fa-depreciation-test-fixtures";

enableDomInspection();

const noopAct = async (fn: () => Promise<void>) => { await fn(); return true; };

async function mount(envelope: ReturnType<typeof faAuthorityEnvelope>) {
  const h = await renderComponent(intlApp(createElement(AuthorityCeremony, {
    clientId: envelope.client_id, data: envelope, busy: false, act: noopAct,
  })));
  for (let i = 0; i < 4; i++) await h.settle();
  return h;
}

test("retired.facts a retired authority renders its reason, its retiring author (short id) and its window floor", async () => {
  const envelope = faAuthorityEnvelope({
    authority: {
      id: "au-9", status: "retired", cadence: "monthly", proposed_by: "u1", signed_by: "u2",
      retired_by: "u3333333-3333-4333-8333-333333333333", created_at: "2026-03-01T00:00:00Z",
      retired_reason: "cadence review", retired_at: "2026-08-15T02:00:00Z",
      authority_from: "2026-03-01",
    },
  });
  const h = await mount(envelope);
  try {
    const reason = h.find((n) => tid(n as StubNode) === "fa-authority-retired-reason");
    assert.ok(reason, "the retirement reason renders");
    assert.match(textOf(reason!), /cadence review/);

    const by = h.find((n) => tid(n as StubNode) === "fa-authority-retired-by");
    assert.ok(by, "the retiring author renders");
    assert.match(textOf(by!), /u333333/, "…as a short id, the same style authority_ref.id already uses in this file");

    const window = h.find((n) => tid(n as StubNode) === "fa-authority-window");
    assert.ok(window, "the window floor renders on a RETIRED authority too — the same line a live one uses");
    assert.match(textOf(window!), /2026-03-01/);

    assert.doesNotMatch(h.text(), /No depreciation authority has been proposed/, "never the fresh-client sentence");
  } finally {
    await h.unmount();
  }
});

test("retired.actions a retired authority offers Propose, never a second Retire; a live authority still offers Retire", async () => {
  const retired = await mount(faAuthorityEnvelope({
    authority: {
      id: "au-9", status: "retired", cadence: "monthly", proposed_by: "u1", signed_by: "u2",
      retired_by: "u3", created_at: "2026-03-01T00:00:00Z",
      retired_reason: "cadence review", retired_at: "2026-08-15T02:00:00Z", authority_from: "2026-03-01",
    },
  }));
  try {
    const buttons = findAll(retired.container as never, (n) => n.tagName === "BUTTON").map((n) => textOf(n as never).trim());
    assert.ok(buttons.some((b) => b === "Propose authority"), `expected a Propose trigger, got: ${JSON.stringify(buttons)}`);
    assert.ok(!buttons.some((b) => b === "Retire authority"), `a retired authority must not offer to retire itself again, got: ${JSON.stringify(buttons)}`);
  } finally {
    await retired.unmount();
  }

  const live = await mount(faAuthorityEnvelope());
  try {
    const buttons = findAll(live.container as never, (n) => n.tagName === "BUTTON").map((n) => textOf(n as never).trim());
    assert.ok(buttons.some((b) => b === "Retire authority"), `a live authority still offers Retire, got: ${JSON.stringify(buttons)}`);
    assert.ok(!buttons.some((b) => b === "Propose authority"), `a live authority does not ALSO offer Propose, got: ${JSON.stringify(buttons)}`);
  } finally {
    await live.unmount();
  }
});

test("retired.badge the status badge reads \"Retired\"", async () => {
  const h = await mount(faAuthorityEnvelope({
    authority: {
      id: "au-9", status: "retired", cadence: "monthly", proposed_by: "u1", signed_by: "u2",
      retired_by: "u3", created_at: "2026-03-01T00:00:00Z",
      retired_reason: "cadence review", retired_at: "2026-08-15T02:00:00Z", authority_from: "2026-03-01",
    },
  }));
  try {
    const badge = findAll(h.container as never, (n) => textOf(n as never).trim() === "Retired")[0];
    assert.ok(badge, "a badge reading exactly \"Retired\" renders");
    assert.match(String(attr(badge as never, "class") ?? ""), /bg-secondary/, "the same secondary variant a retired counterparty alias badge uses");
  } finally {
    await h.unmount();
  }
});
