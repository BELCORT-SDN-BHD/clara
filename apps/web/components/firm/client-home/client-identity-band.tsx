"use client";

// SECTION A — identity and facts. Who this client is, in the DB's own words, with each fact
// carrying the BASIS it was recorded on.
//
// THE BASIS IS PART OF THE FACT, NOT A FOOTNOTE. `clara.client_facts` is a PROVENANCED register
// (0055_client_facts_trio.sql:386-420, ADR-062): every row ships `basis` and `basis_kind` beside
// its value, and a fact shown without them reads as something the system knows rather than
// something a named person recorded on a named ground. The Knowledge tab already renders that
// pair verbatim; this band carries it into the chip's own accessible name rather than hiding it
// in a `title` tooltip a keyboard or screen-reader user never reaches.
//
// A FAILED FACTS READ DEGRADES THE CHIPS ONLY. The client's name, status and start date come
// from a DIFFERENT read (`loadClientById`), so a facts failure must not blank the band — the
// client register's own `factsAvailable` pattern (components/firm/client-register-list.tsx),
// applied here.
//
// NON-SCALAR VALUES ARE NOT PRINTED. `fact_value` is jsonb, so a structured capture stringifies
// to "[object Object]" under a bare `String(...)` — a defect the map records live elsewhere in
// the product. Such facts are COUNTED and pointed at the Knowledge tab, never rendered as a
// broken token: a chip that says "[object Object] · owner instruction" is worse than a chip that
// is honestly absent.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/parts/PartBadge";
import { PageHeader } from "@/components/common/page-shell";
import { businessDate } from "@/lib/business-date";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import type { ClientRow } from "@/lib/firm/reads";
import { loadClientFactKeys, loadClientFacts, type ClientFactRow } from "@/lib/registers/knowledge";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "../data-state";

/** A jsonb value the eye can read, or `null` when it is not a scalar. Deliberately NOT
 *  `String(v)`: see this file's header. */
export function factValueText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
}

/** The LIVE row per fact key — `superseded_by === null` (rows are superseded, never updated,
 *  0055:383-408). The read returns live and superseded rows together so the Knowledge tab can
 *  show history; this band wants only what is true now. */
export function liveFacts(rows: readonly ClientFactRow[]): ClientFactRow[] {
  return rows.filter((row) => row.superseded_by === null);
}

export function ClientIdentityBand({
  clientId,
  client,
}: {
  clientId: string;
  /** Already read by the page (it also decides the onboarding arm) — passed in rather than
   *  re-read, so the name in the heading and the status badge can never disagree. */
  client: ClientRow;
}) {
  const t = useTranslations("ClientWorkspace");
  const tcr = useTranslations("ClientsRegister");
  const facts = useAsyncRead(() => loadClientFacts(sessionTokenAccessor, clientId));
  const keys = useAsyncRead(() => loadClientFactKeys(sessionTokenAccessor));

  const statusLabels: Record<string, string> = {
    active: tcr("statuses.active"),
    archived: tcr("statuses.archived"),
    onboarding: tcr("statuses.onboarding"),
  };
  // A key absent from the global catalog renders as its own raw key — honest, and the same
  // fallback the Knowledge tab takes for the same race (two separate reads).
  const keyDescriptions = new Map((keys.data ?? []).map((row) => [row.fact_key, row.description] as const));

  const live = liveFacts(facts.data ?? []);
  const printable = live.filter((row) => factValueText(row.fact_value) !== null);
  const structured = live.length - printable.length;

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {client.name}
            {/* Never colour-only: the badge carries its own label text. */}
            <Badge tone={client.status === "active" ? "info" : "neutral"}>
              {statusLabels[client.status] ?? client.status}
            </Badge>
          </span>
        }
        description={t("clientSince", { date: businessDate(new Date(client.created_at)) })}
      />
      {/* THE CHIPS RIDE `DataState` LIKE EVERY OTHER SECTION (review-557, N9). They were the one
          block on either board rendering its three states by hand, which is how they came to
          have no LOADING state at all: an unresolved facts read looked exactly like a client
          with no facts recorded. `DataState` tells the three apart by construction.
          The wrapper is still NOT the whole band — a facts failure must degrade the CHIPS only,
          never the name, status and start date beside them, which come from a different read
          (the client register's own `factsAvailable` pattern). */}
      <DataState
        loading={facts.loading}
        error={facts.error}
        isEmpty={live.length === 0}
        emptyMessage={t("factsEmpty")}
      >
        <ul className="enter-content flex list-none flex-wrap gap-2 p-0">
          {printable.map((row) => (
            <li key={row.id}>
              {/* The global `:focus-visible` outline is this link's indicator — see the
                  scoreboard's own note and globals.css's FOCUS TREATMENT block. `min-h-6 py-1`
                  is the WCAG 2.2 target-size lift, and it belongs on the link rather than on
                  `PartBadge`, whose non-link callers have the correct density. */}
              <Link
                href={`/clients/${clientId}/knowledge`}
                className="inline-flex min-h-6 items-center rounded-full py-1 no-underline"
              >
                <Badge tone="neutral">
                  {/* The catalog's own description names what the key MEANS; the raw key is the
                      fallback when the vocabulary read has not landed. Neither is invented. */}
                  {keyDescriptions.get(row.fact_key) ?? row.fact_key}
                  {": "}
                  {factValueText(row.fact_value)}
                  {" · "}
                  {row.basis_kind}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
        {/* Inside the wrapper, because it is a statement ABOUT the facts that were read: a
            client whose only facts are structured has a `printable` list of zero and this line
            is the whole answer. Outside it, that would print beside a loading sentence. */}
        {structured > 0 ? (
          <p className="text-xs text-muted-foreground">{t("factsStructured", { count: structured })}</p>
        ) : null}
      </DataState>
    </div>
  );
}
