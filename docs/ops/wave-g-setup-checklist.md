# Wave-G setup checklist

*Owner-facing, one page. Written 2026-08-30 evening from the sitting's rulings (裁-57…72,
`docs/plan/active/mohe-grill-rulings-2026-08-30.md`). Every line below names the file or command
that PROVES it — read this before the Wave-G factory reset + estate e2e, not after.*

## Mail (Resend) — 裁-65 / 裁-146

*Who sends what, in one line (裁-146, 2026-09-03; the standing description is `docs/ARCHITECTURE.md`
§1a): **signup confirmation + password reset** = Supabase Auth's own mailer over **custom SMTP pointed
at Resend**; **invitations** = the Resend API from the server-only invite route. One provider, one
verified sending domain, one no-reply sender.*

- [ ] Resend account created, with a **verified sending domain** (not the shared test domain).
      **Measured in the owner's Resend dashboard, 2026-09-03: exactly ONE domain, mail.clarabook.com,
      status Verified** — a sending subdomain distinct from the app origin app.clarabook.com. The repo
      pins no domain (`INVITE_MAIL_FROM` ships blank in `apps/web/.env.example`), so this line is what
      fixes it.
- [ ] The API key scope is `sending_access` **only** — domain-restricted to the verified domain.
- [ ] **Message storage OFF** in the Resend dashboard (the invite link's `?ct=` bearer token sits
      in the request body; do not let Resend retain it).
- [ ] Team log access **restricted** — the Logs API/dashboard is the same body-and-ingress
      exposure named at P4-4 round 3 (H1); narrow who can read it.
- [x] **OWNER ACT, BEFORE THE WALK — configure Supabase Auth's CUSTOM SMTP (裁-146). DONE
      2026-09-03 ≈16:08 MYT** — the owner enabled it and read the form back (screenshot): **Enable
      custom SMTP ON**, sender **no-reply@mail.clarabook.com**, sender name **Clara**, host
      **smtp.resend.com**. **Read only that far:** the port, username and password fields sit below
      the screenshot's fold and are NOT verified — check the username is the literal string `resend`
      rather than a mailbox address before the walk. **This tick does NOT certify the section** —
      the three boxes below are still open, and the last of them is the gate. Without custom SMTP
      Supabase's default mailer delivers **only to the project's organisation-team addresses**
      (*Email address not authorized* for everyone else), at **2 messages/hour**, with no SLA and
      explicitly "not meant for production" (the official auth-smtp guide) — so every real applicant's
      confirmation code goes nowhere while the app shows "check your email". Where it is set: the
      dashboard (Authentication → SMTP Settings) or the Management API
      (PATCH /v1/projects/{ref}/config/auth) with the owner's personal access token. **The full value
      set — HOST, SENDER and SENDER NAME were read back on 2026-09-03; PORT, USERNAME and PASSWORD
      were NOT (below the fold), so verify those three before the walk:** host smtp.resend.com,
      port **587 — a TARGET VALUE, verify it** (Supabase's own auth-smtp example uses 587; 465 is the
      implicit-TLS alternative, and this field is one of the three that were not read back),
      **username the literal string
      `resend`** — never a mailbox address, whatever the dashboard autofills — password **a Resend
      API key entered by the owner**, never in the repo and never printed; **sender
      no-reply@mail.clarabook.com**, sender name **Clara** — the invites' domain, measured in the
      owner's Resend dashboard 2026-09-03 as the one Verified entry, and the same domain
      `INVITE_MAIL_FROM` must carry, so both senders share ONE verified identity.
      **Two template rules go with the SMTP change, and only one of them is a token:** the
      *Confirm signup* template stays the six-digit CODE template — `{{ .Token }}` with nothing to
      click (裁-92; the Signup-gate section below owns that box) — because the confirmation card reads
      a numeric one-time code; the *Reset password* template stays a **LINK** template, UNCHANGED,
      because that arm redirects to /auth/recover and spends a `?code=` there, so a bare token would
      dead-end it. Its box is the pending FS-10 note, not a new one here (see the Signup-gate
      section's own "do not double-file it here"), and /auth/recover must be in Auth → Redirect URLs —
      already a Signup-gate line.
      **Delivery to a NON-team address PROVEN ≈16:55 MYT 2026-09-03** — a Supabase *Invite user* mail
      went out through the new custom SMTP and arrived at a private address outside the project's
      Supabase team, From "Clara <no-reply@mail.clarabook.com>", subject "You've been invited". That
      retires the default mailer's *Email address not authorized* wall as a measured fact rather than
      a settings reading. **It is the Invite-user template arm, NOT the signup-code arm, and it does
      not certify this section:** it was fired from the dashboard rather than through the app's own
      courier path, it exercised a different template from *Confirm signup*, and it carried a LINK
      where the confirmation arm must carry a CODE. Transport PROVEN; the signup-confirmation arm NOT
      certified; the gate below still open.
      **REPORTED DONE by the owner ≈17:00 MYT 2026-09-03 — a report, not a measurement (裁-112), with
      no read-back:** the test user from that delivery proof deleted, the Rate Limits raise applied
      (**the raised value was not stated, so this checklist records no number**), and the *Confirm
      signup* template confirmed to carry `{{ .Token }}`. **All three are read back at the Wave-G
      walk**, and the two boxes immediately below — the rate-limit raise and the `{{ .Token }}`
      re-confirm — stay OPEN until then: each names a Management API read as its proof, and the
      template box is the 裁-92 bypass wall, where `docs/plan/active/security-pass-2026-09-02.md`
      item 8 already demands "a Management API read, not a screenshot of the editor".
- [ ] **Then raise the auth mail rate limit.** Saving custom SMTP applies an initial **30 messages
      per hour** to the project's auth mail (the same official guide); set "emails sent per hour" on
      Authentication → Rate Limits to the beta's expected signup volume. From here the delivery cap is
      the **Resend plan's**, never Supabase's 2/hour.
- [ ] Confirm the *Confirm signup* template still emits `{{ .Token }}` with nothing to click after
      the SMTP change (the Signup-gate section below owns that line; 裁-92), and that the Email OTP
      expiry is the 裁-131 value — 60 minutes, once C-5's attempt wall is live.
- [ ] **CERTIFICATION — a launch gate, not a wording item (裁-146 point 3).** This section certifies
      **only after a REAL signup confirmation is sent to and received at a NON-team address through
      the custom SMTP** — an address that is not a member of the project's Supabase organisation —
      with the six-digit code arriving within about a minute and verifying on the confirm page. A
      settings screenshot does not certify this line; a message delivered to a team address does not
      either, because that is exactly what the default mailer would also have done.
- [ ] Proof: screenshot or export of the key's scope + domain restriction, the storage/log settings,
      a Management API read of the SMTP configuration and the rate limit (values redacted), and the
      received non-team confirmation message with its timestamp — all attached to the Wave-G as-run.

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
      `CLARA_AUTH_WALL_DATABASE_URL` in the runtime environment only; migration `0163` deliberately
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
- [ ] Proof: **`wrangler secret list` for the `clara-web` Worker** (values redacted; all four
      names are `apps/web`-only — `git grep` over `packages/runtime` = 0 hits; the second half of
      that grep named the legacy dashboard tree, which the P6-X source delete removed, so there is
      nothing left to grep there). ADR-024 dropped Vercel; `apps/web/wrangler.jsonc:3` names the
      Worker `clara-web`.
      **Caveat:** `wrangler.jsonc` currently declares no `vars` block, so `CLARA_PUBLIC_ORIGINS`
      has no declared home on the Workers deploy — worth its own look before Wave-G.

## Invite-link log redaction — 裁-65 / P4-4 round 3 item 75

- [ ] The invite link's `?ct=` query VALUE is redacted at the edge/access log (the plaintext
      bearer token must not sit in ingress logs on open, beside the Resend-side control above).
- [ ] Proof: a request against a live invite link, then a read of the edge/access log showing the
      `ct` value masked or absent.

## Signup gate — 裁-57

- [ ] Supabase Auth → "Allow new users to sign up" is **ON**, for the tier-3 self-serve path
      (sign up → pay through Stripe → start; no approval queue, 裁-43/裁-68).
- [ ] Auth → Redirect URLs contains exactly **`<origin>/auth/confirm`** and **`<origin>/auth/recover`**;
      **no wildcard** entry. (Whole-tree census of tracked source, 2026-09-03: exactly two
      redirect call sites — `signup-account-form.tsx:182` sends `emailRedirectTo` to the
      /auth/confirm route, `password-recovery-form.tsx:42` sends `redirectTo` to the /auth/recover
      route; nothing passes `/signup`. The companion *Reset password* template box lives in the
      pending FS-10 notes — do not double-file it here.)
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
- [ ] `clara.stripe_object_map` carries `('product','clara-beta-2026','prod_VBS7ZUaIFPedCs')` and
      `('price','clara-beta-2026','price_1UB5DZHD90w0k86XNfkgYPWq')` — an OPS ACT run **after**
      the reset applies `0160` and `0163_checkout_gate_c3_folded_door.sql` (#493, **MERGED**
      `265a8ee7`, 2026-09-03). Proof: the as-run's `select object_kind, local_key, stripe_id`
      plus one `open_checkout_intent` call that does NOT raise `CLR10`. Without this seed a beta
      signup dies at `CLR10 no stripe price is mapped for this plan`.
- [ ] **The Wave-G walk exercises checkout ONCE at the SEEDED BETA PRICE — Stripe sandbox, MYR 0
      (re-cut by 裁-148, owner, 2026-09-03 ≈17:16 MYT).** This line used to demand a NON-ZERO test
      price, written before 裁-126 fixed the whole beta in the sandbox and 裁-58 left every plan at
      RM0/`trial`. The two cannot both hold: `open_checkout_intent` reads only the **current** plan,
      so a priced plan can be seeded but not walked unless it is temporarily made current — an ops
      act on the admission plane, at the walk, for a path beta never takes. **No such temporary
      switch happens at Wave-G.** A skipped checkout still does not satisfy this line: the session
      must be created, completed and admitted.
- [ ] Proof: the sandbox Checkout Session, its webhook delivery, the `firm_registration_payments`
      row it wrote and the firm it admitted, all named in the Wave-G as-run.
- [ ] **The NON-ZERO price walk belongs to the REAL-MONEY SWITCH ceremony, not here (裁-148).** The
      charge, its webhook and the resulting invoice/receipt surface are proven there, with Stripe
      **live mode** and KYB beside them (裁-125/126) and `CLARA_STRIPE_LIVEMODE` flipped in the same
      act. The 裁-58 dissent's mitigation is not withdrawn — it is re-homed to the only ceremony
      where the charge path is real. Owner: the pricing sitting → the real-money switch.
- [ ] **AT THE WALK AND AGAIN AT CUTOVER — the Stripe problem-event queue must be EMPTY (裁-147,
      owner, 2026-09-03 ≈17:12 MYT).** The operator runs `clara.list_stripe_event_problems()` (or a
      plain `select * from clara.stripe_event_problems where resolved_at is null`) and the result
      must carry **no unresolved rows** before the cutover proceeds; anything present is cleared
      through `clara.resolve_stripe_event_problem(problem, resolution, op_key)` with its reason,
      which re-arms the next sweep to retry the event. Both doors are walled to an OWNER of the
      operator firm (`0160_checkout_gate_c2_stripe_events.sql`), so this is BELCORT's own act after
      the `is_operator` step below. **There is no screen yet** — it is a post-beta Backlog row under
      裁-147, and this line is what makes the manual check cheap enough to be the interim answer.
- [ ] Proof: the two queries and their output pasted into the Wave-G as-run, once at the walk and
      once at cutover; an empty result is a positive read and is recorded as one.

## BELCORT operator flag — 裁-59 / 裁-121③

- [ ] BELCORT's `is_operator` flag is set at the **Wave-G reset**, as its own ceremony step
      (裁-121③, reconciling 裁-43/裁-59 with 裁-76 — the flag no longer waits on the G1
      THREE-switch ceremony, which is post-beta). Runbook: `docs/ops/g1-operator-firm-ceremony.md`.
- [ ] Proof: the Wave-G reset's as-run naming the flag set.

## Product walk — the owner sees the core path with their own eyes

*Added 2026-09-03 ≈18:25 MYT at the owner's ask — 「e2e 也有onboard, upload doc… all core features 都可以实现
right?」 — because every line ABOVE this section proves the ADMISSION path (mail, signup, checkout, the operator
flag) and none of them proves the PRODUCT. **Not a ruling**: an owner-requested walk, recorded as one. **WHO:**
the owner supplies the eyes and does each step in the real UI; the lead supplies the instrument named beside it
and files the evidence in the Wave-G as-run. **WHAT A FAILURE DOES:** it becomes a `PROGRESS.md` Known-issues row
for the launch sitting with what was seen and where it stopped — it does NOT silently block the cutover, and it is
never worked around by touching a mechanism (hard constraint 14). Every route and door below was measured on
`main` at `5eab358d`; where a surface is not shipped the line says so instead of inventing one. **Migrations
`0154`…`0164` apply at the reset, so anything they carry is walked AFTER it, not before.**

- [ ] **1 · Onboard a client company.** From the firm's client register `/clients`
      (`apps/web/app/(firm)/clients/page.tsx`), start onboarding and reach a client that appears in the register.
      The engine is the durable **`clientOnboarding_v4`** workflow — the live registry pin at
      `packages/runtime/workflows/registry.ts:129`, serving on v71 — and the surfaces are the chat lane's
      `apps/web/components/clara/OnboardingChecklistCard.tsx` and `InterviewRunCard.tsx` (the FS-5 interview
      runner, #483), reached by the ⌘K **Do** action `begin_client_onboarding`
      (`apps/web/lib/command/do-actions.ts`). **Instrument:** the new client's row in `/clients` plus the run's
      own workflow id in the as-run. **Note before the walk:** onboarding STARTS in the chat lane, not from a
      button on the register; if the owner cannot find the entry point from `/clients`, that is a discoverability
      finding for the launch sitting, not a build failure.
- [ ] **2 · Upload documents and see what Clara read.** Attach a document in the chat composer or through the
      client's **Documents** tab (`apps/web/app/(firm)/clients/[clientId]/documents/page.tsx` →
      `documents-workbench.tsx`), which rides the Slice-5 intake pair
      `POST /api/intake/documents` then `PUT /api/intake/documents/:id/bytes`
      (`packages/runtime/src/intakeRoutes.ts`). **Instrument:** the extraction result rendered in
      `apps/web/components/documents/document-extract-panel.tsx` — the OCR/extraction output visible in the UI,
      not merely a stored row — plus the document's own detail view. A document that uploads but shows no
      extraction is the finding worth having.
- [ ] **3 · Upload a bank statement and see the lines.** Same intake path, read by the statement reader
      (`packages/runtime/lib/statement-parse.mjs`, `statement-grammar.mjs`, `statement-corroboration.mjs`).
      **Instrument:** the client's **Bank** tab (`apps/web/app/(firm)/clients/[clientId]/bank/page.tsx` →
      `bank-workbench.tsx`, `statements-section.tsx`) listing the statement and its lines. The figures are the
      DB's, never the model's (hard constraint 2) — read them off the tab, not off a chat reply.
- [ ] **4 · The agent's reconciliation drafts appear, and a human decides.** The matcher and the auto-draft belt
      (`packages/runtime/lib/matcher.mjs`, `autodraft.mjs`) propose; the human POSTS or REFUSES in the client's
      **Journals** tab (`apps/web/components/journals/drafts-queue-panel.tsx` → `JournalsDoorDialog.tsx`, and
      `posted-panel.tsx` for the result), or settles a line in Bank's `settle-line-form.tsx`. **Instrument:** one
      draft adopted and one REFUSED, both visible afterwards with their receipts — the refusal half is the one
      that proves the human control, so do not skip it. Manual bookkeeping by hand in the same tab counts as the
      second half of this line.
- [ ] **5 · Chat to close.** In the chat lane, run a close-prep turn — `chatTurn_v17`, FS-7 echelon 1, SERVING on
      v71 — and land a close proposal or an agent-act receipt the human then adopts or withdraws.
      **Instrument:** the client's **Close** tab (`apps/web/components/close/CloseProposalPanel.tsx`,
      `AgentActReceiptsPanel.tsx`, `CloseDoorDialog.tsx`). **Law 71 binds the walk:** preparation is
      agent-lawful, while finalize, reopen, attest and settle are HUMAN-ONLY — a walk that finds the agent doing
      one of those four is a defect, not a feature.
- [ ] **6 · A report renders.** Enqueue a render and take the artifact. The belt is `renderEnqueueDue`
      (`packages/runtime/lib/leader.mjs`, one of the leader's five `*Due` predicates) and the surfaces are
      `apps/web/components/reports/RenderJobQueuePanel.tsx`, `ArtifactRow.tsx` and `DownloadArtifactButton.tsx`
      on the client's **Reports** tab. **Instrument:** the rendered PDF actually opened by the owner, plus the
      `clara.report_artifacts` row behind it. **The download door is FS-7 echelon 2 (`0162`, #512) — merged, and
      it only APPLIES at this reset**, so this line runs after the migration span, never before it.
- [ ] **7 · The fixture estate re-runs end to end through the REAL doors.** Hard constraint 13: BELCORT is the
      operator firm and every other firm — ROME PROPERTIES · ROME SECRETARY · BEE CREATIVE SOLUTION · the
      synthetic ROME PUBLIC ADVISORY · the slice-era RLS fixtures Alara and Borneo — is a resettable TEST fixture,
      factory-reset and re-run at this e2e. **Instrument:** `packages/db/scripts/reset.mjs` then
      `packages/db/scripts/seed.mjs` and `packages/db/scripts/onboard-rpr.mjs`, each printing its own counts, with
      the applied-migration count and frontier read back afterwards (expect `0164`, 159 files) and the RS trial
      balance re-read as the standing pin (`trial_balance_as_of`, 3,396,500 = 3,396,500). A fixture firm that does
      not come back is a stop-the-line finding; a figure that comes back DIFFERENT is a stop-the-line finding.
- [ ] Proof for the whole section: the Wave-G as-run carries, per numbered line, what the owner saw and the
      instrument's own output — and every line that did not pass is copied into `PROGRESS.md` Known issues with
      its number before the launch sitting begins.

## Cloudflare — the cutover (FS-10)

- [ ] Account access for the Workers deploy of `clara-web`.
- [ ] The Pages project `clara`'s Git integration **DISCONNECTED FIRST** — before the Workers
      deploy or the DNS change (measured 2026-08-31: the Pages project builds on every PR and
      every push to `main`, so an undisconnected integration re-deploys the OLD dashboard on
      every docs merge).
      **CHANGED BY THE P6-X SOURCE DELETE (裁-158) — read this before running the step.** That
      build no longer has a source tree: the dashboard's app and its `package.json` are gone from
      `main`, so from the P6-X merge onward every Pages build FAILS instead of re-deploying. The
      step is therefore MORE urgent, not less — a still-connected integration turns each merge to
      `main` into a failed build and a standing alarm. What it does NOT do is take the site down:
      Cloudflare Pages keeps serving the last SUCCESSFUL deployment, so `app.clarabook.com` goes
      on serving the final pre-delete dashboard build until the DNS line below is walked. Expect a
      red build list on arrival and do not read it as the cutover having already happened —
      **confirm what is being served by fetching the origin, never by reading the build status.**
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

## The first REAL sealed artifact — 裁-136

裁-136 (owner, 2026-09-02) changed the gate-3 extraction mode from `-layout` to `-raw` so that
`extracted_text_sha256` covers the watermark burned into the page background. `-layout` drops
rotated text entirely, so before this ruling neither the claim scan nor the sealed hash could see
it. **The ruling was taken at the only hash-migration-free moment**: `clara.report_artifacts` was
empty on the live project, so no sealed artifact's hash had to be migrated and none ever will be.

That guarantee holds only until the first real seal, which lands at Wave-G. From then on the mode
is load-bearing history.

- [ ] Before the first real seal, confirm the deployed `clara-render` image carries the `-raw`
      extractor — read it off the artifact, not off the source: the mode is pinned in
      `packages/reporting-render/lib/extract.mjs`'s `EXTRACT_FLAGS`, and it also rides in the
      manifest's own `extraction_tool` string, so the FIRST sealed artifact's manifest is the
      positive read. A manifest whose `extraction_tool` does not name `-raw` means the machine ran
      an older image and the seal must be redone.
- [ ] Record, in the Wave-G as-run, that `clara.report_artifacts` was empty immediately before the
      first seal — this is the last moment that fact is checkable, and it is what makes "no hash
      migration is owed" a measurement rather than a memory.
- [ ] **After the first real seal, a change to the extraction mode is a HASH MIGRATION**, not a
      flag edit: every sealed `extracted_text_sha256` was computed under the old mode and
      `clara.report_artifacts` is insert-once with UPDATE trigger-blocked. Any future change needs
      its own owner ruling and a re-derivation plan; 裁-136 is not a precedent for a second free
      change.

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
