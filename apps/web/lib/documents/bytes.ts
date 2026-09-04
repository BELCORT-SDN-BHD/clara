// Document bytes — the evidence viewer's entry point, ported MECHANISM from
// apps/dashboard/app/shared/reviewApi.ts:278-297's `fetchDocumentBytes` (PIN-DELTA-4:
// the ONE exception to "governance never transits the runtime" — the human sees
// bytes via the runtime's private-bucket signed read path; the browser never holds a
// storage credential). Same-origin via app/api/runtime/[...path]/route.ts
// (independent review 2026-08-27, F1/F2/F3) — no runtimeBase()/NEXT_PUBLIC_
// CLARA_RUNTIME_URL anywhere in this file.

import { sessionTokenAccessor } from "@/lib/session-accessor";
import { safeRuntimeFetch, expectRuntimeOk, RuntimeError } from "./runtime-wire";
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

/** Streams one document's bytes as an object URL. The caller MUST call `revoke()`
 *  once done (unmount, tab close) to release it. Throws a typed `RuntimeError` on
 *  any non-2xx, and a distinct `kind: "malformed"` `RuntimeError` when the response
 *  carries a content-type OUTSIDE the intake allowlist — never blobbed, never
 *  opened. `signal` cancels an in-flight fetch (component unmount). */
export async function fetchDocumentBytes(
  documentId: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<DocumentBytes> {
  const session = opts.session ?? sessionTokenAccessor;
  const token = await session.getAccessToken();
  if (!token) throw new Error("not signed in — no live session");

  const res = await safeRuntimeFetch(
    `/api/runtime/documents/${encodeURIComponent(documentId)}/bytes`,
    { headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "manual", signal: opts.signal },
    "document bytes",
  );
  await expectRuntimeOk(res, "document bytes");

  const mime = (res.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (!ALLOWED_BYTES_CONTENT_TYPES.has(mime)) {
    throw new RuntimeError(`document bytes: unexpected content-type "${mime || "(none)"}"`, { status: res.status, kind: "malformed" });
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, mime, revoke: () => URL.revokeObjectURL(blobUrl) };
}
