// CB-AE2E-021 + 裁-187, and the two sibling flaws folded in beside them:
//   · ONE approval control per draft, routed by the queue row's own
//     `high_stakes` flag — never two indistinguishable buttons.
//   · The attestation field HIDDEN by default and revealed only beside a door
//     refusal that names an attestation token (裁-187/ADR-0078: the ceremony
//     is abolished, the click is the act; the DB wall comes down in 裁-188).
//   · The state legend, listing every real status from the DB's own CHECK.
//   · Revise GATED on the three coding kinds `revise_entry` refuses, with an
//     honest not-built note instead of a control that always produces CLR21.
//   · The revision-delta value formatter — a jsonb `flags` value must never
//     render as "[object Object]".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { DraftsQueuePanel } from "./drafts-queue-panel";
import { EntryDiffContent } from "./entry-diff-panel";
import { JournalStatusLegend } from "./status-legend";
import type { CoaAccountRow, JournalEntryRow, JournalLineRow, ReviewQueueRow } from "../../lib/journals/types";

enableDomInspection();

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ACCOUNTS: CoaAccountRow[] = [
  { client_id: "c1", account_code: "1000", name: "Cash", account_type: "asset", is_active: true },
];

const DRAFT: JournalEntryRow = {
  id: "je-1", client_id: "c1", status: "draft", posting_date: "2026-04-01", memo: "April supplies",
  origin: "manual", document_id: null, coding_kind: null, revision_token: "rev-1",
  maker_actor: "user-1", checker_actor: null, approved_at: null, reversal_of: null, reversed_by: null,
  reversal_reason: null, withdrawn_at: null, withdrawal_reason: null, created_at: "2026-04-01T00:00:00Z",
};

const LINES: JournalLineRow[] = [
  { id: "l1", entry_id: "je-1", line_no: 1, account_code: "1000", debit_cents: 10_000, credit_cents: 0, description: "Supplies", counterparty_id: null },
];

const QUEUE_ROW: ReviewQueueRow = {
  row_kind: "draft", section: "needs_review", sort: [], client_id: "c1", entry_id: "je-1",
  document_id: null, filing_id: null, lane: "needs_review", high_stakes: false, aged_since: null,
  amount_cents: 10_000, period: "2026-04", created_at: "2026-04-01T00:00:00Z", id: "je-1", coding_kind: null,
};

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children });
}

type Calls = { approve: unknown[][]; routine: unknown[][] };

async function expandedDraft(over: {
  entry?: Partial<JournalEntryRow>;
  highStakes?: boolean;
  err?: string | null;
  clr?: { code: string; reason: string | null } | null;
} = {}) {
  const calls: Calls = { approve: [], routine: [] };
  const entry = { ...DRAFT, ...(over.entry ?? {}) };
  const h = await renderComponent(
    App(
      createElement(DraftsQueuePanel, {
        clientId: "c1",
        queueRows: [{ ...QUEUE_ROW, high_stakes: over.highStakes ?? false }],
        queueCounts: { open_drafts: 1 },
        entries: [entry], lines: LINES, linesTruncated: false, accounts: ACCOUNTS,
        busy: false, err: over.err ?? null, clr: over.clr ?? null,
        actingId: over.err || over.clr ? "je-1" : null,
        onApprove: (...args: unknown[]) => { calls.approve.push(args); },
        onRevise: () => {},
        onApproveRoutine: (...args: unknown[]) => { calls.routine.push(args); },
        onWithdraw: async () => true,
      }),
    ),
  );
  for (let i = 0; i < 2; i++) await h.settle();
  const toggle = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("April supplies"));
  assert.ok(toggle, "the draft row's own toggle must render");
  await h.fireEvent(toggle!, "click");
  await h.settle();
  return { h, calls };
}

function buttonsNamed(container: unknown, name: RegExp): unknown[] {
  return (container as { querySelectorAll(s: string): unknown[] })
    .querySelectorAll("button")
    .filter((n) => name.test(textOf(n as never)));
}

test("an expanded draft offers EXACTLY ONE control whose name starts with Approve", async () => {
  const { h } = await expandedDraft();
  try {
    const approves = buttonsNamed(h.container, /^Approve/);
    assert.equal(approves.length, 1, JSON.stringify(approves.map((n) => textOf(n as never))));
    assert.equal(textOf(approves[0] as never), "Approve");
  } finally {
    await h.unmount();
  }
});

test("a NON-high-stakes draft routes the one button to the GUARDED routine door, never to approve_entry", async () => {
  const { h, calls } = await expandedDraft({ highStakes: false });
  try {
    await h.act(async () => { await clickButton(buttonsNamed(h.container, /^Approve/)[0] as never); });
    assert.deepEqual(calls.approve, [], "approve_entry must not be called for a routine draft");
    assert.deepEqual(calls.routine, [["je-1", "rev-1"]]);
  } finally {
    await h.unmount();
  }
});

test("a HIGH-STAKES draft routes to approve_entry, and sends a NULL attestation because none was asked for", async () => {
  const { h, calls } = await expandedDraft({ highStakes: true });
  try {
    await h.act(async () => { await clickButton(buttonsNamed(h.container, /^Approve/)[0] as never); });
    assert.deepEqual(calls.routine, [], "the guarded door must not be used for a high-stakes draft");
    assert.deepEqual(calls.approve, [["je-1", "rev-1", null]]);
  } finally {
    await h.unmount();
  }
});

test("the attestation field is HIDDEN by default — the ceremony is abolished (裁-187)", async () => {
  const { h } = await expandedDraft({ highStakes: true });
  try {
    const field = h.find((n) => (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("aria-label") === "Attestation");
    assert.equal(field, null, "no attestation input may render before a door asks for one");
    assert.doesNotMatch(h.text(), /Attestation/);
  } finally {
    await h.unmount();
  }
});

test("the attestation field appears ONLY beside a refusal that names an attestation token", async () => {
  // `self_attestation` — 0016_a21_compliance_watch.sql:1438, the solo-firm arm
  // of the live `_approve_entry_core` body.
  const { h } = await expandedDraft({
    highStakes: true,
    err: "solo high-stakes approval requires an attestation",
    clr: { code: "CLR05", reason: "self_attestation" },
  });
  try {
    const field = h.find((n) => (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("aria-label") === "Attestation");
    assert.ok(field, "the field must be revealed beside an attestation refusal");
    // The refusal itself still renders VERBATIM beside it.
    assert.match(h.text(), /solo high-stakes approval requires an attestation/);
    assert.match(h.text(), /Approve with attestation/);
  } finally {
    await h.unmount();
  }
});

// THE MUST-NOT-REVEAL CONTROL. `distinct_checker` is the third arm of the same
// CLR05 block (0016:1435) and it asks for a different PERSON — no attestation
// clears it. A field offered there would be a control that cannot work.
test("a distinct_checker refusal does NOT reveal the attestation field", async () => {
  const { h } = await expandedDraft({
    highStakes: true,
    err: "high-stakes entry needs a distinct checker",
    clr: { code: "CLR05", reason: "distinct_checker" },
  });
  try {
    assert.match(h.text(), /high-stakes entry needs a distinct checker/, "the refusal still renders verbatim");
    const field = h.find((n) => (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("aria-label") === "Attestation");
    assert.equal(field, null, "an attestation cannot answer distinct_checker, so no field is offered");
  } finally {
    await h.unmount();
  }
});

test("Revise is offered on a MANUAL draft and withdrawn on a CODED one, with an honest note naming what is missing", async () => {
  const manual = await expandedDraft({ entry: { coding_kind: null } });
  try {
    assert.equal(buttonsNamed(manual.h.container, /^Revise$/).length, 1, "a manual draft keeps Revise");
    assert.doesNotMatch(manual.h.text(), /counterparty proposal/);
  } finally {
    await manual.h.unmount();
  }

  const coded = await expandedDraft({ entry: { coding_kind: "supplier_bill" } });
  try {
    assert.equal(buttonsNamed(coded.h.container, /^Revise$/).length, 0, "a supplier bill gets no Revise — the door refuses CLR21 every time");
    assert.match(coded.h.text(), /counterparty proposal/, "and the note says which inputs are missing");
  } finally {
    await coded.h.unmount();
  }
});

// The gate is the DOOR'S predicate, not "is it coded at all": the CHECK domain
// grew to five values at 0037:499-500 while `revise_entry`'s CLR21 gates still
// name only three, so a customer_receipt draft can genuinely be revised.
test("a coding kind OUTSIDE revise_entry's three-value gate keeps Revise", async () => {
  const { h } = await expandedDraft({ entry: { coding_kind: "customer_receipt" } });
  try {
    assert.equal(buttonsNamed(h.container, /^Revise$/).length, 1);
  } finally {
    await h.unmount();
  }
});

test("the state legend lists every status in the DB's CHECK domain, and Posted is the ONE word for approved", async () => {
  const h = await renderComponent(App(createElement(JournalStatusLegend)));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = h.text();
    // Every member of `status in ('draft','approved','withdrawn')`
    // (0007_document_pipeline.sql:1012-1014) — the DOMAIN, not whatever
    // statuses happen to be on screen.
    assert.match(text, /Draft — not in the books yet/);
    assert.match(text, /Posted — approved and in the books/);
    assert.match(text, /Withdrawn — the draft was abandoned/);
    // The tab strip already said "Posted" while every row badge said
    // "Approved" for the same DB fact. The badge for `approved` now reads the
    // tab's word, so the two agree and the legend says they are one state.
    assert.doesNotMatch(text, /\bApproved\b/, "'Approved' is no longer a label — 'Posted' is the one word");
    const badges = (h.container as unknown as { querySelectorAll(s: string): unknown[] }).querySelectorAll("span");
    assert.ok(
      badges.some((b) => textOf(b as never) === "Posted"),
      "the legend renders the REAL badge component, so the badge's own label is what is proven here",
    );
  } finally {
    await h.unmount();
  }
});

/**
 * THE PRE-裁-188 WINDOW — the rendered copy AND the two sources that make it true.
 *
 * 裁-187 / ADR-0078 abolished the maker-checker walls, but the DOOR BODIES STILL CARRY THE
 * RUNGS. A legend promising the post-裁-188 world would tell a bookkeeper a rule the database
 * does not yet obey, and they would meet a refusal this very screen had said could not happen.
 * A cell that reads only the rendered string would go on passing through exactly that.
 *
 * SO IT READS THE SOURCES TOO — and the two are NOT interchangeable, which is the whole design
 * of this cell:
 *
 *   (a) `0016_a21_compliance_watch.sql`'s `distinct_checker` raise. This proves the CITATION
 *       the legend's own comment makes is real rather than a stale reference. It does NOT fire
 *       when the wall comes down, and assuming it would is the "spelling is not identity"
 *       trap: 裁-188 lands as a NEW migration splicing `_approve_entry_core`'s live body, and
 *       a migration already merged is immutable history — 0016 stays byte-identical forever.
 *       A cell resting on (a) alone would stay green while the live door stopped raising.
 *
 *   (b) docs/ARCHITECTURE.md §3.4's sentence, which is the repo's own DECLARATION that the
 *       window is open. That sentence is trued by the 裁-188 lane itself (ADR-0078 §3.4 names
 *       the truing), so THIS is the arm that actually fires the day the walls fall, and the
 *       red lands on the copy that has to change with it.
 *
 * WHEN 裁-188 LANDS this cell INVERTS rather than being deleted quietly: assert the caveat is
 * GONE from both the copy and §3.4, and drop the second sentence of
 * `JournalsWorkbench.legend.rbac` with it.
 */
const DISTINCT_CHECKER_RAISE =
  /raise exception 'high-stakes entry needs a distinct checker'\s*\n\s*using errcode='CLR05',detail='\{"reason":"distinct_checker"\}';/;
const WINDOW_OPEN = /The bodies still carry the rungs until the 裁-188 wall-removal lane lands/;

test("the legend keeps the second-checker caveat while the door bodies still raise CLR05", async () => {
  const repoRoot = join(WEB_ROOT, "..", "..");

  // (a) the citation is real — the arm the legend's comment points at is where it says it is.
  const migration = readFileSync(join(repoRoot, "packages/db/migrations/0016_a21_compliance_watch.sql"), "utf8");
  assert.match(migration, DISTINCT_CHECKER_RAISE, "0016's distinct-checker raise is the arm this legend's caveat exists for");

  // (b) the repo still DECLARES the window open. This is the arm that reds when 裁-188 lands.
  const architecture = readFileSync(join(repoRoot, "docs/ARCHITECTURE.md"), "utf8");
  assert.match(
    architecture,
    WINDOW_OPEN,
    "ARCHITECTURE §3.4 no longer says the walls are standing — invert this cell and drop the legend's caveat",
  );

  // POSITIVE CONTROLS ON BOTH MATCHERS. A `match` against a large file proves nothing unless
  // the pattern can also say NO — a regex loosened into something the file always satisfies
  // would go green forever. Neither source is mutated to prove this: a migration already
  // merged is immutable history and must never be edited even briefly, so the control runs the
  // same pattern against the same text with the fact REMOVED.
  assert.doesNotMatch(
    migration.replace(DISTINCT_CHECKER_RAISE, "-- removed"),
    DISTINCT_CHECKER_RAISE,
    "the migration matcher cannot tell present from absent — it is not a measurement",
  );
  assert.doesNotMatch(
    architecture.replace(WINDOW_OPEN, "the walls are down"),
    WINDOW_OPEN,
    "the ARCHITECTURE matcher cannot tell present from absent — it is not a measurement",
  );

  const h = await renderComponent(App(createElement(JournalStatusLegend)));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = h.text();
    assert.match(text, /bookkeeper level or above can approve and post/, "裁-187's RBAC rule is stated");
    assert.match(
      text,
      /second checker or a written attestation/,
      "…and so is the window we are actually in — the walls are still standing until 裁-188",
    );
    assert.match(text, /the refusal says which/, "and the reader is told where the answer comes from: the door, not this screen");
    assert.match(text, /receipted on the Activity timeline/);
  } finally {
    await h.unmount();
  }
});

test("a jsonb revision delta renders its value, never the string [object Object]", async () => {
  const h = await renderComponent(
    App(
      createElement("div", null,
        createElement("h1", null, "Journals"),
        createElement(EntryDiffContent, {
          entryDiff: {
            entry_id: "je-1",
            revisions: [{
              revision_no: 1, actor_kind: "human", actor: "u1", reason: null,
              created_at: "2026-04-01T09:30:00Z", header: {}, legs: [], rule_decision_id: null,
              // `journal_entries.flags` is jsonb NOT NULL default '{}' with a
              // jsonb_typeof='object' CHECK (0009:851-852) — ALWAYS an object.
              deltas_vs_prev: [
                { field: "flags", before: {}, after: { amount_override: true }, delta_cents: null },
                { field: "memo", before: null, after: "corrected", delta_cents: null },
              ],
            }],
          },
          docDiff: null,
        }),
      ),
    ),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = h.text();
    assert.doesNotMatch(text, /\[object Object\]/, "an object delta must never stringify blindly");
    assert.match(text, /amount_override/, "the object's real content is reachable");
    assert.match(text, /none/, "a null side reads as 'none', not as an empty gap");
    assert.match(text, /corrected/);
  } finally {
    await h.unmount();
  }
});
