// The opening-targets parse route (Wave B, R2 · plan §3.3 / F12). A bookkeeper+ of
// the seed's firm asks the runtime to parse the seed's TIE document from the canonical
// extraction surface into document-primary opening targets. Clones the interview/chat
// auth discipline: validate the JWT first (a 401 needs no DB), then resolve the LIVE
// principal in one clara_runtime transaction and re-check the bookkeeper+ floor. The
// deterministic parse + the audited `record_opening_targets_parsed` write both run on
// that same clara_runtime connection; the DB re-derives and re-validates every figure.
//
// Contract (§3.3): POST /api/opening/parse-targets {seedId} →
//   202 {status:'parsed', lines:n}
//   409 {status:'conflict'|'refused', reason}          (registry not open / tie refusal)
//   422 {status:'unparseable', reason}                 (the keyed-fallback signal, F12)
//   404                                                (missing / foreign-firm seed — masked)

import express from "express";
import { authenticate, resolvePrincipal, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { parseOpeningTargets } from "../lib/opening-parse.mjs";

/** Firm role ranks (mirror clara.role_rank) — the bookkeeper+ floor the DB re-validates. */
const RANK: Record<string, number> = { viewer: 0, bookkeeper: 1, admin: 2, owner: 3 };
const BOOKKEEPER_RANK = 1;
const isBookkeeperPlus = (role: string): boolean => (RANK[role] ?? -1) >= BOOKKEEPER_RANK;

function draining(): boolean {
  return !!(globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor?.shuttingDown;
}

export function openingRoutes(): express.Router {
  const router = express.Router();

  router.post("/api/opening/parse-targets", async (req, res) => {
    if (draining()) return void res.status(503).json({ error: "shutting_down" });
    const body = (req.body ?? {}) as { seedId?: string };
    if (!body.seedId || typeof body.seedId !== "string") {
      return void res.status(400).json({ error: "bad_request", message: "seedId is required" });
    }
    try {
      const out = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        if (!isBookkeeperPlus(p.role)) {
          throw new AuthError(403, "forbidden", "a bookkeeper or above must parse opening targets");
        }
        // F-H7: re-resolve the LIVE caller on THIS connection immediately before the
        // audited write — a membership revoked during the parse window is refused 403.
        const reassert = async (): Promise<void> => {
          const live = await resolvePrincipal(c, p.sub);
          if (live.firmId !== p.firmId || !isBookkeeperPlus(live.role)) {
            throw new AuthError(403, "forbidden", "a bookkeeper or above must parse opening targets");
          }
        };
        return parseOpeningTargets(c, { seedId: body.seedId!, firmId: p.firmId, reassert });
      });
      res.status(out.http).json(out.body);
    } catch (err) {
      if (err instanceof AuthError) {
        return void res.status(err.status).json({ error: err.code, message: err.status === 404 ? "not found" : err.message });
      }
      console.error("[clara-runtime] opening parse-targets:", (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
}
