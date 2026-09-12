// THE SOURCE-DOCUMENT DOWNLOAD — "save the original", beside the existing "open the original".
//
// WHY A SECOND AFFORDANCE AT ALL, when a preview already exists. The preview gate admits exactly
// four content types (`VIEWABLE_IN_NEW_TAB`, bytes.ts — PDF and the three rasters) because a
// `blob:` URL inherits this app's origin and a script-bearing type opened there executes as the
// firm member. Every OTHER admitted-at-intake type — an e-invoice XML, a bank OFX, a CSV, the two
// OOXML types, a TIFF or HEIC scan — is a document a person legitimately needs the FILE of and can
// never be shown one of. Before this module the honest answer to them was "read the extraction
// instead", which is true and is not the same thing as having the original.
//
// THE MECHANISM IS NOT A LINK, and that is load-bearing rather than incidental. `lib/download-
// mechanism.ts` carries the full reasoning: the byte route authorises on an `Authorization` header,
// a navigation carries none, so a plain `<a href>` at the runtime path receives this app's own
// 307-to-/login and saves a login page where the client's source document should have been.
// Bytes therefore travel through `fetch` (same-origin proxy, session bearer, content-type checked
// before blobbing) and the save is synthesised from the resulting blob.
//
// ONE TRANSPORT, TWO PURPOSES. This does not open a second route or a second door — it is the SAME
// `GET /api/runtime/documents/:id/bytes` the viewer reads, with `disposition=attachment`, which the
// runtime maps onto the door's `p_purpose='download'`. That is what makes the audit line say
// "download" rather than "preview": the distinction is recorded in `clara._audit` by the door, not
// invented by this surface.

import { requestDocumentBytes, type DocumentBytesOptions } from "./bytes";
import { triggerDownload } from "@/lib/download-mechanism";
import type { SessionTokenAccessor } from "@/lib/session";

/** The extension for a stored MIME, used ONLY to finish a content-address fallback name. Values
 *  mirrored from `packages/runtime/lib/intake.mjs`'s own canonical MIME table (the same table
 *  `ALLOWED_BYTES_CONTENT_TYPES` mirrors, pinned by bytes.test.ts's drift cell) — a type absent
 *  here yields `.bin`, which is honest: this app does not know what to call it. */
const EXTENSION_FOR_MIME: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/tiff": "tiff",
  "image/heic": "heic",
  "application/xml": "xml",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "application/x-ofx": "ofx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** Reduces a proposed name to a BARE FILENAME before it reaches `a.download`.
 *
 *  The two sources this name can come from are the server's own `Content-Disposition` and the
 *  document row's `original_filename` — and the second is UPLOADER-SUPPLIED text stored verbatim,
 *  so a row carrying `../../etc/passwd`, a Windows path, or an embedded newline must not be handed
 *  to the browser as-is. Every path separator is treated as one: the LAST non-empty segment is the
 *  name, which is what "basename" means on both families of path and what a person expects to see
 *  land in their downloads folder. Leading dots go too, so a name cannot become a hidden file or a
 *  bare traversal token. An empty result is returned as `""` rather than as something invented —
 *  the caller falls through to the next source in the precedence, ending at the content address.
 *
 *  The browser sanitises `download` itself; this is the second wall, and it is the cheap one. */
export function safeDownloadName(name: string): string {
  // The escaped range below IS the subject: a control character in an uploader-supplied name must
  // never reach a filename.
  const flattened = name.replace(/[\u0000-\u001f\u007f]/g, "");
  const segments = flattened.split(/[\\/]+/).filter((part) => part.trim().length > 0);
  const base = (segments.length > 0 ? segments[segments.length - 1]! : "").trim();
  const trimmed = base.replace(/^\.+/, "").trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : "";
}

/**
 * THE FILENAME PRECEDENCE, in one place and in this order:
 *
 *   1. `Content-Disposition` — the SERVER's derived name. It is built by the runtime from the same
 *      row, sanitised there against header injection, and it is the only one of the three that was
 *      chosen by the side that actually resolved the object.
 *   2. the row's `original_filename` — what the person uploaded it as, and what they will look for
 *      on their own disk.
 *   3. `<sha256 prefix>.<ext>` — the content address. Never a fabricated pretty name: if neither of
 *      the two above exists, the honest name for these bytes is what they hash to.
 */
export function documentDownloadFilename(opts: {
  disposition: string | null;
  originalFilename: string | null;
  sha256: string;
  mime: string;
}): string {
  const fromServer = opts.disposition ? safeDownloadName(opts.disposition) : "";
  if (fromServer) return fromServer;
  const fromRow = opts.originalFilename ? safeDownloadName(opts.originalFilename) : "";
  if (fromRow) return fromRow;
  const ext = EXTENSION_FOR_MIME[opts.mime] ?? "bin";
  return `${opts.sha256.slice(0, 12)}.${ext}`;
}

export type DocumentDownloadTarget = {
  id: string;
  sha256: string;
  original_filename: string | null;
};

/**
 * Fetch one document's stored bytes and hand them to the browser as a save.
 *
 * Throws the same typed `DocumentBytesError` the preview path throws — one taxonomy, so the state
 * ladder a surface renders is identical whichever control the person pressed. `client` is the
 * page's own client scope and is REQUIRED to be passed by a surface that has one: the door uses it
 * to require an ACTIVE filing to that client, which is what makes a cross-client address answer
 * "not found" rather than serving bytes.
 */
export async function downloadDocument(
  target: DocumentDownloadTarget,
  opts: { client?: string | null; session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<void> {
  const bytesOptions: DocumentBytesOptions = { ...opts, purpose: "download" };
  const { blob, mime, filename } = await requestDocumentBytes(target.id, bytesOptions);
  triggerDownload({
    blob,
    filename: documentDownloadFilename({
      disposition: filename,
      originalFilename: target.original_filename,
      sha256: target.sha256,
      mime,
    }),
  });
}
