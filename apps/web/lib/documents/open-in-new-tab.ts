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

import { sessionTokenAccessor } from "@/lib/session-accessor";
import { fetchDocumentBytes } from "./bytes";
import type { SessionTokenAccessor } from "@/lib/session";

export type OpenDocumentResult =
  | { ok: true }
  | { ok: false; reason: "popup_blocked" }
  | { ok: false; reason: "fetch_failed"; message: string };

/** A minimal structural subset of `Window` — enough to navigate the opened tab
 *  and (best-effort) sever its `opener` back-reference, no more. */
export type OpenedTab = { closed: boolean; location: { href: string }; opener: unknown; close(): void };

/** Opens a new tab SYNCHRONOUSLY (before any `await` — a popup opened after one
 *  is blocked by every major browser, silently returning `null`), then fetches
 *  the document's bytes and navigates the tab to the resulting blob URL once
 *  ready. Never throws except a genuine abort (re-thrown unchanged so the caller
 *  can distinguish "cancelled" from "failed"); every other outcome resolves a
 *  typed `OpenDocumentResult`.
 *
 *  `windowOpen` defaults to the real `window.open` called with EXACTLY the
 *  `(url, target)` two-argument form — no features string. The about:blank tab
 *  ends up navigated to a same-origin `blob:` URL, never third-party content, so
 *  there is no cross-origin `opener` exposure to defend against by construction;
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
  const open = opts.windowOpen ?? ((url, target) => window.open(url, target) as OpenedTab | null);
  const tab = open("about:blank", "_blank");

  try {
    const bytes = await fetchDocumentBytes(documentId, { session: opts.session ?? sessionTokenAccessor, signal: opts.signal });
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
