// THE BROWSER'S HALF OF EVERY SERVER-GATED DOWNLOAD, in one place.
//
// Two families now save bytes this app fetched rather than navigated to: report/sandbox
// ARTIFACTS (FS-7 echelon 2, 裁-96②) and a client's SOURCE DOCUMENTS (the source-custody lane).
// Both need the identical two mechanics, and neither may use the obvious third one:
//
//   · read the filename the SERVER derived, off `Content-Disposition`;
//   · hand the bytes to the browser as a save, via an object URL and a synthetic anchor click.
//
// THE THIRD ONE — pointing a plain `<a href>` at the runtime path — CANNOT WORK AND MUST NOT BE
// TRIED. The route authorises on an `Authorization: Bearer <session jwt>` header, and a navigation
// carries none; the request arrives unauthenticated, this app's own proxy 307s it to /login, and
// the person receives a login page where their accounts should have been. That is why the bytes
// travel through `fetch` and the save is synthesised here.
//
// EXTRACTED RATHER THAN MIRRORED (the `lib/wire-error-kind.ts` precedent, for the same stated
// reason): the two families were about to hold sha-identical copies of both functions with nothing
// binding them together, so a fix to the RFC 5987 parse — or to the revoke timing below, which is
// a measured browser behaviour and not a style choice — would have had to land twice with a silent
// chance to diverge. This module has no opinion about artifacts or documents, which is what makes
// it the dependency-neutral home for a mechanism both own equally.

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

/**
 * Hand already-fetched bytes to the browser as a save.
 *
 * AN OBJECT URL AND A SYNTHETIC CLICK, revoked on the next tick. Split out from every fetch so the
 * fetch stays testable in Node, where there is no `document`.
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
  // THE ANCHOR AND THE OBJECT URL BOTH OUTLIVE THE CLICK BY A TICK. Removing the element or
  // revoking the URL in the SAME task has historically cancelled an in-flight download in more
  // than one engine, and the failure mode is the worst kind: the click looks like it worked and
  // no file arrives. A tick costs nothing and removes the whole class.
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
}
