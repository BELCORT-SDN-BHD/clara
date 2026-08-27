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
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientRegister, loadClientRegisterFacts, type ClientRow } from "@/lib/firm/reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";
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
  const { data, loading, error } = useAsyncRead(loadEnrichedRegister);
  const rows = data?.rows ?? [];

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
      {data && !data.factsAvailable ? <p className="text-xs text-warning">{t("factsUnavailableNote")}</p> : null}
      <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("emptyMessage")}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t("columnName")}</th>
                <th className="py-2 pr-4 font-medium">{t("columnStatus")}</th>
                <th className="py-2 pr-4 font-medium">{t("columnEntityType")}</th>
                <th className="py-2 pr-4 font-medium">{t("columnMsic")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client, entityType, msic }) => (
                <tr key={client.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4">
                    <Link href={`/clients/${client.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {client.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-card-foreground">{statusLabels[client.status] ?? client.status}</td>
                  <td className="py-2 pr-4 text-card-foreground">{factCell(entityType)}</td>
                  <td className="py-2 pr-4 text-card-foreground">{factCell(msic)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
    </div>
  );
}
