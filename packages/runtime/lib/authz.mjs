// The central authorization module (Slice 4, contract §4.2 — the trusted-ingress
// boundary). EVERY session / task / stream access flows through here. Nothing
// downstream re-derives identity: a route resolves the principal once and passes
// it on. Three layers, each fail-closed:
//
//   1. JWT validation (validateJwt) — a pinned issuer + audience, an algorithm
//      ALLOWLIST (never "none", never caller-chosen), exp/nbf enforced by jose, a
//      UUID `sub`, and an authenticated `role` (service_role / anon are rejected).
//      Any failure → AuthError 401. The runtime NEVER trusts an unverified claim.
//   2. Principal resolution (resolvePrincipal) — clara.resolve_chat_principal maps
//      the sub to its LIVE firm + role, evaluated PER REQUEST (a revoked member's
//      next turn is rejected — no cached membership). No active membership →
//      AuthError 403.
//   3. Session access (assertSessionAccess) — own OR firm-shared, evaluated in the
//      DB predicate. A nonexistent session and an unauthorized one return the SAME
//      AuthError 404 (indistinguishable — no existence oracle, contract §3.2/§0.9).
//
// Config comes from the environment (no secret in code): SUPABASE_JWT_ISSUER and
// SUPABASE_JWT_AUD are REQUIRED (pinned); the signing key is either a JWKS URL
// (SUPABASE_JWT_JWKS_URL, asymmetric — ES256/RS256) or a shared secret
// (SUPABASE_JWT_SECRET, HS256). Missing config fails closed at first use.

import { jwtVerify, createRemoteJWKSet, errors as joseErrors } from "jose";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The authenticated Supabase role; anon / service_role are hard-rejected. */
const AUTH_ROLE = process.env.SUPABASE_JWT_AUTH_ROLE || "authenticated";

/**
 * A typed authorization failure. `status` is the HTTP code a route should return;
 * `code` is a short stable token for logs. The MESSAGE is never surfaced verbatim
 * for a 404 (indistinguishability — see assertSessionAccess).
 */
export class AuthError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Key material — resolved once, from the environment.
// ---------------------------------------------------------------------------

let _keyResolver = null; // () => key | KeyLike resolver for jose
let _algorithms = null;

function jwtConfig() {
  const issuer = process.env.SUPABASE_JWT_ISSUER;
  const audience = process.env.SUPABASE_JWT_AUD;
  if (!issuer || !audience) {
    throw new AuthError(500, "jwt_config", "SUPABASE_JWT_ISSUER and SUPABASE_JWT_AUD must both be set (pinned).");
  }
  if (!_keyResolver) {
    const jwksUrl = process.env.SUPABASE_JWT_JWKS_URL;
    const secret = process.env.SUPABASE_JWT_SECRET;
    const algsEnv = process.env.SUPABASE_JWT_ALGS;
    if (jwksUrl) {
      const jwks = createRemoteJWKSet(new URL(jwksUrl));
      _keyResolver = jwks; // jose accepts the JWKS function as the key argument
      _algorithms = (algsEnv || "ES256,RS256").split(",").map((s) => s.trim());
    } else if (secret) {
      const key = new TextEncoder().encode(secret);
      _keyResolver = () => key;
      _algorithms = (algsEnv || "HS256").split(",").map((s) => s.trim());
    } else {
      throw new AuthError(500, "jwt_config", "one of SUPABASE_JWT_JWKS_URL or SUPABASE_JWT_SECRET must be set.");
    }
  }
  return { issuer, audience, key: _keyResolver, algorithms: _algorithms };
}

/** Reset cached key material — test-only (lets a suite reconfigure the env). */
export function _resetJwtConfigForTest() {
  _keyResolver = null;
  _algorithms = null;
}

// ---------------------------------------------------------------------------
// 1. JWT validation.
// ---------------------------------------------------------------------------

/**
 * Verify a Bearer token from an Authorization header. Returns { sub, role, claims }
 * on success; throws AuthError 401 on ANY failure (bad signature, wrong
 * issuer/audience, disallowed alg, expired/not-yet-valid, non-UUID sub, or a
 * service/anon role). The error message is generic — never leak WHY to the client.
 * @param {string|undefined} authorizationHeader
 * @returns {Promise<{sub: string, role: string, claims: Record<string, unknown>}>}
 */
export async function validateJwt(authorizationHeader) {
  const raw = typeof authorizationHeader === "string" ? authorizationHeader : "";
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!m) throw new AuthError(401, "no_bearer", "missing or malformed Authorization header");
  const token = m[1].trim();
  const { issuer, audience, key, algorithms } = jwtConfig();

  let payload;
  try {
    const verified = await jwtVerify(token, key, {
      issuer,
      audience,
      algorithms, // the allowlist — jose rejects any other alg, incl. "none"
      clockTolerance: 5, // seconds of skew for exp/nbf
    });
    payload = verified.payload;
  } catch (err) {
    // Distinguish nothing to the client; log the class server-side.
    const code =
      err instanceof joseErrors.JWTExpired
        ? "jwt_expired"
        : err instanceof joseErrors.JWTClaimValidationFailed
          ? "jwt_claim"
          : err instanceof joseErrors.JWSSignatureVerificationFailed
            ? "jwt_signature"
            : "jwt_invalid";
    throw new AuthError(401, code, "invalid token");
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!UUID_RE.test(sub)) throw new AuthError(401, "jwt_sub", "invalid token");
  const role = typeof payload.role === "string" ? payload.role : "";
  if (role !== AUTH_ROLE) {
    // Rejects "anon" and "service_role" (and any non-authenticated principal).
    throw new AuthError(401, "jwt_role", "invalid token");
  }
  return { sub, role, claims: payload };
}

// ---------------------------------------------------------------------------
// 2. Principal resolution — live membership, per request.
// ---------------------------------------------------------------------------

/**
 * Resolve the sub's LIVE firm + firm role via clara.resolve_chat_principal
 * (clara_runtime only). No active membership → AuthError 403. The membership is
 * re-read on every call — a member removed/deactivated between turns is rejected
 * on their next turn.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {string} sub
 * @returns {Promise<{sub: string, firmId: string, role: string}>}
 */
export async function resolvePrincipal(client, sub) {
  const r = await client.query("select * from clara.resolve_chat_principal($1)", [sub]);
  if (r.rowCount === 0 || !r.rows[0] || r.rows[0].firm_id == null) {
    throw new AuthError(403, "no_membership", "no active firm membership");
  }
  return { sub, firmId: r.rows[0].firm_id, role: r.rows[0].role };
}

/**
 * Validate the JWT AND resolve the principal in one step (the common route entry).
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {string|undefined} authorizationHeader
 * @returns {Promise<{sub: string, firmId: string, role: string, claims: Record<string, unknown>}>}
 */
export async function authenticate(client, authorizationHeader) {
  const { sub, claims } = await validateJwt(authorizationHeader);
  const principal = await resolvePrincipal(client, sub);
  return { ...principal, claims };
}

// ---------------------------------------------------------------------------
// 3. Session access — own OR firm-shared; indistinguishable not-found.
// ---------------------------------------------------------------------------

/**
 * Assert the principal may access a session and return its row. Access is:
 * same firm AND (visibility='firm' OR created_by = the principal's sub). A
 * nonexistent session and a forbidden one BOTH raise AuthError 404 with an
 * identical message — no oracle for whether a private session exists (§3.2/§0.9).
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {string} sessionId
 * @param {{sub: string, firmId: string}} principal
 * @returns {Promise<{id: string, firm_id: string, visibility: string, created_by: string, title: string|null, created_at: string}>}
 */
export async function assertSessionAccess(client, sessionId, principal) {
  if (!UUID_RE.test(sessionId)) throw new AuthError(404, "not_found", "not found");
  const r = await client.query(
    `select id, firm_id, visibility, created_by, title, created_at
       from clara.chat_sessions
      where id = $1
        and firm_id = $2
        and (visibility = 'firm' or created_by = $3)`,
    [sessionId, principal.firmId, principal.sub],
  );
  if (r.rowCount === 0) throw new AuthError(404, "not_found", "not found");
  return r.rows[0];
}

/**
 * Assert the principal may access a TASK's stream. A nonexistent task, a task in another firm,
 * and a task whose session is private-to-another all raise the SAME AuthError 404 (§3.2
 * masked-view law). Returns the task row plus the session columns when there is a session.
 *
 * TWO ARMS, BECAUSE THERE ARE NOW TWO KINDS OF THING THAT STREAM.
 *
 *   CHAT-SHAPED (the original, unchanged in meaning): a task is reachable iff its SESSION is —
 *   same firm AND (visibility='firm' OR created_by = the principal). Every `chat_turn`, and any
 *   other kind that carries a `session_id`, is judged this way.
 *
 *   ACCOUNTING WORK (#623, reviewed finding R6): `accounting_work` tasks carry `session_id NULL`
 *   by construction — a Work admitted from the C3 composer never had a conversation — so the old
 *   INNER JOIN to `clara.chat_sessions` dropped every one of them and `GET /api/tasks/:id/stream`
 *   answered 404 for a task the initiating bookkeeper had just created. The reachability question
 *   for a Work is the FIRM's, not a session's: `clara.accounting_work`'s own human read policy is
 *   `firm_id = clara.jwt_firm()` with no per-client clause (0178's header states that explicitly —
 *   this estate carries no client-access table, client access IS firm membership), so this arm
 *   asks exactly that and nothing narrower. `principal.firmId` is resolved from LIVE membership by
 *   `resolvePrincipal` on every call, so a removed member fails here on the stream's next poll.
 *
 * TWO STATEMENTS, NOT ONE, AND THE ORDER IS THE DEPLOY ORDER. `clara.accounting_work` does not
 * exist before migration 0178, and a statement naming a missing relation fails at PARSE time — so
 * a single query OR-ing both arms would have made a runtime image that ran ahead of 0178 refuse
 * every CHAT stream too. The chat arm runs first and unchanged; the Work arm runs only when the
 * chat arm found nothing, and an `undefined_table` from it reads as "no such task", which against
 * a pre-0178 database is exactly true. Both misses end in the SAME AuthError 404 with the same
 * body, so neither arm is an existence oracle.
 *
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {string} taskId
 * @param {{sub: string, firmId: string}} principal
 */
export async function assertTaskStreamAccess(client, taskId, principal) {
  if (!UUID_RE.test(taskId)) throw new AuthError(404, "not_found", "not found");
  // Resolve the task's session id WITHOUT leaking existence: the join to the
  // access predicate means a task we may not see returns zero rows == not found.
  const r = await client.query(
    `select t.id as task_id, t.status, t.workflow_run_id, t.session_id, t.kind,
            s.visibility, s.created_by, s.firm_id
       from clara.agent_tasks t
       join clara.chat_sessions s on s.id = t.session_id
      where t.id = $1
        and t.firm_id = $2
        and (s.visibility = 'firm' or s.created_by = $3)`,
    [taskId, principal.firmId, principal.sub],
  );
  if (r.rowCount > 0) return r.rows[0];
  let work;
  try {
    work = await client.query(
      `select t.id as task_id, t.status, t.workflow_run_id, t.session_id, t.kind, t.firm_id,
              null::text as visibility, t.created_by
         from clara.agent_tasks t
         join clara.accounting_work w on w.id = t.work_id
        where t.id = $1 and t.kind = 'accounting_work' and t.firm_id = $2 and w.firm_id = $2`,
      [taskId, principal.firmId],
    );
  } catch (err) {
    // 42P01 undefined_table — this image is running ahead of migration 0178, so there is no
    // accounting Work anywhere to be denied. Any other error is a real fault and rides out.
    if (err?.code !== "42P01") throw err;
    throw new AuthError(404, "not_found", "not found");
  }
  if (work.rowCount === 0) throw new AuthError(404, "not_found", "not found");
  return work.rows[0];
}
