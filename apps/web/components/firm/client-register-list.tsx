"use client";

// The client register (owner ruling Q3) — clara.clients, the real clients the RLS
// session can see, each linking into its workspace. Enriched with entity_type/msic
// from clara.client_facts where a live fact exists (this build's coordinator
// ruling): a client with no such fact renders it absent, never inferred.
//
// N15 (independent review, 2026-08-27): the facts enrichment read is DECOUPLED
// from the primary client read — a `Promise.all` would have failed the WHOLE
// register (names, links, status — everything) if only the facts relation
// refused (e.g. a narrower grant on client_facts than on clients). The primary
// read's failure still fails the whole register (there is nothing to show
// without it); a facts-read failure degrades only the two enrichment columns,
// with an honest caption distinguishing "could not be loaded" from "no fact
// recorded" — law 2: a failed read is not evidence of absence.

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientRegister, loadClientRegisterFacts, type ClientRow } from "@/lib/firm/reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { onClientRecordChanged } from "@/lib/command/bus";
import { AddClientControl } from "./add-client-control";
import { DataState } from "./data-state";

type EnrichedRow = { client: ClientRow; entityType: string | null; msic: string | null };
type EnrichedRegister = { rows: EnrichedRow[]; factsAvailable: boolean };

async function loadEnrichedRegister(): Promise<EnrichedRegister> {
  const clients = await loadClientRegister(sessionTokenAccessor);

  const byClient = new Map<string, { entityType: string | null; msic: string | null }>();
  let factsAvailable = true;
  try {
    const facts = await loadClientRegisterFacts(sessionTokenAccessor);
    for (const f of facts) {
      const entry = byClient.get(f.client_id) ?? { entityType: null, msic: null };
      if (f.fact_key === "entity_type") entry.entityType = typeof f.fact_value === "string" ? f.fact_value : null;
      if (f.fact_key === "msic") entry.msic = typeof f.fact_value === "string" ? f.fact_value : null;
      byClient.set(f.client_id, entry);
    }
  } catch {
    factsAvailable = false; // the register itself still renders — see header
  }

  return {
    factsAvailable,
    rows: clients.map((client) => ({
      client,
      entityType: byClient.get(client.id)?.entityType ?? null,
      msic: byClient.get(client.id)?.msic ?? null,
    })),
  };
}

export function ClientRegisterList() {
  const t = useTranslations("ClientsRegister");
  const { data, loading, error, reload } = useAsyncRead(loadEnrichedRegister);
  const rows = data?.rows ?? [];

  // H-50 — the same mount-only read the client Home tab has, and the same staleness: a client
  // committed or cancelled from the Clara rail keeps its old status here on a back-navigation.
  // One subscription, one re-read; the event carries no status to trust.
  useEffect(() => onClientRecordChanged(() => void reload()), [reload]);

  const statusLabels: Record<string, string> = {
    active: t("statuses.active"),
    archived: t("statuses.archived"),
    onboarding: t("statuses.onboarding"),
  };

  const factCell = (value: string | null) => {
    if (!data?.factsAvailable) return t("factsUnavailable");
    return value ?? t("factAbsent");
  };

  return (
    <div className="flex flex-col gap-2">
      {/* H-51 — ABOVE the DataState, so it is offered on an EMPTY register too: a firm with no
          clients yet is precisely the firm that needs this control, and putting it inside the
          table's own state would have hidden it exactly then.
          #659 / #899 (D18.c): the control itself now lives in `./add-client-control.tsx` so Firm
          Home can mount the SAME one. Its reasoning moved with it; this call site keeps only the
          mount-point rule above, which Firm Home restates for its own state machine. */}
      <div className="self-start">
        <AddClientControl onCreated={() => void reload()} />
      </div>
      {data && !data.factsAvailable ? <p className="text-xs text-warning">{t("factsUnavailableNote")}</p> : null}
      <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("emptyMessage")}>
        {/* P3 polish: the hand-rolled `<table className="w-full text-left
            text-sm">` with `py-2 pr-4` cells became components/ui/table.tsx —
            the SAME primitive the Documents tab already used, so every data
            table in the product now shares one density, one hairline and one
            row-hover. It sits inside a Card because every other panel-level
            block on a page does; a bare table floating on the shell grey was
            the one surface with no edge at all. */}
        {/* #619 (裁-190's table-coverage pattern, applied here) — a `label`, so this
            table is announced by name rather than as an anonymous table two
            landmarks under the page's own <h1>. Nineteen of ~twenty DataTableCard
            call sites still omit one (that module's own header note); this is the
            second to gain it, after the journals table. */}
        <DataTableCard label={t("tableLabel")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columnName")}</TableHead>
              <TableHead>{t("columnStatus")}</TableHead>
              <TableHead>{t("columnEntityType")}</TableHead>
              <TableHead>{t("columnMsic")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ client, entityType, msic }) => (
              <TableRow key={client.id}>
                <TableCell>
                  <Link href={`/clients/${client.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    {client.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{statusLabels[client.status] ?? client.status}</TableCell>
                <TableCell className="text-muted-foreground">{factCell(entityType)}</TableCell>
                <TableCell className="text-muted-foreground">{factCell(msic)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      </DataState>
    </div>
  );
}
