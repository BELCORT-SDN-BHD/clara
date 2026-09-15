"use client";

// #648 (journey A5) — THE FIRM-HOME TILE. AC4's "useful authorised next step".
//
// WHAT IT IS. One link to `/settings/setup`, with the DB's own required-answered/required-total
// count and the first outstanding fact named. Nothing more.
//
// WHAT IT IS EMPHATICALLY NOT: A GATE. It gates nothing, hides nothing and blocks nothing. AC4's
// second half — "keep the firm workspace usable where prerequisites permit" — is asserted rather
// than assumed: `packages/db/tests/firm-setup.test.mjs` cell `p648.workspace.open` proves a
// bookkeeper still reaches clients, Work, activity, the review queue and the client knowledge
// register through their production doors while this firm's setup is still open.
//
// IT RENDERS FOR ADMIN+ ONLY, AND ONLY WHILE REQUIRED FACTS REMAIN. `clara.get_firm_setup` floors
// at admin, so for anybody below that rank the read refuses and this component renders NOTHING —
// no tile, no error, no "you may not see this" on a home page that is otherwise entirely theirs.
// It is the one place in this journey where a refusal is deliberately silent, because a firm home
// is not the surface on which to tell a bookkeeper about a section they cannot open.
//
// NO SECOND `needs-you.ts` ROW KIND. That set is closed at nine with a tenth reserved
// (`lib/firm/needs-you.ts:40-59`) and #633 is already contending for the next one; a dedicated
// read is the honest shape for a firm-altitude fact that is not a review-queue row.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadFirmSetup } from "@/lib/firm-setup/api";

export function FirmSetupTile() {
  const t = useTranslations("FirmSetup");
  const setup = useAsyncRead(() => loadFirmSetup());
  const env = setup.data;

  // A refused or failed read renders nothing: see the header. A loading read renders nothing
  // either, rather than a placeholder count that would later change — the firm home already has
  // one honest orientation sentence and this tile must not compete with it while it is unread.
  if (setup.loading || setup.error || env === null) return null;
  if (env.plan_id === null) return null;
  if (env.state === "committed") return null;
  if (env.required_outstanding.length === 0) return null;

  const firstOutstanding = env.items.find((i) => i.item_key === env.required_outstanding[0]);

  return (
    <Card data-testid="firm-home-setup-tile">
      <CardHeader>
        <CardTitle>
          <SectionHeader level={2}>{t("tile.heading")}</SectionHeader>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm" data-testid="firm-home-setup-counter">
          {t("progress.counter", {
            answered: env.counter.required_answered,
            total: env.counter.required_total,
          })}
        </p>
        {firstOutstanding ? (
          <p className="text-xs text-muted-foreground">{t("tile.next", { question: firstOutstanding.question })}</p>
        ) : null}
        <p className="text-sm">
          <Link href="/settings/setup" className="text-primary underline-offset-4 hover:underline">
            {t("tile.action")}
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">{t("tile.noGate")}</p>
      </CardContent>
    </Card>
  );
}
