# Brief: #622 — sign-in, password recovery, safe return

## Orchestrator decisions (binding)
- Fold the #698 fix (auth wall drops the query string from `?next=`) into this PR — same file/line, same acceptance line. Never forward `.hash`.
- Recovery-request rate limiting: take option (a) — read `error.code` on `resetPasswordForEmail` and render a distinct rate-limited state; NO new attempt-budget table, NO new runtime wall in this PR.
- Real-provider verification: add an env-gated, skip-when-unconfigured test (e.g. `CLARA_LIVE_SUPABASE_AUTH_URL`/`..._ANON_KEY`) that exercises wrong-password sign-in (`invalid_credentials`) and the non-enumerating `resetPasswordForEmail` response against a real Supabase project when configured; mail delivery stays mocked. Do not build new infrastructure; write the skip reason so it is visible. The disposable-project decision is the owner's — state it in the PR body.
- H-40's HIBP half and C-78 (magiclink) are external-owner inputs: do not build; record the disposition in the PR body.
- No DB migration. Frontier stays 0187.

## 1. Current state
Sign-in: `apps/web/components/login-form.tsx` — `signInWithPassword`, form-level `StateBanner`, safe redirect on success via `resolveSameOriginPath` (`lib/safe-redirect.ts:44`, wired only at `login-form.tsx:121`). Tests: `e2e/entry-faces-walk.spec.ts:86-171`, `components/login-a11y.test.tsx`, `login-keyboard.test.tsx`.
Recovery request: `components/entry/password-recovery-form.tsx` calls `resetPasswordForEmail(email, {redirectTo: origin + "/auth/recover"})` from the browser; always renders the same "check your email" face (no enumeration, `messages/en.json:2173`). Not walled; a Supabase `over_email_send_rate_limit` surfaces as `sendError.message` in a generic banner (`:41-46`).
Sent-link face: recovery is email-link PKCE (`code`), no OTP face; `/forgot-password` shows sent/invalid states only.
Link failures: `app/(entry)/auth/recover/handler.ts:53-67` calls `exchangeCodeForSession(code)` and collapses every failure to `/forgot-password?status=invalid`. Supabase Auth distinguishes `flow_state_not_found` (404, unknown/used), `flow_state_expired` (422), `bad_code_verifier` (400), `over_request_rate_limit`/`over_email_send_rate_limit` (429); `error.code`/`error.status` are the stable fields (verified via Context7 `/supabase/auth` error codes + api reference). None read today.
Absent recovery session: handled and tested — `components/entry/password-reset-route.tsx` forks on `resolveServerSession()`; `password-reset-form.tsx:33-40` classifies `AuthSessionMissingError`/`AuthInvalidJwtError`/401/`session_not_found`/`refresh_token_*`/`bad_jwt` and falls back to `PasswordRecoveryForm` with `invalidLink`.
Password policy: `lib/auth/password-policy.ts` (`PASSWORD_MIN_LENGTH = 12`, census test `password-policy.test.tsx`); single-field pattern is the house convention.
Return target: `lib/supabase/proxy.ts:223-224` does `url.search = ""` then sets `next` to the pathname only — bug #698.
Membership re-read routing: `lib/require-firm-scope.ts` (`resolveFirmScope`, fail-closed), `lib/registration/holding-state.ts` (11-state union), `app/(entry)/pending/page.tsx`; "another firm" hazard guarded at the DB door (CLR09, 0145:392) and in `signup-firm-form.tsx:67`. Tests: `tests/holding-state.test.ts`, `components/entry/pending-a11y.test.tsx`.
Pending submit identity: the three forms disable only the submit Button; inputs stay editable mid-submit; no `aria-busy`. No dedicated a11y/keyboard test for `password-recovery-form.tsx` / `password-reset-form.tsx` beyond `recovery-faces-a11y.test.tsx` (check its coverage).

## 2. Gaps / rows
H-40: min-length satisfied (`password-policy.ts` header; asrun part6:230); HIBP toggle external-owner-input. C-63: verify-only + extend (error-code differentiation; assert no token/PII logged on failure). C-78: external-owner-decision, no action. New gaps: #698; unwalled/untyped recovery-request rate limit; link failures not classified.

## 3. Slice (one PR; apps/web only)
- `lib/supabase/proxy.ts`: `next` = pathname + search (never hash).
- `app/(entry)/auth/recover/handler.ts`: branch on `error.code`/`status` → `expired` (`flow_state_expired`, `otp_expired`) / `used_or_unknown` (`flow_state_not_found`) / `refused` (`bad_code_verifier`) / `rate_limited` (`over_request_rate_limit`); extend the `/forgot-password?status=` vocabulary with a continuable action for each.
- `components/entry/password-recovery-form.tsx`: read `error.code` on `resetPasswordForEmail`; distinct rate-limited state with a wait time (the `atLeast`-clamped idiom in `wait-seconds.ts`/`resend-wall.ts`).
- `password-recovery-form.tsx` / `password-reset-form.tsx` / `login-form.tsx`: disable inputs (not only the button) while pending; `aria-busy` on the form; keep first-invalid focus.
- `messages/en.json`: distinct keys for expired/used/refused/rate-limited (never one `invalidLink` for all four). Note the provider limit: for a `token_hash` fallback GoTrue returns the same `otp_expired` for used and expired — copy must not promise a distinction PKCE cannot give there.
- `lib/registration/holding-state.ts` / `pending/page.tsx`: verify, do not modify unless the walk reveals a routing defect.
Tests: extend `tests/password-recovery-handler.test.ts`; `password-recovery-form.test.tsx`/`recovery-faces-a11y.test.tsx`; a proxy `next=` route cell; extend `e2e/entry-faces-walk.spec.ts` (or new `recovery-faces-walk.spec.ts`) for sign-in success/failure, sent state, and a `/login?next=%2Fwork%3Fview%3Dneeds-you` round trip; the env-gated live-provider cell.
Docs: ARCHITECTURE §10 note parallel to the #621 walled-resend note; §11 row "准入与运行保障".

## 4. TDD seams (red first)
1. `apps/web/tests/proxy-recover-next-query.test.ts` (new) — unauthenticated `/work?view=needs-you` → redirect `next` equals `%2Fwork%3Fview%3Dneeds-you`.
2. `tests/password-recovery-handler.test.ts` — `flow_state_expired` (422) and `flow_state_not_found` (404) yield two different `status` values.
3. Same — `over_request_rate_limit` (429) yields a `rate_limited`-distinct redirect.
4. `components/entry/password-recovery-form.test.tsx` — `resetPasswordForEmail` rejecting with `{code: "over_email_send_rate_limit"}` renders the distinct rate-limited state.
5. `components/login-a11y.test.tsx` (or new) — while loading, the email/password inputs are disabled/`aria-busy`.
6. `e2e/entry-faces-walk.spec.ts` — sign in from `/login?next=%2Fwork%3Fview%3Dneeds-you` lands on `/work?view=needs-you` exactly.

## 5. Risks
None of the other wave tickets touch the auth surface. #619 may reshape mock dispatch — keep any new mock arms small.

## 6. Effort: M. Rig: web unit + Playwright; no PG.
