# The checkout / signup gate — gate record (questions for the owner)

*2026-08-31, **v2** after the independent review (FIX REQUIRED — 3 BLOCKER, 14 MATERIAL, 9 NIT;
all folded). The design gate R8 reserved for the self-serve tenant-creation door. Measurement:
[`checkout-gate-survey.md`](checkout-gate-survey.md). Design:
[`checkout-gate-design.md`](checkout-gate-design.md) + [part 2](checkout-gate-design-part2.md) +
[part 3](checkout-gate-design-part3.md).*

**What this file is — now a CLOSED ledger.** 裁-93 ruled every remaining question per its
recommendation, signed ADR-0077 and endorsed the CSRF deferral; 裁-89 · 裁-90 · 裁-91 · 裁-92 ruled
G1 · G5 · G11 · G10 by name. **Nothing here is open.** Each card keeps the question as it was put,
with its ruling at the top — plus **one withdrawn** (G8, whose subject the fold removed) and **two
declarations** (things the orders already authorised me to
decide, recorded rather than asked) and **two recorded constraints**. The design builds around
none of the ten: it carries the recommended answer at the point of use, so a different ruling
changes a named thing rather than the shape.

**What changed in v2, because it changes what G1 is asking.** The review proved that the door I
specified **stranded the paying customer**: it required an unconsumed payment while consuming it
on the first call, so the retry path I called "rotation" was unreachable. **The design's stated
default was not a working option.** G1 is therefore no longer "which of three readings" — it is
**a repaired rotation versus the fold**, and the fold is the safest thing on the table. Three
questions are new (G10, G11, G12), all of them costs the owner had not been shown.

---

## G1 · **RULED (B) — 2026-08-31 evening, 裁-89.** Fold the two doors into one

> **RULED: (B), the fold.** One door, one transaction — claim, create the firm, close the
> registration. 裁-73's two-step wording is amended by the same ruling; the standard-SaaS journey
> is unchanged, only the door collapses. The design is amended to the ruled shape; what follows is
> the card as it was put, kept as the record of the choice.
>
> **What the fold turned out to buy, beyond what this card promised.** Working it out in the
> design produced a consequence nobody had priced: **the folded door needs no admission token at
> all**, because a single transaction has no gap to carry a credential across. So
> `clara.firm_admissions` is untouched, **`create_firm` is not re-cut, and the train's D1
> write-quiesce window disappears** — which restores 裁-73's own "the existing `create_firm`
> unchanged … no D1 window" prediction that v2 had to report as a divergence. Seven acceptance
> cells retire with their subjects, and 裁-26's email-bound token is superseded (INFORM under G7).

**大白话.** 客人付了钱，系统要给他"开公司的钥匙"。原本写的是"钥匙只发一次" —— 但**如果他拿到钥匙、
浏览器下一秒死掉，就再也拿不到第二把了：钱付了，公司开不成，卡死**。这是审查抓到的最大问题，已经修好。
现在真正要你选的是两种修法。

| | **(A) repaired rotation** *(specified)* | **(B) fold the two doors into one** *(recommended)* |
|---|---|---|
| shape | `claim_paid_admission` mints a token → the server calls `create_firm` with it → `close_paid_registration` | one door does claim → create → close **in one transaction** |
| where the token goes | DB → the app server → back to the DB | **never leaves the database** |
| retry after a crash | works: the next call supersedes the stale token and mints a fresh one | nothing to retry — it either happened or it did not |
| failure modes it removes | — | **the stranding class and M5's unreachable closer** — and under (B) the state *"firm exists but registration still open"* is **unreachable**, so `reconcile_paid_registrations` is not needed at all: **the fold deletes a door rather than adding one** |
| what it does NOT remove | — | **the double payment (M7/G12).** Two sessions completing is settled at ⑦, before ⑧ runs; `uq_frp_registration` plus the applier's duplicate-payment problem row handle it identically under **either** option |
| cost | matches 裁-73's written two-step shape exactly | **deviates from 裁-73's wording**; one door does two jobs |

**Recommendation: (B), if you are willing to amend 裁-73's wording.** The reviewer agrees, and so
do I. 裁-73 wrote the two-step shape before anyone had measured that the estate has no pre-firm
transaction boundary; every failure mode above lives in the seam between the two calls, and the
fold deletes the seam rather than defending it.

**One correction to my own earlier pitch for the fold** (the reviewer flagged it and is right that
I overstated it, though not entirely): I said the token "never goes over the wire". In the
two-door shape both calls are already made server-side, so the token never reaches the *browser* —
that part was overstated. What it *does* do today is cross the application↔database connection
twice and sit in the app server's memory, where it can reach a log or an error report. **The
fold's real gain is that a live bearer credential never enters the application tier at all.** That
is still material; it is just narrower than "over the wire".

**If (A) is ruled**, the design as written is complete and correct — no further work.

---

## G2 · DECLARATION, not a question — where Stripe's Product and Price come from

The FS-4 order already authorised this decision (*"or a minimal `billing_plans` seed if PR-1 is
not built yet — **say which**"*), so it is recorded rather than asked (M13).

**Chosen: land the minimal `clara.billing_plans` table with the one beta plan row and
`amounts_ruled = false`.** Not the capacity walls, not the four lifecycle doors, not the D1 recuts
that make billing PR-1 heavy. **Why:** 裁-42's law — Stripe objects are generated FROM DB rows,
never authored in the dashboard — then holds from the very first Stripe object that ever exists,
instead of being retrofitted onto one that was hand-made. **Cost:** billing PR-1 later *widens*
this table rather than creating it, and PR-1's own gate must be told. Overrule if you would rather
PR-1 own it whole and this train wait.

---

## G3 · Which app owns the webhook — the runtime, or `apps/web`?

> **RULED — 裁-93, per recommendation: `packages/runtime`.** 裁-92 strengthens it rather than
> disturbing it: the confirmation wall's doors are reached the same way, so `apps/web` still holds
> no database credential.

**Recommendation: `packages/runtime`.**

| | `packages/runtime` *(rec.)* | `apps/web` |
|---|---|---|
| raw body for the signature check | needs a router mounted before `express.json()` at `src/index.ts:55` — **the estate already does exactly this** for `intakeRoutes()` at `:53` | Next route handlers give the raw body naturally |
| database credential | already holds privileged DSNs from the environment | would be **the first database credential in the browser-facing app** |
| cost of the choice | one more surface on a process that already had the keys | a new credential class in the app users' browsers talk to |

**The reason is corrected from v1 (M3).** I had written that `apps/web` "references no service
credential at all" — **the design's own environment table falsifies that**, since the checkout
route needs `STRIPE_SECRET_KEY`. The honest reasons are the raw-body constraint and *not adding a
DATABASE credential*, which is a sharper property and still decides it the same way.

---

## G4 · The rate wall (裁-36 · 裁-64①) — the short design sitting

> **RULED — 裁-93, per recommendation: option (B), the peppered digest; and G4b (i), a plain
> refusal with a contact route.** 裁-92 gives the same pepper a second job — the confirmation
> wall's email and origin digests (part 3 §2.1) — so one secret serves both walls.

**大白话.** 裁-36 定了"一个 IP 一天只能开一间公司"，裁-64① 定了形状：网页把看到的地址传给数据库的
门，**墙还是数据库**。没定的是：**传过去的是地址本身，还是地址的指纹？**

| | **(A) the address** | **(B) a peppered digest** *(recommended)* |
|---|---|---|
| the door's argument | `p_client_ip inet` | `p_origin_digest bytea` = `sha256(pepper ‖ address)` |
| the wall | in the DB, per address | in the DB, per digest — **identical strength** |
| what is stored | **an IP address — personal data** under this repo's own PDPA memo | a digest unlinkable to an address without the pepper |
| operator can ask "which IP?" | yes | no |
| cost | a new personal-data category, with its own retention question | one more secret, carried through DR |

**Recommendation: (B).** Identical wall, identically in the database, and the estate does not take
on personal-data retention for an anti-abuse counter that never reads it back. Rotating the pepper
resets the 24-hour window — the right blast radius for a rate wall.

**G4b · the shared-office case.** Two people in one accounting office behind one connection: the
second is a real customer, refused. The design already exempts a person's *own* retries (or 裁-74's
resume-checkout arm would attack the paying customer). For the genuinely-second person:
**(i) refuse with a plain sentence and a contact route** *(recommended — costs an inbox to watch
during beta, and never loses a real customer)* · (ii) raise the limit to N/day (weakens the wall) ·
(iii) refuse silently (**rejected** — reads as a bug and they leave).

---

## G5 · **RULED — 裁-90.** We draft the beta text; the owner and a lawyer swap it at launch

> **RULED.** The beta DPA is **delegated to us** — drafted from the existing `docs/ops/legal/` pack
> as a plain, visible consent step, standing as a **placeholder** until the owner and a lawyer swap
> it at the official-launch sitting.
>
> **The design already carries the swap, and it costs nothing to perform.** A new text is a **new
> `dpa_documents` row and a version bump** — `effective_to` stamped on the old row, the new one
> current. **It is not a schema change and not a migration**, and M8 already ensures a customer
> mid-flow is not stranded by it: `checkout_intents.dpa_version` pins the version their intent
> opened under, and `claim_paid_firm`'s W8 reads *that* through the payment's own session id, never
> "the newest". So the launch swap can happen with customers in flight.
>
> **What ships meanwhile is no longer empty.** The v2 fail-closed default was `dpa_documents`
> shipping with no rows, which refused every firm creation. Under 裁-90 the delegated draft **is**
> the beta row, so the door opens — and the honest note on the signup step says the agreement is a
> beta text pending legal review, rather than implying it has had one.

*The question as it was put, kept as the record:*

**The finding I most want you to see.** 裁-68① requires a DPA e-sign at signup against "the
`docs/ops/legal/` text, owner-confirmed once". That directory holds exactly three files and **none
is an agreement between Clara and a signing firm**: an OpenAI-DPA compliance brief written *for
you*; a letter a **firm sends its own clients**; and an internal PDPA cross-border memo. Each is
headed "DRAFT FOR OWNER REVIEW AND SIGNATURE" and each was written by an agent, not a lawyer.

- **(i) commission or approve a real customer-facing DPA before C-1 lands** *(recommended)*.
  **Cost:** a lawyer and some days. The mechanism ships inert meanwhile — `dpa_documents` empty,
  `sign_dpa` refusing `unknown dpa version`, so **no firm can be created at all**, which is exactly
  裁-36①'s "no signature, no firm" and is fail-closed by construction.
- (ii) ship an interim text assembled from the three drafts. **Cost: a real agreement with real
  legal effect, drafted by an AI, signed by real customers.** I do not recommend it and would want
  the ruling in writing.
- (iii) defer the DPA wall past beta — **contradicts 裁-68① and 裁-36①**; recorded so the option is
  visible, not because it is advisable.

**Sequencing:** the train can be built and reviewed in full while the text is pending. It cannot be
switched on for a real customer until this is answered. That is a property of the design, not a
blocker on building it.

---

## G6 · The pre-firm half of this journey cannot be audited — acceptable at beta?

> **RULED — 裁-93, per recommendation: (i), accept at beta; the append-only tables are the
> record.** *Nuance worth knowing rather than a change: 裁-91 makes `stripe_events` a projection,
> so an investigation has the reconciliation keys but no customer identity — by design. The
> identity lives on the registration and the user row, which is where it belongs.*

**大白话.** Clara 的审计日志和事件流每一行都必须挂在一间公司底下 —— 我量过，两张表的 `firm_id` 都是
NOT NULL。可是**公司出生之前的每一步**（认领身份、提交注册、签 DPA、付款、领钥匙）根本挂不上去。今天
`claim_identity` 和 `request_firm_registration` 就是一行审计都不写。

- **(i) accept at beta; the six append-only tables ARE the record** *(recommended)* —
  `dpa_signatures`, `registration_rate_events`, `checkout_intents`, `stripe_events`,
  `stripe_event_problems`, `firm_registration_payments`. **Cost:** answering "what happened to this
  applicant" means joining six tables. Fine at beta's volume.
- (ii) add a `clara.pre_firm_audit` append-only relation now. **Cost:** one more table and one more
  write on every pre-firm door; the read becomes trivial.
- (iii) make `domain_events.firm_id` nullable — **rejected**: it is `PRIMARY KEY (firm_id, seq)`
  with a per-firm sequence. That is a redesign of the event spine, not a column change.

**Backlog trigger for (ii):** the first time anyone has to answer "what happened to this signup"
and cannot.

---

## G7 · The measured divergences from 裁-73's text — confirm each

The ruling was written before this measurement existed. Each is reported, not taken. **裁-89 retired
the second one** — the fold restored 裁-73's own prediction — and added an INFORM at item 4.

1. **"marks the registration PAID"** — `firm_registration_requests.status` carries a live CHECK
   admitting exactly `open | approved | rejected`. **Chosen:** record payment in
   `firm_registration_payments` and leave the CHECK alone. *Cost:* the status column no longer
   tells the whole story alone. *Alternative:* widen the CHECK — a named successor-constraint edit
   on a live table that **still needs the payment table anyway** for the Stripe ids, so it adds a
   value without removing anything.
2. **"the existing `create_firm` unchanged … no D1 window"** (M1) — **RETIRED by 裁-89: no
   longer a divergence.** v2 had to re-cut `create_firm` to carry 裁-26's email wall into the body
   that redeemed the token. The folded door redeems no token and calls `_create_firm_core`
   directly, so **`create_firm` is untouched and the D1 inventory is EMPTY** — 裁-73's own
   prediction, restored. Nothing owed here.
3. **"a webhook that mints exactly one `firm_admissions` row"** (NIT-7) — **under 裁-89 nothing
   mints an admission row at all.** The webhook writes only to the append-only event store; the
   folded door creates the firm directly. *Cost:* none; recorded because G7 is where divergences
   get named.

4. **INFORM, not a question — 裁-26's email-bound admission token is superseded.** 裁-26 ordered
   that admission tokens be bound to an email at issue, because an unbound token is a bearer
   credential anyone holding it can redeem. **Under 裁-89 the self-serve path issues no token**, so
   there is nothing to bind and nothing to steal; the door's own `req.applicant = clara.jwt_sub()`
   wall is a statement about identity rather than about a spelling of it. **The ruling's purpose is
   served by deleting the credential rather than binding it.** 裁-26 still governs any *other*
   admission token the estate mints (the seed and fixture path is unchanged). Overrule if you want
   the binding built anyway on a path that no longer has a credential to bind.

---

## G8 · **WITHDRAWN by 裁-89** — there is no admission token to expire

This asked how long an unused admission token may live, and recommended one hour. **The fold
removed the token itself**: a single transaction has no gap to carry a credential across, so the
self-serve path mints nothing that could expire, rotate, leak or be superseded. The sub-question
about recording a superseded token goes with it.

**Nothing is owed here and no answer is needed.** It is kept rather than deleted because the owner
was shown it, and a question that vanishes without explanation is worse than one that is answered.
*(The seed and fixture bootstrap still mints admission tokens; nothing about that path changes, and
this gate never proposed an expiry for it.)*

---

## G9 · CLOSED by 裁-54 — not a question

I had asked whether Stripe Tax should be enabled at a zero-amount price. **裁-54 already answers
it:** SST on Clara's invoices is computed by Stripe Tax, switched on when BELCORT's own SST
registration status says so, and **"no tax line before registration"**. So: `automatic_tax` stays
off until BELCORT is registered, and nothing here needs a ruling.

---

## G10 · **RULED — 裁-92, and AGAINST this card's recommendation.** The 6-digit code

> **RULED: option (ii), the emailed six-digit code.** The owner chose **cross-device experience over
> the cryptographic binding**. This card had recommended (i) — accept the cross-device cost now, rule
> (ii) in later if beta showed failures — so **the ruling is a deliberate overrule, not an
> application of the recommendation.** Recorded plainly here because 裁-93 rules the remaining cards
> "per their recommendation", and applying that phrase to G10 would silently reinstate PKCE.
>
> **What it buys:** cross-device signup works fully, and **the login-CSRF vector disappears with the
> link** — the attack needed a link the attacker could send, and there is no longer one.
> **What it costs:** a six-digit space is guessable, so the rate wall becomes **mandatory**, and the
> binding drops from cryptographic to "the address is the person's own". Part 1 §3 designs both,
> §3.8 states the residual, and part 3 §2.1 + cells W-H…W-H6 are the walls.

*The question as it was put, kept as the record:*

**大白话.** 为了堵住那个安全漏洞，确认邮件**必须在"当初注册的那台机器"上打开**。在笔电上注册、
用手机点邮件里的链接 —— 会失败。会计师事务所大多用 Microsoft 365，手机看邮件是常态。

**裁-68③ asked for a browser binding; it did not ask to lose cross-device signup, and you have not
been shown this cost.** It is not a PKCE quirk — **any** browser-bound scheme has it, a hand-rolled
nonce included, because the secret lives in the browser that started the flow.

| | cost |
|---|---|
| **(i) accept it** | a real fraction of signups fail on the first attempt. Mitigated: the design now renders *"open this on the device where you signed up"* with a **resend** control, instead of a generic error (that mitigation ships regardless of this ruling) |
| **(ii) email a 6-digit CODE instead of a link** *(recommended if cross-device matters to you)* | Supabase supports it (`{{ .Token }}` + `verifyOtp({email, token})`). The person reads the code on their phone and **types it into the tab where they signed up** — cross-device works, and the binding survives because the *original tab* supplies the email. **Cost:** a different signup UX, a small design of its own, and a **weaker binding than PKCE's** — it binds to "a browser that knows this email" rather than cryptographically to the flow. It also requires that the email come from the browser's own signup state, never from a URL parameter |
| (iii) keep a `token_hash` fallback arm | **reopens the login-CSRF hole this entire gate exists to close. Not recommended at any price** |

**Recommendation:** ship (i) with its distinguishing message now, and rule (ii) in if the first
week of beta shows cross-device failures. (ii) is a contained addition, not a redesign.

---

## G11 · **RULED — 裁-91, per this card's recommendation.** A redacted projection

> **RULED: option (i).** `stripe_events` stores a **redacted projection** — reconciliation fields
> only (event id, type, session/intent ids, amount, currency, status, timestamps, livemode). **No
> `customer_details` PII lands in the database at all**; the full raw event stays Stripe-side, and
> the webhook route **verifies the signature over the raw body, projects, and discards it**.
>
> **This dissolves the problem structurally rather than building a door for it.** A store holding no
> personal data needs no erasure path, so `stripe_events` stays strictly append-only — which was the
> property option (ii) would have had to break. Part 2 §1.2 carries the DDL, the allow-list-is-the-
> wall / CHECK-is-the-mistake-net reasoning, and the note that the applier is unaffected because
> everything it reads was already a reconciliation field.

*The question as it was put, kept as the record:*

**The inconsistency worth your attention.** G4 puts a whole sitting to you about storing an **IP
address** because it is personal data under this repo's own PDPA memo. Meanwhile the design stores
Stripe's **entire** `checkout.session.completed` payload — `customer_details` carries email, name,
address, phone and tax ids — in a table whose BEFORE UPDATE, DELETE **and** TRUNCATE all raise.
**There is by construction no erasure path at all.** I took the privacy-conservative option on the
IP and the privacy-maximal one on the payload, and never showed you the second.

| | cost |
|---|---|
| **(i) store a redacted subset** — ids, amounts, status, our own metadata; drop `customer_details` at the door *(recommended)* | the raw payload is no longer available for a dispute; Stripe still holds it and remains the system of record for what Stripe saw |
| (ii) keep the full payload, add a retention/erasure door | an append-only table gains a deletion path — a real weakening of a wall, and it needs its own design |
| (iii) accept and record the lawful basis | cheapest today; leaves an unbounded personal-data store with no erasure answer, which is the thing a PDPA request would land on |

**Recommendation: (i).** It is the only option that keeps the table strictly append-only *and*
keeps the personal-data surface small. The applier needs the ids and the metadata, nothing else.

---

## G12 · NEW — the double-payment residual

> **RULED — 裁-93, per recommendation: (i), leave it visible in the problems queue and handle it
> by hand at beta — and (iii) stands: no real money is taken until the duplicate path has an
> answer.** Unaffected by the fold and by 裁-92.

Two Checkout Sessions can be in flight for one registration (the customer opens checkout twice).
Both can complete, producing two distinct Stripe events. **The design now writes only one payment
row** (`uq_frp_registration`) and records the second as a `duplicate_payment` problem — so it is
**visible**, not silently accepted.

**What is not decided is what happens next.** At RM0 it is two zero-amount subscriptions, which is
untidy and harmless. **After 裁-28's amounts are ruled it is a genuine double charge**, and this
design contains no refund path.

- **(i) beta: leave it visible in the problems queue and handle it by hand** *(recommended)* —
  cost: an operator watches the queue; at beta volume that is minutes.
- (ii) build cancel-the-other-session into the applier now — cost: a Stripe write from the applier,
  which is a new class of act for it, before anyone can be charged anything.
- **(iii) whichever you pick, it is a named precondition on the pricing sitting**: no real money
  may be taken until the duplicate path has an answer.

---

## G13 · **RULED — 2026-08-31 evening.** Beta runs the whole journey on Stripe TEST mode

> **RULED.** Beta walks signup → checkout → webhook → firm entirely in **Stripe TEST mode**;
> **KYB and live-mode activation are deferred to the pricing + official-launch sitting.**
> Consistent with 裁-87 ("TEST first; LIVE at the launch sitting").

**The design consequence, and it is a real one.** At RM0 a *real* beta customer must never be
asked to type a test card. So **payment collection is config-driven from the plan row**, per the
billing brief's configurability law — every configurable is a column, never a value baked into a
body:

| while | `payment_method_collection` | why |
|---|---|---|
| the plan's amount is **0** (裁-58's trial) | `'if_required'` | Stripe collects no card for a zero-amount subscription, so a beta customer completes checkout **without entering payment details at all** |
| once the amounts are ruled (裁-28) | `'always'` | 裁-73's "card collected, nothing charged" becomes real the moment there is something to charge |

**This corrects NIT-1 as it was folded in v2**, which pinned `'always'` unconditionally. That was
right for the *ruled intent* and wrong for *RM0 beta*: it would have demanded a card — in test
mode, a test card — from a real customer opening a real firm. The value is read from the plan row
the Checkout Session is built from, so it flips with the pricing sitting and needs no code change.

**Wave G still walks a non-zero test price with test cards** (裁-58's recorded mitigation), which
is where the `'always'` arm is exercised before any real money exists.

---

## Recorded constraints — not questions, but they bind the build lane

**No `"use server"` Server Actions anywhere in this train.** This train adds exactly **three**
server entries to `apps/web` — the confirmation verify POST, POST /checkout, and the
/checkout/success POST — and each is a route.ts HTTP-method export. Steps ③ and ④ call their
doors from the **client** over PostgREST, as the built signup form already does.

**The reason, stated in the order that matters.** First: Next's own guidance is that page-level
authentication does not protect Server Actions and that each action must re-verify authorization
itself — and on this train those endpoints create a firm. Second: every `page.*` / `route.*` leaf
is enumerated by the scope census and **must be registered with a written reason** — a route in
`SCOPE_EXEMPT_SURFACES` (or as an entrance), a page in `SCOPE_UNSCOPED_SURFACES` — so this train's
**four** new surface files are forced to declare themselves; **a `"use server"` file is enumerated
by nothing and declares nothing.** *(An earlier draft justified
this by the census's firm-scope blindness. That was the weaker argument and not the operative one
here — none of this train's surfaces are firm-scoped, since the customer has no firm until ⑧.)*

Measured across `main` and all four open web branches: **zero** `"use server"` modules and **no**
`template.tsx`. So this train is not repairing a hole — it is declining to open the first one, on
the most dangerous door in the system, while the instrument is known blind. **The blind spot is
not empty, though:** seven non-LEAF App Router files already live in it, so the acceptance cell
watches that whole family as a named roster rather than two hand-picked names that happen to be
zero. **If a build lane later wants an action, that is not a local call:** the census fix must
land first, as a stated precondition on the build PR.

**The Wave-G setup line for the confirmation template, superseding owner-batch item 85 AND this
gate's own v3 amendment of it.** Item 85 said the token-hash form (prefetch-safe, no binding); v3
amended that to the PKCE intermediate-page form (prefetch-safe *and* bound). **裁-92 supersedes
both**, and simplifies the act:

| the Wave-G setup act | value |
|---|---|
| the "Confirm signup" template | emits **`{{ .Token }}`** — the six-digit code, **and no link at all** |
| the prefetch problem item 85 raised | **moot** — a mail scanner cannot consume a code it merely reads. No link, no prefetch, no intermediate page, no `confirmation_url` to validate |
| **the OTP expiry** | **shorten from the 24-hour default to 10 minutes.** This is the one act with no in-repo enforcement — no route, migration or CI job can read it (part 1 §3.4), so it needs your receipt. C1/C2's attempt walls are what bound the exposure if it is missed |
| autoconfirm | stays **DISABLED**, unchanged |
| the Redirect URLs allowlist | now needs only `<origin>/signup`; **/auth/confirm no longer receives a redirect** because nothing links to it |
