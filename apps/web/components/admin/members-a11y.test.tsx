// GATE (b) — the structural a11y scan of /admin/members: the roster with its
// withheld-email note, the row role/remove menu OPEN, the remove confirm dialog
// OPEN, the invite list with its revoke control, and the revoke confirm dialog.
// See test/domInspect.ts's header for why this rides a hand-written rule engine
// rather than real axe-core.
//
// EVERY SCAN RUNS OVER `document.body`, NOT THE CONTAINER. @base-ui/react portals
// an open Dialog and an open Menu onto `document.body`, a sibling of the mount
// root — a scan of the container alone would walk right past the very content
// these cells exist to check, and pass. `mountMembers` appends the container to
// the body first, so one walk sees both (the idiom
// components/firm-admin/firm-admin-a11y.test.tsx established).
//
// EVERY SCAN ALSO ASSERTS ITS CONTENT ARRIVED FIRST. A zero-violation scan over a
// spinner or an error banner is the vacuous green the P3 finale named by name.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { MembersPanel } from "./members-panel";
import {
  App,
  attrOf,
  BOOKKEEPER_CONTEXT,
  findAll,
  findIn,
  jsonResponse,
  MEMBERS,
  mockMembersFetch,
  mountMembers,
  OWNER_CONTEXT,
  withMockedEnv,
} from "./members-fixtures";

enableDomInspection();

test("members: the loaded roster and invite list have zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const text = textOf(body as never);
        assert.match(text, /Tao Lim/, "the roster must actually have loaded");
        assert.match(text, /newhire@example\.test/, "the invite list must actually have loaded");
        const violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("VACUITY CONTROL: the rule engine really inspects this tree", async () => {
  // Every `deepEqual(violations, [])` in this file is worth exactly as much as
  // the instrument behind it. A planted unlabelled button must be caught.
  const h = await renderComponent(App(createElement("button", { type: "button" }), "Members"));
  try {
    const violations = checkAccessibility(h.container as never);
    assert.equal(violations.length, 1, JSON.stringify(violations));
    assert.equal(violations[0]?.rule, "button-name");
  } finally {
    await h.unmount();
  }
});

test("members: a withheld email renders as a NAMED absence, never a blank cell", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const text = textOf(body as never);
        // The cell itself.
        assert.match(text, /Not shown/, "a null email must render an absence, not nothing at all");
        // …and the note that NAMES the required rank without claiming which of
        // the two causes applied — `clara.users.email` is itself nullable
        // (`0002:194`), so "it is masked" would be a derivation, and review law 2
        // says a derived state is not evidence.
        assert.match(text, /A withheld email has two causes/);
        assert.match(text, /published to admin and owner only, and a member can also have no email on record/);
        const violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("members: the note appears ONLY when a row is actually withheld", async () => {
  // Discriminating in the other direction: a note that always renders would say
  // nothing about this roster.
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rest/v1/firm_members_visible")) {
        return jsonResponse([
          {
            membership_id: "m-1", user_id: "u-1", display_name: "Tao Lim", email: "tao@example.test",
            role: "owner", role_rank: 3, status: "active", created_at: "2026-01-04T00:00:00Z", removed_at: null,
          },
        ]);
      }
      return mockMembersFetch(url);
    },
    async () => {
      const { h, body } = await mountMembers();
      try {
        const text = textOf(body as never);
        assert.match(text, /tao@example\.test/, "the roster must have loaded");
        assert.ok(!/Not shown/.test(text), "no row is withheld, so no cell may claim one is");
        assert.ok(!/A withheld email has two causes/.test(text), "the footnote must not render unprompted");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("members: the row role menu, OPEN, offers all four roles and scans clean", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === "Actions for Tao Lim");
        assert.ok(trigger, "the row menu trigger must render with its accessible name");
        await h.act(async () => {
          await clickButton(trigger as never);
        });
        for (let i = 0; i < 3; i++) await h.settle();

        const items = findAll(body, (n) => attrOf(n, "role") === "menuitemradio");
        // THE CEILING IS NOT PRE-EMPTED: all four ladder roles are offered
        // regardless of the caller's own rank. Filtering the list would hide
        // CLR04 'cannot assign a role above your own rank' instead of teaching it.
        assert.equal(items.length, 4, "all four roles must be offered, unfiltered");
        assert.deepEqual(
          items.map((i) => textOf(i as never).trim()),
          ["Viewer", "Bookkeeper", "Admin", "Owner"],
        );
        // …and the current one is the ONE marked.
        const checked = items.filter((i) => attrOf(i, "aria-checked") === "true");
        assert.equal(checked.length, 1);
        assert.equal(textOf(checked[0] as never).trim(), "Owner");

        const violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("members: the remove confirm dialog, OPEN, scans clean and names the person", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const trigger = findIn(body, (n) => n.tagName === "BUTTON" && attrOf(n, "aria-label") === "Actions for Siti Rahman");
        assert.ok(trigger);
        await h.act(async () => {
          await clickButton(trigger as never);
        });
        for (let i = 0; i < 3; i++) await h.settle();
        const remove = findIn(body, (n) => attrOf(n, "role") === "menuitem" && textOf(n as never).trim() === "Remove from firm");
        assert.ok(remove, "the destructive menu item must render");
        await h.act(async () => {
          await clickButton(remove as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();

        const text = textOf(body as never);
        assert.match(text, /Remove Siti Rahman from this firm\?/, "the dialog must name the row it acts on");
        assert.match(text, /There is no undo verb/, "…and say what removal actually means");
        const violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("members: the revoke confirm dialog, OPEN, scans clean and names the address", async () => {
  await withMockedEnv(
    async (u) => mockMembersFetch(String(u)),
    async () => {
      const { h, body } = await mountMembers();
      try {
        // The EXPIRED row's own Revoke — offered deliberately, because the view's
        // status is computed while the row is still `pending`.
        const buttons = findAll(body, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Revoke");
        assert.equal(buttons.length, 2, "both invite rows carry a Revoke control, expired included");
        await h.act(async () => {
          await clickButton(buttons[1] as never);
        });
        for (let i = 0; i < 4; i++) await h.settle();
        const text = textOf(body as never);
        assert.match(text, /Revoke the invitation for stale@example\.test\?/);
        const violations = checkAccessibility(body as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

/**
 * ABSENCE IS NOT EVIDENCE, RENDERED — independent review of #455, LOW-9.
 *
 * Both empty states used to make a claim about the WORLD: "This firm has no
 * members on its roster" and "No invitations are outstanding". Neither view can
 * support it. `firm_members_visible` floors at bookkeeper+ and
 * `firm_invites_visible` at admin+, and BELOW THE FLOOR THE PREDICATE EXCLUDES
 * EVERY ROW — the read succeeds and returns zero rows, indistinguishable on the
 * wire from a firm that genuinely has none (`lib/members/reads.ts`'s own header
 * says so for both). So a below-rank caller was being told, in Clara's voice,
 * something Clara had not read and could not know.
 *
 * The copy now describes THE SCREEN ("No roster rows are visible here"), which is
 * true under every cause, and each section's description states its floor
 * unconditionally beside it. This is the same discipline the withheld-email cell
 * already enforces one table over: state the absence, name the causes, guess
 * between them never.
 */
const FACTUAL_ABSENCE = [
  /has no members/i,
  /no members on its roster/i,
  /no invitations are outstanding/i,
  /this firm has no/i,
  /there are none/i,
];

function assertNoFactualAbsence(text: string, fixture: string): void {
  for (const claim of FACTUAL_ABSENCE) {
    assert.ok(
      !claim.test(text),
      `${fixture}: the screen asserted a FACT about the world (${claim}) that a floored read cannot support`,
    );
  }
}

test("members: loading, empty and failed are three DIFFERENT screens", async () => {
  // LOADING → a sentence naming what is loading.
  await withMockedEnv(
    async () => new Promise<Response>(() => {}) as unknown as Response,
    async () => {
      const h = await renderComponent(App(createElement(MembersPanel), "Members"));
      try {
        await h.settle();
        const text = h.text();
        assert.match(text, /Loading the member roster/);
        assert.ok(!/No roster rows are visible/.test(text), "a pending read must never render the empty state");
      } finally {
        await h.unmount();
      }
    },
  );

  // EMPTY → a sentence about THE SCREEN, and no table.
  await withMockedEnv(
    async () => jsonResponse([]),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const text = textOf(body as never);
        assert.match(text, /No roster rows are visible here/);
        assert.match(text, /No invitation rows are visible here/);
        assertNoFactualAbsence(text, "zero rows");
        assert.equal(findIn(body, (n) => n.tagName === "TABLE"), null, "an empty read renders no table");
        assert.deepEqual(checkAccessibility(body as never), []);
      } finally {
        await h.unmount();
      }
    },
  );

  // FAILED → the failure, and NO table standing in for it.
  await withMockedEnv(
    async () => jsonResponse({ message: "permission denied for view firm_members_visible" }, 403),
    async () => {
      const { h, body } = await mountMembers();
      try {
        const text = textOf(body as never);
        assert.match(text, /permission denied for view firm_members_visible/, "the read's own message renders");
        assert.ok(!/No roster rows are visible/.test(text), "a FAILED read must never render as an empty roster");
        assertNoFactualAbsence(text, "failed read");
        assert.equal(findIn(body, (n) => n.tagName === "TABLE"), null);
        assert.deepEqual(checkAccessibility(body as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("LOW-9: no absence fixture — below-rank, failed context, or zero rows — claims a FACT", async () => {
  // THE THREE CAUSES OF AN EMPTY SCREEN, driven separately, because they are
  // indistinguishable on the wire and the copy must therefore be true of all
  // three at once.
  const fixtures: { name: string; fetch: typeof fetch }[] = [
    {
      // BELOW THE INVITE FLOOR. A bookkeeper reads the roster fine and gets zero
      // invite rows from a view that excluded them — not from a firm with none.
      name: "below-rank caller",
      fetch: (async (u: RequestInfo | URL) => {
        const url = String(u);
        if (url.includes("/rest/v1/caller_context")) return jsonResponse(BOOKKEEPER_CONTEXT);
        if (url.includes("/rest/v1/firm_invites_visible")) return jsonResponse([]);
        if (url.includes("/rest/v1/firm_members_visible")) return jsonResponse(MEMBERS);
        throw new Error(`unexpected fetch: ${url}`);
      }) as unknown as typeof fetch,
    },
    {
      // THE CONTEXT READ ITSELF FAILED, so the screen does not even know the
      // caller's rank — and still must not claim anything about the firm.
      name: "failed caller_context",
      fetch: (async (u: RequestInfo | URL) => {
        const url = String(u);
        if (url.includes("/rest/v1/caller_context")) return jsonResponse({ message: "boom" }, 500);
        if (url.includes("/rest/v1/firm_invites_visible")) return jsonResponse([]);
        if (url.includes("/rest/v1/firm_members_visible")) return jsonResponse([]);
        throw new Error(`unexpected fetch: ${url}`);
      }) as unknown as typeof fetch,
    },
    {
      name: "genuinely zero rows",
      fetch: (async (u: RequestInfo | URL) => {
        const url = String(u);
        if (url.includes("/rest/v1/caller_context")) return jsonResponse(OWNER_CONTEXT);
        return jsonResponse([]);
      }) as unknown as typeof fetch,
    },
  ];

  for (const fixture of fixtures) {
    await withMockedEnv(fixture.fetch, async () => {
      const { h, body } = await mountMembers();
      try {
        const text = textOf(body as never);
        assertNoFactualAbsence(text, fixture.name);
        // …and the floor is stated UNCONDITIONALLY beside the empty list, so the
        // absence is legible rather than merely un-claimed.
        assert.match(
          text,
          /Invitations are published to admin and owner only/,
          `${fixture.name}: the invite section must state its floor whatever it rendered`,
        );
      } finally {
        await h.unmount();
      }
    });
  }
});

test("VACUITY CONTROL: the neutrality walk really does catch a factual claim", () => {
  // Without this the walk above is equally green on a screen rendering nothing
  // at all, or on a regex list that matches no string a human would write.
  assert.throws(
    () => assertNoFactualAbsence("This firm has no members on its roster.", "control"),
    /asserted a FACT/,
  );
  assert.throws(() => assertNoFactualAbsence("No invitations are outstanding.", "control"), /asserted a FACT/);
  assertNoFactualAbsence("No roster rows are visible here.", "control");
});
