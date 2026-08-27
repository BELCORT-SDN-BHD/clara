// Document bytes — the evidence viewer's entry point, ported MECHANISM from
// apps/dashboard/app/shared/reviewApi.ts:278-297's `fetchDocumentBytes` (PIN-DELTA-4:
// the ONE exception to "governance never transits the runtime" — the human sees
// bytes via the runtime's private-bucket signed read path; the browser never holds a
// storage credential). Direct to the runtime (no CORS rework needed for a GET; only
// intake's "begin" call needs the same-origin proxy — see intake.ts's header).

import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";

function runtimeBase(): string {
  return (process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL ?? "").replace(/\/+$/, "");
}

export type DocumentBytes = { blobUrl: string; mime: string; revoke: () => void };

/** Streams one document's bytes as an object URL. The caller MUST call `revoke()`
 *  once done (unmount, tab close) to release it. Throws on any non-2xx — the caller
 *  degrades to an honest "document unavailable" state, never a silent blank. */
export async function fetchDocumentBytes(
  documentId: string,
  opts: { session?: SessionTokenAccessor } = {},
): Promise<DocumentBytes> {
  const session = opts.session ?? sessionTokenAccessor;
  const token = await session.getAccessToken();
  if (!token) throw new Error("not signed in — no live session");
  const res = await fetch(`${runtimeBase()}/api/documents/${encodeURIComponent(documentId)}/bytes`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`document bytes failed (${res.status})`);
  const mime = res.headers.get("content-type") ?? "application/octet-stream";
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, mime, revoke: () => URL.revokeObjectURL(blobUrl) };
}
