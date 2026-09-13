"use client";

// #644 — the presentation the Knowledge LIST and the Knowledge DETAIL share.
//
// ONE PLACE, because the two surfaces must not disagree about what a record IS.
// A trust badge that says "unverified" on the list and nothing on the detail
// would be two products; the list and the detail render the same badges, the
// same applicability, the same effective window and the same source block from
// the same functions here.
//
// COLOUR IS NEVER THE ONLY CUE (appendix D's own rule): every badge carries its
// word, and the trust badge additionally carries a title attribute saying what
// the level means. A reader who cannot see the tone still reads "Unverified
// inference".

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StateBanner } from "@/components/common/state";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { getRows } from "@/lib/read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { businessDateTime } from "@/lib/business-date";
import type { KnowledgeRecordRow, KnowledgeSourcePins } from "@/lib/registers/knowledge";

/** A knowledge value is jsonb of whatever shape the catalog types it as. Render
 *  the scalar shapes as themselves, and an object as its own top-level entries —
 *  never `[object Object]`, and never a silent truncation. */
export function knowledgeValueText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => knowledgeValueText(v)).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
      .join(" · ");
  }
  return String(value);
}

/** The four conditions rendered as words, or the explicit "always applies". */
export function appliesWhenText(appliesWhen: Record<string, unknown> | null | undefined): string | null {
  if (!appliesWhen) return null;
  const entries = Object.entries(appliesWhen);
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k} = ${String(v)}`).join(", ");
}

export function KnowledgeKindBadge({ kind }: { kind: string }) {
  const t = useTranslations("ClientKnowledge");
  const label = t(`kind.${kind}` as "kind.assertion");
  return <Badge variant="outline">{label}</Badge>;
}

export function KnowledgeScopeBadge({ scope }: { scope: "client" | "firm" }) {
  const t = useTranslations("ClientKnowledge");
  // A FIRM default is the notable one: it is not this client's own statement,
  // and the badge is how a reader knows a change there touches other clients.
  return (
    <Badge variant={scope === "firm" ? "secondary" : "outline"}>
      {scope === "firm" ? t("scope.firm") : t("scope.client")}
    </Badge>
  );
}

/** THE TRUST BADGE. `imported_unverified` and `inferred` are the two levels the
 *  product must never let read as confirmed (#644 AC3), so they carry the
 *  destructive tone AND the word "unverified"; an asserted record is a plain
 *  outline badge, because "somebody said so" is the ordinary case, not a claim
 *  of independent verification. */
export function KnowledgeTrustBadge({ trust }: { trust: string }) {
  const t = useTranslations("ClientKnowledge");
  const unverified = trust === "imported_unverified" || trust === "inferred";
  return (
    <Badge variant={unverified ? "destructive" : "outline"} title={t(`trustMeaning.${trust}` as "trustMeaning.asserted")}>
      {t(`trust.${trust}` as "trust.asserted")}
    </Badge>
  );
}

export function KnowledgeBadges({ record }: { record: KnowledgeRecordRow }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <KnowledgeKindBadge kind={record.kind} />
      <KnowledgeScopeBadge scope={record.scope_kind} />
      <KnowledgeTrustBadge trust={record.trust} />
    </span>
  );
}

/** Applicability + the effective window, as a labelled pair of facts rather than
 *  a date range nobody can tell apart from a posting date (appendix C's "label
 *  posting / as-of / due dates distinctly"). */
export function KnowledgeApplicability({ record }: { record: KnowledgeRecordRow }) {
  const t = useTranslations("ClientKnowledge");
  const applies = appliesWhenText(record.applies_when);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <dt>{t("appliesWhen")}</dt>
      <dd>{applies ?? t("appliesAlways")}</dd>
      <dt>{t("effectiveWindow")}</dt>
      <dd>
        {record.effective_from ?? t("effectiveOpenStart")}
        {" — "}
        {record.effective_to ?? t("effectiveOpenEnd")}
      </dd>
    </dl>
  );
}

/**
 * THE SOURCE BLOCK — and the "inaccessible source" face.
 *
 * A record links its source (0192 pins document / extraction / region /
 * field_path onto the real relations; it never copies the payload). So the
 * source is a SEPARATE read, and that read can fail on its own: the document may
 * have been legal-held, the reader's role may have narrowed, the row may simply
 * not be visible under RLS. That is NOT "no source" — the record still names
 * one — so this block never degrades to silence. It says the source is named and
 * currently unreadable, with the id, in its own alert.
 */
export function KnowledgeSourceBlock({ clientId, source, sourceKind }: {
  clientId: string;
  source: KnowledgeSourcePins | null | undefined;
  sourceKind: string;
}) {
  const t = useTranslations("ClientKnowledge");
  const documentId = source?.document_id ?? null;
  const doc = useAsyncRead(async () => {
    if (!documentId) return [] as { id: string; original_filename: string | null }[];
    return getRows<{ id: string; original_filename: string | null }>("documents", {
      select: "id,original_filename",
      filters: { id: `eq.${documentId}` },
      session: sessionTokenAccessor,
    });
  });

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{t("sourceHeading")}</span>
      <span>{t(`sourceKind.${sourceKind}` as "sourceKind.user_statement")}</span>
      {documentId === null ? null : doc.loading ? (
        <span className="text-muted-foreground">{t("sourceLoading")}</span>
      ) : doc.error || (doc.data ?? []).length === 0 ? (
        // THE INACCESSIBLE-SOURCE FACE. An alert, not an empty state: the record
        // names a source and the reader cannot open it — a fact worth telling
        // them, with the id so they can ask somebody who can. `tone="warning"`
        // is what gives this box `role="alert"` (components/common/state.tsx's
        // own severity ladder); it is not decoration.
        <StateBanner tone="warning">{t("sourceUnavailable", { id: documentId })}</StateBanner>
      ) : (
        <Link className="underline underline-offset-4" href={`/clients/${clientId}/documents`}>
          {doc.data?.[0]?.original_filename ?? documentId}
        </Link>
      )}
      {source?.field_path ? (
        <span className="text-muted-foreground">{t("sourceField", { field: source.field_path })}</span>
      ) : null}
    </div>
  );
}

/** Who recorded it, on what basis, when — the ADR-062 trio, rendered the same on
 *  both surfaces. `recorded_via` is shown because "Clara wrote this down for
 *  Aisyah" and "Aisyah typed this" are different facts about the same record. */
export function KnowledgeProvenance({ record }: { record: KnowledgeRecordRow }) {
  const t = useTranslations("ClientKnowledge");
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <dt>{t("columnBasis")}</dt>
      <dd>{record.basis}</dd>
      <dt>{t("assertedBy")}</dt>
      <dd>
        {record.asserted_by_name ?? record.asserted_by}
        {" · "}
        {t(`recordedVia.${record.recorded_via}` as "recordedVia.human_ui")}
      </dd>
      <dt>{t("columnRecordedAt")}</dt>
      <dd>{businessDateTime(record.recorded_at)}</dd>
    </dl>
  );
}
