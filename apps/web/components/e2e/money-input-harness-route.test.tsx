// MATERIAL-10 (independent review, PR #505 round 3): the harness route's
// containment has TWO layers — the auth wall (pinned by
// `tests/proxy-matcher.test.ts`) and this route module. Only the wall was
// pinned. The reviewer mutated the production stub below to render the real
// harness and the whole 1,976-cell suite plus `tsc --noEmit` stayed green: a
// one-line edit here, or to `next.config.ts`'s `resolveAlias`, would ship the
// journal editor into a production build with nothing red, caught only by a
// manual bundle grep that is not a CI gate.
//
// These two cells close that. They EXECUTE the real gate rather than restate
// it (裁-112(c)): the config module itself is imported under both env states
// with a cache-busting nonce, the way `tests/proxy-matcher.test.ts` imports
// the two wall registries, and the enabled module is reached through the
// alias VALUE the config actually declares rather than a re-typed path
// (review law 3 — prove the identifier IS its import).
//
// WHAT THESE CELLS DO NOT CLAIM: they prove the config DECLARES the alias and
// that each module behaves as the declaration promises. They do not prove
// Turbopack performed the substitution — that is a build-time fact, and its
// instrument is the two-sided bundle grep recorded in the PR body.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../test/hookHarness";
import messages from "../../messages/en.json";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FLAG = "CLARA_E2E_MONEY_INPUT_HARNESS";
const ALIAS_KEY = "@/components/e2e/money-input-harness-route";

type RouteModule = { MoneyInputHarnessRoute: () => unknown };
type NextConfigShape = {
  env?: Record<string, string>;
  turbopack?: { resolveAlias?: Record<string, string> };
};

/** Runs the REAL `next.config.ts` in this process under one env state.
 *
 *  `__dirname` is shimmed because the config uses it to anchor Turbopack's
 *  root — Next's own config loader provides it, an ESM test runner does not.
 *  Everything else about the module, including the next-intl plugin wrapper,
 *  executes exactly as it does at `next build`. */
async function loadNextConfig(enabled: boolean, nonce: string): Promise<NextConfigShape> {
  const original = process.env[FLAG];
  (globalThis as unknown as { __dirname?: string }).__dirname = WEB_ROOT;
  if (enabled) process.env[FLAG] = "1";
  else delete process.env[FLAG];
  try {
    const mod = await import(`../../next.config.ts?harness-route-gate=${nonce}`) as { default: NextConfigShape };
    return mod.default;
  } finally {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
  }
}

function App(child: unknown) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children: child as never });
}

/** This harness's fake DOM does not populate `data-*` through `getAttribute`,
 *  so the rendered props are read the way the sibling suites read them. */
function reactProps(node: object): Record<string, unknown> {
  const key = Object.keys(node).find((candidate) => candidate.startsWith("__reactProps"));
  return key ? ((node as Record<string, unknown>)[key] as Record<string, unknown>) : {};
}

test("harness route: with the build flag UNSET nothing resolves to the harness, and the route module refuses", async () => {
  const config = await loadNextConfig(false, `off-${Date.now()}`);

  assert.equal(config.env?.[FLAG], "0", "the config must freeze the switch OFF into the emitted bundles, not leave it absent");
  const aliases = config.turbopack?.resolveAlias ?? {};
  // next-intl's own plugin contributes `next-intl/config`, so the assertion is
  // "no harness alias", not "no aliases at all".
  const harnessAliases = Object.entries(aliases).filter(
    ([from, to]) => from.includes("money-input-harness") || to.includes("money-input-harness"),
  );
  assert.deepEqual(harnessAliases, [], "an ordinary build must declare no alias that reaches the harness module");

  const stub = await import(`./money-input-harness-route.tsx?harness-route-gate=off-${Date.now()}`) as RouteModule;
  let returned: unknown = "NOTHING WAS RETURNED";
  let thrown: unknown = null;
  try {
    returned = stub.MoneyInputHarnessRoute();
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, "the production route module must REFUSE, not render — it returned instead of throwing");
  // The digest is asserted, not merely "it threw": an incidental error (a bad
  // import, a missing provider) would otherwise satisfy a bare throws check
  // and this cell would pass while the harness shipped.
  const digest = (thrown as { digest?: string }).digest;
  assert.equal(
    digest,
    "NEXT_HTTP_ERROR_FALLBACK;404",
    "it must refuse with Next's own not-found signal, so a 404 is what the route serves",
  );
  assert.equal(returned, "NOTHING WAS RETURNED", "notFound() must abort before any element is produced");
});

test("harness route: with the build flag SET the alias names the enabled module, and THAT module renders the real harness", async () => {
  const config = await loadNextConfig(true, `on-${Date.now()}`);

  assert.equal(config.env?.[FLAG], "1");
  const aliases = config.turbopack?.resolveAlias ?? {};
  const target = aliases[ALIAS_KEY];
  assert.equal(
    target,
    "@/components/e2e/money-input-harness-route-enabled",
    "the opted-in build must swap the refusing stub for the enabled module, and only that module",
  );

  // Reached through the alias's own VALUE, so this cell breaks if the config
  // is ever repointed at a different module — a re-typed literal path would
  // keep passing and prove only its own spelling.
  const targetPath = `../../${target.replace(/^@\//, "")}.tsx`;
  const enabled = await import(`${targetPath}?harness-route-gate=on-${Date.now()}`) as RouteModule;

  const h = await renderComponent(App(createElement(enabled.MoneyInputHarnessRoute as never)));
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const rendered = textOf(h.container as never);
    // The heading belongs to the alias TARGET; the readout belongs to the
    // inner `MoneyInputE2EHarness` it mounts. Asserting both walks the whole
    // chain the flag turns on, not just its outermost shell.
    assert.match(rendered, /Money input browser harness/, "the alias target is the module that mounts the browser harness");
    assert.match(rendered, /Accepted debit cents: 0/, "and it mounts the real MoneyInputE2EHarness beneath it, not an empty shell");
    const readout = h.find((node) => (node as { tagName?: string }).tagName === "OUTPUT");
    assert.ok(readout, "the harness readout element must render");
    assert.equal(
      reactProps(readout as object)["data-testid"],
      "accepted-debit-cents",
      "the readout carries the exact marker the flag-unset bundle grep proves absent from production chunks",
    );
  } finally {
    await h.unmount();
  }
});
