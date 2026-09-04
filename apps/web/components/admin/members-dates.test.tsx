// E-8 / CB-AE2E-025 — the two defects on /admin/members that had nothing to do
// with permissions: every date on the page was a raw UTC slice, and the roster's
// h2 repeated the page's own h1.
//
// THE DATE ONE IS A WRONG NUMBER ON SCREEN, not a cosmetic. `firm_memberships
// .created_at` is `timestamptz` (0002_foundation.sql:218), PostgREST serialises
// timestamptz in UTC, and Malaysia is UTC+8 — so the old `iso.slice(0, "T")`
// rendered the PREVIOUS DAY for anything recorded between 00:00 and 08:00 MYT,
// on all four columns that used it. These cells fixture exactly that window and
// require the MYT day. They fail against the code that shipped.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INVITES,
  MEMBERS,
  attrOf,
  findAll,
  findIn,
  jsonResponse,
  mockMembersFetch,
  mountMembers,
  withMockedEnv,
  type StubNode,
} from "./members-fixtures";
import { textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";

enableDomInspection();

/** 01:30 MYT on 2026-09-04 is 17:30 UTC on 2026-09-03 — the exact shape the
 *  reporter hit. Every fixture below sits inside that window on purpose. */
const MYT_EARLY_MORNING = {
  joined: "2026-09-03T17:30:00+00:00", // 2026-09-04 01:30 MYT
  removed: "2026-09-03T16:00:00+00:00", // 2026-09-04 00:00 MYT
  sent: "2026-09-03T18:15:00+00:00", // 2026-09-04 02:15 MYT
  expires: "2026-09-03T20:45:00+00:00", // 2026-09-04 04:45 MYT
};

const SHIFTED_MEMBERS = [
  { ...MEMBERS[0], created_at: MYT_EARLY_MORNING.joined },
  { ...MEMBERS[2], created_at: MYT_EARLY_MORNING.joined, removed_at: MYT_EARLY_MORNING.removed },
];
const SHIFTED_INVITES = [
  { ...INVITES[0], created_at: MYT_EARLY_MORNING.sent, expires_at: MYT_EARLY_MORNING.expires },
];

function mockShifted(u: string): Response {
  if (u.includes("/rest/v1/firm_members_visible")) return jsonResponse(SHIFTED_MEMBERS);
  if (u.includes("/rest/v1/firm_invites_visible")) return jsonResponse(SHIFTED_INVITES);
  return mockMembersFetch(u);
}

test("all FOUR date columns render the Malaysian business day, not the UTC one", async () => {
  await withMockedEnv(
    async (u) => mockShifted(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const text = textOf(body as never);
        // Joined, Removed, Sent and Expires all sit in the 00:00-08:00 MYT
        // window, so every one of them read 2026-09-03 before this fix.
        assert.match(text, /2026-09-04/, "the MYT day must render");
        assert.doesNotMatch(
          text,
          /2026-09-03/,
          "the UTC day must not appear anywhere — that is the defect: a membership created at 01:30 MYT rendered as the previous day",
        );
        // DISCRIMINATING: prove the page actually rendered the four columns,
        // so "no 2026-09-03" is a finding rather than an empty table.
        for (const column of ["Joined", "Sent", "Expires"]) {
          assert.match(text, new RegExp(column), `the ${column} column must be on screen`);
        }
        assert.match(text, /Removed 2026-09-04/, "the removed-on line renders through the same formatter");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a null date still renders nothing — the guard the local helper carried is preserved", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/firm_members_visible")) {
        return jsonResponse([{ ...MEMBERS[0], removed_at: null }]);
      }
      return mockMembersFetch(url);
    },
    async () => {
      const { h, body } = await mountMembers();
      try {
        assert.doesNotMatch(textOf(body as never), /Removed /, "an active membership carries no removed-on line at all");
        assert.doesNotMatch(textOf(body as never), /Invalid Date/, "and a null must never reach the formatter's failure text");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the roster h2 no longer repeats the page h1, and both sections still carry a level-2 heading", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const headings = findAll(body as StubNode, (n) => n.tagName === "H2").map((n) => textOf(n as never).trim());
        // The heading TREE is unchanged — members-a11y depends on both sections
        // carrying an h2, so this is a rename, never a deletion.
        assert.equal(headings.length, 2, `expected two level-2 sections, got ${headings.join(" | ")}`);
        assert.deepEqual(headings, ["Everyone with access", "Pending invites"]);
        const h1 = findIn(body as StubNode, (n) => n.tagName === "H1");
        assert.ok(h1, "the page h1 must be present in this mount");
        assert.notEqual(
          textOf(h1 as never).trim(),
          headings[0],
          "the roster h2 must not repeat the h1 — two 'Members' headings stacked is the reported defect",
        );
        // The page description no longer echoes the new h2 either.
        void attrOf;
      } finally {
        await h.unmount();
      }
    },
  );
});
