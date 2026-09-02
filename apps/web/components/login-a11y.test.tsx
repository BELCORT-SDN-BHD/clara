// GATE (b) — structural a11y scan of the SIGN-IN surface.
//
// THIS SURFACE HAD NEVER BEEN IN EITHER SCAN. It shipped with P2, predates both
// a11y gates, and sits squarely in P4-3's blast radius: this train moves its
// route into the `(entry)` group, grounds it on the identity canvas and adds the
// 裁-57 sign-up link to it. Registering it is P4-3's order, and it is the last
// unscanned surface on the entry faces.
//
// Both of its states are scanned — the resting form and the sign-in failure,
// which renders Supabase's own message verbatim in a `StateBanner`.
//
// The real `(entry)` layout and `LoginForm` composition is rendered here. The
// form owns its actual `<h1>`; the test supplies no synthetic heading that could
// conceal a missing page title.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent, textOf, setFieldValue } from "../test/hookHarness";
import { enableDomInspection } from "../test/domInspect";
import { checkAccessibility } from "../test/a11yRules";
import messages from "../messages/en.json";
import { LoginForm, type LoginAuthClient } from "./login-form";
import EntryLayout from "../app/(entry)/layout";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node };

/**
 * THE AUTH CLIENT IS INJECTED AT `LoginForm`'s OWN SEAM, never constructed for
 * real. Measured on this branch: letting the real browser client be built made
 * this file run to a 200-SECOND timeout rather than the ~80ms its assertions
 * take — `@supabase/realtime-js` needs a native `WebSocket` Node 20 does not
 * have, and the auth client's refresh timers keep the process alive after the
 * test ends. That is the same hazard `InviteAcceptForm`'s `InviteAuthClient`
 * header records; P4-3 added the matching seam to `LoginForm` so this surface
 * could be scanned at all.
 */
const authClient = (error: { message: string } | null): (() => LoginAuthClient) => () => ({
  auth: { signInWithPassword: async () => ({ error }) },
});

/** `SearchParamsContext` is supplied for the same reason `login-keyboard`'s
 *  harness supplies it: `LoginForm` reads `useSearchParams()` on the success
 *  path, and outside that context the hook returns NULL and the handler throws
 *  on `.get`. Without it these scans would pass only by never reaching the line. */
function App(node: ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      SearchParamsContext.Provider as never,
      { value: new URLSearchParams("") as never },
      createElement(
        AppRouterContext.Provider as never,
        {
          value: {
            replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
          } as never,
        },
        createElement(EntryLayout, null, node),
      ),
    ),
  });
}

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
const byLabelledInput = (label: RegExp) => (n: Node) =>
  n.tagName === "INPUT" && label.test(textOf((n.parentNode ?? {}) as never));

test("the sign-in form has zero a11y violations", async () => {
  const h = await renderComponent(
    App(createElement(LoginForm, { createSupabaseClient: authClient(null) })),
  );
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    // DISCRIMINATING: both labelled fields are genuinely present, so a
    // `label` violation would have somewhere to come from.
    assert.ok(findIn(h.container as never, byLabelledInput(/Email/)), "the email field must render");
    assert.ok(findIn(h.container as never, byLabelledInput(/Password/)), "the password field must render");
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("N4: the actual entry-layout/login composition owns exactly one h1", async () => {
  // The masking hazard of the wrapper idiom, closed by measurement rather than
  // by argument. If the `<h1>` were papering over a real violation, this cell
  // reds. The real composition now proves `LoginForm` owns that heading and the
  // harness supplies no synthetic one.
  const h = await renderComponent(
    App(createElement(LoginForm, { createSupabaseClient: authClient(null) })),
  );
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    assert.deepEqual(checkAccessibility(h.container as never), []);
    const headings = (h.container as unknown as { querySelectorAll(selector: string): unknown[] })
      .querySelectorAll("h1");
    assert.equal(headings.length, 1, "the composed login document must own exactly one h1");
  } finally {
    await h.unmount();
  }
});

test("the SIGN-IN FAILURE state has zero a11y violations", async () => {
  // The message is Supabase's own, rendered VERBATIM in a StateBanner — the
  // component passes `signInError.message` through untouched, and this cell
  // asserts the exact sentence arrives on screen.
  const h = await renderComponent(
    App(
      createElement(LoginForm, { createSupabaseClient: authClient({ message: "Invalid login credentials" }) }),
    ),
  );
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const email = findIn(h.container as never, byLabelledInput(/Email/));
    const password = findIn(h.container as never, byLabelledInput(/Password/));
    await h.act(() => {
      setFieldValue(email as never, "aisyah@example.com");
      setFieldValue(password as never, "wrong");
    });
    const form = findIn(h.container as never, (n) => n.tagName === "FORM");
    await h.fireEvent(form as never, "submit");
    for (let i = 0; i < 8; i++) await h.settle();
    assert.match(
      textOf(h.container as never),
      /Invalid login credentials/,
      "the failure banner must have rendered — Supabase's own message, verbatim",
    );
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("裁-57 — the sign-up link renders, is a real link, and points at /signup", async () => {
  // The one thing P4-3 ADDS to this P2 component. `link-name` in the a11y scan
  // catches an unlabelled anchor; this cell catches the two failures it cannot
  // see — an anchor with no href at all, and one pointing somewhere else.
  //
  // The href is read off React's OWN props, the same `__reactProps$…` mechanism
  // `clickButton`/`setFieldValue` use. Same idiom as
  // components/clara/onboarding-begin-keyboard.test.tsx.
  //
  // (This paragraph used to justify that choice with "the stub DOM's
  // `setAttribute` is a no-op". That was already only half true — `domInspect`,
  // enabled at the top of this file, has always installed a real attribute
  // store — and P6-6 made the base harness store attributes too, so the reason
  // is now simply wrong. The IDIOM is kept: reading React's own props proves
  // what the component passed, one layer closer to the source than an
  // attribute round-trip.)
  const h = await renderComponent(
    App(createElement(LoginForm, { createSupabaseClient: authClient(null) })),
  );
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const link = findIn(
      h.container as never,
      (n) => n.tagName === "A" && /Create an account/.test(textOf(n as never)),
    ) as unknown as Record<string, unknown> | null;
    assert.ok(link, "the 裁-57 sign-up link is missing from the sign-in page");
    const propsKey = Object.keys(link).find((k) => k.startsWith("__reactProps"));
    assert.ok(propsKey, "could not read the anchor's React props — the href probe is vacuous");
    assert.equal(
      (link[propsKey] as { href?: string }).href,
      "/signup",
      "the sign-up link does not point at /signup",
    );
  } finally {
    await h.unmount();
  }
});
