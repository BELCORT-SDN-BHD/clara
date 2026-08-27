// openDocumentInNewTab — independent review 2026-08-27, R1 regression + its own
// required binding test: "asserting the success branch is reachable and the
// popup-blocked branch only fires on a real null WITHOUT a feature string."
// `windowOpen`'s TYPE ITSELF takes only (url, target) — there is no third
// parameter a caller (or a future edit) could pass a "noreferrer"/"noopener"
// features string through, which is what made R1 possible in the first place.

import { test } from "node:test";
import assert from "node:assert/strict";
import { openDocumentInNewTab, type OpenedTab } from "./open-in-new-tab";
import type { SessionTokenAccessor } from "@/lib/session";

function session(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
}

function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => { globalThis.fetch = original; });
}

function fakeTab(): OpenedTab & { hrefSet: string | null; closedCalled: boolean } {
  const tab = {
    closed: false,
    location: { href: "about:blank" },
    opener: { fakeOpener: true } as unknown,
    hrefSet: null as string | null,
    closedCalled: false,
    close() { this.closedCalled = true; },
  };
  // Track .location.href writes without needing a real Location object.
  Object.defineProperty(tab.location, "href", {
    get() { return tab.hrefSet ?? "about:blank"; },
    set(v: string) { tab.hrefSet = v; },
  });
  return tab;
}

test("success branch: windowOpen called with EXACTLY (url, target) — no features argument — and reached when it returns a real tab", async () => {
  let seenArgs: unknown[] = [];
  const tab = fakeTab();
  const windowOpen = (...args: unknown[]) => { seenArgs = args; return tab; };
  await withMockedFetch(
    async () => new Response(new Blob(["x"]), { status: 200, headers: { "content-type": "application/pdf" } }),
    async () => {
      const originalCreate = URL.createObjectURL;
      URL.createObjectURL = () => "blob:fake-url";
      try {
        const result = await openDocumentInNewTab("doc-1", { session: session(), windowOpen: windowOpen as (u: string, t: string) => OpenedTab | null });
        assert.deepEqual(result, { ok: true });
        assert.deepEqual(seenArgs, ["about:blank", "_blank"], "windowOpen must be called with exactly two arguments — no features string");
        assert.equal(tab.hrefSet, "blob:fake-url");
        assert.equal(tab.opener, null, "the opener back-reference is severed as a best-effort hardening step");
      } finally {
        URL.createObjectURL = originalCreate;
      }
    },
  );
});

test("popup-blocked branch: fires ONLY on a genuine null return from windowOpen (never from a features-string side effect — there is none to pass)", async () => {
  let revoked = false;
  const windowOpen = () => null; // the ONLY way this branch should ever be reached
  await withMockedFetch(
    async () => new Response(new Blob(["x"]), { status: 200, headers: { "content-type": "application/pdf" } }),
    async () => {
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = () => "blob:fake-url";
      URL.revokeObjectURL = () => { revoked = true; };
      try {
        const result = await openDocumentInNewTab("doc-1", { session: session(), windowOpen });
        assert.deepEqual(result, { ok: false, reason: "popup_blocked" });
        assert.equal(revoked, true, "a blob created for a blocked popup must still be revoked, never leaked");
      } finally {
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
      }
    },
  );
});

test("popup-blocked branch also fires when the tab was closed before the fetch resolved", async () => {
  const tab = fakeTab();
  tab.closed = true;
  await withMockedFetch(
    async () => new Response(new Blob(["x"]), { status: 200, headers: { "content-type": "application/pdf" } }),
    async () => {
      const originalCreate = URL.createObjectURL;
      URL.createObjectURL = () => "blob:fake-url";
      try {
        const result = await openDocumentInNewTab("doc-1", { session: session(), windowOpen: () => tab });
        assert.deepEqual(result, { ok: false, reason: "popup_blocked" });
      } finally {
        URL.createObjectURL = originalCreate;
      }
    },
  );
});

test("fetch_failed branch: a byte-fetch failure closes the opened tab and resolves a typed result, never throws", async () => {
  const tab = fakeTab();
  await withMockedFetch(
    async () => new Response("nope", { status: 404 }),
    async () => {
      const result = await openDocumentInNewTab("doc-1", { session: session(), windowOpen: () => tab });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "fetch_failed");
      assert.equal(tab.closedCalled, true);
    },
  );
});

test("a genuine abort re-throws UNCHANGED (never fabricated into a result), and still closes the opened tab", async () => {
  const tab = fakeTab();
  await withMockedFetch(
    async () => { throw new DOMException("aborted", "AbortError"); },
    async () => {
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        openDocumentInNewTab("doc-1", { session: session(), signal: controller.signal, windowOpen: () => tab }),
        (e: unknown) => { assert.equal((e as Error).name, "AbortError"); return true; },
      );
      assert.equal(tab.closedCalled, true);
    },
  );
});
