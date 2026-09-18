// C6 — the tool_call chip, driven through the REAL bubble that composes its status.
//
// WHY NOT THROUGH `PartRenderer` ALONE. The renderer is handed one part and cannot see
// siblings; the composition it depends on lives in `ClaraMessageBubble`, which is the
// only altitude that holds a message's own `parts` array. A cell that passed
// `toolStatus` in by hand would prove the chip renders and prove nothing about whether
// anything ever computes it — which is exactly the state this change found the code in
// ("a later lane's wiring", PartRenderer's own former comment).
//
// THE DISCRIMINATING PAIR is the first cell: one call succeeded and one failed IN THE
// SAME MESSAGE, and the assertion is that the two chips differ. Before this change both
// rendered the identical bare grey name chip, so that assertion was false.
//
// RE-BASED BY #642 (UI-32), and the reason is on the record rather than in a diff. This
// file used to pin "the tool NAME is the runtime's own token and is never re-worded".
// That was C6's deliberate reading — the chip's verb is the receipt's claim about what
// was called — and UI-32 ("no implementation jargon on a human surface") is the OWNER
// ruling that outranks it: `start_accrual_work` and `compose_metric_preview` reached the
// reader verbatim, which is the defect UI-32 was filed against, fixed once, and reopened
// the moment this chip came back. The honesty C6 was protecting is KEPT, in the one place
// it is actually load-bearing: a tool this build has no label for still shows the
// runtime's own token (the fallback cell below), because inventing a friendly name for a
// step this build cannot describe would be worse than the jargon. The token ↔ label map
// is `lib/clara/toolLabel.ts`, measured by calling `buildToolsV20`, and
// `lib/clara/toolLabel.test.ts` is the gate that keeps it from drifting.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraMessageBubble } from "../clara/ClaraMessageBubble";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { sessionTokenAccessor } from "../../lib/session-accessor";
import type { ClaraPart, MessageRow } from "../../lib/clara/api";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function message(parts: ClaraPart[]): MessageRow {
  return { id: "m-1", role: "assistant", parts, turn_key: null, task_id: "task-1", seq: 1, created_at: "2026-09-04T00:00:00Z" };
}

function App(parts: ClaraPart[]): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(ClaraMessageBubble, { message: message(parts), session: sessionTokenAccessor }),
  });
}

function findAll(node: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = predicate(node) ? [node] : [];
  for (const child of (node.childNodes as Stub[] | undefined) ?? []) out.push(...findAll(child, predicate));
  return out;
}

/** Every chip's rendered text, in document order. The Badge is the only `data-slot=
 *  "badge"` node these parts produce. */
function chips(h: { container: Stub }): string[] {
  return findAll(h.container, (n) => {
    const get = n.getAttribute as ((k: string) => string | null) | undefined;
    return typeof get === "function" && get("data-slot") === "badge";
  }).map((n) => textOf(n).replace(/\s+/g, " ").trim());
}

const call = (id: string, tool: string): ClaraPart => ({ type: "tool_call", tool, tool_call_id: id, input: {} });
const result = (id: string, tool: string): ClaraPart => ({ type: "tool_result", tool, tool_call_id: id, output: { rows: [] } });
const failure = (id: string, tool: string): ClaraPart => ({ type: "tool_error", tool, tool_call_id: id, error: "CLR11 not visible" });

test("a SUCCEEDED and a FAILED call in one message render DIFFERENT chips", async () => {
  const h = await renderComponent(App([
    call("a", "trial_balance"), result("a", "trial_balance"),
    call("b", "read_document"), failure("b", "read_document"),
  ]));
  try {
    await h.settle();
    const rendered = chips(h);
    assert.equal(rendered.length, 2, "one chip per call — the resolvers themselves still render nothing of their own");
    assert.deepEqual(rendered, ["Reading the trial balance · done", "Reading a document · failed"]);
    // UI-32 — and neither runtime token reaches the reader at all.
    assert.doesNotMatch(h.text(), /trial_balance|read_document/);
    // THE DEFECT, named: before the resolver these two were the same string.
    assert.notEqual(rendered[0], rendered[1]);
  } finally {
    await h.unmount();
  }
});

test("UI-32 (#642) — the tool name is a HUMAN label, and the runtime's token never reaches the reader", async () => {
  const h = await renderComponent(App([call("a", "compose_metric_preview"), result("a", "compose_metric_preview")]));
  try {
    await h.settle();
    assert.match(h.text(), /Previewing a measure/, "the reader is told what happened, in words");
    assert.doesNotMatch(h.text(), /compose_metric_preview/, "…and not in the implementation's own identifier");
  } finally {
    await h.unmount();
  }
});

test("UI-32 (#642) — a tool this build has NEVER HEARD OF still shows the runtime's own word", async () => {
  // The half of C6's original rule that survives, and the one that matters: a newer
  // frozen `chatTurn` body may ship a tool this surface has no label for. Showing its
  // token is honest. A blank chip would hide that a step happened at all, and a
  // prettified token ("a tool from the future") would read like a label while still being
  // the implementation's word.
  const h = await renderComponent(App([call("a", "a_tool_from_the_future"), result("a", "a_tool_from_the_future")]));
  try {
    await h.settle();
    assert.deepEqual(chips(h), ["a_tool_from_the_future · done"]);
  } finally {
    await h.unmount();
  }
});

test("a call with NO recorded outcome says so — it never reads as done", async () => {
  const h = await renderComponent(App([call("a", "trial_balance")]));
  try {
    await h.settle();
    const rendered = chips(h);
    assert.deepEqual(rendered, ["Reading the trial balance · no outcome recorded"]);
    assert.doesNotMatch(h.text(), /done/, "a missing sibling must never be reported as success");
    // And deliberately not "running": a tool_call only ever reaches a screen from the
    // SETTLED transcript, so a running claim would be this UI asserting a state the DB
    // never reported. See lib/parts/toolStatus.ts's header.
    assert.doesNotMatch(h.text(), /running/i);
  } finally {
    await h.unmount();
  }
});

test("two calls to the SAME tool keep their own outcomes — the map keys on the call id", async () => {
  // Spelling is not identity: one call's failure must not label the other's chip.
  const h = await renderComponent(App([
    call("first", "read_document"), call("second", "read_document"),
    result("first", "read_document"), failure("second", "read_document"),
  ]));
  try {
    await h.settle();
    assert.deepEqual(chips(h), ["Reading a document · done", "Reading a document · failed"]);
  } finally {
    await h.unmount();
  }
});

test("tool_result and tool_error still render nothing of their own", async () => {
  // They are the catalog's two STATUS_RESOLVER_TYPES. This change gives them a JOB;
  // it must not give them a body, or every turn would grow a row of empty elements.
  const h = await renderComponent(App([result("orphan", "trial_balance"), failure("other", "read_document")]));
  try {
    await h.settle();
    assert.deepEqual(chips(h), [], "a resolver with no call in this message renders nothing at all");
    assert.doesNotMatch(h.text(), /CLR11 not visible/, "the error payload is not a standalone element");
  } finally {
    await h.unmount();
  }
});
