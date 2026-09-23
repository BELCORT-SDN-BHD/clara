// #656 — THE BROWSER'S ONE ROAD TO THE OPENING SOURCE.
//
// Two things live here and nothing else: the runtime call that asks the opening lane to READ a
// basis's tie document, and the small pure helpers the tied-seed surfaces need to talk about
// provenance without minting a figure.
//
// WHY THIS IS A RUNTIME CALL AND NOT A DOOR. `clara.record_opening_targets_parsed` is
// `clara_runtime`-only and carries no `_human_ctx` twin, on purpose: a document-sourced opening
// target is written by the lane that re-derived it from stored evidence, never by a browser that
// typed it. The human door for a tied basis (`clara.record_opening_target`) refuses outright with
// CLR31 `parsed_target_writer_required`. So the browser's road is the runtime route
// `POST /api/opening/parse-targets`, reached same-origin through
// `app/api/runtime/[...path]/route.ts` (which maps `/api/runtime/*` -> the runtime's `/api/*`).
//
// THE OUTCOME IS PERSISTENT, NEVER A TOAST, and that is an acceptance criterion rather than a
// preference (#656 AC5): reading an opening source is a material act on a client's books, and its
// refusal names rows a professional has to go and look at. A message that disappears after four
// seconds cannot carry that. Every caller renders what comes back as a standing block.
//
// TRANSPORT DISCIPLINE is `lib/documents/runtime-wire.ts`'s, wholesale — `safeRuntimeFetch` so a
// genuine network failure surfaces typed and a deliberate abort stays distinguishable,
// `redirect: "manual"` so the app's own session proxy 307-to-/login surfaces as `unauthenticated`
// rather than as a 200 HTML page. The one place this file quotes a body is the ROUTE'S OWN typed
// envelope (`{status, reason}`), which this runtime mints on purpose — exactly the narrow,
// first-party exception `lib/interview/api.ts:70-82` argues for and takes.

import { safeRuntimeFetch, expectRuntimeOk, RuntimeError } from "@/lib/documents/runtime-wire";
import { kindForStatus } from "@/lib/wire-error-kind";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";
import type { OpeningTbTargetRow } from "./opening-types";

const PARSE_PATH = "/api/runtime/opening/parse-targets";
/** #986 — the SECOND verb on this lane. A separate path, not a flag on the parse route: the two
 *  acts have different keys, different receipts and different news to give a person. */
const REFRESH_PATH = "/api/runtime/opening/refresh-targets";
const PARSE_TIMEOUT_MS = 30_000;

/** What the route answers, as the surfaces read it. `kind` is the DISCRIMINANT the face renders
 *  on — never the HTTP number, so a copy change never has to chase a status code. */
export type OpeningParseOutcome =
  | { kind: "parsed"; lines: number }
  /** 422 — the honest "I did not read this document", with the reason VERBATIM. Includes the
   *  keyed-fallback signal (`no_opening_tb_lines`), the named all-or-nothing refusal listing the
   *  regions that failed the grammar, and #656's named chart gap. */
  | { kind: "unparseable"; reason: string; unmappedAccounts: string[] }
  /** 409 — a governed refusal or a lifecycle conflict, carrying the database's own code/reason. */
  | { kind: "refused"; reason: string; code: string | null }
  /** 403 — the bookkeeper+ floor. Named as a restriction; the surface offers no fake retry. */
  | { kind: "denied" }
  /** 404 — a basis this person cannot see, masked identically to one that does not exist. */
  | { kind: "not_found" }
  /** 202 from the REFRESH verb (#986) — the basis now stands on a new reading of the same
   *  document. `retired` is how many targets the reading it left behind had, and it is NOT
   *  cosmetic: "3 replaced 3" and "3 replaced 5" are different facts about the document. */
  | { kind: "refreshed"; lines: number; retired: number };

/** True when the outcome is one a person can act on by keying the balances instead. */
export const isKeyedFallback = (o: OpeningParseOutcome): boolean =>
  o.kind === "unparseable" && o.reason === "no_opening_tb_lines";

/**
 * #986 — TRUE ONLY FOR THE RE-READ CONFLICT, which is the one refusal on this lane that has an
 * act behind it.
 *
 * The token is the runtime's own (`packages/runtime/lib/opening-parse.mjs` mints it when
 * `clara._reserve_op` refuses the pinned (seed, document) key with different args, which is what a
 * second reading of the document looks like from there). Every OTHER refusal on this lane is
 * something a person fixes elsewhere — the registry is closed, the tie moved — so offering the
 * refresh beside them would be a control that cannot work.
 */
export const isSourceRereadConflict = (o: OpeningParseOutcome): boolean =>
  o.kind === "refused" && o.reason === "source_reread_since_parse";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/**
 * The one road to either opening-target verb: the same transport discipline, the same typed
 * outcome table, one path and one success shape apart.
 *
 * EXTRACTED, NOT REWRITTEN (#986). Every branch below is #656's; what is new is that the 202 arm
 * is supplied by the caller, because "I read this document" and "I replaced what an earlier
 * reading left" are different news and must not share a sentence. A second hand-written copy of
 * the redirect/abort/status discipline is how one of the two quietly stops handling an expired
 * cookie.
 */
async function callOpeningAct(
  path: string,
  seedId: string,
  label: string,
  opts: Opts,
  ok: (body: Record<string, unknown>) => OpeningParseOutcome,
): Promise<OpeningParseOutcome> {
  const session = opts.session ?? sessionTokenAccessor;
  const token = await session.getAccessToken();
  if (!token) throw new RuntimeError(`${label}: not signed in`, { status: null, kind: "unauthenticated" });

  const res = await safeRuntimeFetch(
    path,
    {
      method: "POST",
      cache: "no-store",
      redirect: "manual",
      signal: opts.signal ?? AbortSignal.timeout(PARSE_TIMEOUT_MS),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ seedId }),
    },
    label,
  );
  // An opaque redirect is the expired-cookie case and must never be read as a body.
  if (res.type === "opaqueredirect") await expectRuntimeOk(res, label);

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason : null;

  if (res.status === 202) return ok(body);
  if (res.status === 422) {
    return {
      kind: "unparseable",
      reason: reason ?? "no_opening_tb_lines",
      unmappedAccounts: Array.isArray(body.unmapped_accounts)
        ? body.unmapped_accounts.filter((a): a is string => typeof a === "string")
        : [],
    };
  }
  if (res.status === 409) {
    return { kind: "refused", reason: reason ?? "refused", code: typeof body.code === "string" ? body.code : null };
  }
  if (res.status === 403) return { kind: "denied" };
  if (res.status === 404) return { kind: "not_found" };

  // Anything else is a genuine fault: classified by STATUS only, body never quoted.
  throw new RuntimeError(`${label} failed`, { status: res.status, kind: kindForStatus(res.status) });
}

/**
 * Ask the runtime to read this basis's tie document into opening targets.
 *
 * Resolves an outcome for EVERY answer the route contracts (202/403/404/409/422) and throws only
 * for a genuine transport or infrastructure fault — a refusal is a result the surface renders, not
 * an exception it has to catch to stay usable.
 */
export function parseOpeningSource(seedId: string, opts: Opts = {}): Promise<OpeningParseOutcome> {
  return callOpeningAct(PARSE_PATH, seedId, "read opening source", opts,
    (body) => ({ kind: "parsed", lines: Number(body.lines ?? 0) }));
}

/**
 * #986 — BRING THIS BASIS ONTO THE NEW READING OF ITS OWN DOCUMENT.
 *
 * The act a person reaches for after `parseOpeningSource` answers the re-read conflict. It is a
 * SEPARATE verb rather than a retry of the read, and deliberately so: reading the document again
 * would still refuse (the parse's op key is stable per (seed, document), which is what stops a
 * retried POST doubling a basis), while this call retires the targets the earlier reading left and
 * records the new one's under a key that carries the new extraction.
 *
 * `no_reread_to_refresh` comes back as an ordinary `refused` outcome. It means somebody — or
 * another tab — already refreshed this basis onto the reading the document now stands on, so
 * there is nothing left to retire; re-reading the basis shows the answer.
 */
export function refreshOpeningSource(seedId: string, opts: Opts = {}): Promise<OpeningParseOutcome> {
  return callOpeningAct(REFRESH_PATH, seedId, "refresh opening source", opts,
    (body) => ({ kind: "refreshed", lines: Number(body.lines ?? 0), retired: Number(body.retired ?? 0) }));
}

// ---------------------------------------------------------------------------------------------
// Pure helpers. NO ARITHMETIC ON MONEY BEYOND SUMMING WHAT THE DATABASE ALREADY RETURNED, and
// what is summed here is a COVERAGE figure (how much of the printed source is mapped), never a
// tie figure. C-25's defect was exactly a coverage figure worn as a tie, so these never go near
// `OpeningDryrunStrip`, whose own law is that it mints no numeral.
// ---------------------------------------------------------------------------------------------

/** A target's provenance, as the panel renders it. */
export type OpeningProvenance =
  | { kind: "document"; documentId: string; sha256: string | null; regionId: string | null; extractionId: string | null }
  | { kind: "keyed"; enteredBy: string | null };

export function provenanceOf(row: OpeningTbTargetRow): OpeningProvenance {
  if (row.provenance_kind === "document") {
    const ref = (row.extraction_ref ?? null) as { region_id?: unknown; extraction_id?: unknown } | null;
    return {
      kind: "document",
      documentId: row.document_id ?? "",
      sha256: row.source_sha256,
      regionId: typeof ref?.region_id === "string" ? ref.region_id : null,
      extractionId: typeof ref?.extraction_id === "string" ? ref.extraction_id : null,
    };
  }
  return { kind: "keyed", enteredBy: row.entered_by };
}

/** The first twelve characters of a sha, the house shorthand a person can eyeball against a
 *  document row. Never presented as the whole hash. */
export const shaShort = (sha: string | null | undefined): string =>
  typeof sha === "string" && sha.length >= 12 ? sha.slice(0, 12) : "";

export type OpeningCoverage = {
  mappedCount: number;
  unmappedCount: number;
  mappedDebitCents: number;
  mappedCreditCents: number;
  unmappedDebitCents: number;
  unmappedCreditCents: number;
};

/**
 * How much of the printed source has an account behind it. COUNT AND CENTS, both sides, and NO
 * PERCENTAGE — a percentage invites "97% is basically done", and an opening basis is either
 * complete or it is not (#656 AC5, and the estate's own no-percentage rule).
 *
 * A row is UNMAPPED when it carries no `account_code`. On a document-sourced basis that is
 * structurally impossible — `clara.record_opening_targets_parsed` re-derives the account from the
 * stored region and `fk_opening_tb_targets_account` requires it to exist in the client's chart, so
 * a parsed target is always both source-exact and chart-present (measured:
 * `packages/db/tests/opening-ledger-source.test.mjs`, `p656.tie.unmapped_blocks`). The counter
 * still runs over both lanes because ONE panel renders a basis whichever way it was authored, and
 * a coverage figure that silently assumed a lane would be the quiet pass all over again.
 */
/**
 * True when EVERY target on this basis was written by the parse lane from the tie document.
 *
 * #656 fix-round (adversarial A10). On such a basis an unmapped line is not rare — it is
 * STRUCTURALLY unreachable, by the two walls named above. So a surface that prints
 * "Not yet mapped: 0 line(s)" there is rendering a CONSTANT as if it were a measurement, and a
 * reader who does not know that reads it as "everything is mapped": C-25's quiet pass, one layer
 * down. The face states the fact instead, and keeps the numeric count for a basis that carries a
 * keyed row, where `unmapped_labels` is a real state a person can act on.
 *
 * An EMPTY basis is not "document-sourced" for this purpose: nothing has been read yet, so there
 * is no structural claim to make.
 */
export const isDocumentSourcedBasis = (targets: readonly OpeningTbTargetRow[]): boolean =>
  targets.length > 0 && targets.every((t) => t.provenance_kind === "document");

export function openingCoverage(targets: readonly OpeningTbTargetRow[]): OpeningCoverage {
  const out: OpeningCoverage = {
    mappedCount: 0, unmappedCount: 0,
    mappedDebitCents: 0, mappedCreditCents: 0,
    unmappedDebitCents: 0, unmappedCreditCents: 0,
  };
  for (const t of targets) {
    const mapped = typeof t.account_code === "string" && t.account_code.trim() !== "";
    if (mapped) {
      out.mappedCount += 1;
      out.mappedDebitCents += t.debit_cents;
      out.mappedCreditCents += t.credit_cents;
    } else {
      out.unmappedCount += 1;
      out.unmappedDebitCents += t.debit_cents;
      out.unmappedCreditCents += t.credit_cents;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The tie-document candidates.
// ---------------------------------------------------------------------------------------------

/** The two kinds `clara.create_opening_seed` admits as a tie document (`0017:2913-2917`, CLR02
 *  for anything else). `prior_gl` is DELIBERATELY ABSENT: a prior general ledger is the seeding
 *  lane's source, not an opening basis's tie, and the door refuses it today. Offering it and
 *  letting the database say no would be a control that cannot work. */
export const TIE_DOCUMENT_KINDS = ["opening_balance_doc", "management_account"] as const;

export type TieCandidate = {
  documentId: string;
  filename: string;
  sha256: string;
  documentKind: string;
  filedAt: string;
};

/**
 * This client's ACTIVE, VERIFIED filings of the two admitted kinds, newest first.
 *
 * The verification filter is not cosmetic: `clara._active_document_filing` refuses a tie whose
 * `documents.bytes_verified_at` is null with CLR02, so a row offered here without it is a control
 * that can only fail. Composed rather than joined because `apps/web` reads through PostgREST per
 * relation — `listActiveFilingsForClient` then `listDocumentsByIds` over exactly those ids.
 */
export function tieCandidatesFrom(
  filings: readonly { document_id: string; filed_at: string }[],
  documents: readonly {
    id: string; sha256: string; original_filename: string | null;
    document_kind: string | null; bytes_verified_at: string | null;
  }[],
): TieCandidate[] {
  const filedAt = new Map<string, string>();
  for (const f of filings) {
    const prior = filedAt.get(f.document_id);
    if (!prior || f.filed_at > prior) filedAt.set(f.document_id, f.filed_at);
  }
  const out: TieCandidate[] = [];
  for (const d of documents) {
    if (!filedAt.has(d.id)) continue;
    if (d.bytes_verified_at === null) continue;
    if (!TIE_DOCUMENT_KINDS.includes(d.document_kind as (typeof TIE_DOCUMENT_KINDS)[number])) continue;
    out.push({
      documentId: d.id,
      filename: d.original_filename ?? d.id,
      sha256: d.sha256,
      documentKind: d.document_kind as string,
      filedAt: filedAt.get(d.id) as string,
    });
  }
  return out.sort((a, b) => (a.filedAt < b.filedAt ? 1 : a.filedAt > b.filedAt ? -1 : 0));
}

/** Load this client's tie-document candidates. */
export async function loadTieCandidates(
  clientId: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<TieCandidate[]> {
  const { listActiveFilingsForClient, listDocumentsByIds } = await import("@/lib/documents/reads");
  const filings = await listActiveFilingsForClient(clientId, opts);
  if (filings.length === 0) return [];
  const documents = await listDocumentsByIds(filings.map((f) => f.document_id), opts);
  return tieCandidatesFrom(filings, documents);
}
