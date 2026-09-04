// CB-AE2E-004 — THE CLASS CELL. Fifteen door-dialog wrappers shared one line:
//
//     const ran = await runOnce(guardRef.current, onConfirm);
//     if (ran) setOpen(false);
//
// `ran` meant "this click was not dropped as re-entrant". It never meant "the act
// succeeded", and it could not: `act()` (lib/parts/hooks.ts) catches every
// governed refusal, routes it into err/clr, and RESOLVES. So a refused door closed
// its dialog exactly as a successful one did — taking with it the attestation, the
// reason, or the correction target the refusal was asking the human to supply.
//
// WHAT THIS FILE PROVES, at the wrapper layer rather than through any one domain:
//   1. A refused confirm leaves the dialog OPEN, with the human's typed input still
//      in the field, and the DB's own code + message rendered VERBATIM inside it.
//   2. A successful confirm closes it.
//   3. A dropped concurrent click (the single-fire guard's own job) closes nothing
//      and calls nothing twice — the MUST-NOT-RED control, since the naive
//      "close unless false" repair would have broken it.
//
// The wrapper under test is components/close/CloseDoorDialog.tsx, chosen because
// its family carries the sharpest instance (finalize's CLR41
// close_self_attestation_required names a field that lives INSIDE the dialog). All
// fifteen share the same three lines, so what is proven here is the contract, not
// one domain's copy of it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { CloseDoorDialog } from "../close/CloseDoorDialog";
import messages from "../../messages/en.json";

enableDomInspection();

type Node = { tagName?: string; value?: string; childNodes?: Node[] };

function bodyOf(): Node {
  return (globalThis as unknown as { document: { body: Node } }).document.body;
}

/** Unmount AND remove this test's own container from document.body. Every cell here
 *  appends to the shared body (base-ui portals its open dialog content there), so a
 *  cell that only unmounts leaves a detached subtree the NEXT cell's `find` walks —
 *  the shared-fixture trap this repo has paid for before. */
async function detach(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  await h.unmount();
  for (let i = 0; i < 4; i++) await h.settle();
  const body = bodyOf() as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
  if (body.childNodes?.includes(h.container)) body.removeChild(h.container);
}

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function findAllIn(root: Node, predicate: (n: Node) => boolean, out: Node[] = []): Node[] {
  if (predicate(root)) out.push(root);
  for (const c of root.childNodes ?? []) findAllIn(c, predicate, out);
  return out;
}

/** The dialog under test, with a confirm handler whose OUTCOME the caller controls
 *  and an optional standing refusal (exactly what a hydrated part hands it). */
function App(args: {
  outcome: boolean;
  refusal?: { err: string | null; clr: { code: string; reason: string | null } | null };
  onConfirm?: () => Promise<boolean>;
}) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      CloseDoorDialog,
      {
        triggerLabel: "Abandon close",
        title: "Abandon this close run",
        confirmLabel: "Abandon",
        busy: false,
        refusal: args.refusal,
        onConfirm: args.onConfirm ?? (async () => args.outcome),
      },
      createElement("textarea", { "aria-label": "reason", defaultValue: "" }),
    ),
  });
}

async function openTheDialog(h: Awaited<ReturnType<typeof renderComponent>>, body: Node) {
  (body as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
  for (let i = 0; i < 2; i++) await h.settle();
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Abandon close"));
  assert.ok(trigger, "the trigger must render");
  await h.fireEvent(trigger as never, "click");
  for (let i = 0; i < 6; i++) await h.settle();
  return trigger;
}

/** The dialog's OWN confirm button, identified by exclusion from the trigger —
 *  the identity idiom this repo already uses, never a string match alone. */
function confirmIn(body: Node, trigger: unknown): Node | null {
  return findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Abandon" && (n as unknown) !== trigger);
}

test("CB-AE2E-004: a REFUSED confirm keeps the dialog open, keeps the typed input, and shows the refusal VERBATIM inside it", async () => {
  const h = await renderComponent(
    App({
      outcome: false,
      refusal: { err: "this close run is already abandoned", clr: { code: "CLR41", reason: "close_not_in_progress" } },
    }),
  );
  const body = bodyOf();
  try {
    const trigger = await openTheDialog(h, body);

    const reason = findIn(body, (n) => n.tagName === "TEXTAREA");
    assert.ok(reason, "the in-dialog field must be reachable");
    await h.act(() => setFieldValue(reason as never, "the client sent a corrected statement"));
    for (let i = 0; i < 2; i++) await h.settle();

    const confirm = confirmIn(body, trigger);
    assert.ok(confirm, "the dialog's own Confirm must be reachable, distinct from the trigger");
    await h.act(() => clickButton(confirm as never));
    for (let i = 0; i < 6; i++) await h.settle();

    // (1) STILL OPEN.
    assert.ok(confirmIn(body, trigger), "a refused act must NOT close the dialog");
    // (2) THE INPUT SURVIVED.
    assert.equal(
      (findIn(body, (n) => n.tagName === "TEXTAREA") as unknown as { value: string }).value,
      "the client sent a corrected statement",
      "the human's typed reason must still be in the field the refusal is asking them to correct",
    );
    // (3) THE REFUSAL IS READABLE WHERE THEY ARE — inside the dialog, not on the
    //     page behind a modal backdrop.
    const text = textOf(body as never);
    assert.match(text, /CLR41/, "the DB's own code renders verbatim");
    assert.match(text, /close_not_in_progress/, "…with its reason");
    assert.match(text, /this close run is already abandoned/, "…and its message, never re-worded");
  } finally {
    await detach(h);
  }
});

test("CB-AE2E-004: a SUCCESSFUL confirm closes the dialog — the discriminating other half", async () => {
  const h = await renderComponent(App({ outcome: true }));
  const body = bodyOf();
  try {
    const trigger = await openTheDialog(h, body);
    const confirm = confirmIn(body, trigger);
    assert.ok(confirm, "the dialog's own Confirm must be reachable");
    await h.act(() => clickButton(confirm as never));
    for (let i = 0; i < 6; i++) await h.settle();

    assert.equal(confirmIn(body, trigger), null, "an accepted act must close the dialog");
  } finally {
    await detach(h);
  }
});

test("CB-AE2E-004: with no `refusal` passed, a refused act still keeps the dialog open (the prop is optional, the law is not)", async () => {
  const h = await renderComponent(App({ outcome: false }));
  const body = bodyOf();
  try {
    const trigger = await openTheDialog(h, body);
    const confirm = confirmIn(body, trigger);
    assert.ok(confirm);
    await h.act(() => clickButton(confirm as never));
    for (let i = 0; i < 6; i++) await h.settle();
    assert.ok(confirmIn(body, trigger), "the close decision reads the OUTCOME, never the presence of a refusal prop");
    // …and nothing is invented in place of the refusal the caller did not hand it.
    assert.equal(findAllIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Abandon").length, 1);
  } finally {
    await detach(h);
  }
});

// MUST-NOT-RED CONTROL. The single-fire guard's own job is unchanged, and the
// obvious "repair" that keeps the default-close behaviour (`if (outcome !== false)
// setOpen(false)`) would silently reintroduce the class defect for every handler
// that reports nothing. This cell pins the re-entrancy half so a future edit cannot
// trade one for the other: two clicks in the same tick call the door ONCE.
test("CB-AE2E-004 control: a concurrent second click is still dropped — exactly one governed call", async () => {
  let calls = 0;
  let release!: (v: boolean) => void;
  const h = await renderComponent(
    App({
      outcome: true,
      onConfirm: () => {
        calls += 1;
        return new Promise<boolean>((resolve) => {
          release = resolve;
        });
      },
    }),
  );
  const body = bodyOf();
  try {
    const trigger = await openTheDialog(h, body);
    const confirm = confirmIn(body, trigger);
    assert.ok(confirm);

    // Both clicks fire before the first resolves — the guard's whole reason to exist.
    const first = h.act(() => clickButton(confirm as never));
    const second = h.act(() => clickButton(confirm as never));
    assert.equal(calls, 1, "the door must have been called exactly once");

    release(true);
    await first;
    await second;
    for (let i = 0; i < 6; i++) await h.settle();
    assert.equal(calls, 1, "still exactly one governed call after both settle");
  } finally {
    await detach(h);
  }
});
