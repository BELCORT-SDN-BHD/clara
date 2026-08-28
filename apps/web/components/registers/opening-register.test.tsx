// Presentational rendering test for the "opening" tab's NotBuiltNote
// placeholder (T0 seam, port-wave plan §3.3, conductor ruling 2026-08-28) —
// same instrument as components/close/close-components.test.tsx's own
// CloseProposalPanel test (renderToStaticMarkup: no jsdom, no effects — the
// right tool for a component with a fixed, prop-free render).
//
// Deliberately does NOT attempt to render RegistersWorkbench itself (the
// component that owns the "opening" tab TRIGGER, via the shared SectionTabs):
// verified directly (2026-08-28) that RegistersWorkbench throws "invariant
// expected app router to be mounted" in this harness — it calls next/
// navigation's useRouter/usePathname/useSearchParams, and NO test anywhere
// in this suite mocks an app-router context, for any of registers-workbench's
// other five tabs either (grep confirms zero existing usePathname/
// useSearchParams/useRouter test coverage). Building that mocking from
// scratch here would be new test infrastructure, not a T0-sized addition —
// it is T2's own rung-6 obligation (port-wave plan §7.2) when it replaces
// this placeholder with the real seed-lifecycle workbench. SectionTabs'
// tablist/tab/aria-selected keyboard semantics themselves are unchanged by
// this seam (only a new `items` entry was added) and are already proven
// elsewhere (e.g. components/close/close-keyboard.test.tsx's fiscal-year
// picker case) — this file does not re-derive them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { OpeningRegister } from "./opening-register";

function render(el: ReactElement): string {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: "en", messages, children: el }));
}

test("OpeningRegister honestly names the live doors it waits on (create_opening_seed) and the train that owns it (T2), never a fake control", () => {
  const html = render(createElement(OpeningRegister));
  assert.match(html, /Opening balances/i);
  assert.match(html, /create_opening_seed/);
  assert.match(html, /not built/i);
  assert.match(html, /train T2/);
});
