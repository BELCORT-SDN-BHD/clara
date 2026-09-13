// The shared HTTP-status → coarse-kind taxonomy read.ts's `ReadError` and
// doors.ts's `DoorError` both classify into (independent-review note N2,
// 2026-08-27): ONE source of truth, so a future addition (e.g. 429 →
// "rate_limited") lands once, not twice with a silent chance to diverge — the
// two call sites were previously sha-identical copies with nothing binding
// them together.
//
// Lives in its own tiny module rather than being re-exported from either
// read.ts or doors.ts: those two are PEER, independently-testable modules
// (a read is not a write and vice versa), and neither should own the other's
// status taxonomy — a shared module with no opinion on reads vs writes is the
// dependency-neutral home.
//
// Derived ONLY from `WireError`/`RefusalError`'s own already-classified
// `.status` (never from message text — AGENTS.md's "spelling is not
// identity"):
//   - "no_session"      — the call was never even attempted; law 2's absence
//                          posture (never a fabricated request). Callers set
//                          this themselves before reaching the wire at all —
//                          `kindForStatus` never produces it.
//   - "unauthenticated" — 401, an expired/invalid session JWT.
//   - "forbidden"       — 403, an RLS/grant refusal.
//   - "not_found"       — 404: PostgREST's schema cache does not expose this
//                          relation/function (dashboard precedent,
//                          reportsApi.ts: the same signal for "not in the
//                          exposed schema" and "no grant yet" — both honestly
//                          mean "not reachable today", rendered explicitly,
//                          never a crash).
//   - "server_error"    — 5xx.
//   - "transport"       — `fetch` itself failed, or Supabase isn't configured.
//   - "malformed"       — a 2xx response whose body did not parse as JSON
//                          (the only path that reaches here with a 2xx status
//                          — a real HTTP failure never carries one).
//   - "unexpected"      — any other status (e.g. a raw 400 with no CLR body).
//
// TWO KINDS ARE BODY-DERIVED, NOT STATUS-DERIVED, and they are the only two
// (the source-custody lane's byte door, `lib/documents/bytes.ts`):
//   - "custody_pending" — HTTP 409 carrying the door's own `custody_pending`
//                          token: the row exists and the caller may read it,
//                          but its bytes are not yet durably verified. A plain
//                          `kindForStatus(409)` says "unexpected", which is a
//                          lie about a state the estate models explicitly.
//   - "integrity"       — HTTP 502 carrying `checksum_mismatch`: the object was
//                          served, and its bytes do not hash to the sha256 the
//                          record pins. NOT a "server_error": retrying reads the
//                          same wrong bytes, so the two must not share a kind or
//                          they would share a recovery affordance.
// `kindForStatus` therefore does NOT produce either — a status alone cannot tell
// a `checksum_mismatch` 502 from a `storage_error` 502. The classifier that reads
// the door's typed body does (bytes.ts's `requestDocumentBytes`), which is why
// this file's own tests are untouched by the addition.

export type WireErrorKind =
  | "no_session"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "custody_pending"
  | "integrity"
  | "server_error"
  | "transport"
  | "malformed"
  | "unexpected";

export function kindForStatus(status: number | null): WireErrorKind {
  if (status === null) return "transport";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status >= 200 && status < 300) return "malformed"; // the only way an error carries a 2xx
  if (status >= 500) return "server_error";
  return "unexpected";
}
