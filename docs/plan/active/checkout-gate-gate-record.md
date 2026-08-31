# The checkout / signup gate — gate record (questions for the owner)

*2026-08-31. The design gate R8 reserved for the self-serve tenant-creation door. The
measurement is [`checkout-gate-survey.md`](checkout-gate-survey.md); the design is
[`checkout-gate-design.md`](checkout-gate-design.md) + [part 2](checkout-gate-design-part2.md).*

**What this file is.** Nine things the rulings do not settle, each stated in plain language, each
with a recommendation and what each option costs. **The design builds around none of them** — it
carries the recommended answer and says so at the point of use, so a different ruling changes a
named thing rather than the shape.

**The one thing this gate is NOT asking.** Whether to build the checkout at all, or in what
shape — 裁-73 ruled that and the design implements it. **G1 and G7 are the two places where the
measurement met the ruling's words and found more than one faithful reading**; both are reported
here rather than chosen silently.

---

## G1 · "mints exactly one admission and returns its plaintext once" — which of three?

**大白话.** 客人付了钱，系统给他一把"开公司的钥匙"，他拿这把钥匙去开公司。裁-73 说"只发一把，钥匙只
给他看一次"。问题是：**如果他看了钥匙，但浏览器在下一秒死掉了呢？** 钱付了，钥匙没用上，也不能
再看一次 —— 那这个人就卡在半路，有钱没公司。

Three readings of the ruling, and they behave differently:

| | what it means | if the browser dies mid-way |
|---|---|---|
| **(a) strict** | after the first call, always refuse | **the customer is stranded** — paid, no firm, no path forward |
| **(b) receipt** | store the plaintext and hand it back on replay | fine for the customer, but **a live bearer credential sits at rest in the database** — exactly what 裁-16b removed from `firm_admissions` in `0147` |
| **(c) rotation** *(the design's choice)* | each call mints a **fresh** key and kills the previous unused one | the customer retries and it just works; **no plaintext is ever stored**; "exactly one" is a database unique index, not a promise |

**Recommendation: (c).** "Exactly one" stays literally true — a UNIQUE index allows exactly one
admission per registration — and "once" stays true, because each key is shown on the one call
that made it and can never be read again. Two firms remain impossible whatever happens, because
the database already refuses a second firm for a person who has one
(`uq_membership_active_user`, measured).

**A fourth option, which is simpler still — fold the two doors into one.** Instead of "give me a
key, then open the firm with it", one door does both inside a single transaction:
`claim_paid_admission_and_create_firm(registration, firm_name, op_key)`. **The key would then
never leave the database at all** — not to the server, not over the wire, not into a log.
*Cost:* it deviates from 裁-73's written two-step shape, and it makes one door do two jobs. *Gain:*
the entire class of "what if it dies between the two calls" disappears, and there is no plaintext
token anywhere outside one transaction. **If the owner is willing to amend 裁-73's wording, this
is the safest design on the table and I would take it.** The delta from (c) is small — the same
walls, one fewer round trip.

---

## G2 · Where do Stripe's Product and Price come from, when `billing_plans` does not exist?

**大白话.** 裁-42 定了铁律：Stripe 上的产品和价格必须从数据库的行生成，**绝不可以在 Stripe 后台
手打**。但那张表（`billing_plans`）属于 billing PR-1，还没建 —— 我在活的目录里量过，它不存在。

| option | cost |
|---|---|
| **(i) land the minimal `billing_plans` table + the one beta plan row now** *(recommended)* | this train builds a slice of billing PR-1. PR-1 later *widens* the table rather than creating it — a small coordination cost, and PR-1's own gate must be told |
| (ii) a beta-only table that PR-1 drops later | a throwaway object in the estate, and a migration whose whole job is to delete it |
| (iii) hand-author the Price in the Stripe dashboard | **not an option — 裁-42 forbids it by name.** Recorded only so nobody re-proposes it |

**Recommendation: (i).** Just `billing_plans` with the beta row and `amounts_ruled = false` —
**not** the capacity walls, **not** the four lifecycle doors, **not** the D1 recuts that make
PR-1 heavy. The law that objects come from DB rows then holds from the first Stripe object that
ever exists, instead of being retrofitted.

---

## G3 · Which app owns the webhook — the runtime, or `apps/web`?

**大白话.** Stripe 付款成功后会来敲一个门。这个门需要一把数据库钥匙。放在哪个程序里？

| | `packages/runtime` *(recommended)* | `apps/web` |
|---|---|---|
| privileged DB credentials | **already holds them**, from the environment (`CLARA_RUNTIME_DATABASE_URL` etc.) | **holds none today**, and its own build proves the one public key is publishable-class |
| raw-body handling | needs a router mounted before `express.json()` at `src/index.ts:55` — **the estate already does exactly this for `intakeRoutes()` at `:53`** | Next route handlers give the raw body naturally |
| what a compromise costs | one more process that already had the keys | **a new class of secret in the browser-facing app** |

**Recommendation: the runtime.** The deciding reason is the last row: `apps/web` currently
references no service credential at all, and that is a property worth keeping. The raw-body
constraint is real either way and is measured, not assumed — a webhook router mounted after line
55 is *silently* broken, and the fix is one line's placement.

---

## G4 · The rate wall (裁-36 · 裁-64①) — the short design sitting

**大白话.** 裁-36 定了"一个 IP 一天只能开一间公司"。裁-64① 定了形状：网页那一层把看到的地址传给
数据库的门，**墙还是数据库**。没定的是：**传过去的到底是地址本身，还是地址的指纹？**

| | **Option A — the address** | **Option B — a peppered digest** *(recommended)* |
|---|---|---|
| the door's argument | `p_client_ip inet` | `p_origin_digest bytea` = `sha256(pepper ‖ address)` |
| the wall | in the DB, counting per address | in the DB, counting per digest — **identical** |
| what is stored | **an IP address — personal data** under the PDPA reasoning this repo already carries | a digest that is unlinkable to any address without the pepper |
| operator can ask "which IP?" | yes | no |
| extra secret | none | one (`CLARA_RATE_WALL_PEPPER`), carried through DR |

**Recommendation: Option B.** The wall is exactly as strong and exactly as much in the database.
The estate simply does not take on a new category of personal data — with its own retention
question — for an anti-abuse counter that never needs to read it back. Rotating the pepper resets
the 24-hour window, which is the right blast radius for a rate wall.

### G4b · The sub-decision the ruling does not reach: shared offices

**大白话.** 一间会计楼里两个人，同一条网线。第一个开公司成功，第二个当天被墙挡住 —— 他是真客户，
不是滥用。

The design already exempts a person's **own** retries (otherwise the resume-checkout arm of
裁-74 refuses on the second attempt and the wall attacks the paying customer). The open question
is the genuinely-second person behind one NAT:

- **(i) refuse with a plain sentence and a contact route** *(recommended)* — "we can only open one
  firm from this network each day; write to us and we will open yours" — an honest refusal with a
  human door behind it.
- (ii) raise the limit to N per day — weakens the wall for a case that is rare at beta.
- (iii) refuse silently — **rejected**; it looks like a bug and the customer leaves.

**Cost of (i):** an inbox to watch during beta. Given beta's size, that is the cheapest of the
three and the only one that never loses a real customer.

---

## G5 · The DPA text does not exist yet — and it is not one of the three drafts

**This is the finding in this gate I most want the owner to see.** 裁-68① requires a DPA e-sign
at signup, with "the `docs/ops/legal/` text, owner-confirmed once". That directory holds exactly
three files, and **none of them is a data processing agreement between Clara and a signing
firm**:

| file | what it actually is |
|---|---|
| `openai-dpa-brief.md` | a brief about **OpenAI's** DPA — an upstream-processor analysis, for the owner |
| `client-ai-authorization-letter-template.md` | a letter a **firm sends its own clients** |
| `pdpa-cross-border-transfer-basis-memo.md` | an internal memo on the s.129 transfer basis |

Each is headed "DRAFT FOR OWNER REVIEW AND SIGNATURE" and each was written by an agent, not a
lawyer. **So the thing the signup page must display and record a signature against has not been
written.** Options:

- **(i) the owner commissions or approves a real customer-facing DPA before C-1 lands**
  *(recommended)*. The mechanism is built and inert until the text exists — `dpa_documents` is
  empty and `sign_dpa` refuses `unknown dpa version`, so **no firm can be created**, which is
  exactly 裁-36①'s "no signature, no firm" and is fail-closed by construction.
- (ii) ship with a composed interim text assembled from the three drafts. **Cost: a real
  agreement with real legal effect, drafted by an agent, signed by real customers.** I do not
  recommend it and would want the ruling in writing.
- (iii) defer the DPA wall past beta — **contradicts 裁-68① and 裁-36①**, and is recorded only so
  the option is visible.

**Note the sequencing this creates:** the checkout train can be built and reviewed in full while
the text is pending. It cannot be *switched on* for a real customer until G5 is answered, because
the door refuses. That is a feature of the design, not a blocker to building it.

---

## G6 · The pre-firm half of this journey cannot be audited — is that acceptable at beta?

**大白话.** Clara 的审计日志 (`audit_log`) 和事件流 (`domain_events`) 每一行都必须挂在一间公司
底下 —— 我量过，两张表的 `firm_id` 都是 NOT NULL。可是**"公司还没出生"之前的每一步**（认领身份、
提交注册、签 DPA、付款、领钥匙）根本挂不上去。今天 `claim_identity` 和
`request_firm_registration` 就是一行审计都不写的。

The design's answer: **every new pre-firm table is append-only and timestamped and IS the
record** — `dpa_signatures`, `registration_rate_events`, `checkout_intents`, `stripe_events`,
`stripe_event_problems`, `firm_registration_payments`. From `create_firm` onward the ordinary
spine takes over. So the *facts* are all durable; what is missing is a single place to read "what
happened to this applicant, in order".

| option | cost |
|---|---|
| **(i) accept it at beta; the six tables are the record** *(recommended)* | an investigation means joining six tables by applicant. Acceptable at beta's volume |
| (ii) add a `clara.pre_firm_audit` append-only relation now | one more table and one more write on every pre-firm door; the read gets easy |
| (iii) make `domain_events.firm_id` nullable | **rejected** — it is `PRIMARY KEY (firm_id, seq)` with a per-firm sequence. This is a redesign of the event spine, not a column change |

**Recommendation: (i)**, with (ii) named in the backlog with its trigger — *the first time anyone
has to answer "what happened to this signup" and cannot*.

---

## G7 · The applier "marks the registration PAID" — but there is no `paid` status

**Measured contradiction with the ruled shape, reported not resolved.**
`firm_registration_requests.status` carries a live `CHECK (status = ANY (ARRAY['open',
'approved','rejected']))`. 裁-73's wording implies a fourth value.

| option | cost |
|---|---|
| **(i) record payment in `firm_registration_payments`; leave the CHECK alone** *(recommended, and what the design does)* | the status column no longer tells the whole story on its own — but the payments table holds the Stripe ids a status value could never carry, plus a composite FK binding the payment to its applicant |
| (ii) widen the CHECK to admit `paid` | a named successor-constraint edit on a live table, **and** the payment row is still needed for the Stripe ids — so this adds a value without removing a table |

**Recommendation: (i).** The two are not alternatives in practice: (ii) is (i) plus a widening.
Raised because 裁-73 says "PAID" and a reader may expect to find it as a status.

---

## G8 · How long may an unused admission key live? (proposed: one hour)

**大白话.** 领了钥匙没马上开公司 —— 钥匙多久过期？

裁-26 hashed the token and bound it to an email; **nothing rules an expiry**, and
`firm_admissions` has no `expires_at` column today (measured). The design proposes **one hour**,
on the reasoning that the key is minted on the success page and used in the next HTTP request —
an hour is generous by three orders of magnitude, and G1(c)'s rotation means an expired key is
never a dead end: the customer clicks again and gets a fresh one.

| option | cost |
|---|---|
| **one hour** *(recommended)* | a customer who walks away mid-step for longer clicks once more |
| 24 hours | a live credential sits usable for a day for no gain the rotation does not already give |
| no expiry | the legacy behaviour; a leaked key is valid forever |

**A related sub-question the owner may want to rule:** when rotation invalidates a
still-valid key, should anything be recorded? **Recommendation: yes** — the superseded
admission's deletion is worth an append-only note, because "this key stopped working" is the kind
of thing a confused customer reports and nobody can otherwise explain.

---

## G9 · Stripe Tax at a zero-amount price (裁-54 / billing OQ-5)

**大白话.** 现在收 RM0，没有税可算。要不要现在就把 Stripe Tax 打开？

| option | cost |
|---|---|
| **(i) do not enable `automatic_tax` at beta; carry it with billing OQ-5** *(recommended)* | when amounts arrive, the subscription objects need the setting added — a mirror re-run, not a rebuild |
| (ii) enable it now on the zero-amount subscription | it computes nothing at RM0, so it proves nothing; and it makes an unruled tax decision (OQ-5) by default rather than by ruling |

**Recommendation: (i).** 裁-58 says nothing charges until the pricing sitting, so there is no tax
question to answer yet, and answering it by default is how an unruled decision becomes a fact
nobody remembers making.

---

## Recorded constraints — not questions, but they bind the build lane

**No `"use server"` Server Actions anywhere in this train.** Every server-side step is a
route.ts HTTP-method export. The reason is in the design at part 1 §1.1 and is a measured
instrument gap, not a style preference: the scope-spine census enumerates surface leaves with
`/^(page|route)\.(ts|tsx|js|jsx)$/`, so a `"use server"` file — or a root `template.tsx` — can
reach firm-scoped data with the full suite green. Next's own guidance is that page-level
authentication does not protect Server Actions. The census fix is ordered and has not landed.

Measured while folding this in, so the rule's scope is honest: `apps/web` today holds **zero**
`"use server"` files and **no** `template.tsx`. **This train is not repairing a hole — it is
declining to open the first one, on the most dangerous door in the system, while the instrument
that would catch it is known blind.** Cell W-R pins it as a positive count.

**If a build lane later believes a Server Action is the right shape here, that is not a local
call:** it needs the census fix landed first, stated as a precondition on the build PR. Raise it
rather than taking it.

## An amendment owed to owner-batch item 85 — BEFORE the owner performs the Wave-G setup act

**Not a question; a correction with evidence, flagged because the owner is queued to act on the
current wording.** Item 85 in `mohe-owner-batch-2026-08-31.md` (from #461's Codex leg, N1) tells
the owner to set the Supabase "Confirm signup" template to the token-hash form, explicitly *not*
the default ConfirmationURL, because that default is consumed by mail scanners. **The prefetch
reason is correct and this gate does not overturn it.** What item 85 did not have is that the
same protection is available *with* the browser binding.

- The bare default ConfirmationURL points at Supabase's own verify endpoint → a scanner's GET
  consumes it. Item 85 is right about that, and Supabase documents the limitation.
- Supabase's **own documented mitigation** is an intermediate landing page carrying the
  confirmation URL as a query parameter, with a button the human clicks — **which is exactly the
  page P4-3 already built**. The link in the mail points at our page; a scanner consumes nothing;
  the explicit click carries the PKCE flow; and the code that comes back is useless without the
  verifier cookie.
- The token-hash form, by contrast, is prefetch-safe **and has no browser binding at all** —
  which is the hole this gate exists to close.

**So item 85's line should be amended to the intermediate-page form before the owner sets the
template**, not left as written and then contradicted by this train. If the owner prefers to keep
the token-hash form, the binding has to be hand-rolled instead, and
[the design's §3.3 table](checkout-gate-design.md) prices that — it is the more expensive answer
and it leaves the ingress-log sibling finding open. **The three Wave-G setup lines that change:
the template's form, /auth/confirm staying in the Redirect URLs allowlist (unchanged), and
autoconfirm staying DISABLED (unchanged).**

## What I am proceeding on if nothing is ruled

Fail-closed defaults, so the train can be built and reviewed while these sit:

| | default |
|---|---|
| G1 | rotation (c); the fold is **not** taken without a ruling |
| G2 | the minimal `billing_plans` + one beta row, `amounts_ruled = false` |
| G3 | the webhook lives in `packages/runtime` |
| G4 | the peppered digest; the applicant's own retries exempt; a shared-NAT refusal with a contact route |
| G5 | **`dpa_documents` ships EMPTY.** `sign_dpa` refuses, so **no self-serve firm can be created at all** until the owner confirms a text. This is the fail-closed default and it is deliberate |
| G6 | the six append-only tables are the record; a `pre_firm_audit` relation goes to the backlog |
| G7 | `firm_registration_payments`; the CHECK is untouched |
| G8 | one hour, and the superseded admission is noted |
| G9 | `automatic_tax` off; carried with billing OQ-5 |

**And the one cutover line that does not wait for any of these.** "Self-serve signup is
unreachable in a deployed build until this train closes the confirmation browser binding" is a
hard FS-10 criterion already carried in `PROGRESS.md`. The design's answer to it is
[part 1 §3](checkout-gate-design.md) — Supabase's native PKCE exchange, recommended over a
hand-rolled nonce because @supabase/ssr 0.12.5 **already** runs PKCE in both of its clients
(measured in the shipped `dist`) and the app simply never consults the verifier it is already
writing. **That is a configuration and route change, not a new mechanism** — and it closes the
recorded sibling finding (`token_hash` reaching ingress logs) as a side effect, which a nonce
does not.
