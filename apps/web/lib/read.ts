// HUMAN-lane reads for the P3 workbench journeys (contract §3.3/§4.3,
// docs/plan/active/frontend-handoff-2026-08-23.md; mohe-grill-rulings-2026-08-27.md
// Q8/Q9 — "workbench-first… direct RLS reads"). A typed PostgREST GET client:
// `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/<relation>`, `Accept-Profile: clara`, the
// session's bearer token. Every journey's read path (documents, drafts, registers,
// receipts, the freeform archive, …) calls `getRows` and names its own view/select
// — this module has no ORM ambitions and no opinion on shape.
//
// HYDRATE-NEVER-TRUST (Q8/Q9): every card re-derives from a read like this on
// mount and after every action — see lib/parts/hooks.ts's `useHydratedPart`,
// whose `loader` is the intended caller of `getRows`. NO OPTIMISTIC UI: this
// module never assumes what a write changed; it only ever reports what a fresh
// read actually returned.
//
// MECHANISM, NOT A SECOND IMPLEMENTATION: the CLR/status classification, the
// abort carve-out (a deliberate cancellation must never be mis-painted as a
// transport failure — including mid-body-read), and the malformed-body handling
// all live in ./wire.ts's `pgrestSelect`, already fixed across two independent-
// review rounds. This module REUSES that primitive rather than re-deriving the
// same judgement logic a second time (AGENTS.md's "spelling is not identity" /
// independent-review laws exist exactly to catch a second, drifting copy of a
// guard) — it only adds the `getRows()` ergonomics P3 journeys asked for, plus a
// `kind` taxonomy layered on top of the status wire.ts already computed.
//
// *** GROUNDING DISCREPANCY, FLAGGED (see the build's final report) ***
// This deliverable's own work order named `./wire.ts` "the AGENT lane… do not
// touch it." That is backwards from wire.ts's own header and from
// lib/parts/hooks.ts's imports (`RefusalError`/`WireError` from "../wire"):
// wire.ts IS ALREADY the HUMAN-lane PostgREST client this deliverable was asked
// to build (`pgrestSelect`/`pgrestRpc`, the CLR/status classification, the abort
// carve-out). The AGENT/SSE lane actually lives in `lib/clara/api.ts` +
// `lib/clara/stream.ts` (sessions/messages/turns/SSE), whose own header says
// HUMAN-lane RPCs are deliberately NOT ported there — "they ride PostgREST via
// lib/wire.ts". wire.ts is left byte-for-byte untouched per the literal
// instruction; this module builds ON it rather than duplicating it — the
// instruction's own spirit (don't re-derive a working, reviewed mechanism) wants
// exactly that.

import { pgrestSelect, WireError, RefusalError } from "./wire";
import { sessionTokenAccessor } from "./session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";

/** Coarse HTTP-status taxonomy a card can branch on without inspecting a raw
 *  number. Derived from `WireError`/`RefusalError`'s own already-classified
 *  `.status` (never from message text — "spelling is not identity"):
 *   - "no_session"      — `getRows` was never even attempted; law 2's absence
 *                          posture (never a fabricated request).
 *   - "unauthenticated" — 401, an expired/invalid session JWT.
 *   - "forbidden"       — 403, an RLS/grant refusal — a real relation exists,
 *                          this role cannot read it. Reads carry no CLR code
 *                          (those only ride RPC writes, see doors.ts).
 *   - "not_found"       — 404: PostgREST's schema cache does not expose this
 *                          relation (dashboard precedent, reportsApi.ts: the
 *                          same signal for "not in the exposed schema" and "no
 *                          grant yet" — both honestly mean "not reachable
 *                          today", rendered explicitly, never a crash).
 *   - "server_error"    — 5xx.
 *   - "transport"       — `fetch` itself failed, or Supabase isn't configured.
 *   - "malformed"       — a 2xx response whose body did not parse as JSON (the
 *                          only path that reaches here with a 2xx status — a
 *                          real HTTP failure never carries one).
 *   - "unexpected"      — any other status (e.g. a raw 400 with no CLR body);
 *                          reads don't expect this, but it renders honestly
 *                          rather than being silently absorbed elsewhere. */
export type ReadErrorKind =
  | "no_session"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "server_error"
  | "transport"
  | "malformed"
  | "unexpected";

/** A read failure, typed — parallel naming to wire.ts's `WireError`, whose
 *  conventions this class stays a genuine SUBTYPE of: `instanceof WireError`
 *  is still true for a `ReadError`, so any existing consumer that classifies
 *  failures via wire.ts's own classes — lib/parts/hooks.ts's `applyFailure`
 *  included — keeps working unchanged against a loader built on `getRows`. */
export class ReadError extends WireError {
  readonly kind: ReadErrorKind;
  constructor(message: string, opts: { status: number | null; pgCode?: string | null; kind: ReadErrorKind }) {
    super(message, opts);
    this.name = "ReadError";
    this.kind = opts.kind;
  }
}

export function isReadError(e: unknown): e is ReadError {
  return e instanceof ReadError;
}

function kindForStatus(status: number | null): ReadErrorKind {
  if (status === null) return "transport";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status >= 200 && status < 300) return "malformed"; // the only way an error carries a 2xx
  if (status >= 500) return "server_error";
  return "unexpected";
}

function toReadError(e: WireError | RefusalError): ReadError {
  return new ReadError(e.message, { status: e.status, pgCode: e.pgCode, kind: kindForStatus(e.status) });
}

/** PostgREST filter fragments, one per column: `{ id: "eq.123", status:
 *  "in.(open,pending)" }` — the raw operator syntax PostgREST itself defines,
 *  passed straight through (no query-builder DSL; "no ORM ambitions"). */
export type ReadFilters = Record<string, string>;

export type GetRowsOptions = {
  /** PostgREST `select=` — a column list, or a resource-embedding expression. */
  select?: string;
  filters?: ReadFilters;
  /** PostgREST `order=`, e.g. `"created_at.desc"`. */
  order?: string;
  limit?: number;
  signal?: AbortSignal;
  /** Defaults to the blessed singleton (./session-accessor) — pass an explicit
   *  accessor only for a test, or a call site with a genuinely different
   *  session (there is normally exactly one live session). */
  session?: SessionTokenAccessor;
};

function buildPathAndQuery(path: string, opts: GetRowsOptions): string {
  const params = new URLSearchParams();
  if (opts.select) params.set("select", opts.select);
  if (opts.filters) for (const [column, expr] of Object.entries(opts.filters)) params.append(column, expr);
  if (opts.order) params.set("order", opts.order);
  if (typeof opts.limit === "number") params.set("limit", String(opts.limit));
  const qs = params.toString();
  if (qs.length === 0) return path;
  return path.includes("?") ? `${path}&${qs}` : `${path}?${qs}`;
}

/** `GET /rest/v1/<path>` as `clara_authenticated`, `Accept-Profile: clara`.
 *  `path` names a relation (table or view) the caller owns — this module only
 *  builds the query string. A `null` token (no live session) throws a
 *  `ReadError` with `kind: "no_session"` WITHOUT ever calling `fetch` — law 2's
 *  posture: absence is a legitimate state, not an error to invent a request
 *  around. An abort (including one landing mid-body-read) re-throws the
 *  platform's own `AbortError` UNCHANGED — never classified as a `ReadError`
 *  — inherited directly from `pgrestSelect`'s own carve-out. */
export async function getRows<T>(path: string, opts: GetRowsOptions = {}): Promise<T[]> {
  const session = opts.session ?? sessionTokenAccessor;
  const token = await session.getAccessToken();
  if (token === null) {
    throw new ReadError(`getRows(${path}): not authenticated — no live session`, { status: null, kind: "no_session" });
  }
  try {
    return await pgrestSelect<T>(buildPathAndQuery(path, opts), session, opts.signal);
  } catch (e) {
    if (e instanceof WireError || e instanceof RefusalError) throw toReadError(e);
    throw e; // an abort (or anything else non-wire) — unchanged, never fabricated into a ReadError
  }
}
