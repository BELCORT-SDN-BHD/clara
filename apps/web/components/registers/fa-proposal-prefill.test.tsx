// #933 — ENTRANCE 1 OF 3: THE ASSET PAGE DIALOG PRE-FILLS FROM CLARA'S PROPOSAL.
//
// #883's second half in one sentence: when the account has no default depreciation policy, Clara
// proposes the particulars and the person confirms or edits. This file drives the register's own
// entrance — `CompleteParticularsDialog` — and asserts the three things the ticket turns on:
//
//   prefill   opening the dialog reads the asset's parked question and the controls come up
//             CARRYING the proposal, so "confirm" is one action rather than six fields.
//   reason    the one line Clara derived them from is ON SCREEN. A proposal nobody can check is a
//             proposal nobody should confirm, and this is the control that makes it checkable.
//   the_edit  the values that reach `clara.complete_fixed_asset_particulars` are the PERSON'S,
//             not the proposal's, the moment they change one. This is the cell #883's ruling
//             exists for — "a person stays the author of every depreciation estimate" — and it
//             is the one that would catch a form that posted its seed.
//
// THE DIALOG RENDERS INTO A PORTAL at `document.body`, so every search roots at the BODY after the
// harness container is appended to it — `fa-row-actions.test.tsx`'s own idiom, copied with it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { CompleteParticularsDialog } from "./fa-row-actions";
import {
  intlApp, faRow, findAll, jsonResponse, FA_CLIENT, FA_COA, type StubNode,
} from "./fa-depreciation-test-fixtures";

enableDomInspection();

/** The block, exactly as `p933.wire.verbatim` proved it travels. The asset's own id is what the
 *  register-side entrances match on. */
const PROPOSAL_REASON =
  "Every other completed asset on 1510 is depreciated straight line over 60 months, so I propose "
  + "the same. I propose 1 March 2026 — the acquisition's own posting date — as the in-service "
  + "date, and a nil residual, which is this firm's default.";

const parkedQuestion = (assetId: string) => [{
  id: "q-1",
  source_ref: {
    kind: "fixed_asset",
    asset_id: assetId,
    proposal: {
      v: 1,
      method: "straight_line",
      useful_life_months: 60,
      rate_bps: null,
      residual_cents: 0,
      start_date: "2026-03-01",
      description: "Air compressor, workshop bay 2",
      basis: ["account_siblings", "acquisition_date", "firm_default_residual"],
      reason: PROPOSAL_REASON,
    },
  },
}];

type Call = { url: string; body: Record<string, unknown> };

const bodyNode = () =>
  (globalThis as unknown as { document: { body: StubNode & { appendChild: (c: unknown) => void } } }).document.body;

function reactProps(node: StubNode): Record<string, unknown> {
  const key = Object.keys(node).find((c) => c.startsWith("__reactProps"));
  return key ? ((node as unknown as Record<string, unknown>)[key] as Record<string, unknown>) : {};
}
const byIdSuffix = (root: StubNode, suffix: string): StubNode | undefined =>
  findAll(root, (n) => String(reactProps(n).id ?? "").includes(suffix))[0];

/** The confirm button is found by its SIBLING Cancel inside the portal's footer — the only place
 *  only the OPEN dialog has. `fa-row-actions.test.tsx`'s own helper. */
function dialogConfirm(label: string): StubNode {
  const cancel = findAll(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Cancel").pop();
  if (!cancel) throw new Error("the dialog is not open: no Cancel control");
  const footer = findAll(bodyNode(), (n) => (n.childNodes ?? []).includes(cancel))[0];
  if (!footer) throw new Error("the Cancel control has no parent");
  const confirm = findAll(footer, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === label)[0];
  if (!confirm) throw new Error(`no ${label} control beside Cancel`);
  return confirm;
}

async function openCompleteDialog(opts: { rows?: unknown[] } = {}) {
  const asset = faRow({ particulars_complete: false, status: "pending", method: null, useful_life_months: null, start_date: null });
  const rows = opts.rows ?? parkedQuestion(asset.id);
  const calls: Call[] = [];
  const impl = (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
    if (url.includes("agent_interruptions")) return jsonResponse(rows);
    return jsonResponse({ asset_id: asset.id, client_id: FA_CLIENT });
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

  const h = await renderComponent(intlApp(createElement(CompleteParticularsDialog, {
    clientId: FA_CLIENT, asset: asset as never, accounts: FA_COA as never,
    busy: false, act, error: undefined,
  })));
  bodyNode().appendChild(h.container);
  for (let i = 0; i < 4; i++) await h.settle();
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).trim() === "Complete particulars");
  assert.ok(trigger, "the Complete particulars trigger renders");
  await h.fireEvent(trigger!, "click");
  for (let i = 0; i < 10; i++) await h.settle();

  const teardown = async () => {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  };
  return { h, calls, asset, teardown };
}

test("p933.dialog.prefill opening the asset page dialog carries Clara's proposal into the controls — confirming is ONE action, not six fields", async () => {
  const { h, calls, teardown } = await openCompleteDialog();
  try {
    const read = calls.filter((c) => c.url.includes("agent_interruptions"));
    assert.equal(read.length, 1, "prefill: the parked question is read once, when the dialog opens");

    assert.equal(reactProps(byIdSuffix(bodyNode(), "-method")!).value, "straight_line");
    assert.equal(String(reactProps(byIdSuffix(bodyNode(), "-life")!).value), "60",
      "prefill: the proposed useful life is IN the control, not in a sentence beside it");
    assert.equal(reactProps(byIdSuffix(bodyNode(), "-start")!).value, "2026-03-01");
    assert.equal(reactProps(byIdSuffix(bodyNode(), "-desc")!).value, "Air compressor, workshop bay 2");

    // …and the Confirm control is LIVE, which is the whole "one action" claim.
    assert.equal(reactProps(dialogConfirm("Complete particulars")).disabled, false,
      "prefill: a pre-filled form is a submittable one");
    await h.settle();
  } finally {
    await teardown();
  }
});

test("p933.dialog.reason the one line Clara derived the proposal from is ON SCREEN, and it says plainly that the person decides", async () => {
  const { teardown } = await openCompleteDialog();
  try {
    const note = findAll(bodyNode(), (n) => String(n.getAttribute?.("data-testid") ?? "") === "fa-proposal-note")[0];
    assert.ok(note, "reason: a proposal nobody can check is a proposal nobody should confirm");
    const said = textOf(note as never);
    assert.match(said, /Every other completed asset on 1510 is depreciated straight line over 60 months/,
      "reason: the GROUND is named, in words an accountant checks against the register");
    assert.match(said, /the acquisition's own posting date/,
      "reason: …including where the in-service date came from");
    assert.match(said, /what you confirm/,
      "reason: and the note says whose decision this is — ticket 883's ruling, on screen");
  } finally {
    await teardown();
  }
});

test("p933.dialog.the_edit what reaches the door is the PERSON'S value, never the proposal's, the moment they change one", async () => {
  const { h, calls, asset, teardown } = await openCompleteDialog();
  try {
    // The proposal said 60 months. The person disagrees.
    await h.fireEvent(byIdSuffix(bodyNode(), "-life")! as never, "change", (n) => setFieldValue(n, "84"));
    for (let i = 0; i < 4; i++) await h.settle();

    await clickButton(dialogConfirm("Complete particulars") as never);
    for (let i = 0; i < 8; i++) await h.settle();

    const posts = calls.filter((c) => c.url.includes("/rpc/complete_fixed_asset_particulars"));
    assert.equal(posts.length, 1, "the_edit: one governed call");
    const particulars = posts[0]!.body.p_particulars as Record<string, unknown>;
    assert.equal(particulars.useful_life_months, 84,
      "the_edit: the applied particulars are the confirmed ones — a form that posted its seed would send 60");
    assert.equal(particulars.method, "straight_line", "the_edit: …and the untouched fields are still the proposal's");
    assert.equal(particulars.start_date, "2026-03-01");
    assert.equal(posts[0]!.body.p_asset, asset.id);
  } finally {
    await teardown();
  }
});

test("p933.dialog.no_proposal an asset with nothing parked opens the ordinary EMPTY form — today's behaviour, unchanged", async () => {
  const { calls, teardown } = await openCompleteDialog({ rows: [] });
  try {
    assert.equal(
      findAll(bodyNode(), (n) => String(n.getAttribute?.("data-testid") ?? "") === "fa-proposal-note").length, 0,
      "no_proposal: no note, because there is nothing to account for");
    assert.equal(reactProps(byIdSuffix(bodyNode(), "-start")!).value, "",
      "no_proposal: and no in-service date anybody has to notice and clear");
    assert.equal(calls.filter((c) => c.url.includes("/rpc/")).length, 0, "no_proposal: nothing was written");
  } finally {
    await teardown();
  }
});
