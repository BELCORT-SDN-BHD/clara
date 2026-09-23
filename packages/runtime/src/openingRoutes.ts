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
//
// #986 — AND ITS SIBLING, POST /api/opening/refresh-targets {seedId} →
//   202 {status:'refreshed', lines:n, retired:n}
//   the same 409/422/404 shapes, plus 409 {status:'refused', reason:'no_reread_to_refresh'}
//
// THE TWO ROUTES ARE ONE HANDLER WITH TWO CORES, and that is the point rather than a saving: the
// authz discipline (validate the JWT first, resolve the LIVE principal in one clara_runtime
// transaction, re-check the bookkeeper+ floor immediately before the audited write) is identical
// for both, and a second hand-written copy of it is exactly how one of the two quietly drifts.
// Writing document-primary opening targets is one lane; #986 gave it a second verb, not a second
// set of rules.

import express from "express";
import { authenticate, resolvePrincipal, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { parseOpeningTargets, refreshOpeningTargets } from "../lib/opening-parse.mjs";

/** Firm role ranks (mirror clara.role_rank) — the bookkeeper+ floor the DB re-validates. */
const RANK: Record<string, number> = { viewer: 0, bookkeeper: 1, admin: 2, owner: 3 };
const BOOKKEEPER_RANK = 1;
const isBookkeeperPlus = (role: string): boolean => (RANK[role] ?? -1) >= BOOKKEEPER_RANK;

function draining(): boolean {
  return !!(globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor?.shuttingDown;
}

/** One core of the opening-target lane: the deterministic read plus its audited write. */
type OpeningCore = (
  client: Parameters<typeof parseOpeningTargets>[0],
  args: { seedId: string; firmId: string; reassert: () => Promise<void> },
) => Promise<{ http: number; body: object }>;

/**
 * The handler both opening-target verbs use. `label` appears in the 403 message and in the
 * server-side log line, so a refusal still names the act a person attempted.
 */
function openingTargetHandler(core: OpeningCore, label: string): express.RequestHandler {
  return async (req, res) => {
    if (draining()) return void res.status(503).json({ error: "shutting_down" });
    const body = (req.body ?? {}) as { seedId?: string };
    if (!body.seedId || typeof body.seedId !== "string") {
      return void res.status(400).json({ error: "bad_request", message: "seedId is required" });
    }
    const forbidden = (): AuthError =>
      new AuthError(403, "forbidden", `a bookkeeper or above must ${label} opening targets`);
    try {
      const out = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        if (!isBookkeeperPlus(p.role)) throw forbidden();
        // F-H7: re-resolve the LIVE caller on THIS connection immediately before the
        // audited write — a membership revoked during the parse window is refused 403.
        const reassert = async (): Promise<void> => {
          const live = await resolvePrincipal(c, p.sub);
          if (live.firmId !== p.firmId || !isBookkeeperPlus(live.role)) throw forbidden();
        };
        return core(c, { seedId: body.seedId!, firmId: p.firmId, reassert });
      });
      res.status(out.http).json(out.body);
    } catch (err) {
      if (err instanceof AuthError) {
        return void res.status(err.status).json({ error: err.code, message: err.status === 404 ? "not found" : err.message });
      }
      console.error(`[clara-runtime] opening ${label}-targets:`, (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
    }
  };
}

export function openingRoutes(): express.Router {
  const router = express.Router();

  router.post("/api/opening/parse-targets", openingTargetHandler(parseOpeningTargets, "parse"));
  // #986 — the way forward from `source_reread_since_parse`. Same floor, same lane, same
  // connection discipline; a different write, because bringing a basis onto a new reading retires
  // what the last reading left.
  router.post("/api/opening/refresh-targets", openingTargetHandler(refreshOpeningTargets, "refresh"));

  return router;
}
