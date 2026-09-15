// #721 — RESTATE AS A NEW INSTRUCTION, under test.
//
// Two claims, and the first is the one that could silently go wrong: the basis carried into the
// successor is a TRANSCRIPTION of the admitted one — the same cents, the same accounts, the same
// posting date — with the person's wording merged into the memo and nowhere else. A control that
// re-derived figures from a sentence would be a second, unreviewed admission path.
//
// The door is INJECTED, so every cell drives the decision with no socket.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { clickButton, renderComponent } from "../../test/hookHarness";

import { enableDomInspection } from "../../test/domInspect";
import { RestateWorkPanel, restatedBasis } from "./work-restate";
import type { RestateWorkResult } from "../../lib/work/api";
import type { AccountingWorkRow } from "../../lib/work/types";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function buttonLabelled(h: { find: (p: (n: Stub) => boolean) => Stub | null }, text: string): Stub | null {
  return h.find((n) => n.tagName === "BUTTON" && String((n as { textContent?: string }).textContent ?? "").includes(text));
}

/** Every `href` rendered under the container, in document order. */
function hrefs(container: Stub): string[] {
  const out: string[] = [];
  const walk = (n: Stub) => {
    if (n.tagName === "A") {
      const href = (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href");
      if (href) out.push(href);
    }
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
  };
  walk(container);
  return out;
}

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NEW_WORK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function workRow(over: Partial<AccountingWorkRow> = {}): AccountingWorkRow {
  return {
    id: WORK,
    firm_id: "firm-1",
    client_id: CLIENT,
    purpose: "journal_entry",
    status: "awaiting_input",
    initiator: "user-1",
    initiated_by: "user-1",
    initiator_role: "bookkeeper",
    intent_key: "intent-1",
    logical_op_id: `work:${WORK}:journal_entry:1`,
    basis: {
      posting_date: "2026-09-01",
      memo: "Office rent, September",
      currency: "MYR",
      lines: [
        { account_code: "6100", debit_cents: 120_000, credit_cents: 0, description: "rent" },
        { account_code: "1100", debit_cents: 0, credit_cents: 120_000, description: null },
      ],
    },
    basis_digest: "digest",
    basis_origin: "user_direct",
    source_refs: [],
    current_task_id: null,
    bundle: null,
    result: null,
    error: null,
    created_at: "2026-09-01T01:00:00.000Z",
    updated_at: "2026-09-01T01:00:00.000Z",
    ...over,
  };
}

function App(props: {
  work?: AccountingWorkRow;
  restate?: (auth: unknown, input: Record<string, unknown>) => Promise<RestateWorkResult>;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(RestateWorkPanel, {
      work: props.work ?? workRow(),
      clientId: CLIENT,
      session: { getAccessToken: async () => "tok" },
      restate: (props.restate
        ?? (async () => ({ kind: "accepted", workId: NEW_WORK, taskId: "t", logicalOpId: "op", status: "queued", replayed: false, supersedes: WORK }))) as never,
    }),
  });
}

test("721 the restated basis TRANSCRIBES the admitted figures and merges the instruction into the memo", () => {
  const b = workRow().basis!;
  const wire = restatedBasis(b, "  this was paid on 3 September  ");
  assert.equal(wire.postingDate, "2026-09-01", "721 the admitted posting date is carried, not re-derived");
  assert.equal(wire.currency, "MYR");
  assert.equal(wire.memo, "Office rent, September — this was paid on 3 September",
    "721 the instruction is merged into the memo, trimmed");
  assert.deepEqual(wire.lines, [
    { accountCode: "6100", debitCents: 120_000, creditCents: 0, description: "rent" },
    { accountCode: "1100", debitCents: 0, creditCents: 120_000 },
  ], "721 every line is the admitted one; a null description is absent rather than null");

  assert.equal(restatedBasis(b, "   ").memo, "Office rent, September",
    "721 an empty instruction leaves the memo exactly as admitted");
});

test("721 the panel submits ONE restatement through the door and links to the Work it created", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const h = await renderComponent(
    App({
      restate: async (_a, input) => {
        calls.push(input);
        return { kind: "accepted", workId: NEW_WORK, taskId: "t", logicalOpId: "op", status: "queued", replayed: false, supersedes: WORK };
      },
    }),
  );
  try {
    await h.settle();
    assert.match(h.text(), /Restate as a new instruction/, "721 the control is offered");
    const press = buttonLabelled(h, "Restate as a new instruction");
    assert.ok(press, "721 the control is mounted");
    await clickButton(press!);
    await h.settle();
    assert.equal(calls.length, 1, "721 exactly one call — the two effects are ONE act at the door");
    assert.equal(calls[0].workId, WORK, "721 …naming the Work being retired");
    assert.equal(typeof calls[0].opKey, "string", "721 …under this press's own identity");
    assert.equal(typeof calls[0].intentKey, "string", "721 …and the successor's own intent key");
    assert.match(h.text(), /A new Work was recorded/, "721 the door's own answer is rendered");
    assert.ok(hrefs(h.container).some((href) => href.includes(NEW_WORK)),
      "721 …with a link to the Work it created");
  } finally {
    await h.unmount();
  }
});

test("721 a refusal is rendered verbatim and nothing claims a restatement happened", async () => {
  const h = await renderComponent(
    App({ restate: async () => ({ kind: "not_restatable", reason: "already_superseded", status: "cancelled" }) }),
  );
  try {
    await h.settle();
    const press = buttonLabelled(h, "Restate as a new instruction");
    assert.ok(press, "721 the control is mounted");
    await clickButton(press!);
    await h.settle();
    assert.match(h.text(), /This Work can no longer be restated/);
    assert.equal(/A new Work was recorded/.test(h.text()), false,
      "721 …and never an outcome the door did not report");
  } finally {
    await h.unmount();
  }
});

test("721 a Work whose basis this build cannot read offers NO restatement", async () => {
  const h = await renderComponent(App({ work: workRow({ basis: null }) }));
  try {
    await h.settle();
    assert.equal(/Restate as a new instruction/.test(h.text()), false,
      "721 a control that would carry figures it cannot read is not offered");
  } finally {
    await h.unmount();
  }
});
