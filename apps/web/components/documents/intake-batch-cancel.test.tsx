// #636 — ONE CONFIRM, ONE GOVERNED CALL. The fan-out is the server's.
//
// A dialog that issued one `cancel_accounting_work` per child would be the shape
// `components/documents/DocumentsDoorDialog.tsx:8-9` forbids, and a tab closed after child 12 of
// 40 would leave a batch nobody could reason about. These cells hold that line by COUNTING calls,
// not by reading the source.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { IntakeBatchCancelDialog } from "./intake-batch-cancel-dialog";
import { RefusalError } from "../../lib/wire";

enableDomInspection();

// THE DIALOG IS PORTALLED to `document.body`, which a delegation root never reaches — so every
// search here walks the body, exactly as `work-cancel-dialog.test.tsx` does.
type Stub = Record<string, unknown>;
function findIn(root: Stub, predicate: (n: Stub) => boolean): Stub | null {
  if (predicate(root)) return root;
  for (const c of ((root.childNodes as Stub[] | undefined) ?? [])) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
const bodyNode = (): Stub => (globalThis as unknown as { document: { body: Stub } }).document.body;
const bodyText = (): string => textOf(bodyNode() as never);
const buttonIn = (label: string): Stub | null =>
  findIn(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === label);

const BATCH = "b1111111-1111-4111-8111-111111111111";
const session = { getAccessToken: async () => "tok" } as never;

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

type Call = { batchId: string; opKey: string };

async function mount(cancel: (b: string, k: string) => Promise<unknown>, onCancelled = () => {}) {
  const h = await renderComponent(App(createElement(IntakeBatchCancelDialog, {
    batchId: BATCH,
    label: "April sources",
    liveChildren: 40,
    onOpenChange: () => {},
    onCancelled,
    cancel: cancel as never,
    session,
  } as never)));
  for (let i = 0; i < 2; i += 1) await h.settle();
  return h;
}

/** Find the confirm button by its rendered label, on the BODY (the dialog is portalled). */
function confirmButton() {
  const found = buttonIn("Stop the batch");
  assert.ok(found, `the confirm control renders (body was: ${bodyText()})`);
  return found as never;
}

test("one confirm performs EXACTLY ONE governed call, never N calls from the dialog", async () => {
  const calls: Call[] = [];
  const h = await mount(async (batchId, opKey) => {
    calls.push({ batchId, opKey });
    return { batch_id: batchId, state: "cancelling", cancel_op_key: opKey, cancel_requested_by: "u1", children: [], fanned_out: 40, deferred: 0, refused: 0 };
  });
  await clickButton(confirmButton());
  for (let i = 0; i < 3; i += 1) await h.settle();
  assert.equal(calls.length, 1, "one press, one governed decision — the fan-out is the SERVER's");
  assert.equal(calls[0].batchId, BATCH);
  assert.match(calls[0].opKey, /^[0-9a-f-]{36}$/i, "the decision carries its own key");
  await h.unmount();
});

test("ONE op key per open decision: a retry of the same decision reuses it", async () => {
  const calls: Call[] = [];
  let fail = true;
  const h = await mount(async (batchId, opKey) => {
    calls.push({ batchId, opKey });
    if (fail) { fail = false; throw new Error("network went away"); }
    return { batch_id: batchId, state: "cancelling", cancel_op_key: opKey, cancel_requested_by: "u1", children: [], fanned_out: 0, deferred: 0, refused: 0 };
  });
  await clickButton(confirmButton());
  for (let i = 0; i < 3; i += 1) await h.settle();
  await clickButton(confirmButton());
  for (let i = 0; i < 3; i += 1) await h.settle();
  assert.equal(calls.length, 2, "both attempts reached the door");
  assert.equal(calls[0].opKey, calls[1].opKey,
    "an unobserved first attempt and its retry are ONE operation to the database (_reserve_op replays the stored result)");
  await h.unmount();
});

test("a REFUSAL renders VERBATIM, the dialog stays open, and the draft is preserved", async () => {
  let reReads = 0;
  const h = await mount(async () => {
    throw new RefusalError("CLR13", "this intake batch is already stopping under another decision", {
      reason: "batch_already_cancelling", status: 400, pgCode: "CLR13", codeSource: "sqlstate",
      detail: { reason: "batch_already_cancelling", cancel_op_key: "k-first" },
    });
  }, () => { reReads += 1; });
  await clickButton(confirmButton());
  for (let i = 0; i < 3; i += 1) await h.settle();
  const text = bodyText();
  assert.match(text, /already stopping under another decision/, "the database's own words, never re-worded");
  assert.match(text, /CLR13/);
  assert.match(text, /Stop the batch/, "the dialog is still open — nothing the person chose was thrown away");
  assert.equal(reReads, 1, "hydrate-never-trust: the batch is re-read even after a refusal");
  await h.unmount();
});

test("the dialog states that committed receipts are kept — the load-bearing promise of this press", async () => {
  const h = await mount(async () => ({ batch_id: BATCH, state: "cancelling", cancel_op_key: "k", cancel_requested_by: "u1", children: [], fanned_out: 0, deferred: 0, refused: 0 }));
  const text = bodyText();
  assert.match(text, /keeps its receipt/);
  assert.match(text, /Nothing that has posted is undone/);
  assert.match(text, /40 operations are still running/, "a COUNT, never a percentage");
  assert.ok(!/\d+\s*%/.test(text), "no percentage-shaped string anywhere in the dialog");
  await h.unmount();
});
