// #649 AC1 — the candidate face on `/clients`'s Add-client control.
//
// WHAT THESE CELLS ARE FOR, AND WHAT THEY ARE NOT. They are not a re-implementation of the
// estate's family predicate: `clara.client_identity_candidates` is the wall and this fixture only
// says what the database answered. The property under test is what the FACE does with each of the
// three arities the owner ruled (2026-09-15) — 0 proceeds silently, 1 is shown and must be
// acknowledged HERE, and >= 2 is the database's own refusal, rendered verbatim with its code.
//
// THE ONE THING THAT WOULD BE A DEFECT IS A SECOND PREDICATE. No cell below asserts a client-side
// duplicate rule, because there is none and there must not be: `clara.name_family_candidates` may
// not be granted to any application role (0103:1225-1239 is a live census over five roles), which
// is the whole reason the door is a definer wrapper.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { clickButton, renderComponent, setCheckboxChecked, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { ClientRegisterList } from "./client-register-list";

enableDomInspection();

const NEW_CLIENT_ID = "9c649649-9999-4999-8999-999999999649";
const EXISTING_CLIENT = "c1649649-1111-4111-8111-111111111649";
const EXISTING_COUNTERPARTY = "cp649649-2222-4222-8222-222222222649".replace("cp", "cc");

type Stub = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const CANDIDATE_CLIENT = {
  party_kind: "client", id: EXISTING_CLIENT, name: "Rome Public Advisory Sdn Bhd",
  status: "active", client_id: EXISTING_CLIENT, match_reason: "name_family",
};
const CANDIDATE_COUNTERPARTY = {
  party_kind: "counterparty", id: EXISTING_COUNTERPARTY, name: "Rome Logistics",
  status: null, client_id: EXISTING_CLIENT, match_reason: "name_family",
};

const COLLISION = {
  code: "CLR10",
  message: "this name matches 2 existing clients or counterparties in your firm; decide which business this is before another record is created",
  details: JSON.stringify({
    reason: "name_family_collision", class: "client_identity", name: "Rome Ventures",
    arity: 2, candidates: [CANDIDATE_CLIENT, CANDIDATE_COUNTERPARTY],
  }),
};

type IdentityAnswer = { kind: "ok"; arity: number; candidates: unknown[] } | { kind: "collision" } | { kind: "broken" };

function mockEstate(identity: IdentityAnswer | (() => IdentityAnswer)) {
  const beginCalls: unknown[] = [];
  const identityCalls: unknown[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/rest/v1/caller_context")) {
      return jsonResponse([{
        user_id: "11111111-1111-4111-8111-111111111111", firm_id: "33333333-3333-4333-8333-333333333333",
        firm_name: "E2E Accounting", role: "admin", role_rank: 2, is_operator: false,
      }]);
    }
    if (u.includes("/rpc/client_identity_candidates")) {
      identityCalls.push(init?.body ? JSON.parse(String(init.body)) : null);
      const answer = typeof identity === "function" ? identity() : identity;
      if (answer.kind === "collision") return jsonResponse(COLLISION, 400);
      if (answer.kind === "broken") return jsonResponse({ message: "the identity read is unavailable" }, 500);
      return jsonResponse({ name: "x", arity: answer.arity, candidates: answer.candidates });
    }
    if (u.includes("/rest/v1/clients")) return jsonResponse([]);
    if (u.includes("/rest/v1/client_facts")) return jsonResponse([]);
    if (u.includes("/rpc/begin_client_onboarding")) {
      beginCalls.push(init?.body ? JSON.parse(String(init.body)) : null);
      return jsonResponse({ client_id: NEW_CLIENT_ID, plan_id: "plan-new" });
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  return { impl, beginCalls, identityCalls };
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      AppRouterContext.Provider as never,
      { value: { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} } as never,
      },
      createElement(PathnameContext.Provider as never, { value: "/clients" as never },
        createElement("div", null, createElement("h1", null, "Clients"), createElement(ClientRegisterList, {}))),
    ),
  });
}

function findAllIn(root: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  const walk = (n: Stub) => {
    if (predicate(n)) out.push(n);
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
  };
  walk(root);
  return out;
}
const findIn = (root: Stub, predicate: (n: Stub) => boolean): Stub | null => findAllIn(root, predicate)[0] ?? null;

const buttonNamed = (name: string) => (n: Stub) => n.tagName === "BUTTON" && textOf(n).trim() === name;
const labelled = (root: Stub, label: string) =>
  findIn(root, (n) => typeof n.getAttribute === "function"
    && (n.getAttribute as (a: string) => string | null)("aria-label") === label);

async function settleUntil(h: { settle: () => Promise<void> }, condition: () => boolean, label: string, dump?: () => string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}${dump ? `\n--- rendered ---\n${dump()}` : ""}`);
    await h.settle();
  }
}

async function openDialog() {
  const h = await renderComponent(App());
  const body = (globalThis as unknown as { document: { body: Stub } }).document.body;
  (body.appendChild as (c: unknown) => void)(h.container);
  for (let i = 0; i < 6; i++) await h.settle();
  const trigger = h.find(buttonNamed("Add client"));
  assert.ok(trigger, "an admin-ranked caller is offered the control");
  await h.fireEvent(trigger!, "click");
  await settleUntil(h, () => labelled(body, "Client name") !== null, "the dialog's name field", () => textOf(body));
  return { h, body, trigger: trigger! };
}

/** The dialog's own popup, addressed by the slot `components/ui/dialog.tsx` stamps on it
 *  (`data-slot="dialog-content"`). The page-level banner lives OUTSIDE it, behind the modal
 *  backdrop, so "is this text inside the dialog?" is a structural question about this node —
 *  `textOf(body)` cannot answer it, and a cell that asks the body would pass on a refusal the
 *  human cannot read. */
const dialogContent = (body: Stub): Stub => {
  const found = findIn(body, (n) => typeof n.getAttribute === "function"
    && (n.getAttribute as (a: string) => string | null)("data-slot") === "dialog-content");
  assert.ok(found, "the dialog popup must be on screen");
  return found!;
};

/** The dialog's own Confirm, distinct from anything in the mount root: the dialog is portalled
 *  onto document.body, so "not inside h.container" is the structural rule. */
function dialogConfirm(h: { container: unknown }, body: Stub): Stub {
  const inRoot = new Set(findAllIn(h.container as Stub, buttonNamed("Begin onboarding")).map((n) => n as unknown));
  const found = findAllIn(body, buttonNamed("Begin onboarding")).find((n) => !inRoot.has(n as unknown));
  assert.ok(found, "the dialog's own Confirm control");
  return found!;
}

// ---------------------------------------------------------------------------

test("649 · AC1 arity 0 — nothing answers to the name, so the SAME click goes on to the birth door", async () => {
  const { impl, beginCalls, identityCalls } = mockEstate({ kind: "ok", arity: 0, candidates: [] });
  await withMockedEnv(impl, async () => {
    const { h, body } = await openDialog();
    try {
      await h.act(() => setFieldValue(labelled(body, "Client name")!, "Zamboni Holdings"));
      await h.act(() => clickButton(dialogConfirm(h, body)));
      await settleUntil(h, () => beginCalls.length >= 1, "the birth door call", () => textOf(body));

      assert.equal(identityCalls.length, 1, "the identity read is asked exactly once for this name");
      assert.deepEqual(
        Object.keys(identityCalls[0] as Record<string, unknown>).sort(),
        ["p_identifier", "p_name"],
        "exactly the two parameters clara.client_identity_candidates declares",
      );
      assert.equal(beginCalls.length, 1, "one governed call — never a batch, never zero");
      assert.equal((beginCalls[0] as Record<string, unknown>).p_name, "Zamboni Holdings");
    } finally {
      await h.unmount();
    }
  });
});

test("649 · AC1 arity 1 — the candidate is SHOWN with a real link and its reason, and Confirm waits for the acknowledgement", async () => {
  const { impl, beginCalls } = mockEstate({ kind: "ok", arity: 1, candidates: [CANDIDATE_CLIENT] });
  await withMockedEnv(impl, async () => {
    const { h, body } = await openDialog();
    try {
      await h.act(() => setFieldValue(labelled(body, "Client name")!, "Rome Ventures"));
      await h.act(() => clickButton(dialogConfirm(h, body)));
      await settleUntil(h, () => /Already on your books under this name/.test(textOf(body)), "the candidate face", () => textOf(body));

      const text = textOf(body);
      assert.match(text, /Rome Public Advisory Sdn Bhd/, "the candidate is named");
      assert.match(text, /same leading word/, "…with WHY it matched");
      assert.match(text, /Client/, "…and what kind of party it is");
      const link = findIn(body, (n) => n.tagName === "A"
        && ((n.getAttribute as (a: string) => string | null)?.("href") ?? "").includes(EXISTING_CLIENT));
      assert.ok(link, `every candidate row is a REAL link; got:\n${text}`);

      assert.equal(beginCalls.length, 0, "the door was NOT called — arity 1 is a face, not a dispatch");
      assert.equal((labelled(body, "Client name") as { value?: string }).value, "Rome Ventures",
        "the typed name stands");
      assert.equal((dialogConfirm(h, body) as { disabled?: boolean }).disabled, true,
        "Confirm waits for an explicit 'this is a different business'");
      assert.deepEqual(checkAccessibility(body as never), []);

      // THE ACKNOWLEDGEMENT IS THE ONLY WALL AT ARITY 1, by ruling — the estate's own predicate
      // is count(*) > 1, so one same-family party has never been ambiguous anywhere in it.
      const ack = labelled(body, "This is a different business");
      assert.ok(ack, "the acknowledgement control");
      await h.act(() => setCheckboxChecked(ack!, true));
      await settleUntil(h, () => (dialogConfirm(h, body) as { disabled?: boolean }).disabled === false,
        "Confirm re-enabling after the acknowledgement");

      await h.act(() => clickButton(dialogConfirm(h, body)));
      await settleUntil(h, () => beginCalls.length >= 1, "the birth door call after the acknowledgement");
      assert.equal(beginCalls.length, 1);
    } finally {
      await h.unmount();
    }
  });
});

test("649 · AC1 arity >= 2 — the DATABASE's refusal renders VERBATIM with its code, beside the same list, and nothing is dispatched", async () => {
  const { impl, beginCalls } = mockEstate({ kind: "collision" });
  await withMockedEnv(impl, async () => {
    const { h, body } = await openDialog();
    try {
      await h.act(() => setFieldValue(labelled(body, "Client name")!, "Rome Ventures"));
      await h.act(() => clickButton(dialogConfirm(h, body)));
      await settleUntil(h, () => /CLR10/.test(textOf(body)), "the refusal", () => textOf(body));

      const text = textOf(body);
      assert.match(text, /CLR10/, "the code renders");
      assert.match(text, /matches 2 existing clients or counterparties/,
        "the database's own message, verbatim — never re-worded");
      // THE LIST COMES FROM THE REFUSAL ITSELF, so the refused face shows what the successful one
      // would have shown, with no second read of the fact it is reporting.
      assert.match(text, /Rome Public Advisory Sdn Bhd/);
      assert.match(text, /Rome Logistics/);
      assert.match(text, /Counterparty/, "a counterparty candidate says it is one");

      assert.equal(beginCalls.length, 0, "the wall is the DATABASE's and this face honours it");
      assert.equal((dialogConfirm(h, body) as { disabled?: boolean }).disabled, true, "Confirm stays shut");
      assert.equal((labelled(body, "Client name") as { value?: string }).value, "Rome Ventures",
        "and the typed name stands, so the human can change it in place");
      assert.equal((labelled(body, "Client name")!.getAttribute as (a: string) => string | null)("aria-invalid"), "true",
        "the field the refusal is about says so");
    } finally {
      await h.unmount();
    }
  });
});


test("649 · AC1 — a read that ANSWERS arity >= 2 instead of refusing still shuts Confirm, and dispatches nothing", async () => {
  // REVIEW ROUND 2, the recheck's minor note. Today `clara.client_identity_candidates` RAISES at
  // arity >= 2 and never returns that arity as a success answer, so this state is unreachable
  // through the live door — which is exactly why it is worth pinning: the `walled` /
  // `acknowledgementOwed` predicates that shut Confirm both describe HOW the read answered, and
  // neither of them describes an ANSWERED ambiguity. The door call itself was already belted in
  // `onConfirm`, so what this cell defends is the button telling the truth rather than looking
  // live and then doing nothing.
  const { impl, beginCalls } = mockEstate({ kind: "ok", arity: 2, candidates: [CANDIDATE_CLIENT, CANDIDATE_COUNTERPARTY] });
  await withMockedEnv(impl, async () => {
    const { h, body } = await openDialog();
    try {
      await h.act(() => setFieldValue(labelled(body, "Client name")!, "Rome Ventures"));
      await h.act(() => clickButton(dialogConfirm(h, body)));
      await settleUntil(h, () => /Rome Public Advisory Sdn Bhd/.test(textOf(body)),
        "the candidate list", () => textOf(body));

      assert.equal(beginCalls.length, 0, "an ambiguous name never reaches the birth door");
      assert.equal((dialogConfirm(h, body) as { disabled?: boolean }).disabled, true,
        "…and Confirm SAYS it is shut rather than refusing silently on the click");
      assert.equal((labelled(body, "Client name") as { value?: string }).value, "Rome Ventures",
        "the typed name stands");
    } finally {
      await h.unmount();
    }
  });
});
test("649 · AC1 — editing the name RETIRES the check and the acknowledgement, and keeps the typed text", async () => {
  let arity = 1;
  const { impl, beginCalls, identityCalls } = mockEstate(() =>
    arity === 1 ? { kind: "ok", arity: 1, candidates: [CANDIDATE_CLIENT] } : { kind: "ok", arity: 0, candidates: [] });
  await withMockedEnv(impl, async () => {
    const { h, body } = await openDialog();
    try {
      await h.act(() => setFieldValue(labelled(body, "Client name")!, "Rome Ventures"));
      await h.act(() => clickButton(dialogConfirm(h, body)));
      await settleUntil(h, () => labelled(body, "This is a different business") !== null, "the acknowledgement");
      await h.act(() => setCheckboxChecked(labelled(body, "This is a different business")!, true));
      await settleUntil(h, () => (dialogConfirm(h, body) as { disabled?: boolean }).disabled === false, "Confirm enabled");

      // A TICK STANDS FOR A NAME. Changing the name must retire it — an acknowledgement carried
      // over to a different name is an acknowledgement of nothing.
      arity = 0;
      await h.act(() => setFieldValue(labelled(body, "Client name")!, "Zamboni Holdings"));
      await settleUntil(h, () => labelled(body, "This is a different business") === null, "the candidate face clearing");
      assert.equal((labelled(body, "Client name") as { value?: string }).value, "Zamboni Holdings",
        "the typed text is never what gets cleared");
      assert.doesNotMatch(textOf(body), /Rome Public Advisory Sdn Bhd/, "and neither the candidate nor its link stays behind");

      await h.act(() => clickButton(dialogConfirm(h, body)));
      await settleUntil(h, () => beginCalls.length >= 1, "the door call for the NEW name");
      assert.equal(identityCalls.length, 2, "the new name is checked on its own");
      assert.equal((beginCalls[0] as Record<string, unknown>).p_name, "Zamboni Holdings");
    } finally {
      await h.unmount();
    }
  });
});

test("649 · AC1 — a FAILED identity read is reported as itself and dispatches nothing: a read that could not run is not evidence the name is free", async () => {
  const { impl, beginCalls } = mockEstate({ kind: "broken" });
  await withMockedEnv(impl, async () => {
    const { h, body } = await openDialog();
    try {
      await h.act(() => setFieldValue(labelled(body, "Client name")!, "Rome Ventures"));
      await h.act(() => clickButton(dialogConfirm(h, body)));
      await settleUntil(h, () => /unavailable/.test(textOf(body)), "the failure", () => textOf(body));
      assert.equal(beginCalls.length, 0, "a duplicate check that could not run must not wave the door through");
      assert.equal((labelled(body, "Client name") as { value?: string }).value, "Rome Ventures");

      // A FAILED READ IS NOT AN ANSWER OF "NOTHING". Rendering the arity-0 line for a read that
      // never ran is absence-of-evidence sold as evidence-of-absence — this file's own law, and
      // the inversion is exactly what the human would act on.
      assert.doesNotMatch(textOf(body), /Nothing in this firm answers to that name/,
        "a read that could not run must never claim the name is free");
      // …and the failure has to be readable WHERE THE HUMAN IS: inside the dialog that stayed
      // open, not on the page banner behind the modal backdrop.
      assert.match(textOf(dialogContent(body)), /unavailable/,
        "the refusal must render inside the open dialog, not behind it");
    } finally {
      await h.unmount();
    }
  });
});
