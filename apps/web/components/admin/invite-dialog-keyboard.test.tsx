// GATE (c) — the invite dialog's keyboard walk. The order names the two that
// actually matter: THE FOCUS TRAP and THE ESCAPE PATH.
//
// What this environment can honestly prove is in test/keyboardWalk.ts's header:
// structure, not a browser's own key handling. So "focus trap" here means the
// checkable half — every control the open dialog exposes is a NATIVE focusable
// element in plain DOM order with its focus ring intact, `.focus()` really moves
// `document.activeElement` onto them, and the trigger behind the dialog is NOT
// among the reachable set while it is open. "Escape path" means Cancel is a real
// `<button>`, it actually closes the dialog, and the trigger is reachable again
// afterwards — the six-unopenable-doors class the P3 workbench keyboard gate
// found.

import { test } from "node:test";
import assert from "node:assert/strict";

import { textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { checkKeyboardWalk, focusableElements, isKeyboardOperable } from "../../test/keyboardWalk";
import {
  attrOf,
  findAll,
  findIn,
  jsonResponse,
  mockMembersFetch,
  mountMembers,
  withMockedEnv,
} from "./members-fixtures";

enableDomInspection();

function inviteTrigger(body: Parameters<typeof findIn>[0]) {
  return findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone");
}

test("invite dialog: opens from a keyboard-reachable trigger, and every control inside is operable", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const trigger = inviteTrigger(body);
        assert.ok(trigger, "the invite trigger must render");
        assert.equal(isKeyboardOperable(trigger as never), true);
        (trigger as unknown as { focus: () => void }).focus();
        assert.equal(activeElement(), trigger, "focus must actually reach the trigger before activation");

        await h.act(async () => {
          await clickButton(trigger as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();

        assert.match(textOf(body as never), /Invite someone to this firm/, "the dialog must be open before the walk means anything");
        assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

        const input = findIn(body, (n) => n.tagName === "INPUT" && attrOf(n, "type") === "email");
        const select = findIn(body, (n) => n.tagName === "SELECT");
        const send = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Send invitation");
        const cancel = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Cancel");
        for (const [name, node] of [["email", input], ["role", select], ["send", send], ["cancel", cancel]] as const) {
          assert.ok(node, `the ${name} control must render`);
          assert.equal(isKeyboardOperable(node as never), true, `the ${name} control must be natively operable`);
          (node as unknown as { focus: () => void }).focus();
          assert.equal(activeElement(), node, `focus must land on the ${name} control`);
        }
      } finally {
        await h.unmount();
      }
    },
  );
});

test("invite dialog: THE TRAP — the page behind it is marked inert while it is open, and released after", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const container = h.container as unknown as { getAttribute: (n: string) => string | null };
        // A real, non-zero baseline: the page behind IS reachable before the
        // dialog opens, so the change below is a measurement rather than an
        // empty walk.
        assert.ok(focusableElements(h.container as never).length >= 5, "the page behind must be reachable to begin with");
        assert.equal(container.getAttribute("aria-hidden"), null, "nothing is inert before the dialog opens");

        const trigger = inviteTrigger(body);
        assert.ok(trigger);
        await h.act(async () => {
          await clickButton(trigger as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();

        // MEASURED, NOT ASSUMED. @base-ui/react's FloatingFocusManager marks
        // every body-level sibling of the open portal `aria-hidden` +
        // `data-base-ui-inert` — that is the trap, and it is the half this
        // environment can honestly observe (test/keyboardWalk.ts's header: there
        // is no real focus manager here, so a literal Tab sweep would prove
        // nothing). The dialog's own content is portalled OUT of the mount root,
        // which is why the container is what gets marked.
        assert.equal(container.getAttribute("aria-hidden"), "true", "the page behind an open modal must leave the a11y tree");
        assert.equal(container.getAttribute("data-base-ui-inert"), "", "…and be marked inert by the focus manager");

        // The dialog itself is a NAMED dialog whose own controls are reachable.
        // Deliberately NOT asserted: `aria-modal`. @base-ui/react does not set it
        // — it marks the outside tree `aria-hidden`+inert instead, which is the
        // stronger of the two mechanisms and the one measured above. Asserting an
        // attribute the shipped primitive never writes would be a pin on a
        // composition that does not exist.
        const dialog = findIn(body, (n) => attrOf(n, "role") === "dialog");
        assert.ok(dialog, "the open dialog must expose role=dialog");
        assert.ok(attrOf(dialog, "aria-labelledby"), "…and carry an accessible name");
        assert.ok(focusableElements(dialog as never).length >= 4, "the dialog's own controls must be reachable");

        const cancel = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Cancel");
        await h.act(async () => {
          await clickButton(cancel as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();
        assert.equal(container.getAttribute("aria-hidden"), null, "closing must RELEASE the page behind, not strand it inert");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("invite dialog: the ESCAPE PATH — Cancel closes it and leaves the trigger reachable again", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const trigger = inviteTrigger(body);
        assert.ok(trigger);
        await h.act(async () => {
          await clickButton(trigger as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();
        assert.match(textOf(body as never), /Invite someone to this firm/);

        const cancel = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Cancel");
        assert.ok(cancel, "Cancel must be a real <button>, not a div");
        await h.act(async () => {
          await clickButton(cancel as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();

        assert.ok(!/Invite someone to this firm/.test(textOf(body as never)), "Cancel must actually close the dialog");
        const after = inviteTrigger(body);
        assert.ok(after, "the trigger must still exist");
        assert.ok(
          focusableElements(h.container as never).includes(after as never),
          "focus must not be stranded — the trigger is reachable again",
        );
      } finally {
        await h.unmount();
      }
    },
  );
});

test("invite dialog: a closed dialog FORGETS the address, so re-opening cannot re-send it by accident", async () => {
  // REWRITTEN (independent review of #455, LOW-11). The previous version drove
  // the field with `h.fireEvent` and a direct `n.value = …` mutation, which is
  // vacuous twice over:
  //   · `h.fireEvent` dispatches through the MOUNT CONTAINER's delegated
  //     listener, and an open Base UI dialog's content is portalled to
  //     `document.body` — a separate delegation root it never reaches
  //     (apps/web/AGENTS.md's first dialog law). The React `onChange` was never
  //     invoked at all.
  //   · the assertion that followed read back the value THE TEST HAD JUST
  //     WRITTEN, so it held whether or not the component was controlled.
  // Deleting `onChange` from the Input left it green.
  //
  // Now the value goes in through `setFieldValue` (the shared portal-capable
  // helper, which invokes the live React handler on the real node), and the
  // proof is taken ON THE WIRE: what the courier was POSTED. That makes the two
  // mutations red INDEPENDENTLY — removing `onChange` changes the first
  // submission's body, removing the reset effect changes the second's.
  //
  // WHAT THIS STILL CANNOT PROVE is a real browser's own typing, focus and
  // hit-testing; there is no layout engine in this harness (test/hookHarness.ts's
  // own note). That is a Wave-G Playwright item, recorded in the PR body.
  const posted: Record<string, unknown>[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url === "/api/invite") {
      posted.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return jsonResponse({ ok: true, invite_id: "i-new", expires_at: "2026-09-06T00:00:00Z" });
    }
    return mockMembersFetch(url);
  }) as unknown as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mountMembers();
    try {
      const open = async () => {
        const trigger = inviteTrigger(body);
        assert.ok(trigger, "the invite trigger must render");
        await h.act(async () => {
          await clickButton(trigger as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();
      };
      const field = () => {
        const input = findIn(body, (n) => n.tagName === "INPUT" && attrOf(n, "type") === "email");
        const select = findIn(body, (n) => n.tagName === "SELECT");
        assert.ok(input && select, "the dialog's own controls must render");
        return { input, select };
      };
      const send = async () => {
        const button = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Send invitation");
        assert.ok(button, "Send invitation must render");
        await h.act(async () => {
          await clickButton(button as never);
        });
        for (let i = 0; i < 6; i++) await h.settle();
      };

      await open();
      const first = field();
      await h.act(() => {
        setFieldValue(first.input as never, "typed@example.test");
      });
      await h.act(() => {
        setFieldValue(first.select as never, "admin");
      });
      await h.settle();

      // THE TYPED VALUES REACHED REACT STATE — measured where it matters, on the
      // request the courier received. A field whose `onChange` was never wired
      // posts the initial state instead.
      await send();
      assert.deepEqual(
        posted,
        [{ email: "typed@example.test", role: "admin" }],
        "the address and role the human entered are what went to the courier",
      );

      // A successful invite closes the dialog, and closing is what clears it.
      assert.ok(
        !/Invite someone to this firm/.test(textOf(body as never)),
        "a successful invite must close the dialog before the reset can be observed",
      );

      await open();
      const second = field();
      assert.equal(
        (second.input as unknown as { value: string }).value,
        "",
        "a re-opened dialog must not present the address that was just invited — one click from CLR10 'an invite is already pending for this email'",
      );
      // The ROLE's reset is asserted on the wire below rather than here: a
      // freshly-mounted `<select>` in this harness reports `value === ""` until
      // react-dom writes it, because the stub has no real option-selection
      // machinery (test/hookHarness.ts's `mkNode` provides `options` and
      // `multiple` and nothing more). Reading it here would be measuring the
      // stub. The submitted body cannot be faked the same way.
      assert.equal(findAll(body, (n) => n.tagName === "OPTION").length, 4, "all four roles are still offered");

      // AND THE SAME PROOF ON THE WIRE: submitting the re-opened dialog untouched
      // posts the DEFAULTS, not what was typed before. This is the half that goes
      // red when the reset effect is deleted, independently of the half above.
      await send();
      assert.deepEqual(
        posted[1],
        { email: "", role: "bookkeeper" },
        "A RE-OPENED DIALOG THAT STILL HELD THE OLD VALUES WOULD RE-SEND THEM",
      );
    } finally {
      await h.unmount();
    }
  });
});
