// Document bytes — the evidence viewer's entry point, ported MECHANISM from
// apps/dashboard/app/shared/reviewApi.ts:278-297's `fetchDocumentBytes` (PIN-DELTA-4:
// the ONE exception to "governance never transits the runtime" — the human sees
// bytes via the runtime's private-bucket signed read path; the browser never holds a
// storage credential). Same-origin via app/api/runtime/[...path]/route.ts
// (independent review 2026-08-27, F1/F2/F3) — no runtimeBase()/NEXT_PUBLIC_
// CLARA_RUNTIME_URL anywhere in this file.

import { sessionTokenAccessor } from "@/lib/session-accessor";
import { safeRuntimeFetch, RuntimeError } from "./runtime-wire";
import { kindForStatus, type WireErrorKind } from "@/lib/wire-error-kind";
import { filenameFromDisposition } from "@/lib/download-mechanism";
import type { SessionTokenAccessor } from "@/lib/session";

/** The runtime's OWN intake MIME allowlist (packages/runtime/lib/intake.mjs:33-51's
 *  `MIME_ALIASES` canonical values), plus `application/octet-stream` — the bytes
 *  route's own fallback content-type when a document's stored `mime_type` is null
 *  (packages/runtime/src/documentRoutes.ts:96-97). A response whose content-type is
 *  NOT in this set is refused BEFORE blobbing (independent review 2026-08-27: an
 *  unauthenticated redirect-follow landing on a `text/html` login page would
 *  otherwise report `ok:true` and open as if it were the document). Values only,
 *  mirrored deliberately (a literal list, not logic) rather than importing the
 *  runtime package — apps/web never depends on packages/runtime at build time. */
export const ALLOWED_BYTES_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/tiff", "image/heic",
  "application/xml", "text/csv", "text/tab-separated-values", "application/x-ofx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
]);

/** C-07 / 裁-175 — THE VIEWER GATE, and it is NOT the fetch gate above.
 *
 *  `ALLOWED_BYTES_CONTENT_TYPES` is a mirror of the runtime's INTAKE list: what
 *  may be STORED. It was also, wrongly, the only check standing between an
 *  uploaded file and `tab.location.href = blob:…` — and a `blob:` URL inherits
 *  the CREATING page's origin, so an uploaded `application/xml` carrying an
 *  `<?xml-stylesheet?>` with inline script executed as the opening firm member,
 *  in apps/web's own origin, with their session. MyInvois e-invoices ARE XML.
 *
 *  This is the second, strictly narrower list: the types a browser renders
 *  inline as a DOCUMENT and that carry no script vector — PDF (rendered by the
 *  browser's own sandboxed viewer) and the three raster images. Deliberately
 *  ABSENT, each for its own reason:
 *    * `application/xml` — the vector itself (XSLT/stylesheet PI, inline script);
 *    * `image/svg+xml` — not admitted at intake either, and named here so a
 *      future widening of the intake list cannot silently reach this one: SVG is
 *      an XML script host, never a "raster image";
 *    * `image/tiff`, `image/heic` — no browser renders them inline; the tab is a
 *      download prompt or a blank page, i.e. a dead link either way;
 *    * `text/csv`, `text/tab-separated-values`, `application/x-ofx`, both OOXML
 *      types — same: not inline-renderable;
 *    * `application/octet-stream` — the bytes route's null-mime fallback. It is
 *      the one entry that makes the FETCH list not a real type gate, so it can
 *      never be the basis for a navigation.
 *
 *  Enforced in `openDocumentInNewTab` (open-in-new-tab.ts) BEFORE the tab is
 *  navigated — in the LIBRARY, not in a component, so a second caller cannot
 *  bypass it. `lib/documents/bytes.test.ts`'s drift cell pins all THREE lists
 *  (this one, the fetch list, and the runtime's own intake table) against each
 *  other in one place: the fetch list was already a hand-mirrored copy with no
 *  guard on either side ("spelling is not identity").
 *
 *  NOT DONE IN THIS PASS, and named so the gap is visible: this keys on the
 *  RESPONSE content-type, which the bytes route sets from the uploader-declared
 *  `documents.mime_type`. No magic-byte sniff is performed here. The runtime
 *  compares declared against detected at intake (packages/runtime/lib/
 *  intake.mjs:44-47), so declared == detected at STORAGE time — that is the
 *  property this gate leans on, and it is the property to re-verify before
 *  widening this set. */
export const VIEWABLE_IN_NEW_TAB: ReadonlySet<string> = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp",
]);

export type DocumentBytes = { blobUrl: string; mime: string; revoke: () => void };

/** Which of the door's two admitted purposes this read is. It travels as the
 *  route's `disposition` query parameter (`inline` | `attachment`), which the
 *  runtime maps onto the v2 door's `p_purpose` (`preview` | `download`) — so the
 *  word a caller uses here is the word the AUDIT LINE records, not a UI label. */
export type DocumentBytesPurpose = "preview" | "download";

export type DocumentBytesOptions = {
  /** The page's client scope. Present ⇒ the door additionally requires an ACTIVE
   *  filing of this document to THAT client; absent ⇒ firm-membership only.
   *  Never guessed from the document row — the SURFACE knows which client the
   *  reader is standing in, the row does not. */
  client?: string | null;
  purpose?: DocumentBytesPurpose;
  session?: SessionTokenAccessor;
  signal?: AbortSignal;
};

/**
 * A failure of the byte door, carrying the ROUTE'S OWN typed tokens beside the
 * coarse wire kind.
 *
 * `error` is the route's `{error: "…"}` discriminant (`unauthenticated`,
 * `no_membership`, `not_found`, `custody_pending`, `invalid_input`,
 * `checksum_mismatch`, `storage_error`); `reason` is the second-level token a
 * `storage_error` carries (`object_missing` | `credential_refused` |
 * `unavailable` | `unconfigured`). Both are READ, never rendered raw: they pick
 * which honest sentence this app already owns. Vendor body text never reaches
 * here at all — `classifyDocumentBytesFailure` parses only these two fields and
 * drains the rest.
 */
export class DocumentBytesError extends RuntimeError {
  readonly error: string | null;
  readonly reason: string | null;
  constructor(message: string, opts: { status: number | null; kind: WireErrorKind; error?: string | null; reason?: string | null }) {
    super(message, { status: opts.status, kind: opts.kind });
    this.name = "DocumentBytesError";
    this.error = opts.error ?? null;
    this.reason = opts.reason ?? null;
  }
}

export function isDocumentBytesError(e: unknown): e is DocumentBytesError {
  return e instanceof DocumentBytesError;
}

/**
 * THE UI STATE LADDER for a source read — one name per state a human is told
 * apart, which is NOT the same vocabulary as the coarse wire kind:
 *
 *   unauthenticated     the session expired mid-read (401, or the app's own
 *                        307-to-/login surfacing as an opaqueredirect). The
 *                        "expired link" of the acceptance criteria: there is no
 *                        signed URL in this estate, so the only thing that can
 *                        expire is the READER's session.
 *   denied              403 — this caller holds no live membership in the
 *                        document's firm. No retry: retrying changes nothing.
 *   not_found           404 — absent, another firm's, or not filed to THIS
 *                        client. One indistinguishable shape, deliberately (no
 *                        existence oracle), so the copy says "not available in
 *                        this client" rather than claiming the row is gone.
 *   custody_pending     409 — the row exists and may be read, but its bytes are
 *                        not durably verified yet. Retry is honest: custody
 *                        completes on its own.
 *   storage_unavailable 502/503 `storage_error` — object store unreachable or
 *                        unconfigured. Retry.
 *   integrity           502 `checksum_mismatch` — the stored bytes no longer
 *                        hash to the record's sha256. NO retry: the next read
 *                        returns the same wrong bytes.
 *   malformed           a 2xx whose content-type is outside the intake list.
 *   transport           `fetch` itself failed.
 *   server_error        anything else the runtime answered with.
 */
export type DocumentSourceState =
  | "unauthenticated"
  | "denied"
  | "not_found"
  | "custody_pending"
  | "storage_unavailable"
  | "integrity"
  | "malformed"
  | "transport"
  | "server_error";

/** The states where a second attempt can genuinely answer differently. Withheld
 *  from `denied`, `not_found`, `integrity` and `malformed` — for each of those a
 *  Retry button would be a control that cannot work, which is the failure this
 *  surface's own DoorFeedback gap was measured to have in the other direction
 *  (no retry anywhere at all). */
export const RETRYABLE_DOCUMENT_SOURCE_STATES: ReadonlySet<DocumentSourceState> = new Set<DocumentSourceState>([
  "custody_pending", "storage_unavailable", "transport", "server_error",
]);

export function isRetryableDocumentSourceState(state: DocumentSourceState): boolean {
  return RETRYABLE_DOCUMENT_SOURCE_STATES.has(state);
}

/** Maps a thrown failure onto the ladder above. Anything that is not a typed
 *  wire failure at all (a `TypeError` from inside a caller, say) reports
 *  `server_error` rather than being silently dropped — an unclassifiable failure
 *  is still a failure the reader must see. */
export function documentSourceStateOf(e: unknown): DocumentSourceState {
  if (!(e instanceof RuntimeError)) return "server_error";
  const error = e instanceof DocumentBytesError ? e.error : null;
  switch (e.kind) {
    case "no_session":
    case "unauthenticated":
      return "unauthenticated";
    case "forbidden":
      return "denied";
    case "not_found":
      return "not_found";
    case "custody_pending":
      return "custody_pending";
    case "integrity":
      return "integrity";
    case "malformed":
      return "malformed";
    case "transport":
      return "transport";
    case "server_error":
    case "unexpected":
      // KEYED ON THE ROUTE'S OWN TOKEN, never on the status. A 502 is not by
      // itself a storage verdict — the same-origin proxy answers 502
      // `runtime_redirected` when the runtime redirects, which is a runtime
      // failure and must not be reported to a human as "the document store is
      // unavailable". Both are retryable, so only the SENTENCE differs; that is
      // exactly why it must not be guessed.
      return error === "storage_error" ? "storage_unavailable" : "server_error";
  }
}

/** The next-intl key namespace for the ladder — `ClientDocuments.sourceState.*`.
 *  A KEY, never English text (STYLE law; copy.ts's own `readErrorKey` precedent). */
export function documentSourceStateKey(state: DocumentSourceState): string {
  return `sourceState.${state}`;
}

/** The route path + query this read addresses. Split out so both the transport
 *  test and the download sibling assert the SAME builder rather than two
 *  hand-written strings. `disposition` is OMITTED for a preview: `inline` is the
 *  route's own default, and writing it would change every existing call's URL
 *  for no behavioural difference. */
export function documentBytesPath(documentId: string, opts: Pick<DocumentBytesOptions, "client" | "purpose"> = {}): string {
  const qs = new URLSearchParams();
  if (opts.client) qs.set("client", opts.client);
  if (opts.purpose === "download") qs.set("disposition", "attachment");
  const query = qs.toString();
  return `/api/runtime/documents/${encodeURIComponent(documentId)}/bytes${query ? `?${query}` : ""}`;
}

/** Reads the door's two typed tokens off a failed response and throws. The body
 *  is ALWAYS consumed (a route handler upstream may otherwise leave the
 *  connection hanging) and never quoted into the message. */
async function classifyDocumentBytesFailure(res: Response, what: string): Promise<never> {
  let error: string | null = null;
  let reason: string | null = null;
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/json")) {
    try {
      const body = (await res.json()) as { error?: unknown; reason?: unknown };
      if (typeof body.error === "string") error = body.error;
      if (typeof body.reason === "string") reason = body.reason;
    } catch {
      // A body that does not parse is no evidence — fall through to status alone.
    }
  } else {
    await res.text().catch(() => "");
  }

  let kind: WireErrorKind = kindForStatus(res.status);
  if (res.status === 409 && error === "custody_pending") kind = "custody_pending";
  if (res.status === 502 && error === "checksum_mismatch") kind = "integrity";

  throw new DocumentBytesError(`${what} failed`, { status: res.status, kind, error, reason });
}

export type DocumentBytesBody = {
  blob: Blob;
  mime: string;
  /** The filename the SERVER derived, off `Content-Disposition`, or `null` when
   *  the header is absent or unparsable. Never a name taken from the body. */
  filename: string | null;
};

/**
 * THE ONE TRANSPORT for a document's stored bytes, shared by the preview (which
 * mints an object URL) and the download (which hands the blob to a save).
 *
 * Same-origin through `app/api/runtime/[...path]/route.ts`, session bearer,
 * `redirect: "manual"` so this app's own auth 307 surfaces as an opaqueredirect
 * rather than being followed into a 200 `text/html` login page, and the intake
 * content-type allow-list checked BEFORE the body is blobbed.
 */
export async function requestDocumentBytes(
  documentId: string,
  opts: DocumentBytesOptions = {},
): Promise<DocumentBytesBody> {
  const session = opts.session ?? sessionTokenAccessor;
  const token = await session.getAccessToken();
  if (!token) throw new Error("not signed in — no live session");

  const res = await safeRuntimeFetch(
    documentBytesPath(documentId, opts),
    { headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "manual", signal: opts.signal },
    "document bytes",
  );

  if (res.type === "opaqueredirect") {
    throw new DocumentBytesError("document bytes: redirected (the session cookie is likely missing or expired)",
      { status: null, kind: "unauthenticated" });
  }
  if (!res.ok) await classifyDocumentBytesFailure(res, "document bytes");

  const mime = (res.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (!ALLOWED_BYTES_CONTENT_TYPES.has(mime)) {
    throw new DocumentBytesError(`document bytes: unexpected content-type "${mime || "(none)"}"`,
      { status: res.status, kind: "malformed" });
  }

  return {
    blob: await res.blob(),
    mime,
    filename: filenameFromDisposition(res.headers.get("content-disposition")),
  };
}

/** Streams one document's bytes as an object URL. The caller MUST call `revoke()`
 *  once done (unmount, tab close) to release it. Throws a typed
 *  `DocumentBytesError` on any non-2xx, and a distinct `kind: "malformed"` one
 *  when the response carries a content-type OUTSIDE the intake allowlist — never
 *  blobbed, never opened. `signal` cancels an in-flight fetch (component
 *  unmount). */
export async function fetchDocumentBytes(
  documentId: string,
  opts: DocumentBytesOptions = {},
): Promise<DocumentBytes> {
  const { blob, mime } = await requestDocumentBytes(documentId, opts);
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, mime, revoke: () => URL.revokeObjectURL(blobUrl) };
}
