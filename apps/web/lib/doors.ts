// HUMAN-lane governed writes — THE P3 JOURNEYS' WRITE SEAM (contract §3.3/§3.6,
// docs/plan/active/frontend-handoff-2026-08-23.md). A typed PostgREST RPC POST
// client: `POST ${base}/rpc/<fn>`, `Content-Profile: clara`, the session's
// bearer token, a JSON body. Every governed verb a Track-A crude door already
// exposes — approve, sign, retire, void, attest, resolve, dismiss, share, cancel
// — and every one P3 adds (manual-JE compose, close doors, …) posts through
// `callDoor`, never a bespoke fetch.
//
// HYDRATE-NEVER-TRUST BINDS EVERY CALLER (mohe-grill-rulings-2026-08-27.md
// Q8/Q9): `callDoor` reports ONLY what the DB SAID — its resolved value is the
// RPC's own return (often just an id, a revision token, or nothing), NEVER a
// value a caller may paint into UI state as if it were the new truth. Every
// caller re-reads afterward (read.ts's `getRows`, or — the intended shape —
// lib/parts/hooks.ts's `useHydratedPart().act()`, which already reloads
// unconditionally after every write, success or failure). No optimistic UI,
// ever.
//
// NEVER RETRY A REFUSAL: a `DoorRefusal` is the DB's considered, governed
// answer (a CLR code carried as the SQLSTATE) — not a transient failure to back
// off and retry. This module offers no retry helper on purpose; a refusal is
// retired only by the human changing something and trying again as a NEW call.
//
// MECHANISM, NOT A SECOND IMPLEMENTATION — see read.ts's matching header: this
// reuses ./wire.ts's `pgrestRpc` (status-before-CLR ordering, the abort
// carve-out, the malformed/empty-body handling) rather than re-deriving it.
// *** The same grounding discrepancy flagged in read.ts's header applies here:
// wire.ts is already the HUMAN lane, not the AGENT lane. ***

import { pgrestRpc, WireError, isRefusalError } from "./wire";
import { sessionTokenAccessor } from "./session-accessor";
import { kindForStatus, type WireErrorKind } from "./wire-error-kind";
import type { SessionTokenAccessor } from "@/lib/session";

/** A governed refusal — literally wire.ts's `RefusalError` class, re-exported
 *  under the name a door caller reads naturally ("did the door refuse?"). This
 *  is the SAME runtime class, not a lookalike: lib/parts/hooks.ts's
 *  `useHydratedPart().act()` classifies a thrown failure via `instanceof
 *  RefusalError` imported from wire.ts directly — a structurally-similar class
 *  minted here instead would silently stop being recognised there (the CLR
 *  badge a card renders would vanish), which is exactly the "spelling is not
 *  identity" class of bug the review laws exist to catch. Carries `code` (the
 *  CLR/SQLSTATE) + `message` (verbatim, never re-worded) + `reason` (the
 *  DETAIL discriminant, when present) + `status`. */
export { RefusalError as DoorRefusal, isRefusalError as isDoorRefusal } from "./wire";

/** SOURCED from ./wire-error-kind.ts (shared with read.ts's `ReadErrorKind`;
 *  see that module's header for why it lives there rather than being
 *  re-exported from either peer). Re-exported under this name so a doors.ts
 *  consumer keeps its own vocabulary ("a door error's kind"). */
export type DoorErrorKind = WireErrorKind;

/** Every OTHER door failure — transport, auth, or malformed — distinct by
 *  construction from a `DoorRefusal`: this class and `RefusalError` never
 *  overlap (wire.ts's `classifyPgrestFailure` returns exactly one or the
 *  other). A genuine subtype of `WireError` (`instanceof WireError` stays
 *  true), same reasoning as read.ts's `ReadError`. */
export class DoorError extends WireError {
  readonly kind: DoorErrorKind;
  constructor(message: string, opts: { status: number | null; pgCode?: string | null; kind: DoorErrorKind }) {
    super(message, opts);
    this.name = "DoorError";
    this.kind = opts.kind;
  }
}

export function isDoorError(e: unknown): e is DoorError {
  return e instanceof DoorError;
}

export type CallDoorOptions = {
  /** Defaults to the blessed singleton (./session-accessor) — pass an explicit
   *  accessor only for a test, or a call site with a genuinely different
   *  session (there is normally exactly one live session). */
  session?: SessionTokenAccessor;
  signal?: AbortSignal;
};

/** `POST /rest/v1/rpc/<fn>` as `clara_authenticated`, `Content-Profile: clara`.
 *  Resolves the RPC's own jsonb return (or `null` for a void/empty-bodied
 *  governed function) — a REPORT of what the DB did, never a value to paint as
 *  UI state (hydrate-never-trust: the caller re-reads). Throws `DoorRefusal`
 *  (== wire.ts's `RefusalError`) verbatim for a governed CLR refusal — code +
 *  message untouched, never re-worded, never retried by this module. A `null`
 *  token throws `DoorError` with `kind: "no_session"` WITHOUT calling `fetch`.
 *  An abort re-throws unchanged, inherited from `pgrestRpc`'s own carve-out. */
export async function callDoor<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
  opts: CallDoorOptions = {},
): Promise<T> {
  const session = opts.session ?? sessionTokenAccessor;
  // `!token`, not `token === null` (review note N3): matches wire.ts's own
  // `requireToken` guard, so an empty-string token classifies the SAME way
  // here as it eventually would inside `pgrestRpc` — never a mismatched
  // "no_session" here vs "transport" there for the identical input.
  const token = await session.getAccessToken();
  if (!token) {
    throw new DoorError(`${fn}: not authenticated — no live session`, { status: null, kind: "no_session" });
  }
  // TOCTOU note (review note N4, record only): `session.getAccessToken()` is
  // called a SECOND time inside `pgrestRpc`'s own `requireToken` — a token
  // that goes null BETWEEN the two reads (e.g. a sign-out racing this call)
  // surfaces as a plain `WireError("no live session")` from THAT call
  // instead, classified below into `kind: "transport"` (that WireError
  // carries `status: null`) rather than this function's own explicit `kind:
  // "no_session"` — a narrow, low-consequence mislabel (rendered kind
  // differs; the plain-language reason does not), not a security gap. The
  // safety invariant this check exists for — zero governed calls ever
  // attempted without a token — holds regardless of which read observes the
  // null: `pgrestRpc` re-checks before it ever calls `fetch` too.
  try {
    return (await pgrestRpc(fn, args, session, opts.signal)) as T;
  } catch (e) {
    if (isRefusalError(e)) throw e; // the governed refusal, verbatim — never re-wrapped, never masked
    if (e instanceof WireError) {
      throw new DoorError(e.message, { status: e.status, pgCode: e.pgCode, kind: kindForStatus(e.status) });
    }
    throw e; // an abort (or anything else non-wire) — unchanged
  }
}
