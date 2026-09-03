# The 2026-09-03 rulings — the Mail launch gate (裁-146 … )

> The ninth ledger, continuing [`mohe-grill-rulings-2026-09-02-pm.md`](mohe-grill-rulings-2026-09-02-pm.md)
> (裁-132…145 once PR #535 merges; **裁-132…141 is what stands on `main` at the moment this file was
> written**, #535 being OPEN) exactly as `-09-02-pm` continued `-09-02` and `-09-01-pm` continued
> `-09-01`. **The chain to date:** `-08-31` → `-09-01` → `-09-01-pm` → `-09-02` → `-09-02-pm` →
> **this file, the newest**. The split happened here for the same reason every earlier one did — the
> repo's 500-line document ceiling: `-09-02-pm` stands at **474 of 500** once #535 lands — measured on
> that PR's head `303f8586`, its own review fold having grown it past the 468 first quoted — and one
> full 裁-146 entry would breach it. 裁-143/144/145 stay in `-09-02-pm` because that is where they landed
> (#535), even though they were ruled on 2026-09-03; everything from 裁-146 is here. Each `-pm` file
> continues its own day at that day's ceiling, and this file opens the ninth slot at the eighth's.
>
> **Context.** The 2026-09-03 afternoon sitting on the "Clara Beta Runway" page §9 — the same table
> that produced 裁-143/144/145, put ONE question at a time with the recommendation first and the cost
> stated (the grill protocol). B5 is the last of that block and the first entry here. Each entry names
> whether the owner followed or overrode the recommendation. Resume map for the next session:
> `PROGRESS.md`'s posture plus this file.


### 裁-146 — B5: Supabase Auth's SMTP is pointed at Resend, and Wave-G's "Mail" line becomes a LAUNCH GATE (owner, 2026-09-03 ≈15:51 MYT, shell clock)

**The question** (B5, re-framed at ≈15:40 as a launch gate after the official Supabase documentation
was read, and put verbatim):

> Resend only sends invitations; signup confirmation and password reset are sent by Supabase Auth's
> own mailer (`supabase.auth.signUp` at `apps/web/components/entry/signup-account-form.tsx:167`); the
> harness nowhere states who sends, from which address, at what hourly cap; and Supabase's DEFAULT
> SMTP delivers ONLY to the project's organisation-team addresses ("Email address not authorized" for
> everyone else), 2 messages/hour, no SLA, "not meant for production" (official docs, auth-smtp guide,
> read 2026-09-03 via Context7). Whether the project has custom SMTP configured is a dashboard fact,
> not measured from the repo.

**The official fact, with its source named.** Supabase's own Auth documentation — the **auth-smtp
guide** (*Configure a custom SMTP server*, re-read 2026-09-03 via Context7) — states three
restrictions on the SMTP server every project gets by default, in its own words: it will "refuse to
deliver messages to addresses that are not part of the project's team", failing everyone else with
*Email address not authorized*; the rate limit is "currently … set to 2 messages per hour" and "can
change without notice"; and there is "no SLA guarantee on message delivery or uptime", the service
being "provided as best-effort only" for exploring, template testing with team members, and "toy
projects, demos or any non-mission-critical application" — "not meant for production use". The same
guide gives the two ways to point it elsewhere: the dashboard (Authentication → SMTP Settings) or the
Management API, PATCH /v1/projects/{ref}/config/auth on api.supabase.com with a personal access token,
whose body carries smtp_host / smtp_port / smtp_user / smtp_pass / smtp_admin_email / smtp_sender_name.
**One further fact from the same guide, recorded because it makes the owner's act two steps rather
than one:** on saving custom SMTP settings Supabase applies an **initial rate limit of 30 messages per
hour** "to safeguard the service's reputation", changeable on the Rate Limits configuration page. So
custom SMTP removes the 2/hour team-only wall and replaces it with a 30/hour default that must itself
be raised to the beta's expected signup volume.

**The repo facts, measured on this branch (`d4881052`), with file:line.**

1. **Signup confirmation mail is triggered by `supabase.auth.signUp`** —
   `apps/web/components/entry/signup-account-form.tsx:167`, called from the browser with the typed
   address and an `emailRedirectTo` of the deployed origin's /auth/confirm route. That call is what
   makes Supabase Auth send the confirmation message; nothing else in the app asks for one.
2. **NOT by any `supabase.auth.resend` call.** Census with its scope stated, `git grep "auth\.resend"`
   over tracked files: **three under `apps/`** — two source modules under
   `apps/web/lib/registration` plus one README line (`apps/web/README.md:426`, the same retired
   defect described in prose) — and **seven repo-wide**, the other four being documents: the two ADR
   digests, `docs/plan/active/mohe-grill-rulings-2026-09-01-pm.md` (where the M3 defect was ruled) and
   this ledger itself. **None of the seven is a live send path.** The two modules:
   `apps/web/lib/registration/confirmation-resend.ts` (a module header
   describing the retired M3 defect — a browser-side, unauthenticated, unwalled resend button that the
   2026-09-01 fix round removed — and Lane B's completion contract for a future server-side route) and
   its companion `apps/web/lib/registration/confirmation-resend.test.ts` (the cells that keep the
   defect from coming back). **The shipped control refuses**: `requestConfirmationResend` at
   `apps/web/lib/registration/confirmation-resend.ts:52` returns `{kind:"unavailable"}` unconditionally.
   The first record of this fact — 裁-145's `btw` half — named `supabase.auth.resend` as the
   confirmation path; **#535's own fold has since corrected it** (measured on that PR's head
   `303f8586`: its ledger entry, its digest row and its log minute all now name
   `supabase.auth.signUp`), so in either merge order there is nothing left here to correct. This
   entry **corroborates** rather than corrects, and is recorded because the measurement and its
   evidence belong in the ledger rather than only in a review thread. The conclusion 裁-145 drew
   (Supabase's own mailer sends it, Resend the vendor carries invitations only) was never in
   question.
3. **Password reset rides the same Supabase Auth mailer** —
   `apps/web/components/entry/password-recovery-form.tsx:41` calls `resetPasswordForEmail(email, …)`
   with a `redirectTo` of the origin's /auth/recover route. That arm is a **LINK** flow, not a code
   flow: `apps/web/app/(entry)/auth/recover/handler.ts:60` reads the `?code=` query parameter and :64
   spends it with `exchangeCodeForSession`, and only then does
   `apps/web/components/entry/password-reset-form.tsx:58` call `updateUser({password})` on the session
   that exchange minted. There is no code input anywhere on the recovery arm.
4. **The confirmation arm IS a code flow** — `apps/web/components/entry/email-confirmation-card.tsx`
   renders a numeric one-time-code field (`inputMode="numeric"`, `autoComplete="one-time-code"`,
   `maxLength={6}`) at :174-182. This is why the "Confirm signup" template must emit `{{ .Token }}`
   with nothing to click (裁-92, already a Wave-G line) and why the "Reset password" template must
   NOT: a bare token there would leave the recovery arm with no link and no `?code=` to exchange.
5. **Invitations ride the Resend API, server-side only** — `apps/web/app/api/invite/route.ts:41`'s
   POST delegates to `apps/web/lib/members/courier.ts`, which composes the mail through
   `apps/web/lib/members/invite-mail.ts` and posts it to Resend's HTTPS endpoint (`RESEND_ENDPOINT`,
   `apps/web/lib/members/invite-mail.ts:444`). Supabase's own invite template sends nothing on that
   arm: the token is minted by `generateLink` and the courier delivers.
6. **The sender address is an environment variable, not a repo value** — `INVITE_MAIL_FROM`
   (`apps/web/lib/members/invite-mail.ts:49`, declared blank in `apps/web/.env.example`:107 and
   documented at `apps/web/README.md`:338 as one of the four server-only names the courier fails
   closed on). Resend refuses a sender on an unverified domain, so that variable's domain is by
   construction the domain verified in the Resend dashboard. `RESEND_API_KEY` sits beside it
   (`apps/web/.env.example`:97) and is set env-to-env, never printed. **Which domain that is comes
   from the DASHBOARD, not the repo** — the owner read Resend → Domains on 2026-09-03 and it holds
   **exactly one entry, mail.clarabook.com, status Verified**, created two days earlier. The repo
   pins nothing: `INVITE_MAIL_FROM` ships blank behind the placeholder comment at
   `apps/web/.env.example`:98-107, and the only clarabook domains tracked anywhere in that file are
   the app origins on line 40 (app.clarabook.com and the apex) — a different subdomain from the
   sending one, which is correct and worth stating so nobody "fixes" one to match the other.
7. **OTP expiry** is one Supabase setting governing both the six-digit confirmation code and the staff
   invite token, and is **60 minutes** by 裁-131 — set only once C-5's attempt wall is live
   (`docs/ops/wave-g-setup-checklist.md`, the Signup-gate section).
8. **CONFIGURED, and read out the same afternoon — no longer an open dashboard question.** Whether
   the Supabase project had custom SMTP was unmeasurable from the repo when this entry was drafted,
   and was recorded here as an open dashboard fact. **The owner configured it at 2026-09-03 ≈16:08
   MYT**, seventeen minutes after the ruling, and read the form back (screenshot): **Enable custom
   SMTP ON**, sender **no-reply@mail.clarabook.com**, sender name **Clara**, host
   **smtp.resend.com**. What the screenshot did NOT show, and is therefore still UNREAD rather than
   assumed: the port, the username and the password fields, which sit below the fold — the username
   in particular must be the literal string `resend` and not a mailbox address, whatever the form
   autofills. **Three things are still OWED before the "Mail" line certifies:** (a) the rate-limit
   raise off the 30-messages/hour default that saving custom SMTP applies; (b) the *Confirm signup*
   template re-confirmed as still emitting `{{ .Token }}` with nothing to click after the SMTP
   change; (c) **the certifying test itself** — a real signup confirmation received at a NON-team
   address. Point 3 of the ruling is that test, and a configured settings page is not it: the whole
   reason the gate is a received message is that every settings screen looks identical whether or
   not delivery works.
   **Two of those three moved the same afternoon, and the record keeps them at their true weight.**
   (i) **MEASURED, ≈16:55 MYT:** a Supabase *Invite user* mail sent through the new custom SMTP
   arrived at a private address outside the project's Supabase team, From
   "Clara <no-reply@mail.clarabook.com>", subject "You've been invited". That proves the transport
   and the sender identity end to end and retires the *Email address not authorized* wall as a
   measurement. It is the **Invite-user template arm, not the signup-code arm** — fired from the
   dashboard rather than through the app's own courier path (which mints by `generateLink` and
   delivers through Resend, `apps/web/lib/members/invite-mail.ts`), exercising a different template
   from *Confirm signup*, and carrying a LINK where the confirmation arm must carry a CODE. So:
   transport PROVEN, **the signup-confirmation arm NOT certified, the gate still open**. A working
   transport is a precondition of the gate, never the gate. (ii) **REPORTED, ≈17:00 MYT, words only
   — a report, not a measurement (裁-112), with no read-back:** the test user deleted, the Rate
   Limits raise applied — **the raised value was not stated, so no number is recorded anywhere; it
   is unknown, not merely unverified** — and the *Confirm signup* template confirmed to carry
   `{{ .Token }}`. All three are read back at the Wave-G walk, and the checklist's two proof-bearing
   boxes stay OPEN meanwhile: ticking a box that names a Management API read on words alone is the
   class 裁-112 exists to forbid, and for the template box `security-pass-2026-09-02.md` item 8
   already demands "a Management API read, not a screenshot of the editor". Not among the three, and
   not to be conflated: the 裁-131 OTP expiry stays gated on C-5's attempt wall being live.

**Recommendation put (followed):** point Supabase Auth's SMTP at Resend, so that ONE verified sending
domain and ONE provider carry every message the product sends; make the Wave-G "Mail" line a launch
gate that certifies on a received message rather than on a settings screenshot; and write the
who-sends-what into the harness so the next reader does not have to re-derive it from call sites.
Cost stated: one docs-only PR under the single-lane review (ADR-0069), plus one owner dashboard act at
FS-11.

**Ruling:** *"B5照建议"*

**The ruling, in its four points as accepted:**

1. **Supabase Auth's SMTP is pointed at Resend** — host smtp.resend.com, username the literal string
   `resend`, password a Resend API key entered by the owner in the dashboard (Authentication → SMTP
   Settings) or set through the Management API (PATCH /v1/projects/{ref}/config/auth) with the owner's
   personal access token at FS-11; **never in the repo, never printed**.
2. **Sender = a no-reply address on the verified domain the invitation mail already uses** — read
   from the dashboard after the ruling and now named: **mail.clarabook.com**; the six-digit OTP
   template stays Supabase's (`{{ .Token }}`); **OTP expiry 60 minutes (裁-131)** is set in the same
   sitting.
3. **The Wave-G walk sends a REAL signup confirmation to a NON-team address and receives it** before
   the checklist's "Mail" line certifies — a launch gate, not a wording item.
4. **The harness records who sends what:** signup confirmation + password reset = Supabase Auth over
   the custom SMTP (Resend); invitations = the Resend API from the server-only invite route; the
   sender address; and **the cap = the Resend plan's, not Supabase's 2/hour**.

**Alignment.** Shipped in this PR, docs-only.

- **`docs/ARCHITECTURE.md` §1a** (the pre-firm admission plane — the section that already names the
  six-digit emailed confirmation code) gains one **"Mail — who sends what"** paragraph carrying the
  four points plus the two measured refinements below. §1a is the home because it is the only harness
  section that already describes the signup/confirmation path; the alternative homes considered and
  not used were `docs/ops/DR.md`'s readiness section (mail is not a restore concern) and the security
  checklist (which is a cutover tick-list, not a standing description — it gets the pointer instead).
- **`docs/plan/active/security-pass-2026-09-02.md`** cutover-checklist **item 6** is re-cut: its
  second branch ("or the Supabase project's own email rate limits are configured and accepted in
  writing as the wall") named a standing arrangement that the official documentation does not support
  — the default mailer's 2/hour team-only budget is not a wall anyone can launch behind. It now points
  at 裁-146: the project runs CUSTOM SMTP into Resend, the delivery cap is the Resend plan's, and
  Supabase's own auth rate limit (30 messages/hour on enabling custom SMTP) is the second knob. 裁-102
  stays OPEN — the server-side wall on the send path is unbuilt either way, and this ruling does not
  close it.
- **`docs/ops/wave-g-setup-checklist.md`**'s Mail section gains the SMTP configuration step (an owner
  act, placed BEFORE the walk) and its certification line becomes the launch gate of point 3.
- **`AGENTS.md`**'s "Ledger:" pointer names this file as the newest and extends the chain.
- **`docs/adr/README.md`** §15 and **`docs/adr/README-log.md`** take the 裁-140-shape row and dated
  minute. No new ADR: the ruling amends no ADR text outright and permanently, it records an
  operational arrangement and a launch gate.

**Two measured refinements written beside the ruling, not into it** — both from the same official
guide and from the repo, so a later reader is not misled by a shorthand:

- **The cap has two knobs, not one.** "The cap is the Resend plan's" is right about which vendor's
  quota governs delivery, but Supabase's own auth rate limit sits in front of it and starts at **30
  messages/hour** the moment custom SMTP is saved. Raising it on the Rate Limits page is part of the
  same owner act; otherwise the launch is capped at 30/hour with no repo-visible reason.
- **"The OTP template stays Supabase's" applies to the CONFIRMATION arm only.** The reset arm is a
  link flow (fact 3 above), so its template keeps a link and belongs to the redirect-URL allowlist,
  not to the token setting. The Wave-G checklist already parks the *Reset password* template box in
  the pending FS-10 notes and says "do not double-file it here", so nothing was added for it.

**Amends:** `docs/ARCHITECTURE.md` §1a (a new paragraph), `docs/plan/active/security-pass-2026-09-02.md`
item 6 (re-cut, pointing at this ruling), `docs/ops/wave-g-setup-checklist.md` (a new owner-act step
plus the certification line), `AGENTS.md`'s ledger pointer, and the digest pair. **Corrects** 裁-145's
`btw` half on one point of fact (the call site is `signUp`, not `resend`) without disturbing its
ruling or its conclusion.

**Not fixing:** the harness would have kept saying nothing about who sends the two most launch-critical
messages the product has, while the project's mailer — if custom SMTP is not configured — silently
delivers to nobody outside BELCORT's own Supabase team and answers every real applicant with *Email
address not authorized*. That failure is invisible from the app: `supabase.auth.signUp` resolves
normally, the UI paints "check your email", and the person never receives anything.

**The four sibling-held touches — named while they were owed, and DISCHARGED in this PR's fold once
their holders merged** (#535 as `db74fc97`, #536 as `72c56048`, both on 2026-09-03). They were held
back rather than fought over because two PRs editing one file conflict at merge; they are listed here
so the record shows what was deferred and that nothing was quietly dropped:

1. **DONE** — `docs/plan/index.md` gains a row for this file, and its `-09-02-pm` row (line 159) was
   stale on **BOTH** halves, not one: the range "裁-132…141" is re-cut to 裁-132…145 (#535's three
   landed there) **and** the phrase "and the NEWEST" moves to this file's new row. Fixing one half
   and not the other would have left the index worse than before.
2. **DONE** — `docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md` took **two** touches, not one:
   the closing back-pointer to this file, in the shape `mohe-grill-rulings-2026-09-02.md` already
   carries — and, in the same edit, its **line 5**, whose chain ended "→ **this file, the newest**".
   A closing line alone would have left that header self-contradicting three lines from the top,
   which is exactly the rot a back-pointer exists to prevent.
3. **DONE** — `docs/adr/README.md` item 86's row-location list gains 裁-146 and this file, so the
   §15 index of which ledger holds which ruling stays complete.
4. **Still owed, and not this PR's to take:** the digest is now at **exactly 500 lines**, the repo's
   document ceiling. 裁-147's row cannot be written until `docs/adr/README.md` is split — the same
   move `README-log.md` itself came from on 2026-08-23 (`docs/adr/README.md`'s own note records it).
   A split plan is owed BEFORE the next law-changing ruling, not before this merge.
