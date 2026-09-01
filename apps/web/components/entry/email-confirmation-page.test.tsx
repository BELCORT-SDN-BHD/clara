// Split out of email-confirmation.test.tsx (the estate's 500-line document
// gate, applied to a test file, hit again in the M1/NIT-3 fix round): this
// half is `ConfirmEmailPage` / `confirmCodeState` itself — the paint-only GET
// and its query-parsing judgement (W-H's own wall, and NIT-3's numeric
// bounds) — as opposed to the POST handler's walls, which stay in
// email-confirmation.test.tsx, and the confirm→/signup integration, which
// lives in email-confirmation-signup-route.test.tsx.

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

type SearchParams = Record<string, string | string[] | undefined>;

test("N1: the GET page renders the code form and makes zero verifyOtp calls", async () => {
  // W-H, positively: page.tsx never reads an email from the URL AT ALL — a
  // hostile query string carries no email field to ignore in the first
  // place.
  const search = { email: "victim@example.com", token: "999999" };
  const first = await ConfirmEmailPage({ searchParams: Promise.resolve(search) });
  const second = await ConfirmEmailPage({ searchParams: Promise.resolve(search) });

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

test("W-H: a query-string email is never accepted — the status vocabulary is closed", async () => {
  // Every unrecognised `status` value, including one that smuggles an email
  // shape, falls to the plain form — never a distinct rendering keyed on
  // caller-supplied content.
  const state = await ConfirmEmailPage({
    searchParams: Promise.resolve({ status: "victim@example.com" }),
  });
  assert.deepEqual(state.props.state, { kind: "form" });
});

test("NIT-3: an out-of-range remaining/wait falls to the generic invalid card, never an attacker-chosen number", async () => {
  // A mailable link is the threat: someone crafts /auth/confirm?status=
  // locked&wait=86400 and sends it to a victim to make them believe they are
  // locked out for a day. Every value here is above the wall's own ceiling
  // (5 attempts / 900 seconds, part 1 §3.4).
  const outOfRangeCases: SearchParams[] = [
    { status: "wrong", remaining: "6" },
    { status: "wrong", remaining: "-1" },
    { status: "wrong", remaining: "abc" },
    { status: "wrong", remaining: "5.5" },
    { status: "wrong" }, // present status, ABSENT remaining — our own handler never omits it
    { status: "locked", wait: "86400" },
    { status: "locked", wait: "-1" },
    { status: "locked" },
  ];
  for (const search of outOfRangeCases) {
    const state = await ConfirmEmailPage({ searchParams: Promise.resolve(search) });
    assert.deepEqual(
      state.props.state,
      { kind: "invalid" },
      `${JSON.stringify(search)} did not fall to the generic invalid card`,
    );
  }
});

test("NIT-3: an in-range remaining/wait, at and inside the ceiling, renders exactly the submitted value", async () => {
  const atCeiling = await ConfirmEmailPage({
    searchParams: Promise.resolve({ status: "wrong", remaining: "5" }),
  });
  assert.deepEqual(atCeiling.props.state, { kind: "wrong-code", remaining: 5 });

  const zero = await ConfirmEmailPage({
    searchParams: Promise.resolve({ status: "wrong", remaining: "0" }),
  });
  assert.deepEqual(zero.props.state, { kind: "wrong-code", remaining: 0 });

  const waitAtCeiling = await ConfirmEmailPage({
    searchParams: Promise.resolve({ status: "locked", wait: "900" }),
  });
  assert.deepEqual(waitAtCeiling.props.state, { kind: "locked", waitSeconds: 900 });
});
