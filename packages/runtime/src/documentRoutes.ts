// The document-bytes route (Wave A, PIN-DELTA-4 / contract §5; recut for #620). The dashboard's
// doc_review split-view needs the raw document bytes, and the Documents workbench now needs to
// DOWNLOAD them too, but the browser must NEVER hold a Storage credential and must NEVER be handed
// a signed URL to mint against. This route is the trusted-ingress bridge: a HUMAN session JWT ->
// resolvePrincipal (live membership) -> clara.get_document_for_human_read_v2 (definer,
// runtime-granted, membership- and client-scope-validated, typed refusals) -> stream the bytes from
// Storage with the runtime's clara_storage_docs custody credential. The S6-R11 AGENT boundary is
// unchanged: agents never receive raw bytes; only a human reader reaches this path.
//
// Authz order mirrors the intake routes: validate the JWT FIRST (a 401 needs no DB), then the id
// and client shapes (404), then the disposition (400), then ONE clara_runtime transaction for the
// live principal + the definer read. A nonexistent document, a foreign-firm document, one filed
// under a different client and an unauthorised one all collapse to the SAME 404 (no existence
// oracle — the DB function returns the CLR11 single shape and this route adds no second one).
//
// ============================== WHAT #620 CHANGED, AND WHY ==================================
//   · THE DOOR IS v2. clara.get_document_for_human_read (v1) is still granted and still works;
//     this route calls the SUCCESSOR because v1 has no client scope, no typed custody refusal and
//     writes no egress audit line. v1's retirement is a later migration (#620 decision 9).
//   · `?client=<uuid>` carries the reader's CURRENT client scope. The DATABASE decides whether the
//     document's ACTIVE filing matches it; this route never re-derives that.
//   · `?disposition=attachment` turns a preview into a download — a different Content-Disposition
//     AND a different audited purpose ('download' vs 'preview'), so the ledger records which one
//     the human did.
//   · THE REFUSAL LADDER IS TYPED, because the reader's next action differs per rung: 404 (nothing
//     to see), 403 (you are in no firm), 409 custody_pending (your document, bytes not ready —
//     retry), 400 invalid_input (your request was malformed), 502 checksum_mismatch (the stored
//     bytes no longer match the record — NOT retryable), 502/503 storage_error + a typed reason.
//   · A 401 SAYS ONLY `unauthenticated`. It used to echo validateJwt's internal code (`no_bearer`,
//     `jwt_sub`, `jwt_role`, `jwt_config`), which tells an unauthenticated caller WHICH of the
//     checks their token failed. `documentRouteStatus` still surfaces that code for logs and for
//     its shape test; the WIRE gets one word.
//
// The same-origin proxy (apps/web/app/api/runtime/[...path]/route.ts) forwards content-type,
// content-length, content-disposition, cache-control, x-content-type-options and (added for this
// route) etag. Nothing else this route sets reaches the browser.

import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import express from "express";
import { validateJwt, resolvePrincipal, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { downloadCanonical, StorageError } from "../lib/storage.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True iff `s` is a well-formed document id (exported for the route's authz-shape test). */
export function isDocumentId(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

type DocRead = {
  storage_path?: string;
  mime_type?: string;
  byte_size?: number | string;
  sha256?: string;
  original_filename?: string | null;
  document_kind?: string | null;
  client_id?: string | null;
  firm_id?: string;
};

function shuttingDown(): boolean {
  return !!(globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor?.shuttingDown;
}

/**
 * Map a caught error to a route response. Exported for the shape test.
 *
 * THE DATABASE DECIDES WHICH REFUSAL APPLIES; THIS MAPPER NEVER RE-DERIVES IT. CLR11/CLR03 is the
 * door's single not-found shape (absent / foreign firm / out of client scope), so it is one 404 and
 * every 404 this route emits is byte-identical. CLR13 is the door's STATE conflict — the caller's
 * OWN document whose bytes are not in custody yet — which is a 409 for the same reason the artifact
 * door's CLR10 is: the row is real, the caller may legitimately see it listed, and the fix is to
 * wait rather than to go looking for a missing document. CLR10 is a malformed request (an
 * unsupported purpose), which is a 400.
 *
 * A StorageError carries its OWN status (503 when the runtime was never configured, 502 otherwise)
 * and its own code, so `checksum_mismatch` and `storage_error` stay distinguishable to the reader:
 * one means the stored bytes no longer match the record and retrying is pointless, the other means
 * the object could not be fetched and retrying may work.
 */
export function documentRouteStatus(err: unknown): { status: number; code: string } {
  if (err instanceof AuthError) return { status: err.status, code: err.code };
  if (err instanceof StorageError) return { status: err.status ?? 502, code: err.code };
  const code = (err as { code?: string })?.code;
  if (code === "CLR11" || code === "CLR03") return { status: 404, code: "not_found" };
  if (code === "CLR13") return { status: 409, code: "custody_pending" };
  if (code === "CLR10") return { status: 400, code: "invalid_input" };
  return { status: 500, code: "internal" };
}

/** The door's own typed `reason`, lifted from the refusal's detail. Never re-derived, never
 *  invented: an unparseable detail yields null and the UI falls back to its generic copy.
 *  (The same helper reportRoutes.ts carries; duplicated rather than imported so the two routes'
 *  error shapes can diverge without one of them dragging the other.) */
export function documentRefusalReason(err: unknown): string | null {
  const detail = (err as { detail?: string })?.detail;
  if (typeof detail !== "string" || detail === "") return null;
  try {
    const parsed = JSON.parse(detail) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : null;
  } catch {
    return null;
  }
}

/**
 * RFC 6266 / RFC 5987 Content-Disposition for a filename that came out of the DATABASE.
 *
 * WHY THIS IS NOT `reportRoutes.ts`'s `contentDisposition`, and the sibling is named here so the
 * duplication is deliberate rather than accidental. That one sanitises a filename the ARTIFACT DOOR
 * DERIVED — `clara-report-<kind>-<12 hex>.pdf`, ASCII by construction, built from a family label
 * and a content address — so neutralising `"` and `\` is enough for it and a path separator cannot
 * occur. This one sanitises `clara.documents.original_filename`: a string a human typed on their
 * own machine and uploaded. It can contain `/`, `\`, `..`, CR, LF, NUL and any Unicode at all.
 * Lifting one helper for both would either leave this route under-protected or silently tighten the
 * artifact route's output, and "tighten a shipped header builder as a side effect" is not a change
 * this ticket may make blind. So: same PATTERN (quoted ASCII form + an RFC 5987 `filename*`),
 * stricter INPUT handling, one comment naming the other.
 *
 * THE WALLS, each for a real attack:
 *   · every non-printable and non-ASCII character becomes `_` — this is what makes CR/LF header
 *     injection impossible, because a newline cannot survive into the quoted form at all;
 *   · `"` and `\` become `_` — they are how a value breaks out of the quoted-string;
 *   · `/` and `\` become `_` and every run of dots collapses — so a saved file cannot be steered
 *     out of the browser's download directory by its own name;
 *   · an empty result falls back to the caller-supplied derived name, never to an empty
 *     `filename=""` which some clients treat as "pick your own".
 * The UTF-8 half carries the REAL name (so a Chinese or Malay filename survives) and is
 * percent-encoded including the characters `encodeURIComponent` leaves alone but RFC 5987's
 * `attr-char` does not admit.
 */
export function documentContentDisposition(filename: string, fallback: string): string {
  const ascii = String(filename)
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\/]/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\s]+/, "")
    .trim();
  const safe = ascii === "" ? fallback : ascii.slice(0, 180);
  const encoded = encodeURIComponent(String(filename) === "" ? fallback : String(filename))
    .replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

/** The derived fallback name: the content address's own prefix plus the canonical key's extension
 *  — never a database string, and never empty. */
export function derivedDocumentFilename(sha256: unknown, storagePath: unknown): string {
  const hex = typeof sha256 === "string" && /^[0-9a-f]{64}$/i.test(sha256) ? sha256.slice(0, 12) : "document";
  const ext = /\.([a-z0-9]{1,12})$/i.exec(String(storagePath ?? ""))?.[1];
  return ext ? `${hex}.${ext.toLowerCase()}` : hex;
}

/**
 * READ ONE SCALAR QUERY PARAMETER, OR REFUSE THE REQUEST. Never coerce a shape this route cannot
 * read into that parameter's DEFAULT.
 *
 * `{ok:false}` means the caller sent this parameter in a spelling the route will not act on, and
 * the caller's own refusal status is the answer (404 for `client`, 400 for `disposition`).
 * `{ok:true, value:null}` means genuinely absent (or empty), which is the sanctioned default.
 *
 * TWO HOSTILE SPELLINGS, BOTH MEASURED against express 5.2.1's default "simple" query parser
 * (the probe is $SCRATCH/logs/620-fix1-rt/F7-qparser-probe.log in the fix-round evidence):
 *   · A REPEATED key — `?client=<uuid>&client=<uuid>` — arrives as an ARRAY, so a
 *     `typeof raw === "string"` test is false and the old code read it as "no client scope". The
 *     measured consequence was the real PDF served for a document the caller had explicitly
 *     narrowed AWAY from, under a 200, with an egress receipt recording `args.client = null`.
 *   · A BRACKETED key — `?client[]=<uuid>`, `?client[a]=<uuid>` — arrives under a DIFFERENT key
 *     NAME (`client[]`), so `req.query.client` is undefined and the parameter looked absent. It is
 *     not absent: it is how several HTTP clients serialise a list, so the caller did ask for a
 *     scope. A key that differs from a known parameter only by a bracket suffix is therefore
 *     treated as a MALFORMED SPELLING OF THAT PARAMETER, not as an unrelated query key. Nothing
 *     legitimate sends one, so this refuses no real caller.
 *
 * WHY NOT JUST TAKE THE FIRST ELEMENT OF THE ARRAY. Because the route would then be guessing which
 * of two scopes the caller meant, and the estate's rule for a request it cannot read is to refuse
 * it, not to pick. The client scope is an opt-in narrowing today and omitting it is a sanctioned
 * 200 for any active member — so this is not a privilege escalation. It is the hole that opens the
 * moment the scope is load-bearing, and the receipt is wrong about a real read in the meantime.
 */
export function scalarQueryParam(query: unknown, name: string): { ok: true; value: string | null } | { ok: false } {
  const q = (query ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(q)) {
    if (key !== name && key.startsWith(`${name}[`)) return { ok: false };
  }
  const raw = q[name];
  if (raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  return { ok: true, value: raw === "" ? null : raw };
}

export function documentRoutes(): express.Router {
  const router = express.Router();

  router.get("/api/documents/:id/bytes", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down" });
      return;
    }

    // 1. JWT first (401 without any DB round-trip), and ONE word on the wire.
    let sub: string;
    try {
      ({ sub } = await validateJwt(req.header("authorization")));
    } catch {
      res.status(401).json({ error: "unauthenticated", message: "unauthorized" });
      return;
    }

    // 2. Id shape, then the client scope's shape (both the indistinguishable 404). A malformed
    // `client` is a 404 rather than a 400 deliberately: a 400 here would tell a caller that the
    // DOCUMENT id was fine, which is exactly the oracle the single 404 exists to close.
    const documentId = req.params.id;
    const clientQuery = scalarQueryParam(req.query, "client");
    const client = clientQuery.ok ? clientQuery.value : null;
    // A SHAPE THIS ROUTE CANNOT READ IS A REFUSAL, NOT A DEFAULT. `!clientQuery.ok` covers the
    // repeated and bracketed spellings `scalarQueryParam` documents; it joins the same 404 as a
    // malformed uuid, so the byte-identical set does not grow a tenth shape.
    if (!clientQuery.ok || !isDocumentId(documentId) || (client !== null && !isDocumentId(client))) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }

    // 3. The disposition. It is the caller's OWN request shape, so a bad one is a 400 — and it is
    // decided BEFORE any read, so "bad disposition" answers 400 for a real id and a fabricated one
    // alike and cannot be used to probe existence.
    const dispositionQuery = scalarQueryParam(req.query, "disposition");
    const disposition = dispositionQuery.ok ? (dispositionQuery.value ?? "inline") : null;
    // The same refusal for the same two spellings, at this parameter's OWN status. It matters more
    // here than it reads: `inline` is the default, so accepting `?disposition[]=attachment` as
    // absent would serve a document INLINE — and audit it as a `preview` — to a caller who asked
    // for a download.
    if (disposition !== "inline" && disposition !== "attachment") {
      res.status(400).json({ error: "invalid_input", message: "disposition must be inline or attachment" });
      return;
    }
    const purpose = disposition === "attachment" ? "download" : "preview";

    // 4. Live principal + the definer document read (one clara_runtime txn). The door writes the
    // egress audit line INSIDE this transaction, so a committed read is a receipted read.
    let doc: DocRead;
    try {
      doc = await withRuntime(async (c) => {
        const principal = await resolvePrincipal(c, sub);
        const r = await c.query(
          "select clara.get_document_for_human_read_v2($1::uuid, $2::uuid, $3::uuid, $4::text) as d",
          [documentId, principal.sub, client, purpose]);
        const row = (r.rows[0]?.d ?? null) as DocRead | null;
        if (!row || !row.storage_path || !row.sha256) {
          // The door RAISES rather than returning null, so this is the belt: a null here would mean
          // the door changed shape, and serving "no bytes, status 200" would be worse than a 404.
          throw new AuthError(404, "not_found", "not found");
        }
        return row;
      });
    } catch (err) {
      const m = documentRouteStatus(err);
      // THE TYPED REASON RIDES ALONG ON EVERYTHING BUT A 404. On 404 it is suppressed so that
      // EVERY 404 this route can emit is byte-identical — a malformed id, an unknown id, a
      // foreign-firm id and a wrong-client id must not be tellable apart, and a body that carried
      // a reason on some of them would tell them apart. Built by ASSIGNMENT, never by a conditional
      // spread: the parts-parity gate walks object literals in this package and fails closed on a
      // spread it cannot evaluate (the reasoning reportRoutes.ts records at its own refusal body).
      const reason = m.status === 404 ? null : documentRefusalReason(err);
      const body: { error: string; message: string; reason?: string } = {
        error: m.code,
        message: m.status === 404 ? "not found" : "document unavailable",
      };
      if (reason) body.reason = reason;
      res.status(m.status).json(body);
      return;
    }

    // 5. Stream the bytes from Storage with the custody credential. Download-then-stream, because
    // the canonical read re-hashes the object against the ROW's sha256 en route — a tampered or
    // substituted object never reaches the client, and a mismatch is a 502 rather than a partially
    // written download the browser would happily save.
    const tmp = join(tmpdir(), `clara-docbytes-${randomUUID()}`);
    try {
      await downloadCanonical(doc.storage_path as string, tmp, doc.sha256);
      const fallbackName = derivedDocumentFilename(doc.sha256, doc.storage_path);
      res.status(200).set({
        "Content-Type": String(doc.mime_type || "application/octet-stream"),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // THE ETag IS THE CONTENT ADDRESS, not a cache token. The response is `private, no-store`;
        // what this header gives the reader is the estate's own integrity receipt — the sha256 the
        // bytes were just verified against — in a form a client can compare without re-hashing.
        ETag: `"${String(doc.sha256)}"`,
        "Content-Disposition": disposition === "attachment"
          ? documentContentDisposition(String(doc.original_filename ?? ""), fallbackName)
          : "inline",
      });
      if (doc.byte_size != null) res.set("Content-Length", String(doc.byte_size));
      // ONE await THAT SETTLES ON EVERY OUTCOME, including the client going away.
      //
      // The hand-rolled promise this replaced resolved on the read stream's `end` and rejected on
      // its `error`, and destroyed the stream when the RESPONSE closed — but destroying a stream
      // emits `close`, not `end`, so an aborted transfer settled NOTHING. The await never returned,
      // the `finally` below never ran, and the per-request spool — a byte-identical decrypted copy
      // of the reader's own document — stayed in os.tmpdir() with no owner and no sweeper (this
      // route is the only producer of a clara-docbytes-* file in the repository). #620 is the change
      // that makes that abort routine: the viewer overlay's cleanup aborts the in-flight read on
      // every document and page switch.
      //
      // `pipeline` settles on all three: the source's end, the source's error, and the destination
      // closing early (ERR_STREAM_PREMATURE_CLOSE), and it destroys the other half in each case.
      // The catch below then does what it already did — headers are out, so it destroys the
      // response — and the `finally` unlinks. Measured by document-route-e2e's E2.13.
      await pipeline(createReadStream(tmp), res);
    } catch (err) {
      // `res.destroyed` IS PART OF THE CONDITION, not decoration. When the client aborts BEFORE
      // the first byte is written, the headers set above are still only staged — `headersSent` is
      // false — yet the socket is gone, so the refusal branch would be writing JSON into a
      // destroyed response. There is nobody left to answer; the spool is what still matters.
      if (!res.headersSent && !res.destroyed) {
        const m = documentRouteStatus(err);
        const reason = (err as { reason?: string })?.reason;
        const body: { error: string; message: string; reason?: string } = {
          error: m.code,
          message: "document unavailable",
        };
        // The STORAGE layer's own typed reason (object_missing / credential_refused / unavailable /
        // unconfigured / invalid_key), so the reader's UI can say "re-upload" rather than "retry"
        // when retrying cannot help. Never the vendor's body text, which stays in the server log.
        if (typeof reason === "string" && reason !== "") body.reason = reason;
        res.status(m.status).json(body);
      } else {
        res.destroy();
      }
    } finally {
      await rm(tmp, { force: true }).catch(() => {});
    }
  });

  return router;
}
