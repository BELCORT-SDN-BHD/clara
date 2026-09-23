// components/admin/members-tables.tsx — `InvitesTable`'s read-time EFFECTIVE STATUS rendering.
//
// #872 (migration 0269): a fifth, read-time-only effective status, `issuer_lapsed`, computed by
// `clara.firm_invites_visible` when a still-pending invite's issuer no longer holds an active
// admin-or-above membership. This is the seam the ticket's own brief names — "both surfaces
// render it with its label and a one-line notice" — for the ADMIN ROSTER half; the invitee-facing
// half is `components/invite-accept-form.test.tsx`'s own cells.
//
// MOUNTED DIRECTLY, not through `MembersPanel`: the shared `INVITES` fixture in
// `members-fixtures.ts` is hard-counted by `members-single-fire.test.tsx` and
// `members-keyboard.test.tsx` ("two invite rows carry Revoke"), so a third row there would be a
// silent regression in files this ticket never touches. `InvitesTable` takes its rows as a prop —
// exactly the "component's rendered behaviour" seam `.claude/skills/tdd/tests.md` asks for — so
// this file drives it with its OWN row, never the shared array.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf } from "../../test/hookHarness";
import { App } from "./members-fixtures";
import { InvitesTable } from "./members-tables";
import type { FirmInviteRow } from "../../lib/members/reads";

function row(overrides: Partial<FirmInviteRow>): FirmInviteRow {
  return {
    id: "i-base",
    firm_id: "f-1",
    email: "future-hire@example.test",
    role: "admin",
    status: "pending",
    invited_by: "u-admin",
    created_at: "2026-09-01T00:00:00Z",
    expires_at: "2026-09-08T00:00:00Z",
    accepted_at: null,
    revoked_at: null,
    ...overrides,
  };
}

async function mountInvites(rows: FirmInviteRow[]) {
  const h = await renderComponent(
    App(
      createElement(InvitesTable, {
        rows,
        loading: false,
        failed: false,
        busy: false,
        canRevokeInvite: false,
        onRevoke: () => {},
      }),
      "Invites",
    ),
  );
  await h.settle();
  return h;
}

test("p872.invites_table: `issuer_lapsed` renders its OWN label and a one-line notice, never the raw DB token", async () => {
  const h = await mountInvites([row({ id: "i-lapsed", status: "issuer_lapsed" })]);
  try {
    const text = textOf(h.container as never);
    assert.match(text, /Issuer lapsed/, "the KNOWN label, mapped from Members.invites.statusIssuerLapsed");
    assert.match(text, /no longer admin or owner/i, "the one-line notice this status carries");
    assert.equal(text.includes("issuer_lapsed"), false, "the raw DB string is never shown to a person");
  } finally {
    await h.unmount();
  }
});

test("p872.invites_table: the four pre-existing statuses render exactly as before -- no notice, their own label", async () => {
  for (const [status, label] of [
    ["pending", "Pending"],
    ["expired", "Expired"],
    ["accepted", "Accepted"],
    ["revoked", "Revoked"],
  ] as const) {
    const h = await mountInvites([row({ id: `i-${status}`, status })]);
    try {
      const text = textOf(h.container as never);
      assert.match(text, new RegExp(label), `${status} -> ${label}`);
      assert.doesNotMatch(text, /no longer admin or owner/i, `${status} must carry no issuer_lapsed notice`);
    } finally {
      await h.unmount();
    }
  }
});

test("p872.invites_table: an UNKNOWN sixth status still renders raw, exactly as the closed-world guard already did for the first five", async () => {
  const h = await mountInvites([row({ id: "i-unknown", status: "cancelled" })]);
  try {
    assert.match(textOf(h.container as never), /cancelled/);
  } finally {
    await h.unmount();
  }
});
