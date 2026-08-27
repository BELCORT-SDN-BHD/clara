"use client";

// The client Knowledge tab (lib/registers/knowledge.ts) — clara.client_facts,
// grouped by fact_key, live fact first with its superseded history collapsible.
// Every fact carries its own basis/basis_kind/recorded_by/recorded_at verbatim —
// this panel never infers a fact, and a client with no facts recorded shows that
// honestly rather than a fabricated default.
//
// N12 (independent review, 2026-08-27): loadClientFactKeys (the global vocabulary,
// clara.client_fact_keys) is now CONSUMED — each fact group shows the catalog's
// own `description` (what the key means, and for `msic` specifically, the
// honest "format-only, no official registry checked" caveat the DB itself
// records) rather than the raw fact_key alone. A key absent from the catalog
// (should not happen — client_facts has a foreign key onto client_fact_keys —
// but this read is a SEPARATE query, so the two can race or one can fail
// independently) degrades to showing the raw key with no description, never a
// thrown error over the whole panel.
// N11: timestamps render in the business timezone explicitly.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientFacts, loadClientFactKeys, type ClientFactRow } from "@/lib/registers/knowledge";
import { businessDateTime } from "@/lib/business-date";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { Button } from "@/components/ui/button";
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
  const facts = useAsyncRead(() => loadClientFacts(sessionTokenAccessor, clientId));
  // A SEPARATE, independent read (N12) — its own failure never blanks the facts
  // themselves, only the descriptive labels degrade to the raw key.
  const keys = useAsyncRead(() => loadClientFactKeys(sessionTokenAccessor));
  const rows = facts.data ?? [];
  const groups = groupByFactKey(rows);
  const descriptions = new Map((keys.data ?? []).map((k) => [k.fact_key, k.description]));

  return (
    // `subheading` moved into the page header (the knowledge route) — one
    // place for a surface's orientation line, product-wide.
    <div className="flex flex-col gap-4">
      <DataState loading={facts.loading} error={facts.error} isEmpty={groups.size === 0} emptyMessage={t("empty")}>
        <ul className="flex flex-col gap-3">
          {[...groups.entries()].map(([factKey, versions]) => (
            <FactGroup key={factKey} factKey={factKey} versions={versions} description={descriptions.get(factKey) ?? null} />
          ))}
        </ul>
      </DataState>
    </div>
  );
}

function FactGroup({
  factKey,
  versions,
  description,
}: {
  factKey: string;
  versions: ClientFactRow[];
  description: string | null;
}) {
  const t = useTranslations("ClientKnowledge");
  const [showHistory, setShowHistory] = useState(false);
  const live = versions.find((v) => v.superseded_at === null) ?? versions[0];
  // groupByFactKey only ever creates a non-empty array for a key it inserts, but
  // `noUncheckedIndexedAccess` cannot see that invariant through `versions[0]` —
  // an explicit guard rather than a non-null assertion.
  if (!live) return null;
  const history = versions.filter((v) => v.id !== live.id);

  return (
    <li className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-medium text-card-foreground">{factKey}</span>
        <span className="text-card-foreground">{String(live.fact_value)}</span>
      </div>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <dt>{t("columnBasis")}</dt>
        <dd>{live.basis} ({live.basis_kind})</dd>
        <dt>{t("columnRecordedAt")}</dt>
        <dd>{businessDateTime(live.recorded_at)}</dd>
      </dl>
      {history.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="link"
            size="xs"
            className="self-start px-0"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((s) => !s)}
          >
            {showHistory ? t("hideHistory") : t("historyLabel", { count: history.length })}
          </Button>
          {showHistory ? (
            <ul className="flex flex-col gap-1 border-t border-border pt-1 text-xs text-muted-foreground">
              {history.map((h) => (
                <li key={h.id}>
                  {String(h.fact_value)} — {h.basis} ({businessDateTime(h.recorded_at)})
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
