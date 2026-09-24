// #871 — THE ONE SIGNED-OUT INVITE-PREVIEW ENDPOINT, on the auth-wall courier pattern.
//
// Owner's ruling, 2026-09-23 (ticket #871): an invitee who has not signed in sees which firm and
// role an invite names, and its status, through "a server-only read that no browser or client
// credential can reach" — "a route on the auth-wall courier pattern (peppered, trusted-header, no
// cookie) that the web server route calls; the web app never holds the credential".
//
// ONE ENDPOINT, ONE VERB, AND THE TOKEN NEVER TRAVELS IN A URL. `POST /api/invite-preview` takes
// `{token}` in a JSON body. There is deliberately no GET: a GET would put a live invite token in
// this process's access log, in every intermediary's log, and in the `Referer` of anything the
// answer links to. `apps/web`'s own invite page already sets `referrer: "no-referrer"` for the same
// reason; a GET entrance here would undo it one hop later.
//
// THE SERVICE-TOKEN GATE, AND WHY IT IS NOT OPTIONAL. The caller has no session — that is the point
// of the flow — so there is no user JWT to check. What DOES need proving is that the caller is
// `apps/web`'s server and not the open internet: this route reaches a DB role, and it TRUSTS the
// client-IP header its caller forwards, which an anonymous caller could otherwise spoof to mint a
// fresh rate-wall budget per request. It shares `CLARA_AUTH_WALL_SERVICE_TOKEN` with
// `src/authWallRoutes.ts` — ONE pre-session server-to-server secret for the pre-session routes,
// imported from that module rather than re-spelled, so the two cannot drift apart and the operator
// has one value to rotate. Unset ⇒ the route refuses EVERYTHING with 503. There is no "allow when
// unconfigured" arm.
//
// NO COOKIE IS READ AND NONE IS SET. There is no session here to read one against, and a cookie
// arriving on this request (a browser that reached the runtime directly) must change nothing about
// the answer. `p871rt.route.no_cookie` drives exactly that and also reads THIS FILE's source to
// prove the word does not appear in it.
//
// THE CLIENT IP IS THE CALLER'S TO FORWARD, exactly as `authWallRoutes.ts` states at length:
// `apps/web` sits between the browser and this route, so the address this process observes is
// `apps/web`'s. The courier reads `CLARA_TRUSTED_CLIENT_IP_HEADER`, and `apps/web` sets that header
// to the address ITS own edge observed. Absent, unparseable, or with no pepper to digest it ⇒ 503
// and NO call to the door: proceeding with a constant would key the wall on one value for the whole
// deployment, which is the M1 defect PR #488 already paid for once.
//
// THIS ROUTE COMPUTES NO NUMBER AND COLLAPSES NO REFUSAL THE DATABASE OWNS. The door
// (`clara.preview_invite_by_token`, migration 0309) answers one of three outcomes and this file
// maps each to a status: `preview` ⇒ 200, `not_previewable` ⇒ 404, `rate_limited` ⇒ 429 with
// `Retry-After`. The single 404 is the door's own no-oracle contract carried outward unchanged — an
// unknown, expired, revoked or already-accepted token produces the SAME status and the SAME body,
// and there is no field a caller could read to tell them apart.
//
// WHY 404 RATHER THAN 200-WITH-A-FLAG. The caller is a server route rendering a page, and "there is
// nothing to preview" is honestly a not-found. It also means a proxy, a log line or a metric can
// see the shape of this traffic without parsing JSON — the same argument `authWallRoutes.ts` makes
// for answering 429 rather than 200 on a rate refusal.

import express from "express";
import { timingSafeEqual } from "node:crypto";

import { SERVICE_TOKEN_VAR } from "./authWallRoutes.js";
import { previewInviteByToken, invitePreviewLaneConfigured } from "../lib/invite-preview-pool.mjs";
import { originDigestFrom } from "../lib/rate-wall-courier.mjs";

export const INVITE_PREVIEW_PATH = "/api/invite-preview";

/** Constant-time bearer compare. Unequal lengths are unequal, compared away without
 *  `timingSafeEqual`, which throws on a length mismatch rather than returning false. */
function bearerMatches(header: string | undefined, expected: string): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(typeof header === "string" ? header.trim() : "");
  if (!m?.[1]) return false;
  const a = Buffer.from(m[1].trim(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/** The four keys the door's preview arm carries, and the only ones this route relays. Exported so a
 *  cell drives THIS list rather than a copy of it. */
export const INVITE_PREVIEW_KEYS = Object.freeze(["firm_name", "role", "status", "masked_email"]);

/**
 * Is this the door's preview receipt? Positively checked, every key, before anything is relayed —
 * a half-validated object wearing a fully-typed name is the defect this estate's own readers were
 * widened to close.
 */
function isPreviewReceipt(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.outcome !== "preview") return false;
  return INVITE_PREVIEW_KEYS.every((k) => typeof row[k] === "string" && (row[k] as string).trim() !== "");
}

export function invitePreviewRoutes(): express.Router {
  const router = express.Router();

  // Its own tiny JSON parser, scoped to this path, for the reason `authWallRoutes.ts` gives: this
  // router is mounted beside the Stripe webhook (before the global parser), so it cannot rely on
  // `express.json()` having run.
  router.post(INVITE_PREVIEW_PATH, express.json({ limit: "16kb" }), async (req, res) => {
    const expectedToken = process.env[SERVICE_TOKEN_VAR];
    if (typeof expectedToken !== "string" || expectedToken.trim() === "") {
      console.error(`[clara-runtime] invite preview REFUSED: ${SERVICE_TOKEN_VAR} is not configured`);
      res.status(503).json({ outcome: "unavailable" });
      return;
    }
    if (!bearerMatches(req.header("authorization"), expectedToken)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    // BELOW the bearer, deliberately, exactly as the auth wall orders its own probes: a distinct
    // 503 above it would tell an anonymous caller whether this lane is wired.
    if (!invitePreviewLaneConfigured()) {
      console.error("[clara-runtime] invite preview REFUSED: the invite-preview lane DSN is not configured");
      res.status(503).json({ outcome: "unavailable" });
      return;
    }

    const body = req.body as { token?: unknown } | null;
    const token = body && typeof body === "object" && !Array.isArray(body) ? body.token : undefined;
    if (typeof token !== "string" || token.trim() === "") {
      res.status(400).json({ outcome: "invalid_token" });
      return;
    }

    // THE DIGEST. Absent ⇒ refused BEFORE the door is called, so a request whose wall cannot be
    // keyed never spends anybody's budget and never reads anybody's invite.
    const originDigest = originDigestFrom((name: string) => req.header(name));
    if (originDigest === null) {
      console.error("[clara-runtime] invite preview REFUSED: no trusted client-IP digest (header or pepper absent/unparseable)");
      res.status(503).json({ outcome: "unavailable" });
      return;
    }

    let receipt: unknown;
    try {
      receipt = await previewInviteByToken(token.trim(), originDigest);
    } catch (err) {
      // The door raises only on the two caller-side input facts (an absent token, a malformed
      // digest), both of which are walled above, so a throw here is ours: a broken lane, not a
      // verdict about the invitation.
      console.error(`[clara-runtime] invite preview failed: ${(err as Error)?.message ?? err}`);
      res.status(503).json({ outcome: "unavailable" });
      return;
    }

    const outcome = (receipt as { outcome?: unknown } | null)?.outcome;

    if (outcome === "rate_limited") {
      // The door's own number, clamped by the door and untouched here.
      const seconds = (receipt as { retry_after_seconds?: unknown }).retry_after_seconds;
      const retryAfterSeconds = typeof seconds === "number" && Number.isInteger(seconds) && seconds >= 0 ? seconds : 0;
      res.status(429).set("Retry-After", String(retryAfterSeconds)).json({ outcome: "rate_limited", retryAfterSeconds });
      return;
    }

    if (isPreviewReceipt(receipt)) {
      // EXACTLY the four keys, rebuilt by name. A future additive field on the door does not leak
      // through this route by accident, and the token this caller sent is not among them.
      res.status(200).json({
        outcome: "preview",
        preview: {
          firm_name: receipt.firm_name,
          role: receipt.role,
          status: receipt.status,
          masked_email: receipt.masked_email,
        },
      });
      return;
    }

    // THE ONE REFUSAL, and the fall-through joins it deliberately. `not_previewable` is the door's
    // single answer for an unknown, expired, revoked or accepted token; a receipt this build does
    // not understand is not a different fact to publish — it is one more thing a caller must not be
    // able to tell apart, so it lands here rather than on its own status.
    if (outcome !== "not_previewable") {
      console.error(`[clara-runtime] invite preview: unreadable receipt from the door (outcome=${String(outcome)})`);
    }
    res.status(404).json({ outcome: "not_previewable" });
  });

  return router;
}
