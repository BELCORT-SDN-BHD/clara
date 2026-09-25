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
  // #1095 -- `rate_limited` is EXCLUDED from this group on purpose: it is the one indefinite
  // reason that now gains a render (see the dedicated tests below). Every OTHER failure still
  // renders nothing extra, which is the property this loop pins.
  const failures: (PublicInvitePreviewOutcome | null)[] = [
    null,
    { ok: false, kind: "not_previewable" },
    { ok: false, kind: "indefinite", reason: "transport" },
    { ok: false, kind: "indefinite", reason: "unreadable" },
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

// #1095 -- THE ONE INDEFINITE REASON THAT RENDERS SOMETHING. Before this ticket a rate-limited
// read rendered nothing at all, identically to a transport failure, so a visitor who had simply
// reloaded too often was left staring at a page that would not say why. The property under test:
// they now get a distinct, actionable notice, and NOTHING else about this journey changes -- no
// verdict about the invitation, the sign-in step still offered, the firm/role/email block (a
// DIFFERENT section, for a DIFFERENT outcome) still absent.
test("p871.web.signed_out: a rate-limited read renders its own notice, and nothing else changes", async () => {
  const h = await mount(formWith({ ok: false, kind: "indefinite", reason: "rate_limited" }));

  const text = textOf(h.container as never);
  assert.match(text, /too many times/i, "the visitor is told the read was walled, not left with silence");
  assert.match(text, /reload this page/i, "...and what to do about it -- the 'try again' affordance the ticket asks for");
  assert.match(text, /still continue|unaffected/i, "...and that the invitation itself is untouched");

  // DISTINCT from the other indefinite reasons: those two still render the generic note or
  // nothing, so the two faces must not be the same string.
  const generic = await mount(formWith({ ok: false, kind: "indefinite", reason: "transport" }));
  assert.notEqual(text, textOf(generic.container as never), "a rate refusal reads differently from a transport failure");

  // The firm/role/email block is a different section, for the `ok: true` outcome only.
  assert.equal(
    findIn(h.container as never, bySectionLabel("invite-signed-out-preview-heading")),
    null,
    "the rate-limited face is not the firm/role/email preview block",
  );
  const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
  assert.ok(gate, "the sign-in step is still offered -- a rate wall refusal never blocks the journey");
  assert.equal(/not valid|expired|revoked/i.test(text), false, "no verdict is printed about the invitation itself");
});

// #1095 FIX ROUND (ADV-L07-01) -- THE NOTICE PUBLISHES NO WAIT AND ACCUSES NOBODY.
//
// `clara.preview_invite_by_token` walls on two limbs (five loads per TOKEN and five per ORIGIN in
// fifteen minutes) and advertises the MAXIMUM of the two waits, with no `scope`. So on an
// anonymous page a printed number can be wholly another party's: measured on the lane rig, a
// first-ever request from a cold address against a token somebody else had loaded five times four
// minutes earlier answered `rate_limited, 660` with zero rows of the caller's own, and 900 - 660
// dates that party's fifth-oldest load to the second. The same case makes "WE CHECKED YOUR
// invitation too many times" a plain falsehood -- for that visitor, and for anyone behind a shared
// NAT whose neighbour exhausted the origin limb.
//
// Two properties, pinned here because a future edit that re-adds the number would pass every other
// cell in this file: the rendered notice contains NO digits at all, and it does not tell the
// visitor they did something.
test("p871.web.signed_out: the rate-limited notice carries no number and does not accuse the visitor", async () => {
  const h = await mount(formWith({ ok: false, kind: "indefinite", reason: "rate_limited" }));
  // The notice is ONE paragraph of its own, so the assertions below read exactly it rather than a
  // window cut out of the whole page (a slice would have hidden the opening clause, which is the
  // half that accuses).
  const noticeNode = findIn(
    h.container as never,
    (n) => n.tagName === "P" && /too many times/i.test(textOf(n as never)),
  );
  assert.ok(noticeNode, "the rate-limited notice is its own paragraph");
  const notice = textOf(noticeNode as never);
  assert.equal(
    /\d/.test(notice),
    false,
    `the notice must publish no wait at all -- any number here can be another party's activity: ${notice}`,
  );
  assert.equal(
    /\bNaN\b/.test(notice),
    false,
    `...and certainly not a placeholder that never received one: ${notice}`,
  );
  assert.equal(
    /\b(we|you) (checked|reloaded|looked)\b|your invitation too many times/i.test(notice),
    false,
    `the notice must not assert that THIS visitor made the attempts -- the origin limb can be exhausted by a `
      + `neighbour behind the same NAT, and the token limb by the real invitee: ${notice}`,
  );
});

test("p871.web.signed_out: the credential-holding reader is reachable ONLY from the server, and the client component imports it as a TYPE", async () => {
  // THE PROPERTY THE OWNER'S RULING PUTS FIRST: "the web app never holds the credential" in
  // anything a browser can reach. `lib/firm/invite-preview-public.ts` reads
  // `CLARA_AUTH_WALL_SERVICE_TOKEN` at request time, so an import of it from a `"use client"`
  // module would put that read into a client chunk. This is a source census rather than a bundle
  // scan because it fails at the point a reviewer can act on — the import — instead of after a
  // build, and because a bundle scan can only ever say "not in THIS build".
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join, dirname, relative } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(full);
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(join(webRoot, dir));

  const importers = files
    .filter((f) => /from "[^"]*firm\/invite-preview-public"/.test(readFileSync(f, "utf8")))
    .map((f) => relative(webRoot, f).replace(/\\/g, "/"))
    .sort();
  assert.deepEqual(
    importers,
    ["app/(entry)/invite/[token]/page.tsx", "components/invite-accept-form.tsx"],
    "closed world: the server component that READS it, and the client component that names its TYPE",
  );

  const page = readFileSync(join(webRoot, "app/(entry)/invite/[token]/page.tsx"), "utf8");
  assert.equal(/"use client"/.test(page), false, "the page that holds the credential must stay a SERVER component");

  const form = readFileSync(join(webRoot, "components/invite-accept-form.tsx"), "utf8");
  assert.match(form, /"use client"/, "the form is a client component -- which is why the next line matters");
  assert.match(
    form,
    /import type \{[^}]*PublicInvitePreviewOutcome[^}]*\} from "@\/lib\/firm\/invite-preview-public"/,
    "a TYPE-ONLY import, erased at build: the client chunk never pulls in the module that reads the service token",
  );
  assert.equal(
    /CLARA_AUTH_WALL_SERVICE_TOKEN/.test(form),
    false,
    "and no client module names the credential at all",
  );
});
