"use client";

// Export recipient admin — clara.export_recipients (direct read), register/
// supersede_export_recipient (admin+, 0132:1051-1164). A non-admin caller sees
// the door's own CLR04-shaped refusal verbatim on attempt — this panel does
// not pre-hide the button on a client-side role guess (the DB is the wall).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listExportRecipients, registerExportRecipient } from "@/lib/reports/api";
import { DoorDialog } from "./DoorDialog";
import type { SessionTokenAccessor } from "@/lib/session";

export function ExportRecipientsPanel({ session }: { session: SessionTokenAccessor }) {
  const t = useTranslations("ClientReports.sandbox.recipients");
  const { data: recipients, err, clr, busy, act } = useHydratedPart(session, (s) => listExportRecipients({ session: s }));

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader level={4} action={<RegisterDialog session={session} busy={busy} act={act} />}>
        {t("heading")}
      </SectionHeader>
      {/* Low 8 (independent review): a register/supersede refusal must render
          ALONGSIDE the still-good list, never REPLACE it — the list staying
          visible is itself evidence nothing about the existing recipients
          changed. Mirrors StatutoryReportsPanel.tsx's split: a friendly
          wrapped message for the INITIAL load failure (`recipients` never
          loaded), a verbatim `code (reason): message` banner for a later
          door refusal once the list has already loaded once. */}
      {recipients && err ? (
        <StateBanner
          tone="error"
          className="text-xs"
          code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}
        >
          {err}
        </StateBanner>
      ) : null}
      {!recipients ? (
        err ? (
          <StateBanner tone="error" className="text-xs">{t("error", { message: err })}</StateBanner>
        ) : (
          <LoadingState className="text-xs">{t("loading")}</LoadingState>
        )
      ) : recipients.length === 0 ? (
        <EmptyState className="text-xs">{t("empty")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-1">
          {recipients.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-card-foreground">{r.display_name}</span>
              <Badge variant="secondary">{r.kind}</Badge>
              {r.superseded_by ? <Badge variant="outline">{t("superseded")}</Badge> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RegisterDialog({
  session,
  busy,
  act,
}: {
  session: SessionTokenAccessor;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("ClientReports.sandbox.recipients.register");
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [basis, setBasis] = useState("");
  return (
    <DoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      disabled={!userId.trim() || !displayName.trim() || !basis.trim()}
      onConfirm={() =>
        act(async () => {
          // firm_member ONLY in this crude door (0132:1074-1083 requires a
          // p_user for that kind) — an external recipient's covered_clients
          // form is a named follow-up, not built in this pass.
          await registerExportRecipient(
            { kind: "firm_member", userId: userId.trim(), displayName, basis, coveredClients: null },
            { session },
          );
        })
      }
    >
      <div className="flex flex-col gap-2">
        <Input aria-label={t("userIdPlaceholder")} placeholder={t("userIdPlaceholder")} value={userId} onChange={(e) => setUserId(e.target.value)} />
        <Input aria-label={t("displayNamePlaceholder")} placeholder={t("displayNamePlaceholder")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <Input aria-label={t("basisPlaceholder")} placeholder={t("basisPlaceholder")} value={basis} onChange={(e) => setBasis(e.target.value)} />
      </div>
    </DoorDialog>
  );
}
