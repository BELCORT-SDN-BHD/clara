// The ARTIFACT DOWNLOAD — the browser half of FS-7 echelon 2 (裁-96②, ruled beta-gating by 裁-118).
//
// ONE MECHANISM FOR BOTH ARTIFACT FAMILIES, because there is one door. A sealed
// `clara.report_artifacts` row and a watermarked `clara.sandbox_exports` row are fetched by the
// same call to the same runtime route, which reads the same database gate; nothing here branches
// on which family an id belongs to, and nothing here needs to know.
//
// THE BROWSER NEVER MINTS A URL AND NEVER HOLDS A STORAGE CREDENTIAL. 裁-96②'s words: "server-side
// gate only, client-side signed-URL minting FORBIDDEN". So this module has no storage host, no
// bucket name, no signing key and no storage path — it has an artifact id and a same-origin path.
// The runtime resolves the object and streams it; the storage key never crosses to this side at
// all, because `clara.list_downloadable_artifacts` does not return one.
//
// MECHANISM PORTED FROM `lib/documents/bytes.ts`, deliberately: the evidence viewer already proved
// this shape (same-origin proxy, session bearer, `redirect: "manual"`, a content-type allow-list
// checked BEFORE the body is blobbed). The one difference is what happens at the end — a document
// is DISPLAYED, an artifact is SAVED — and that difference is `triggerDownload` below.

import { sessionTokenAccessor } from "@/lib/session-accessor";
import { safeRuntimeFetch, RuntimeError } from "@/lib/documents/runtime-wire";
import { kindForStatus } from "@/lib/wire-error-kind";
import type { SessionTokenAccessor } from "@/lib/session";

/** What the door can serve. Mirrored as VALUES from `clara._artifact_download_core`'s own
 *  `content_type` projection (pdf → application/pdf, json → application/json; the sandbox family
 *  is pdf by construction). A response outside this set is refused BEFORE it is blobbed — an
 *  unauthenticated redirect-follow landing on an HTML page would otherwise be saved to disk as if
 *  it were the client's financial statements. */
const ALLOWED_ARTIFACT_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/json",
]);

/** A refusal the DOOR made, carrying the database's own typed reason so the surface can render it
 *  verbatim rather than authoring prose about someone else's decision. */
export class ArtifactDownloadRefusal extends Error {
  readonly status: number;
  readonly reason: string | null;
  constructor(message: string, opts: { status: number; reason: string | null }) {
    super(message);
    this.name = "ArtifactDownloadRefusal";
    this.status = opts.status;
    this.reason = opts.reason;
  }
}

export function isArtifactDownloadRefusal(e: unknown): e is ArtifactDownloadRefusal {
  return e instanceof ArtifactDownloadRefusal;
}

/**
 * The filename the SERVER derived, read off `Content-Disposition`.
 *
 * RFC 5987's `filename*` is preferred over the quoted `filename` when both are present, which is
 * the order the spec requires. A header this app cannot parse yields `null` and the caller falls
 * back to its own derived name — never to a string taken from anywhere else in the response.
 */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      const decoded = decodeURIComponent(star[1].trim());
      if (decoded) return decoded;
    } catch {
      // fall through to the quoted form
    }
  }
  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const bare = /filename\s*=\s*([^;]+)/i.exec(header);
  return bare?.[1] ? bare[1].trim() : null;
}

export type ArtifactBytes = { blob: Blob; filename: string; mime: string };

/**
 * Fetch one artifact's bytes through the server-side door.
 *
 * A 403 or a 409 is a REFUSAL the door made and the caller must show; every other non-2xx is a
 * transport-class failure. The two are separate classes because they read differently to a human:
 * "this artifact has been superseded" is an answer, and "the runtime is unreachable" is not.
 */
export async function fetchArtifactBytes(
  artifactId: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal; fallbackFilename?: string } = {},
): Promise<ArtifactBytes> {
  const session = opts.session ?? sessionTokenAccessor;
  const token = await session.getAccessToken();
  if (!token) throw new Error("not signed in — no live session");

  const res = await safeRuntimeFetch(
    `/api/runtime/artifacts/${encodeURIComponent(artifactId)}/bytes`,
    { headers: { authorization: `Bearer ${token}` }, cache: "no-store", redirect: "manual", signal: opts.signal },
    "artifact bytes",
  );

  if (res.type === "opaqueredirect") {
    throw new RuntimeError("artifact bytes: redirected (the session cookie is likely missing or expired)",
      { status: null, kind: "unauthenticated" });
  }
  if (!res.ok) {
    // The DOOR's refusals carry a typed reason; read it before draining, and only for the two
    // statuses the route attaches one to. On a 404 the route deliberately attaches none — every
    // 404 it can emit is byte-identical, so there is nothing to read and nothing to render.
    if (res.status === 403 || res.status === 409) {
      let reason: string | null = null;
      try {
        const body = (await res.json()) as { reason?: unknown };
        reason = typeof body.reason === "string" ? body.reason : null;
      } catch {
        reason = null;
      }
      throw new ArtifactDownloadRefusal("artifact bytes: refused", { status: res.status, reason });
    }
    await res.text().catch(() => "");
    throw new RuntimeError("artifact bytes failed", { status: res.status, kind: kindForStatus(res.status) });
  }

  const mime = (res.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (!ALLOWED_ARTIFACT_CONTENT_TYPES.has(mime)) {
    throw new RuntimeError(`artifact bytes: unexpected content-type "${mime || "(none)"}"`,
      { status: res.status, kind: "malformed" });
  }

  const filename = filenameFromDisposition(res.headers.get("content-disposition"))
    ?? opts.fallbackFilename
    ?? `clara-artifact-${artifactId.slice(0, 8)}.pdf`;
  return { blob: await res.blob(), filename, mime };
}

/**
 * Hand the fetched bytes to the browser as a save.
 *
 * AN OBJECT URL AND A SYNTHETIC CLICK, revoked on the next tick. The alternative — pointing an
 * `<a href>` straight at the runtime path — cannot work and must not be tried: the request needs
 * an `Authorization` header, and a navigation carries none.
 *
 * Split out from the fetch so the fetch stays testable in Node, where there is no `document`.
 */
export function triggerDownload({ blob, filename }: { blob: Blob; filename: string }): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick rather than synchronously: Safari has historically cancelled an
  // in-flight download whose object URL was revoked in the same task.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Fetch and save, the one call a surface makes. */
export async function downloadArtifact(
  artifactId: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal; fallbackFilename?: string } = {},
): Promise<void> {
  triggerDownload(await fetchArtifactBytes(artifactId, opts));
}
