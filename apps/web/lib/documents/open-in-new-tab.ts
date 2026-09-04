// The evidence viewer's "open in a new tab" mechanism, extracted from
// document-metadata.tsx into a pure, injectable function (independent review
// 2026-08-27, R1) so the open/popup-blocked/failure branches are testable without
// a DOM. `windowOpen`'s TYPE SIGNATURE takes only (url, target) — no third
// "features" argument exists to pass at all, which is the regression this file
// exists to make structurally impossible to reintroduce: WHATWG's `window.open`
// algorithm treats the "noreferrer" token as IMPLYING "noopener", and "noopener"
// makes `window.open` return `null` UNCONDITIONALLY (Chrome 151, measured) — the
// review's own R1 finding. A previous cut of this file passed `"noreferrer"` and
// reasoned (wrongly) that only the "noopener" HALF of that implication mattered.
//
// R5 (round 3): every test in this file's own suite injected its OWN `windowOpen`
// stub, so the DEFAULT adapter below — the ONLY path production code ever takes —
// stayed completely unexercised while the full suite was green. `realWindowOpen`
// is now hoisted to its OWN named export with its OWN direct test (open-in-new-
// tab.test.ts), closing exactly the gap that let the R1 regression happen again
// inside this file undetected. TWO WALLS, not one: this file's structural type
// signature is the first; `eslint.config.mjs`'s `no-restricted-syntax` ban on any
// 3-argument `window.open(...)` call anywhere under `apps/web` is the second,
// and is the one that survives a future refactor that bypasses this module
// entirely.

import { sessionTokenAccessor } from "@/lib/session-accessor";
import { fetchDocumentBytes, VIEWABLE_IN_NEW_TAB } from "./bytes";
import type { SessionTokenAccessor } from "@/lib/session";

export type OpenDocumentResult =
  | { ok: true }
  | { ok: false; reason: "popup_blocked" }
  /** C-07 / 裁-175 — the document's own content-type is outside
   *  `VIEWABLE_IN_NEW_TAB` (bytes.ts). No tab is ever navigated, the blob is
   *  revoked, and `mime` is carried out VERBATIM so the caller can name the
   *  actual type rather than guessing at one. */
  | { ok: false; reason: "not_viewable"; mime: string }
  | { ok: false; reason: "fetch_failed"; message: string };

/** A minimal structural subset of `Window` — enough to navigate the opened tab
 *  and (best-effort) sever its `opener` back-reference, no more. */
export type OpenedTab = { closed: boolean; location: { href: string }; opener: unknown; close(): void };

/** The REAL, production `windowOpen` adapter — the DEFAULT (and only production)
 *  path `openDocumentInNewTab` takes when no adapter is injected. Calls the real
 *  `window.open` with EXACTLY the two-argument `(url, target)` form — no features
 *  string, full stop (R1/R5's own finding: any third argument here — "noopener",
 *  "noreferrer", or an empty string — changes `window.open`'s return-value
 *  behaviour). Exported and independently tested (open-in-new-tab.test.ts) rather
 *  than left as an inline default value, which is exactly what let it go
 *  unexercised while every OTHER test in this file injected its own stub. */
export function realWindowOpen(url: string, target: string): OpenedTab | null {
  return window.open(url, target) as OpenedTab | null;
}

/** Opens a new tab SYNCHRONOUSLY (before any `await` — a popup opened after one
 *  is blocked by every major browser, silently returning `null`), then fetches
 *  the document's bytes and navigates the tab to the resulting blob URL once
 *  ready. Never throws except a genuine abort (re-thrown unchanged so the caller
 *  can distinguish "cancelled" from "failed"); every other outcome resolves a
 *  typed `OpenDocumentResult`.
 *
 *  `windowOpen` defaults to `realWindowOpen` (above), independently proven to
 *  call `window.open` with exactly two arguments. The about:blank tab ends up
 *  navigated to a same-origin `blob:` URL, never third-party content, so there
 *  is no cross-origin `opener` exposure to defend against by construction;
 *  `tab.opener = null` after navigating is still set as a best-effort second
 *  layer (a plain property write — never allowed to throw the whole call). */
export async function openDocumentInNewTab(
  documentId: string,
  opts: {
    session?: SessionTokenAccessor;
    signal?: AbortSignal;
    windowOpen?: (url: string, target: string) => OpenedTab | null;
  } = {},
): Promise<OpenDocumentResult> {
  const open = opts.windowOpen ?? realWindowOpen;
  const tab = open("about:blank", "_blank");

  try {
    const bytes = await fetchDocumentBytes(documentId, { session: opts.session ?? sessionTokenAccessor, signal: opts.signal });

    // C-07 / 裁-175 — THE VIEWER GATE, and it runs BEFORE anything else the
    // resolved bytes could be used for. A `blob:` URL inherits THIS page's
    // origin, so navigating a tab to one is handing the file the firm member's
    // own session; only a type the browser renders inline as an inert document
    // may be handed that (bytes.ts's `VIEWABLE_IN_NEW_TAB` carries the full
    // reasoning, per type). Ordered ahead of the popup-blocked branch on
    // purpose: "this file type is not viewable here" is a property of the
    // DOCUMENT and is true whether or not the browser allowed the tab, whereas
    // "your browser blocked the tab" would send the human to fix a pop-up
    // setting that was never the reason.
    if (!VIEWABLE_IN_NEW_TAB.has(bytes.mime)) {
      bytes.revoke();
      tab?.close();
      return { ok: false, reason: "not_viewable", mime: bytes.mime };
    }

    if (!tab || tab.closed) {
      bytes.revoke();
      return { ok: false, reason: "popup_blocked" };
    }
    tab.location.href = bytes.blobUrl;
    try { tab.opener = null; } catch { /* best-effort hardening only — never fatal */ }
    return { ok: true };
  } catch (e) {
    tab?.close();
    if (e instanceof Error && e.name === "AbortError") throw e; // cancelled, not failed — the caller drops it
    return { ok: false, reason: "fetch_failed", message: e instanceof Error ? e.message : String(e) };
  }
}
