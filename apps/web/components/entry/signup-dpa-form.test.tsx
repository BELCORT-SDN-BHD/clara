// GATE (b)+(c) folded, one file — the DPA step has few enough states and
// controls that a separate keyboard file would be one assertion repeated
// twice with a different import (the same call `pending-a11y.test.tsx`
// makes for its own single-control surface).
//
// FS-4 C-6, checkout-gate-design.md §1.1 step ④. Two honest-degrade states
// (`signup-dpa-form.tsx`'s own header), both scanned: the document
// "unavailable" (the table is absent/ungranted on this tip — see
// dpa-reads.ts) and the ready document whose "sign" click reaches the
// Lane-B seam and gets an honest "not wired yet" answer rather than a
// fabricated signature.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import type { SignDpa } from "../../lib/registration/dpa-doors";
import { SignupDpaForm } from "./signup-dpa-form";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node };

function App(node: ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      {
        value: {
          replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
        } as never,
      },
      createElement("div", null, node),
    ),
  });
}

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
const byButtonText = (re: RegExp) => (n: Node) => n.tagName === "BUTTON" && re.test(textOf(n as never));
const byLinkText = (re: RegExp) => (n: Node) => n.tagName === "A" && re.test(textOf(n as never));

/** The DB's own posture (`ck_dpa_documents_body_sha`, PR #478's migration):
 *  `body_sha256 = sha256(convert_to(body,'UTF8'))`, rendered by PostgREST as
 *  `\x`-prefixed hex. Computed here rather than hand-typed so the fixture
 *  itself is a REAL hash of the body it accompanies — a hand-typed placeholder
 *  hash would let a "just forwards whatever's in the fixture" bug pass this
 *  file's own M2 cell just as easily as a correct implementation. */
function bodyHash(body: string): string {
  return `\\x${createHash("sha256").update(body, "utf8").digest("hex")}`;
}

test("the UNAVAILABLE document renders an honest NotBuiltNote, zero violations, and a live way out", async () => {
  const h = await renderComponent(
    App(createElement(SignupDpaForm, { document: { kind: "unavailable" } })),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.match(textOf(h.container as never), /the current agreement couldn't be read/i);
    // No sign control renders when there is nothing to sign — the design's
    // own words: "the checkout control is ABSENT, not disabled-looking".
    assert.equal(findIn(h.container as never, byButtonText(/agree/i)), null);
    const back = findIn(h.container as never, byLinkText(/registration status/i));
    assert.ok(back, "the unavailable state must still offer a way back");
    assert.ok(focusableElements(h.container as never).includes(back as never));
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("a READY document renders the exact body and a real h1", async () => {
  const body = "This is Clara's beta data-processing agreement.";
  const h = await renderComponent(
    App(createElement(SignupDpaForm, {
      document: { kind: "ready", version: "clara-beta-2026-08-a", body, bodySha256: bodyHash(body) },
    })),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.match(textOf(h.container as never), /This is Clara's beta data-processing agreement\./);
    const h1 = findIn(h.container as never, (n) => n.tagName === "H1");
    assert.ok(h1, "the DPA step renders no <h1> of its own");
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("clicking sign reaches the Lane-B seam and renders its answer honestly — never a fabricated success", async () => {
  const body = "Beta text.";
  const hash = bodyHash(body);
  const calls: Array<{ version: string; bodySha256: string }> = [];
  const sign: SignDpa = async (params) => {
    calls.push({ version: params.version, bodySha256: params.bodySha256 });
    return { kind: "unavailable" };
  };
  const h = await renderComponent(
    App(createElement(SignupDpaForm, {
      document: { kind: "ready", version: "clara-beta-2026-08-a", body, bodySha256: hash },
      sign,
    })),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const signButton = findIn(h.container as never, byButtonText(/agree/i));
    assert.ok(signButton, "the sign control must render for a ready document");
    assert.ok(
      focusableElements(h.container as never).includes(signButton as never),
      "the sign control must be keyboard-reachable",
    );
    await clickButton(signButton as never);
    for (let i = 0; i < 4; i++) await h.settle();

    // M2 — THE BINDING ITSELF: the hash the seam received is EXACTLY the
    // hash of the body this render showed, never empty, never a different
    // value. This is the whole point of the wall (checkout-gate-design-
    // part2.md §1.1) — a signature must bind the bytes the signer saw.
    assert.deepEqual(
      calls,
      [{ version: "clara-beta-2026-08-a", bodySha256: hash }],
      "the click did not reach the seam with the rendered body's own hash",
    );
    assert.notEqual(calls[0]?.bodySha256, "", "the hash sent to the seam must never be empty");
    // THE DISCRIMINATING POST-CONDITION: an honest "not wired" note appears,
    // and it is NOT the same text as a success would render.
    assert.match(textOf(h.container as never), /door that records your signature.*isn't wired up/i);
    assert.doesNotMatch(textOf(h.container as never), /signature recorded|agreement signed/i);
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("MUTANT: an empty bodySha256 sent to the seam is RED against the shipped answer", () => {
  // RED-before proof for the cell above: a naive `bodySha256: ""` (the exact
  // pre-fix defect) must NOT satisfy the assertion the previous test makes.
  const shipped = { version: "clara-beta-2026-08-a", bodySha256: bodyHash("Beta text.") };
  const mutant = { version: "clara-beta-2026-08-a", bodySha256: "" };
  assert.notDeepEqual(mutant, shipped);
});

test("a document that WOULD sign (kind:'signed') is never fabricated by this seam's production default", async () => {
  const { signDpa } = await import("../../lib/registration/dpa-doors");
  const outcome = await signDpa({ version: "any", bodySha256: bodyHash("any") });
  assert.deepEqual(outcome, { kind: "unavailable" });
});
