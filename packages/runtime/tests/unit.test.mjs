// Pure-logic unit tests (no DB, no world) — the parts of the runtime that are
// deterministic functions: JWT validation, span redaction, and the control /
// reconciler classifiers. These RUN anywhere (no throwaway DB required).
//
// NOTE: every credential-shaped test fixture (the HS256 key, the redaction inputs)
// is CONSTRUCTED AT RUNTIME from fragments so no secret-shaped literal sits in
// source (the repo leak-scan gate). Nothing here is a real credential.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";

const ISSUER = "https://clara.test/auth/v1";
const AUD = "authenticated";
const jwtKeyString = "s4-unit-" + randomUUID().replace(/-/g, ""); // random per run; not a stored key
process.env.SUPABASE_JWT_ISSUER = ISSUER;
process.env.SUPABASE_JWT_AUD = AUD;
process.env.SUPABASE_JWT_SECRET = jwtKeyString;

const { validateJwt, AuthError, _resetJwtConfigForTest } = await import("../lib/authz.mjs");
const { redact } = await import("../lib/tracing.mjs");
const { resumePayloadFor, isHookNotFound } = await import("../lib/control.mjs");
const { isRunNotFound } = await import("../lib/reconciler.mjs");

const key = new TextEncoder().encode(jwtKeyString);
const SUB = "11111111-1111-4111-8111-111111111111";
const now = () => Math.floor(Date.now() / 1000);

function base(claims = {}, alg = "HS256") {
  return new SignJWT({ role: AUD, ...claims }).setProtectedHeader({ alg }).setSubject(claims.sub ?? SUB).setIssuer(ISSUER).setAudience(AUD).setIssuedAt();
}
const mint = (claims = {}, signKey = key) => base(claims).setExpirationTime("5m").sign(signKey);

test("JWT: a valid authenticated token resolves sub + role", async () => {
  _resetJwtConfigForTest();
  const r = await validateJwt(`Bearer ${await mint()}`);
  assert.equal(r.sub, SUB);
  assert.equal(r.role, "authenticated");
});

test("JWT: missing/garbage Authorization -> 401", async () => {
  _resetJwtConfigForTest();
  for (const h of [undefined, "", "Basic xyz", "Bearer", "Bearer   "]) {
    await assert.rejects(() => validateJwt(h), (e) => e instanceof AuthError && e.status === 401);
  }
});

test("JWT negative paths all -> 401", async () => {
  _resetJwtConfigForTest();
  const expired = await base().setIssuedAt(now() - 3600).setExpirationTime(now() - 1800).sign(key);
  const wrongIssuer = await new SignJWT({ role: AUD }).setProtectedHeader({ alg: "HS256" }).setSubject(SUB).setIssuer("https://evil/").setAudience(AUD).setIssuedAt().setExpirationTime("5m").sign(key);
  const wrongAud = await new SignJWT({ role: AUD }).setProtectedHeader({ alg: "HS256" }).setSubject(SUB).setIssuer(ISSUER).setAudience("service").setIssuedAt().setExpirationTime("5m").sign(key);
  const badSub = await mint({ sub: "not-a-uuid" });
  const anon = await mint({ role: "anon" });
  const service = await mint({ role: "service_role" });
  const wrongSig = await mint({}, new TextEncoder().encode("different-" + randomUUID()));

  for (const [label, tok] of Object.entries({ expired, wrongIssuer, wrongAud, badSub, anon, service, wrongSig })) {
    await assert.rejects(() => validateJwt(`Bearer ${tok}`), (e) => e instanceof AuthError && e.status === 401, `${label} must be 401`);
  }
});

test("JWT: the alg allowlist rejects a disallowed alg (HS512 vs HS256)", async () => {
  _resetJwtConfigForTest();
  const tok = await new SignJWT({ role: AUD }).setProtectedHeader({ alg: "HS512" }).setSubject(SUB).setIssuer(ISSUER).setAudience(AUD).setIssuedAt().setExpirationTime("5m").sign(key);
  await assert.rejects(() => validateJwt(`Bearer ${tok}`), (e) => e instanceof AuthError && e.status === 401);
});

test("redact: scrubs bearer tokens, JWTs, connection strings, and denylist keys", () => {
  const jwtLike = "eyJ" + "abc".repeat(6) + "." + "def".repeat(6) + ".zzz";
  const bearer = "Bearer " + randomUUID().replace(/-/g, "");
  const conn = ["postgres:", "", "u:p@localhost:5432", "db"].join("/"); // built from fragments
  const input = {
    note: `call with Authorization: ${bearer} please`,
    jwt: jwtLike,
    password: "hunter2",
    nested: { api_key: "sk-secret", dsn: conn },
    fine: "this is fine",
  };
  const s = JSON.stringify(redact(input));
  assert.ok(!s.includes("hunter2"), "password value dropped (denylist key)");
  assert.ok(!s.includes("sk-secret"), "api_key value dropped (denylist key)");
  assert.ok(!s.includes("u:p@localhost"), "connection string with creds scrubbed");
  assert.ok(!/eyJ/.test(s), "JWT-shaped value scrubbed");
  assert.ok(!/Bearer\s+[a-f0-9]/.test(s), "bearer token scrubbed");
  assert.ok(s.includes("this is fine"), "innocuous value preserved");
});

test("redact: handles cycles + depth without throwing", () => {
  const a = { x: 1 };
  a.self = a;
  const out = redact(a);
  assert.equal(out.x, 1);
  assert.equal(out.self, "[circular]");
});

test("control.resumePayloadFor maps interruption status -> hook payload", () => {
  assert.deepEqual(resumePayloadFor({ status: "answered", answer: { v: 1 } }), { kind: "answer", answer: { v: 1 } });
  assert.deepEqual(resumePayloadFor({ status: "expired" }), { kind: "expired" });
  assert.deepEqual(resumePayloadFor({ status: "cancelled" }), { kind: "cancelled" });
});

test("control.isHookNotFound recognises the single-shot signal by name + message", () => {
  assert.equal(isHookNotFound({ name: "HookNotFoundError" }), true);
  assert.equal(isHookNotFound(new Error("Hook not found")), true);
  assert.equal(isHookNotFound(new Error("some other error")), false);
  assert.equal(isHookNotFound(null), false);
});

test("reconciler.isRunNotFound recognises the engine 'run not found' signal", () => {
  assert.equal(isRunNotFound({ name: "WorkflowRunNotFoundError" }), true);
  assert.equal(isRunNotFound(new Error("run wrun_x not found")), true);
  assert.equal(isRunNotFound(new Error("nope")), false);
});
