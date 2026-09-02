"use client";

import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";
import { Button } from "@/components/ui/button";

export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("RouteError");

  return (
    <section className="flex min-h-full flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
      <StateBanner
        tone="error"
        title={t("title")}
        code={error.digest ? t("supportCode", { digest: error.digest }) : undefined}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => reset()}>
            {t("retry")}
          </Button>
        }
      >
        {t("message")}
      </StateBanner>
    </section>
  );
}
