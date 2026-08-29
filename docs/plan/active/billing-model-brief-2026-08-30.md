# The billing model — the owner's design input (裁-42, 2026-08-30)

> **Status: DESIGN INPUT, not a design.** This is the owner's billing model written down as he
> gave it, plus what it implies for the database and the three questions it does not answer. It is
> the **first input to a billing design set (survey → design → gate) that PRECEDES P4's checkout
> tranche** — nothing here is built until that set is gated.
>
> **裁-42 SUPERSEDES R8c's shape.** R8c (`harness-audit-rulings-2026-08-26.md`) ruled a "base
> monthly per firm + metered overage" shape with the amounts deferred to a sitting. 裁-42 replaces
> the *shape* with the model below; **the amounts are still open**, exactly as 裁-28 left them.
>
> **Ruling of record:** `mohe-grill-rulings-2026-08-29.md` §裁-42.

---

## 1 · The model, as the owner gave it

Vercel-style, **billed per FIRM**. Seven sections and one law. The section numbering is the
owner's own order, and the design set should keep it — a renumbering here would quietly become a
renumbering of what he decided.

### ① The base subscription

One per firm. It **includes** three things, each with its own included quantity: a number of **paid
seats**, a number of **Active Client slots**, and an **AI allowance**. Everything above an included
quantity is billed as its own line, never folded into the base.

### ② Paid seats

**Owner, admin and bookkeeper are paid seats. Viewer and payments-only are free.**

A seat is **capacity, not a person**: the firm buys N seats and fills them however it likes, and
moving a person between roles is a capacity question, not an identity one. The free tiers are free
because they cannot cost the product anything expensive — a viewer reads and a payments-only member
pays.

### ③ Per paid seat, an extra SHARED firm-wide AI allowance

**A seat does not carry a private quota.** Each paid seat **adds** to one firm-wide pool, and every
member of the firm draws from that pool.

This is the section most likely to be built wrong, because per-seat metering is the obvious
implementation and it is the wrong one: it would throttle a bookkeeper because a colleague was
busy, in a product whose whole thesis is that the agent does the work. **One pool, one bill.**

### ④ Active Client slots

Slots **beyond the base** are billed. A slot is **capacity, not identity** — it is not bound to a
particular client, so a firm can move one client out and another in without buying anything.

**Draft clients are FREE and slot-less — and capped.** A draft consumes no slot and costs nothing,
but it **cannot take bulk documents, cannot use AI and cannot post**. Free is not a side door into
the product.

### ⑤ Archived clients, and scheduled-for-deletion

- An archived client carries a **lower RETENTION fee**.
- **Archiving frees the Active slot.**
- **The month in which a client is archived keeps the active fee**; retention starts **from the next
  cycle**.
- **Reactivation needs a free slot** — a firm at capacity buys one first.
- **A client is never billed both fees at once.**
- **Scheduled-for-deletion keeps the retention fee until the data is PURGED.** Clicking delete does
  not stop the billing, because the data is still held. **Billing stops when the holding stops.**

### ⑥ AI overage

**Overage = usage − allowance, floored at 0.**

- The allowance **expires monthly**: no rollover, no transfer between firms, no refund.
- **The service NEVER auto-stops.** An overage is billed, never enforced by cutting a professional
  off in the middle of a close. (This is also why 裁-36 declined a trial quota: metering bills after
  the fact, and a quota would be a second, contradictory answer.)

### ⑦ Proration, and the invoice

- **Mid-month additions are prorated — and their AI allowance is prorated with them.** A seat added
  on the 20th does not hand the firm a full month's allowance.
- **Removals take effect from the next cycle.**
- **The system never auto-archives or auto-deletes a client to cut capacity.** Reducing capacity is
  always a human act.
- **The invoice shows EVERY line:** base · seats · extra active clients · archived clients · the
  allowance · the usage · the overage · tax · total. A firm owner must be able to reconstruct the
  bill from the invoice without asking anyone.

### THE CONFIGURABILITY LAW

**Every price, every included quantity, every allowance and every ratio is CONFIGURABLE. Nothing is
hard-coded.**

The seven sections above are the *shape*. The numbers are **data** — they are expected to change
without a migration, and any design that puts a price in a function body, a CHECK constraint, a
frontend constant or a Stripe object that the database does not own has failed this law.

---

## 2 · What this implies the DB must own

Named here as design input, not as a schema. **A billing figure is an authoritative number**
(constraint 2 / PRD §6): no model-generated numeral and no frontend arithmetic may enter an invoice
— every line must be reproduced by a **versioned deterministic evaluator** from DB-owned inputs, the
same discipline the reporting lane already runs under.

1. **A configuration relation — the shape suggests `clara.billing_plans`** — holding **every** price,
   included quantity, allowance and ratio the model names: base price · included seats · included
   Active Client slots · included AI allowance · per-seat price · **per-seat added allowance** ·
   per-slot price · archived-retention price · the overage rate. Effective-dated, so a price change
   is a new row rather than an UPDATE that rewrites history — the `fx_rates`/`sst_rate_schedule`
   idiom the estate already uses for facts that change on a date.
2. **A client state machine**, because the billing rules are written on its transitions:
   `draft` → `active` → `archived` → `scheduled_for_deletion` → `purged`. Each transition carries a
   billing consequence stated in §1⑤ — the archive month keeps the active fee, retention starts next
   cycle, reactivation needs a free slot, purge is what stops the meter — so the transitions must be
   **audited and dated**, not inferred from a status column's current value.
3. **A monthly rollup evaluator over `llm_usage_events`** — F-A9's single ledger is already the
   substrate (R8c named it, and 裁-42 does not move it). The rollup produces the firm-month usage
   figure the overage line reads. It is a **frozen evaluator** by the same law every other number
   generator obeys: a version, a freeze, and a re-derivation that reproduces the byte.
4. **Stripe objects that MIRROR the configurable shape** — products and prices generated from the
   configuration relation, never authored independently in the Stripe dashboard. The direction
   matters: the database is the source and Stripe is the projection. A price that exists only in
   Stripe is a hard-coded price with extra steps, and it breaks the configurability law from
   outside the repo where no gate can see it.

**A note the design set should not lose:** seats and slots are **capacity**, so the natural key is a
count per firm-month, not a row per person or per client. Modelling them as identities is the
mistake that makes proration and reactivation hard.

---

## 3 · The owner questions this brief LEAVES OPEN

Three, and the design set cannot close any of them.

1. **The amounts.** Every number in §2 item 1 is unset. 裁-28 recorded what this blocks and 裁-42 does
   not change it: **not** the build and **not** beta, but **the Stripe product/price objects, the
   checkout's price display and the first charged day**. The conductor still owes the promised
   data-backed brief — the **cost floor measured from live LLM usage** and the **Malaysian market
   band** — as the input to that sitting.
2. **What "AI usage" is DENOMINATED in.** The model says "allowance" and "usage" without saying in
   what unit. Two candidates, and they behave differently: **RM at list price** (the firm sees money
   and the number survives a model change, but the product must maintain a price list per model) or
   **tokens** (mechanically exact, directly out of `llm_usage_events`, but meaningless to an
   accountant and unstable the day a model's pricing moves). A third possibility — an abstract
   "credit" — is really the first one wearing a different name. **Recommendation to put at the
   sitting: RM at list price**, because §1⑦ requires an invoice a firm owner can reconstruct, and
   nobody reconstructs a bill out of tokens. **Fail-closed until ruled:** the rollup stores **both**
   the raw token counts and the RM figure it derived, so whichever way the ruling goes, no historical
   month has to be recomputed from data that was not kept.
3. **Grace on unpaid.** §1⑥ says the service never auto-stops on **overage**. It says nothing about
   an **unpaid invoice**, which is a different event: a card that fails, or a firm that stops paying.
   The question is what happens and after how long — and it is a product ruling, not a policy detail,
   because the answer touches a professional's access to books he is legally responsible for. **Note
   for whoever drafts the options:** the archived-retention rule (§1⑤) already establishes the
   owner's instinct that **holding data is what costs**, which argues for read access surviving
   longer than write access.

---

## 4 · What happens next

**A billing design set — survey → design → gate — precedes P4's checkout tranche.** The sequence is
the estate's standard one and the reason is 裁-42's own: the model has enough moving parts (two
capacity meters, a state machine with billing consequences on four transitions, proration on both
the fee and the allowance) that a checkout wired before the model is designed would hard-code
something.

- **Survey:** what exists today — F-A9's `llm_usage_events` ledger and its reshape, the client
  lifecycle as actually implemented, the firm/membership role model behind §1②, and what P4's design
  of record already assumes about checkout.
- **Design:** §2's four artefacts, with the configurability law as an acceptance criterion rather
  than an aspiration — a design passes only if a reviewer can point at where each of the nine
  configurable values lives in the database.
- **Gate:** the independent pass, plus §3's three questions carried to the owner as gate cards with
  recommendations, costs and fail-closed defaults.

**Until the amounts land, nothing charges.** The design set can be built, gated and merged against
an unpriced configuration relation; the first charged day still waits on the sitting.
