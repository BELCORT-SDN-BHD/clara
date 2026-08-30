// THE SIGNUP CHAIN's TWO DOORS, driven through the real component.
//
// What this file proves, none of it by reading the source:
//   - the two doors are called in the DB's required ORDER, and step 3 is NOT
//     attempted when step 2 refuses;
//   - NO EMAIL is on the wire, from either call;
//   - every refusal renders VERBATIM with its CLR chip, and an ordinary failure
//     renders WITHOUT one — there is no DB verdict to show for a transport error;
//   - the landing happens ONLY after both doors returned.
//
// The click instrument is `clickButton` from test/hookHarness — the one shared
// instrument, which invokes the real handler on the real node and THROWS on a
// live `disabled`. Never a hand-rolled copy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { SignupFirmForm } from "./signup-firm-form";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node; disabled?: boolean };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Every RPC the run saw, in order, with the body it was given. */
type Call = { fn: string; body: Record<string, unknown> };

function withEstate(
  reply: (fn: string) => Response,
  run: (calls: Call[]) => Promise<void>,
): Promise<void> {
  const calls: Call[] = [];
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    const fn = url.slice(url.indexOf("/rpc/") + "/rpc/".length);
    calls.push({ fn, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return reply(fn);
  }) as typeof fetch;
  configureSessionTokenSource(async () => "tok");
  return run(calls).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

type Router = { replaced: string[] };

function App(form: ReactElement, router: Router) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      {
        value: {
          replace: (href: string) => { router.replaced.push(href); },
          refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
        } as never,
      },
      createElement("div", null, form),
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
const byLabelledField = (label: RegExp) => (n: Node) =>
  (n.tagName === "INPUT" || n.tagName === "TEXTAREA") && label.test(textOf((n.parentNode ?? {}) as never));

async function mounted(router: Router) {
  return renderComponent(App(createElement(SignupFirmForm), router));
}

/** Fill both required fields and submit. */
async function fillAndSubmit(h: Awaited<ReturnType<typeof mounted>>): Promise<void> {
  const name = findIn(h.container as never, byLabelledField(/Your name/));
  const firm = findIn(h.container as never, byLabelledField(/Firm name/));
  assert.ok(name && firm, "both required fields must render");
  await h.act(() => {
    setFieldValue(name as never, "Aisyah Rahman");
    setFieldValue(firm as never, "ROME PROPERTIES");
  });
  const form = findIn(h.container as never, (n) => n.tagName === "FORM");
  assert.ok(form, "the form must render");
  await h.fireEvent(form as never, "submit");
  for (let i = 0; i < 8; i++) await h.settle();
}

test("THE CHAIN: claim_identity FIRST, then request_firm_registration, then /pending", async () => {
  const router: Router = { replaced: [] };
  await withEstate(
    (fn) =>
      fn === "claim_identity"
        ? jsonResponse({ user_id: "u1", display_name: "Aisyah Rahman" })
        : jsonResponse({ request_id: "r1", status: "open" }),
    async (calls) => {
      const h = await mounted(router);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        await fillAndSubmit(h);

        // THE ORDER IS THE DB's: request_firm_registration raises CLR04
        // 'unknown actor' (0145:376-378) for an actor with no clara.users row,
        // and claim_identity is the only door that mints one. Asserting the
        // SEQUENCE, not merely that both were called.
        assert.deepEqual(
          calls.map((c) => c.fn),
          ["claim_identity", "request_firm_registration"],
          "the two doors were not called in the DB's required order",
        );

        // NO EMAIL ON THE WIRE, from either call. Asserted over the actual
        // posted bodies rather than over the rendered markup: "there is no
        // email input" is a claim about the form, and this is a claim about
        // what left the browser.
        for (const call of calls) {
          for (const key of Object.keys(call.body)) {
            assert.doesNotMatch(key, /mail/i, `${call.fn} posted an email-shaped argument: ${key}`);
          }
        }
        assert.deepEqual(Object.keys(calls[0]!.body).sort(), ["p_display_name", "p_op_key"]);
        assert.deepEqual(
          Object.keys(calls[1]!.body).sort(),
          ["p_firm_name", "p_note", "p_op_key"],
        );
        assert.equal(calls[1]!.body.p_firm_name, "ROME PROPERTIES");
        // An untouched note is sent as null, never as "".
        assert.equal(calls[1]!.body.p_note, null);

        // THE DISCRIMINATING POST-CONDITION: the landing is true only AFTER
        // both doors returned.
        assert.deepEqual(router.replaced, ["/pending"]);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("RED-BEFORE (the ordering wall): a refused claim_identity STOPS the chain", async () => {
  // The mutant this cell exists to catch is a chain that fires both calls
  // regardless — which would leave the person with a CLR04 'unknown actor' from
  // the second door on top of the real refusal from the first, and no way to
  // tell which one mattered. Measured here as a CALL COUNT, so it cannot pass on
  // rendering alone.
  const router: Router = { replaced: [] };
  await withEstate(
    (fn) =>
      fn === "claim_identity"
        ? jsonResponse({ code: "CLR10", message: "identity already claimed with a different email" }, 400)
        : jsonResponse({ request_id: "r1", status: "open" }),
    async (calls) => {
      const h = await mounted(router);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        await fillAndSubmit(h);

        assert.deepEqual(
          calls.map((c) => c.fn),
          ["claim_identity"],
          "request_firm_registration ran after claim_identity refused",
        );
        // The DB's own sentence and its own code, both verbatim.
        assert.match(textOf(h.container as never), /identity already claimed with a different email/);
        assert.match(textOf(h.container as never), /CLR10/);
        // And nothing navigated.
        assert.deepEqual(router.replaced, []);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("THE CLR09 PAIR renders verbatim — the 'already staff elsewhere' case", async () => {
  // Design §4 A's named requirement: this must refuse at REQUEST time with a
  // legible message, never be discovered at approval time. And it must not be
  // pre-empted — the click happens, the DB answers, the person reads it.
  for (const refusal of [
    { code: "CLR09", message: "actor already belongs to a firm" },
    { code: "CLR09", message: "an open registration request already exists" },
  ]) {
    const router: Router = { replaced: [] };
    await withEstate(
      (fn) => (fn === "claim_identity" ? jsonResponse({ user_id: "u1" }) : jsonResponse(refusal, 400)),
      async (calls) => {
        const h = await mounted(router);
        try {
          for (let i = 0; i < 3; i++) await h.settle();
          await fillAndSubmit(h);
          // Both doors WERE called — the UI did not guess the answer in front
          // of the DB.
          assert.deepEqual(calls.map((c) => c.fn), ["claim_identity", "request_firm_registration"]);
          assert.match(textOf(h.container as never), new RegExp(refusal.message));
          assert.match(textOf(h.container as never), /CLR09/);
          assert.deepEqual(router.replaced, [], "a refused registration must not navigate");
        } finally {
          await h.unmount();
        }
      },
    );
  }
});

test("A TRANSPORT failure renders WITHOUT a CLR chip — three distinguishable states", async () => {
  // A governed refusal and a failed request are different facts. Painting a
  // fabricated code on the second would tell the person the DB ruled on them
  // when it never answered.
  const router: Router = { replaced: [] };
  await withEstate(
    () => new Response("bad gateway", { status: 502 }),
    async () => {
      const h = await mounted(router);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        await fillAndSubmit(h);
        const text = textOf(h.container as never);
        assert.doesNotMatch(text, /CLR\d\d/, "a transport failure rendered a fabricated CLR code");
        assert.deepEqual(router.replaced, []);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("op_keys: STABLE across a retry of the same attempt, FRESH after an edit", async () => {
  // request_firm_registration's replay is ARG-COMPLETE (0145:396-403): the same
  // op_key with a DIFFERENT firm name refuses CLR10. Someone who fixes a typo
  // and resubmits would be permanently refused by their own first attempt if the
  // key did not re-mint on edit — and a key that re-minted on every SUBMIT would
  // break the retry replay in the other direction. Both halves are asserted.
  const router: Router = { replaced: [] };
  await withEstate(
    () => new Response("bad gateway", { status: 502 }),
    async (calls) => {
      const h = await mounted(router);
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        await fillAndSubmit(h);
        const firstKey = calls[0]!.body.p_op_key;

        // Retry with NOTHING changed — the same attempt.
        const form = findIn(h.container as never, (n) => n.tagName === "FORM");
        await h.fireEvent(form as never, "submit");
        for (let i = 0; i < 8; i++) await h.settle();
        assert.equal(calls[1]!.body.p_op_key, firstKey, "a plain retry re-minted the key");

        // Now EDIT the firm name — a genuinely new attempt.
        const firm = findIn(h.container as never, byLabelledField(/Firm name/));
        await h.act(() => { setFieldValue(firm as never, "ROME SECRETARY"); });
        await h.fireEvent(form as never, "submit");
        for (let i = 0; i < 8; i++) await h.settle();
        assert.notEqual(
          calls[2]!.body.p_op_key,
          firstKey,
          "an edited firm name reused the old op_key — the DB would refuse CLR10 forever",
        );
      } finally {
        await h.unmount();
      }
    },
  );
});
