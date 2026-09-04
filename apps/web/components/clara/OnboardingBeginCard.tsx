"use client";

// The FIRM-ALTITUDE half of the onboarding card — `OnboardingChecklistCard` renders this when
// no `clientId` is in scope. Split out of `OnboardingChecklistCard.tsx` only to keep that file
// readable; the behaviour, the door and every comment below are unchanged.

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { beginClientOnboarding } from "@/lib/onboarding/api";
import { isDoorRefusal } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";
import { OnboardingDoorDialog } from "./OnboardingDoorDialog";

/** Firm-altitude shape — see this file's own header ("SCOPE"). No hydrated
 *  read: there is no plan to scope a read to until AFTER a successful call,
 *  so this is a plain write-and-report affordance, never `useHydratedPart`
 *  over nothing. The DB's own returned `{client_id, plan_id}` is rendered
 *  VERBATIM as the receipt — never a fabricated "success" sentence — with an
 *  honest link into the new workspace (no auto-navigation: the human decides
 *  when to move, matching client-register-list.tsx's own Link-not-redirect
 *  precedent). */
export function BeginOnboardingCard({ session }: { session: SessionTokenAccessor }) {
  const t = useTranslations("ClientOnboarding.card");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clr, setClr] = useState<{ code: string; reason: string | null } | null>(null);
  const [result, setResult] = useState<{ client_id: string; plan_id: string } | null>(null);

  async function onConfirm() {
    setBusy(true);
    setErr(null);
    setClr(null);
    // F5 fix (rev-t11): a NEW attempt clears the LAST attempt's success
    // receipt too — otherwise a later refusal renders its red banner beside
    // a stale green "created" receipt from an earlier, unrelated success
    // (two contradictory receipts on screen at once, a fabricated-receipt
    // read on a governed act).
    setResult(null);
    try {
      const out = await beginClientOnboarding(name.trim(), { session });
      setResult(out);
      setName("");
    } catch (e) {
      if (isDoorRefusal(e)) {
        // N7 nit: the SAME code-slot composition ClientOnboardingCard's own
        // refusalBanner uses, rather than folding the reason into the
        // message text — one presentation for a DoorRefusal across this file.
        setErr(e.message);
        setClr({ code: e.code, reason: e.reason });
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <SectionHeader level={2}>{t("beginHeading")}</SectionHeader>
      {err ? (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
          {err}
        </StateBanner>
      ) : null}
      {result ? (
        <StateBanner tone="info">
          <p>{t("beginResult", { clientId: result.client_id, planId: result.plan_id })}</p>
          {/* F6 fix (rev-t11): a REAL link, not just a claim of one — the
              SAME Link-not-redirect precedent client-register-list.tsx
              already uses (no auto-navigation: the human decides when to
              move). */}
          <Link href={`/clients/${result.client_id}`} className="text-primary underline-offset-4 hover:underline">
            {t("beginResultLink")}
          </Link>
        </StateBanner>
      ) : null}
      <OnboardingDoorDialog
        triggerLabel={t("beginTrigger")}
        title={t("beginTitle")}
        description={t("beginDescription")}
        confirmLabel={t("beginConfirm")}
        busy={busy}
        confirmDisabled={name.trim().length === 0}
        onConfirm={onConfirm}
      >
        <Input
          aria-label={t("nameLabel")}
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </OnboardingDoorDialog>
    </div>
  );
}
