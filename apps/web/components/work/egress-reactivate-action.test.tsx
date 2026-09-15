// #812 — THE OWNER'S WAY BACK ON, mounted.
//
// WHAT ONLY A MOUNTED COMPONENT CAN PROVE, and each has its own cell:
//   1. THE PRESS IS THE ACT, and it sends the CLIENT and a fresh op key — nothing else. The door
//      resolves the consent itself, because no lawful read hands that id to the browser.
//   2. A SUCCESS SAYS WHAT IT DID **AND WHAT IT DID NOT DO**: authority is back for new work, and
//      this record stays refused. An owner who reads "AI processing is on again" and expects the
//      Work on the screen to resume has been misled by the copy, not by the database.
//   3. A GOVERNED REFUSAL IS PRINTED VERBATIM — `no_consent` (the withdrawal was a REVOKE, which
//      `restore_client_egress_purpose` reverses) is a sentence a person must read, never one this
//      component may paraphrase into "something went wrong".
//   4. AN UNREACHED DOOR IS NOT A REFUSAL. Nothing was decided, and the copy says so.
//
// The refusal FACE's own gate — owner only — is asserted in work-detail.test.tsx, where the rank
// lives; this file is about the action itself.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { EgressReactivateAction } from "./egress-reactivate-action";
import type { ReactivateClientEgressOutcome } from "../../lib/work/egress-recovery";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const COPY_SOURCE = messages.WorkDetail.egressNotAuthorized as Record<string, string>;
/** One message, positively resolved: an absent key is the finding, never an empty assertion. */
const copy = (key: string): string => {
  const v = COPY_SOURCE[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`WorkDetail.egressNotAuthorized.${key} is missing from messages/en.json`);
  }
  return v;
};

function mount(
  outcome: ReactivateClientEgressOutcome,
  sink: { calls: { clientId: string; opKey: string }[]; reloads: number },
) {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(EgressReactivateAction, {
        clientId: CLIENT,
        reactivate: async (params) => {
          sink.calls.push({ clientId: params.clientId, opKey: params.opKey });
          return outcome;
        },
        newOpKey: () => `opk-${sink.calls.length + 1}`,
        onReactivated: () => {
          sink.reloads += 1;
        },
      }),
    }),
  );
}

const buttonOf = (h: { find: (p: (n: Stub) => boolean) => Stub | null }) =>
  h.find((n) => n.tagName === "BUTTON" && textOf(n).includes(copy("reactivate")));

test("w812.web.press the press sends the CLIENT and a fresh op key, and nothing else", async () => {
  const sink = { calls: [] as { clientId: string; opKey: string }[], reloads: 0 };
  const h = await mount({ kind: "active" }, sink);
  const btn = buttonOf(h);
  assert.ok(btn, "web.press: the owner-only action is rendered");
  assert.equal(sink.calls.length, 0, "web.press: rendering is not the act");

  await h.act(async () => { await clickButton(btn as never); });
  await h.settle();
  assert.deepEqual(sink.calls, [{ clientId: CLIENT, opKey: "opk-1" }],
    "web.press: exactly one call, naming the client — the door resolves the consent id itself");
  assert.equal(sink.reloads, 1, "web.press: …and the page is told to re-read");
  await h.unmount();
});

test("w812.web.success the receipt says authority is back for NEW work and this record stays refused", async () => {
  const sink = { calls: [] as { clientId: string; opKey: string }[], reloads: 0 };
  const h = await mount({ kind: "active" }, sink);
  await h.act(async () => { await clickButton(buttonOf(h) as never); });
  await h.settle();
  const said = textOf(h.container);
  assert.ok(said.includes(copy("reactivated")), "web.success: the receipt is shown");
  assert.match(copy("reactivated"), /stays refused/i,
    "web.success: …and it says the record on screen is NOT resumed — recovery restores future dispatches only");
  await h.unmount();
});

test("w812.web.refused a governed refusal is printed VERBATIM, never paraphrased", async () => {
  const sink = { calls: [] as { clientId: string; opKey: string }[], reloads: 0 };
  const message = "no live typed egress consent for this client and purpose";
  const h = await mount({ kind: "refused", code: "CLR28", reason: "no_consent", message }, sink);
  await h.act(async () => { await clickButton(buttonOf(h) as never); });
  await h.settle();
  const said = textOf(h.container);
  assert.ok(said.includes(message), "web.refused: the database's own sentence is on screen");
  assert.ok(!said.includes(copy("reactivated")),
    "web.refused: …and no receipt claims the activation came back");
  assert.equal(sink.reloads, 0, "web.refused: nothing changed, so nothing is re-read");
  await h.unmount();
});

test("w812.web.unavailable an unreached door is NOT reported as a refusal", async () => {
  const sink = { calls: [] as { clientId: string; opKey: string }[], reloads: 0 };
  const h = await mount({ kind: "unavailable" }, sink);
  await h.act(async () => { await clickButton(buttonOf(h) as never); });
  await h.settle();
  const said = textOf(h.container);
  assert.ok(said.includes(copy("reactivateUnavailable")),
    "web.unavailable: the copy says nothing was decided");
  assert.ok(!said.includes(copy("reactivated")));
  assert.equal(sink.reloads, 0);
  await h.unmount();
});

test("w812.web.copy the refusal face's body names the paused-purpose recovery, not only Terms/DPA and client status", () => {
  assert.match(copy("body"), /paused/i,
    "web.copy: the face must name the third recovery — a DEACTIVATED purpose activation");
  assert.match(copy("body"), /Try again/i,
    "web.copy: …and say that restoring authority does not resume this record");
  assert.match(copy("reactivate"), /Re-activate AI processing for this client/,
    "web.copy: the action is labelled as the ticket names it");
});
