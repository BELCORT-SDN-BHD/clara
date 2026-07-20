// Shared wire primitives for the Slice-5 document surfaces (contract §4.5). Two
// lanes, never mixed — the same split the Slice-4 chat page documents:
//   AGENT lane  — the Clara runtime HTTP surface, Bearer = the user's Supabase
//                 session JWT (intake begin) or the short-lived intake upload
//                 token (byte PUT + finalize; see shared/intake.ts).
//   HUMAN lane  — Supabase PostgREST as clara_authenticated (firm-scoped reads of
//                 documents / filings / masked intake+task views + the governed
//                 document writers). Governance NEVER transits the runtime (§4.2).
//
// chat/api.ts keeps its own copies of these helpers (a sealed Slice-4 artifact we
// do not refactor); the NEW document modules share this one home.

export function runtimeBase(): string {
  return (process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL ?? "").replace(/\/+$/, "");
}

export function supabaseBase(): string | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return url.length > 0 ? url : null;
}

export function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function expectJson<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${what} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// HUMAN lane — Supabase PostgREST (session JWT + anon apikey; the clara schema
// must be among the API's exposed schemas — the Profile headers select it).
// ---------------------------------------------------------------------------

export function pgrestHeaders(token: string, forWrite: boolean): Record<string, string> {
  const h: Record<string, string> = {
    authorization: `Bearer ${token}`,
    [forWrite ? "Content-Profile" : "Accept-Profile"]: "clara",
  };
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (anon) h.apikey = anon;
  if (forWrite) h["content-type"] = "application/json";
  return h;
}

/** A typed PostgREST error that surfaces the code + message + the governed CLR
 *  envelope (the JeReviewCard precedent): the CLR code lives in the message (house
 *  shape); the machine reason token lives in the exception DETAIL as
 *  `{"reason": <token>}` (INTERFACE-PINS §2 / §6). Additive over the Slice-5 shape
 *  (`pgCode` stays) so the document surfaces are unaffected. */
export type PgrestError = Error & { pgCode?: string; pgDetails?: string; clr?: string | null; reason?: string | null };

/** The reason discriminant rides in the exception DETAIL as a json object. Defensive parse. */
export function parseReasonToken(details?: string): string | null {
  if (!details) return null;
  try {
    const j = JSON.parse(details) as { reason?: unknown };
    return typeof j.reason === "string" ? j.reason : null;
  } catch {
    return null;
  }
}

/** A typed PostgREST error that surfaces the code + message verbatim (honest copy). */
export async function pgrestError(res: Response, what: string): Promise<PgrestError> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string; hint?: string; details?: string };
  const detail = [body.code, body.message].filter(Boolean).join(" — ");
  const err = new Error(`${what} failed (${res.status})${detail ? `: ${detail}` : ""}`) as PgrestError;
  // Attach the raw governed code so callers can branch on CLR19 etc. honestly.
  err.pgCode = body.code;
  err.pgDetails = body.details;
  err.clr = (body.message ?? "").match(/CLR\d{2}/)?.[0] ?? null;
  err.reason = parseReasonToken(body.details);
  return err;
}

export async function pgrestSelect<T>(pathAndQuery: string, token: string): Promise<T[]> {
  const base = supabaseBase();
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  const res = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    headers: pgrestHeaders(token, false),
    cache: "no-store",
  });
  if (!res.ok) throw await pgrestError(res, "read");
  return (await res.json()) as T[];
}

/** POST a governed function on the human lane. Returns its jsonb result (or null). */
export async function rpc(fn: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  const base = supabaseBase();
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured (governed writers need PostgREST)");
  const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: pgrestHeaders(token, true),
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw await pgrestError(res, fn);
  return res.json().catch(() => null);
}
