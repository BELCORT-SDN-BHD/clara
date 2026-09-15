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

import { textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import {
  ADMIN_CONTEXT,
  BOOKKEEPER_CONTEXT,
  INVITES,
  MEMBERS,
  OWNER_CONTEXT,
  attrOf,
  findAll,
  findIn,
  jsonResponse,
  mockMembersFetch,
  mountMembers,
  withMockedEnv,
  type StubNode,
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
        // CB-AE2E-004 (2026-09-04): the refusal now renders INSIDE the dialog, which
        // STAYS OPEN. The old assertion here was the mirror image — "the dialog closed
        // and the refusal stayed" — and it held only because the refusal painted on the
        // page behind a dialog that had just been thrown away. A modal that closes on a
        // refusal hides nothing today only because this panel happens to have no fields;
        // the law is one law for all fifteen wrappers.
        // #625 AC3: the confirmation now NAMES THE FIRM as well as the member, from the
        // `caller_context` row the panel already reads — "this firm" was ambiguous on a screen
        // someone may have open in two tabs.
        assert.match(after, /Remove Tao Lim from ROME PROPERTIES\?/, "the dialog must STAY OPEN, carrying the refusal the human has to read");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ---------------------------------------------------------------------------
// WALL 2 — the role ceiling
// ---------------------------------------------------------------------------

test("SHAPED: an ADMIN is not offered Owner at all (0157:277-279), and the three roles they MAY assign still send exactly what was clicked", async () => {
  // INVERTED 2026-09-04 (review-550, 裁-187 / ADR-0078 decision 2). This cell used
  // to require that "all four roles stayed on offer" and then drive an ADMIN into
  // `set_member_role`'s CLR04 ceiling. Under the ruling that control is not
  // rendered at all: `0157:277-279` refuses the assignment on RANK ALONE, which
  // this page positively reads, so offering "Owner" to an admin was offering a
  // control that could only refuse.
  //
  // The cell keeps everything that made it non-vacuous (independent review of
  // #455, MEDIUM-6) and moves it onto a role the admin MAY assign. THE MOCK
  // STILL READS THE REQUEST: it refuses the owner promotion — which must now be
  // unreachable — and answers a receipt for anything else, so the arguments the
  // panel actually sends are measured, not mocked into existence.
  const seen: Record<string, unknown>[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(ADMIN_CONTEXT);
    if (url.includes("/rpc/set_member_role")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      seen.push(body);
      if (body.p_membership === "m-book" && body.p_role === "owner") {
        return refusal("CLR04", "cannot assign a role above your own rank");
      }
      // ANY OTHER ARGUMENTS SUCCEED — which is what makes the assertion below a
      // measurement of what was sent rather than of what was mocked.
      return jsonResponse({ membership_id: String(body.p_membership), role: String(body.p_role) });
    }
    return mockMembersFetch(url);
  }) as unknown as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mountMembers();
    try {
      assert.ok(
        !/cannot assign a role above your own rank/.test(textOf(body as never)),
        "VACUITY GUARD: the message must NOT already be on the page",
      );

      await openRoleMenu(h, body, "Siti Rahman");
      // THE LADDER IS TRUNCATED AT THE CALLER'S OWN RANK. An admin sees three
      // items, not four — and the assertion is on the WHOLE list, so an
      // over-filter (hiding "Admin" too) reds it just as loudly as an under-filter.
      const offered = findAll(body, (n) => attrOf(n, "role") === "menuitemradio").map((n) => textOf(n as never).trim());
      assert.deepEqual(offered, ["Viewer", "Bookkeeper", "Admin"]);

      // …and a role they MAY assign still sends exactly what was clicked. This
      // half is what keeps the cell a measurement: mutate the row or the role in
      // the component and the mock answers a refusal instead of a receipt.
      await pickRole(h, body, "Bookkeeper");
      assert.equal(seen.length, 1, "exactly one governed call");
      assert.equal(seen[0]!.p_membership, "m-book", "the act named the row it was activated on");
      assert.equal(seen[0]!.p_role, "bookkeeper", "…and the role that was actually clicked");
      assert.equal(typeof seen[0]!.p_op_key, "string", "…under an op key the door requires");

      const after = textOf(body as never);
      assert.doesNotMatch(
        after,
        /cannot assign a role above your own rank/,
        "the ceiling is now unreachable from this control, so its refusal must never render here",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("WALL: an ADMIN inviting an owner gets invite_member's CLR04 verbatim, and the dialog stays open", async () => {
  // NOT VACUOUS ANY MORE (independent review of #455, MEDIUM-6). This cell used
  // to submit the dialog UNTOUCHED — an empty email at the default role — against
  // a mock that refused on the URL alone. It proved that a refusal envelope
  // renders, and nothing whatever about what the surface sent.
  //
  // Now: a real address is typed through the portal-capable helper, `owner` is
  // chosen on the role select, the caller is a positively-read ADMIN, and THE
  // COURIER MOCK READS THE POSTED BODY — refusing only for that address at that
  // role, and answering a successful issue for anything else.
  const posted: Record<string, unknown>[] = [];
  const TYPED = "newhire2@example.test";
  const impl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(ADMIN_CONTEXT);
    if (url === "/api/invite") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      posted.push(body);
      if (body.email === TYPED && body.role === "owner") {
        return jsonResponse(
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
        );
      }
      return jsonResponse({ ok: true, invite_id: "i-other", expires_at: "2026-09-06T00:00:00Z" });
    }
    return mockMembersFetch(url);
  }) as unknown as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mountMembers();
    try {
      assert.ok(
        !/cannot invite to a role above your own rank/.test(textOf(body as never)),
        "VACUITY GUARD: the message must NOT already be on the page",
      );

      const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone");
      assert.ok(trigger);
      await h.act(async () => {
        await clickButton(trigger as never);
      });
      for (let i = 0; i < 4; i++) await h.settle();

      // THE PORTAL-CAPABLE HELPER, not `h.fireEvent`: an open Base UI dialog's
      // content is portalled to `document.body`, a delegation root `fireEvent`
      // never reaches (Base UI's first dialog law). `setFieldValue`
      // invokes the live React `onChange` on the real node.
      const email = findIn(body, (n) => n.tagName === "INPUT" && attrOf(n, "type") === "email");
      const select = findIn(body, (n) => n.tagName === "SELECT");
      assert.ok(email && select, "the dialog's own controls must render");
      await h.act(() => {
        setFieldValue(email as never, TYPED);
      });
      await h.act(() => {
        setFieldValue(select as never, "owner");
      });
      await h.settle();

      const send = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Send invitation");
      assert.ok(send);
      await h.act(async () => {
        await clickButton(send as never);
      });
      for (let i = 0; i < 6; i++) await h.settle();

      // WHAT THE SURFACE ACTUALLY POSTED. Break either field in the dialog and
      // the mock answers `ok:true`, so the refusal assertions below find nothing.
      assert.equal(posted.length, 1, "exactly one courier round trip");
      assert.equal(posted[0]!.email, TYPED, "the typed address reached the wire");
      assert.equal(posted[0]!.role, "owner", "…and the chosen role did too");

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
  });
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
              // THE SHAPE THE COURIER REALLY SENDS NOW (independent review of
              // #455, MEDIUM-3): no `detail`, because the only string it used to
              // carry was the mail provider's own error text — and Resend had
              // been handed the full secret URL. What comes back instead is the
              // id the server logged the classified failure under.
              detail: null,
              correlation_id: "corr-9f2a",
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
        assert.match(after, /Reference corr-9f2a/, "THE CORRELATION ID IS RENDERED — an id nobody can see is not a support channel");
        assert.ok(
          !/450|mail provider rejected/.test(after),
          "NO PROVIDER TEXT ON SCREEN: the string that used to sit here had been in the same process as both invite secrets",
        );
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

// ===========================================================================
// #625 — WHERE A REFUSAL LANDS, WHAT A CONFIRMATION NAMES, AND WHAT A DOWNGRADE
// TAKES AWAY.
//
// AC3 and AC4. Three mechanisms, deliberately three separate cells, because they
// fail independently:
//   · a refusal raised BY a dialog must render INSIDE that dialog (the page-level
//     StateBanner sits behind the modal backdrop and cannot be read);
//   · a destructive confirmation must name the firm as well as the member;
//   · a caller downgraded mid-session must lose the controls their old rank shaped,
//     on the next AUTHORITATIVE response — which is a different mechanism from the
//     admin-only email column, and so gets a different cell.
// ===========================================================================

/** The OPEN DIALOG's own subtree. `mountMembers()` appends to `document.body` precisely because
 *  Base UI portals an open dialog there — which is why a `document.body` text scan cannot tell
 *  "inside the dialog" from "behind the backdrop", and why every cell below queries THIS node.
 *  (`members-fixtures.ts:179-183` records that reasoning at the fixture.) */
function openDialog(body: Parameters<typeof findIn>[0]): StubNode | null {
  return findIn(body, (n) => attrOf(n, "role") === "dialog");
}

async function openRemoveDialog(
  h: Awaited<ReturnType<typeof mountMembers>>["h"],
  body: Parameters<typeof findIn>[0],
  name: string,
): Promise<void> {
  await openRoleMenu(h, body, name);
  const remove = findIn(body, (n) => attrOf(n, "role") === "menuitem" && textOf(n as never).trim() === "Remove from firm");
  assert.ok(remove, "the row menu must offer Remove");
  await h.act(async () => { await clickButton(remove as never); });
  for (let i = 0; i < 4; i++) await h.settle();
}

async function clickInDialog(
  h: Awaited<ReturnType<typeof mountMembers>>["h"],
  body: Parameters<typeof findIn>[0],
  label: string,
): Promise<void> {
  const dialog = openDialog(body);
  assert.ok(dialog, "a dialog must be open");
  const button = findAll(dialog, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === label).at(-1);
  assert.ok(button, `the dialog's own ${label} control must render`);
  await h.act(async () => { await clickButton(button as never); });
  for (let i = 0; i < 6; i++) await h.settle();
}

test("p625.web.dialog_refusal: the REMOVE dialog renders the refusal inside ITS OWN subtree, not behind the backdrop", async () => {
  const calls: Call[] = [];
  await withMockedEnv(
    scripted({ remove_member: () => refusal("CLR09", "cannot demote/remove the last active owner") }, calls) as unknown as typeof fetch,
    async () => {
      const { h, body } = await mountMembers();
      try {
        await openRemoveDialog(h, body, "Tao Lim");
        await clickInDialog(h, body, "Remove");

        const dialog = openDialog(body);
        assert.ok(dialog, "the dialog must STAY OPEN on a refusal — CB-AE2E-004");
        const inside = textOf(dialog as never);
        assert.match(inside, /cannot demote\/remove the last active owner/, "the DB's own sentence, INSIDE the modal");
        assert.match(inside, /CLR09/, "…with its code as a chip");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p625.web.dialog_refusal: the REVOKE dialog renders its refusal inside its own subtree too", async () => {
  const calls: Call[] = [];
  await withMockedEnv(
    scripted({ revoke_invite: () => refusal("CLR09", "this invite is no longer open (status: accepted)") }, calls) as unknown as typeof fetch,
    async () => {
      const { h, body } = await mountMembers();
      try {
        const revokes = findAll(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Revoke");
        assert.ok(revokes.length >= 1);
        await h.act(async () => { await clickButton(revokes[0] as never); });
        for (let i = 0; i < 4; i++) await h.settle();
        await clickInDialog(h, body, "Revoke");

        const dialog = openDialog(body);
        assert.ok(dialog, "the dialog must stay open on a refusal");
        assert.match(textOf(dialog as never), /this invite is no longer open \(status: accepted\)/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("p625.web.dialog_refusal: the INVITE dialog carries its own refusal region, so a refused address is readable without closing the modal", async () => {
  const impl = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(ADMIN_CONTEXT);
    if (url === "/api/invite") {
      return jsonResponse(
        {
          ok: false,
          kind: "refusal",
          refusal: {
            code: "CLR04", message: "cannot invite to a role above your own rank",
            reason: null, status: 400, pgCode: "CLR04", codeSource: "sqlstate",
          },
        },
        400,
      );
    }
    return mockMembersFetch(url);
  }) as unknown as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mountMembers();
    try {
      const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone");
      assert.ok(trigger);
      await h.act(async () => { await clickButton(trigger as never); });
      for (let i = 0; i < 4; i++) await h.settle();
      const email = findIn(body, (n) => n.tagName === "INPUT" && attrOf(n, "type") === "email");
      assert.ok(email);
      await h.act(() => { setFieldValue(email as never, "newhire3@example.test"); });
      await h.settle();
      await clickInDialog(h, body, "Send invitation");

      const dialog = openDialog(body);
      assert.ok(dialog, "a governed refusal keeps the dialog open so the address survives");
      const inside = textOf(dialog as never);
      assert.match(inside, /cannot invite to a role above your own rank/, "the DB's sentence, INSIDE the modal");
      assert.match(inside, /CLR04/);
      // …and what was typed is still there to correct.
      const stillTyped = findIn(body, (n) => n.tagName === "INPUT" && attrOf(n, "type") === "email");
      assert.ok(stillTyped, "the address field is still mounted");
      assert.equal(
        (stillTyped as unknown as { value?: string }).value, "newhire3@example.test",
        "the typed address survives the refusal",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("p625.web.invite_invalid: the courier's typed ADDRESS verdicts mark the FIELD invalid; a refusal about something else does not", async () => {
  async function run(courierCode: string | null, expectInvalid: boolean): Promise<void> {
    const impl = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(ADMIN_CONTEXT);
      if (url === "/api/invite") {
        if (courierCode) return jsonResponse({ ok: false, kind: "courier", code: courierCode }, 400);
        return jsonResponse(
          {
            ok: false, kind: "refusal",
            refusal: {
              code: "CLR04", message: "cannot invite to a role above your own rank",
              reason: null, status: 400, pgCode: "CLR04", codeSource: "sqlstate",
            },
          },
          400,
        );
      }
      return mockMembersFetch(url);
    }) as unknown as typeof fetch;

    await withMockedEnv(impl, async () => {
      const { h, body } = await mountMembers();
      try {
        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone");
        assert.ok(trigger);
        await h.act(async () => { await clickButton(trigger as never); });
        for (let i = 0; i < 4; i++) await h.settle();
        const email = findIn(body, (n) => n.tagName === "INPUT" && attrOf(n, "type") === "email");
        assert.ok(email);
        assert.notEqual(attrOf(email as StubNode, "aria-invalid"), "true", "VACUITY GUARD: the field is valid before the act");
        await h.act(() => { setFieldValue(email as never, "not-deliverable@example.test"); });
        await h.settle();
        await clickInDialog(h, body, "Send invitation");

        const after = findIn(body, (n) => n.tagName === "INPUT" && attrOf(n, "type") === "email");
        assert.ok(after, "the dialog stays open so the address can be corrected");
        assert.equal(
          attrOf(after as StubNode, "aria-invalid") === "true", expectInvalid,
          `${courierCode ?? "a governed refusal"}: aria-invalid on the address should be ${expectInvalid}`,
        );
      } finally {
        await h.unmount();
      }
    });
  }

  // The courier's two ADDRESS verdicts — both typed codes, neither a message parsed by this app.
  await run("unsupported_address", true);
  await run("recipient_has_account", true);
  // A refusal about the ROLE is not the address's fault, and marking the address would be this
  // surface inventing a judgement the server did not make.
  await run(null, false);
});

test("p625.web.firm_named: BOTH destructive confirmations name the FIRM, from the caller_context row the panel already reads", async () => {
  await withMockedEnv(mockMembersFetch as unknown as typeof fetch, async () => {
    const { h, body } = await mountMembers();
    try {
      await openRemoveDialog(h, body, "Tao Lim");
      const removeDialog = openDialog(body);
      assert.ok(removeDialog, "the remove confirmation must open");
      const removeText = textOf(removeDialog as never);
      assert.match(removeText, /Tao Lim/, "the member, by name");
      assert.match(removeText, /ROME PROPERTIES/, "…and the firm, by name");

      // Close it and open the revoke confirmation.
      await clickInDialog(h, body, "Cancel");
      const revokes = findAll(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Revoke");
      assert.ok(revokes.length >= 1);
      await h.act(async () => { await clickButton(revokes[0] as never); });
      for (let i = 0; i < 4; i++) await h.settle();
      const revokeDialog = openDialog(body);
      assert.ok(revokeDialog, "the revoke confirmation must open");
      const revokeText = textOf(revokeDialog as never);
      assert.match(revokeText, /newhire@example\.test/, "the invited address");
      assert.match(revokeText, /ROME PROPERTIES/, "…and the firm");
    } finally {
      await h.unmount();
    }
  });
});

test("p625.web.downgrade: a caller downgraded between two settled reads loses the role menu AND the Invite entry — at the ROLE-CHANGE act site", async () => {
  let downgraded = false;
  const impl = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    // THE AUTHORITATIVE RESPONSE. The caller is an owner until the act lands; from the next read
    // on, the estate reports them as a bookkeeper — exactly what a concurrent demotion looks like.
    if (url.includes("/rest/v1/caller_context")) {
      return jsonResponse(downgraded ? BOOKKEEPER_CONTEXT : OWNER_CONTEXT);
    }
    if (url.includes("/rpc/set_member_role")) {
      downgraded = true;
      return jsonResponse({ membership_id: "m-book", role: "admin" });
    }
    return mockMembersFetch(url);
  }) as unknown as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mountMembers();
    try {
      // CONTROL — the owner really does hold both controls before the act.
      assert.ok(
        findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === "Actions for Siti Rahman"),
        "VACUITY GUARD: the role menu must be offered before the downgrade",
      );
      assert.ok(
        findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone"),
        "VACUITY GUARD: the Invite entry must be offered before the downgrade",
      );

      await openRoleMenu(h, body, "Siti Rahman");
      await pickRole(h, body, "Admin");

      assert.equal(
        findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === "Actions for Siti Rahman"), null,
        "the role menu must be GONE on the next authoritative response",
      );
      assert.equal(
        findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone"), null,
        "…and so must the Invite entry",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("p625.web.downgrade: the same is true at the INVITE act site, and on a REFUSED act — a refusal is an authoritative response too", async () => {
  let downgraded = false;
  const impl = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/rest/v1/caller_context")) {
      return jsonResponse(downgraded ? BOOKKEEPER_CONTEXT : ADMIN_CONTEXT);
    }
    if (url === "/api/invite") {
      // The estate refuses BECAUSE the caller was demoted; the panel must believe the read that
      // follows, not the rank it was shaped with when the dialog opened.
      downgraded = true;
      return jsonResponse(
        {
          ok: false, kind: "refusal",
          refusal: {
            code: "CLR04", message: "insufficient role",
            reason: null, status: 400, pgCode: "CLR04", codeSource: "sqlstate",
          },
        },
        400,
      );
    }
    return mockMembersFetch(url);
  }) as unknown as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mountMembers();
    try {
      const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone");
      assert.ok(trigger, "VACUITY GUARD: the admin holds the Invite entry before the act");
      await h.act(async () => { await clickButton(trigger as never); });
      for (let i = 0; i < 4; i++) await h.settle();
      const email = findIn(body, (n) => n.tagName === "INPUT" && attrOf(n, "type") === "email");
      assert.ok(email);
      await h.act(() => { setFieldValue(email as never, "newhire4@example.test"); });
      await h.settle();
      await clickInDialog(h, body, "Send invitation");

      assert.match(textOf(body as never), /insufficient role/, "the DB's own sentence is rendered");
      assert.equal(
        findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone"), null,
        "a REFUSED act still re-reads the caller context, so the entry the old rank shaped is gone",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("p625.web.email_mask: the admin-only email column masks on the next act-driven re-read — a DIFFERENT mechanism, proven separately", async () => {
  // NOT the capability object: `members-tables.tsx` renders `row.email ?? emailWithheld`, so this
  // column is DATA-DRIVEN and heals through `act()`'s unconditional re-read
  // (`lib/parts/hooks.ts:246`/`:251`) without any capability re-derivation at all. Two mechanisms,
  // two cells — folding them would let one of them rot behind the other's green.
  let masked = false;
  const impl = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/rest/v1/firm_members_visible")) {
      return jsonResponse(masked ? MEMBERS.map((m) => ({ ...m, email: null })) : MEMBERS);
    }
    if (url.includes("/rpc/set_member_role")) {
      // A REFUSED act, deliberately: `act()` re-reads on failure too, so the column must heal
      // even when nothing was changed.
      masked = true;
      return refusal("CLR04", "cannot act on a member ranked above you");
    }
    return mockMembersFetch(url);
  }) as unknown as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mountMembers();
    try {
      assert.match(textOf(body as never), /tao@example\.test/, "VACUITY GUARD: the admin-only column is populated first");

      await openRoleMenu(h, body, "Siti Rahman");
      await pickRole(h, body, "Admin");

      const after = textOf(body as never);
      assert.match(after, /cannot act on a member ranked above you/, "the act was REFUSED");
      assert.ok(!/tao@example\.test/.test(after), "…and the email column still masked on the re-read that followed");
      assert.match(after, /Not shown/, "the cell states the absence rather than going blank");
    } finally {
      await h.unmount();
    }
  });
});
