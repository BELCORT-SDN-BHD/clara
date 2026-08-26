import { AsyncLocalStorage } from "node:async_hooks";

/**
 * tests/next-runtime-globals.ts — import this FIRST in any test that loads a
 * Next.js server module (`next/server`, `next/experimental/testing/server`,
 * or one of this app's own modules that imports them).
 *
 * Next's server bundle reads `globalThis.AsyncLocalStorage` and throws
 * "Invariant: AsyncLocalStorage accessed in runtime where it is not
 * available" when it is missing. Next's own runtimes install that global
 * (Node's `async_hooks` class on the Node.js runtime, a polyfill on the Edge
 * one); a bare `node --test` process does not, because `AsyncLocalStorage` is
 * a `node:async_hooks` export rather than a global.
 *
 * This installs the SAME class Next's Node.js runtime uses. It is a test-
 * harness detail, not a behaviour change — nothing here alters what the
 * modules under test decide.
 */
Object.defineProperty(globalThis, "AsyncLocalStorage", {
  value: AsyncLocalStorage,
  configurable: true,
  writable: true,
});
