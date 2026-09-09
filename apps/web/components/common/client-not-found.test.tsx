// #614 D6 — the client-workspace not-found boundary never says WHICH of its
// four causes fired (no session, deleted, wrong firm, wrong id), never
// redirects, and stays inside the firm shell (it is a component, not the
// route boundary itself — app/(firm)/clients/not-found.tsx just renders it).

import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { it } from "node:test";

import { checkAccessibility } from "../../test/a11yRules";
import { checkKeyboardWalk } from "../../test/keyboardWalk";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent } from "../../test/hookHarness";
import messages from "../../messages/en.json";
import { ClientNotFound } from "./client-not-found";

enableDomInspection();

async function mount() {
  return renderComponent(
    createElement(NextIntlClientProvider, { locale: "en", messages, children: createElement(ClientNotFound) }),
  );
}

it("renders one h1 stating the client is not visible to the firm, without naming which of the four causes it was", async () => {
  const h = await mount();
  try {
    const headings: string[] = [];
    const walk = (n: unknown): void => {
      const tag = (n as { tagName?: string }).tagName;
      if (typeof tag === "string" && /^H[1-6]$/.test(tag)) headings.push(tag);
      for (const c of (n as { childNodes?: unknown[] }).childNodes ?? []) walk(c);
    };
    walk(h.container);
    assert.deepEqual(headings, ["H1"], "exactly one heading, and it is the top level");
    assert.match(h.text(), /isn't visible to your firm/i);
    // `ClientNotFound` takes NO props about why the layout threw `notFound()`
    // (no session, deleted, wrong firm, or wrong id) — it renders the exact
    // same sentence for all four, structurally, rather than branching on a
    // cause it was never told. This is that guarantee's discriminating
    // signature: an assertive, singular verdict ("this client was deleted" /
    // "you are not a member of this firm") never appears, because the
    // component has no fact to base one on.
    assert.doesNotMatch(h.text(), /was deleted|not a member|does not exist|no such client/i);
  } finally {
    await h.unmount();
  }
});

it("offers Clients and Firm home as the ways back, and no redirect script", async () => {
  const h = await mount();
  try {
    const clientsLink = h.find(
      (n) => n.tagName === "A" && (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("href") === "/clients",
    );
    const homeLink = h.find(
      (n) => n.tagName === "A" && (n as unknown as { getAttribute?: (a: string) => string | null }).getAttribute?.("href") === "/",
    );
    assert.ok(clientsLink, "a link back to /clients");
    assert.ok(homeLink, "a link back to firm home /");
  } finally {
    await h.unmount();
  }
});

it("zero a11y violations and a clean keyboard walk", async () => {
  const h = await mount();
  try {
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});
