"use client";

// The client Knowledge tab (lib/registers/knowledge.ts) — clara.client_facts,
// grouped by fact_key, live fact first with its superseded history collapsible.
// Every fact carries its own basis/basis_kind/recorded_by/recorded_at verbatim —
// this panel never infers a fact, and a client with no facts recorded shows that
// honestly rather than a fabricated default.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientFacts, type ClientFactRow } from "@/lib/registers/knowledge";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "@/components/firm/data-state";

function groupByFactKey(rows: ClientFactRow[]): Map<string, ClientFactRow[]> {
  const groups = new Map<string, ClientFactRow[]>();
  for (const row of rows) {
    const list = groups.get(row.fact_key) ?? [];
    list.push(row);
    groups.set(row.fact_key, list);
  }
  return groups;
}

export function KnowledgePanel({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientKnowledge");
  const { data, loading, error } = useAsyncRead(() => loadClientFacts(sessionTokenAccessor, clientId));
  const rows = data ?? [];
  const groups = groupByFactKey(rows);

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">{t("subheading")}</p>
      <DataState loading={loading} error={error} isEmpty={groups.size === 0} emptyMessage={t("empty")}>
        <ul className="flex flex-col gap-3">
          {[...groups.entries()].map(([factKey, versions]) => (
            <FactGroup key={factKey} factKey={factKey} versions={versions} />
          ))}
        </ul>
      </DataState>
    </div>
  );
}

function FactGroup({ factKey, versions }: { factKey: string; versions: ClientFactRow[] }) {
  const t = useTranslations("ClientKnowledge");
  const [showHistory, setShowHistory] = useState(false);
  const live = versions.find((v) => v.superseded_at === null) ?? versions[0];
  // groupByFactKey only ever creates a non-empty array for a key it inserts, but
  // `noUncheckedIndexedAccess` cannot see that invariant through `versions[0]` —
  // an explicit guard rather than a non-null assertion.
  if (!live) return null;
  const history = versions.filter((v) => v.id !== live.id);

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-card-foreground">{factKey}</span>
        <span className="text-card-foreground">{String(live.fact_value)}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <dt>{t("columnBasis")}</dt>
        <dd>{live.basis} ({live.basis_kind})</dd>
        <dt>{t("columnRecordedAt")}</dt>
        <dd>{new Date(live.recorded_at).toLocaleString()}</dd>
      </dl>
      {history.length > 0 ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="self-start text-xs text-primary underline-offset-4 hover:underline"
            onClick={() => setShowHistory((s) => !s)}
          >
            {showHistory ? t("hideHistory") : t("historyLabel", { count: history.length })}
          </button>
          {showHistory ? (
            <ul className="flex flex-col gap-1 border-t border-border pt-1 text-xs text-muted-foreground">
              {history.map((h) => (
                <li key={h.id}>
                  {String(h.fact_value)} — {h.basis} ({new Date(h.recorded_at).toLocaleString()})
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
