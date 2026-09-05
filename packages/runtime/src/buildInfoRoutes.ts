// CB-AE2E-035 — GET /api/build-info.
//
// WHAT IT ANSWERS: which commit built this image, which image is running, which workflow
// exports it registers, and which migration frontier the database it is talking to is at. That
// last pairing is the reading H-01 needed and nobody could get: the image and the schema
// disagreed for four hours and no product surface could show it.
//
// SESSION-GATED, MOUNTED UNDER /api, NEVER PUBLIC. Two consequences follow from the /api
// prefix and both are deliberate:
//   * it is reachable through the web's same-origin proxy (`/api/runtime/build-info`), unlike
//     `/health`, `/ready` and `/workflows`, which sit at the root and are therefore NOT
//     proxied — those three are the load balancer's, not an operator's;
//   * it takes the SAME `authenticate` gate every other /api route takes (JWT -> live firm
//     membership), so a commit sha, an image ref and a migration count are not readable by an
//     anonymous caller of a public-repo product's runtime.
//
// THE ONE TENSION, STATED RATHER THAN PAPERED OVER. Build-info is most valuable exactly when
// something is broken, and gating it on a DB-backed membership read means it cannot answer when
// the DB is down. That is the cost of "never public", which is the operative instruction. What
// is preserved is the narrower and more common case: the FRONTIER read failing on its own —
// the verb not deployed, the read timing out, the read erroring — still returns 200 with
// `frontier: null` and a reason, because that is the case where the answer is most needed and
// most often wanted.

import express from "express";
import { authenticate, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { buildInfo } from "../lib/build-info.mjs";
// The registry is imported HERE rather than inside lib/build-info.mjs: it is TypeScript, so a
// plain-Node .mjs cannot resolve it without a build, which would make that module untestable.
// This file is TS and compiles with it, so the names are passed in.
import { workflowNames } from "../workflows/registry.js";

export function buildInfoRoutes(): express.Router {
  const router = express.Router();

  router.get("/api/build-info", async (req, res) => {
    try {
      // The gate runs on its own checkout and is AWAITED before any payload is assembled: no
      // build fact is computed, let alone returned, for an unauthenticated caller.
      await withRuntime(async (c) => authenticate(c, req.header("authorization")));
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(err.status).json({ error: err.code, message: err.message });
        return;
      }
      res.status(500).json({ error: "internal" });
      return;
    }
    // Past the gate, nothing here can throw: buildInfo swallows the frontier read's failures
    // into `frontier: null` + a reason by construction.
    res.json(await buildInfo({ names: workflowNames }));
  });

  return router;
}
