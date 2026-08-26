import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  activateScope,
  createScopeGuard,
  getActiveClientId,
  resetScopeForTests,
} from "../lib/client-scope";

/**
 * The client-scope epoch (security review findings 8 MEDIUM and 13 LOW).
 *
 * lib/client-scope.ts is browser-only by contract — `activateScope` no-ops
 * where `window` is undefined, because on the server that module state is
 * shared across requests. These tests therefore declare a `window` global,
 * which is the honest way to exercise browser code in `node --test`: it makes
 * the module take its BROWSER branch, the one that actually ships. The module
 * reads `typeof window` at CALL time, so declaring it here — before any test
 * body runs — is sufficient regardless of import order.
 */
Object.defineProperty(globalThis, "window", {
  value: { location: { origin: "https://app.clara.example" } },
  configurable: true,
  writable: true,
});

beforeEach(() => {
  resetScopeForTests();
});

describe("finding 8 — navigation drives the epoch", () => {
  it("A→B with NO request under B still stales A's in-flight guard", () => {
    activateScope("client-a");
    const guardA = createScopeGuard("client-a");
    assert.equal(guardA.isStale(), false);

    // The switch alone — client B starts no request of its own.
    activateScope("client-b");

    assert.equal(guardA.isStale(), true);
  });

  it("A→B aborts the previous epoch's in-flight requests, not just marks them", () => {
    activateScope("client-a");
    const guardA = createScopeGuard("client-a");
    assert.equal(guardA.signal.aborted, false);

    activateScope("client-b");

    assert.equal(guardA.signal.aborted, true);
  });

  it("A→B→A leaves the ORIGINAL A guard stale (the epoch, not the id, decides)", () => {
    activateScope("client-a");
    const firstA = createScopeGuard("client-a");

    activateScope("client-b");
    activateScope("client-a");

    assert.equal(getActiveClientId(), "client-a");
    assert.equal(firstA.isStale(), true);

    // …while a guard created AFTER the return is live.
    const secondA = createScopeGuard("client-a");
    assert.equal(secondA.isStale(), false);
  });

  it("re-activating the SAME client is idempotent — it does not abort live work", () => {
    activateScope("client-a");
    const guard = createScopeGuard("client-a");

    activateScope("client-a");
    activateScope("client-a");

    assert.equal(guard.isStale(), false);
    assert.equal(guard.signal.aborted, false);
  });
});

describe("finding 13 — same-client requests do not stale one another", () => {
  it("two concurrent client-A requests BOTH survive", () => {
    activateScope("client-a");
    const first = createScopeGuard("client-a");
    const second = createScopeGuard("client-a");

    assert.equal(first.isStale(), false);
    assert.equal(second.isStale(), false);
    assert.equal(first.signal.aborted, false);
    assert.equal(second.signal.aborted, false);
  });

  it("a newer guard for the SAME operation supersedes the older one", () => {
    activateScope("client-a");
    const first = createScopeGuard("client-a", { operation: "trial-balance" });
    const second = createScopeGuard("client-a", { operation: "trial-balance" });

    assert.equal(first.isStale(), true);
    assert.equal(second.isStale(), false);
  });

  it("different operations never supersede each other", () => {
    activateScope("client-a");
    const balances = createScopeGuard("client-a", { operation: "trial-balance" });
    const documents = createScopeGuard("client-a", { operation: "documents" });

    assert.equal(balances.isStale(), false);
    assert.equal(documents.isStale(), false);
  });

  it("a navigation stales an operation-keyed guard too", () => {
    activateScope("client-a");
    const guard = createScopeGuard("client-a", { operation: "trial-balance" });

    activateScope("client-b");

    assert.equal(guard.isStale(), true);
  });
});

describe("fail-closed: a guard outside its active scope", () => {
  function withSilencedConsole<T>(run: () => T): { result: T; errors: number } {
    const original = console.error;
    let errors = 0;
    console.error = () => {
      errors += 1;
    };
    try {
      return { result: run(), errors };
    } finally {
      console.error = original;
    }
  }

  it("is born stale and already aborted when no scope was activated", () => {
    const { result: guard, errors } = withSilencedConsole(() =>
      createScopeGuard("client-a"),
    );

    assert.equal(guard.isStale(), true);
    assert.equal(guard.signal.aborted, true);
    assert.equal(errors, 1);
  });

  it("is born stale when it names a DIFFERENT client than the active one", () => {
    activateScope("client-a");
    const { result: guard } = withSilencedConsole(() =>
      createScopeGuard("client-b"),
    );

    assert.equal(guard.isStale(), true);
    assert.equal(guard.signal.aborted, true);
  });
});
