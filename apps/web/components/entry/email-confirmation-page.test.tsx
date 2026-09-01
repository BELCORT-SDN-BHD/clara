// Split out of email-confirmation.test.tsx (the estate's 500-line document
// gate, applied to a test file, hit again in the M1/NIT-3 fix round): this
// half is `ConfirmEmailPage` / `confirmCodeState` itself — the paint-only GET
// and its flash-parsing judgement (W-H's own wall, and N1's forgery-closing
// nonce/cookie bounds) — as opposed to the POST handler's walls, which stay
// in email-confirmation.test.tsx, and the confirm→/signup integration, which
// lives in email-confirmation-signup-route.test.tsx.
//
// N1, fix round 2026-09-01 (裁-109): every test below now passes an explicit
// `readConfirmFlash` override, the same DI seam `lib/supabase/server.ts`'s
// own `cookieStore` parameter already uses — the REAL default calls
// `next/headers`'s `cookies()`, which throws outside an actual Next.js
// request scope, so a test that omitted the override would not be testing
// the real thing, it would be crashing.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import ConfirmEmailPage from "../../app/(entry)/auth/confirm/page";
import EntryLayout from "../../app/(entry)/layout";
import messages from "../../messages/en.json";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent, textOf } from "../../test/hookHarness";

enableDomInspection();

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const noFlash = async (): Promise<string | undefined> => undefined;
const flashOf = (payload: unknown) => async (): Promise<string | undefined> => JSON.stringify(payload);

test("N1: the GET page renders the code form and makes zero verifyOtp calls", async () => {
  // W-H, positively: page.tsx never reads an email from the URL AT ALL — a
  // hostile query string carries no email field to ignore in the first
  // place.
  const search = { email: "victim@example.com", token: "999999" };
  const first = await ConfirmEmailPage({ searchParams: Promise.resolve(search), readConfirmFlash: noFlash });
  const second = await ConfirmEmailPage({ searchParams: Promise.resolve(search), readConfirmFlash: noFlash });

  assert.deepEqual(first.props.state, { kind: "form" });
  assert.deepEqual(second.props.state, { kind: "form" });

  const pageSource = readFileSync(
    join(WEB_ROOT, "app/(entry)/auth/confirm/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(pageSource, /\.auth\.|verifyOtp\s*\(/, "GET contains a token-consuming call");
  // NIT-4 (supplementary; the behavioural cells below are the real proof —
  // this text pin matches TEXT not SYNTAX, and would miss a destructured
  // `const { email } = await searchParams` or `query["email"]`): this
  // catches the OBVIOUS wrong implementation cheaply, so a lane that
  // reintroduces it gets a fast, specific failure instead of only the
  // slower behavioural one below.
  assert.doesNotMatch(pageSource, /searchParams\)\.email|query\.email|\{\s*email\s*\}\s*=/, "GET reads the address from the URL");

  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(EntryLayout, null, first),
    }),
  );
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    assert.match(textOf(h.container as never), /Enter your confirmation code/);
    // The hostile query values are nowhere on the page — not pre-filled, not
    // echoed anywhere.
    assert.doesNotMatch(textOf(h.container as never), /victim@example\.com|999999/);
    const headings = (h.container as unknown as { querySelectorAll(selector: string): unknown[] })
      .querySelectorAll("h1");
    assert.equal(headings.length, 1, "the confirmation face must own exactly one h1");
  } finally {
    await h.unmount();
  }
});

test("W-H: no query param other than `flash` has any effect — a hostile status-shaped param is inert", async () => {
  // N1 CLOSED: `status`/`remaining`/`wait` are no longer read from the URL
  // at all — only `flash`'s bare PRESENCE matters, and even that renders
  // nothing without a corroborating cookie (see the forgery test below).
  const state = await ConfirmEmailPage({
    searchParams: Promise.resolve({ status: "victim@example.com", remaining: "3", wait: "900" }),
    readConfirmFlash: noFlash,
  });
  assert.deepEqual(state.props.state, { kind: "form" });
});

test("N1 CLOSED: a forged flash marker with no corroborating cookie renders invalid — never an attacker-chosen card", async () => {
  // THE EXACT RESIDUAL THIS FIX CLOSES: before N1, `?status=locked&wait=
  // 900` alone painted a fully authoritative lockout card — no server
  // event required. Now the marker's mere presence, with no matching
  // cookie (which an attacker's link can never plant), buys nothing.
  const forged = await ConfirmEmailPage({
    searchParams: Promise.resolve({ flash: "attacker-guessed-nonce" }),
    readConfirmFlash: noFlash,
  });
  assert.deepEqual(forged.props.state, { kind: "invalid" });
});

test("FOLD 1: a marker for one attempt never renders a DIFFERENT attempt's cookie — the cross-tab overwrite case", async () => {
  // Tab A's own redirect carries marker "nonce-a"; the ONE shared cookie
  // jar now holds Tab B's locked-outcome cookie (last write wins — the
  // design-review finding this closes). Tab A must never paint Tab B's
  // card, in either direction (understating OR overstating a lockout).
  const state = await ConfirmEmailPage({
    searchParams: Promise.resolve({ flash: "nonce-a" }),
    readConfirmFlash: flashOf({ nonce: "nonce-b", kind: "locked", waitSeconds: 300 }),
  });
  assert.deepEqual(state.props.state, { kind: "invalid" }, "tab A rendered tab B's cookie");
});

test("malformed or out-of-range flash payloads fall to the generic invalid card, never an attacker- or deploy-skew-chosen number", async () => {
  // A mailable link is one threat (N1); the OTHER job this validation does
  // — stated explicitly in confirm-flash.ts's header — is deploy-skew
  // defense, not anti-forgery. Every case here is a payload this build
  // cannot trust, for one reason or another.
  const cases: Array<{ name: string; raw: string | undefined }> = [
    { name: "remaining above ceiling", raw: JSON.stringify({ nonce: "n1", kind: "wrong", remaining: 6 }) },
    { name: "remaining negative", raw: JSON.stringify({ nonce: "n1", kind: "wrong", remaining: -1 }) },
    { name: "remaining non-integer", raw: JSON.stringify({ nonce: "n1", kind: "wrong", remaining: 5.5 }) },
    { name: "wait above ceiling", raw: JSON.stringify({ nonce: "n1", kind: "locked", waitSeconds: 86400 }) },
    { name: "wait negative", raw: JSON.stringify({ nonce: "n1", kind: "locked", waitSeconds: -1 }) },
    { name: "marker present, cookie absent entirely", raw: undefined },
    { name: "cookie is not JSON", raw: "not-json-at-all" },
    { name: "cookie has no nonce field", raw: JSON.stringify({ kind: "wrong", remaining: 3 }) },
    { name: "cookie kind is unknown", raw: JSON.stringify({ nonce: "n1", kind: "mystery" }) },
  ];
  for (const c of cases) {
    const state = await ConfirmEmailPage({
      searchParams: Promise.resolve({ flash: "n1" }),
      readConfirmFlash: async () => c.raw,
    });
    assert.deepEqual(state.props.state, { kind: "invalid" }, `${c.name} did not fall to the generic invalid card`);
  }
});

test("in-range flash payloads, at and inside the ceiling, render exactly the submitted value", async () => {
  const atCeiling = await ConfirmEmailPage({
    searchParams: Promise.resolve({ flash: "n1" }),
    readConfirmFlash: flashOf({ nonce: "n1", kind: "wrong", remaining: 5 }),
  });
  assert.deepEqual(atCeiling.props.state, { kind: "wrong-code", remaining: 5 });

  const zero = await ConfirmEmailPage({
    searchParams: Promise.resolve({ flash: "n1" }),
    readConfirmFlash: flashOf({ nonce: "n1", kind: "wrong", remaining: 0 }),
  });
  assert.deepEqual(zero.props.state, { kind: "wrong-code", remaining: 0 });

  const waitAtCeiling = await ConfirmEmailPage({
    searchParams: Promise.resolve({ flash: "n1" }),
    readConfirmFlash: flashOf({ nonce: "n1", kind: "locked", waitSeconds: 900 }),
  });
  assert.deepEqual(waitAtCeiling.props.state, { kind: "locked", waitSeconds: 900 });

  const unavailable = await ConfirmEmailPage({
    searchParams: Promise.resolve({ flash: "n1" }),
    readConfirmFlash: flashOf({ nonce: "n1", kind: "unavailable" }),
  });
  assert.deepEqual(unavailable.props.state, { kind: "unavailable" });

  const invalid = await ConfirmEmailPage({
    searchParams: Promise.resolve({ flash: "n1" }),
    readConfirmFlash: flashOf({ nonce: "n1", kind: "invalid" }),
  });
  assert.deepEqual(invalid.props.state, { kind: "invalid" });
});

test("N3 CLOSED: there is no `expired` state left to render — ConfirmCodeState only has five kinds", async () => {
  // A drift tripwire, not a behavioural cell: if a future change re-adds a
  // distinct "expired" kind without updating this file, THIS test is the
  // fast, specific signal (email-confirmation.test.tsx's own N3 cell is the
  // real behavioural proof — the wall side rendering identically).
  type ExpectedKind = "form" | "wrong-code" | "locked" | "unavailable" | "invalid";
  const kinds: ExpectedKind[] = [];
  for (const state of [
    (await ConfirmEmailPage({ searchParams: Promise.resolve({}), readConfirmFlash: noFlash })).props.state,
    (await ConfirmEmailPage({
      searchParams: Promise.resolve({ flash: "n1" }),
      readConfirmFlash: flashOf({ nonce: "n1", kind: "wrong", remaining: 1 }),
    })).props.state,
  ]) {
    kinds.push(state.kind as ExpectedKind);
  }
  assert.deepEqual(kinds, ["form", "wrong-code"]);
  const cardSource = readFileSync(
    join(WEB_ROOT, "components/entry/email-confirmation-card.tsx"),
    "utf8",
  );
  assert.doesNotMatch(cardSource, /kind:\s*"expired"/, "the expired variant was reintroduced");
});
