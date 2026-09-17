"use client";

// THE IDENTITY SECTION on the client's Knowledge page — #647, C-41's ruling made concrete.
//
// ONE SECTION, BOTH HALVES, and that is the whole point of C-41: "place identity/alias/fact
// operations in Knowledge and onboarding as accepted; no requirement for one button per database
// function". So this renders
//   (a) the CLIENT's own identifiers — H-20's missing face. Read DIRECTLY from
//       `clara.client_identifiers` under RLS (the table carries `p_client_identifiers_human`,
//       SELECT to clara_authenticated where firm_id = jwt_firm(), plus the table grant — both
//       MEASURED on the #647 rig, not taken from migration text), written through
//       `clara.add_client_identifier`. Nothing is wrapped: a read door over rows the caller can
//       already select would be a second read of the same rows.
//   (b) the CLIENT's COUNTERPARTIES — every identity, its live alias count, how much of it rests
//       on a source, and a link out to the routed detail where corrections happen.
// …and nothing else. It does NOT touch `knowledge-panel.tsx`'s four faces, and it mints no
// knowledge key: `clara.knowledge_keys` / `knowledge_plan_item_map` are #654's alone this wave.
//
// THE THREE EMPTY FACES ARE DIFFERENT SENTENCES (H-34's REDESIGN obligation, and appendix C's
// "Empty states distinguish first use, filtered no-results, valid no-data"):
//   · successful empty   — the read ran and this client has no counterparty at all.
//   · filtered to nothing — the read returned N counterparties and the ROLE filter hid them all.
//                           It keeps the filter, says how many exist, and offers to clear it.
//   · failed read        — DataState's ErrorMessage, typed by kind, never a caught error mapped
//                           to an empty array.
//
// Toggle Group (62) carries the role filter, not a hand-rolled active-Button loop.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { EmptyState } from "@/components/common/state";
import { SectionHeader } from "@/components/common/section-header";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { businessDateTime } from "@/lib/business-date";
import { counterpartyIdentityHref } from "@/lib/navigation/tree";
import { toDialogRefusal } from "@/components/common/dialog-refusal";
import {
  listCounterpartyIdentity, listCounterpartyMergeCorrections, loadClientIdentifiers,
  addClientIdentifier,
} from "@/lib/registers/counterparty-identity";
import type { CounterpartyKind } from "@/lib/registers/counterparty";
import { AddClientIdentifierDialog } from "./AddClientIdentifierDialog";

type RoleFilter = "all" | CounterpartyKind;

export function ClientIdentitySection({ clientId }: { clientId: string }) {
  const t = useTranslations("ArApCounterparty.identity");
  const ti = useTranslations("ArApCounterparty.clientIdentifiers");
  const [role, setRole] = useState<RoleFilter>("all");

  // BOTH roles are always READ; the filter is a presentation choice over already-fetched facts,
  // never a re-issued narrower read. That is what makes "N exist, none is a vendor" sayable at
  // all — a kind-scoped read could not tell that sentence from a successful empty (H-34's own
  // defect, which is why it is written down here).
  const identities = useAsyncRead(() =>
    listCounterpartyIdentity(clientId, null, { session: sessionTokenAccessor }));
  const corrections = useAsyncRead(() =>
    listCounterpartyMergeCorrections(clientId, { session: sessionTokenAccessor }));
  const identifiers = useAsyncRead(() =>
    loadClientIdentifiers(sessionTokenAccessor, clientId));

  const all = identities.data?.counterparties ?? [];
  const shown = role === "all" ? all : all.filter((c) => c.kind === role);

  async function runAddIdentifier(kind: string, value: string) {
    return identifiers.act(async () => {
      await addClientIdentifier(clientId, kind, value, { session: sessionTokenAccessor });
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader level={2}>{t("sectionHeading")}</SectionHeader>
      <p className="text-sm text-muted-foreground">{t("sectionIntro")}</p>

      {/* (a) H-20 — the client's OWN identifiers. */}
      <div className="flex flex-col gap-2">
        <SectionHeader
          level={3}
          action={
            <AddClientIdentifierDialog
              busy={identifiers.busy}
              refusal={toDialogRefusal(identifiers.error)}
              onSubmit={runAddIdentifier}
            />
          }
        >
          {ti("heading")}
        </SectionHeader>
        <p className="text-xs text-muted-foreground">{ti("intro")}</p>
        {/* The standing refusal survives the dialog closing and the reload that follows. */}
        {identifiers.data !== null && identifiers.error ? <ErrorMessage error={identifiers.error} /> : null}
        <DataState
          loading={identifiers.loading && identifiers.data === null}
          error={identifiers.data === null ? identifiers.error : null}
          isEmpty={(identifiers.data ?? []).length === 0}
          emptyMessage={ti("empty")}
        >
          <ul className="flex flex-col gap-2">
            {(identifiers.data ?? []).map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                <span className="flex flex-wrap items-baseline gap-2">
                  <Badge variant="outline">{row.kind}</Badge>
                  <span className="font-medium text-card-foreground">{row.value_normalized}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {ti("columnAdded")}: {businessDateTime(row.added_at)}
                </span>
              </li>
            ))}
          </ul>
        </DataState>
      </div>

      {/* (b) the client's counterparties, with a link out to each identity's own URL. */}
      <div className="flex flex-col gap-2">
        <SectionHeader level={3}>{t("filterLabel")}</SectionHeader>
        <ToggleGroup
          aria-label={t("filterLabel")}
          value={[role]}
          onValueChange={(next) => setRole((next[0] as RoleFilter) ?? "all")}
        >
          <ToggleGroupItem value="all">{t("filterBoth")}</ToggleGroupItem>
          <ToggleGroupItem value="vendor">{t("filterVendor")}</ToggleGroupItem>
          <ToggleGroupItem value="customer">{t("filterCustomer")}</ToggleGroupItem>
        </ToggleGroup>

        <DataState
          loading={identities.loading && identities.data === null}
          error={identities.data === null ? identities.error : null}
          isEmpty={all.length === 0}
          emptyMessage={t("emptyBoth")}
        >
          {shown.length === 0 ? (
            // FILTERED TO NOTHING — a different fact from a successful empty, and it says how
            // many really exist plus how to get back to them.
            <EmptyState>
              <span className="flex flex-col items-start gap-2">
                <span>
                  {t("filteredEmpty", {
                    total: all.length,
                    role: role === "vendor" ? t("roleVendor") : t("roleCustomer"),
                  })}
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => setRole("all")}>
                  {t("clearFilter")}
                </Button>
              </span>
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((row) => (
                <li key={row.id} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-card-foreground">{row.name}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">
                        {row.kind === "vendor" ? t("roleVendor") : t("roleCustomer")}
                      </Badge>
                      {row.status === "merged" ? <Badge variant="secondary">{t("actMerged")}</Badge> : null}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("countAliases", { n: row.live_alias_count })}
                    {" · "}
                    {t("countRevisions", { n: row.revision_count })}
                    {" · "}
                    {t("countUnsourced", { n: row.unsourced_alias_count })}
                  </p>
                  {/* Item (33): the row itself is NOT clickable — the navigation is a real,
                      focusable link with its own accessible name. */}
                  <Link
                    className="w-fit text-xs underline underline-offset-4"
                    href={counterpartyIdentityHref(clientId, row.id)}
                  >
                    {t("openDetail")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DataState>
        {identities.data ? (
          <p className="text-xs text-muted-foreground">{t("asOf", { at: identities.data.as_of })}</p>
        ) : null}
      </div>

      {/* (c) AC3's bounded discovery. It is a READ, and the copy says out loud that there is no
          un-merge action anywhere — the prohibition holds by absence, and a surface that stayed
          silent about it would invite the question. */}
      <div className="flex flex-col gap-2">
        <SectionHeader level={3}>{t("correctionsHeading")}</SectionHeader>
        <p className="text-xs text-muted-foreground">{t("noUnmergeDoor")}</p>
        <DataState
          loading={corrections.loading && corrections.data === null}
          error={corrections.data === null ? corrections.error : null}
          isEmpty={(corrections.data?.merges ?? []).length === 0}
          emptyMessage={t("correctionsEmpty")}
        >
          <ul className="flex flex-col gap-2">
            {(corrections.data?.merges ?? []).map((m) => (
              <li key={m.merged_id} className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
                <span className="text-card-foreground">
                  {t("mergeMerged", {
                    name: m.survivor_name ?? m.survivor_id ?? "",
                    at: m.merged_at ? businessDateTime(m.merged_at) : "—",
                  })}
                </span>
                <span className="text-xs text-muted-foreground">{m.merged_name ?? m.merged_id}</span>
                <p className="text-xs text-muted-foreground">
                  {m.representable ? t("representableYes") : t("representableNo")}
                </p>
                {m.merge_reason ? (
                  <p className="text-xs text-muted-foreground">{t("mergeReason", { reason: m.merge_reason })}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </DataState>
      </div>
    </section>
  );
}
