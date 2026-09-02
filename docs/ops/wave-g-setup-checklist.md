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
- [ ] Flip `clara_auth_wall_login` to `LOGIN` out of band and set
      `CLARA_AUTH_WALL_DATABASE_URL` in the runtime environment only; migration `0161` deliberately
      ships and tail-proves the role as `NOLOGIN`, so this is a deploy ceremony, never repo-held DDL.

### FS-4 C-6 — the four `apps/web` variables, and the one that carries two correct values

The checkout gate puts the rate wall's pepper and the trusted-client-IP header in `apps/web`
(design part 3 §3, "M3: it sits with its READER"), so these are set on the WEB app, not only the
runtime. Secrets move env-to-env and are never printed.

- [ ] `CLARA_RATE_WALL_PEPPER` on `apps/web` — **the identical value the runtime holds.** The two
      rate-wall limbs (the confirm attempt wall and the checkout rate wall) key on
      `sha256(pepper ‖ value)`; two different peppers split one wall into two that never see each
      other's counts. Absent ⇒ `POST /checkout` refuses (fail-closed, by design).
- [ ] `CLARA_TRUSTED_CLIENT_IP_HEADER` on `apps/web` — **`CF-Connecting-IP`**, the one header this
      app's own Cloudflare edge sets. Never `X-Forwarded-For`: any client can send it, and a wall
      keyed on a client-settable header is a form field the attacker fills in (design part 1 §4.1).
- [ ] **`CLARA_TRUSTED_CLIENT_IP_HEADER` on the RUNTIME — `X-Clara-Client-IP`.** Same variable
      NAME, different correct VALUE, and this is the line most likely to be got wrong. `apps/web`
      sits between the browser and the runtime, so the address the runtime observes on its own
      socket is `apps/web`'s; `apps/web` therefore forwards the address ITS edge saw under this
      fixed header name (`AUTH_WALL_CLIENT_IP_HEADER`, a constant in
      `apps/web/lib/rate-wall-courier.ts`, not a fourth variable). Set the runtime to any other
      name and the runtime auth-wall confirm endpoint answers 503 for every applicant, with nothing in either
      app's configuration looking wrong.
- [ ] `CLARA_AUTH_WALL_SERVICE_TOKEN` on `apps/web` — **the identical value the runtime holds.**
      The confirm endpoint has no user session to check (the caller is confirming in order to get
      one), so this bearer is what proves the caller is `apps/web`'s server and not the open
      internet. Mismatched ⇒ 401 on every confirmation.
- [ ] `STRIPE_SECRET_KEY` on `apps/web` — the TEST-mode restricted key until the launch sitting
      (裁-81/87). 裁-114 makes `apps/web`'s server-only Route Handlers a lawful second holder;
      it is read by `POST /checkout` alone and never bundled.
- [ ] Proof for the pepper and the service token: compare a **hash** of each value across the two
      environments, never the values themselves.
- [ ] Proof: `vercel env ls` / the deploy platform's env listing (values redacted), each of the
      required names present, no value ever pasted into chat, a PR, or a log.

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
- [ ] Email confirmation is **ON** and autoconfirm is **OFF**. Per 裁-92's CODE flow (superseding
      this checklist's earlier token_hash link-form instruction — `apps/web/README.md` §4), the
      "Confirm signup" template emits the bare code and nothing to click: `{{ .Token }}` — never
      `{{ .ConfirmationURL }}` and never a `{{ .RedirectTo }}?token_hash=…` link.
- [ ] Password policy is minimum **12 characters** with HIBP leaked-password protection enabled.
- [ ] Access-token JWT expiry is **900 seconds**; refresh-token rotation remains on.
- [ ] The invite template uses `{{ .SiteURL }}/invite/{{ .TokenHash }}` — on that arm Supabase
      SENDS NOTHING: the token is minted by `generateLink` and delivered by the Resend courier
      (`apps/web/lib/members/invite-mail.ts`, `courier.ts`; `apps/web/README.md` §3). **Email OTP
      expiry is ONE Supabase setting and governs BOTH the six-digit confirmation code AND the invite
      token.** 裁-36/§3.4's C4 shortens it from the 24-hour default to **10 minutes** for the code;
      `apps/web/README.md` §3 asks only "≤ 24h" for invites — a 10-minute invite link would be dead
      for most invitees. **裁-131 (owner, 2026-09-02) sets the single value to 60 minutes for both
      arms and amends C4**: the rate wall (five attempts per fifteen minutes per address, 裁-107) is
      the brute-force defence, a 60-minute window is 20 guesses in a million — **so this box is ticked
      only after C-5's attempt wall is LIVE** (on this tip the confirmation seam is the honest-refusing
      stub; the 60-minute code without the wall would be 3,600 s of unwalled guessing). Receipt: the
      Management API read shows `mailer_otp_exp = 3600` AND the C-5 deploy's as-run naming the wall.
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

## BELCORT operator flag — 裁-59 / 裁-121③

- [ ] BELCORT's `is_operator` flag is set at the **Wave-G reset**, as its own ceremony step
      (裁-121③, reconciling 裁-43/裁-59 with 裁-76 — the flag no longer waits on the G1
      THREE-switch ceremony, which is post-beta). Runbook: `docs/ops/g1-operator-firm-ceremony.md`.
- [ ] Proof: the Wave-G reset's as-run naming the flag set.

## Cloudflare — the cutover (FS-10)

- [ ] Account access for the Workers deploy of `clara-web`.
- [ ] The Pages project `clara`'s Git integration **DISCONNECTED FIRST** — before the Workers
      deploy or the DNS change (measured 2026-08-31: the Pages project builds on every PR and
      every push to `main`, so an undisconnected integration re-deploys the OLD dashboard on
      every docs merge).
- [ ] The preview URL walked route by route, before the DNS change.
- [ ] `app.clarabook.com` DNS moved from the Pages project to the Worker.
- [ ] The Pages project retired after the proof (repoint first, prove, delete second).
- [ ] Proof: the FS-10 ceremony's as-run in `docs/plan/completed/`.

(Source: `docs/plan/active/frontend-sprint-handoff-2026-08-31.md` §7 item 3 and the FS-10 order,
`docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md`.)

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
- [ ] OPS.x (裁-121②): the Workers deploy of `apps/web` carries a parts union ⊇ the serving
      runtime's emittable kinds, re-checked at every future `_vN` bump.
- [ ] Every proof artifact from this checklist and the Wave-G walk is retained in the Wave-G
      as-run (裁-122).

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
