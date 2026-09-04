// 裁-117 — the thread menu, driven through the REAL rail and the REAL wire client.
//
// THE THINGS THIS PROVES, each with a post-condition that is false before it:
//   1. MOUNTING CREATES NOTHING. The rail used to mint a `clara.chat_sessions` row on
//      every altitude it had never seen (a mount effect), and that row can never be
//      archived or deleted (0006's `_tf_chat_session_update` raises CLR08 on DELETE and
//      on every non-visibility UPDATE). The router below THROWS on an unexpected call,
//      so a regression is a hard failure and not just a count that drifted.
//   2. AN EMPTY ALTITUDE OFFERS, IT DOES NOT SPIN. The state that could not exist while
//      resolving also created; under the old loader condition it would have read
//      "Finding your conversation with Clara…" forever.
//   3. NEW THREAD CREATES AND SELECTS. One POST, and the rail is then showing the NEW
//      thread's own transcript — not the old one with a new id behind it.
//   4. SWITCHING SELECTS WITHOUT CREATING, and the switcher lists the caller's OWN
//      threads only, though the wire also delivers colleagues' firm-shared ones.
//   5. ARCHIVE IS NAMED AS NOT BUILT, and CLEAR/DELETE do not exist at all.
//
// The instrument is `ClaraRail` itself, because the menu lives in its header and the
// creator/selector are the hook's own returns threaded through it. `rail-boundary.test.tsx`
// owns the altitude-key half and keeps its own mount point (`RailMount`) for that reason.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraRail } from "./ClaraRail";
import { clickButton, renderComponent, textOf } from "../../test/hookHarness";
import { activeElement, enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const THREAD_NEW = "aaaaaaaa-1111-4111-8111-111111111111";
const THREAD_OLD = "bbbbbbbb-1111-4111-8111-111111111111";
const THREAD_MINTED = "cccccccc-1111-4111-8111-111111111111";
const THREAD_SHARED = "dddddddd-1111-4111-8111-111111111111";
const CALLER = "99999999-9999-4999-8999-999999999999";
const COLLEAGUE = "88888888-8888-4888-8888-888888888888";

const TOKEN = `x.${Buffer.from(JSON.stringify({ sub: CALLER })).toString("base64url")}.y`;

/** The `created_at` the harness gives a CREATED row. Deliberately far from any day this
 *  suite could run on: a cell that asks whether the menu shows the LEDGER's time or the
 *  BROWSER's cannot tell them apart if the fixture happens to be dated today. */
const MINTED_LEDGER_TIME = "2019-03-14T09:26:53Z";

/** THE PER-ALTITUDE SELECTION IS MODULE-LEVEL AND OUTLIVES A CELL, so every cell gets
 *  its own altitude key rather than scrubbing a shared one — a choice one cell made
 *  would otherwise steer the next cell's resolve, which is the same cross-fixture bleed
 *  `../../e2e/e2e-fixture-ownership.test.ts` exists to stop in the e2e lane. */
let altitudeSeq = 0;
function freshClient(): string {
  altitudeSeq += 1;
  return `22222222-2222-4222-8222-2222222222${String(altitudeSeq).padStart(2, "0")}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type Row = { id: string; title: string | null; client_id: string; visibility: string; created_by: string; created_at: string };

const row = (clientId: string, id: string, createdAt: string, createdBy = CALLER, visibility = "private"): Row =>
  ({ id, title: null, client_id: clientId, visibility, created_by: createdBy, created_at: createdAt });

const transcript = (threadId: string, text: string) => ({
  messages: [{ id: `m-${threadId}`, role: "assistant", parts: [{ type: "text", text }], turn_key: null, task_id: null, seq: 1, created_at: "2026-09-02T00:00:00Z" }],
});

type Wire = {
  clientId: string;
  posts: number;
  lists: number;
  sessions: Row[];
  /** Fold round: fail the CONFIRMING list read that follows a create, so the provisional
   *  fallback is reachable. Counted from 1 — the first list read is the initial resolve. */
  failListsAfter?: number;
  /** Fold round: hold the FIRST list read open until this resolves, so a cell can act
   *  while the rail is still resolving. */
  gate?: Promise<void>;
  /** Fold round 2: fail EVERY list read, including the first. That settles the rail with
   *  `resolving: false` AND no caller projection — the state R2 found New reachable in. */
  failAllLists?: boolean;
};

function makeRouter(wire: Wire) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.endsWith("/api/runtime/chat/sessions")) {
      if (method === "POST") {
        wire.posts += 1;
        wire.sessions = [row(wire.clientId, THREAD_MINTED, MINTED_LEDGER_TIME), ...wire.sessions];
        return json({ session_id: THREAD_MINTED }, 201);
      }
      wire.lists += 1;
      if (wire.lists === 1 && wire.gate) await wire.gate;
      if (wire.failAllLists) return json({ error: "unavailable" }, 503);
      if (wire.failListsAfter !== undefined && wire.lists > wire.failListsAfter) {
        return json({ error: "unavailable" }, 503);
      }
      return json({ sessions: wire.sessions });
    }
    if (url.includes(`/chat/sessions/${THREAD_NEW}/messages`)) return json(transcript(THREAD_NEW, "NEWEST OWN TRANSCRIPT"));
    if (url.includes(`/chat/sessions/${THREAD_OLD}/messages`)) return json(transcript(THREAD_OLD, "OLDER OWN TRANSCRIPT"));
    if (url.includes(`/chat/sessions/${THREAD_MINTED}/messages`)) return json(transcript(THREAD_MINTED, "MINTED TRANSCRIPT"));
    if (url.includes("agent_tasks_visible")) return json([]);
    if (url.includes("/rest/v1/clients")) return json([]);
    if (url.includes("/rest/v1/onboarding_plans")) return json([]);
    if (url.includes("caller_context")) return json([]);
    throw new Error(`unexpected fetch: ${method} ${url}`);
  };
}

function withFetch(wire: Wire, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = makeRouter(wire) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

function rail(clientId: string): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement("div", null,
      createElement("h1", null, "Thread menu"),
      createElement(ClaraRail, { auth: { getAccessToken: async () => TOKEN }, clientId }),
    ),
  });
}

async function settleUntil(h: { settle: () => Promise<void> }, condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await h.settle();
  }
}

/** `RenderHarness` exposes `find` (first match) but no all-matches walk, so this walks
 *  the mount root itself — the escape hatch its own `container` doc comment names. */
function findAll(node: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = predicate(node) ? [node] : [];
  for (const child of (node.childNodes as Stub[] | undefined) ?? []) out.push(...findAll(child, predicate));
  return out;
}

function attr(node: Stub, name: string): string | null {
  return typeof node.getAttribute === "function" ? (node.getAttribute as (a: string) => string | null)(name) : null;
}

/** By ACCESSIBLE NAME — `aria-label` first, then the button's own text — which is what
 *  a human and a screen reader both address the control by. */
function buttonNamed(h: { container: Stub }, name: string): Stub | undefined {
  return findAll(h.container, (n) => n.tagName === "BUTTON").find(
    (n) => attr(n, "aria-label") === name || textOf(n).trim() === name,
  );
}

/** OPEN THE THREAD MENU, IDEMPOTENTLY, and never by blind toggling.
 *
 *  The header control is a TOGGLE, so a bare click is only "open" when the panel happens
 *  to be closed — and it does not always happen to be: a successful create closes the
 *  panel itself, so a cell that clicks again to inspect the result can close what it
 *  meant to open. Two fold cells failed on exactly that, one reporting a missing button
 *  and one a missing list, neither of which was the defect it was hunting. Reading
 *  `aria-expanded` first makes the helper say what it does. */
async function openMenu(h: { container: Stub; act: (fn: () => void | Promise<void>) => Promise<void> }): Promise<void> {
  const toggle = buttonNamed(h, "Conversations");
  assert.ok(toggle, "the rail header must carry the thread menu toggle");
  if (attr(toggle, "aria-expanded") === "true") return;
  await h.act(() => clickButton(toggle));
  assert.equal(attr(toggle, "aria-expanded"), "true", "the toggle must report the panel it just opened");
}

/** Drive a React `onKeyDown` committed on `node`, with `target` set to where the key was
 *  actually pressed — the shape a real bubble delivers. Read off `__reactProps$…` for the
 *  same measured reason `clickButton` does: this harness's `fireEvent` dispatches only
 *  through the container's own delegated listener. */
async function pressEscape(
  h: { act: (fn: () => void | Promise<void>) => Promise<void> },
  node: Stub,
  target: Stub,
  key = "Escape",
): Promise<void> {
  const propsKey = Object.keys(node).find((k) => k.startsWith("__reactProps"));
  const onKeyDown = propsKey
    ? (node as Record<string, { onKeyDown?: (e: unknown) => unknown }>)[propsKey]?.onKeyDown
    : undefined;
  assert.ok(onKeyDown, "the node must carry the keydown handler this cell is about");
  await h.act(async () => {
    await onKeyDown({ type: "keydown", key, target, currentTarget: node, stopPropagation() {}, preventDefault() {} });
  });
}

test("MOUNTING THE RAIL CREATES NOTHING — a chat session is an act now, not a side effect", async () => {
  const clientId = freshClient();
  const wire: Wire = { clientId, posts: 0, lists: 0, sessions: [row(clientId, THREAD_NEW, "2026-09-03T00:00:00Z")] };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      await settleUntil(h, () => /NEWEST OWN TRANSCRIPT/.test(h.text()), "the resolved thread");
      // The router THROWS on an unexpected call, so this count is a second reading of
      // the same fact rather than the only one.
      assert.equal(wire.posts, 0, "resolving an altitude must not mint a chat_sessions row");
    } finally {
      await h.unmount();
    }
  });
});

test("AN ALTITUDE WITH NO THREAD OFFERS ONE — it never sits on the resolving loader", async () => {
  const clientId = freshClient();
  const wire: Wire = { clientId, posts: 0, lists: 0, sessions: [] };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      await settleUntil(h, () => /No conversation here yet/.test(h.text()), "the empty-altitude offer");
      assert.equal(wire.posts, 0, "the offer is an offer — nothing is minted until it is taken");
      assert.doesNotMatch(h.text(), /Finding your conversation with Clara/, "the loader must not survive a finished read");

      const create = buttonNamed(h, "New conversation");
      assert.ok(create, "the empty state must carry the create act");
      await h.act(() => clickButton(create));
      await settleUntil(h, () => /MINTED TRANSCRIPT/.test(h.text()), "the minted thread's transcript");
      assert.equal(wire.posts, 1, "exactly one session is created, by the act");
    } finally {
      await h.unmount();
    }
  });
});

test("NEW THREAD from the menu creates exactly one session and shows it", async () => {
  const clientId = freshClient();
  const wire: Wire = { clientId, posts: 0, lists: 0, sessions: [row(clientId, THREAD_NEW, "2026-09-03T00:00:00Z")] };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      await settleUntil(h, () => /NEWEST OWN TRANSCRIPT/.test(h.text()), "the resolved thread");

      const toggle = buttonNamed(h, "Conversations");
      assert.ok(toggle, "the rail header must carry the thread menu toggle");
      assert.equal(attr(toggle, "aria-expanded"), "false", "the disclosure state is on the control, not only in the pixels");
      await h.act(() => clickButton(toggle));
      assert.equal(attr(toggle, "aria-expanded"), "true");

      const create = buttonNamed(h, "New conversation");
      assert.ok(create, "the open menu must offer New conversation");
      await h.act(() => clickButton(create));

      // DISCRIMINATING: the MINTED thread's own transcript, which only a create plus a
      // select can put on screen. A create that did not select would still be showing
      // NEWEST OWN TRANSCRIPT here.
      await settleUntil(h, () => /MINTED TRANSCRIPT/.test(h.text()), "the minted thread's transcript");
      assert.equal(wire.posts, 1, "one act, one session — never two");
      assert.doesNotMatch(h.text(), /NEWEST OWN TRANSCRIPT/, "the new thread replaces the old one on screen");
    } finally {
      await h.unmount();
    }
  });
});

test("SWITCHING selects an existing thread, creates nothing, and never offers a colleague's shared one", async () => {
  const clientId = freshClient();
  const wire: Wire = {
    clientId,
    posts: 0,
    lists: 0,
    sessions: [
      row(clientId, THREAD_NEW, "2026-09-03T00:00:00Z"),
      row(clientId, THREAD_OLD, "2026-09-01T00:00:00Z"),
      // A colleague's firm-shared thread IS on this wire (chatRoutes.ts selects
      // `visibility = 'firm' or created_by = $2`). It must not be offered as a thread
      // this human's next turn would land in.
      row(clientId, THREAD_SHARED, "2026-09-03T12:00:00Z", COLLEAGUE, "firm"),
    ],
  };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      await settleUntil(h, () => /NEWEST OWN TRANSCRIPT/.test(h.text()), "the newest own thread");
      await openMenu(h);

      const rows = findAll(h.container, (n) => n.tagName === "LI");
      assert.equal(rows.length, 2, "the switcher lists the caller's OWN threads only");

      // The active row says so accessibly, not only by its fill.
      const current = rows.filter((r) => findAll(r, (n) => attr(n, "aria-current") === "true").length > 0);
      assert.equal(current.length, 1, "exactly one row is marked as the thread on screen");

      // Rows are labelled from the DB's own `created_at` (the runtime writes no title),
      // newest first, so the older thread is the second row.
      const olderButton = findAll(rows[1]!, (n) => n.tagName === "BUTTON")[0];
      assert.ok(olderButton);
      await h.act(() => clickButton(olderButton));

      await settleUntil(h, () => /OLDER OWN TRANSCRIPT/.test(h.text()), "the older thread's transcript");
      assert.equal(wire.posts, 0, "switching is a selection, never a create");
      assert.doesNotMatch(h.text(), /NEWEST OWN TRANSCRIPT/);
    } finally {
      await h.unmount();
    }
  });
});

test("the menu names ARCHIVE as not built and offers no clear or delete at all", async () => {
  const clientId = freshClient();
  const wire: Wire = { clientId, posts: 0, lists: 0, sessions: [row(clientId, THREAD_NEW, "2026-09-03T00:00:00Z")] };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      await settleUntil(h, () => /NEWEST OWN TRANSCRIPT/.test(h.text()), "the resolved thread");
      await openMenu(h);

      // Archive is a real backend gap and says so, rather than shipping a control that
      // would refuse: the table has no `archived_at` and the only lawful mutation is
      // `clara.share_chat_session`.
      assert.match(h.text(), /Archiving a conversation/);
      assert.match(h.text(), /Not built yet/);

      // And CLEAR/DELETE are absent entirely — not disabled, not "coming soon". The
      // transcript is the audit record and `_tf_chat_session_update` refuses a DELETE
      // outright, so a control for it must never exist.
      for (const forbidden of ["Clear", "Delete", "Clear conversation", "Delete conversation"]) {
        assert.equal(buttonNamed(h, forbidden), undefined, `${forbidden} must not be a control anywhere in the menu`);
      }
    } finally {
      await h.unmount();
    }
  });
});

// --- FOLD ROUND (review-547) --------------------------------------------------------

test("FOLD 2 - a CREATE is confirmed by a read, so the row carries the LEDGER's own time, never this browser's", async () => {
  // The first cut appended an optimistic row with `created_at: new Date().toISOString()`
  // and the menu rendered it as "Started ..." - a timestamp the ledger never recorded,
  // under a comment claiming nothing was inferred. The create now re-reads the list, so
  // the row on screen is the DB's own.
  const clientId = freshClient();
  const wire: Wire = { clientId, posts: 0, lists: 0, sessions: [row(clientId, THREAD_NEW, "2026-09-03T00:00:00Z")] };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      await settleUntil(h, () => /NEWEST OWN TRANSCRIPT/.test(h.text()), "the resolved thread");
      const listsBefore = wire.lists;
      await openMenu(h);
      await h.act(() => clickButton(buttonNamed(h, "New conversation")!));
      await settleUntil(h, () => /MINTED TRANSCRIPT/.test(h.text()), "the minted thread");

      // DISCRIMINATING: the create is followed by its own list read. Without it the row
      // could only have come from this hook's own composition.
      assert.ok(wire.lists > listsBefore, "a create must be confirmed by a read of the list");

      // The harness's row for the minted thread carries `MINTED_LEDGER_TIME`
      // (2019-03-14, deliberately far from any day this suite runs on), so the menu shows
      // the LEDGER's date. This browser's own clock must not appear anywhere in the
      // panel — and the assertion below first checks the two genuinely differ, so a
      // fixture dated today could never make that check vacuous.
      await openMenu(h);
      const panel = h.text();
      const ledgerDay = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium" }).format(new Date(MINTED_LEDGER_TIME));
      assert.ok(panel.includes(`Started ${ledgerDay}`), `the row must be labelled from the LEDGER's created_at (${ledgerDay}); panel was: ${panel}`);
      const today = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium" }).format(new Date());
      assert.notEqual(today, ledgerDay, "the fixture's date must differ from today, or the next assertion proves nothing");
      assert.equal(panel.includes(today), false, `the browser's own clock (${today}) must never label a conversation`);
    } finally {
      await h.unmount();
    }
  });
});

test("FOLD 2b - when the confirming read FAILS, the row is held PROVISIONALLY with no time at all", async () => {
  // The session exists - the create returned an id - so dropping it would be worse than
  // showing it. What must not happen is a fabricated time standing in for the DB's.
  const clientId = freshClient();
  const wire: Wire = {
    clientId, posts: 0, lists: 0, failListsAfter: 1,
    sessions: [row(clientId, THREAD_NEW, "2026-09-03T00:00:00Z")],
  };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      await settleUntil(h, () => /NEWEST OWN TRANSCRIPT/.test(h.text()), "the resolved thread");
      await openMenu(h);
      await h.act(() => clickButton(buttonNamed(h, "New conversation")!));
      await settleUntil(h, () => /MINTED TRANSCRIPT/.test(h.text()), "the minted thread is still selected");
      assert.equal(wire.posts, 1);

      await openMenu(h);
      await settleUntil(h, () => findAll(h.container, (n) => n.tagName === "LI").length > 0, "the reopened switcher");
      const rows = findAll(h.container, (n) => n.tagName === "LI");
      assert.equal(rows.length, 2, "the created session is listed rather than lost");
      // The provisional row is the newest, and it says what it is instead of a time.
      assert.equal(textOf(rows[0]!).trim(), "New conversation");
      assert.doesNotMatch(textOf(rows[0]!), /Started/, "there is no time to show, and none is invented");
      // The CONFIRMED row beside it still carries the ledger's own - so the assertion
      // above is about this row, not about the label being missing everywhere.
      assert.match(textOf(rows[1]!), /Started/);
    } finally {
      await h.unmount();
    }
  });
});

test("FOLD 3 - New is REFUSED while the session read is in flight, and cannot mint an unlistable row", async () => {
  // The first cut left New clickable during the initial read, and the create path then
  // DROPPED the new row (no caller projection yet) while still writing the selection -
  // minting an invisible, un-archivable session, the exact defect this train abolishes.
  const clientId = freshClient();
  let openGate = () => {};
  const gate = new Promise<void>((resolve) => { openGate = resolve; });
  const wire: Wire = { clientId, posts: 0, lists: 0, gate, sessions: [row(clientId, THREAD_NEW, "2026-09-03T00:00:00Z")] };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      // Still resolving: the list read is held open by the gate. The rail's own header
      // commits regardless, so wait for the toggle rather than for a fixed number of ticks.
      await settleUntil(h, () => buttonNamed(h, "Conversations") !== undefined, "the rail header");
      await openMenu(h);
      await settleUntil(h, () => buttonNamed(h, "New conversation") !== undefined, "the open menu");
      const create = buttonNamed(h, "New conversation");
      assert.ok(create, "the control is present - this cell is about the GATE, not the affordance");

      // ASSERT THE GATE, THEN ACT. `clickButton` refuses a disabled node, so a green here
      // could not be manufactured by clicking through it.
      assert.equal((create as { disabled?: boolean }).disabled, true, "New must be refused while the list read is in flight");
      assert.equal(wire.posts, 0);

      // And it opens once the read lands.
      openGate();
      await settleUntil(h, () => /NEWEST OWN TRANSCRIPT/.test(h.text()), "the resolved thread");
      await openMenu(h);
      const afterResolve = buttonNamed(h, "New conversation");
      assert.equal((afterResolve as { disabled?: boolean }).disabled, false, "and admitted once there is a list to land in");
    } finally {
      openGate();
      await h.unmount();
    }
  });
});

test("FOLD 3b - the empty-state offer is unreachable while the read is still in flight", async () => {
  // The offer lives in the resolve-state ladder's LAST arm, which the loading arm
  // precedes - so it cannot render mid-read by construction. This pins that ordering
  // rather than trusting it, since a later edit could reorder the arms.
  const clientId = freshClient();
  let openGate = () => {};
  const gate = new Promise<void>((resolve) => { openGate = resolve; });
  const wire: Wire = { clientId, posts: 0, lists: 0, gate, sessions: [] };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      await h.settle();
      assert.match(h.text(), /Finding your conversation with Clara/, "the loading arm owns this state");
      assert.doesNotMatch(h.text(), /No conversation here yet/, "the offer must not race the read that decides whether it applies");

      openGate();
      await settleUntil(h, () => /No conversation here yet/.test(h.text()), "the offer, after the read");
      assert.doesNotMatch(h.text(), /Finding your conversation with Clara/);
    } finally {
      openGate();
      await h.unmount();
    }
  });
});

test("FOLD 5 - Escape closes the thread menu and returns focus to the toggle", async () => {
  const clientId = freshClient();
  const wire: Wire = { clientId, posts: 0, lists: 0, sessions: [row(clientId, THREAD_NEW, "2026-09-03T00:00:00Z")] };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      await settleUntil(h, () => /NEWEST OWN TRANSCRIPT/.test(h.text()), "the resolved thread");
      const toggle = buttonNamed(h, "Conversations")!;
      await h.act(() => clickButton(toggle));
      assert.equal(attr(toggle, "aria-expanded"), "true");
      assert.ok(buttonNamed(h, "New conversation"), "the panel is open");

      // ESCAPE IS PRESSED WITH FOCUS STILL ON THE TOGGLE — the commonest case there is
      // (open the menu, change your mind), and the one the first cut got wrong. The
      // handler lives on the rail ROOT, so the event reaches it by bubbling from the
      // toggle; this cell therefore drives the ROOT's `onKeyDown` with the toggle as the
      // event target, which is exactly what a real bubble delivers. Driving the panel's
      // own node instead — as the first cut did — could not tell a working Escape from
      // one the toggle can never reach, because the panel is the toggle's SIBLING.
      const rail = findAll(h.container, (n) => attr(n, "data-clara-rail") !== null)[0];
      assert.ok(rail, "the rail root carries the handler both the toggle and the panel bubble to");
      await pressEscape(h, rail, toggle);

      assert.equal(buttonNamed(h, "New conversation"), undefined, "Escape closes the panel");
      assert.equal(attr(toggle, "aria-expanded"), "false");
      // Focus returns to the control that opened it - a disclosure that drops a keyboard
      // user at the top of the document is the defect this closes.
      assert.equal(activeElement(), toggle, "focus returns to the toggle, not to the document");
    } finally {
      await h.unmount();
    }
  });
});

// --- FOLD ROUND 2 (review-547 residuals) ---------------------------------------------

test("R1 negative — a key that is not Escape leaves the menu open, and Escape with the menu CLOSED is not swallowed", async () => {
  // The counter-half of the cell above. Without it, "Escape closes the menu" is also
  // satisfied by a handler that closes on every keystroke, and the `menuOpen` guard —
  // which is what keeps the rail from eating an Escape it has no use for — is unproven.
  const clientId = freshClient();
  const wire: Wire = { clientId, posts: 0, lists: 0, sessions: [row(clientId, THREAD_NEW, "2026-09-03T00:00:00Z")] };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      await settleUntil(h, () => /NEWEST OWN TRANSCRIPT/.test(h.text()), "the resolved thread");
      const toggle = buttonNamed(h, "Conversations")!;
      const railRoot = findAll(h.container, (n) => attr(n, "data-clara-rail") !== null)[0]!;

      // CLOSED: the guard must decline, so an Escape meant for something else survives.
      let swallowed = false;
      const propsKey = Object.keys(railRoot).find((k) => k.startsWith("__reactProps"));
      const onKeyDown = (railRoot as Record<string, { onKeyDown?: (e: unknown) => unknown }>)[propsKey!]?.onKeyDown;
      await h.act(async () => {
        await onKeyDown!({ type: "keydown", key: "Escape", target: toggle, currentTarget: railRoot, stopPropagation() { swallowed = true; }, preventDefault() {} });
      });
      assert.equal(swallowed, false, "with the menu closed the rail must not stop an Escape it has no use for");

      // OPEN, wrong key: still open.
      await openMenu(h);
      await pressEscape(h, railRoot, toggle, "a");
      assert.ok(buttonNamed(h, "New conversation"), "only Escape closes the panel");
      assert.equal(attr(toggle, "aria-expanded"), "true");
    } finally {
      await h.unmount();
    }
  });
});

test("R2 — after a FAILED session read New is REFUSED, so no session is minted that nothing could list", async () => {
  // THE STATE THE FIRST GATE MISSED. `resolving` alone was not enough: a failed read
  // settles with `resolving: false` and `callerSubject: null`. The rail shows its error
  // banner, but the thread menu is not part of that ladder — so New stayed enabled, and a
  // create from here succeeds at the runtime and can then be listed by nothing, because
  // `ownSessionsForAltitude` has no caller projection to match on. That row can never be
  // archived or deleted, which is the class this train exists to abolish.
  const clientId = freshClient();
  const wire: Wire = { clientId, posts: 0, lists: 0, failAllLists: true, sessions: [] };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      // The read has SETTLED and it failed — not still in flight.
      await settleUntil(h, () => wire.lists > 0 && /Could not load the conversation/.test(h.text()), "the failed resolve");
      assert.doesNotMatch(h.text(), /Finding your conversation with Clara/, "this is the settled arm, not the loading one");

      await openMenu(h);
      const create = buttonNamed(h, "New conversation");
      assert.ok(create, "the control is present — this cell is about the GATE, not the affordance");
      // ASSERT THE GATE, THEN ACT: `clickButton` refuses a disabled node, so the zero
      // below cannot be manufactured by clicking through it.
      assert.equal((create as { disabled?: boolean }).disabled, true, "New must be refused when a create could not be listed");
      assert.equal(wire.posts, 0, "and nothing was minted");
    } finally {
      await h.unmount();
    }
  });
});

test("R5 — an Escape from a PORTALLED dialog inside the rail's React tree leaves the menu open", async () => {
  // REACT PROPAGATES SYNTHETIC EVENTS THROUGH THE REACT TREE, NOT THE DOM TREE. Three
  // Base UI dialogs render inside this rail's tree by way of `ClaraThreadView` —
  // OnboardingChecklistCard's bootstrap door, InterviewRunCard's cancel door and
  // ApplyStandardChartControl's apply door — and each portals its content into
  // `document.body`. So their keydowns DO reach the rail root's handler, and the first
  // cut of that handler (which claimed in a comment that they never could) closed the
  // dialog and the thread menu together, moving focus to a control the human was not
  // using.
  //
  // The event is driven at the root with a target OUTSIDE the rail's DOM subtree, which
  // is exactly the shape a portalled dialog delivers: React-tree ancestor, DOM-tree
  // stranger. `event.defaultPrevented` cannot be the oracle here — Base UI's own escape
  // path calls `store.setOpen` rather than preventing the event — so the post-condition
  // is the menu's own state.
  const clientId = freshClient();
  const wire: Wire = { clientId, posts: 0, lists: 0, sessions: [row(clientId, THREAD_NEW, "2026-09-03T00:00:00Z")] };
  await withFetch(wire, async () => {
    const h = await renderComponent(rail(clientId));
    try {
      await settleUntil(h, () => /NEWEST OWN TRANSCRIPT/.test(h.text()), "the resolved thread");
      const toggle = buttonNamed(h, "Conversations")!;
      const railRoot = findAll(h.container, (n) => attr(n, "data-clara-rail") !== null)[0]!;
      await openMenu(h);

      // A node that is genuinely NOT inside the rail — the stand-in for the portalled
      // dialog content Base UI mounts on `document.body`.
      const outside = document.createElement("div") as unknown as Stub;
      assert.equal(
        (railRoot.contains as (n: unknown) => boolean)(outside),
        false,
        "the fixture must really be outside the rail, or this cell proves nothing",
      );

      await pressEscape(h, railRoot, outside);

      assert.ok(buttonNamed(h, "New conversation"), "a dialog's Escape must not close the thread menu");
      assert.equal(attr(toggle, "aria-expanded"), "true");

      // POSITIVE CONTROL on the same handler, same cell: a target INSIDE the rail still
      // closes it. Without this the assertion above is also satisfied by a handler that
      // stopped working at all.
      await pressEscape(h, railRoot, toggle);
      assert.equal(buttonNamed(h, "New conversation"), undefined, "an Escape from inside the rail still closes the menu");
      assert.equal(attr(toggle, "aria-expanded"), "false");
    } finally {
      await h.unmount();
    }
  });
});

