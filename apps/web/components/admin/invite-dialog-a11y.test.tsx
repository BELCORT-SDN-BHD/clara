// GATE (b) — the structural a11y scan of the invite dialog, OPEN.
//
// A dialog is the surface where a11y most often quietly breaks, because the
// content is portalled out of the mount root and a container-scoped scan sails
// straight past it. `mountMembers` appends the container to `document.body`, and
// every scan here walks the BODY, so the dialog's own fields are actually
// inspected: an accessible name on the dialog, a real `<label for>` on the email
// field and on the role select, and no duplicate ids across the two.

import { test } from "node:test";
import assert from "node:assert/strict";

import { textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import {
  attrOf,
  findAll,
  findIn,
  mockMembersFetch,
  mountMembers,
  withMockedEnv,
} from "./members-fixtures";

enableDomInspection();

async function openInviteDialog() {
  const { h, body } = await mountMembers();
  const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Invite someone");
  assert.ok(trigger, "the invite trigger must render");
  assert.equal((trigger as unknown as { disabled: boolean }).disabled, false, "an owner's trigger is not gated");
  await h.act(async () => {
    await clickButton(trigger as never);
  });
  for (let i = 0; i < 4; i++) await h.settle();
  return { h, body };
}

test("invite dialog: OPEN, it scans clean and every field carries a real label", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await openInviteDialog();
      try {
        const text = textOf(body as never);
        // DISCRIMINATING: none of this is on the page before the click.
        assert.match(text, /Invite someone to this firm/, "the dialog must actually be open");
        assert.match(text, /Email address/);
        assert.match(text, /Send invitation/);

        // The rule engine's `label` rule needs a real association; assert the
        // wiring itself so a future refactor that drops `htmlFor` is caught by
        // more than a generic scan.
        const input = findIn(body, (n) => n.tagName === "INPUT" && attrOf(n, "type") === "email");
        assert.ok(input, "the email field must be a real <input type=email>");
        const inputId = attrOf(input, "id");
        assert.ok(inputId, "the email field must carry an id for its <label for>");
        const label = findIn(body, (n) => n.tagName === "LABEL" && attrOf(n, "for") === inputId);
        assert.ok(label, "a <label for> must target the email field");

        const select = findIn(body, (n) => n.tagName === "SELECT");
        assert.ok(select, "the role chooser must be a real <select>");
        const selectId = attrOf(select, "id");
        assert.ok(selectId && selectId !== inputId, "the two controls must not share an id");
        assert.ok(findIn(body, (n) => n.tagName === "LABEL" && attrOf(n, "for") === selectId), "the role select needs its own label");

        const violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("invite dialog: all four roles are offered, each with what it can do", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await openInviteDialog();
      try {
        const options = findAll(body, (n) => n.tagName === "OPTION");
        assert.equal(options.length, 4, "the ladder is four roles and the dialog offers all four");
        const labels = options.map((o) => textOf(o as never).trim());
        // THE CEILING IS NAMED, NOT ENFORCED HERE. `invite_member` (`0147:386`)
        // refuses CLR04 above the caller's rank; filtering `owner` out of this
        // list client-side would hide that wall instead of teaching it.
        assert.deepEqual(labels, [
          "Viewer — reads the books and changes nothing",
          "Bookkeeper — prepares and posts the day-to-day work",
          "Admin — manages people and invitations as well",
          "Owner — signs for the firm; a firm always keeps one",
        ]);
        assert.match(textOf(body as never), /You can invite someone at your own rank or below/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("invite dialog: NO client-side submit gate — the courier remains the first runtime judge", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await openInviteDialog();
      try {
        const send = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Send invitation");
        assert.ok(send, "the submit control must render");
        // A raw empty address is the courier's `unsupported_address`; spaces-only
        // canonicalises to empty and reaches the door's CLR10. A client-side
        // `required`/disabled-until-valid gate would drift from both branches.
        assert.equal(
          (send as unknown as { disabled: boolean }).disabled,
          false,
          "the send control must not be gated on client-side validation",
        );
        const input = findIn(body, (n) => n.tagName === "INPUT" && attrOf(n, "type") === "email");
        assert.equal(attrOf(input!, "required"), null, "no client-side required attribute");
      } finally {
        await h.unmount();
      }
    },
  );
});
