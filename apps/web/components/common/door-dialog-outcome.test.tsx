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
// THE WRAPPER-LEVEL CELLS mount components/close/CloseDoorDialog.tsx, chosen because its
// family carries the sharpest instance (finalize's CLR41 close_self_attestation_required
// names a field that lives INSIDE the dialog).
//
// review-549 MAJOR 2: mounting ONE wrapper does not pin fifteen. The first cut of this
// fix hand-copied the predicate into every file, and `outcome.ran` and
// `outcome.value === true` both compile — so a wrapper quietly reverted to the wrong one
// stayed green here, because this file can only mount one at a time. The predicate is now
// hoisted into lib/parts/door-dialog-outcome.ts and every wrapper CALLS it, which gives a
// mutant exactly one place to land; the first three cells below pin that function
// directly, and a census cell asserts no wrapper has grown a hand-copy again.
//
// Two families that had no refusal cell of their own — journals and documents — get one
// at the end of this file, so the shared contract is also observed through a second and
// third wrapper rather than argued from one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { CloseDoorDialog } from "../close/CloseDoorDialog";
import { CloseDoors } from "../close/CloseDoors";
import type { ClosePlan } from "@/lib/close/types";
import { JournalsDoorDialog } from "../journals/JournalsDoorDialog";
import { DocumentsDoorDialog } from "../documents/DocumentsDoorDialog";
import { closeOnConfirmedOk, refusalForThisDialog } from "@/lib/parts/door-dialog-outcome";
import messages from "../../messages/en.json";

enableDomInspection();

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

// ---------------------------------------------------------------------------
// THE PREDICATE ITSELF (review-549 MAJOR 2) — pinned once, for all fifteen.
// ---------------------------------------------------------------------------

test("closeOnConfirmedOk: ONLY an explicit true closes — a refusal, a dropped click and a silent handler all keep the dialog", () => {
  assert.equal(closeOnConfirmedOk({ ran: true, value: true }), true, "the door accepted");
  assert.equal(closeOnConfirmedOk({ ran: true, value: false }), false, "the door REFUSED — the case the whole item exists for");
  assert.equal(closeOnConfirmedOk({ ran: false, value: undefined }), false, "a concurrent click the guard dropped: nothing happened");
  assert.equal(closeOnConfirmedOk({ ran: true, value: undefined }), false, "a handler that reported nothing — fail closed");
  // The two facts are not interchangeable, which is the whole defect in one line.
  assert.notEqual(
    closeOnConfirmedOk({ ran: true, value: false }),
    { ran: true, value: false }.ran,
    "`ran` says the click was not dropped; it never said the act succeeded",
  );
});

test("refusalForThisDialog: a panel-level refusal is withheld until THIS dialog has settled a confirm", () => {
  const clr = { code: "CLR41", reason: "close_not_in_progress" };
  assert.equal(refusalForThisDialog(clr, 0), undefined, "before this dialog confirms anything, the panel's refusal is somebody else's news");
  assert.equal(refusalForThisDialog(clr, 1), clr, "after it settles one, the standing refusal is its own to show");
  assert.equal(refusalForThisDialog(undefined, 3), undefined, "and nothing is invented when the caller passed none");
});

// THE CENSUS: no wrapper may grow a hand-copy of the predicate again. This is the arm
// that actually covers the other fourteen — a source read, because the defect it guards
// against is one file drifting, which no rendered tree of one component can see.
/**
 * THE ROSTER, DERIVED (review-549 nit b). A hand-typed list of fifteen paths is a second copy
 * of a fact that lives in the source, and it rots the way every hand-list rots: a SIXTEENTH
 * wrapper could be written tomorrow, hand-copy the predicate, and this census would not know
 * to look at it — which is the same "a new file appeared and nobody noticed" failure the e2e
 * ownership gate exists to prevent one directory over.
 *
 * A door-dialog wrapper IS a component that imports `runOnce` from the single-fire guard. That
 * is the definition, and it is read from disk rather than asserted.
 */
function doorDialogWrappers(): string[] {
  const found: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(join(WEB_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(rel);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
        const src = readFileSync(join(WEB_ROOT, rel), "utf8");
        if (src.includes('from "@/lib/parts/single-fire-guard"')) found.push(rel);
      }
    }
  })("components");
  return found.sort();
}

/**
 * The TWO importers that are not door dialogs, each named with its reason. Both use the guard
 * for a MENU action rather than a dialog confirm, so there is no dialog to close and no
 * outcome to read: `invite-dialog.tsx`'s resend and `member-row-menu.tsx`'s role pick.
 *
 * `SweepReceiptCard` and `V16ActCards` are deliberately NOT here. They call `actions.runOnce`
 * from `lib/parts/thread-action-coordinator.tsx` and never import the guard directly, so they
 * are structurally absent from the scan above — listing them would be a dead entry, and a dead
 * allowlist entry is how an allowlist stops being read.
 */
const NOT_DOOR_DIALOGS = [
  "components/admin/invite-dialog.tsx",
  "components/admin/member-row-menu.tsx",
];

test("MAJOR 2 census: every door-dialog wrapper calls the SHARED predicate — none re-implements it", () => {
  const importers = doorDialogWrappers();
  const wrappers = importers.filter((f) => !NOT_DOOR_DIALOGS.includes(f));

  for (const named of NOT_DOOR_DIALOGS) {
    assert.ok(
      importers.includes(named),
      `${named} is declared a non-door-dialog importer but no longer imports the guard — retire the entry`,
    );
  }
  assert.equal(wrappers.length, 15, `the scan found ${wrappers.length} wrappers:\n${wrappers.join("\n")}`);

  const missing: string[] = [];
  const handRolled: string[] = [];
  for (const file of wrappers) {
    const src = readFileSync(join(WEB_ROOT, file), "utf8");
    if (!src.includes("closeOnConfirmedOk(outcome)")) missing.push(file);
    // The hand-copy, in either polarity — comments are stripped first, so prose ABOUT the
    // defect does not read as the defect.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + " ".repeat(m.length - p1.length));
    if (/if \(outcome\.value === true\)|if \(outcome\.ran\) (?:setOpen|onOpenChange|resetAndClose)/.test(code)) {
      handRolled.push(file);
    }
  }
  assert.deepEqual(missing, [], "these wrappers do not call the shared close predicate");
  assert.deepEqual(handRolled, [], "these wrappers re-implement the predicate inline — the exact drift MAJOR 2 named");
});

// ---------------------------------------------------------------------------
// The two families that had no refusal cell of their own.
// ---------------------------------------------------------------------------

/** The same three assertions, driven through a DIFFERENT wrapper — so the contract is
 *  observed in the journals and documents families rather than inferred from close. */
async function refusedConfirmKeepsDialogOpen(
  Wrapper: typeof JournalsDoorDialog | typeof DocumentsDoorDialog,
  labels: { trigger: string; confirm: string },
): Promise<void> {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(
        Wrapper as typeof JournalsDoorDialog,
        {
          triggerLabel: labels.trigger,
          title: labels.trigger,
          confirmLabel: labels.confirm,
          busy: false,
          refusal: { err: "the entry is already approved", clr: { code: "CLR23", reason: "entry_not_draft" } },
          onConfirm: async () => false,
        },
        createElement("textarea", { "aria-label": "reason", defaultValue: "" }),
      ),
    }),
  );
  const body = bodyOf();
  try {
    (body as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes(labels.trigger));
    assert.ok(trigger, `${labels.trigger}: the trigger must render`);
    await h.fireEvent(trigger as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const reason = findIn(body, (n) => n.tagName === "TEXTAREA");
    assert.ok(reason, "the in-dialog field must be reachable");
    await h.act(() => setFieldValue(reason as never, "the client sent a correction"));
    for (let i = 0; i < 2; i++) await h.settle();

    const confirm = findIn(
      body,
      (n) => n.tagName === "BUTTON" && textOf(n as never) === labels.confirm && (n as unknown) !== trigger,
    );
    assert.ok(confirm, "the dialog's own Confirm must be reachable");
    await h.act(() => clickButton(confirm as never));
    for (let i = 0; i < 6; i++) await h.settle();

    assert.ok(
      findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === labels.confirm && (n as unknown) !== trigger),
      "a refused act must NOT close this family's dialog either",
    );
    assert.equal(
      (findIn(body, (n) => n.tagName === "TEXTAREA") as unknown as { value: string }).value,
      "the client sent a correction",
      "and the typed input survives",
    );
    const text = textOf(body as never);
    assert.match(text, /CLR23/, "the DB's own code renders verbatim inside the dialog");
    assert.match(text, /the entry is already approved/);
  } finally {
    await detach(h);
  }
}

test("MAJOR 2: the JOURNALS family obeys the shared contract — refused, open, input intact, refusal inside", async () => {
  await refusedConfirmKeepsDialogOpen(JournalsDoorDialog, { trigger: "Withdraw draft", confirm: "Withdraw" });
});

test("MAJOR 2: the DOCUMENTS family obeys the shared contract — refused, open, input intact, refusal inside", async () => {
  await refusedConfirmKeepsDialogOpen(DocumentsDoorDialog, { trigger: "Archive document", confirm: "Archive" });
});

// ---------------------------------------------------------------------------
// MAJOR 1 — one refusal object, several coexisting dialogs.
// ---------------------------------------------------------------------------
//
// A panel's `err`/`clr` is PANEL-scoped: ONE hydrated part serves every door on it. While a
// close run is in progress Finalize and Abandon are both mounted, and handing that single
// object to both painted a refusal RAISED BY FINALIZE inside Abandon's modal — and, because
// the banner takes focus when it appears, moved focus to a message about something the human
// had not just done. The same shape sat on every gate row's attest dialog and on the four
// coexisting opening dialogs.
//
// The cell drives the real thing: refuse Finalize, then open Abandon and read ITS modal.

function inProgressPlan(): ClosePlan {
  return {
    fiscal_year: { id: "fy1", client_id: "c1", label: "FY2025", ordinal: 1, starts_on: "2025-01-01", ends_on: "2025-12-31", status: "closing", fy_end_source: "asserted" },
    close_run: { state: "present", close_run_id: "r1", run_state: "in_progress", started_by: "u1", started_at: "t", ended_by: null, ended_at: null, end_reason: null },
    checks: [],
    receipt: { state: "absent" },
  };
}

test("MAJOR 1: a refusal raised by FINALIZE does not paint inside ABANDON's modal", async () => {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(CloseDoors, {
        plan: inProgressPlan(),
        busy: false,
        // The panel's standing refusal — exactly what ClosePlanPanel hands down, and the
        // object every door on the panel used to receive unconditionally.
        refusal: { code: "CLR41", reason: "close_self_attestation_required" },
        refusalMessage: "a solo close needs a written self-attestation",
        onFinalize: async () => false,
        onBegin: async () => true,
        onAbandon: async () => true,
        onReopen: async () => true,
      }),
    }),
  );
  const body = bodyOf();
  try {
    (body as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
    for (let i = 0; i < 3; i++) await h.settle();

    // 1. Refuse FINALIZE, through its own dialog.
    const finalizeTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Finalize close"));
    assert.ok(finalizeTrigger, "the Finalize trigger must render on an in-progress run");
    await h.fireEvent(finalizeTrigger as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();
    const finalizeConfirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Finalize");
    assert.ok(finalizeConfirm, "Finalize's own Confirm must be reachable");
    await h.act(() => clickButton(finalizeConfirm as never));
    for (let i = 0; i < 6; i++) await h.settle();
    assert.match(textOf(body as never), /CLR41/, "Finalize's own modal carries the refusal — the control half");

    // 2. Leave Finalize, open ABANDON.
    const cancel = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
    assert.ok(cancel, "Finalize's Cancel must be reachable");
    await h.act(() => clickButton(cancel as never));
    for (let i = 0; i < 6; i++) await h.settle();

    const abandonTrigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Abandon close"));
    assert.ok(abandonTrigger, "the Abandon trigger must render");
    await h.fireEvent(abandonTrigger as never, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    // 3. THE DISCRIMINATING POST-CONDITION. Abandon's modal is open (its own reason field
    //    proves it), and the panel's standing CLR41 is NOT in it — this dialog has settled
    //    no confirm of its own, so that refusal is not its news to carry.
    const abandonReason = findIn(body, (n) => n.tagName === "TEXTAREA");
    assert.ok(abandonReason, "Abandon's own reason field must be reachable — its modal really is open");
    assert.doesNotMatch(
      textOf(body as never),
      /CLR41/,
      "the panel's refusal belongs to Finalize; painting it here tells the human the wrong door refused, and steals focus to it",
    );
    assert.doesNotMatch(textOf(body as never), /a solo close needs a written self-attestation/);
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
