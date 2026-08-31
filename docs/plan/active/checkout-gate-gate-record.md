# The checkout / signup gate — gate record (questions for the owner)

*2026-08-31, **v2** after the independent review (FIX REQUIRED — 3 BLOCKER, 14 MATERIAL, 9 NIT;
all folded). The design gate R8 reserved for the self-serve tenant-creation door. Measurement:
[`checkout-gate-survey.md`](checkout-gate-survey.md). Design:
[`checkout-gate-design.md`](checkout-gate-design.md) + [part 2](checkout-gate-design-part2.md) +
[part 3](checkout-gate-design-part3.md).*

**What this file is.** **Ten questions** the rulings do not settle, each with a recommendation and
what every option costs — plus **two declarations** (things the orders already authorised me to
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

## G1 · The admission door — repaired rotation, or fold the two doors into one?

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

## G5 · The DPA text does not exist — and it is not one of the three drafts

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

## G7 · Three measured divergences from 裁-73's text — confirm each

The ruling was written before this measurement existed. Each of these is reported, not taken.

1. **"marks the registration PAID"** — `firm_registration_requests.status` carries a live CHECK
   admitting exactly `open | approved | rejected`. **Chosen:** record payment in
   `firm_registration_payments` and leave the CHECK alone. *Cost:* the status column no longer
   tells the whole story alone. *Alternative:* widen the CHECK — a named successor-constraint edit
   on a live table that **still needs the payment table anyway** for the Stripe ids, so it adds a
   value without removing anything.
2. **"the existing `create_firm` unchanged … no D1 window"** (M1) — **I re-cut it**, because
   裁-26's email wall has nowhere else to live: the token is compared inside that body. It is the
   train's one D1 item, on **the most dangerous live body in the estate**, with its `prosrc` sha
   `59fa533d9c03` pinned before the edit and the delta proven by inverse re-substitution.
   *Cost:* one write-quiesce window that 裁-73 priced at zero.
3. **"a webhook that mints exactly one `firm_admissions` row"** (NIT-7) — minting moved to
   `claim_paid_admission`, per the FS-4 order's own ruled shape. The webhook writes only to the
   append-only event store and mints nothing. *Cost:* none that I can find; the order already
   ruled it, and it is recorded here because G7 sets the precedent that divergences get named.

---

## G8 · How long may an unused admission token live? (proposed: one hour)

裁-26 hashed the token and bound it to an email; **nothing rules an expiry**, and
`firm_admissions` had no `expires_at` column. **Recommendation: one hour.** The token is minted on
the success page and used in the next request; an hour is generous by orders of magnitude, and
rotation means an expired token is never a dead end — the customer clicks again and gets a fresh
one. *Alternatives:* 24 hours (a live credential usable for a day, for no gain rotation does not
already give) · no expiry (the legacy behaviour: a leaked token valid forever).

**Sub-question:** when rotation supersedes a still-valid token, record it? **Recommendation: yes** —
the superseded row is marked `superseded_at`, never deleted (裁-74), because "my link stopped
working" is exactly the report nobody can otherwise explain.

---

## G9 · CLOSED by 裁-54 — not a question

I had asked whether Stripe Tax should be enabled at a zero-amount price. **裁-54 already answers
it:** SST on Clara's invoices is computed by Stripe Tax, switched on when BELCORT's own SST
registration status says so, and **"no tax line before registration"**. So: `automatic_tax` stays
off until BELCORT is registered, and nothing here needs a ruling.

---

## G10 · NEW — PKCE costs cross-device signup. Is that acceptable? *(BLOCKER-3)*

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

## G11 · NEW — PDPA retention and erasure for the Stripe event store

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

**An amendment owed to owner-batch item 85, BEFORE you perform the Wave-G setup act.** Item 85
tells you to set the Supabase "Confirm signup" template to the token-hash form, *not* the default
ConfirmationURL, because mail scanners prefetch and consume it. **That reason is correct and this
gate does not overturn it** — but the same protection is available *with* the browser binding:
Supabase's own documented prefetch mitigation is an intermediate landing page carrying the
confirmation URL as a query parameter, **which is exactly the page P4-3 already built**. The
emailed link points at our page, a scanner consumes nothing, and the explicit click carries the
PKCE flow. The token-hash form is prefetch-safe **and has no browser binding at all** — the hole
this gate exists to close. So item 85's line should be amended to the intermediate-page form
before you set the template.
