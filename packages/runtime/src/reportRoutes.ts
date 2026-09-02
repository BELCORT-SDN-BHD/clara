// The ARTIFACT-BYTES route (FS-7 echelon 2; 裁-96② and 裁-118). The Reports tab needs the actual
// PDF of a sealed report artifact or of a watermarked sandbox export, and the browser must NEVER
// hold a Storage credential and must NEVER be handed a signed URL to mint against. This route is
// the trusted-ingress bridge, and it is `documentRoutes.ts`'s shape deliberately, line for line
// where the two agree: a HUMAN session JWT -> resolvePrincipal (live membership) ->
// clara.get_artifact_for_human_read (definer, clara_runtime-granted, membership- and
// rank-validated, ONE not-found shape) -> stream the bytes with the runtime's storage custody
// credential, verifying the content address en route.
//
// WHY IT IS A SEPARATE FILE AND NOT AN ADDED PATH IN documentRoutes.ts. That router's whole
// subject is clara.documents; this one's is the two ARTIFACT relations, which have a different
// door, a different storage prefix, a different disposition (an artifact is SAVED, a document is
// previewed inline) and a different audit surface. Sharing the file would have meant one router
// whose error mapper had to know which relation it was serving.
//
// AUTHZ ORDER, mirroring the intake and document routes: validate the JWT FIRST (a 401 needs no
// DB), then the id shape (404), then ONE clara_runtime transaction for the live principal plus the
// definer read. A nonexistent artifact, a foreign-firm artifact and an under-ranked caller's
// artifact do NOT all collapse here — the DATABASE decides which collapse: it returns CLR11 as one
// indistinguishable shape for absent/foreign/stray, and CLR04 for a caller below the read floor,
// and this route maps the first to 404 and the second to 403 rather than inventing a third answer.
//
// THE DOWNLOAD IS A HUMAN-ONLY PATH. The agent boundary is unchanged: no wake role holds EXECUTE
// on the door, so there is no code path by which an agent reaches raw artifact bytes.

import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import express from "express";
import { validateJwt, resolvePrincipal, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { downloadArtifactCanonical, StorageError } from "../lib/storage.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True iff `s` is a well-formed artifact id (exported for the route's authz-shape test). */
export function isArtifactId(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

type ArtifactRead = {
  family?: string;
  storage_key?: string;
  sha256?: string;
  byte_size?: number | string;
  content_type?: string;
  filename?: string;
};

function shuttingDown(): boolean {
  return !!(globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor?.shuttingDown;
}

/**
 * Map a caught error to a route response. Exported for the shape test.
 *
 * CLR04 IS 403, NOT 404, AND THAT IS A DELIBERATE DIVERGENCE from documentRoutes' single collapse.
 * The document door has one refusal (CLR11) and therefore one status. This door has two, and they
 * mean different things to the person on the other end: CLR11 is "there is no such artifact for
 * you" — which must stay indistinguishable from "there is no such artifact at all", so it is 404 —
 * while CLR04 is "this artifact exists in your firm and your role is below the read floor", which
 * the caller is entitled to be told, because the fix is a role change and a 404 would send them
 * looking for a missing document instead. The DATABASE decides which of the two applies; this
 * mapper never re-derives it.
 */
export function artifactRouteStatus(err: unknown): { status: number; code: string } {
  if (err instanceof AuthError) return { status: err.status, code: err.code };
  const code = (err as { code?: string })?.code;
  if (code === "CLR11" || code === "CLR03") return { status: 404, code: "not_found" };
  if (code === "CLR04") return { status: 403, code: "forbidden" };
  // CLR10 is the door's "this artifact exists and is not downloadable in its current state"
  // (superseded, unfinished, watermark unproven). 409 rather than 404: the row is real and the
  // caller may legitimately see it in the Reports tab; the Conflict says the STATE refused, and
  // the typed reason travels with it so the UI can render the database's own word.
  if (code === "CLR10") return { status: 409, code: "not_downloadable" };
  if (err instanceof StorageError) return { status: 502, code: "storage_error" };
  return { status: 500, code: "internal" };
}

/** The door's own typed `reason`, lifted from the refusal's detail. Never re-derived, never
 *  invented: an unparseable detail yields null and the UI falls back to its generic copy. */
export function refusalReason(err: unknown): string | null {
  const detail = (err as { detail?: string })?.detail;
  if (typeof detail !== "string" || detail === "") return null;
  try {
    const parsed = JSON.parse(detail) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : null;
  } catch {
    return null;
  }
}

/** RFC 6266 / RFC 5987 disposition for a filename this route DERIVED (ASCII by construction —
 *  the door builds it from a family label and hex — so the quoted form is already safe; the
 *  `filename*` form is emitted anyway so a future non-ASCII label cannot silently break it). */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function reportRoutes(): express.Router {
  const router = express.Router();

  router.get("/api/artifacts/:id/bytes", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down" });
      return;
    }

    // 1. JWT first (401 without any DB round-trip).
    let sub: string;
    try {
      ({ sub } = await validateJwt(req.header("authorization")));
    } catch (err) {
      const m = artifactRouteStatus(err);
      res.status(m.status).json({ error: m.code, message: m.status === 404 ? "not found" : "unauthorized" });
      return;
    }

    // 2. Id shape (indistinguishable 404).
    const artifactId = req.params.id;
    if (!isArtifactId(artifactId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }

    // 3. Live principal + the definer artifact read (one clara_runtime txn). The door writes the
    // egress audit line INSIDE this transaction, so a committed read is a receipted read.
    let artifact: ArtifactRead;
    try {
      artifact = await withRuntime(async (c) => {
        const principal = await resolvePrincipal(c, sub);
        const r = await c.query(
          "select clara.get_artifact_for_human_read($1::uuid, $2::uuid) as a", [artifactId, principal.sub]);
        const row = (r.rows[0]?.a ?? null) as ArtifactRead | null;
        if (!row || !row.storage_key || !row.sha256) {
          // The door raises rather than returning null, so this is the belt: a null here would mean
          // the door changed shape, and serving "no bytes, status 200" would be worse than a 404.
          throw new AuthError(404, "not_found", "not found");
        }
        return row;
      });
    } catch (err) {
      const m = artifactRouteStatus(err);
      // THE TYPED REASON RIDES ALONG ON 403 AND 409 AND NEVER ON 404. On 403/409 the caller is
      // entitled to the database's own word — it is what the Reports tab renders verbatim instead
      // of UI-authored prose. On 404 it is suppressed so that EVERY 404 this route can emit is
      // byte-identical: a malformed id, an unknown id and a foreign-firm id must not be tellable
      // apart, and a body that carried a reason on some 404s and not others would tell them apart.
      const reason = m.status === 404 ? null : refusalReason(err);
      res.status(m.status).json({
        error: m.code,
        message: m.status === 404 ? "not found" : "artifact unavailable",
        ...(reason ? { reason } : {}),
      });
      return;
    }

    // 4. Stream the bytes with the custody credential. Download-then-stream, because the canonical
    // read re-hashes the object against the SEALED sha256 en route — a tampered or substituted
    // object never reaches the client, and a mismatch is a 502 rather than a partially-written
    // download the browser would happily save.
    const tmp = join(tmpdir(), `clara-artifactbytes-${randomUUID()}`);
    try {
      await downloadArtifactCanonical(artifact.storage_key!, tmp, artifact.sha256!);
      res.status(200).set({
        "Content-Type": String(artifact.content_type || "application/octet-stream"),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // ATTACHMENT, not inline: an artifact is a document a human SAVES and sends on, and an
        // inline PDF renders inside the app's own origin, which is where a hostile PDF would like
        // to be. The filename is the door's derived one — never a database string.
        "Content-Disposition": contentDisposition(String(artifact.filename || "clara-artifact.pdf")),
      });
      if (artifact.byte_size != null) res.set("Content-Length", String(artifact.byte_size));
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(tmp);
        stream.on("error", reject);
        res.on("close", () => stream.destroy());
        stream.on("end", () => resolve());
        stream.pipe(res, { end: true });
      });
    } catch (err) {
      if (!res.headersSent) {
        const m = artifactRouteStatus(err);
        res.status(m.status).json({ error: m.code, message: "artifact unavailable" });
      } else {
        res.destroy();
      }
    } finally {
      await rm(tmp, { force: true }).catch(() => {});
    }
  });

  return router;
}
