// GATE (c) — keyboard-walk scan of the SIGN-IN surface.
//
// Never scanned before P4-3 (see `login-a11y.test.tsx`'s header). It is the way
// back in for every person who already has an account — including the one this
// train strands most deliberately, the applicant sitting on /pending whose only
// action is to log out. A sign-in control that cannot be operated from the
// keyboard locks all of them out with no second route.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent, textOf, setFieldValue } from "../test/hookHarness";
import { enableDomInspection } from "../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../test/keyboardWalk";
import messages from "../messages/en.json";
import { LoginForm, type LoginAuthClient } from "./login-form";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node; disabled?: boolean };

/**
 * The auth client is injected at `LoginForm`'s own seam and COUNTS its calls,
 * so "the keyboard-driven submit actually signed in" is measured at the
 * transport rather than inferred from the router having navigated.
 *
 * Never the real client: it needs a `WebSocket` Node 20 lacks, and its refresh
 * timers keep the process alive — measured at a 200s hang on this branch. See
 * `login-form.tsx`'s seam header.
 */
const countingClient = (
  error: { message: string } | null,
  calls: { n: number },
): (() => LoginAuthClient) => () => ({
  auth: {
    signInWithPassword: async () => {
      calls.n += 1;
      return { error };
    },
  },
});

type Router = { pushed: string[] };

/**
 * `LoginForm` reads `useSearchParams()` on the SUCCESS path, to resolve
 * proxy.ts's `?next=`. Outside a search-params context that hook returns NULL
 * and the handler throws on `.get` — which is why this file supplies the same
 * `SearchParamsContext` Next.js itself provides in production. The login route
 * wraps the form in `<Suspense>` for exactly this hook.
 *
 * `next` is left EMPTY here on purpose, so the success case lands on the
 * component's own fallback destination ("/") rather than on a value this test
 * invented. `tests/safe-redirect.test.ts` owns the `?next=` open-redirect wall.
 */
function App(node: ReactElement, router: Router, next = "") {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      SearchParamsContext.Provider as never,
      { value: new URLSearchParams(next) as never },
      createElement(
        AppRouterContext.Provider as never,
        {
          value: {
            push: (href: string) => { router.pushed.push(href); },
            replace: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
          } as never,
        },
        createElement("div", null, createElement("h1", null, "Sign in"), node),
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
const byButtonText = (re: RegExp) => (n: Node) => n.tagName === "BUTTON" && re.test(textOf(n as never));
const byLabelledInput = (label: RegExp) => (n: Node) =>
  n.tagName === "INPUT" && label.test(textOf((n.parentNode ?? {}) as never));

test("THE WHOLE SIGN-IN IS KEYBOARD-OPERABLE, and a keyboard-driven submit signs in", async () => {
  const router: Router = { pushed: [] };
  const calls = { n: 0 };
  const h = await renderComponent(
    App(createElement(LoginForm, { createSupabaseClient: countingClient(null, calls) }), router),
  );
  try {
    for (let i = 0; i < 3; i++) await h.settle();

    const email = findIn(h.container as never, byLabelledInput(/Email/));
    const password = findIn(h.container as never, byLabelledInput(/Password/));
    const submit = findIn(h.container as never, byButtonText(/^Sign in$/));
    const signup = findIn(h.container as never, (n) => n.tagName === "A" && /Create an account/.test(textOf(n as never)));
    assert.ok(email && password && submit, "every control on the sign-in form must render");
    assert.ok(signup, "the 裁-57 sign-up link must render");

    const reachable = focusableElements(h.container as never);
    for (const [label, node] of [["email", email], ["password", password], ["the submit", submit], ["the sign-up link", signup]] as const) {
      assert.ok(reachable.includes(node as never), `${label} must be keyboard-reachable`);
    }
    assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations");
    assert.notEqual((submit as Node).disabled, true, "the submit is open before the act");

    await h.act(() => {
      setFieldValue(email as never, "aisyah@example.com");
      setFieldValue(password as never, "correct horse battery");
    });

    // `fireEvent(form, "submit")` is what a real browser does when Enter or
    // Space lands on the focused submit button. `clickButton` is deliberately
    // NOT used on a `type="submit"` control: it invokes an `onClick` prop and
    // THROWS when there is none, and a submit button has none — the submission
    // is the form's. The "does this control admit an act" half is covered by
    // the live-`disabled` assertion above, which is exactly what the harness's
    // own `clickButton` header prescribes for a gate.
    const form = findIn(h.container as never, (n) => n.tagName === "FORM");
    assert.ok(form, "the sign-in form must render");
    await h.fireEvent(form as never, "submit");
    for (let i = 0; i < 8; i++) await h.settle();

    // THE DISCRIMINATING POST-CONDITION: the run reached the auth client AND
    // navigated. Both are true only after the submit.
    assert.equal(calls.n, 1, "the keyboard-driven submit never reached the auth client");
    assert.deepEqual(router.pushed, ["/"], "and only then does it leave");
  } finally {
    await h.unmount();
  }
});

test("the FAILURE state stays keyboard-operable — the person can correct and retry", async () => {
  const router: Router = { pushed: [] };
  const calls = { n: 0 };
  const h = await renderComponent(
    App(
      createElement(LoginForm, {
        createSupabaseClient: countingClient({ message: "Invalid login credentials" }, calls),
      }),
      router,
    ),
  );
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const email = findIn(h.container as never, byLabelledInput(/Email/));
    const password = findIn(h.container as never, byLabelledInput(/Password/));
    const submit = findIn(h.container as never, byButtonText(/^Sign in$/));
    await h.act(() => {
      setFieldValue(email as never, "aisyah@example.com");
      setFieldValue(password as never, "wrong");
    });
    assert.notEqual((submit as Node).disabled, true, "the submit is open before the act");
    const form = findIn(h.container as never, (n) => n.tagName === "FORM");
    await h.fireEvent(form as never, "submit");
    for (let i = 0; i < 8; i++) await h.settle();

    assert.match(textOf(h.container as never), /Invalid login credentials/, "the failure must have rendered");
    assert.deepEqual(router.pushed, [], "a failed sign-in must not navigate");

    // The recovery: everything is still reachable and the submit is still live.
    // A form that stayed `disabled` after a failure would strand a keyboard
    // user on a dead page, and the `isLoading` flag that drives that attribute
    // is exactly the thing an early `return` can forget to clear.
    assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no violations on the failure state");
    const live = findIn(h.container as never, byButtonText(/^Sign in$/));
    assert.ok(focusableElements(h.container as never).includes(live as never));
    assert.notEqual((live as Node).disabled, true, "the submit stayed disabled after a failure");
    await h.fireEvent(findIn(h.container as never, (n) => n.tagName === "FORM") as never, "submit");
    for (let i = 0; i < 8; i++) await h.settle();
    assert.equal(calls.n, 2, "the retry never reached the auth client");
  } finally {
    await h.unmount();
  }
});
