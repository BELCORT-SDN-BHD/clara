# Gate P — the "just emit invoice.tax_total" build is REFUSED (2026-07-27)

A design pass plus four adversarial lenses examined shipping a deterministic layout reader that
emits `invoice.total_excl_tax` / `invoice.tax_total` / `invoice.rounding`, so the
`sst_purchase_cost` leg could tie and Gate P could close.

**All four lenses refused it — two fatal, two major. The build is not being made.** Recorded here
because the reasoning is worth more than the feature.

---

## What the design got RIGHT (and it corrected me)

**`invoiceFacts.v1.azure.mjs` is NOT frozen.** Verified three independent ways: `grep -c "@frozen"`
returns 0 for the mapper and 1 for each of `.v1.ts` / `.impl.ts` / `.behavior.mjs`;
`frozen-workflows.json` holds exactly three invoiceFacts keys; and running
`scripts/check-frozen-workflows.mjs` reports 71 files, the manifest's exact entry count, which is
only possible if the mapper is absent from the frozen set. It is reached by `globalThis` injection.

**So no `invoiceFacts` v2 is required.** This supersedes the claim in
`gate-p-unblocked-and-r2-blocked-2026-07-26.md` and in `CLAUDE.md` that "Gate P needs an
invoiceFacts v2 (v1 is frozen)". That was wrong.

The corroboration analysis also held: `v_net` / `v_tax` / `v_rounding` appear in **none** of the
Tier-A terms (0016:2229-2235), so emitting them cannot flip `corroborated`. And
`purchase_sst_not_autopostable` (0016:2425-2430) fires before every other gate, so a purchase
document is structurally barred from unattended posting regardless.

**That much was sound. What follows is what it missed.**

---

## FATAL 1 — the build closes nothing

`509e788d`, the only real SST-bearing vehicle, **already has a `done` `invoice_facts`
extraction**. `_enqueue_invoice_facts_core` short-circuits with `already_completed`
(0016:3436-3443). There is **no add-region verb, no delete anywhere in migrations 0001-0021, and
`clara_runtime` holds SELECT only** (0008:36-37).

A new mapper therefore reaches **only documents extracted after deploy**. All 29 existing
documents — including the Gate P vehicle itself — remain exactly as blocked as today.

The design's own supporting findings stated this twice and step 6 contradicted both without
reconciling them.

## FATAL 2 — it switches OFF a live structural barrier

`anchor_missing` (0016:2704-2721) is the OCR-sales compensating control inside the posting
executor:

```sql
2713:    if v_gross is null or v_inv_id is null or v_inv_date is null
2714:       or v_net is null or v_tax is null
2715:       or (v_net+v_tax+coalesce(v_round,0))<>v_gross
2718:       or v_due_c<>1 or v_due_amt is null or v_due_amt<>v_gross then
2720:        ... 'anchor_missing'
```

Because `invoice.tax_total` and `invoice.total_excl_tax` have **0 occurrences across all 29
extractions**, `v_net is null or v_tax is null` is TRUE for every OCR document that exists — so
`anchor_missing` is today an **unconditional, structural refusal** on the OCR-sales unattended
lane. It depends on no threshold, no vendor score, no corpus statistic.

**This build supplies exactly the two inputs that switch it off.** The safety argument enumerated
five new consumers and called them all "adds refusals only"; this one was not on the list, and it
is a **removal** of a refusal, inside the posting executor. "The two unattended lanes stay shut
exactly as today" was false as written — the posting lane would stay shut on one barrier instead
of two.

## MAJOR 3 — it breaks the LIVE sales approve path, and its own vehicle proves it

Four ties (0016:2011-2014, 2071-2075, 2104-2107, 2108-2111) are dormant **solely** because the
Azure lane emits neither `v_net` nor `v_tax`. Emitting them makes all four live for every future
Azure-extracted **sales** invoice — on the Wave A2 path `CLAUDE.md` marks FULLY LIVE. They fire at
approve (0016:1422-1423) and again via the constraint trigger `t_je_sales_invoice_shape`
(0015:1027-1037). **None of the four accepts `amount_override`**; the escape hatch that exists on
the supplier floor (0016:3941) has no counterpart here.

The concrete break uses the design's **own** cited document. LAI LOU MEI prints:

| line | value |
|---|---|
| SubTotal | 94.30 |
| Service Charge@4% | 3.77 |
| Service Tax@6% | 5.66 |
| Rounding Adj | 0.02 |
| **Net Total** | **103.75** |

The tie at 0016:2071-2075 requires `net + tax + rounding = gross`:
**94.30 + 5.66 + 0.02 = 99.98 ≠ 103.75.**

Every figure is read correctly off the face of the document and the tie **still** fails, because a
**service charge sits outside the equation**. The same holds for any discount, delivery or
handling line — i.e. for most Malaysian F&B and retail invoices. A human would do the coding work
and be blocked at the final step, with no override.

---

## What this means for Gate P

Gate P is **not** "add a reader". Closing it requires, at minimum:

1. A **re-extraction path** for already-extracted documents — which does not exist and is a
   migration, not runtime code.
2. A decision about the four dormant sales ties, which cannot simply be woken — the
   `net + tax + rounding = gross` identity is **wrong for documents carrying a service charge**,
   so the tie itself needs revisiting before any field that activates it is emitted.
3. Explicit handling of `anchor_missing`, so a barrier is not removed as a side effect of a
   feature.

All three sit on a **FULLY LIVE** lane. This belongs in its own staged slice with its own gates,
not bolted onto a Wave-B close-out. Attempting it now risks, at best, no progress; at worst, a
regression on a lane that is serving today.

## The meta-point

The design pass was careful and its central safety argument was **verified true**. It was still
refused, because the argument's method — an exhaustive enumeration of consumers — **missed one**,
and a single missed consumer inverted the conclusion from "adds refusals only" to "removes a
barrier inside the posting executor".

Enumeration-based safety arguments are only as good as the enumeration. The adversarial pass is
what tests that, and here it prevented a production regression rather than merely improving a
design.
