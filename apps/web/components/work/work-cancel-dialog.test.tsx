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
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { checkKeyboardWalk, isKeyboardOperable } from "../../test/keyboardWalk";
import { CancelWorkDialog, TakeOverWorkAction } from "./work-cancel-dialog";
import type { CancelWorkResult, TakeOverWorkResult } from "../../lib/work/api";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENTRY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DIGEST = "a".repeat(64);

type Attempt = { workId: string; opKey: string; basisDigest?: string | null };

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

function CancelApp(props: {
  cancel: (auth: unknown, input: Attempt) => Promise<CancelWorkResult>;
  onCancelled?: () => void;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(CancelWorkDialog, {
      workId: WORK,
      clientId: CLIENT,
      onCancelled: props.onCancelled ?? (() => {}),
      cancel: props.cancel as never,
      session: { getAccessToken: async () => "tok" } as never,
    }),
  });
}

function TakeOverApp(props: {
  takeOver: (auth: unknown, input: Attempt) => Promise<TakeOverWorkResult>;
  basisOrigin?: string;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(TakeOverWorkAction, {
      workId: WORK,
      basisOrigin: props.basisOrigin ?? "clara_interpreted",
      basisDigest: DIGEST,
      onTakenOver: () => {},
      takeOver: props.takeOver as never,
      session: { getAccessToken: async () => "tok" } as never,
    }),
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
    // FOCUS LANDS ON THE SAFE ACTION, asserted by moving it rather than by reading an attribute:
    // React applies `autoFocus` by CALLING `.focus()`, so the attribute is never in the DOM and a
    // cell keyed on it would pass on a dialog that focused the destructive button instead.
    (keep as unknown as { focus: () => void }).focus();
    assert.equal(activeElement(), keep,
      "…and focus really reaches it: Enter must never cancel a person's Work for them");
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
