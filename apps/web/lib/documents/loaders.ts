// Combined loaders for the client Documents workbench's hydrate-never-trust cards
// (lib/parts/hooks.ts's `useHydratedPart` — every loader here is the `loader`
// argument a card passes in). Pure orchestration over reads.ts/intake.ts's
// single-relation reads: batches ids, merges rows, and — the one judgement call this
// file makes — silently DROPS an entry whose document could not be read rather than
// rendering a half-built row. That is not "absence as evidence" (law 2): it never
// asserts a document is missing or a candidate is invalid, it only declines to
// render a card for something this pass could not actually see.

import {
  listActiveFilingsForClient, listAttemptsByIds, listDocumentsByIds,
  listEntriesForDocument, listExtractionsForDocument, listFilingsForDocument,
  listFirmClients, listOpenCandidatesForClient, listRegionsForExtractionIds,
} from "./reads";
import { listProcessingTasksForDocument } from "./intake";
import { readErrorKey } from "./copy";
import { isReadError } from "@/lib/read";
import type {
  CandidateRow, ClientRow, DocumentRow, ExtractionRow, FilingRow, JournalEntryRow,
  ProcessingTaskRow, RegionRow,
} from "./types";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** The translator every loader below threads through — resolved ONCE at the
 *  component boundary (`useTranslations("ClientDocuments")`) and passed down as a
 *  plain function reference. This module never imports next-intl itself: it is
 *  plain async orchestration, not a component, and has no `t()` of its own to
 *  call — see copy.ts's own header on why every copy.ts function returns a KEY
 *  instead (independent review 2026-08-27, N12). */
export type Translator = (key: string, params?: Record<string, string | number>) => string;

/** Translates a `ReadError` into its distinct, honest `kind` sentence
 *  (no_session/forbidden/not_found each their own — copy.ts's `readErrorKey`)
 *  before it reaches `useHydratedPart`'s generic `err` string. Anything else (an
 *  abort, a `RefusalError` — unreachable on a GET but kept passthrough for safety)
 *  is re-thrown UNCHANGED. */
async function withHonestReadKinds<T>(t: Translator, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isReadError(e)) throw new Error(t(readErrorKey(e.kind)));
    throw e;
  }
}

export type FiledDocumentEntry = { filing: FilingRow; document: DocumentRow };

/** This client's actively-filed documents, newest filing first (the workbench's
 *  main list). */
export async function loadFiledDocuments(clientId: string, t: Translator, opts: Opts = {}): Promise<FiledDocumentEntry[]> {
  return withHonestReadKinds(t, async () => {
    const filings = await listActiveFilingsForClient(clientId, opts);
    const docs = await listDocumentsByIds(filings.map((f) => f.document_id), opts);
    const byId = new Map(docs.map((d) => [d.id, d]));
    const entries: FiledDocumentEntry[] = [];
    for (const filing of filings) {
      const document = byId.get(filing.document_id);
      if (document) entries.push({ filing, document });
    }
    return entries;
  });
}

export type OpenCandidateEntry = { candidate: CandidateRow; document: DocumentRow };

/** Open (unconfirmed) attribution candidates for this client, resolved down to the
 *  underlying document via their attempt (attribution_candidates carries no
 *  document_id of its own — see reads.ts's own header). */
export async function loadOpenCandidates(clientId: string, t: Translator, opts: Opts = {}): Promise<OpenCandidateEntry[]> {
  return withHonestReadKinds(t, async () => {
    const candidates = await listOpenCandidatesForClient(clientId, opts);
    const attempts = await listAttemptsByIds(candidates.map((c) => c.attempt_id), opts);
    const attemptById = new Map(attempts.map((a) => [a.id, a]));
    const documentIds = candidates
      .map((c) => attemptById.get(c.attempt_id)?.document_id)
      .filter((id): id is string => Boolean(id));
    const docs = await listDocumentsByIds(documentIds, opts);
    const docById = new Map(docs.map((d) => [d.id, d]));
    const entries: OpenCandidateEntry[] = [];
    for (const candidate of candidates) {
      const attempt = attemptById.get(candidate.attempt_id);
      const document = attempt ? docById.get(attempt.document_id) : undefined;
      if (document) entries.push({ candidate, document });
    }
    return entries;
  });
}

export type DocumentDetailBundle = {
  document: DocumentRow;
  filings: FilingRow[];
  extractions: ExtractionRow[];
  /** Regions from the CURRENT extraction(s) only — `status='done'` and not
   *  superseded. A superseded/failed extraction's regions are historical noise for
   *  this view, not evidence a human should read as current. */
  regions: RegionRow[];
  /** Entries citing this document AND filed to `clientId` (independent review
   *  2026-08-27, F4 — see reads.ts's `listEntriesForDocument` own note). */
  entries: JournalEntryRow[];
  processingTasks: ProcessingTaskRow[];
};

/** The document-detail panel's whole read set, one bundle per selected document,
 *  SCOPED to `clientId` for the entries leg (F4). Returns `null` when the document
 *  itself could not be read (deleted from view, wrong firm) — the caller renders
 *  that as "not reachable today" (reportsApi precedent), never a crash. */
export async function loadDocumentDetail(documentId: string, clientId: string, t: Translator, opts: Opts = {}): Promise<DocumentDetailBundle | null> {
  return withHonestReadKinds(t, async () => {
    const [docs, filings, extractions, entries, processingTasks] = await Promise.all([
      listDocumentsByIds([documentId], opts),
      listFilingsForDocument(documentId, opts),
      listExtractionsForDocument(documentId, opts),
      listEntriesForDocument(documentId, clientId, opts),
      listProcessingTasksForDocument(documentId, opts),
    ]);
    const document = docs[0];
    if (!document) return null;

    const currentExtractionIds = extractions
      .filter((e) => e.status === "done" && e.superseded_by === null)
      .map((e) => e.id);
    const regions = await listRegionsForExtractionIds(currentExtractionIds, opts);

    return { document, filings, extractions, regions, entries, processingTasks };
  });
}

/** Firm clients, honest-kind-wrapped — the correction wizard's "move to" picker and
 *  documents-workbench.tsx's own hydrated cell (kept here rather than called
 *  directly from reads.ts so every workbench read shares the SAME honest-kind
 *  translation, not just the multi-relation loaders above). */
export async function loadFirmClients(t: Translator, opts: Opts = {}): Promise<ClientRow[]> {
  return withHonestReadKinds(t, () => listFirmClients(opts));
}
