"use client";

// T1 — `record_future_attestation` (port-wave-plan §4 T1). A write-only
// SST future-method attestation: admin rank, refuses CLR03 for an agent
// identity (WA21-R6 — "the future method is human-attested, never
// inferred"). `service_group` is validated server-side against the live
// `sst_threshold_schedule`, which carries no clara_authenticated grant (rung-
// 0 census: only clara_freeform_ro/clara_fn_owner may read it) — so this is a
// plain text field, never a fabricated dropdown backed by a catalog this UI
// cannot see. No read/list surface exists for `sst_future_attestations`
// either (the compliance-watch case view is T10's build, port-wave-plan §4);
// this panel is the write door alone, honestly.
//
// Client-scoped, not fiscal-year-scoped (the door takes no p_fy) — mounted
// once per client on ClosePage, independent of the selected year.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StateBanner } from "@/components/common/state";
import { MoneyInput } from "@/components/common/money-input";
import { CloseDoorDialog } from "./CloseDoorDialog";
import { recordFutureAttestation } from "@/lib/close/api";
import type { SessionTokenAccessor } from "@/lib/session";
import { isDoorRefusal } from "@/lib/close/api";

type Refusal = { code: string | null; reason: string | null; message: string };

export function FutureAttestationPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientClose.futureAttestation");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [lastRecordedId, setLastRecordedId] = useState<string | null>(null);

  const [serviceGroup, setServiceGroup] = useState("");
  const [expectedCents, setExpectedCents] = useState(0);
  const [horizonStart, setHorizonStart] = useState("");
  const [evidence, setEvidence] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const confirmDisabled =
    serviceGroup.trim().length === 0 ||
    expectedCents <= 0 ||
    !horizonStart ||
    evidence.trim().length === 0 ||
    !expiresAt;

  return (
    <div className="flex flex-col gap-2">
      <CloseDoorDialog
        triggerLabel={t("trigger")}
        title={t("title")}
        description={t("description")}
        confirmLabel={t("confirm")}
        busy={busy}
        confirmDisabled={confirmDisabled}
        onConfirm={async () => {
          setBusy(true);
          try {
            const out = (await recordFutureAttestation(
              { clientId, serviceGroup: serviceGroup.trim(), expectedCents, horizonStart, evidence: evidence.trim(), expiresAt },
              { session },
            )) as { id?: string } | null;
            setRefusal(null);
            setLastRecordedId(out?.id ?? null);
          } catch (e) {
            setRefusal(isDoorRefusal(e) ? { code: e.code, reason: e.reason, message: e.message } : { code: null, reason: null, message: e instanceof Error ? e.message : String(e) });
            setLastRecordedId(null);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fa-service-group">{t("serviceGroupLabel")}</Label>
            <Input id="fa-service-group" placeholder={t("serviceGroupPlaceholder")} value={serviceGroup} onChange={(e) => setServiceGroup(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fa-expected">{t("expectedLabel")}</Label>
            <MoneyInput
              id="fa-expected"
              aria-label={t("expectedLabel")}
              cents={expectedCents}
              mode="unsigned"
              onValueChange={(change) => {
                if (change.ok) setExpectedCents(change.cents ?? 0);
              }}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fa-horizon">{t("horizonLabel")}</Label>
              <Input id="fa-horizon" type="date" value={horizonStart} onChange={(e) => setHorizonStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fa-expires">{t("expiresLabel")}</Label>
              <Input id="fa-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fa-evidence">{t("evidenceLabel")}</Label>
            <Textarea id="fa-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          </div>
        </div>
      </CloseDoorDialog>
      {refusal ? (
        <StateBanner tone="error" code={refusal.code ? `${refusal.code}${refusal.reason ? ` · ${refusal.reason}` : ""}` : undefined}>
          {refusal.message}
        </StateBanner>
      ) : null}
      {lastRecordedId ? <StateBanner tone="neutral">{t("recorded", { id: lastRecordedId })}</StateBanner> : null}
    </div>
  );
}
