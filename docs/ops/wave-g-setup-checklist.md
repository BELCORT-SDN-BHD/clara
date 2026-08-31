# Wave-G setup checklist

*Owner-facing, one page. Written 2026-08-30 evening from the sitting's rulings (裁-57…72,
`docs/plan/active/mohe-grill-rulings-2026-08-30.md`). Every line below names the file or command
that PROVES it — read this before the Wave-G factory reset + estate e2e, not after.*

## Mail (Resend) — 裁-65

- [ ] Resend account created, with a **verified sending domain** (not the shared test domain).
- [ ] The API key scope is `sending_access` **only** — domain-restricted to the verified domain.
- [ ] **Message storage OFF** in the Resend dashboard (the invite link's `?ct=` bearer token sits
      in the request body; do not let Resend retain it).
- [ ] Team log access **restricted** — the Logs API/dashboard is the same body-and-ingress
      exposure named at P4-4 round 3 (H1); narrow who can read it.
- [ ] Proof: screenshot or export of the key's scope + domain restriction, and the storage/log
      settings, attached to the Wave-G as-run.

## Environment variables — 裁-65 / P4-4 round 3 item 79

- [ ] `SUPABASE_SERVICE_ROLE_KEY` set, env-to-env only — never printed, never in a PR, never in a
      log line.
- [ ] `RESEND_API_KEY` set, same discipline.
- [ ] `INVITE_MAIL_FROM` set to the verified sending domain's address.
- [ ] `CLARA_PUBLIC_ORIGINS` set — **required** for `apps/web` behind a proxy: the emailed invite
      link's origin is taken from this allowlist, never from `X-Forwarded-Host`. Confirm the
      courier **fails closed** (refuses its own same-origin POSTs) when this is unset — do not
      just confirm it is set, confirm the fail-closed behaviour under a deliberately-unset probe
      first.
- [ ] Proof: `vercel env ls` / the deploy platform's env listing (values redacted), each of the
      four names present, no value ever pasted into chat, a PR, or a log.

## Invite-link log redaction — 裁-65 / P4-4 round 3 item 75

- [ ] The invite link's `?ct=` query VALUE is redacted at the edge/access log (the plaintext
      bearer token must not sit in ingress logs on open, beside the Resend-side control above).
- [ ] Proof: a request against a live invite link, then a read of the edge/access log showing the
      `ct` value masked or absent.

## Signup gate — 裁-57

- [ ] Supabase Auth → "Allow new users to sign up" is **ON**, for the tier-3 self-serve path
      (sign up → pay through Stripe → start; no approval queue, 裁-43/裁-68).
- [ ] Auth → Redirect URLs contains exactly `<origin>/signup` and `<origin>/auth/confirm`; **no
      wildcard** entry.
- [ ] Email confirmation is **ON** and autoconfirm is **OFF**. The "Confirm signup" template uses
      `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, not `ConfirmationURL`.
- [ ] Password policy is minimum **12 characters** with HIBP leaked-password protection enabled.
- [ ] Access-token JWT expiry is **900 seconds**; refresh-token rotation remains on.
- [ ] The invite template uses `{{ .SiteURL }}/invite/{{ .TokenHash }}` and Email OTP expiry is
      **≤24 hours**.
- [ ] Proof: dated settings screenshots plus Management API reads for the redirect allowlist,
      confirmation/autoconfirm settings, template bodies, password policy/HIBP, `jwt_exp=900` and
      OTP expiry, attached to the Wave-G as-run. Cross-check `apps/web/README.md` §Security posture.

## Billing (Stripe) — 裁-54 / 裁-58

- [ ] A Stripe account exists, with **Stripe Tax** configured for Malaysian service tax (switched
      on only once BELCORT's own SST registration status says so — no tax line before
      registration).
- [ ] **The Wave-G walk exercises checkout in Stripe TEST mode at a non-zero test price**, with
      test cards — this is the 裁-58 dissent's mitigation: the real-money charge path is not
      exercised before launch, so the charge/webhook/invoice path must be proven in test mode
      instead. A zero-amount or skipped checkout does not satisfy this line.
- [ ] Proof: the TEST-mode charge, its webhook delivery, and the resulting invoice/receipt
      surface, all named in the Wave-G as-run.

## BELCORT operator flag — 裁-59

- [ ] BELCORT's `is_operator` flag is set at the **G1 THREE-switch ceremony**
      (`bank_agent` · `close_prep` · binding-expiry — 裁-59; `tax_prep` is NOT among these three,
      裁-62/裁-59). Runbook: `docs/ops/g1-operator-firm-ceremony.md`.
- [ ] Proof: the ceremony's as-run, naming the three switches flipped and the flag set, in one
      combined act.

## Wave-G acceptance evidence — 裁-63

- [ ] Wave-G's acceptance criterion is fixed: *every flow and every feature walks end-to-end* on
      the corpus already on the desktop. **There is no further owner evidence coming** — do not
      wait on it.
- [ ] The RPR overlapping bank-statement series pick is **the agent's, by measurement** (the
      series that covers Apr–Jul exactly once) — record which series was picked, and why, in the
      Wave-G as-run.
- [ ] Every MBB-1 gap the corpus cannot supply (BEE GL/TB for either FY, RPR Feb/Mar-2025
      statements, named producer/certifier for RS/RPR) is marked **资料缺失** in the acceptance
      record — never silently absorbed, never awaited.

## Data safety — hard constraint 14 / DR.md

- [ ] A **full DB backup runs before the factory reset** — see `docs/ops/DR.md` for the backup
      recipe and its verification steps. Confirm the backup completed and is restorable before
      the reset proceeds.
- [ ] `0155` (裁-41, the `client_identifiers` UNIQUE constraint) applies **AFTER** the factory
      reset, never before — ROME SECRETARY's live duplicate identity groups are a resettable
      fixture (constraint 13) and vanish with the reset; no surgical delete, no trigger disable
      (裁-45, 裁-67).

## Frontend keyboard coverage — P4-4 review

- [ ] Playwright real-browser coverage of the invite and members-management keyboard paths (not
      just `fireEvent`/RTL simulation — a real browser, per the P4-4 review's finding that
      simulated events silently no-op inside portalled dialogs).
- [ ] Proof: the Playwright run's report, named in the PR that closes this line.
