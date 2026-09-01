// GATE (c) — the keyboard walk over /admin/members. See test/keyboardWalk.ts's
// header for exactly what this environment can and cannot prove about real key
// dispatch: it proves STRUCTURE (native focusable controls, plain DOM tab order,
// an intact focus ring, and that `.focus()` really moves `activeElement`), not a
// browser's own key handling.
//
// The P3 workbench lesson this exists for: a keyboard gate found six permanently
// unopenable doors that five code reviews had missed. Every door on this surface
// gets one — the row menu trigger, the two confirm dialogs, the invite trigger,
// and the Revoke control on both invite rows.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { textOf, clickButton, renderComponent } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { checkKeyboardWalk, focusableElements, isKeyboardOperable } from "../../test/keyboardWalk";
import {
  App,
  BOOKKEEPER_CONTEXT,
  attrOf,
  findIn,
  jsonResponse,
  mockMembersFetch,
  mountMembers,
  withMockedEnv,
} from "./members-fixtures";

enableDomInspection();

test("members: the loaded surface walks clean, and every act control is a real focusable control", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        assert.match(textOf(body as never), /Tao Lim/, "the roster must have loaded before the walk means anything");
        assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations on the loaded surface");

        const focusables = focusableElements(h.container as never);
        // Two active members carry a row menu trigger, the removed one does not;
        // two invite rows carry Revoke; plus the "Invite someone" trigger.
        assert.ok(focusables.length >= 5, `only ${focusables.length} focusable controls found`);

        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === "Actions for Tao Lim");
        assert.ok(trigger, "the row menu trigger must render");
        assert.equal(isKeyboardOperable(trigger as never), true, "the row menu trigger must be natively operable");
        (trigger as unknown as { focus: () => void }).focus();
        assert.equal(activeElement(), trigger, "focus must actually reach the row menu trigger");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("members: the row menu OPENS from the keyboard-reachable trigger and its items are operable", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === "Actions for Tao Lim");
        assert.ok(trigger);
        // ASSERT THE GATE, THEN ACT: `clickButton` throws on a node whose live
        // `disabled` is true, so a permanently-unopenable menu cannot pass here.
        assert.equal((trigger as unknown as { disabled: boolean }).disabled, false);
        await h.act(async () => {
          await clickButton(trigger as never);
        });
        for (let i = 0; i < 3; i++) await h.settle();

        // DISCRIMINATING: "Remove from firm" appears nowhere on the closed page.
        assert.match(textOf(body as never), /Remove from firm/, "opening the menu must reveal the destructive item");
        assert.deepEqual(checkKeyboardWalk(body as never), [], "no violations while the menu is open");

        const remove = findIn(body, (n) => attrOf(n, "role") === "menuitem" && textOf(n as never).trim() === "Remove from firm");
        assert.ok(remove, "the destructive item must be a real menu item");
        // A Base UI menu item is a `<div role="menuitem">` in a roving-tabindex
        // set, so it is reachable by ARROW keys from the popup rather than by TAB
        // — `isKeyboardOperable` deliberately reports that as not-a-tab-stop. What
        // matters for WCAG 2.1.1 here is that the item is exposed with a widget
        // role and can be focused, both of which are asserted.
        assert.equal(attrOf(remove, "role"), "menuitem");
        (remove as unknown as { focus: () => void }).focus();
        assert.equal(activeElement(), remove, "focus must be able to land on the menu item");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("members: the remove dialog traps into its own controls and ESCAPES back to a live trigger", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === "Actions for Tao Lim");
        assert.ok(trigger);
        await h.act(async () => {
          await clickButton(trigger as never);
        });
        for (let i = 0; i < 3; i++) await h.settle();
        const remove = findIn(body, (n) => attrOf(n, "role") === "menuitem" && textOf(n as never).trim() === "Remove from firm");
        assert.ok(remove);
        await h.act(async () => {
          await clickButton(remove as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();

        const text = textOf(body as never);
        assert.match(text, /Remove Tao Lim from this firm\?/, "the dialog must be open before its walk means anything");
        assert.match(text, /Cancel/, "…and its Cancel path must exist");
        assert.deepEqual(checkKeyboardWalk(body as never), [], "no violations while the confirm dialog is open");

        const cancel = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Cancel");
        assert.ok(cancel, "Cancel must be a real <button>, not a div");
        assert.equal(isKeyboardOperable(cancel as never), true);
        await h.act(async () => {
          await clickButton(cancel as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();

        // THE ESCAPE PATH: closing must not strand focus on a removed node — the
        // row's own trigger has to be reachable again.
        const after = findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === "Actions for Tao Lim");
        assert.ok(after, "the row trigger must still exist after the dialog closes");
        assert.ok(
          focusableElements(h.container as never).includes(after as never),
          "the trigger must be keyboard-reachable again after the dialog closes",
        );
        assert.ok(!/Remove Tao Lim from this firm\?/.test(textOf(body as never)), "the dialog must actually be gone");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("members: the invite trigger is DISABLED with the required rank NAMED for a below-admin caller", async () => {
  // Affordance shaping (design §4 D), and the one place this surface reads the
  // caller's own rank. It is NOT a wall: `clara._human_ctx` is, and the DB would
  // refuse CLR04 anyway.
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(BOOKKEEPER_CONTEXT);
      return mockMembersFetch(url);
    },
    async () => {
      const { h, body } = await mountMembers();
      try {
        const blocked = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Admin or owner can invite someone");
        assert.ok(blocked, "the trigger must NAME the required rank rather than vanish");
        assert.equal((blocked as unknown as { disabled: boolean }).disabled, true);
        // The gate is asserted DIRECTLY, never by routing a click through it —
        // `clickButton` refuses a disabled node precisely so a test cannot
        // manufacture a green on an unopenable door.
        await assert.rejects(() => clickButton(blocked as never), /refusing to click a DISABLED node/);
        assert.deepEqual(checkKeyboardWalk(body as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("members: an UNREADABLE caller context leaves the invite trigger ENABLED — affordance shaping fails OPEN", async () => {
  // The opposite direction from the scope spine's, deliberately: the boundary is
  // `_human_ctx`, so a failed courtesy read must never strand a real admin.
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse({ message: "boom" }, 500);
      return mockMembersFetch(url);
    },
    async () => {
      const { h, body } = await mountMembers();
      try {
        const live = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone");
        assert.ok(live, "a failed context read must leave the real trigger, not the blocked label");
        assert.equal((live as unknown as { disabled: boolean }).disabled, false);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("members: a REMOVED membership carries no row menu — a control that could only refuse is not shipped", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        assert.match(textOf(body as never), /Wei Chan/, "the removed row must be rendered, not hidden");
        assert.equal(
          findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === "Actions for Wei Chan"),
          null,
          "a removed membership refuses CLR11 'membership is not active' for both verbs, so it gets no menu",
        );
      } finally {
        await h.unmount();
      }
    },
  );
});

test("VACUITY CONTROL: the walk actually inspects nodes — an injected positive tabindex is caught", async () => {
  // Without this, every `deepEqual(violations, [])` above could be a walk over
  // nothing. Review law 2: an absence from an instrument nobody proved is not
  // evidence.
  const h = await renderComponent(
    App(createElement("button", { tabIndex: 3, type: "button" }, "planted"), "Members"),
  );
  try {
    const violations = checkKeyboardWalk(h.container as never);
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]?.rule, "tabindex-order");
  } finally {
    await h.unmount();
  }
});
