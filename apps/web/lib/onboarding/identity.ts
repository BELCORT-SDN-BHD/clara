// #649 AC1 — "is this business already on our books?", asked of the DATABASE before a second
// record is minted.
//
// WHY THERE IS NO PREDICATE IN THIS FILE. The estate's own family predicate
// (`clara.name_family_candidates`, 0103:755) may not be granted to any application role:
// `0103:1225-1239` is a live migration-time census over five application roles that raises CLR10
// if any of them holds EXECUTE on it, repeated at `0126:509` and `0154:551`. So the browser calls
// a SECURITY DEFINER wrapper, `clara.client_identity_candidates`, which runs the predicate as
// `clara_fn_owner` and publishes only its answer. A client-side "does this look like a duplicate"
// heuristic would be a SECOND opinion about one fact — exactly what the wrapper exists to prevent.
//
// THREE ARITIES, AND ONLY ONE OF THEM IS A WALL (owner ruling, 2026-09-15):
//   0      the wrapper returns an empty list; the face proceeds with no interruption.
//   1      the wrapper RETURNS the candidate. The database does not refuse — its own predicate is
//          `count(*) > 1`, so one same-family party has never been "ambiguous" anywhere in this
//          estate — and the face is where the human says "this is a different business".
//   >= 2   the wrapper RAISES CLR10 `name_family_collision`. The refusal is the wall; the face
//          renders it verbatim with its code.
//
// THE REFUSAL CARRIES THE SAME ROWS THE ANSWER WOULD HAVE. `candidatesFromRefusal` reads them off
// the typed detail rather than issuing a second read: a second read of the same fact is how two
// surfaces come to disagree about it, and the refused face must show what the successful one would
// have shown.
//
// A read-flavoured RPC rides `callDoor` as TRANSPORT but is not a governed act — LABELLED here as
// a read, per the house rule `lib/onboarding/coa.ts` states for its own three reads.

import { callDoor, isDoorRefusal } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** The refusal token the DATABASE raises at arity >= 2. It is the AGENT lane's own token
 *  (`0142:451-453`), deliberately reused rather than a second vocabulary for one fact. */
export const NAME_FAMILY_COLLISION = "name_family_collision";

export type ClientIdentityCandidate = {
  /** `client` or `counterparty` — the family predicate unions both (0103:764-771). */
  partyKind: string;
  /** The party's own id. */
  id: string;
  name: string;
  /** `clara.clients.status` for a client candidate; `null` for a counterparty (it has none). */
  status: string | null;
  /** The client this row links to: itself for a client, its owning client for a counterparty.
   *  `null` only if the database could not name one — the row then renders without a link. */
  clientId: string | null;
  /** `exact_name` · `name_family` · `identifier` — WHY this row is being shown. */
  matchReason: string;
};

export type ClientIdentityAnswer = {
  name: string;
  arity: number;
  candidates: ClientIdentityCandidate[];
};

function toCandidate(raw: unknown): ClientIdentityCandidate | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  return {
    partyKind: typeof r.party_kind === "string" ? r.party_kind : "client",
    id: r.id,
    name: r.name,
    status: typeof r.status === "string" ? r.status : null,
    clientId: typeof r.client_id === "string" ? r.client_id : null,
    matchReason: typeof r.match_reason === "string" ? r.match_reason : "name_family",
  };
}

function toCandidates(raw: unknown): ClientIdentityCandidate[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientIdentityCandidate[] = [];
  for (const row of raw) {
    const c = toCandidate(row);
    if (c) out.push(c);
  }
  return out;
}

/** READ (not a governed act): `clara.client_identity_candidates(p_name, p_identifier)`.
 *
 *  RAISES for arity >= 2 — a `DoorRefusal` with `code === 'CLR10'` and
 *  `reason === 'name_family_collision'`. That is not an error to swallow: it is the answer, and
 *  the caller renders it. Every other failure propagates unchanged. */
export async function readClientIdentityCandidates(
  name: string,
  opts: Opts & { identifier?: { kind: string; value: string } | null } = {},
): Promise<ClientIdentityAnswer> {
  const { identifier, ...rest } = opts;
  const raw = await callDoor(
    "client_identity_candidates",
    { p_name: name, p_identifier: identifier ?? null },
    rest,
  );
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const candidates = toCandidates(r.candidates);
  return {
    name: typeof r.name === "string" ? r.name : name,
    // The DATABASE's own arity, never `candidates.length` — a row this module could not read
    // must not silently lower the number the human is told about.
    arity: Number.isInteger(r.arity) ? (r.arity as number) : candidates.length,
    candidates,
  };
}

/** The candidates a `name_family_collision` refusal carried, or `[]` for any other failure.
 *  Reads the typed `detail` the database sent — never a second read. */
export function candidatesFromRefusal(err: unknown): ClientIdentityCandidate[] {
  if (!isDoorRefusal(err)) return [];
  if (err.reason !== NAME_FAMILY_COLLISION) return [];
  return toCandidates((err.detail as Record<string, unknown> | null)?.candidates);
}

/** True when this failure is the arity->=2 wall rather than a transport or authority problem.
 *  The CODE is checked too: a `reason` token arriving on some other CLR would not be this wall. */
export function isNameFamilyCollision(err: unknown): boolean {
  return isDoorRefusal(err) && err.code === "CLR10" && err.reason === NAME_FAMILY_COLLISION;
}
