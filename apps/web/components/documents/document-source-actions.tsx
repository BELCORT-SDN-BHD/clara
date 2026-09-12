"use client";

// THE SOURCE-CUSTODY AFFORDANCES — "open the original" and "save the original", and the ONE state
// ladder both of them answer through.
//
// WHAT WAS WRONG BEFORE THIS FILE, measured rather than supposed:
//   · There was no download at all. The only affordance was a preview, gated to four inline-safe
//     content types, so every e-invoice XML, bank OFX, CSV, spreadsheet, TIFF and HEIC in the
//     estate was a document a person could be told about and never given.
//   · Every refusal painted the same sentence. A 403 (your membership was revoked), a 404 (this
//     document is not filed to this client), a 409 (custody is still being verified), a 502
//     (the store is unreachable) and a 502 `checksum_mismatch` (the stored bytes no longer match
//     the record) all rendered as "Could not open this document: <message>". Three of those five
//     recover by themselves and two never will, and the page offered the same nothing to all of
//     them.
//
// TWO GATES, AND ONLY ONE OF THEM IS A WALL. What this component OFFERS is decided by the row's
// `mime_type`: a type a browser cannot render inertly gets no Open control and gets the honest
// reason standing on the page instead of appearing after a click that was never going to work.
// What is actually NAVIGATED is decided by `VIEWABLE_IN_NEW_TAB` inside `openDocumentInNewTab`,
// against the RESPONSE's content-type, and that one is the security wall (a `blob:` URL inherits
// this app's origin — C-07 / 裁-175). This file does not weaken it, duplicate it, or stand in
// front of it; it renders an offer that agrees with it.
//
// THE OUTCOME IS PERSISTENT, NEVER A TOAST (spec appendix C §3, "Business refusal"): a refusal
// describes a constraint and a next action, and it has to stay on the page while the person reads
// it, decides, and acts. It renders through the SAME StateBanner ladder every other refusal in
// this product uses.
//
// RETRY IS OFFERED EXACTLY WHERE A SECOND ATTEMPT CAN ANSWER DIFFERENTLY — the set is named once,
// in `RETRYABLE_DOCUMENT_SOURCE_STATES` (bytes.ts), not re-derived here. A Retry beside "the
// stored bytes no longer match the record" would be a control that cannot work, which is the same
// defect class as a dead link wearing a button.

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { StateBanner, type BannerTone } from "@/components/common/state";
import {
  VIEWABLE_IN_NEW_TAB,
  documentSourceStateKey,
  documentSourceStateOf,
  isRetryableDocumentSourceState,
  type DocumentSourceState,
} from "@/lib/documents/bytes";
import { downloadDocument } from "@/lib/documents/download";
import { openDocumentInNewTab } from "@/lib/documents/open-in-new-tab";
import type { DocumentRow } from "@/lib/documents/types";
import type { SessionTokenAccessor } from "@/lib/session";

/** Which control the person pressed — carried so Retry repeats THAT one rather than guessing. */
type SourceAction = "preview" | "download";

type Outcome =
  | { kind: "state"; state: DocumentSourceState; action: SourceAction }
  | { kind: "popup_blocked" }
  | null;

/** The severity ladder, applied per state (components/common/state.tsx's four rungs):
 *    info      you are signed out — a state, not a fault
 *    warning   you lack the grant — a fault of authority, not of the system
 *    neutral   it genuinely is not there yet / not here
 *    error     it failed, or the bytes cannot be vouched for
 *  Written as a total record over the union so a state added later cannot silently inherit a
 *  tone that misdescribes it — tsc names the omission. */
const STATE_TONE: Record<DocumentSourceState, BannerTone> = {
  unauthenticated: "info",
  denied: "warning",
  not_found: "neutral",
  custody_pending: "neutral",
  storage_unavailable: "error",
  integrity: "error",
  malformed: "error",
  transport: "error",
  server_error: "error",
};

/** The auth wall's own shape, preserved. `lib/supabase/proxy.ts` sends an unauthenticated request
 *  to `/login?next=<pathname>` and DROPS the query string wholesale; this builder keeps the search
 *  too, so a reader whose session expired on `?document=<id>` comes back to that document rather
 *  than to the bare tab. `components/login-form.tsx` resolves the value through
 *  `lib/safe-redirect.ts`, which re-parses it and demands exact same-origin equality — so a
 *  return destination built here can never become an open redirect. */
export function reauthenticateHref(location: { pathname: string; search: string }): string {
  const next = `${location.pathname}${location.search}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

export function DocumentSourceActions({
  document: doc,
  clientId,
  session,
  onShowExtraction,
}: {
  document: DocumentRow;
  /** The page's client scope. Travels to the door as `?client=`, which is what makes a document
   *  addressed from the WRONG client answer "not available in this client" instead of serving
   *  bytes. Required rather than optional: a surface that silently dropped it would widen the
   *  read without anything going red. */
  clientId: string;
  session?: SessionTokenAccessor;
  /** The honest alternative for a type no browser tab can show — opens the structured extraction
   *  view on the same panel. Optional: a caller with no such view renders the reason alone, never
   *  a dead control. */
  onShowExtraction?: () => void;
}) {
  const t = useTranslations("ClientDocuments");
  const [busy, setBusy] = useState<SourceAction | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const mime = (doc.mime_type ?? "").toLowerCase();
  const viewable = VIEWABLE_IN_NEW_TAB.has(mime);
  const name = doc.original_filename ?? doc.id;

  const run = useCallback(async (action: SourceAction) => {
    setBusy(action);
    setOutcome(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (action === "download") {
        await downloadDocument(
          { id: doc.id, sha256: doc.sha256, original_filename: doc.original_filename },
          { client: clientId, session, signal: controller.signal },
        );
        return;
      }
      // `openDocumentInNewTab` opens the tab SYNCHRONOUSLY before its first await (a popup opened
      // after one is blocked by every major browser, silently returning null) — so it must be
      // CALLED from inside the click handler's own task. `run` is awaited by the handler rather
      // than scheduled, which keeps that property.
      const result = await openDocumentInNewTab(doc.id, { client: clientId, session, signal: controller.signal });
      if (result.ok) return;
      if (result.reason === "popup_blocked") { setOutcome({ kind: "popup_blocked" }); return; }
      if (result.reason === "not_viewable") {
        // Unreachable from this component (the control is not rendered for such a type) and
        // handled anyway: the library gate is the wall, and a wall whose caller has no branch for
        // its verdict is a wall with a hole behind it.
        setOutcome({ kind: "state", state: "malformed", action });
        return;
      }
      setOutcome({ kind: "state", state: documentSourceStateOf(result.cause), action });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // unmounted mid-read — no state left to update
      setOutcome({ kind: "state", state: documentSourceStateOf(e), action });
    } finally {
      setBusy(null);
    }
  }, [clientId, doc.id, doc.original_filename, doc.sha256, session]);

  const banner = (() => {
    if (!outcome) return null;
    if (outcome.kind === "popup_blocked") {
      return (
        <StateBanner tone="warning" className="text-xs">
          {t("openDocumentPopupBlocked")}
        </StateBanner>
      );
    }
    const { state, action } = outcome;
    const retryable = isRetryableDocumentSourceState(state);
    return (
      <StateBanner
        tone={STATE_TONE[state]}
        className="text-xs"
        action={
          state === "unauthenticated" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="document-source-reauthenticate"
              onClick={() => {
                // A FULL NAVIGATION, not a client-side push: the session this app is holding is
                // gone, so the destination has to be re-entered through the auth wall itself. The
                // return URL is read from the LIVE address bar rather than from a hook, which is
                // what makes it carry `?document=` exactly as the person had it.
                if (typeof window === "undefined") return;
                window.location.assign(reauthenticateHref(window.location));
              }}
            >
              {t("reauthenticate")}
            </Button>
          ) : retryable ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="document-source-retry"
              onClick={() => { void run(action); }}
            >
              {t("retry")}
            </Button>
          ) : undefined
        }
      >
        {t(documentSourceStateKey(state))}
      </StateBanner>
    );
  })();

  return (
    <div className="flex flex-col gap-2" data-testid="document-source-actions">
      <div className="flex flex-wrap items-center gap-2">
        {viewable ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="document-open-original"
            disabled={busy !== null}
            aria-busy={busy === "preview"}
            aria-label={busy === "preview" ? t("openOriginalProgress", { name }) : t("openOriginalLabel", { name })}
            onClick={() => { void run("preview"); }}
          >
            {busy === "preview" ? t("openingDocument") : t("openDocument")}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="document-download-original"
          disabled={busy !== null}
          aria-busy={busy === "download"}
          aria-label={busy === "download" ? t("downloadOriginalProgress", { name }) : t("downloadOriginalLabel", { name })}
          onClick={() => { void run("download"); }}
        >
          {busy === "download" ? t("downloadingOriginal") : t("downloadOriginal")}
        </Button>
      </div>

      {/* ONE ANNOUNCEMENT OWNER AT A TIME (spec appendix C §4). While a read is in flight this
          region speaks and the banner below is unmounted; once it settles this region is empty and
          the banner (its own computed role="alert"/"status") speaks. They can never both be
          non-empty, so a screen reader is never told two competing things about one action. */}
      <p role="status" aria-live="polite" className="sr-only">
        {busy === "preview" ? t("openOriginalProgress", { name })
          : busy === "download" ? t("downloadOriginalProgress", { name })
          : ""}
      </p>

      {!viewable ? (
        // STANDING, not post-click. This is a property of the DOCUMENT's type and is true before
        // anybody presses anything — surfacing it only after a failed click would be telling the
        // person about a wall by walking them into it.
        <StateBanner tone="neutral" className="text-xs" silent>
          <span className="flex flex-wrap items-center gap-2">
            <span>{t("openDocumentNotViewable", { mime: doc.mime_type ?? t("openDocumentUnknownType") })}</span>
            {onShowExtraction ? (
              <Button type="button" size="xs" variant="outline" onClick={onShowExtraction}>
                {t("openDocumentShowExtraction")}
              </Button>
            ) : null}
          </span>
        </StateBanner>
      ) : null}

      {banner}
    </div>
  );
}
