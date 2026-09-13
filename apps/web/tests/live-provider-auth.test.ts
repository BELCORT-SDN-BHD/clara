// #622 — REAL-PROVIDER verification, separate from every mocked unit test
// above it in this train. Orchestrator decision: "add an env-gated,
// skip-when-unconfigured test … that exercises wrong-password sign-in
// (invalid_credentials) and the non-enumerating resetPasswordForEmail
// response against a real Supabase project when configured; mail delivery
// stays mocked. Do not build new infrastructure; write the skip reason so
// it is visible. The disposable-project decision is the owner's."
//
// THIS FILE BUILDS NO INFRASTRUCTURE. It is a single `@supabase/supabase-js`
// client (already a direct `apps/web` dependency — `lib/supabase/client.ts`'s
// own `createBrowserClient` wraps the same package) pointed at two env vars
// this build does not otherwise read. When they are absent — every run on
// this machine and in ordinary CI, today — both cells `skip` with a REASON a
// human reads directly in the test output, never a silent green.
//
// WHY NO SEEDED TEST USER IS NEEDED. `signInWithPassword` against GoTrue
// answers the SAME `invalid_credentials` (400) whether the address does not
// exist at all or the password is merely wrong — that IS the enumeration-safe
// design (verified via Context7 `/supabase/auth`'s error catalog: a single
// `invalid_credentials` code covers "wrong password" AND "unsupported grant
// type", with no separate "no such user" code on this endpoint). So a
// timestamped, certainly-unregistered address is sufficient to prove the
// WRONG-PASSWORD SHAPE without provisioning a fixture account, and the same
// address proves `resetPasswordForEmail`'s own non-enumeration: a request for
// a NEVER-EXISTED account must resolve identically to one for a real account
// (this build does not send mail in this cell either way — "mail delivery
// stays mocked" is honoured by the fact that no test SMTP transport is
// configured on a disposable project, not by anything this file stubs).
//
// THE CLIENT NEVER OPENS A REALTIME CHANNEL (no `.channel()` call below), so
// `@supabase/realtime-js`'s WebSocket requirement — the reason
// `login-form.tsx`'s own header keeps the REAL browser client out of every
// OTHER test in this app — is not reached; `autoRefreshToken`/`persistSession`
// are both disabled so no timer keeps the process alive after this file's
// tests finish, on the Node 22.23.2 this repo now pins throughout (#616).
//
// UNVERIFIED BY THIS SESSION: the configured-and-running path. No disposable
// Supabase project's credentials were available in this environment, so both
// cells skip here — see the PR body for the disposable-project decision this
// orchestrator decision left to the owner.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const AUTH_URL_VAR = "CLARA_LIVE_SUPABASE_AUTH_URL";
const AUTH_ANON_KEY_VAR = "CLARA_LIVE_SUPABASE_AUTH_ANON_KEY";

function liveConfig(): { url: string; anonKey: string } | null {
  const url = process.env[AUTH_URL_VAR];
  const anonKey = process.env[AUTH_ANON_KEY_VAR];
  if (typeof url !== "string" || url.trim() === "") return null;
  if (typeof anonKey !== "string" || anonKey.trim() === "") return null;
  return { url, anonKey };
}

const config = liveConfig();
const skipReason = config === null
  ? `${AUTH_URL_VAR}/${AUTH_ANON_KEY_VAR} not configured — skipping live-provider verification (mocked coverage lives in components/entry/password-recovery.test.tsx and components/login-a11y.test.tsx)`
  : false;

/** One address, certainly unregistered on any real project — timestamped so
 *  two CI runs racing the same project never collide. */
function freshUnknownEmail(): string {
  return `clara-e2e-live-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
}

describe("#622 — real-provider Supabase Auth verification (env-gated)", () => {
  it("wrong-password sign-in returns invalid_credentials — the stable code, never enumerating", { skip: skipReason }, async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(config!.url, config!.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email: freshUnknownEmail(),
      password: "definitely-the-wrong-password-123!",
    });
    assert.equal(data.session, null, "a wrong-password attempt must never mint a session");
    assert.ok(error, "the provider must refuse this sign-in");
    assert.equal(error!.code, "invalid_credentials");
    assert.equal(error!.status, 400);
  });

  it("resetPasswordForEmail answers identically for a never-registered address — non-enumerating", { skip: skipReason }, async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(config!.url, config!.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { error } = await supabase.auth.resetPasswordForEmail(freshUnknownEmail(), {
      redirectTo: `${config!.url}/auth/recover`,
    });
    // The non-enumerating contract: a request for an address nobody has ever
    // registered must resolve the SAME success shape a real account gets —
    // never a distinguishing "no such user" refusal. Mail delivery is not
    // asserted here (no inbox is read); only the WIRE response is.
    assert.equal(error, null, "resetPasswordForEmail must not disclose that this address has no account");
  });
});
