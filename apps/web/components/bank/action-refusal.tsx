"use client";

// The one place a door's failure (from useHydratedPart's own `err`/`clr`
// after an `act()` call) gets painted — VERBATIM, never re-worded, never
// retried automatically (AGENTS.md: "a refusal is retired only by the human
// changing something and trying again as a NEW call"). `clr` present means a
// real governed DoorRefusal; `clr` absent with `err` present is an
// operational failure (transport/auth/malformed) — both render the DB/wire's
// own message text, only the heading differs.

import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";

export function ActionRefusal({ err, clr }: { err: string | null; clr: { code: string; reason: string | null } | null }) {
  const t = useTranslations("ClientBank.common");
  if (!err) return null;
  // P3 polish: the shared shell. Bank's own refusal-vs-operational-failure
  // TITLE is kept — it is real information the message text alone does not
  // carry — and the CLR code moves from a dimmed 12px line UNDER the message
  // to the chip ABOVE it, which is where every other surface in the product
  // puts it. The DB's message is still verbatim, still never retried.
  return (
    <StateBanner
      tone="error"
      title={clr ? t("refusalTitle") : t("actionFailedTitle")}
      code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}
    >
      {err}
    </StateBanner>
  );
}
