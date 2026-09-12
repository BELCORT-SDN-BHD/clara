// THE LEGAL STAGE (#621) — GATE (b) and GATE (c) folded into one file, the same
// call the retired single-document DPA step's own test file made: the stage has
// few enough controls that a separate keyboard file would be one assertion
// repeated with a different import.
//
// WHAT EVERY CELL BELOW IS ACTUALLY AIMED AT: the five faces a document can
// wear, the three that must NOT carry an acceptance control, the gate that
// decides whether checkout is reachable at all, and the op-key contract that
// makes a resubmit after a lost response a replay rather than a second record.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { activeElement, enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import type { AcceptLegalDocument, AcceptLegalDocumentOutcome, AcceptLegalDocumentParams } from "../../lib/registration/legal-doors";
import type { LegalDocumentFace, LegalStageState } from "../../lib/registration/legal-reads";
import { SignupLegalStage } from "./signup-legal-stage";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node; getAttribute?: (n: string) => string | null };

type Router = { refreshes: number };

function App(node: ReactElement, router: Router) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      {
        value: {
          replace: () => {},
          refresh: () => { router.refreshes += 1; },
          push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
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
function findAll(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  (function walk(n: Node) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}
const byButtonText = (re: RegExp) => (n: Node) => n.tagName === "BUTTON" && re.test(textOf(n as never));
const byLinkText = (re: RegExp) => (n: Node) => n.tagName === "A" && re.test(textOf(n as never));
const attr = (n: Node, name: string) => (typeof n.getAttribute === "function" ? n.getAttribute(name) : null);

/** The DB's own posture (`ck_legal_documents_body_sha`): `body_sha256 =
 *  encode(sha256(convert_to(body,'UTF8')),'hex')` on a `text` column, so
 *  PostgREST renders PLAIN LOWERCASE HEX — never the prefixed form, which is
 *  `bytea`'s wire shape and belonged to the retired `dpa_documents` column.
 *  Computed here rather than hand-typed so the fixture is a REAL hash of the
 *  body it accompanies — a placeholder would let a "forwards whatever is in
 *  the fixture" bug pass as easily as a correct implementation. */
function bodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

const TERMS_BODY = "Clara beta terms of service. Clause one.";
const DPA_BODY = "Clara beta data processing agreement. Clause one.";

function doc(over: Partial<LegalDocumentFace> & Pick<LegalDocumentFace, "kind" | "face">): LegalDocumentFace {
  const body = over.kind === "terms" ? TERMS_BODY : DPA_BODY;
  const base = {
    title: over.kind === "terms" ? "Clara Terms of Service" : "Clara Data Processing Agreement",
    version: 3,
    body,
    bodySha256: bodyHash(body),
    effectiveFrom: "2026-09-01T00:00:00.000Z",
  };
  if (over.face === "absent") return { kind: over.kind, face: "absent" };
  if (over.face === "accepted") {
    return {
      ...base,
      ...over,
      face: "accepted",
      acceptedAt: (over as { acceptedAt?: string }).acceptedAt ?? "2026-09-02T04:30:00.000Z",
      acceptedVersion: (over as { acceptedVersion?: number }).acceptedVersion ?? base.version,
    } as LegalDocumentFace;
  }
  return { ...base, ...over } as LegalDocumentFace;
}

const ready = (documents: LegalDocumentFace[]): LegalStageState => ({ kind: "ready", documents });

const bothPublished = () => ready([doc({ kind: "terms", face: "acceptable" }), doc({ kind: "dpa", face: "acceptable" })]);
const bothAccepted = () => ready([doc({ kind: "terms", face: "accepted" }), doc({ kind: "dpa", face: "accepted" })]);

function recordingAccept(
  answer: AcceptLegalDocumentOutcome | ((call: number) => AcceptLegalDocumentOutcome),
): { accept: AcceptLegalDocument; calls: AcceptLegalDocumentParams[] } {
  const calls: AcceptLegalDocumentParams[] = [];
  const accept: AcceptLegalDocument = async (params) => {
    calls.push(params);
    return typeof answer === "function" ? answer(calls.length) : answer;
  };
  return { accept, calls };
}

async function mount(state: LegalStageState, accept?: AcceptLegalDocument) {
  const router: Router = { refreshes: 0 };
  const h = await renderComponent(
    App(createElement(SignupLegalStage, accept ? { state, accept } : { state }), router),
  );
  for (let i = 0; i < 2; i++) await h.settle();
  return { h, router };
}

/** The checkout control is a REAL form POST and nothing else counts as one. */
function checkoutForm(root: Node): Node | null {
  return findIn(root, (n) =>
    n.tagName === "FORM" && attr(n, "action") === "/checkout" && (attr(n, "method") ?? "").toLowerCase() === "post");
}

test("BOTH PUBLISHED, NEITHER ACCEPTED: two cards, two controls, and NO way to checkout", async () => {
  const { h } = await mount(bothPublished());
  try {
    const text = textOf(h.container as never);
    assert.match(text, /Clara Terms of Service/);
    assert.match(text, /Clara Data Processing Agreement/);
    assert.match(text, new RegExp(TERMS_BODY.slice(0, 20)));
    assert.match(text, new RegExp(DPA_BODY.slice(0, 20)));
    // The version and the effective date are on the card, not only in the body.
    assert.match(text, /Version 3, in effect from 2026-09-01/);

    const controls = findAll(h.container as never, byButtonText(/I have read and accept/i));
    assert.equal(controls.length, 2, "one acceptance control per agreement, and no more");
    assert.match(textOf(controls[0] as never), /Terms of Service/);
    assert.match(textOf(controls[1] as never), /Data Processing Agreement/);

    assert.equal(checkoutForm(h.container as never), null, "checkout was reachable with nothing accepted");
    assert.match(text, /Both agreements have to be accepted before checkout opens/);

    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
    // Every control the stage offers is keyboard-reachable, including the
    // scrollable text region (WCAG 2.1.1 — a region that scrolls must be
    // reachable by keyboard).
    const focusable = focusableElements(h.container as never);
    for (const control of controls) assert.ok(focusable.includes(control as never));
    const regions = findAll(h.container as never, (n) => attr(n, "role") === "region");
    assert.equal(regions.length, 2, "each agreement's text must be its own labelled region");
    for (const region of regions) {
      assert.ok(focusable.includes(region as never), "a scrollable agreement region is not keyboard-reachable");
      assert.match(attr(region, "aria-label") ?? "", /full text/);
    }
  } finally {
    await h.unmount();
  }
});

test("ACCEPTING ONE DOES NOT OPEN CHECKOUT; accepting BOTH does, through a real POST form", async () => {
  const { accept, calls } = recordingAccept({
    kind: "accepted", documentKind: "terms", version: 3, acceptedAt: "2026-09-02T04:30:00.000Z", replay: false,
  });
  const { h, router } = await mount(bothPublished(), accept);
  try {
    await clickButton(findIn(h.container as never, byButtonText(/accept the Terms of Service/i)) as never);
    for (let i = 0; i < 4; i++) await h.settle();

    // THE BINDING: the hash sent is the hash of the bytes THIS RENDER showed.
    assert.deepEqual(calls.map((c) => ({ kind: c.documentKind, version: c.version, hash: c.bodySha256 })), [
      { kind: "terms", version: 3, hash: bodyHash(TERMS_BODY) },
    ]);
    assert.ok(calls[0]?.opKey, "accept_legal_document's required p_op_key was sent empty");

    const text = textOf(h.container as never);
    assert.match(text, /Accepted on .*version 3/s);
    // HYDRATE-NEVER-TRUST: the door reported; the server is re-read.
    assert.equal(router.refreshes, 1, "a recorded acceptance did not re-read the authoritative state");
    // ONE of two. The gate stays shut.
    assert.equal(checkoutForm(h.container as never), null, "one acceptance opened checkout");
    assert.equal(
      findAll(h.container as never, byButtonText(/I have read and accept/i)).length,
      1,
      "the accepted agreement still offers its control",
    );
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("FOCUS LANDS ON THE RECEIPT, never on <body> and never past it onto the next control", async () => {
  // The defect: accepting REMOVES the control that was just pressed, so the
  // browser drops focus on `<body>` and a keyboard user restarts at the top of
  // the page with no announcement of what happened.
  //
  // THE RULE THIS PINS (`signup-legal-stage.tsx`'s own header owns it): focus
  // moves to THAT agreement's accepted banner — the receipt carrying the
  // timestamp and version — and deliberately NOT to the other agreement's
  // control, even though that is the next thing to do. Reading what you just
  // signed comes before being asked to sign the next one; the control is one
  // Tab away in DOM order.
  const { accept } = recordingAccept({
    kind: "accepted", documentKind: "terms", version: 3, acceptedAt: "2026-09-02T04:30:00.000Z", replay: false,
  });
  const { h } = await mount(bothPublished(), accept);
  try {
    const other = findIn(h.container as never, byButtonText(/accept the Data Processing Agreement/i));
    await clickButton(findIn(h.container as never, byButtonText(/accept the Terms of Service/i)) as never);
    for (let i = 0; i < 6; i++) await h.settle();

    const focused = activeElement() as Node | null;
    assert.ok(focused, "nothing holds focus after an acceptance");
    assert.notEqual((focused as { tagName?: string }).tagName, "BODY",
      "focus was dumped on <body> when the control was replaced");
    assert.match(textOf(focused as never), /Accepted on .*version 3/s,
      "focus did not land on the receipt for the agreement that was just accepted");
    // Focusable, but NOT in the tab order — a destination focus is sent to.
    assert.equal(attr(focused as Node, "tabindex") ?? attr(focused as Node, "tabIndex"), "-1");
    assert.equal(
      focusableElements(h.container as never).includes(focused as never),
      false,
      "the receipt joined the tab order instead of being a programmatic target only",
    );
    // AND NOT THE NEXT CONTROL — which is still there, still offered.
    assert.ok(other, "the other agreement's control vanished");
    assert.notEqual(focused, other, "focus skipped past the receipt onto the next control");
    assert.ok(findIn(h.container as never, byButtonText(/accept the Data Processing Agreement/i)));
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("BOTH ACCEPTED ON THE SERVER: persistent receipts, no controls, and the real checkout POST", async () => {
  const { h } = await mount(bothAccepted());
  try {
    const receipts = textOf(h.container as never).match(/Accepted on /g) ?? [];
    assert.equal(receipts.length, 2, "each agreement must carry its own persistent acceptance receipt");
    assert.equal(
      findAll(h.container as never, byButtonText(/I have read and accept/i)).length,
      0,
      "an accepted agreement still offers an acceptance control",
    );
    const form = checkoutForm(h.container as never);
    assert.ok(form, "both accepted, and there is still no way to checkout");
    const submit = findIn(form as Node, byButtonText(/Continue to checkout/i));
    assert.ok(submit, "the checkout form carries no submit control");
    assert.ok(focusableElements(h.container as never).includes(submit as never));
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("A DRAFT IS NEVER SIGNED AND NEVER PRESENTED AS FINAL", async () => {
  const { h } = await mount(
    ready([doc({ kind: "terms", face: "draft" }), doc({ kind: "dpa", face: "accepted" })]),
  );
  try {
    const text = textOf(h.container as never);
    assert.match(text, /Not final/i, "a draft agreement is not labelled as unfinished");
    assert.match(text, /can't be accepted until it is published/i);
    // The text is still SHOWN — a preview is the point — but the region's own
    // accessible name says what it is, so the fact reaches somebody who never
    // sees the note.
    assert.match(text, new RegExp(TERMS_BODY.slice(0, 20)));
    const draftRegion = findIn(h.container as never, (n) =>
      attr(n, "role") === "region" && /draft preview/i.test(attr(n, "aria-label") ?? ""));
    assert.ok(draftRegion, "the draft's text is not labelled as a draft preview");

    // NO CONTROL, and no checkout — the DB would refuse the acceptance anyway
    // (CLR09 / not_published); the UI must not offer what the door refuses.
    assert.equal(
      findAll(h.container as never, byButtonText(/I have read and accept the Terms of Service/i)).length,
      0,
      "a draft agreement offered an acceptance control",
    );
    assert.equal(checkoutForm(h.container as never), null, "a draft agreement opened checkout");
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("AN ABSENT AGREEMENT says so, offers nothing to accept, and closes checkout", async () => {
  const { h } = await mount(
    ready([doc({ kind: "terms", face: "accepted" }), { kind: "dpa", face: "absent" }]),
  );
  try {
    const text = textOf(h.container as never);
    assert.match(text, /The Data Processing Agreement isn't available yet/);
    assert.equal(findAll(h.container as never, byButtonText(/accept the Data Processing/i)).length, 0);
    assert.equal(checkoutForm(h.container as never), null, "an absent agreement opened checkout");
    assert.ok(findIn(h.container as never, byLinkText(/registration status/i)), "no way back");
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("A SUPERSEDED VERSION is its own honest state, told apart from a draft", async () => {
  const { h } = await mount(
    ready([doc({ kind: "terms", face: "superseded" }), doc({ kind: "dpa", face: "acceptable" })]),
  );
  try {
    const text = textOf(h.container as never);
    assert.match(text, /no longer current/i);
    assert.doesNotMatch(text, /Not final/i, "a superseded version was described as a draft");
    assert.equal(findAll(h.container as never, byButtonText(/accept the Terms of Service/i)).length, 0);
    assert.equal(checkoutForm(h.container as never), null);
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("A STALE REFUSAL is persistent, carries the DB's own code and sentence, and re-reads", async () => {
  for (const reason of ["stale_version", "hash_mismatch"] as const) {
    const code = reason === "stale_version" ? "CLR09" : "CLR10";
    const { accept, calls } = recordingAccept({
      kind: "refused", code, reason, message: `the door said: ${reason}`, stale: true,
    });
    const { h, router } = await mount(bothPublished(), accept);
    try {
      await clickButton(findIn(h.container as never, byButtonText(/accept the Terms of Service/i)) as never);
      for (let i = 0; i < 4; i++) await h.settle();

      const text = textOf(h.container as never);
      assert.match(text, /This agreement changed while you had it open/);
      assert.match(text, new RegExp(`the door said: ${reason}`), "the DB's own sentence was re-worded");
      assert.match(text, new RegExp(code), "the refusal's own CLR code is not rendered");
      // A stale answer means the text on screen moved: re-read, do not retry.
      assert.equal(router.refreshes, 1, `${reason} did not re-read the documents`);
      assert.equal(calls.length, 1, "the component retried a governed refusal on its own");
      // The control stays live — the person accepts the version they are now
      // being shown, rather than being stranded.
      assert.ok(findIn(h.container as never, byButtonText(/accept the Terms of Service/i)));
      assert.equal(checkoutForm(h.container as never), null);
      assert.deepEqual(checkAccessibility(h.container as never), []);
      assert.deepEqual(checkKeyboardWalk(h.container as never), []);
    } finally {
      await h.unmount();
    }
  }
});

test("A NON-STALE REFUSAL renders verbatim WITHOUT the 'it changed' title and without a re-read", async () => {
  const { accept } = recordingAccept({
    kind: "refused", code: "CLR09", reason: "not_published", message: "that version is not published", stale: false,
  });
  const { h, router } = await mount(bothPublished(), accept);
  try {
    await clickButton(findIn(h.container as never, byButtonText(/accept the Terms of Service/i)) as never);
    for (let i = 0; i < 4; i++) await h.settle();
    const text = textOf(h.container as never);
    assert.match(text, /that version is not published/);
    assert.doesNotMatch(text, /changed while you had it open/);
    assert.equal(router.refreshes, 0);
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("A LOST RESPONSE RESUBMITS UNDER THE SAME OP KEY, and the door's replay says so once", async () => {
  const { accept, calls } = recordingAccept((call) =>
    call === 1
      ? { kind: "unavailable" }
      : {
          kind: "accepted", documentKind: "terms", version: 3,
          acceptedAt: "2026-09-02T04:30:00.000Z", replay: true,
        });
  const { h } = await mount(bothPublished(), accept);
  try {
    const control = findIn(h.container as never, byButtonText(/accept the Terms of Service/i));
    await clickButton(control as never);
    for (let i = 0; i < 4; i++) await h.settle();
    assert.match(textOf(h.container as never), /couldn't record your acceptance just now/i);
    assert.doesNotMatch(textOf(h.container as never), /Accepted on/, "an unavailable answer painted a receipt");

    await clickButton(findIn(h.container as never, byButtonText(/accept the Terms of Service/i)) as never);
    for (let i = 0; i < 4; i++) await h.settle();

    assert.equal(calls.length, 2, "the retry never reached the door");
    assert.equal(
      calls[1]?.opKey,
      calls[0]?.opKey,
      "the retry of the SAME attempt minted a NEW op key — a lost response would double-record",
    );
    const text = textOf(h.container as never);
    assert.match(text, /Accepted on/);
    assert.match(text, /You had already accepted this version/);
    // The failure banner is gone once the attempt actually landed.
    assert.doesNotMatch(text, /couldn't record your acceptance just now/i);
  } finally {
    await h.unmount();
  }
});

test("A NEW VERSION IS A NEW ATTEMPT: the op key is minted per (kind, version), not per mount", async () => {
  const { accept, calls } = recordingAccept({ kind: "unavailable" });
  const { h } = await mount(bothPublished(), accept);
  try {
    await clickButton(findIn(h.container as never, byButtonText(/accept the Terms of Service/i)) as never);
    for (let i = 0; i < 4; i++) await h.settle();
    // The same mount, a document that moved to a new version under the reader —
    // exactly what a `stale_version` re-read produces.
    await h.rerender(
      App(
        createElement(SignupLegalStage, {
          state: ready([
            { ...(doc({ kind: "terms", face: "acceptable" }) as LegalDocumentFace), version: 4 } as LegalDocumentFace,
            doc({ kind: "dpa", face: "acceptable" }),
          ]),
          accept,
        }),
        { refreshes: 0 },
      ),
    );
    for (let i = 0; i < 2; i++) await h.settle();
    await clickButton(findIn(h.container as never, byButtonText(/accept the Terms of Service/i)) as never);
    for (let i = 0; i < 4; i++) await h.settle();

    assert.equal(calls.length, 2);
    assert.equal(calls[1]?.version, 4);
    assert.notEqual(
      calls[1]?.opKey,
      calls[0]?.opKey,
      "a DIFFERENT version reused the previous attempt's op key — a replay of the wrong acceptance",
    );
  } finally {
    await h.unmount();
  }
});

test("AN UNREADABLE STAGE accepts nothing, offers no checkout, and still offers a way out", async () => {
  const { h } = await mount({ kind: "unavailable" });
  try {
    const text = textOf(h.container as never);
    assert.match(text, /We couldn't read the agreements/);
    assert.match(text, /Nothing was accepted/);
    assert.equal(findAll(h.container as never, byButtonText(/accept/i)).length, 0);
    assert.equal(checkoutForm(h.container as never), null, "an unreadable stage opened checkout");
    const back = findIn(h.container as never, byLinkText(/registration status/i));
    assert.ok(back, "the unavailable state must still offer a way back");
    assert.ok(focusableElements(h.container as never).includes(back as never));
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("THE PENDING SUBMIT IDENTITY IS THE CONTROL'S OWN — one card's wait never disables the other", async () => {
  // Held in an OBJECT rather than a `let`: TypeScript's control-flow analysis
  // narrows a `let` assigned only inside a Promise executor to `never` at the
  // later call site, and widening the type by hand would hide a real error.
  const inflight: { release?: (outcome: AcceptLegalDocumentOutcome) => void } = {};
  const accept: AcceptLegalDocument = async () =>
    new Promise<AcceptLegalDocumentOutcome>((resolve) => { inflight.release = resolve; });
  const { h } = await mount(bothPublished(), accept);
  try {
    await clickButton(findIn(h.container as never, byButtonText(/accept the Terms of Service/i)) as never);
    await h.settle();
    const pending = findIn(h.container as never, byButtonText(/Recording your acceptance/i));
    assert.ok(pending, "the pressed control does not say it is working");
    assert.equal((pending as { disabled?: boolean }).disabled, true, "the pressed control is still pressable");
    const other = findIn(h.container as never, byButtonText(/accept the Data Processing Agreement/i));
    assert.ok(other, "the OTHER agreement's control vanished while its sibling was submitting");
    assert.notEqual((other as { disabled?: boolean }).disabled, true, "one card's submit disabled the other's");
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    inflight.release?.({ kind: "unavailable" });
    await h.settle();
    await h.unmount();
  }
});
