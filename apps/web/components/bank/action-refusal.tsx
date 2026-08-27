"use client";

// The one place a door's failure (from useHydratedPart's own `err`/`clr`
// after an `act()` call) gets painted — VERBATIM, never re-worded, never
// retried automatically (AGENTS.md: "a refusal is retired only by the human
// changing something and trying again as a NEW call"). `clr` present means a
// real governed DoorRefusal; `clr` absent with `err` present is an
// operational failure (transport/auth/malformed) — both render the DB/wire's
// own message text, only the heading differs.

import { useTranslations } from "next-intl";

export function ActionRefusal({ err, clr }: { err: string | null; clr: { code: string; reason: string | null } | null }) {
  const t = useTranslations("ClientBank.common");
  if (!err) return null;
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <p className="font-medium">{clr ? t("refusalTitle") : t("actionFailedTitle")}</p>
      <p>{err}</p>
      {clr && (
        <p className="text-xs text-destructive/80">
          {clr.code}
          {clr.reason ? ` · ${clr.reason}` : ""}
        </p>
      )}
    </div>
  );
}
