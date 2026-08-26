"use client";

// The client register (owner ruling Q3) — clara.clients, the real clients the RLS
// session can see, each linking into its workspace. Enriched with entity_type/msic
// from clara.client_facts where a live fact exists (this build's coordinator
// ruling): a client with no such fact renders it absent, never inferred.

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientRegister, loadClientRegisterFacts, type ClientRow } from "@/lib/firm/reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "./data-state";

async function loadEnrichedRegister(): Promise<{ client: ClientRow; entityType: string | null; msic: string | null }[]> {
  const [clients, facts] = await Promise.all([
    loadClientRegister(sessionTokenAccessor),
    loadClientRegisterFacts(sessionTokenAccessor),
  ]);
  const byClient = new Map<string, { entityType: string | null; msic: string | null }>();
  for (const f of facts) {
    const entry = byClient.get(f.client_id) ?? { entityType: null, msic: null };
    if (f.fact_key === "entity_type") entry.entityType = typeof f.fact_value === "string" ? f.fact_value : null;
    if (f.fact_key === "msic") entry.msic = typeof f.fact_value === "string" ? f.fact_value : null;
    byClient.set(f.client_id, entry);
  }
  return clients.map((client) => ({
    client,
    entityType: byClient.get(client.id)?.entityType ?? null,
    msic: byClient.get(client.id)?.msic ?? null,
  }));
}

export function ClientRegisterList() {
  const t = useTranslations("ClientsRegister");
  const { data, loading, error } = useAsyncRead(loadEnrichedRegister);
  const rows = data ?? [];

  return (
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
                <td className="py-2 pr-4 text-card-foreground">{client.status}</td>
                <td className="py-2 pr-4 text-card-foreground">{entityType ?? t("factAbsent")}</td>
                <td className="py-2 pr-4 text-card-foreground">{msic ?? t("factAbsent")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DataState>
  );
}
