// The prior-GL seeding-prepare route (Wave B, R2 · plan §3.4 / F13). An ADMIN of the
// client's firm asks the runtime to turn a stamped prior_gl / management_account
// document into typed S1 seeding proposals. Same auth discipline as the interview /
// opening routes: validate the JWT first (401 without a DB round-trip), resolve the
// LIVE principal in one clara_runtime transaction, and re-check the admin floor (the
// DB re-validates it structurally inside the tick/decline human lane later). The
// deterministic parse + the audited `create_seeding_batch` write run on that same
// clara_runtime connection.
//
// Contract (§3.4; F-H9 flat counts): POST /api/seeding/prepare {clientId, documentId} →
//   202 {status:'created', batchId, proposal_count, refused_count}   (counts relayed verbatim
//                                                                     from the DB receipt —
//                                                                     proposal_count INCLUDES refused)
//   409 {existing:true, batchId}                (an open batch already owns this source)
//   422 {status:'unparseable', reason}          (no parse source / xlsx unreadable)
//   404                                         (missing / foreign-firm document — masked)

import express from "express";
import { authenticate, resolvePrincipal, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { prepareSeeding } from "../lib/seeding-parse.mjs";

/** Firm role ranks (mirror clara.role_rank) — the admin floor the DB re-validates. */
const RANK: Record<string, number> = { viewer: 0, bookkeeper: 1, admin: 2, owner: 3 };
const ADMIN_RANK = 2;
const isAdminPlus = (role: string): boolean => (RANK[role] ?? -1) >= ADMIN_RANK;

function draining(): boolean {
  return !!(globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor?.shuttingDown;
}

export function seedingRoutes(): express.Router {
  const router = express.Router();

  router.post("/api/seeding/prepare", async (req, res) => {
    if (draining()) return void res.status(503).json({ error: "shutting_down" });
    const body = (req.body ?? {}) as { clientId?: string; documentId?: string };
    if (!body.clientId || !body.documentId || typeof body.clientId !== "string" || typeof body.documentId !== "string") {
      return void res.status(400).json({ error: "bad_request", message: "clientId and documentId are required" });
    }
    try {
      const out = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        if (!isAdminPlus(p.role)) {
          throw new AuthError(403, "forbidden", "an admin or above must prepare seeding");
        }
        // F-H7: re-resolve the LIVE caller on THIS connection immediately before the
        // audited write — a membership revoked during the download/parse window is 403.
        const reassert = async (): Promise<void> => {
          const live = await resolvePrincipal(c, p.sub);
          if (live.firmId !== p.firmId || !isAdminPlus(live.role)) {
            throw new AuthError(403, "forbidden", "an admin or above must prepare seeding");
          }
        };
        return prepareSeeding(c, {
          clientId: body.clientId!,
          documentId: body.documentId!,
          principal: { sub: p.sub, firmId: p.firmId },
          reassert,
        });
      });
      res.status(out.http).json(out.body);
    } catch (err) {
      if (err instanceof AuthError) {
        return void res.status(err.status).json({ error: err.code, message: err.status === 404 ? "not found" : err.message });
      }
      console.error("[clara-runtime] seeding prepare:", (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
}
