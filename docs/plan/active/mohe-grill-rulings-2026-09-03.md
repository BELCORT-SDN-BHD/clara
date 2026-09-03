# The 2026-09-03 rulings — the Mail launch gate, the last three §9 answers, and the post-launch agenda (裁-146…150)

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
   over tracked files: **exactly three under `apps/`** — two source modules under
   `apps/web/lib/registration` plus one README line (`apps/web/README.md:426`, the same retired
   defect described in prose). **Every other occurrence is document prose — the ADR digests and the
   ruling ledgers — and none of them is a send path.** The repo-wide NUMBER is deliberately not
   stated: this census went stale inside its own PR once a sibling ruling's fold added another
   sentence about the defect, so only the `apps/` count, which is the half that carries the claim,
   is numbered. The two modules:
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
4. ~~**Still owed, and not this PR's to take:**~~ **DISCHARGED 2026-09-03 by the afternoon truing.**
   The digest stood at **exactly 500 lines**, the repo's document ceiling, so 裁-147's row could not
   be written until `docs/adr/README.md` was split — the same move `README-log.md` itself came from
   on 2026-08-23. The split ran first in the truing PR: §15's per-ruling rows moved **byte-for-byte**
   (md5 `e860d0fc8186a233722af7385ff2dae0`, 16,777 bytes, proven on both sides) into
   [`../../adr/README-rulings-2026-09.md`](../../adr/README-rulings-2026-09.md), the digest keeping
   the law and pointing there, and 裁-147…150's rows are written in the sibling.

---

### 裁-147 — B6: the C-2 operator problem-event SCREEN is post-beta; a manual check line holds its place (owner, 2026-09-03 ≈17:12 MYT, shell clock)

**The question** (B6, from the owner page's §9 table, verbatim):

> C-2 上线了两扇运营方门（列出 Stripe 出问题的事件、标记已处理），设计文件说"必须有人看，所以要有界面 + beta
> 清单一项"；实际零调用、清单里没有。现在指定谁建界面，还是记为 beta 之后、期间在 Wave-G 清单加一行人工 select？

**The recommendation put with it** (the grill protocol — recommendation first, cost stated):

> beta 之后建界面，现在加一行人工检查（"切换时不得有未处理的 stripe_event_problems"）+ PROGRESS backlog 一行。
> 运营方在 Wave-G 走查和切换时各跑一次 select——便宜，但前提是清单那行存在。

**The owner's words, verbatim:** 「照建议」 — the recommendation ACCEPTED, not overridden.

**The ruling.** (1) The operator screen for the two C-2 doors —
`clara.list_stripe_event_problems(boolean)` and `clara.resolve_stripe_event_problem(uuid, text, text)`,
both minted by `0160_checkout_gate_c2_stripe_events.sql` and walled to an OWNER of the operator firm by
the same predicate `approve_firm_registration` uses — is **built AFTER beta live**, as a `PROGRESS.md`
Backlog row owned by the first post-beta UI lane. (2) **Now**, `docs/ops/wave-g-setup-checklist.md`
gains ONE manual line: at the Wave-G walk **and** again at cutover the operator runs the list door (or
a plain select on `clara.stripe_event_problems`) and the result must be EMPTY of unresolved rows before
the cutover proceeds; a non-empty result is cleared through `resolve_stripe_event_problem` with its
reason, which re-arms the next sweep to retry the event. (3) `docs/plan/active/checkout-gate-design-part2.md`'s
M4 paragraph — "the problems must be watched by someone, so they have a surface", with "**where it is
watched:** the operator firm's review surface" — is re-pointed at that checklist line as the interim
surface, so the design no longer promises a screen that does not exist.

**The measurement behind it.** A census over `apps` and `packages/runtime` returns **zero** callers of
either door. The runtime's own recovery note (`packages/runtime/lib/stripe-projection.mjs`, the #511
review's M-1 comment) names the DOOR rather than a screen — "`list_stripe_event_problems` shows it to
an operator" — so it is accurate as written and is left untouched; the screen promise lives only in the
design document, which is where the re-point lands. That also keeps this a docs-only PR: a docs-shaped
edit inside `packages/runtime` scores CODE under the CI path classifier.

**The owner's own condition, carried forward:** the check is cheap **only if the checklist line exists**.
That is why the line goes into the checklist rather than into a runbook — the design's words, "named
here, not left to a runbook nobody opens".

**Amends:** `docs/ops/wave-g-setup-checklist.md` (Billing/Stripe), `docs/plan/active/checkout-gate-design-part2.md`
(M4), `PROGRESS.md` (a Backlog pick-list row). Digest row 88 in `README-rulings-2026-09.md`; log minute
the same day. PRD §2's operator cap (裁-143) already names this queue as one of the tier's two read
queues and is UNTOUCHED.

---

### 裁-148 — B7: the non-zero checkout walk moves to the REAL-MONEY SWITCH (owner, 2026-09-03 ≈17:16 MYT, shell clock)

**The alignment that preceded it** (the owner, ≈17:14, verbatim):

> 所以真的收费模型and KYB and all term and condition 的是like 上市official launch 前做的事right? in backlog
> 我们择日在完善的对吗? just make sure wea re allign.

Confirmed, with one nuance stated back: the **BETA versions** of the legal texts — the DPA e-signature,
the beta terms of service, the consent text — ship **WITH** beta as agent templates that users actually
sign (裁-125); the **lawyer-refined** versions come before 上市.

**The question** (B7, as posed in the §9 table): the Wave-G checklist's checkout line requires a walk at
a **non-zero** test price, while 裁-126 fixes the whole beta in the Stripe sandbox and 裁-58 leaves every
plan at **MYR 0**. A priced plan can be seeded without a schema change, but the checkout door reads only
the **current** plan — so a priced plan can be seeded and not walked unless it is temporarily made
current at the walk.

**The recommendation put with it:**

> 挪到真钱开关。裁-125/126 已经把真钱和 KYB 放在那一场；beta 全程沙盒、全程 MYR 0，非零价格证明的是 beta 用不到的
> 路径。清单那一行改成"按种下的 beta 价格走一次（沙盒）；非零价格走查属于真钱开关仪式"。

**The owner's words, verbatim:** 「B7 照建议」.

**The ruling.** (1) The checklist's checkout line is re-cut: **walk checkout ONCE at the seeded beta
price (sandbox, MYR 0)**; the non-zero-price proof — the charge, its webhook delivery and the resulting
invoice/receipt surface — belongs to the **real-money switch ceremony**, with Stripe live mode and KYB
beside it (裁-125/126). (2) **No temporary "make the priced plan current" ops act at Wave-G.** (3) The
裁-58 dissent's mitigation is not withdrawn — it is re-homed to the ceremony that can actually discharge
it, which is the only place the charge path is real.

**The pre-上市 roadmap, as aligned in the same exchange** (recorded here because three rulings now point
at it, and written into `PROGRESS.md`'s Backlog as the ordered block the owner reads): **beta live** on
the built half (agent-template legal texts, RM 0) → **the pricing sitting** (裁-58) → **the billing TIER
tranche** (裁-144) → **the lawyer's pass** over the DPA, the beta terms and the consent text (裁-125) →
**the real-money switch + KYB + the non-zero checkout walk** = **上市**.

**Amends:** `docs/ops/wave-g-setup-checklist.md` (Billing/Stripe), `PROGRESS.md` (the Backlog roadmap
block). Digest row 89. **Open owner questions after this ruling: B8 only.**

---

### 裁-149 — B8: the runtime's background-client error CONTRACT — option C (owner, 2026-09-03 ≈17:22 MYT, shell clock)

**The question** (B8, added to §9 at ≈14:50 from rev-534's finding, as posed): the production relay pool
(`packages/runtime/lib/relay.mjs`, `makePool()`) and the leader's dedicated client (`makeClient()`)
attach no `'error'` listener. pg's contract turns any idle-client error — a backend terminated by a
failover, a pooler restart, a maintenance kill — into an `uncaughtException`, so the runtime process
dies; Fly restarts it and durable runs resume by design. Options: **A** keep crash-as-contract (zero
code) · **B** log-and-recycle everywhere (which swallows the leader's loss into a silent stall) ·
**C** the hybrid.

**The owner asked for it in plain language first** (verbatim): 「解释清楚这个, 我不是很明白」 — answered with
the switchboard analogy (an ordinary line is re-plugged quietly; the duty line dies loudly so a deputy
takes over). **Then, verbatim:** 「照建议」 — i.e. **option C**.

**The ruling.** (1) The **general pool** gets an `'error'` listener that logs at error level, **counts**,
and raises a health flag on `/ready`; it never swallows silently, and the pool recycles the client — so
an ordinary idle-backend kill costs users nothing and still leaves a trace. The reasoning is that the
relay pool is the runner's REAL connection pool, which makes a background error there an **availability
signal**, not noise: swallowing it would convert a lost backend into a silent stall. (2) The **leader's
dedicated session** stays **CRASH-LOUD**. Its loss releases the session-level advisory lock and a standby
takes over — the designed failover — so no listener may turn a lost backend into a silent stall on that
path. (3) The chosen behaviour is stated as a **CONTRACT** in `docs/ARCHITECTURE.md` — what a background
client error does to the process, per pool — because `packages/runtime/lib/relay.mjs`'s failover semantics depend on it.
(4) **Timing: after beta live.** A product PR of roughly **half a lane-unit** (the listener, the health
flag, cells including a **mutant that proves the leader path still crashes** — the reviewer's own 5/5
uncaught vs 0/5 caught pair is the instrument), riding a v7x deploy. Today's fail-loud behaviour is safe
and stands until then. Every other `new Pool` in the runtime is censused in that PR.

**Provenance:** found by rev-534 while settling the CI relay-taxonomy teardown class. That class's
TEST-side cure merged as #534 `e7577af6`; this row is the **product** half, which #534 deliberately did
not touch.

**Amends:** `docs/ARCHITECTURE.md` (the contract, at the post-beta PR — not today), `PROGRESS.md` (a
Known-issues row re-cut to "ruled 裁-149, scheduled after beta" plus a Backlog pick-list row). Digest
row 90. **With this ruling §9 of the owner page is EMPTY: no owner question is open before beta live.**

---

### 裁-150 — the post-launch agenda: the harness is the handover, and there are NO next lanes (owner, 2026-09-03 ≈18:02 MYT, shell clock)

**The owner's words, verbatim:**

> beta e2e 后所有东西都被harness 记录好了right? like backlog and knownissue..etc , beta live launch e2e 后我
> 就要close 这个session 了, 接下来的东西就是我自己看backlog/knownissue 再决定怎么完善这产品. no next lanes 了ok?
> you knwo what i mean? alliggn ours agenda of this product.

**The ruling** (alignment confirmed, not a recommendation the owner picked from — this one he stated and
the lead aligned to it):

1. **After the beta-live e2e — the Wave-G walk plus the launch sitting — THIS SESSION CLOSES.** The repo
   is the handover, which is hard constraint 8 already: the repo is the system of record and
   `PROGRESS.md` is the state authority. Every open item must therefore live there as a **Backlog** row
   or a **Known-issues** row carrying its **owner · next step · ruling number**; the machine-local memory
   cache holds lessons and preferences only, never state.
2. **NO next lanes are dispatched after launch.** The owner reads Backlog and Known issues and decides
   what to perfect; the next session starts on his ask, not on an agent's initiative.
3. The **pre-上市 roadmap** (裁-148) stays in the Backlog as the ordered list he will pick from, followed
   by the post-beta product PRs already ruled (**裁-147** the operator screen, **裁-149** the pool error
   contract) and then the day's technical rows.
4. **Two truings remain in this session:** the afternoon truing (this one — the afternoon's state, the
   two document splits, 裁-147…150) and the **FINAL clock-out truing** after the launch sitting, which
   inherits this shape and adds the launch facts, every row trued, the housekeeping (worktrees, rigs,
   the conductor and the monitors torn down) and a memory refresh of lessons only.

**Amends:** `PROGRESS.md` (the posture line's closing sentence, and the Backlog re-written as the owner's
ordered pick-list). Digest row 91.
