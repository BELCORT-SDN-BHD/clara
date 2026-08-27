"use client";

// The shared loading/empty/error wrapper for every P3 firm/registers surface
// (mission mechanism rule: "explicit loading/empty/error; distinct no_session/
// forbidden/not_found renderings"). A pure branching component — every string it
// shows is i18n'd at the CALL SITE (the "Common" namespace for the shared kinds,
// a feature namespace for `emptyMessage`) — this file holds no hardcoded copy.
//
// Classifies via `instanceof`/typed predicates ONLY (isReadError/isDoorError/
// isDoorRefusal) — never by matching the error's message text (AGENTS.md's
// "spelling is not identity" law).
//
// `ErrorMessage` is exported separately so a component that already has real DATA
// on screen (e.g. needs-you-inbox.tsx after a failed resolve/dismiss act()) can show
// the error as a BANNER above its still-real list, rather than DataState's own
// replace-the-content behaviour — hydrate-never-trust means a later action failing
// must never hide the data a successful read already produced.

// P3 polish: the BRANCHING is untouched (same predicates, same order, same
// verbatim-refusal rule) — only the paint moved onto components/common/state.tsx,
// so a refusal rendered here, on the Bank tab, on the Documents tab and inside a
// Clara `refusal` part are now one visual thing. The four wire-error kinds keep
// the tone mapping this file already chose; what changed is that they are now
// BOXED like every other failure in the product instead of being the one lane
// that painted a failure as bare coloured prose.
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { isReadError } from "@/lib/read";
import { isDoorError, isDoorRefusal } from "@/lib/doors";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";

export function ErrorMessage({ error }: { error: unknown }) {
  const t = useTranslations("Common");

  if (isDoorRefusal(error)) {
    // The deliberate no-hydrate exception, same as PartRenderer's refusal card: a
    // governed refusal renders its code + message VERBATIM, never re-worded.
    return (
      <StateBanner
        tone="error"
        code={
          <>
            {error.code}
            {error.reason ? ` · ${error.reason}` : ""}
          </>
        }
      >
        {error.message}
      </StateBanner>
    );
  }
  if (isReadError(error) || isDoorError(error)) {
    if (error.kind === "no_session") return <StateBanner tone="info">{t("noSession")}</StateBanner>;
    if (error.kind === "forbidden") return <StateBanner tone="warning">{t("forbidden")}</StateBanner>;
    if (error.kind === "not_found") return <StateBanner tone="neutral">{t("notFound")}</StateBanner>;
    return <StateBanner tone="error">{t("unexpectedError", { message: error.message })}</StateBanner>;
  }
  const message = error instanceof Error ? error.message : String(error);
  return <StateBanner tone="error">{t("unexpectedError", { message })}</StateBanner>;
}

export function DataState({
  loading,
  error,
  isEmpty,
  emptyMessage,
  children,
}: {
  loading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyMessage: string;
  children: ReactNode;
}) {
  const t = useTranslations("Common");

  if (error) return <ErrorMessage error={error} />;
  if (loading) return <LoadingState>{t("loading")}</LoadingState>;
  if (isEmpty) return <EmptyState>{emptyMessage}</EmptyState>;
  return <>{children}</>;
}
