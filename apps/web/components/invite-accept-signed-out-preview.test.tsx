// #871 — THE SIGNED-OUT PREVIEW BLOCK, on the invite landing page's FIRST screen.
//
// The seam is `InviteAcceptForm`'s rendered behaviour at the `confirm` stage: the page's server
// component reads `clara.preview_invite_by_token` through the runtime BEFORE anyone signs in
// (`lib/firm/invite-preview-public.ts`) and hands the outcome down as a prop. Nothing here mocks
// the component; the transport was already proven at its own seam in
// `lib/firm/invite-preview-public.test.ts`, and the DOOR at
// `packages/db/tests/invite-preview-public.test.mjs`.
//
// THE PROPERTY, IN ONE SENTENCE: an invitee sees which firm and which role the link names before
// they do anything, and no failure of that read ever takes the sign-in step away from them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { renderComponent, textOf } from "../test/hookHarness";
import { enableDomInspection } from "../test/domInspect";
import messages from "../messages/en.json";
import type { PublicInvitePreviewOutcome } from "../lib/firm/invite-preview-public";
import { InviteAcceptForm } from "./invite-accept-form";

enableDomInspection();

type Node = {
  tagName?: string;
  childNodes?: Node[];
  parentNode?: Node;
  getAttribute?: (name: string) => string | null;
};

const SUPABASE_TOKEN = "s".repeat(32);
const CLARA_TOKEN = "c".repeat(64);

const PREVIEW_ROW = {
  firm_name: "LARKIN & CO",
  role: "bookkeeper",
  status: "pending",
  masked_email: "n***@larkin.test",
} as const;
const PREVIEW: PublicInvitePreviewOutcome = { ok: true, preview: { ...PREVIEW_ROW } };

function mount(form: ReactElement) {
  const value = {
    replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
  };
  const tree = createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      { value: value as never },
      createElement("div", null, form),
    ),
  });
  return renderComponent(tree);
}

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
const bySectionLabel = (id: string) => (n: Node) =>
  n.tagName === "SECTION" && n.getAttribute?.("aria-labelledby") === id;
const byButtonText = (re: RegExp) => (n: Node) => n.tagName === "BUTTON" && re.test(textOf(n as never));

function formWith(signedOutPreview: PublicInvitePreviewOutcome | null) {
  return createElement(InviteAcceptForm, {
    token: SUPABASE_TOKEN,
    inviteToken: CLARA_TOKEN,
    signedOutPreview,
    createSupabaseClient: () => ({
      auth: {
        verifyOtp: async () => ({ data: { user: null, session: null }, error: null }),
        getClaims: async () => ({ data: { claims: {} }, error: null }),
        updateUser: async () => ({ error: null }),
      },
    }) as never,
  });
}

test("p871.web.signed_out: the firm, the role and the masked address render on the FIRST screen, before anything is signed in or consumed", async () => {
  const h = await mount(formWith(PREVIEW));

  const block = findIn(h.container as never, bySectionLabel("invite-signed-out-preview-heading"));
  assert.ok(block, "the signed-out preview block must render at the confirm stage");
  const text = textOf(block as never);
  assert.match(text, /LARKIN & CO/, "the firm the invitation is INTO, by name");
  assert.match(text, /Bookkeeper/, "the role, in this app's own vocabulary rather than the DB's token");
  assert.match(text, /n\*\*\*@larkin\.test/, "the masked address the door sent");
  assert.equal(/newhire@larkin\.test/.test(text), false, "an unmasked address can never appear here");

  // …and the journey is unchanged: the click gate is still what consumes the link.
  const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
  assert.ok(gate, "the sign-in step is still offered, below the preview");
});

test("p871.web.signed_out: the block renders ABOVE the control that consumes the link", async () => {
  const h = await mount(formWith(PREVIEW));
  const block = findIn(h.container as never, bySectionLabel("invite-signed-out-preview-heading"));
  const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
  assert.ok(block && gate, "both must be present for the order to mean anything");
  // DOCUMENT ORDER, walked rather than assumed: the first of the two the tree yields is the one a
  // reader (and a screen reader) meets first.
  const seen: string[] = [];
  const walk = (n: Node) => {
    if (n === block) seen.push("block");
    if (n === gate) seen.push("gate");
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(h.container as never);
  assert.deepEqual(seen, ["block", "gate"], "the preview must precede the control it explains");
});

test("p871.web.signed_out: an issuer-lapsed invitation still previews, with its notice and nothing promised", async () => {
  const lapsed: PublicInvitePreviewOutcome = {
    ok: true,
    preview: { ...PREVIEW_ROW, status: "issuer_lapsed" },
  };
  const h = await mount(formWith(lapsed));
  const block = findIn(h.container as never, bySectionLabel("invite-signed-out-preview-heading"));
  assert.ok(block, "an issuer-lapsed invitation is still OPEN, so it still previews (ticket 872 own ruling)");
  const text = textOf(block as never);
  assert.match(text, /no longer an admin or owner/, "the notice is shown");
  assert.equal(/will be accepted|you can accept/i.test(text), false,
    "and it promises nothing about acceptance -- only clara.accept_invite decides that");
});

test("p871.web.signed_out: every failed read renders NOTHING extra and never takes the sign-in step away", async () => {
  const failures: (PublicInvitePreviewOutcome | null)[] = [
    null,
    { ok: false, kind: "not_previewable" },
    { ok: false, kind: "indefinite", reason: "transport" },
    { ok: false, kind: "indefinite", reason: "unreadable" },
    { ok: false, kind: "indefinite", reason: "rate_limited" },
  ];
  for (const outcome of failures) {
    const h = await mount(formWith(outcome));
    const label = JSON.stringify(outcome);
    assert.equal(
      findIn(h.container as never, bySectionLabel("invite-signed-out-preview-heading")),
      null,
      `${label}: no block is rendered`,
    );
    const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
    assert.ok(gate, `${label}: the sign-in step is still offered -- a read that could not read is not a verdict`);
    // AND NOTHING IS SAID ABOUT THE INVITATION. A signed-out surface that announced "this link is
    // not valid" would be a second place that blocks an invitation, which the post-verification
    // preview already owns with a reader whose address the door has checked.
    const text = textOf(h.container as never);
    assert.equal(/not valid|expired|revoked/i.test(text), false, `${label}: no verdict is printed`);
  }
});
