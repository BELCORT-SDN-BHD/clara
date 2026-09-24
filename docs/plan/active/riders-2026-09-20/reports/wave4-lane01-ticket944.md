# Wave 4 · lane 01 · ticket #944 — Blueprint: read-versus-derive (PRD 112, glossary, architecture)

**Status: STOPPED.** Worktree `C:\Users\zhant\Desktop\clara-wt\635`, branch `riders/w4-lane01`,
database `127.0.0.1:55741/clara_l01`. Base `cd2925391`.

```
git log --oneline cd2925391..HEAD   →  (empty — #944 is the first ticket this lane has touched)
git status                          →  clean, nothing to commit
```

No commit was made for this ticket. No file in the repository was edited. This report records why
and hands the orchestrator (or a wayfinder/to-spec session) the exact target text so the actual
edit can be applied without re-deriving it.

## The ticket is the contract

`gh issue view 944 --comments`. Body (the only Agent Brief; one triage comment, dated 2026-09-19,
not an owner ruling, so nothing here overrides the body): parent is **#926**, the owner ruling
closed 2026-09-18 ("option G — a payroll summary and a contract go down the same lane as any other
accounting document, read and posted, not merely stored"). #926's own ruling comment says in full:
"**Published as six `ready-for-agent` tickets:** #944 (blueprint wording, and the architecture row
#782 still owed) · #945 (payroll typed facts...) → #946 → #947 · #945 → #948 → #949." #944 is
explicitly the documentation-only sibling of #945's build; the ticket body says so directly ("No
code, no migration, no behaviour change") and lists three acceptance criteria, all of them edits to
`docs/PRD.md`, `CONTEXT.md` and `docs/ARCHITECTURE.md`.

**WAVE-4 LANE RULE (e)** in my prompt states this precisely: "#944 is a blueprint statement that
lands with #945: prove it by the same cells, no separate build." I read this as confirming what the
work order already requires (below): #944 has no code path of its own to build or test; its claim
becomes true once #945's cells exist, and its wording is not shipped as an isolated lane commit.

## Why this stops here — the binding rule

`docs/plan/active/riders-2026-09-20/WORK-ORDER.md` extends
`docs/plan/active/refresh-wave-2026-09-18/WORK-ORDER.md` rules 0–10 (riders WORK-ORDER.md line 5).
That base work order's rule 5 (item 10) reads, verbatim:

> **Never edit `docs/PRD.md` or `docs/ARCHITECTURE.md`** — they are blueprints refreshed only by
> wayfinder/to-spec sessions (AGENTS.md steps 4–5). If your delivery contradicts a blueprint
> sentence, say so in your report under "blueprint drift"; the orchestrator decides.

`AGENTS.md`'s own working-protocol rule 4 says the same: PRD and Architecture are "best to
refresh/update/adjust the possible stale sections only after Wayfinder or to-spec session." Ticket
#944's entire deliverable is edits to exactly the two files this rule forbids a lane ticket from
touching (plus `CONTEXT.md`, which is not itself forbidden but whose edit alone would leave AC4 —
"No contradiction is left between the three documents" — unsatisfiable, since the PRD and
ARCHITECTURE halves cannot land from this lane).

**Direct precedent, same lane, one wave earlier:** `reports/wave2-lane03-ticket782.md` (the ticket
#944 explicitly says it "repays the blueprint debt #782 left") hit the identical wall and recorded
it the same way: *"`docs/ARCHITECTURE.md:529` does still describe them as `planned` — see
Follow-ups; I did not touch it, because the work order forbids editing `docs/ARCHITECTURE.md` from
inside a ticket."* Its own follow-up #3 asks for that exact row to be overwritten "when [a
wayfinder/to-spec pass] runs." This report extends that same follow-up with the #944 wording.

## Verified: not already satisfied

Read all three target locations on this branch (base `cd2925391`, unchanged from `main` — no prior
ticket in this lane touched them):

1. **`docs/PRD.md:112`** (the payroll/inventory scope bullet under "当前版本已交付"), current text
   in full:
   > 工资与存货相关会计的**记账侧**：可以记录已提供的工资法定义务和定期存货调整。期间、方法或义务种类、精确金额、科目、来源与指示都由会计师提供，产品只核对这些说明之间的一致性，**不发明任何缴纳率、门槛或员工层面的计算**。表单、上传／引用和对话三个入口都可用。

   The prohibition clause (bold above) is present and unchanged-worthy per the AC ("keeps its
   existing prohibition unchanged"), but no sentence anywhere in the bullet distinguishes deriving
   from reading, and nothing points at the capability registry. **Not satisfied.**

2. **`CONTEXT.md:761`**, the "Supplied obligation particulars" term (this is "the domain glossary's
   typed-fact entry" the AC names — grepped the whole file for `derive`/`typed fact`; this is the
   only payroll-shaped entry), current text in full:
   > The facts an accountant provides for a payroll or statutory obligation: what it is, for which
   > period, how much, which expense and liability accounts it moves, any staff-advance or
   > settlement account it touches, how much of it was settled through that settlement account when
   > the accountant states a figure, and the source those figures came from. The product records
   > them and checks the relationships between them — a stated settlement amount must be exactly
   > what the posted payment leg carries; **it derives none of them**.

   Still reads "it derives none of them" — the AC asks for "it computes none of them." **Not
   satisfied.**

3. **`docs/ARCHITECTURE.md:529`**, §7 "已接受但未实现的目标" (accepted-but-unimplemented targets)
   table, current row:
   > `| 发票行项目（line items）的类型化事实 | 能力目录中显式标为 planned，当前不抽取行项目 |`

   Still calls invoice line items `planned` — #782's owner ruling (2026-09-18, landed on `main` in
   migration `0245_invoice_line_items_accepted_limitation.sql`, per `wave2-lane03-ticket782.md`)
   already reclassified that registry value to `accepted_limitation`, so this row is stale (exactly
   the debt #944's body names). And no row in §7 records payroll/contract typed facts as an accepted
   target at all. **Not satisfied**, and AC3's two halves (fix the stale row, add the new one) are
   both outstanding.

## Draft text for the wayfinder/to-spec session (not applied — see above)

Handed over as a starting point, not a final blueprint sentence — voice calibration for `docs/PRD.md`
and `docs/ARCHITECTURE.md` is the orchestrator's/wayfinder session's call, not a lane ticket's.

**1. `docs/PRD.md:112`** — append one sentence before "表单、上传／引用和对话三个入口都可用。":
> ...不发明任何缴纳率、门槛或员工层面的计算。**这条限制针对的是推算，不针对阅读——工资单、合同等文件本身印出的数字，Clara 可以读取并记录；具体到哪一种文件读到多深，由能力目录（capability registry）按文件种类分别规定。**表单、上传／引用和对话三个入口都可用。

**2. `CONTEXT.md:761`** ("Supplied obligation particulars") — one-word change at the end of the
paragraph:
> ...a stated settlement amount must be exactly what the posted payment leg carries; it **computes**
> none of them.

(was: "it derives none of them.")

**3. `docs/ARCHITECTURE.md:529`**, §7 table — overwrite the stale row and add one new row (house
shape: "目标 | 与当前实现的差别"):
> `| 发票行项目（line items）的类型化事实 | ~~能力目录中显式标为 planned~~ 已由 #782（owner ruling 2026-09-18，migration 0245）改判为已接受的限制，本版本按设计只读取表头字段，不抽取行项目 |`
>
> `| 工资单与合同印出数字的类型化事实 | #926 owner ruling（2026-09-18，option G）已接受：工资单与合同和其他会计文件走同一条读取＋过账车道；能力目录今天仍将其发布为 stored_only（migration 0191），落地由 #945–#949 承接 |`

The second row's own wording should be re-checked once #945 actually lands and the capability
registry is re-derived (its own AC): the exact "differs from today" phrase may need to shift from
"仍将其发布为 stored_only" to naming whatever intermediate state #945's migration leaves mid-wave.

## Gates

No file was added, edited or touched; no migration was written (none was needed or attempted — this
was never a migration question). `git status` is clean. No db/runtime/web test file, no SQL
function, no `apps/web` surface was touched, so none of rule 8's gates apply. `typecheck`/`lint`
were not re-run: there is nothing in this diff for them to check (repo state is byte-identical to
base `cd2925391`).

## Successor contract

**None is owed.** #944 touches no door, no grant, no callable verb, no chat/Work-tool surface, and
no frozen closure. It is documentation only.

## Follow-ups worth filing

1. Apply the three edits above (or their reworded equivalents) to `docs/PRD.md:112`,
   `CONTEXT.md:761` and `docs/ARCHITECTURE.md:529` §7 in a wayfinder/to-spec session, per
   `AGENTS.md` rule 4 and the work order's own escape valve ("the orchestrator decides"). Best
   timed alongside or after #945 lands, since #945's cells are what "prove" AC3/AC4 per WAVE-4 LANE
   RULE (e) — landing the wording first would describe a target #945 has not yet delivered.
2. `wave2-lane03-ticket782.md`'s own follow-up #3 (the stale `docs/ARCHITECTURE.md:529` row) and
   this ticket's AC3 are the same row: one edit closes both. Worth a cross-reference note when the
   wayfinder session runs so it is not mistaken for two separate asks.
3. `packages/runtime/lib/trade-invoice-basis.ts`'s comment above `tradeInvoiceLineSchema` (flagged
   as stale, un-fixable from a ticket, by `wave2-lane03-ticket782.md` follow-up #2 — a frozen
   workflow body) is unrelated to #944 but sits beside the same §529 row; noted here only so the
   wayfinder session does not conflate the two.

## Anything unverified

- Whether the exact Chinese wording drafted above matches the house voice `docs/PRD.md` and
  `docs/ARCHITECTURE.md` otherwise use — I did not attempt to make it final, per the binding
  "never edit" rule; it is a starting point for whoever runs the wayfinder/to-spec session.
- Whether #945–#949 will land with a shape that matches the second new §7 row's wording exactly —
  not built by this ticket, not verified here.
