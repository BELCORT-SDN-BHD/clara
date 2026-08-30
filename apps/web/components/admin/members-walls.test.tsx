// THE THREE WALLS, RENDERED AND NEVER PRE-EMPTED — plus the courier's own
// failures and the no-optimistic-UI re-read. P4-4.
//
// The a11y and keyboard cells beside this file prove the surface SCANS and WALKS;
// this one proves it TELLS THE TRUTH when the DB says no. Each cell drives a real
// click through `clickButton` (the one shared instrument — `h.fireEvent` silently
// no-ops inside an open dialog) and asserts a DISCRIMINATING post-condition: the
// DB's own sentence, which appears nowhere on the page before that click.
//
// THE WALLS:
//   1. LAST OWNER   `_tf_guard_last_owner` (`0003:423`) → CLR09 'cannot
//      demote/remove the last active owner'. Fires on demotion AND on removal.
//   2. ROLE CEILING `set_member_role` (`0145:603`) and `invite_member`
//      (`0147:386`) → CLR04 'cannot assign/invite to a role above your own rank'.
//   3. FIRM WALL    CLR11 'membership not in your firm' / 'membership is not
//      active'.
// None is pre-empted: the click happens, and the message renders verbatim.

import { test } from "node:test";
import assert from "node:assert/strict";

import { textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
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
} from "./members-fixtures";

enableDomInspection();

/** A governed refusal exactly as PostgREST relays one: a non-2xx whose body
 *  carries the CLR SQLSTATE and the DB's own message. `lib/wire.ts`'s
 *  `classifyPgrestFailure` turns this into the `RefusalError` the panel renders. */
function refusal(code: string, message: string): Response {
  return jsonResponse({ code, message }, 400);
}

type Call = { url: string; method: string };

/** A fetch that records every call and lets one RPC be scripted. */
function scripted(rpc: Record<string, () => Response>, calls: Call[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    for (const [fn, make] of Object.entries(rpc)) {
      if (url.includes(`/rpc/${fn}`) || url === fn) return make();
    }
    return mockMembersFetch(url);
  };
}

async function openRoleMenu(h: Awaited<ReturnType<typeof mountMembers>>["h"], body: Parameters<typeof findIn>[0], name: string) {
  const trigger = findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === `Actions for ${name}`);
  assert.ok(trigger, `the row menu trigger for ${name} must render`);
  await h.act(async () => {
    await clickButton(trigger as never);
  });
  for (let i = 0; i < 3; i++) await h.settle();
}

async function pickRole(h: Awaited<ReturnType<typeof mountMembers>>["h"], body: Parameters<typeof findIn>[0], role: string) {
  const item = findAll(body, (n) => attrOf(n, "role") === "menuitemradio").find(
    (n) => textOf(n as never).trim() === role,
  );
  assert.ok(item, `the ${role} item must be offered`);
  await h.act(async () => {
    await clickButton(item as never);
  });
  for (let i = 0; i < 5; i++) await h.settle();
}

// ---------------------------------------------------------------------------
// WALL 1 — the last owner
// ---------------------------------------------------------------------------

test("WALL: demoting the last owner renders CLR09 VERBATIM, and the menu never pre-empted it", async () => {
  const calls: Call[] = [];
  await withMockedEnv(
    scripted(
      { set_member_role: () => refusal("CLR09", "cannot demote/remove the last active owner") },
      calls,
    ) as unknown as typeof fetch,
    async () => {
      const { h, body } = await mountMembers();
      try {
        const before = textOf(body as never);
        assert.ok(
          !/cannot demote\/remove the last active owner/.test(before),
          "VACUITY GUARD: the message must NOT already be on the page — otherwise this cell proves nothing",
        );

        await openRoleMenu(h, body, "Tao Lim");
        // The demotion IS offered on the last owner's own row. Greying it out
        // would be the UI counting owners the DB has to count.
        await pickRole(h, body, "Bookkeeper");

        const after = textOf(body as never);
        assert.match(after, /cannot demote\/remove the last active owner/, "the DB's own sentence, verbatim");
        assert.match(after, /CLR09/, "…and its code, as a chip");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("WALL: removing the last owner renders the same CLR09 through the confirm dialog", async () => {
  const calls: Call[] = [];
  await withMockedEnv(
    scripted({ remove_member: () => refusal("CLR09", "cannot demote/remove the last active owner") }, calls) as unknown as typeof fetch,
    async () => {
      const { h, body } = await mountMembers();
      try {
        await openRoleMenu(h, body, "Tao Lim");
        const remove = findIn(body, (n) => attrOf(n, "role") === "menuitem" && textOf(n as never).trim() === "Remove from firm");
        assert.ok(remove);
        await h.act(async () => {
          await clickButton(remove as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();

        const confirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Remove");
        assert.ok(confirm, "the dialog's own Remove must render");
        assert.equal((confirm as unknown as { disabled: boolean }).disabled, false);
        await h.act(async () => {
          await clickButton(confirm as never);
        });
        for (let i = 0; i < 6; i++) await h.settle();

        const after = textOf(body as never);
        assert.match(after, /cannot demote\/remove the last active owner/);
        // The refusal renders OUTSIDE the dialog, so it survives the close — a
        // message that vanished with the dialog would be a refusal nobody read.
        assert.ok(!/Remove Tao Lim from this firm\?/.test(after), "the dialog closed and the refusal stayed");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// WALL 2 — the role ceiling
// ---------------------------------------------------------------------------

test("WALL: the role ceiling renders CLR04 verbatim, and all four roles stayed on offer", async () => {
  const calls: Call[] = [];
  await withMockedEnv(
    scripted({ set_member_role: () => refusal("CLR04", "cannot assign a role above your own rank") }, calls) as unknown as typeof fetch,
    async () => {
      const { h, body } = await mountMembers();
      try {
        await openRoleMenu(h, body, "Siti Rahman");
        // The proof that nothing was filtered: `owner` is offered to a caller
        // this fixture's door will refuse for asking.
        const offered = findAll(body, (n) => attrOf(n, "role") === "menuitemradio").map((n) => textOf(n as never).trim());
        assert.deepEqual(offered, ["Viewer", "Bookkeeper", "Admin", "Owner"]);
        await pickRole(h, body, "Owner");

        const after = textOf(body as never);
        assert.match(after, /cannot assign a role above your own rank/);
        assert.match(after, /CLR04/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("WALL: the courier relays invite_member's CLR04 ceiling verbatim, and keeps the dialog open", async () => {
  const calls: Call[] = [];
  await withMockedEnv(
    scripted(
      {
        "/api/invite": () =>
          jsonResponse(
            {
              ok: false,
              kind: "refusal",
              refusal: {
                code: "CLR04",
                message: "cannot invite to a role above your own rank",
                reason: null,
                status: 400,
                pgCode: "CLR04",
                codeSource: "sqlstate",
              },
            },
            400,
          ),
      },
      calls,
    ) as unknown as typeof fetch,
    async () => {
      const { h, body } = await mountMembers();
      try {
        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone");
        assert.ok(trigger);
        await h.act(async () => {
          await clickButton(trigger as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();

        const send = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Send invitation");
        assert.ok(send);
        await h.act(async () => {
          await clickButton(send as never);
        });
        for (let i = 0; i < 6; i++) await h.settle();

        const after = textOf(body as never);
        assert.match(after, /cannot invite to a role above your own rank/, "a refusal that crossed the courier is still the DB's own sentence");
        assert.match(after, /CLR04/);
        // The dialog stays OPEN on a governed refusal, so the role can be
        // corrected without retyping the address.
        assert.match(after, /Invite someone to this firm/, "a refusal must not throw away what was typed");
        // …and the surface must not ALSO claim the invitation was sent.
        assert.ok(!/was sent\./.test(after), "a refused invite must never report a send");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// THE COURIER'S OWN FAILURES — distinct from a governed refusal
// ---------------------------------------------------------------------------

test("the courier's mail_failed renders under its OWN title, names the invite, and re-reads the list", async () => {
  const calls: Call[] = [];
  await withMockedEnv(
    scripted(
      {
        "/api/invite": () =>
          jsonResponse(
            {
              ok: false,
              kind: "courier",
              code: "mail_failed",
              message: "the invite was created but the email could not be sent",
              invite: { invite_id: "i-new", expires_at: "2026-09-06T00:00:00Z" },
              detail: "450: the mail provider rejected the recipient",
            },
            502,
          ),
      },
      calls,
    ) as unknown as typeof fetch,
    async () => {
      const { h, body } = await mountMembers();
      try {
        const readsBefore = calls.filter((c) => c.url.includes("firm_invites_visible")).length;
        assert.ok(readsBefore >= 1, "the invite list must have been read on mount");

        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone");
        await h.act(async () => {
          await clickButton(trigger as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();
        const send = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Send invitation");
        await h.act(async () => {
          await clickButton(send as never);
        });
        for (let i = 0; i < 6; i++) await h.settle();

        const after = textOf(body as never);
        assert.match(after, /The invitation was not sent/, "the courier's failures carry their OWN title, never the DB's voice");
        assert.match(after, /its link cannot be recovered/);
        assert.match(after, /450: the mail provider rejected the recipient/, "the provider's own detail is relayed");
        assert.ok(!/was sent\./.test(after), "a failed send must never also claim success");

        // A courier failure still RE-READS: `mail_failed` means the invite EXISTS,
        // and the admin has to see it in the list in order to revoke it.
        const readsAfter = calls.filter((c) => c.url.includes("firm_invites_visible")).length;
        assert.ok(readsAfter > readsBefore, "the invite list must be re-read after a mail_failed");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a successful invite closes the dialog, says so, and shows the row the RE-READ returned", async () => {
  const calls: Call[] = [];
  let issued = false;
  await withMockedEnv(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url === "/api/invite") {
        issued = true;
        return jsonResponse({ ok: true, invite_id: "i-new", expires_at: "2026-09-06T00:00:00Z" });
      }
      if (url.includes("/rest/v1/firm_invites_visible")) {
        // NO OPTIMISTIC UI: the new row appears only because the RE-READ returned
        // it. If the panel painted the courier's own receipt instead, this row's
        // email would be whatever was typed — and this fixture never types one.
        return jsonResponse(
          issued
            ? [
                {
                  id: "i-new",
                  firm_id: "f-1",
                  email: "from-the-reread@example.test",
                  role: "bookkeeper",
                  status: "pending",
                  invited_by: "u-owner",
                  created_at: "2026-08-30T00:00:00Z",
                  expires_at: "2026-09-06T00:00:00Z",
                  accepted_at: null,
                  revoked_at: null,
                },
                ...INVITES,
              ]
            : INVITES,
        );
      }
      return mockMembersFetch(url);
    }) as unknown as typeof fetch,
    async () => {
      const { h, body } = await mountMembers();
      try {
        assert.ok(!/from-the-reread/.test(textOf(body as never)), "VACUITY GUARD: the new row is not there yet");

        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone");
        await h.act(async () => {
          await clickButton(trigger as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();
        const send = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Send invitation");
        await h.act(async () => {
          await clickButton(send as never);
        });
        for (let i = 0; i < 6; i++) await h.settle();

        const after = textOf(body as never);
        assert.ok(!/Invite someone to this firm/.test(after), "a successful invite closes the dialog");
        assert.match(after, /from-the-reread@example\.test/, "the row came from the RE-READ, not from the write's own view");
        assert.match(after, /The invitation to .* was sent\./);
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// NO OPTIMISTIC UI
// ---------------------------------------------------------------------------

test("a role change re-reads the roster and paints the RE-READ's value, not the click's", async () => {
  const calls: Call[] = [];
  let changed = false;
  await withMockedEnv(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.includes("/rpc/set_member_role")) {
        changed = true;
        return jsonResponse({ membership_id: "m-book", role: "admin" });
      }
      if (url.includes("/rest/v1/firm_members_visible")) {
        // The DB's answer disagrees with the click ON PURPOSE. Whatever the row
        // shows afterwards is proof of which one the panel trusted.
        return jsonResponse(
          MEMBERS.map((m) =>
            m.membership_id === "m-book" && changed ? { ...m, role: "viewer", role_rank: 0 } : m,
          ),
        );
      }
      return mockMembersFetch(url);
    }) as unknown as typeof fetch,
    async () => {
      const { h, body } = await mountMembers();
      try {
        const readsBefore = calls.filter((c) => c.url.includes("firm_members_visible")).length;
        await openRoleMenu(h, body, "Siti Rahman");
        await pickRole(h, body, "Admin");

        const readsAfter = calls.filter((c) => c.url.includes("firm_members_visible")).length;
        assert.ok(readsAfter > readsBefore, "every act re-reads — hydrate-never-trust");

        const menuTrigger = findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === "Actions for Siti Rahman");
        assert.ok(menuTrigger);
        assert.equal(
          textOf(menuTrigger as never).trim(),
          "Viewer",
          "the row shows what the RE-READ returned ('viewer'), NEVER the role that was clicked ('Admin')",
        );
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a revoke re-reads the invite list and renders CLR09 verbatim when the invite is already closed", async () => {
  const calls: Call[] = [];
  await withMockedEnv(
    scripted({ revoke_invite: () => refusal("CLR09", "this invite is no longer open (status: accepted)") }, calls) as unknown as typeof fetch,
    async () => {
      const { h, body } = await mountMembers();
      try {
        const revokes = findAll(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Revoke");
        assert.equal(revokes.length, 2);
        await h.act(async () => {
          await clickButton(revokes[0] as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();
        const confirm = findAll(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Revoke").at(-1);
        assert.ok(confirm, "the dialog's own Revoke must render");
        await h.act(async () => {
          await clickButton(confirm as never);
        });
        for (let i = 0; i < 6; i++) await h.settle();

        const after = textOf(body as never);
        assert.match(after, /this invite is no longer open \(status: accepted\)/, "the DB's own sentence, parameter and all");
        assert.match(after, /CLR09/);
      } finally {
        await h.unmount();
      }
    },
  );
});
