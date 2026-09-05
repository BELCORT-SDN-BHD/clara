// openDocumentInNewTab — independent review 2026-08-27, R1 regression + its own
// required binding test: "asserting the success branch is reachable and the
// popup-blocked branch only fires on a real null WITHOUT a feature string."
// `windowOpen`'s TYPE ITSELF takes only (url, target) — there is no third
// parameter a caller (or a future edit) could pass a "noreferrer"/"noopener"
// features string through, which is what made R1 possible in the first place.
//
// R5 (round 3): every test below injects its OWN `windowOpen` stub — none of
// them exercise `realWindowOpen`, the DEFAULT (and only production) adapter.
// The dedicated `realWindowOpen` test further down is what actually closes R5;
// the rest of this file proves `openDocumentInNewTab`'s own branch logic,
// independent of which adapter it was handed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { openDocumentInNewTab, realWindowOpen, type OpenedTab } from "./open-in-new-tab";
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

// --- R5: the DEFAULT production adapter, exercised directly ---------------------
//
// Every test above injects its own `windowOpen` — round 2 reintroduced the exact
// R1 regression INSIDE this default adapter while the full suite stayed green,
// because nothing ever called it. This test stubs `globalThis.window` (Node has
// no DOM global) and calls `realWindowOpen` itself — the same function
// `openDocumentInNewTab` falls back to when no adapter is injected, i.e. every
// real call site in production.

function withStubbedWindow(open: (...args: unknown[]) => unknown, run: () => void): void {
  const target = globalThis as unknown as { window?: { open: (...args: unknown[]) => unknown } };
  const original = target.window;
  target.window = { open };
  try {
    run();
  } finally {
    if (original === undefined) delete target.window;
    else target.window = original;
  }
}

test("realWindowOpen: the DEFAULT production adapter calls window.open with EXACTLY two arguments — no features string, ever", () => {
  let seenArgs: unknown[] = [];
  const fakeReturn = { fake: true };
  withStubbedWindow(
    (...args: unknown[]) => { seenArgs = args; return fakeReturn; },
    () => {
      const result = realWindowOpen("about:blank", "_blank");
      assert.deepEqual(seenArgs, ["about:blank", "_blank"]);
      assert.equal(seenArgs.length, 2, "window.open must never receive a third (features) argument");
      assert.equal(result, fakeReturn);
    },
  );
});

test("realWindowOpen: passes through whatever window.open returns, including null (a real popup block)", () => {
  withStubbedWindow(
    () => null,
    () => {
      assert.equal(realWindowOpen("about:blank", "_blank"), null);
    },
  );
});

// --- C-07 / 裁-175 — THE VIEWER GATE ------------------------------------------
//
// The defect these cells pin: an uploaded `application/xml` was fetched, blobbed
// and navigated into a new tab. A `blob:` URL inherits the CREATING page's
// origin, so an `<?xml-stylesheet?>` with inline script executed in apps/web's
// own origin as the opening firm member. Every cell here FAILS on the pre-gate
// code — the old code returned `{ok:true}` for every one of them.

function bytesResponse(mime: string): typeof fetch {
  return (async () => new Response(new Blob(["x"]), { status: 200, headers: { "content-type": mime } })) as typeof fetch;
}

for (const mime of [
  "application/xml",
  "text/csv",
  "application/x-ofx",
  "application/octet-stream",
  "image/tiff",
  "image/heic",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]) {
  test(`not_viewable: ${mime} is REFUSED before navigation — the blob is revoked, the tab is closed, no href is ever written`, async () => {
    const tab = fakeTab();
    let created = 0;
    const revoked: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => { created += 1; return "blob:fake-url"; };
    URL.revokeObjectURL = (u: string) => { revoked.push(u); };
    try {
      await withMockedFetch(bytesResponse(mime), async () => {
        const result = await openDocumentInNewTab("doc-1", { session: session(), windowOpen: () => tab });
        assert.deepEqual(result, { ok: false, reason: "not_viewable", mime });
        // THE DISCRIMINATING POST-CONDITION: the tab was never navigated. On the
        // pre-gate code this is "blob:fake-url" and the result is {ok:true}.
        assert.equal(tab.hrefSet, null, "a non-viewable document must never reach tab.location.href — that is the whole defect");
        assert.equal(tab.closedCalled, true, "the about:blank tab opened for the click must be closed again, never left blank and orphaned");
        assert.equal(created, 1);
        assert.deepEqual(revoked, ["blob:fake-url"], "the blob must be revoked, never leaked to a tab that will not use it");
      });
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
}

for (const mime of ["application/pdf", "image/png", "image/jpeg", "image/webp"]) {
  test(`viewable: ${mime} still opens — the gate refuses a type, it does not refuse the feature`, async () => {
    const tab = fakeTab();
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = () => "blob:fake-url";
    try {
      await withMockedFetch(bytesResponse(mime), async () => {
        const result = await openDocumentInNewTab("doc-1", { session: session(), windowOpen: () => tab });
        assert.deepEqual(result, { ok: true });
        assert.equal(tab.hrefSet, "blob:fake-url");
        assert.equal(tab.closedCalled, false);
      });
    } finally {
      URL.createObjectURL = originalCreate;
    }
  });
}

test("not_viewable is decided BEFORE popup_blocked — the refusal names the document's type, not the browser's setting", async () => {
  // Ordering matters for honesty, not for safety: with the popup blocked
  // nothing unsafe can happen either way. But "allow pop-ups and try again" is
  // a false instruction for a file that would be refused with pop-ups allowed.
  let revoked = false;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => "blob:fake-url";
  URL.revokeObjectURL = () => { revoked = true; };
  try {
    await withMockedFetch(bytesResponse("application/xml"), async () => {
      const result = await openDocumentInNewTab("doc-1", { session: session(), windowOpen: () => null });
      assert.deepEqual(result, { ok: false, reason: "not_viewable", mime: "application/xml" });
      assert.equal(revoked, true);
    });
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

test("the gate is in the LIBRARY: openDocumentInNewTab has no option that turns it off", async () => {
  // R1/R5's own two-walls reasoning, applied to C-07: a component-level check
  // could be bypassed by a second caller, and an opt-out parameter would BE
  // that second caller. This asserts the shape of the API, not a behaviour —
  // the only knobs are session, signal and the injectable windowOpen adapter.
  const tab = fakeTab();
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => "blob:fake-url";
  try {
    await withMockedFetch(bytesResponse("application/xml"), async () => {
      const result = await openDocumentInNewTab("doc-1", {
        session: session(),
        windowOpen: () => tab,
      } as Parameters<typeof openDocumentInNewTab>[1]);
      assert.equal(result.ok, false);
    });
  } finally {
    URL.createObjectURL = originalCreate;
  }
});
