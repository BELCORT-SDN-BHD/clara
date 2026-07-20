// The document-bytes route (Wave A, PIN-DELTA-4 / contract §5). The dashboard's doc_review
// split-view needs the raw document bytes, but the browser must NEVER hold a Storage
// credential. This route is the trusted-ingress bridge: a HUMAN session JWT ->
// resolvePrincipal (live membership) -> clara.get_document_for_human_read (definer,
// runtime-granted, membership-validated, CLR11 single-shape) -> stream the bytes from Storage
// with the runtime's clara_storage_docs custody credential. The S6-R11 AGENT boundary is
// unchanged: agents never receive raw bytes; only a human reader reaches this path.
//
// Authz order mirrors the intake routes: validate the JWT FIRST (a 401 needs no DB), then the
// id shape (404), then one clara_runtime transaction for the live principal + the definer read.
// A nonexistent document, a foreign-firm document, and an unauthorised one all collapse to the
// SAME 404 (no existence oracle — the DB fn returns the CLR11 single shape).

import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
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

type DocRead = { storage_path?: string; mime_type?: string; byte_size?: number | string; sha256?: string };

function shuttingDown(): boolean {
  return !!(globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor?.shuttingDown;
}

/** Map a caught error to a route response. Auth/CLR11/not-found all collapse to 404; a storage
 *  fault is 502; anything else is 500. Never leaks SQL text. Exported for the shape test. */
export function documentRouteStatus(err: unknown): { status: number; code: string } {
  if (err instanceof AuthError) return { status: err.status, code: err.code };
  const code = (err as { code?: string })?.code;
  if (code === "CLR11" || code === "CLR03") return { status: 404, code: "not_found" };
  if (err instanceof StorageError) return { status: 502, code: "storage_error" };
  return { status: 500, code: "internal" };
}

export function documentRoutes(): express.Router {
  const router = express.Router();

  router.get("/api/documents/:id/bytes", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down" });
      return;
    }

    // 1. JWT first (401 without any DB round-trip).
    let sub: string;
    try {
      ({ sub } = await validateJwt(req.header("authorization")));
    } catch (err) {
      const m = documentRouteStatus(err);
      res.status(m.status).json({ error: m.code, message: m.status === 404 ? "not found" : "unauthorized" });
      return;
    }

    // 2. Id shape (indistinguishable 404).
    const documentId = req.params.id;
    if (!isDocumentId(documentId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }

    // 3. Live principal + the definer document read (one clara_runtime txn).
    let doc: DocRead;
    try {
      doc = await withRuntime(async (c) => {
        const principal = await resolvePrincipal(c, sub);
        const r = await c.query("select clara.get_document_for_human_read($1::uuid, $2::uuid) as d", [documentId, principal.sub]);
        const row = (r.rows[0]?.d ?? null) as DocRead | null;
        if (!row || !row.storage_path) {
          throw new AuthError(404, "not_found", "not found"); // CLR11 single shape (definer returns null / raises)
        }
        return row;
      });
    } catch (err) {
      const m = documentRouteStatus(err);
      res.status(m.status).json({ error: m.code, message: m.status === 404 ? "not found" : "error" });
      return;
    }

    // 4. Stream the bytes from Storage with the custody credential (download-then-stream: the
    // canonical read verifies the sha en route, so a tampered object never reaches the client).
    const tmp = join(tmpdir(), `clara-docbytes-${randomUUID()}`);
    try {
      await downloadCanonical(doc.storage_path!, tmp, doc.sha256);
      res.status(200).set({
        "Content-Type": String(doc.mime_type || "application/octet-stream"),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      });
      if (doc.byte_size != null) res.set("Content-Length", String(doc.byte_size));
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(tmp);
        stream.on("error", reject);
        res.on("close", () => stream.destroy());
        stream.on("end", () => resolve());
        stream.pipe(res, { end: true });
      });
    } catch (err) {
      if (!res.headersSent) {
        const m = documentRouteStatus(err);
        res.status(m.status).json({ error: m.code, message: "document unavailable" });
      } else {
        res.destroy();
      }
    } finally {
      await rm(tmp, { force: true }).catch(() => {});
    }
  });

  return router;
}
