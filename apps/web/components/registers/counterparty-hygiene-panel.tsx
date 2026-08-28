"use client";

// The counterparty hygiene panel — T8's NEW surface (port-wave plan §4/§5):
// create · set terms · add/retire alias · rename · merge. Nested inside the
// registers "aging" tab (Q3's closed IA; no TABS/CLIENT_TABS edit — the
// team-lead's own brief), a full write surface in the staff-advances-register.tsx
// shape: one useHydratedPart, one persistent refusal banner, every dialog a
// thin controlled form over a single governed call.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  loadCounterparties, loadCounterpartyAliases,
  type CounterpartyKind, type CounterpartyRow,
} from "@/lib/registers/counterparty";
import {
  createCounterparty, setCounterpartyTerms, addCounterpartyAlias, retireCounterpartyAlias,
  renameCounterparty, mergeCounterparties,
} from "@/lib/registers/counterparty-doors";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateCounterpartyDialog } from "./CreateCounterpartyDialog";
import { SetCounterpartyTermsDialog } from "./SetCounterpartyTermsDialog";
import { AddCounterpartyAliasDialog } from "./AddCounterpartyAliasDialog";
import { RetireCounterpartyAliasDialog } from "./RetireCounterpartyAliasDialog";
import { RenameCounterpartyDialog } from "./RenameCounterpartyDialog";
import { MergeCounterpartiesDialog } from "./MergeCounterpartiesDialog";
import type { SessionTokenAccessor } from "@/lib/session";

async function loadHygieneData(session: SessionTokenAccessor, clientId: string, kind: CounterpartyKind) {
  const [counterparties, aliases] = await Promise.all([
    loadCounterparties(session, clientId, kind),
    loadCounterpartyAliases(session, clientId),
  ]);
  return { counterparties, aliases };
}

function statusBadge(t: ReturnType<typeof useTranslations>, row: CounterpartyRow, all: CounterpartyRow[]) {
  if (row.merged_into) {
    const survivor = all.find((c) => c.id === row.merged_into);
    return <Badge variant="secondary">{t("statusMerged", { name: survivor?.name ?? row.merged_into.slice(0, 8) })}</Badge>;
  }
  if (row.retired_at) return <Badge variant="secondary">{t("statusRetired")}</Badge>;
  return <Badge variant="outline">{t("statusLive")}</Badge>;
}

export function CounterpartyHygienePanel({ clientId }: { clientId: string }) {
  const t = useTranslations("ArApCounterparty");
  const [kind, setKind] = useState<CounterpartyKind>("vendor");
  const { data, busy, err, clr, act, reload } = useHydratedPart(sessionTokenAccessor, (s) => loadHygieneData(s, clientId, kind));

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void reload();
  }, [kind, reload]);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        level={2}
        action={
          <CreateCounterpartyDialog
            busy={busy}
            onSubmit={(k, name, registrationNo, tin) => act(() => createCounterparty(clientId, k, name, registrationNo, tin, { session: sessionTokenAccessor }).then(() => undefined))}
          />
        }
      >
        {t("heading")}
      </SectionHeader>
      {err && (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
          {err}
        </StateBanner>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(["vendor", "customer"] as const).map((k) => (
          <Button key={k} type="button" size="sm" variant={kind === k ? "default" : "outline"} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(k === "vendor" ? "kindVendorPlural" : "kindCustomerPlural")}
          </Button>
        ))}
      </div>

      {!data ? (
        <LoadingState>{t("loading")}</LoadingState>
      ) : data.counterparties.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.counterparties.map((row) => {
            const isLive = row.merged_into === null && row.retired_at === null;
            const rowAliases = data.aliases.filter((a) => a.counterparty_id === row.id && a.retired_at === null);
            const mergeCandidates = data.counterparties.filter((c) => c.id !== row.id && c.merged_into === null && c.retired_at === null);
            return (
              <li key={row.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.name}</span>
                    {statusBadge(t, row, data.counterparties)}
                  </div>
                  {isLive && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RenameCounterpartyDialog
                        currentName={row.name}
                        busy={busy}
                        onSubmit={(newName) => act(() => renameCounterparty(clientId, row.id, newName, { session: sessionTokenAccessor }).then(() => undefined))}
                      />
                      <SetCounterpartyTermsDialog
                        counterpartyName={row.name}
                        currentDays={row.payment_terms_days}
                        busy={busy}
                        onSubmit={(days) => act(() => setCounterpartyTerms(row.id, days, { session: sessionTokenAccessor }).then(() => undefined))}
                      />
                      <AddCounterpartyAliasDialog
                        counterpartyName={row.name}
                        busy={busy}
                        onSubmit={(alias, origin) => act(() => addCounterpartyAlias(clientId, row.id, alias, origin, { session: sessionTokenAccessor }).then(() => undefined))}
                      />
                      <MergeCounterpartiesDialog
                        clientId={clientId}
                        kind={kind}
                        counterparty={row}
                        candidates={mergeCandidates}
                        busy={busy}
                        onConfirm={(survivorId, mergedId, reason) => act(() => mergeCounterparties(clientId, survivorId, mergedId, reason, { session: sessionTokenAccessor }).then(() => undefined))}
                      />
                    </div>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                  <div className="flex justify-between gap-1">
                    <dt>{t("registration")}</dt><dd>{row.registration_no ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-1">
                    <dt>{t("tin")}</dt><dd>{row.tin ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-1">
                    <dt>{t("terms")}</dt><dd>{row.payment_terms_days ?? "—"}</dd>
                  </div>
                </dl>
                {rowAliases.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {rowAliases.map((a) => (
                      <span key={a.id} className="flex items-center gap-1">
                        <Badge variant="outline">{a.alias_display}</Badge>
                        {isLive && (
                          <RetireCounterpartyAliasDialog
                            aliasDisplay={a.alias_display}
                            busy={busy}
                            onSubmit={() => act(() => retireCounterpartyAlias(clientId, a.id, { session: sessionTokenAccessor }).then(() => undefined))}
                          />
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
