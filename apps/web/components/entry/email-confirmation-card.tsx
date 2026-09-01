import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

export type EmailConfirmationState =
  | { readonly kind: "ready"; readonly tokenHash: string }
  | { readonly kind: "missing" }
  | { readonly kind: "invalid" };

/**
 * The explicit-human stop between the email link and `verifyOtp`.
 *
 * This component is intentionally inert on render. Email scanners and browser
 * prefetchers may GET the page repeatedly; only the form's POST reaches the
 * token exchange handler. The token is carried as a hidden form field because
 * the POST needs the same bearer value, and the handler redirects to a clean,
 * fixed URL after either outcome so it leaves the address bar.
 */
export function EmailConfirmationCard({ state }: { state: EmailConfirmationState }) {
  const t = useTranslations("ConfirmEmail");

  if (state.kind === "missing") {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{t("missingTitle")}</h1>
          <CardDescription>{t("missingDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state.kind === "invalid") {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-base font-semibold">{t("invalidTitle")}</h1>
          <CardDescription>{t("invalidDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <StateBanner tone="error">{t("invalidDescription")}</StateBanner>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-base font-semibold">{t("title")}</h1>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form method="post" action="/auth/confirm/verify" className="flex flex-col gap-4">
          <input type="hidden" name="token_hash" value={state.tokenHash} />
          <Button type="submit" className="w-full">
            {t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
