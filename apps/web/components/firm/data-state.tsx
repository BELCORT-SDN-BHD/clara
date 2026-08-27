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

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { isReadError } from "@/lib/read";
import { isDoorError, isDoorRefusal } from "@/lib/doors";
import { Badge } from "@/components/parts/PartBadge";

export function ErrorMessage({ error }: { error: unknown }) {
  const t = useTranslations("Common");

  if (isDoorRefusal(error)) {
    // The deliberate no-hydrate exception, same as PartRenderer's refusal card: a
    // governed refusal renders its code + message VERBATIM, never re-worded.
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-error/30 bg-error-muted p-3 text-sm">
        <Badge tone="error">
          {error.code}
          {error.reason ? ` · ${error.reason}` : ""}
        </Badge>
        <p className="text-error">{error.message}</p>
      </div>
    );
  }
  if (isReadError(error) || isDoorError(error)) {
    if (error.kind === "no_session") return <StateMessage tone="info">{t("noSession")}</StateMessage>;
    if (error.kind === "forbidden") return <StateMessage tone="warning">{t("forbidden")}</StateMessage>;
    if (error.kind === "not_found") return <StateMessage tone="neutral">{t("notFound")}</StateMessage>;
    return <StateMessage tone="error">{t("unexpectedError", { message: error.message })}</StateMessage>;
  }
  const message = error instanceof Error ? error.message : String(error);
  return <StateMessage tone="error">{t("unexpectedError", { message })}</StateMessage>;
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
  if (loading) return <StateMessage tone="neutral">{t("loading")}</StateMessage>;
  if (isEmpty) return <StateMessage tone="neutral">{emptyMessage}</StateMessage>;
  return <>{children}</>;
}

const TONE_CLASSES = {
  neutral: "text-muted-foreground",
  info: "text-info",
  warning: "text-warning",
  error: "text-error",
} as const;

function StateMessage({ tone, children }: { tone: keyof typeof TONE_CLASSES; children: ReactNode }) {
  return <p className={`max-w-prose text-sm ${TONE_CLASSES[tone]}`}>{children}</p>;
}
