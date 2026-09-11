// #728 findings 1 and 2 — the actor cell's THREE shapes (a member, the agent on behalf of a
// member, and the system marker a kept sweep-heartbeat row carries), proven on the RENDERED text
// rather than by inspecting `ActivityActorLine`'s internals. `activity-row.tsx` had no RTL seam of
// its own before this file (the same class of gap #632 review finding 16 already named for its
// siblings); it shares `ActivityActorLine` with `activity-event-sheet.tsx`, so this coverage
// discharges finding 2 for BOTH surfaces at once — see that shared component's own header.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import { App, activityRow, ACTIVITY_CLIENT, MEMBERS } from "./activity-test-fixtures";
import type { MemberNameResolver } from "../../../lib/members/use-member-names";
import { AGENT_USER_ID } from "../../../lib/firm/actor-label";
import { ActivityRow } from "./activity-row";

// `next/link`'s prefetch-on-visible hook needs the `self`/`requestIdleCallback` polyfill this
// installs — every row here renders at least one <Link> (the client name).
enableDomInspection();

const CLIENT_NAMES = new Map([[ACTIVITY_CLIENT.id, ACTIVITY_CLIENT.name]]);

/** A resolver that answers ONLY for the ids named here — the honest fallback (`MemberName`'s own
 *  shortened raw id / this ticket's "Clara" agent label) is what a caller sees for anything else,
 *  exactly as `use-member-names.ts`'s own contract states. */
function resolverFor(known: typeof MEMBERS): MemberNameResolver {
  return {
    resolve: (userId) => {
      const row = known.find((m) => m.user_id === userId);
      if (!row) return null;
      return { display_name: row.display_name, email: row.email, role: row.role, status: row.status, removed_at: row.removed_at };
    },
    members: known,
    loading: false,
    error: null,
  };
}

async function renderRow(row: ReturnType<typeof activityRow>, memberNames: MemberNameResolver): Promise<string> {
  const h = await renderComponent(
    App(
      createElement(ActivityRow, {
        row, clientNames: CLIENT_NAMES, memberNames, onOpenDetail: () => {},
      }),
    ) as never,
  );
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    return textOf(h.container as never);
  } finally {
    await h.unmount();
  }
}

test("ActivityRow actor cell: a resolved MEMBER renders their display name", async () => {
  const text = await renderRow(
    activityRow({ actor: MEMBERS[0]!.user_id, on_behalf_of: null }),
    resolverFor(MEMBERS),
  );
  assert.match(text, new RegExp(MEMBERS[0]!.display_name), "the member's own name renders, not a raw id");
});

test("ActivityRow actor cell: the AGENT on behalf of a member reads 'Clara on behalf of <name>' with a REAL space", async () => {
  // #728 finding 2's own defect: <MemberName/> immediately followed by a conditional <span> on
  // the next JSX line has NO text node between them (JSX drops whitespace-only text between
  // sibling elements), so "Clara" and "on behalf of" landed glued together with nothing but a CSS
  // margin between them — "Claraon behalf of Tao", invisible to a screen reader or to anyone
  // copying the row's text. This cell is the regression guard for exactly that gap.
  const text = await renderRow(
    activityRow({ actor: AGENT_USER_ID, on_behalf_of: MEMBERS[0]!.user_id }),
    resolverFor(MEMBERS),
  );
  assert.match(text, /Clara on behalf of/, `expected a real space between the agent label and the delegation text, got: ${JSON.stringify(text)}`);
  assert.match(text, new RegExp(`Clara on behalf of ${MEMBERS[0]!.display_name}`));
  // The agent's own uuid must never appear as a truncated raw id (the walked defect's other half:
  // "00000000...").
  assert.ok(!text.includes(AGENT_USER_ID.slice(0, 8)), "the agent's short id must not leak — it must be labelled, not truncated");
});

test("ActivityRow actor cell: a KEPT sweep-heartbeat row (actor null, kind=agent, event_type=sweep.run_completed) reads 'Clara (system)'", async () => {
  // #728 finding 1 — 0183 excludes a zero-effect sweep heartbeat entirely; a row that survives the
  // door carries actor=null (the truth the door outputs) and kind='agent'/event_type=
  // 'sweep.run_completed' (the signal this component recognises — lib/firm/activity.ts's own
  // isSweepReceiptRow). Before this fix a null actor rendered as the honest-but-useless em dash
  // MemberName falls back to for any unresolved/absent id.
  const text = await renderRow(
    activityRow({
      source: "event", event_type: "sweep.run_completed", kind: "agent",
      actor: null, on_behalf_of: null, client_id: null, object_kind: null, object_id: null,
      description: "An autodraft sweep run completed.",
    }),
    resolverFor(MEMBERS),
  );
  assert.match(text, /Clara \(system\)/, `expected the system marker, got: ${JSON.stringify(text)}`);
  assert.ok(!text.includes("—"), "the em-dash 'unattributed' fallback must not render for a kept sweep row");
});

test("ActivityRow actor cell: a null actor on an ORDINARY (non-sweep) row still renders the honest fallback, not a fabricated system label", async () => {
  // The system label is scoped tightly to the one shape it is true of — a null actor elsewhere
  // (any other row this door could ever emit with no actor) must keep MemberName's own honest
  // fallback rather than borrowing this ticket's new label for a claim it does not support.
  const text = await renderRow(
    activityRow({ source: "event", event_type: "close.finalized", kind: "close", actor: null, on_behalf_of: null }),
    resolverFor(MEMBERS),
  );
  assert.ok(!text.includes("Clara (system)"), "a non-sweep null-actor row must not be mislabelled a system act");
});
