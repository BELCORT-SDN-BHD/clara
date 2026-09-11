// #630 — THE CANCEL DIALOG AND THE TAKEOVER CONFIRM, mounted.
//
// WHAT ONLY A MOUNTED DIALOG CAN PROVE, and each has its own cell:
//   1. OPENING IT IS NOT THE ACT. The trigger opens a question; the confirm is the only thing that
//      reaches the door. A destructive control that fired on the trigger would cancel somebody's
//      Work the moment they looked at it.
//   2. THE SAFE ACTION HOLDS INITIAL FOCUS, so a keyboard user pressing Enter keeps their Work.
//   3. THE ANSWER IS FOUR THINGS, and the one that must never be misread is `already_completed`:
//      the operation won the race, an entry exists, and the surface links to it rather than
//      reporting a cancellation that did not happen.
//   4. AN UNOBSERVED OUTCOME KEEPS THE DIALOG OPEN AND KEEPS THE OP KEY — the retry must be the
//      SAME operation to the database, never a second question it cannot connect to the first.
//   5. AN INTERPRETED BASIS ASKS BEFORE IT ACTS, and sends the digest of what was read.
//
// THE DIALOG IS PORTALLED to `document.body`, which a delegation root never reaches — so every
// search here walks the body, exactly as attach-evidence-dialog.test.tsx does.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, useState, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { checkKeyboardWalk, isKeyboardOperable } from "../../test/keyboardWalk";
import { CancelOutcome, CancelWorkDialog, TakeOverOutcome, TakeOverWorkAction } from "./work-cancel-dialog";
import type { CancelWorkResult, TakeOverWorkResult } from "../../lib/work/api";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENTRY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DIGEST = "a".repeat(64);

type Attempt = { workId: string; opKey: string; basisDigest?: string | null };

/** One attribute off a stub node — the house form (`p6-3-a11y.test.tsx`'s own helper). */
const attrOf = (n: Stub, name: string): string | null =>
  typeof n.getAttribute === "function" ? (n.getAttribute as (k: string) => string | null)(name) : null;

function findIn(root: Stub, predicate: (n: Stub) => boolean): Stub | null {
  if (predicate(root)) return root;
  for (const c of ((root.childNodes as Stub[] | undefined) ?? [])) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function bodyNode(): Stub {
  return (globalThis as unknown as { document: { body: Stub } }).document.body;
}

function bodyText(): string {
  return textOf(bodyNode() as never);
}

function buttonIn(label: string): Stub | null {
  return findIn(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === label);
}

async function drain(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  for (let i = 0; i < 6; i++) await h.settle();
}

/** The PAGE's own shape: the dialog hands its answer up and the page renders it, which is what
 *  keeps an `already_completed` receipt on screen after the trigger has unmounted. Mirrored here so
 *  these cells drive the composition the product actually ships. */
function CancelHost(props: {
  cancel: (auth: unknown, input: Attempt) => Promise<CancelWorkResult>;
  onCancelled?: () => void;
}): ReactElement {
  const [answer, setAnswer] = useState<CancelWorkResult | null>(null);
  return createElement(
    "div",
    null,
    createElement(CancelWorkDialog, {
      workId: WORK,
      clientId: CLIENT,
      onCancelled: props.onCancelled ?? (() => {}),
      onAnswer: setAnswer,
      cancel: props.cancel as never,
      session: { getAccessToken: async () => "tok" } as never,
    }),
    createElement(CancelOutcome, { result: answer, clientId: CLIENT }),
  );
}

function CancelApp(props: {
  cancel: (auth: unknown, input: Attempt) => Promise<CancelWorkResult>;
  onCancelled?: () => void;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(CancelHost, props),
  });
}

/** The page's own shape again: the offer hands its answer up and the PAGE renders it, which is what
 *  keeps "You are responsible for this Work" on screen after the Work goes `queued` and the offer
 *  itself unmounts. */
/** The interpreted basis a colleague is being asked to take responsibility for — the FIGURES, not
 *  a hash of them. Cents are integers, as the column is. */
const BASIS = {
  posting_date: "2026-09-01",
  memo: "office rent paid from Maybank",
  currency: "MYR",
  lines: [
    { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
    { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "Maybank" },
  ],
};

function TakeOverHost(props: {
  takeOver: (auth: unknown, input: Attempt) => Promise<TakeOverWorkResult>;
  basisOrigin?: string;
  basis?: unknown;
  returnFocusTo?: string;
}): ReactElement {
  const [answer, setAnswer] = useState<TakeOverWorkResult | null>(null);
  return createElement(
    "div",
    null,
    createElement(TakeOverWorkAction, {
      workId: WORK,
      basisOrigin: props.basisOrigin ?? "clara_interpreted",
      basisDigest: DIGEST,
      basis: (props.basis === undefined ? BASIS : props.basis) as never,
      accountNames: new Map([["6100", "Rent expense"], ["1100", "Maybank current"]]),
      onTakenOver: () => {},
      onAnswer: setAnswer,
      returnFocusTo: props.returnFocusTo,
      takeOver: props.takeOver as never,
      session: { getAccessToken: async () => "tok" } as never,
    }),
    createElement(TakeOverOutcome, { result: answer }),
  );
}

function TakeOverApp(props: {
  takeOver: (auth: unknown, input: Attempt) => Promise<TakeOverWorkResult>;
  basisOrigin?: string;
  basis?: unknown;
  returnFocusTo?: string;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(TakeOverHost, props),
  });
}

/** The rail's own composition: the SAME outcome component, mounted with `silent`. */
function SilentOutcomeApp(result: CancelWorkResult): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement("div", null, createElement(CancelOutcome, { result, clientId: CLIENT, silent: true })),
  });
}

/** Mount into `document.body` so the portal's content is reachable, then press the trigger. */
async function openCancel(h: Awaited<ReturnType<typeof renderComponent>>, label = "Cancel Work"): Promise<void> {
  const body = bodyNode();
  (body as { appendChild: (n: unknown) => void }).appendChild(h.container);
  await h.settle();
  const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).includes(label));
  assert.ok(trigger, `the ${label} trigger must render`);
  await h.act(async () => {
    await clickButton(trigger as never);
  });
  await drain(h);
}

const STOPPING: CancelWorkResult = {
  kind: "answered", workId: WORK, taskId: "t1", status: "stopping", cancelled: true,
  reason: null, receiptId: null, entryId: null, cancelledBy: "u1", cancelledAt: "2026-09-11T00:00:00.000Z", replayed: false,
};

test("630d: opening the dialog calls NOTHING, and the safe action holds initial focus", async () => {
  const seen: Attempt[] = [];
  const h = await renderComponent(CancelApp({ cancel: async (_a, i) => { seen.push(i); return STOPPING; } }));
  try {
    await openCancel(h);
    assert.equal(seen.length, 0, "a destructive control must not fire on the control that reveals it");
    assert.match(bodyText(), /Cancel this Work\?/, "the question is a Title, not a sentence in a body");
    assert.match(bodyText(), /Anything already recorded stays recorded/,
      "what STAYS is said before what stops — the one thing a person needs before they press it");
    const keep = buttonIn("Keep it running");
    const confirm = buttonIn("Cancel this Work");
    assert.ok(keep, "the safe action exists and is reachable");
    assert.ok(confirm, "…and so does the destructive one");
    assert.equal(isKeyboardOperable(keep as never), true, "the safe action is a real, focusable control");
    assert.equal(isKeyboardOperable(confirm as never), true);
    // FOCUS LANDS ON THE SAFE ACTION, AND THIS CELL DOES NOT PUT IT THERE. An earlier cut called
    // `keep.focus()` and then asserted `activeElement() === keep` — an assertion that cannot fail,
    // whichever control the dialog actually focused. React applies `autoFocus` by CALLING
    // `.focus()`, and `test/domInspect.ts` records every such call on `document.activeElement`, so
    // the dialog's OWN choice is observable without the test making it. Move `autoFocus` to the
    // destructive confirm and this now goes red.
    assert.ok(activeElement() === keep,
      "the dialog itself focuses the safe action: Enter must never cancel a person's Work for them");
    assert.ok(activeElement() !== confirm, "…and never the destructive one");
    assert.deepEqual(checkKeyboardWalk(bodyNode() as never), [],
      "no tabindex-order or focus-visible violations while the dialog is open");
  } finally {
    await h.unmount();
  }
});

test("630d: the confirm is the act, and it carries ONE idempotency key per decision", async () => {
  const seen: Attempt[] = [];
  let reread = 0;
  const h = await renderComponent(
    CancelApp({ cancel: async (_a, i) => { seen.push(i); return STOPPING; }, onCancelled: () => { reread += 1; } }),
  );
  try {
    await openCancel(h);
    await h.act(async () => { await clickButton(buttonIn("Cancel this Work") as never); });
    await drain(h);
    assert.equal(seen.length, 1, "one press, one call");
    assert.equal(seen[0]!.workId, WORK);
    assert.match(seen[0]!.opKey, /^[0-9a-f-]{36}$/i);
    assert.equal(reread, 1, "and the caller RE-READS the Work — hydrate-never-trust");
  } finally {
    await h.unmount();
  }
});

test("630d: a cancel that LOST the race names the receipt and links the entry — never a cancellation", async () => {
  const h = await renderComponent(
    CancelApp({
      cancel: async () => ({
        kind: "answered", workId: WORK, taskId: "t1", status: "completed", cancelled: false,
        reason: "already_completed", receiptId: "r1", entryId: ENTRY, cancelledBy: null, cancelledAt: null, replayed: false,
      }),
    }),
  );
  try {
    await openCancel(h);
    await h.act(async () => { await clickButton(buttonIn("Cancel this Work") as never); });
    await drain(h);
    const text = bodyText();
    assert.match(text, /completed before the cancellation reached it/);
    assert.match(text, /a correction is a separate, linked operation/,
      "ARCHITECTURE §6 in the copy: a cancel never reverses a posted entry");
    const link = findIn(bodyNode(), (n) => n.tagName === "A"
      && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(ENTRY));
    assert.ok(link, "the entry that WON is one click away");
    assert.ok(!/Nothing was posted/.test(text), "and the page never says the opposite of the books");
  } finally {
    await h.unmount();
  }
});

test("630d: already_terminal is reported as a state, not an error", async () => {
  const h = await renderComponent(
    CancelApp({
      cancel: async () => ({
        kind: "answered", workId: WORK, taskId: null, status: "refused", cancelled: false,
        reason: "already_terminal", receiptId: null, entryId: null, cancelledBy: null, cancelledAt: null, replayed: false,
      }),
    }),
  );
  try {
    await openCancel(h);
    await h.act(async () => { await clickButton(buttonIn("Cancel this Work") as never); });
    await drain(h);
    assert.match(bodyText(), /Nothing to cancel/);
    assert.match(bodyText(), /had already finished when the request arrived/);
  } finally {
    await h.unmount();
  }
});

test("630d: DENIED renders a persistent banner, never a disappearing toast", async () => {
  const h = await renderComponent(CancelApp({ cancel: async () => ({ kind: "denied" }) }));
  try {
    await openCancel(h);
    await h.act(async () => { await clickButton(buttonIn("Cancel this Work") as never); });
    await drain(h);
    assert.match(bodyText(), /You cannot cancel this Work/);
    assert.match(bodyText(), /needs a bookkeeper role in this firm/);
  } finally {
    await h.unmount();
  }
});

test("630d: an UNOBSERVED outcome keeps the dialog open and REUSES the op key", async () => {
  const seen: Attempt[] = [];
  let answer: CancelWorkResult = { kind: "lost", message: "socket hang up" };
  const h = await renderComponent(CancelApp({ cancel: async (_a, i) => { seen.push(i); return answer; } }));
  try {
    await openCancel(h);
    await h.act(async () => { await clickButton(buttonIn("Cancel this Work") as never); });
    await drain(h);
    assert.match(bodyText(), /We did not hear back/);
    assert.ok(buttonIn("Cancel this Work"), "the dialog stays open so the same decision can be retried");

    answer = STOPPING;
    await h.act(async () => { await clickButton(buttonIn("Cancel this Work") as never); });
    await drain(h);
    assert.equal(seen.length, 2);
    assert.equal(seen[0]!.opKey, seen[1]!.opKey,
      "the retry is the SAME operation to the database — a fresh key would ask a second question");
  } finally {
    await h.unmount();
  }
});

test("630d: an INTERPRETED basis asks before it acts, and sends the digest of what was read", async () => {
  const seen: Attempt[] = [];
  const h = await renderComponent(
    TakeOverApp({
      takeOver: async (_a, i) => {
        seen.push(i);
        return {
          kind: "accepted", workId: WORK, taskId: "t2", logicalOpId: "op", status: "queued", replayed: false,
          responsible: "u2", previousResponsible: "u1", initiatedBy: "u1", takenOver: true,
        };
      },
    }),
  );
  try {
    await openCancel(h, "Take responsibility");
    assert.equal(seen.length, 0, "the trigger opens the confirm; it does not take responsibility");
    assert.match(bodyText(), /Clara interpreted this basis from a conversation/);
    const confirm = findIn(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).includes("take responsibility"));
    assert.ok(confirm);
    await h.act(async () => { await clickButton(confirm as never); });
    await drain(h);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.basisDigest, DIGEST, "the digest of the basis they read rides the call");
    assert.match(bodyText(), /You are responsible for this Work/);
  } finally {
    await h.unmount();
  }
});

test("630d: a USER_DIRECT basis needs no confirm step — those figures were typed by a human", async () => {
  const seen: Attempt[] = [];
  const h = await renderComponent(
    TakeOverApp({
      basisOrigin: "user_direct",
      takeOver: async (_a, i) => {
        seen.push(i);
        return {
          kind: "accepted", workId: WORK, taskId: "t2", logicalOpId: "op", status: "queued", replayed: false,
          responsible: "u2", previousResponsible: "u1", initiatedBy: "u1", takenOver: true,
        };
      },
    }),
  );
  try {
    const body = bodyNode();
    (body as { appendChild: (n: unknown) => void }).appendChild(h.container);
    await h.settle();
    await h.act(async () => { await clickButton(buttonIn("Take responsibility") as never); });
    await drain(h);
    assert.equal(seen.length, 1, "one press is the whole act");
    assert.equal(seen[0]!.basisDigest ?? null, null, "no digest is sent — there is nothing interpreted to confirm");
  } finally {
    await h.unmount();
  }
});

// ===========================================================================================
// #630 fix round — the four web findings the seven-lens review raised about this file.
// ===========================================================================================

test("630f: the confirm step RENDERS the basis it asks a colleague to take responsibility for", async () => {
  // The copy says "Read it below". Before this there was nothing below it: the component was given
  // the DIGEST — a hash — and never the figures, so the attestation the door's digest check records
  // was one nobody had the means to make. A modal is precisely what a reader cannot see past, so
  // the basis belongs inside it.
  const h = await renderComponent(TakeOverApp({ takeOver: async () => ({ kind: "denied" }) }));
  try {
    await openCancel(h, "Take responsibility");
    const text = bodyText();
    assert.match(text, /Clara interpreted this basis from a conversation/, "the ask is still stated");
    assert.match(text, /office rent paid from Maybank/, "…and the MEMO is on screen");
    assert.match(text, /6100/, "…the account codes");
    assert.match(text, /Rent expense/, "…resolved to names, as the page does it");
    assert.match(text, /1,200\.00/, "…and the amount, in the currency's own units");
  } finally {
    await h.unmount();
  }
});

/** How many times one sentence appears in the body text. A regex `match` cannot see a duplicate,
 *  which is exactly how the first cut of the cell below passed over two copies of one banner. */
function occurrences(text: string, needle: string): number {
  let n = 0;
  let at = text.indexOf(needle);
  while (at !== -1) { n += 1; at = text.indexOf(needle, at + needle.length); }
  return n;
}

test("630f: a takeover answer that keeps the modal open is rendered INSIDE the modal — ONCE", async () => {
  // `lost` does not close the dialog — the human's next act is to retry the SAME decision. Rendered
  // outside `DialogContent` it mounted behind the overlay: present in the tree, invisible and inert
  // to the person looking at a dialog that appeared to have done nothing.
  //
  // AND THE FIX FOR THAT ADDED A SECOND COPY (review round 2): `submit` handed the same answer to
  // the page through `onAnswer`, which renders the identical `UnobservedBanner`, so the sentence
  // appeared twice — once in the modal and once inert behind it — with two live regions announcing
  // it. A `match` cannot see that; a COUNT can.
  const h = await renderComponent(
    TakeOverApp({ takeOver: async () => ({ kind: "lost", message: "socket closed" }) }),
  );
  try {
    await openCancel(h, "Take responsibility");
    const confirm = findIn(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).includes("take responsibility"));
    await h.act(async () => { await clickButton(confirm as never); });
    await drain(h);
    assert.equal(occurrences(bodyText(), "We did not hear back"), 1,
      "ONE banner for one answer — the page does not paint a second copy behind the overlay");
    assert.match(bodyText(), /The handover may or may not have been recorded/,
      "…in the TAKEOVER's own words, never the cancel's");
    // …and it is inside the dialog: the dialog is still open, so its Title is still there.
    assert.match(bodyText(), /Take responsibility for this Work\?/, "the dialog stayed open");
    const dialogNode = findIn(bodyNode(), (n) => n.tagName === "DIV" && textOf(n as never).includes("Take responsibility for this Work?"));
    assert.ok(dialogNode, "the dialog element is findable");
    assert.match(textOf(dialogNode as never), /We did not hear back/,
      "…and the banner is INSIDE it, not stranded behind the overlay");

    // …AND THE ANSWER SURVIVES THE DISMISSAL. Closing the modal is the moment the page becomes the
    // only surface left; an answer nobody observed must not disappear because somebody pressed Esc.
    const close = findIn(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Not now");
    assert.ok(close, "the dialog's own dismissal");
    await h.act(async () => { await clickButton(close as never); });
    await drain(h);
    assert.equal(occurrences(bodyText(), "We did not hear back"), 1,
      "still exactly one — handed to the page as the modal let go of it");
  } finally {
    await h.unmount();
  }
});

test("630f: an ACCEPTED takeover hands focus to the named landmark, because its offer unmounts", async () => {
  // `isTakeOverable` turns false the moment the Work goes `queued`, so this whole offer — trigger
  // included — leaves the document. Base UI returns focus to that trigger; with it gone, focus fell
  // to `<body>` and the next Tab restarted at the top of the page.
  // The heading lives on the PAGE, above this component, so the effect looks it up by the id both
  // sides share. The stub document has no `getElementById`; installing one is how this cell
  // observes the call the browser would make (the house pattern — work-detail.test.tsx's own
  // "THE HEADING TAKES FOCUS ON ARRIVAL").
  const doc = globalThis.document as unknown as { getElementById?: (id: string) => unknown };
  const original = doc.getElementById;
  const focused: string[] = [];
  doc.getElementById = (id: string) => ({ focus: () => focused.push(id) });
  try {
    const h = await renderComponent(
      TakeOverApp({
        takeOver: async () => ({
          kind: "accepted", workId: WORK, taskId: null, logicalOpId: null, status: "queued",
          responsible: null, previousResponsible: null, initiatedBy: null, takenOver: true, replayed: false,
        } as TakeOverWorkResult),
        returnFocusTo: "work-heading",
      }),
    );
    try {
      await openCancel(h, "Take responsibility");
      const confirm = findIn(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).includes("take responsibility"));
      await h.act(async () => { await clickButton(confirm as never); });
      await drain(h);
      await h.act(async () => { await new Promise((r) => setTimeout(r, 1)); });
      assert.deepEqual(focused, ["work-heading"],
        "focus lands on the Work's heading, not on `<body>` — the reader keeps their place");
    } finally {
      await h.unmount();
    }
  } finally {
    if (original === undefined) delete doc.getElementById;
    else doc.getElementById = original;
  }
});

test("630f: a TRANSIENT keeps the decision open and offers the same press again", async () => {
  // `workRoutes.ts` answers `409 {error:'transient'}` for a 40P01/40001 the database broke: the
  // statement NEVER RAN. Collapsing it into `conflict` told a preparer "the database refused the
  // request in the state it found" and sent them to read a Work row that is unchanged — so they
  // concluded the cancel was impossible and left the run going. The remedy is one more press, on
  // the SAME op key, which is why the dialog must not close.
  const keys: string[] = [];
  const h = await renderComponent(
    CancelApp({
      cancel: async (_auth, input) => { keys.push(input.opKey); return { kind: "transient" }; },
    }),
  );
  try {
    await openCancel(h);
    const confirm = buttonIn("Cancel this Work");
    await h.act(async () => { await clickButton(confirm as never); });
    await drain(h);
    assert.match(bodyText(), /That did not go through/, "the surface says what actually happened");
    assert.match(bodyText(), /Nothing changed/, "…and that nothing moved");
    assert.equal(/The database refused the request in the state it found/.test(bodyText()), false,
      "never the state-conflict sentence: there is no state to read");
    assert.match(bodyText(), /Cancel this Work/, "the retry affordance is the same button, still there");

    await h.act(async () => { await clickButton(buttonIn("Cancel this Work") as never); });
    await drain(h);
    assert.equal(keys.length, 2, "the second press really reached the door");
    assert.equal(keys[0], keys[1],
      "…under the SAME op key, so clara._reserve_op recognises one decision rather than two");
  } finally {
    await h.unmount();
  }
});

test("630f: a REFUSED takeover is told in the takeover's words, not the cancel's", async () => {
  const h = await renderComponent(TakeOverApp({ takeOver: async () => ({ kind: "denied" }) }));
  try {
    await openCancel(h, "Take responsibility");
    const confirm = findIn(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).includes("take responsibility"));
    await h.act(async () => { await clickButton(confirm as never); });
    await drain(h);
    assert.match(bodyText(), /You cannot take responsibility for this Work/);
    assert.equal(/You cannot cancel this Work/.test(bodyText()), false,
      "a colleague refused a HANDOVER is not told about a cancellation they never attempted");
  } finally {
    await h.unmount();
  }
});

test("630f: `silent` strips the banner's own live region — the transcript owns the announcement", async () => {
  // The rail's card lives inside `role="log" aria-live="polite"`. A banner that carries its own
  // `role="status"`/`role="alert"` in there is a NESTED live region: the DS-04 defect #629 removed
  // from this exact surface, and one `test/a11yRules.ts` refuses.
  const loud = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
      children: createElement("div", null,
        createElement(CancelOutcome, { result: { kind: "denied" } as CancelWorkResult, clientId: CLIENT })),
    }),
  );
  let loudRole: unknown = null;
  try {
    await loud.settle();
    const node = findIn(loud.container as never, (n) => attrOf(n, "role") === "alert");
    loudRole = node;
    assert.ok(node, "without `silent` the banner announces itself, as it does on a page that owns no log");
  } finally {
    await loud.unmount();
  }
  assert.ok(loudRole);

  const quiet = await renderComponent(SilentOutcomeApp({ kind: "denied" } as CancelWorkResult));
  try {
    await quiet.settle();
    const node = findIn(quiet.container as never, (n) => {
      const role = attrOf(n, "role");
      return role === "alert" || role === "status";
    });
    assert.equal(node, null, "with `silent` the banner carries no live region at all");
    assert.match(textOf(quiet.container as never), /You cannot cancel this Work/,
      "…while still saying exactly the same thing to a reader");
  } finally {
    await quiet.unmount();
  }
});

// ===========================================================================================
// #630 fix round 3 — OPENNESS IS REPORTED FROM THE STATE, NOT FROM THE HANDLER.
//
// Both surfaces that offer this control keep it mounted while a decision is open, so a poll that
// changes the Work's status cannot destroy a modal somebody is reading. That gate is only as good
// as the flag behind it: `submit` closes the dialog with a direct `setOpen(false)`, which does NOT
// run Base UI's `onOpenChange` — and a caller told only by that handler believed the decision was
// still open after an ACCEPTED cancel and went on offering "Cancel Work" on a Work that was already
// stopping. Measured in the browser walk (work-cancel-walk.spec.ts:151).
// ===========================================================================================

function GatedCancelHost(props: {
  cancel: (auth: unknown, input: Attempt) => Promise<CancelWorkResult>;
}): ReactElement {
  const [cancellable, setCancellable] = useState(true);
  const [open, setOpen] = useState(false);
  return createElement(
    "div",
    null,
    cancellable || open
      ? createElement(CancelWorkDialog, {
        workId: WORK,
        clientId: CLIENT,
        // The status change an accepted cancel produces: the page re-reads and the Work is no
        // longer cancellable.
        onCancelled: () => setCancellable(false),
        onOpenChange: setOpen,
        cancel: props.cancel as never,
        session: { getAccessToken: async () => "tok" } as never,
      })
      : null,
  );
}

test("630f: an ACCEPTED cancel closes the decision, so the control is not offered a second time", async () => {
  const h = await renderComponent(createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(GatedCancelHost, {
      cancel: async () => ({
        kind: "answered", workId: WORK, taskId: null, status: "stopping", cancelled: true,
        reason: null, receiptId: null, entryId: null, cancelledBy: null, cancelledAt: null,
        replayed: false,
      } as CancelWorkResult),
    }),
  }));
  try {
    await openCancel(h);
    assert.ok(buttonIn("Cancel this Work"), "precondition: the decision is open");
    await h.act(async () => { await clickButton(buttonIn("Cancel this Work") as never); });
    await drain(h);
    // `assert.ok(x === null)`: formatting a stub node for the failure message walks a cyclic tree
    // and exhausts the heap before the assertion is ever reported.
    assert.ok(buttonIn("Cancel Work") === null,
      "the trigger is gone: a Work that is already stopping is offered no second cancel");
    assert.equal(/Cancel this Work\?/.test(bodyText()), false, "…and the dialog is closed");
  } finally {
    await h.unmount();
  }
});
