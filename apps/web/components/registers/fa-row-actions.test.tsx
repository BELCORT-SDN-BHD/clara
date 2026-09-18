// #651 — AC1's HUMAN HALF: the revise dialog's change-class control and its required reason.
//
// WHAT EACH CELL PINS:
//   revise.class_options   `estimate` is the only SELECTABLE value, and the other two are VISIBLY
//                          DISABLED options carrying the reason in words rather than hidden — a
//                          person learns the rule instead of wondering where the control went. The
//                          note names #680 and #679 by number, because that is what an accountant
//                          reads and what the next implementer greps.
//   revise.reason_required a blank reason is `aria-invalid` with a FieldError and a disabled
//                          Confirm, so the refusal never has to be earned from the door.
//   revise.posts           the door call carries the classification INSIDE p_particulars, and the
//                          five-argument signature is unmoved (measurement M1's green arm).
//   revise.survives        a refusal keeps the dialog open with BOTH typed values intact.
//
// THE DIALOG RENDERS INTO A PORTAL at `document.body`, so every search below roots at the BODY
// after the harness container is appended to it — `fixed-assets-keyboard.test.tsx`'s own idiom.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { ReviseParticularsDialog } from "./fa-row-actions";
import {
  intlApp, faRow, findAll, tid, jsonResponse, withMockedEnv, FA_CLIENT, FA_COA, type StubNode,
} from "./fa-depreciation-test-fixtures";

enableDomInspection();

type Call = { url: string; body: Record<string, unknown> };

const bodyNode = () =>
  (globalThis as unknown as { document: { body: StubNode & { appendChild: (c: unknown) => void } } }).document.body;

function reactProps(node: StubNode): Record<string, unknown> {
  const key = Object.keys(node).find((c) => c.startsWith("__reactProps"));
  return key ? ((node as unknown as Record<string, unknown>)[key] as Record<string, unknown>) : {};
}
const byIdSuffix = (root: StubNode, suffix: string): StubNode | undefined =>
  findAll(root, (n) => String(reactProps(n).id ?? "").includes(suffix))[0];

/** The dialog panel renders into a PORTAL, and several of these cells leave their harness
 *  container attached to the body, so "the last Revise button in the document" can land on a
 *  previous cell's trigger. The confirm is found by its SIBLING instead: it is the button beside
 *  Cancel inside the portal's footer, which is the one place only the open dialog has. */
function dialogConfirm(label: string): StubNode {
  const cancel = findAll(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Cancel").pop();
  if (!cancel) throw new Error("the dialog is not open: no Cancel control");
  const footer = findAll(bodyNode(), (n) => (n.childNodes ?? []).includes(cancel))[0];
  if (!footer) throw new Error("the Cancel control has no parent");
  const confirm = findAll(footer, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === label)[0];
  if (!confirm) throw new Error(`no ${label} control beside Cancel`);
  return confirm;
}

/** Mount the dialog, append the container to the portal root, and open it. */
async function openDialog(opts: { fail?: boolean } = {}) {
  const calls: Call[] = [];
  const impl = (async (u: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(u), body: init?.body ? JSON.parse(String(init.body)) : {} });
    if (opts.fail) {
      return jsonResponse({
        code: "CLR37",
        message: "a policy change is a retrospective restatement",
        details: '{"reason":"fa_change_class_unsupported","owning_ticket":"#680","lock_law":"#679"}',
      }, 400);
    }
    return jsonResponse({ asset_id: "a1", successor_asset_id: "a2" });
  }) as typeof fetch;

  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
      return true;
    } catch {
      return false;
    }
  };

  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");

  const h = await renderComponent(intlApp(createElement(ReviseParticularsDialog, {
    clientId: FA_CLIENT, asset: faRow() as never, accounts: FA_COA as never,
    busy: false, act, error: undefined,
  })));
  bodyNode().appendChild(h.container);
  for (let i = 0; i < 4; i++) await h.settle();
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Revise");
  assert.ok(trigger, "the Revise trigger renders");
  await h.fireEvent(trigger!, "click");
  for (let i = 0; i < 6; i++) await h.settle();

  const teardown = async () => {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  };
  return { h, calls, trigger: trigger!, teardown };
}

test("revise.class_options `estimate` is the only selectable class; the other two are VISIBLY DISABLED and the note names #680 and #679", async () => {
  const { h, teardown } = await openDialog();
  try {
    const select = byIdSuffix(bodyNode(), "fa-revise-class-");
    assert.ok(select, "the change-class control renders");
    const options = findAll(select!, (n) => n.tagName === "OPTION");
    assert.equal(options.length, 3, "all THREE recorded classes are offered — hiding two would hide the rule");
    const byValue: Record<string, StubNode> = {};
    for (const o of options) byValue[String(reactProps(o).value)] = o;
    assert.ok(!reactProps(byValue.estimate!).disabled, "estimate is selectable");
    for (const cls of ["policy", "error"]) {
      assert.equal(reactProps(byValue[cls]!).disabled, true,
        `${cls} is VISIBLY DISABLED rather than hidden — a person learns the rule instead of wondering where it went`);
      assert.match(textOf(byValue[cls]! as never), /not available yet/,
        `…and ${cls} carries the reason in words on the option itself`);
    }
    const note = findAll(bodyNode(), (n) => tid(n).startsWith("fa-revise-class-note-"))[0];
    assert.ok(note, "…and the restatement note renders beside the control");
    assert.match(textOf(note! as never), /#680/, "it names the ticket that owns the retrospective-restatement lane");
    assert.match(textOf(note! as never), /#679/, "…and the lock law that governs it");
    assert.doesNotMatch(textOf(note! as never), /#676/,
      "…and NOT #676, which governs allocated-entry corrections and has nothing to do with fixed assets");
  } finally {
    await teardown();
  }
});

test("revise.reason_required a blank reason is aria-invalid with a FieldError and Confirm is disabled", async () => {
  const { h, teardown } = await openDialog();
  try {
    const reason = byIdSuffix(bodyNode(), "fa-revise-reason-");
    assert.ok(reason, "the reason control renders");
    assert.equal(reactProps(reason!)["aria-invalid"], true, "a blank reason is announced as invalid");
    assert.ok(findAll(bodyNode(), (n) => tid(n).startsWith("fa-revise-reason-error-"))[0],
      "…with a FieldError beside it");
    const confirm = dialogConfirm("Revise");
    assert.equal((confirm as unknown as { disabled: boolean }).disabled, true,
      "…and Confirm is disabled until it is filled in");

    await h.fireEvent(reason! as never, "change", (n) => setFieldValue(n, "the plant survey revised the life"));
    for (let i = 0; i < 4; i++) await h.settle();
    assert.equal(reactProps(byIdSuffix(bodyNode(), "fa-revise-reason-")!)["aria-invalid"], undefined,
      "…and the invalid state clears when it is");
  } finally {
    await teardown();
  }
});

test("revise.posts the door call carries the classification INSIDE p_particulars, on the unmoved five-argument signature", async () => {
  const { h, calls, trigger, teardown } = await openDialog();
  try {
    await h.fireEvent(byIdSuffix(bodyNode(), "fa-revise-reason-")! as never, "change",
      (n) => setFieldValue(n, "the plant survey revised the life"));
    await h.fireEvent(byIdSuffix(bodyNode(), "fa-revise-eff-")! as never, "change",
      (n) => setFieldValue(n, "2026-10-01"));
    for (let i = 0; i < 4; i++) await h.settle();

    const confirm = dialogConfirm("Revise");
    assert.notEqual(confirm as unknown, trigger as unknown, "the dialog's own Confirm button is distinct from the trigger");
    // `clickButton` rather than `fireEvent`: the dialog body renders into a PORTAL outside the
    // harness container, and a click dispatched at the container’s delegated listener never
    // reaches it. The change events above DO reach it, which is why only the clicks differ.
    await clickButton(confirm as never);
    for (let i = 0; i < 8; i++) await h.settle();

    const call = calls.find((c) => c.url.includes("/rpc/revise_fixed_asset_particulars"));
    assert.ok(call, `the revise door was called (saw: ${calls.map((c) => c.url).join(", ") || "nothing"})`);
    assert.equal(Object.keys(call!.body).length, 5,
      "FIVE arguments — the signature is unmoved (0041:4414 grants it by EXACT signature)");
    const particulars = call!.body.p_particulars as Record<string, unknown>;
    assert.equal(particulars.change_class, "estimate",
      "the classification travels INSIDE p_particulars (measurement M1's green arm)");
    assert.equal(particulars.change_reason, "the plant survey revised the life");
    assert.equal(call!.body.p_effective_from, "2026-10-01");
  } finally {
    await teardown();
  }
});

test("revise.survives a refused revision keeps the dialog OPEN with both typed values intact", async () => {
  const { h, trigger, teardown } = await openDialog({ fail: true });
  try {
    await h.fireEvent(byIdSuffix(bodyNode(), "fa-revise-reason-")! as never, "change",
      (n) => setFieldValue(n, "a reason worth keeping"));
    await h.fireEvent(byIdSuffix(bodyNode(), "fa-revise-eff-")! as never, "change",
      (n) => setFieldValue(n, "2026-10-01"));
    for (let i = 0; i < 4; i++) await h.settle();

    const confirm = dialogConfirm("Revise");
    // `clickButton` rather than `fireEvent`: the dialog body renders into a PORTAL outside the
    // harness container, and a click dispatched at the container’s delegated listener never
    // reaches it. The change events above DO reach it, which is why only the clicks differ.
    await clickButton(confirm as never);
    for (let i = 0; i < 8; i++) await h.settle();

    // CB-AE2E-004: a refused act resolves false and the dialog stays OPEN — destroying the input a
    // refusal is asking the human to correct is the defect that rule exists to close.
    const stillThere = byIdSuffix(bodyNode(), "fa-revise-reason-");
    assert.ok(stillThere, "the dialog is still open after a refusal");
    assert.equal(String(reactProps(stillThere!).value), "a reason worth keeping",
      "…and the reason the human typed survived it");
    assert.equal(String(reactProps(byIdSuffix(bodyNode(), "fa-revise-eff-")!).value), "2026-10-01",
      "…and so did the effective-from date");
  } finally {
    await teardown();
  }
});
