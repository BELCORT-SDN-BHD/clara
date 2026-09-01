// ONE HUMAN INTENT IS ONE GOVERNED CALL — independent review of #455, MEDIUM-4
// and LOW-10.
//
// THE DEFECT THIS FILE PINS, as measured on the branch before it: the row's role
// items carried `closeOnClick={false}`, no `disabled` and no guard, and the panel
// called `roster.act(...)` bare — so two clicks sent TWO `set_member_role` calls
// with TWO different op keys. Two governed writes from one intent, and the second
// can only duplicate the first or undo it. `lib/parts/single-fire-guard.ts`'s own
// header records why `disabled={busy}` is not enough on its own: `setBusy(true)`
// is synchronous but the `disabled` prop only takes effect on the NEXT render,
// and the race lives entirely inside that window.
//
// SO EVERY CELL HERE FIRES BOTH ACTIVATIONS INSIDE ONE `act()`, with no render in
// between. That is the exact window `disabled` cannot close and the ref-backed
// guard can — testing it any other way would be testing the affordance rather
// than the wall.
//
// AND EVERY CELL DEFERS ITS RPC, so the second activation genuinely lands while
// the first is still in flight rather than after it has settled.

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

type Recorded = { url: string; method: string; body: Record<string, unknown> | null };

/** A fetch that RECORDS EVERY REQUEST BODY and holds one RPC open until the test
 *  releases it. Recording the body is what turns "one call" into "one call, with
 *  these arguments and this op key" — a count alone cannot tell a retry from a
 *  second, different write. */
function deferrable(rpc: string, reply: () => unknown) {
  const calls: Recorded[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = null;
      }
    }
    calls.push({ url, method: init?.method ?? "GET", body });
    if (url.includes(`/rpc/${rpc}`)) {
      await gate;
      return jsonResponse(reply());
    }
    return mockMembersFetch(url);
  }) as unknown as typeof fetch;

  const of = (fn: string) => calls.filter((c) => c.url.includes(`/rpc/${fn}`));
  const readsOf = (relation: string) => calls.filter((c) => c.url.includes(`/rest/v1/${relation}`));
  return { fetchImpl, calls, release: () => release(), of, readsOf };
}

/** The op keys a set of recorded calls carried, deduplicated. Two calls sharing
 *  one key would be a replay; two keys are two distinct governed writes. */
function opKeys(calls: Recorded[]): string[] {
  return [...new Set(calls.map((c) => String(c.body?.p_op_key)))];
}

async function openRoleMenu(
  h: Awaited<ReturnType<typeof mountMembers>>["h"],
  body: Parameters<typeof findIn>[0],
  name: string,
) {
  const trigger = findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === `Actions for ${name}`);
  assert.ok(trigger, `the row menu trigger for ${name} must render`);
  await h.act(async () => {
    await clickButton(trigger as never);
  });
  for (let i = 0; i < 3; i++) await h.settle();
  return trigger;
}

function roleItem(body: Parameters<typeof findIn>[0], label: string) {
  const item = findAll(body, (n) => attrOf(n, "role") === "menuitemradio").find(
    (n) => textOf(n as never).trim() === label,
  );
  assert.ok(item, `the ${label} item must be offered`);
  return item;
}

// ---------------------------------------------------------------------------
// MEDIUM-4 — THE ROLE MENU
// ---------------------------------------------------------------------------

test("MEDIUM-4: two DIFFERENT roles activated in one tick send exactly ONE set_member_role", async () => {
  const net = deferrable("set_member_role", () => ({ membership_id: "m-book", role: "admin" }));
  await withMockedEnv(net.fetchImpl, async () => {
    const { h, body } = await mountMembers();
    try {
      await openRoleMenu(h, body, "Siti Rahman");
      // Both nodes captured BEFORE either fires — the real race is two events
      // already queued against the menu as it stood.
      const admin = roleItem(body, "Admin");
      const owner = roleItem(body, "Owner");
      assert.notEqual(admin, owner, "VACUITY GUARD: two DIFFERENT items, so a second call would be a different write");

      const readsBefore = net.readsOf("firm_members_visible").length;

      // ONE act, no render between them. `disabled` provably cannot help here.
      await h.act(() => {
        void clickButton(admin as never);
        void clickButton(owner as never);
      });

      assert.equal(
        net.of("set_member_role").length,
        1,
        "TWO CLICKS SENT TWO GOVERNED WRITES — the single-fire guard is not holding",
      );

      net.release();
      for (let i = 0; i < 8; i++) await h.settle();

      const acts = net.of("set_member_role");
      assert.equal(acts.length, 1, "…and no second call arrived after the first settled either");
      assert.equal(opKeys(acts).length, 1, "one op key — a second key would be a second, distinct write");
      assert.equal(acts[0]!.body?.p_membership, "m-book", "the act named the row it was activated on");
      assert.equal(acts[0]!.body?.p_role, "admin", "…and the FIRST role clicked, not the one that arrived second");

      const readsAfter = net.readsOf("firm_members_visible").length;
      assert.equal(readsAfter, readsBefore + 1, "exactly ONE re-read — every act re-reads, and one act re-reads once");

      assert.equal(
        findAll(body, (n) => attrOf(n, "role") === "menuitemradio").length,
        0,
        "THE MENU IS CLOSED — a selection takes its own popup away rather than leaving it armed",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("MEDIUM-4: the same double activation on a REFUSAL still sends one call, and the banner is reachable", async () => {
  const net = deferrable("set_member_role", () => ({}));
  // Re-wrap so the deferred RPC answers a governed refusal instead of a receipt.
  const refusing = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await (net.fetchImpl as (i: RequestInfo | URL, x?: RequestInit) => Promise<Response>)(input, init);
    if (String(input).includes("/rpc/set_member_role")) {
      return jsonResponse({ code: "CLR04", message: "cannot assign a role above your own rank" }, 400);
    }
    return res;
  }) as unknown as typeof fetch;

  await withMockedEnv(refusing, async () => {
    const { h, body } = await mountMembers();
    try {
      assert.ok(
        !/cannot assign a role above your own rank/.test(textOf(body as never)),
        "VACUITY GUARD: the refusal must not already be on the page",
      );

      await openRoleMenu(h, body, "Siti Rahman");
      const admin = roleItem(body, "Admin");
      const owner = roleItem(body, "Owner");

      await h.act(() => {
        void clickButton(admin as never);
        void clickButton(owner as never);
      });
      net.release();
      for (let i = 0; i < 8; i++) await h.settle();

      assert.equal(net.of("set_member_role").length, 1, "a refused act is still ONE act");

      const after = textOf(body as never);
      assert.match(after, /cannot assign a role above your own rank/, "the DB's own sentence, verbatim…");
      assert.match(after, /CLR04/, "…with its code as a chip");
      // The refusal renders ABOVE THE TABLE, outside the popup — which is the
      // whole reason closing the menu on selection costs nothing.
      assert.equal(
        findAll(body, (n) => attrOf(n, "role") === "menuitemradio").length,
        0,
        "the menu closed and the refusal survived it",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("MEDIUM-4: the Remove control beside the roles still opens its dialog and acts ONCE", async () => {
  const net = deferrable("remove_member", () => ({ membership_id: "m-book" }));
  await withMockedEnv(net.fetchImpl, async () => {
    const { h, body } = await mountMembers();
    try {
      await openRoleMenu(h, body, "Siti Rahman");
      const remove = findIn(
        body,
        (n) => attrOf(n, "role") === "menuitem" && textOf(n as never).trim() === "Remove from firm",
      );
      assert.ok(remove, "the Remove item must still be offered beside the four roles");
      await h.act(async () => {
        await clickButton(remove as never);
      });
      for (let i = 0; i < 4; i++) await h.settle();

      const confirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Remove");
      assert.ok(confirm, "the dialog's own Remove must render");

      await h.act(() => {
        void clickButton(confirm as never);
        void clickButton(confirm as never);
      });
      net.release();
      for (let i = 0; i < 8; i++) await h.settle();

      const acts = net.of("remove_member");
      assert.equal(acts.length, 1, "one confirm is one removal, however many times it was activated");
      assert.equal(opKeys(acts).length, 1);
      assert.equal(acts[0]!.body?.p_membership, "m-book", "…naming the membership the row carried");
    } finally {
      await h.unmount();
    }
  });
});

// ---------------------------------------------------------------------------
// LOW-10 — REMOVE AND REVOKE: THE ARGUMENTS, THE OP KEY, AND THE RE-READ
// ---------------------------------------------------------------------------

test("LOW-10: a double-activated REVOKE sends one revoke_invite, and the UI comes from the re-read", async () => {
  const calls: Recorded[] = [];
  let revoked = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const impl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = null;
      }
    }
    calls.push({ url, method: init?.method ?? "GET", body });
    if (url.includes("/rpc/revoke_invite")) {
      await gate;
      revoked = true;
      return jsonResponse({ invite_id: "i-pending" });
    }
    if (url.includes("/rest/v1/firm_invites_visible")) {
      // THE RE-READ DISAGREES WITH THE CLICK ON PURPOSE. Whatever the row shows
      // afterwards is proof of which one the panel trusted.
      return jsonResponse(
        revoked
          ? INVITES.map((i) => (i.id === "i-pending" ? { ...i, status: "revoked", email: "after-the-reread@example.test" } : i))
          : INVITES,
      );
    }
    return mockMembersFetch(url);
  }) as unknown as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mountMembers();
    try {
      assert.ok(
        !/after-the-reread/.test(textOf(body as never)),
        "VACUITY GUARD: the re-read's row is not on the page yet",
      );
      const readsBefore = calls.filter((c) => c.url.includes("firm_invites_visible")).length;

      const revokes = findAll(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Revoke");
      assert.equal(revokes.length, 2, "one Revoke per invite row");
      await h.act(async () => {
        await clickButton(revokes[0] as never);
      });
      for (let i = 0; i < 4; i++) await h.settle();

      const confirm = findAll(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Revoke").at(-1);
      assert.ok(confirm, "the dialog's own Revoke must render");

      await h.act(() => {
        void clickButton(confirm as never);
        void clickButton(confirm as never);
      });
      release();
      for (let i = 0; i < 8; i++) await h.settle();

      const acts = calls.filter((c) => c.url.includes("/rpc/revoke_invite"));
      assert.equal(acts.length, 1, "two activations, ONE revoke");
      assert.equal(opKeys(acts).length, 1, "…under one op key");
      assert.equal(acts[0]!.body?.p_invite, "i-pending", "…naming the invite the row carried");

      const readsAfter = calls.filter((c) => c.url.includes("firm_invites_visible")).length;
      assert.ok(readsAfter > readsBefore, "the act re-read the list unconditionally");
      assert.match(
        textOf(body as never),
        /after-the-reread@example\.test/,
        "the row on screen came from the RE-READ, never from the write's own receipt",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("LOW-10: a double-activated REMOVE re-reads the roster and paints the RE-READ's value", async () => {
  const calls: Recorded[] = [];
  let removed = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const impl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = null;
      }
    }
    calls.push({ url, method: init?.method ?? "GET", body });
    if (url.includes("/rpc/remove_member")) {
      await gate;
      removed = true;
      return jsonResponse({ membership_id: "m-book" });
    }
    if (url.includes("/rest/v1/firm_members_visible")) {
      return jsonResponse(
        MEMBERS.map((m) =>
          m.membership_id === "m-book" && removed
            ? { ...m, status: "removed", removed_at: "2026-08-30T00:00:00Z" }
            : m,
        ),
      );
    }
    return mockMembersFetch(url);
  }) as unknown as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mountMembers();
    try {
      assert.ok(!/Removed 2026-08-30/.test(textOf(body as never)), "VACUITY GUARD: the row is still active");

      await openRoleMenu(h, body, "Siti Rahman");
      const remove = findIn(
        body,
        (n) => attrOf(n, "role") === "menuitem" && textOf(n as never).trim() === "Remove from firm",
      );
      await h.act(async () => {
        await clickButton(remove as never);
      });
      for (let i = 0; i < 4; i++) await h.settle();

      const confirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Remove");
      assert.ok(confirm);
      await h.act(() => {
        void clickButton(confirm as never);
        void clickButton(confirm as never);
      });
      release();
      for (let i = 0; i < 8; i++) await h.settle();

      const acts = calls.filter((c) => c.url.includes("/rpc/remove_member"));
      assert.equal(acts.length, 1);
      assert.equal(opKeys(acts).length, 1);
      assert.equal(acts[0]!.body?.p_membership, "m-book");
      assert.match(
        textOf(body as never),
        /Removed 2026-08-30/,
        "the roster shows what the RE-READ returned, and the removed row has no menu at all",
      );
    } finally {
      await h.unmount();
    }
  });
});
