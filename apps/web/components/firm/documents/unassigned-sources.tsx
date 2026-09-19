"use client";

// #633 AC5 — THE FIRM-ALTITUDE PLACE TO PUT A FILE.
//
// The refusal at firm altitude was already honest: the Clara composer deliberately
// hides Attach outside a client, with a sentence saying why
// (`ClaraThreadView.tsx:575-591`, asserted in `chat-parity-walk.spec.ts:229-234`).
// What was missing was somewhere for a firm-level document to GO. That refusal stays
// exactly as it is; this leaf is the answer it was pointing at.
//
// NO NEW DOOR. `clara.list_unassigned_documents(p_limit)` has existed since 0009:2590
// (SECURITY INVOKER, `set search_path`, predicate `not exists (… document_filings …
// retired_at is null)`, granted `clara_authenticated, clara_agent_ro` at :2908-2913,
// `p_limit` clamped to [0,500] by the function itself at :2610) and had simply never
// had an `apps/web` caller. The attribution act is the SAME two-step every other
// surface uses: `record_client_resolution` then `file_document` (`doors.ts`'s
// `fileToClient`).
//
// ASK ONCE, AND ONLY ONCE — AND WHAT THE DOOR ACTUALLY GUARANTEES.
// A document is asked about here exactly one time: the control disappears the moment
// its act settles, and the row leaves the population on the next read because the DB's
// own predicate stops matching it. This question is also deliberately DISTINCT from
// #647's counterparty-identity question, so one file is never asked two different
// things by two different surfaces.
//
// MEASURED (fix round 1, review finding 633-ADV-5 — the earlier header overstated this).
// Re-filing the SAME document to the SAME client is refused by the estate with its own
// words (CLR10, "document is already actively filed to this client"), and a replay of
// the same op_key with the same arguments is idempotent — still one filing. But filing
// it to a DIFFERENT client is ACCEPTED: the estate permits two live filings on one
// document, and 0123's classify gate then refuses that document with
// `document_processing_multi_client`, so its processing stops. This surface therefore
// does not claim a wall the door does not hold; it offers ONE act per row, renders
// whatever the door answers VERBATIM — never re-worded, never retried, never replaced
// by a fabricated success — and the second-attribution behaviour is pinned by
// `packages/db/tests/unassigned-intake-reuse.test.mjs` (p633.unassigned.second_attempt)
// rather than asserted here.
//
// THE READ FLOOR IS MEASURED, NOT ASSUMED. On the #633 rig (clara_633, PG 17.11) a
// VIEWER persona reads `list_unassigned_documents(50)` successfully, while
// `record_client_resolution` refuses a viewer with CLR04 "insufficient role" and
// admits a bookkeeper. So the nav row is floored at VIEWER (what the READ admits) and
// the ACT's own higher floor is rendered as the DB's refusal on the row that asked
// for it — a face, not an empty page.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/state";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SectionHeader } from "@/components/common/section-header";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { fileToClient } from "@/lib/documents/doors";
import { listUnassignedDocuments } from "@/lib/documents/receipts";
import { listFirmClients } from "@/lib/documents/reads";
// #636 — the SAME batch card, mounted READ-ONLY apart from Cancel. The firm leaf has no client in
// scope, so a row's own address is a Work link when the child carries one and nothing otherwise;
// the card says so rather than offering a link that could only 404.
import { IntakeBatchCard } from "@/components/documents/intake-batch-card";
import { useIntakeBatch } from "@/lib/documents/use-intake-batch";
import { useCapabilityRegistry } from "@/lib/documents/use-capability-registry";
import { renderFileSize } from "@/lib/documents/file-size";
import { renderKindLabel, needsClassification } from "@/lib/documents/kind-label";
import { businessDate } from "@/lib/business-date";
import { CapabilityTiers } from "@/components/documents/capability-tiers";
import { DocumentKindControl } from "@/components/documents/document-kind-control";
import { DoorFeedback } from "@/components/documents/door-feedback";
import type { ClientRow } from "@/lib/documents/types";

type UnassignedRow = Awaited<ReturnType<typeof listUnassignedDocuments>>[number] & {
  original_filename?: string | null;
  byte_size?: number | null;
  created_at?: string | null;
};

export function UnassignedSources() {
  const t = useTranslations("FirmDocuments");
  const tDoc = useTranslations("ClientDocuments");
  const sources = useHydratedPart<UnassignedRow[]>(
    sessionTokenAccessor,
    (live) => listUnassignedDocuments(50, { session: live }) as Promise<UnassignedRow[]>,
  );
  const clients = useHydratedPart<ClientRow[]>(sessionTokenAccessor, (live) => listFirmClients({ session: live }));
  /** #636 — `?batch=<uuid>` on this leaf, read-only apart from Cancel. */
  const batch = useIntakeBatch();
  const capabilities = useCapabilityRegistry(sessionTokenAccessor);

  /** ASK-ONCE, held locally for the window between an act settling and the next read
   *  landing. Without it the same document would offer its question again for the
   *  duration of that round trip — the "repeat nag" the AC forbids. It is a UI guard
   *  only: the DB's own refusal is what makes a second attempt impossible. */
  const [asked, setAsked] = useState<ReadonlySet<string>>(new Set());

  const rows = sources.data ?? [];

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("subheading")} />

      {/* #636 — `?batch=<uuid>` on this leaf too. No new route: the firm Documents leaf already
          exists (`lib/navigation/tree.ts:227`) and a batch is a VIEW of the sources it shows. */}
      {batch.state !== null ? (
        <section className="flex flex-col gap-2">
          <IntakeBatchCard
            state={batch.state}
            clientId={null}
            facet={batch.facet}
            onFacetChange={batch.setFacet}
            onRefresh={batch.refresh}
            pollExhausted={batch.pollExhausted}
            onCancelled={() => { void sources.reload(); }}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("listHeading")}</SectionHeader>

        {sources.loading && !sources.data ? (
          // Sized to the content it replaces (three rows of a seven-column table), not
          // a spinner: a skeleton that matches the shape stops the page jumping when
          // the real rows land.
          <div className="flex flex-col gap-2" data-testid="unassigned-loading">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !sources.data && (sources.err || sources.clr) ? (
          <div className="flex flex-col gap-2">
            {/* UNAVAILABLE is not EMPTY. A read that failed says so and shows the DB's
                own words; it never renders as "nothing to do". */}
            <EmptyState>{t("unavailable")}</EmptyState>
            <DoorFeedback err={sources.err} clr={sources.clr} />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col gap-2">
            <EmptyState>{t("empty")}</EmptyState>
            <DoorFeedback err={sources.err} clr={sources.clr} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <DataTableCard label={t("tableLabel")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{tDoc("colFile")}</TableHead>
                  <TableHead>{tDoc("colSize")}</TableHead>
                  <TableHead>{tDoc("colKind")}</TableHead>
                  <TableHead>{tDoc("colReceived")}</TableHead>
                  <TableHead>{tDoc("colCapability")}</TableHead>
                  <TableHead>{t("colAttribution")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <SourceRow
                    key={row.id}
                    row={row}
                    clients={clients.data ?? []}
                    busy={sources.busy}
                    asked={asked.has(row.id)}
                    capabilityIndex={capabilities.index}
                    onFile={async (clientId) => {
                      const ok = await sources.act(
                        () => fileToClient(row.id, clientId, "firm_documents_leaf"),
                      );
                      if (ok) setAsked((prev) => new Set(prev).add(row.id));
                      return ok;
                    }}
                    act={(fn) => sources.act(fn)}
                  />
                ))}
              </TableBody>
            </DataTableCard>
            {/* The act's refusal, VERBATIM. `useHydratedPart` re-reads after every
                attempt, success or refusal, so a refused row is still shown with the
                DB's own reason rather than optimistically removed. */}
            <DoorFeedback err={sources.err} clr={sources.clr} />
          </div>
        )}
      </section>
    </PageShell>
  );
}

function SourceRow({
  row, clients, busy, asked, capabilityIndex, onFile, act,
}: {
  row: UnassignedRow;
  clients: ClientRow[];
  busy: boolean;
  asked: boolean;
  capabilityIndex: Parameters<typeof CapabilityTiers>[0]["index"];
  onFile: (clientId: string) => Promise<boolean>;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("FirmDocuments");
  const tDoc = useTranslations("ClientDocuments");
  const [clientId, setClientId] = useState("");
  const name = row.original_filename ?? row.id;

  return (
    <TableRow className="enter-content align-top">
      <TableCell className="max-w-48 truncate font-medium text-foreground" title={name}>{name}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {typeof row.byte_size === "number" ? renderFileSize(row.byte_size, tDoc) : "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        <div className="flex flex-col gap-1">
          <span>{renderKindLabel(row.document_kind, tDoc)}</span>
          {needsClassification(row.document_kind) ? (
            <DocumentKindControl documentId={row.id} filename={name} busy={busy} act={act} />
          ) : null}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {row.created_at ? businessDate(new Date(row.created_at)) : "—"}
      </TableCell>
      <TableCell className="min-w-40">
        <CapabilityTiers index={capabilityIndex} mime={row.mime_type} kind={row.document_kind} filename={name} compact />
      </TableCell>
      <TableCell className="min-w-56">
        {asked ? (
          // ASKED ONCE. The act settled; the row leaves the population on the next
          // read. Offering the question again in the meantime would be the nag.
          <span className="text-xs text-muted-foreground" data-testid="already-asked">{t("alreadyAttributed")}</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
              <SelectTrigger aria-label={t("chooseClientLabel", { filename: name })} size="sm">
                <SelectValue
                  placeholder={t("chooseClient")}
                  items={clients.map((c) => ({ value: c.id, label: c.name ?? c.id }))}
                />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name ?? c.id}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={busy || clientId === ""}
              onClick={() => { void onFile(clientId); }}
            >
              {t("fileToClient")}
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
