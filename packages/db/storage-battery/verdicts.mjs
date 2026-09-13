// #620 AC4 — the response-verdict vocabulary the battery's denial cells assert with.
//
// WHY THIS IS ITS OWN MODULE. `run.mjs` boots a multi-container vendor stack before it can measure
// anything, so nothing inside it can be exercised without Docker. These functions are the part of
// the battery that decides PASS from FAIL, and they are pure: a response shape in, a verdict out.
// Keeping them here lets a reviewer feed them a FABRICATED response — a 500 with no wrapped status,
// a wrapped 409 duplicate, a wrapped 403 denial — and watch the verdicts differ, with no stack
// booted and no log line taken on trust.
//
// THE SHAPE THEY READ. Supabase Storage answers a policy denial with outer HTTP 400 and the real
// status wrapped in the JSON body:
//   {"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}
// A duplicate under `x-upsert:false` is the SAME outer 400 with `statusCode:"409"` — the branch
// `packages/runtime/lib/storage.mjs` reads as idempotent success. A missing object is the same
// outer 400 with `statusCode:"404"`. So `!response.ok` on its own cannot tell a denial from a
// duplicate, from an absence, from a provider outage: `HTTP 400` is all four. That is why every
// denial cell in this battery names the status it expects instead of asserting a boolean.

/**
 * The status Supabase wrapped in the body, as a number, or `null` when the body carries none
 * (a fabricated 500, an HTML error page, a proxy timeout). `statusCode` arrives as a STRING.
 */
export function innerStatus(res) {
  let inner = null;
  try {
    inner = JSON.parse(res?.body ?? "");
  } catch {
    return null;
  }
  if (inner === null || typeof inner !== "object") return null;
  const raw = inner.statusCode;
  if (raw === undefined || raw === null) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * What the response MEANS: the wrapped status when there is one, else the outer HTTP status.
 * A response with no wrapped status is therefore judged on its own status and can never be
 * mistaken for a policy answer it never carried.
 */
export function effectiveStatus(res) {
  return innerStatus(res) ?? res?.status ?? null;
}

/** `HTTP <outer>[/<inner>]` — the legible form for a log line. */
export function refusal(res) {
  const inner = innerStatus(res);
  return `HTTP ${res?.status}${inner === null ? "" : `/${inner}`}`;
}

/**
 * A refusal carrying one of `allowed` as its effective status. Used for every denial cell:
 * 403 for a policy/permission denial, 403-or-404 for a denied read (the vendor answers a read
 * the policy hides as "not found", and both are lawful refusals of the same request).
 *
 * Deliberately NOT satisfied by: an `ok` response; a wrapped 409 (a duplicate is the write
 * landing, not the policy refusing); a bare 500 (an outage is not a denial).
 */
export function deniedWith(res, allowed) {
  if (!res || res.ok) return false;
  const effective = effectiveStatus(res);
  return allowed.includes(effective);
}

/**
 * ABSENCE, asserted rather than inferred — for a read made with the stack's PRIVILEGED service
 * key, where nothing is hidden by policy: only "not found" proves the object was never created.
 * A 403 here would mean the probe itself was refused and absence stays unmeasured, so it is not
 * accepted.
 */
export function absent(res) {
  if (!res || res.ok) return false;
  return effectiveStatus(res) === 404;
}

/**
 * The POST-REQUEST MARKER for `putWikiCanonical`. `safeWikiKey` validates the key BEFORE any
 * fetch and throws the same `StorageError` class as a wire refusal does, so "it threw" proves
 * nothing about whether Storage was ever asked. Only the post-fetch branch carries the HTTP
 * status in its message (`wiki storage upload failed (<status>)`); return that status, or `null`
 * when the failure happened before the request and the cell has measured no boundary at all.
 */
export function wikiWireStatus(message) {
  const found = /wiki storage upload failed \((\d{3})\)/.exec(String(message ?? ""));
  return found ? Number(found[1]) : null;
}
