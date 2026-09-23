# Wave 2 · lane 09 · fix round (#839, #880, #905, #885)

- **Branch** `riders/w2-lane09`, worktree `C:\Users\zhant\Desktop\clara-wt\659`
- **Base** `23cfad947b5598214168ba9c43d391b4e16aa745` (the integrated head of wave 1). The lane is
  `BASE..HEAD`, never `origin/main..HEAD`.
- **New head** `3a4e34315101366370e1e339fa2b77a644bbd550` (21 commits on the lane)
- **Database** `127.0.0.1:55749/clara_l09`, 233 migrations, frontier `0268_work_source_correction_supersede`
- **Inputs** `wave2-lane09-review-adversarial.json` (REJECT), `wave2-lane09-codereview-spec.json`
  (accept-with-fixes), `wave2-lane09-codereview-standards.json`. Every finding is answered below,
  notes included.

Commits added by this round:

| commit | what it closes |
|---|---|
| `d717803ce` `fix(web): #839 one restate control per Work per transcript, above the bookkeeper floor, proven by render` | L09-ADV-05, L09-ADV-06, L09-SPEC-03, L09-SPEC-04, L09-SPEC-10, STD-2 |
| `366283206` `test(db): #880 #905 migrations 0266 and 0267 get the gate module a skip is not evidence without` | L09-ADV-08 |
| `8109567c7` `docs(db): #839 #880 #905 migrations 0265, 0266 and 0267 get their README sections` | STD-1a, STD-1b, STD-1c |
| `e4d742151` `feat(web): #885 a correction that retires work says so, where the correction was made` | the surface half of L09-ADV-01 |
| `3a4e34315` `fix(web): #839 #880 #885 the lane's own three lint errors, found by running the gate` | a gate the lane had not run |

## 1 · What the earlier fix worker had already landed

A previous fix worker was interrupted by a usage limit. Its finished work is these commits, re-run
green here rather than redone:

| commit | what it closed |
|---|---|
| `c5d3bec54` `fix(db): #885 a DERIVED basis is not re-admitted, and one Work never refuses a human's correction` | L09-ADV-01 (blocker), L09-ADV-03, L09-SPEC-02, L09-SPEC-07 (recorded), L09-SPEC-12 |
| `894d2dd6c` `fix(web): #885 the superseded sentence says what is true of every path that reaches it` | L09-ADV-02, L09-SPEC-01 |
| `68c975c21` `fix(web): #905 the recent-success drilldown drops the status term the tile never had` | L09-ADV-04 |
| `4c82c806d` `fix(web): #880 the claim label reaches a desktop reader, and an absent claim_id is not a claim` | L09-SPEC-05, L09-ADV-07 |
| `4dc9acac4` `docs(db): #885 migration 0268 states which authority path the restatement now has` | a #957 redo, comment-only |

It also left **three uncommitted files** — `apps/web/components/parts/WorkCards.tsx`,
`apps/web/components/parts/work-cards.test.tsx`, `apps/web/components/work/work-question-panel.tsx`
— its unfinished #839 slice. **Judged on its merits and completed, not reverted.** The design was
right (one owner of the restate control per Work per transcript, and the durable `work_accepted`
card is that owner), but the slice did not work. Measured before touching it:

```
node --import ./test/bootstrap.mjs --import tsx --test components/parts/work-cards.test.tsx
→ 16 cells, 14 pass, 2 FAIL — and the FILE never exits (killed at 600s; at 25s with --test-timeout)
  · "839 (AC2) … RENDERS the restate control"  → unhandledRejection, TypeError: Cannot read
    properties of undefined (reading 'length'), at parseCookie ← @supabase/ssr documentCookieGetAll
  · "839 (AC3) … EXACTLY ONE restate control"  → settleUntil timed out: the control never appeared
```

Its `NEXT_PUBLIC_SUPABASE_ANON_KEY` stub stopped `createBrowserClient` throwing, which only moved
the crash one layer in. See L09-SPEC-04 below for the two harness facts that had to be fixed.

## 2 · The #885 blocker: what "re-admitted on the corrected facts" means at the admission seam

> **SUPERSEDED IN PART by the Second fix round below (see the end of this file).** The
> `user_direct` half of this section — a human's own instruction may be carried forward — was
> measured by the independent recheck to leave exactly the blocker's own stale post on that arm,
> and no arm re-admits any more. Read §2 here for the reasoning about a DERIVED basis, which
> still stands and now applies to every basis kind.

**The decision, and the evidence for it.** The owner's 2026-09-20 ruling says a parked Work is
"cancelled and re-admitted ON THE CORRECTED FACTS". At the admission seam there are exactly two
kinds of basis, and `clara.accounting_work.basis_origin` already names them (0184's own BASIS GATE):

- **`user_direct`** — the human's own instruction. A correction of what the document SAYS does not
  move it, so the successor is admitted carrying it verbatim. That *is* re-admission on the
  corrected facts: the facts changed, the instruction did not, and the successor's run re-reads the
  document.
- **`clara_interpreted`** — DERIVED from the reading that has just been corrected. **There is no
  corrected basis to derive at this seam.** Deriving one means re-running the agent's
  interpretation of the document; that is a runtime act, not something a SQL door can do inside the
  correcting transaction. And carrying the retired basis forward is the blocker itself:
  `basis_digest` is fixed at admission and `clara._record_journal_entry_core` compares a posted
  basis against it, while nothing in the estate compares a posted AMOUNT against the document's
  facts — so such a successor could post **only** the pre-correction figure, against the corrected
  document, and be accepted.

So: **a derived basis is not re-admitted at all.** The Work is retired through 0199's own
`clara.cancel_accounting_work`, the human's correction still commits, and the receipt carries
`replaced: false, not_replaced_reason: 'interpreted_basis'`. That is the first half of the
adversarial reviewer's own `required_fix` ("do not auto-admit a successor for it — cancel and leave
the restatement to a human, which is what #721's door is for").

**And the person is told the truth, on both sides of the correction.**

- The one about to answer the question: `convergeSuperseded` no longer claims "a new Work is
  already running on the corrected figures" (`894d2dd6c`). It now says only what is true of every
  path that reaches that word.
- The one who made the correction: they were told **nothing at all**. The door has reported
  `superseded_work` on its own receipt since 0268 and `document-revision-dialog.tsx` awaited that
  receipt and threw it away. `e4d742151` hands the receipt to the caller, and the facts table says —
  where the correction was made — how many Works this correction stopped, how many carried on with
  the same instruction, and how many were **not** replaced, *with the reason*: "their figures were
  read from the value you just corrected, so somebody has to give the instruction again."

**About the proof the prompt asked for** — "a cell that posts or prepares against the corrected
figure, with the expected value written as a literal from the corrected document". Under the
shipped decision there is no successor to post the corrected figure with: the interpreted-basis arm
admits nothing at all, so a "posts the corrected figure" cell cannot exist without re-introducing
the blocker. The carrying cell is its mirror image, and it is the literal-versus-literal comparison
the instruction is after:

- **`w885.interpreted.not_carried`** (`packages/db/tests/work-source-correction-supersede.test.mjs`)
  — a parked Work with `basis_origin='clara_interpreted'` whose lines were derived from a document
  reading **RM 640.00**; `clara.revise_document_fact` corrects `invoice.total` to **RM 999.00**
  (both literals from the fixture document, neither recomputed the way the code computes it); the
  cell asserts the Work is retired, that **no successor exists**, and that the receipt says
  `replaced=false, not_replaced_reason='interpreted_basis'`. The run's own lane note:
  `w885.interpreted.not_carried: work 90826619 retired, replaced=false, reason interpreted_basis`.
  Seen red for the right reason by the earlier worker (a successor WAS admitted); re-run green here
  inside the 110-test gate run.
- **`w885.sibling_posted.commits`** — an unrelated sibling Work's posted entry makes
  `restate_accounting_work` refuse CLR13; the correction still commits to `facts_version 2`, the
  parked Work is still retired, and the door's own `detail.reason` (`source_already_posted`) rides
  the receipt.

**What this decision does NOT give, stated plainly.** A `clara_interpreted` Work retired this way
leaves nothing queued: a person has to state the instruction again. The db records *why* on three
relations (the cancellation's op key `source_corrected:<revision>:<work>`, the `clara._audit` row,
the `_finish_op` receipt) but **not as a first-class cancellation reason** — L09-SPEC-07, and the
successor contract in §6. The correcting surface now says it; the answering surface says the true
but weaker `convergeCancelled` ("This Work was stopped, so its question is closed"), because
`superseded_by` is null on that arm and the door has no first-class reason to key a better sentence
on. That is a follow-up, not a false statement.

## 3 · Adversarial findings

| id | sev | outcome |
|---|---|---|
| L09-ADV-01 | blocker | **fixed** — `c5d3bec54` (db) + `e4d742151` (the surface half); §2 |
| L09-ADV-02 | major | **fixed** — `894d2dd6c` |
| L09-ADV-03 | major | **fixed** — `c5d3bec54` |
| L09-ADV-04 | major | **fixed** — `68c975c21` |
| L09-ADV-05 | major | **fixed** — `d717803ce` |
| L09-ADV-06 | major | **fixed** — `d717803ce` |
| L09-ADV-07 | minor | **fixed** — `4c82c806d` |
| L09-ADV-08 | minor | **fixed** — `366283206` |
| L09-ADV-09 | note | **kept**, with the reason measured |
| L09-ADV-10 | note | **integrator note**, unchanged |

**L09-ADV-01 / L09-SPEC-02.** §2. Carrying cells `w885.interpreted.not_carried`,
`w885.sibling_posted.commits`, `w885.supersede.cancels`, `w885.answer.superseded`,
`w885.feed.successor` — `work-source-correction-supersede.test.mjs` 8/8 inside the 110-test gate
run. The assertion message the spec reviewer called out ("the Work points at the successor admitted
on the corrected reading", `rig-docs-source-revision.test.mjs`) was corrected in the same commit;
that battery is 16/16.

**L09-ADV-02 / L09-SPEC-01.** `WorkQuestion.convergeSuperseded` now reads: *"This Work was replaced
by a newer one, so this question is closed. The replacement carries the same admitted instruction
and will ask again if it needs to; a figure that has to change needs a new restatement."* It asserts
no source correction (a plain #721 restatement reaches the same word and is no longer told a
document was corrected) and no corrected figures (which was never true of the shipped mechanism).
`work-question-form.test.tsx` carries a guard cell that the sentence asserts no correction; re-run
green here.

**L09-ADV-03.** `clara.revise_document_fact` is no longer hostage to `restate_accounting_work`'s
refusals: CLR10/CLR13 are caught **per Work** inside a subtransaction, the reason is carried to the
receipt, and the Work is retired through 0199's door anyway. CLR04 is deliberately **not** caught —
an authority refusal is never downgraded into a silent skip. Cell `w885.sibling_posted.commits`.

**L09-ADV-04.** The tile and its drilldown now describe one population: the receipt window carries
the whole meaning and the `status=completed` term is gone from the dated arm
(`apps/web/lib/work/client-work-pack.ts:305`, `status: dates === null ? ["completed"] : []` — the
DATELESS arm keeps it, because a link with neither window nor filter would open every Work the
client ever had, and that arm already prints `recentSuccessListUndated` beside itself).
`p650.pack.recent_success_drilldown` gained a fourth fixture (posted but not settled) and asserts
set equality against a list read with **no** status term, plus the control that a `status=completed`
read still drops it. `client-work-pack.test.mjs` 13/13; `home-board-walk` 27 passed on this lane's
triple.

**L09-ADV-05 + L09-SPEC-03 + L09-SPEC-10.** One owner per Work per transcript.
`WorkQuestionCard`'s own `RestateWorkPanel` mount is **deleted** — it was the duplicate (both gates
were true at exactly the same moment, a Work parked on a pending question, and
`PartRenderer` renders both kinds in one transcript), and it was the mount that ignored the card's
own `addressable` gate and could have built the `/clients//work/<id>` link the card exists to
refuse (L09-SPEC-10 falls with it). The durable `work_accepted` card is the rail's single owner and
withholds the offer on the Work's own detail route, through the new pure, exported
`onWorkDetailRoute` — `useParams()` is an App-Router context read this harness has no seam for, so
the decision is a function, exactly as `offersRestateFor` is. The reviewer was right about the app
shell: `app/(firm)/layout.tsx` renders `<RailMount />` for the whole group and the Work detail page
is inside it.

Cells (`components/parts/work-cards.test.tsx`): `839 onWorkDetailRoute: the rail knows when it is
sitting on the Work's own detail page`, and `839 (AC3) a transcript carrying BOTH work cards for one
Work offers EXACTLY ONE restate control`, which renders a `work_accepted` and a `work_question` part
for one Work and COUNTS the controls. Vacuity control: with a second mount restored on the sibling
card, the AC3 cell fails `2 !== 1`; subject restored byte for byte (md5 checked).

**L09-ADV-06.** `offerRestate = bookkeeperPlus && !onOwnWorkDetail` — the same rank conjunct the
sibling Cancel Work control on that card already applies, for the same stated reason
(`clara.restate_accounting_work` reaches `clara._work_door_ctx`, which raises CLR04 below
bookkeeper; and a restatement cancels the Work, so it is at least as destructive as the control the
rule was written for). Cell `839 (fix round, L09-ADV-06) the SAME card withholds restate below the
bookkeeper floor`: it is the AC2 wait **inverted** (`assert.rejects(settleUntil(…, 1500 ms))`,
against ~20 ms measured for the control to appear at bookkeeper rank) rather than a fixed number of
hops, plus a positive control that the question door really was read for this Work — so the absence
is the same measurement as the presence. Vacuity control: with the rank conjunct removed the cell
fails in 5.5 ms with *"Missing expected rejection: a viewer is offered no restate control at all"*.

*(Why the inverted wait rather than two blind settles: the interrupted worker's version settled
twice and then asserted absence. Against a subject that DOES offer the control that shape HANGS
instead of failing — measured, 20 s timeout then `RangeError: Array buffer allocation failed` —
because this harness cannot keep settling once base-ui's `<Textarea>` inside `RestateWorkPanel` is
mounted. It is a harness artefact, not a product defect: the AC2 cell mounts the same control and
passes in 20 ms because it stops settling the moment the control appears.)*

**L09-ADV-07.** A claim is now a non-empty string id, decided in one exported helper
(`row.claim_id !== null` is true for `undefined`, so on a door below the 0266 frontier EVERY row was
labelled "Staff expense claim — "). `accounting-work-list.test.tsx` 24/24.

**L09-ADV-08.** `366283206`. Two gate modules with their own stable stems
(`work-list-claim-label-preintegration-gate.mjs` / `work_list_claim_label$`,
`work-list-receipt-window-preintegration-gate.mjs` / `work_list_receipt_window$`), both appended to
`packages/db/package.json`'s chain **in migration order** between 0265's and 0268's, and the three
in-file gates (`gateClaimLabel` in `work-list.test.mjs`, `gateReceiptWindow` in `work-list.test.mjs`
and in `client-work-pack.test.mjs`) now **refuse** rather than skip when the escape is unset. One
module serves both batteries that gate on 0267, because one migration is the frontier for both.
Proven on `clara_l09` by pointing `CLAIM_LABEL_STEM` at a stem no migration carries and restoring it
byte for byte:

```
focused, nothing preloaded  → wl.29 FAILS: "#880 claim_id/claimant_label projection absent (no
                              work_list_claim_label_ABSENT$ row in clara.schema_migrations) and
                              CLARA_ALLOW_MISSING_WORK_LIST_CLAIM_LABEL is unset -- this is a
                              FOCUSED run and must fail loudly, not skip. Preload
                              ./tests/work-list-claim-label-preintegration-gate.mjs …"
                              1 test, 0 pass, 1 fail, 0 skipped
+ --import …claim-label-preintegration-gate.mjs → wl.29 SKIPS   1 test, 0 fail, 1 skipped
preintegration-gate-chain.test.mjs → 3 fail with the modules on disk and no tokens; 5/5 after
```

The rig-meta half of that finding was already satisfied and argued: 0266 and 0267 add no function
NAME and no grant (a drop-and-create of the same name is not a new name), and the lane's diff
records that beside `WORK_LIST_0189_HUMAN_FNS`.

**L09-ADV-09 (note) — KEPT, and here is why the position is required.** The reviewer asks to
consider moving `clara._lock_source_corrected_work` below the document tenancy check and below the
`_reserve_op` replay branch. It can move below neither without breaking the lock order the header
states and §T asserts positionally. The body's order is: lock the Work rungs (`0268:498`) → `select
* into d from clara.documents … for update` (`:503`) → `clara._reserve_op` (`:509`); **both**
candidate positions are below the `clara.documents` lock. The journal lane already takes
`clara.documents` while holding the `accounting_work` rung (`clara._lock_document_binding`, 0197,
from two BEFORE ROW triggers), so a correcting transaction that took `clara.documents` first would
be the other direction of that same edge — the ABBA a posting transaction and a correction deadlock
on. The only way to serve the replay concern would be to hoist `_reserve_op` **above** the tenancy
check, which would let a caller reserve an op against a document their firm does not own: receipt
pollution and an existence-oracle surface that the reviewer's own probe C confirms is currently
closed. Cost of keeping it, bounded: a replay and an unrelated refusal take `FOR UPDATE` on the
Works parked on a question citing that one document, in one firm. Recorded, not changed.

**L09-ADV-10 / L09-SPEC-11 / STD-4 (notes) — the out-of-lane commit.** `9df3f0df5`
(`document-kind-dialog.tsx`, the `CLASSIFIABLE_DOCUMENT_KINDS` roster) is still on this branch,
unchanged, still its own clearly-labelled commit, and still carries `Co-Authored-By: Claude Sonnet
5` rather than this lane's line. It is what makes `next build` — and therefore every browser walk in
this worktree — work at all. **Integrator: lane 03 reports the same break
(`wave2-lane03-ticket846.md`); keep exactly one copy.** Not re-attributed here: rewriting another
worker's trailer would make the record worse, not better.

## 4 · Spec findings

| id | sev | outcome |
|---|---|---|
| L09-SPEC-01 | major | **fixed** — `894d2dd6c` |
| L09-SPEC-02 | major | **fixed** — `c5d3bec54`; §2 |
| L09-SPEC-03 | major | **fixed** — `d717803ce` |
| L09-SPEC-04 | major | **fixed** — `d717803ce` |
| L09-SPEC-05 | major | **fixed** — `4c82c806d` |
| L09-SPEC-06 | minor | **recorded** (below) |
| L09-SPEC-07 | minor | **recorded** in the migration header + successor contract §6 |
| L09-SPEC-08 | minor | **deliberately left**, with the reason |
| L09-SPEC-09 | minor | **flagged to the owner**, one line |
| L09-SPEC-10 | minor | **fixed** — `d717803ce` |
| L09-SPEC-11 | note | see L09-ADV-10 |
| L09-SPEC-12 | note | **fixed** — `c5d3bec54` |

**L09-SPEC-04 — AC2 now has a render proof, and getting one meant making the harness stop crashing
inside the identity read.** The panel used to render nothing at all until `getSessionIdentity()`
resolved. Restating needs the question RECORD (work id, client id, admitted basis) and the caller's
session token, and nothing else — the identity read is the FORM's input, it stamps who is answering
— so the offer is now computed once and rendered on every arm of the panel that has a record. That
is a correction rather than a convenience: gating restate on the identity read made the control
unreachable exactly where that read comes back empty.

Two harness facts had to be fixed, and both are about a browser rather than about our code:

1. `apps/web/test/hookHarness.ts`'s `installDom()` had **no `document.cookie`**. `@supabase/ssr`'s
   browser client reads it the moment it is constructed, and an *undefined* value is not "no
   session": it throws `Cannot read properties of undefined (reading 'length')` out of auth-js's
   background `_initialize`, as an unhandled rejection no caller can catch. The shim gains a real
   cookie jar (reads return the jar; writing `a=1; Path=/` sets ONE cookie rather than replacing it;
   an expiry in the past deletes it). Measured with a probe before and after: `THREW: Cannot read
   properties of undefined (reading 'length')` → `RESOLVED: null`, a signed-out browser. The change
   is inert for every other web test file, because `createClient()` still throws without
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which only this cell file sets.
2. auth-js then opened a `BroadcastChannel` — what a real browser uses to tell its OTHER TABS that
   this one signed in or out — and never closes it. Node 22 has that global and its implementation
   is a `MessagePort` that keeps the event loop alive: **16/16 cells green and the file never
   exits**, which is a hang of the whole suite rather than a failure in it. The cell file hands
   auth-js an inert channel. Measured with `process._getActiveHandles()`: `MessagePort` → `(none)`,
   process exit 0.

Cell: `839 (AC2) a parked work_accepted card RENDERS the restate control for a bookkeeper` — the
REAL `WorkAcceptedCard` through `PartRenderer`, a door that answers with a record carrying the
Work's admitted basis (migration 0265), the identity read resolving empty, and the assertions that
`work-restate` and `work-restate-submit` are on screen, that the sentence "Restate as a new
instruction" is rendered, and that the card announces nothing (§5's one-owner rule). Vacuity
control: with the restate offer withheld on the identity arm again, AC2 and AC3 both go red; subject
restored byte for byte.

*Not proven, and said plainly: that pressing submit reaches `clara.restate_accounting_work`. The
door call itself is proven at `RestateWorkPanel`'s own seam with an injected door
(`work-restate.test.tsx`), as before; what this round adds is that the rail's card really renders
that control. AC2's second clause is therefore covered by two cells at two seams, not by one cell
end to end.*

**L09-SPEC-05.** The claim label now joins the posting date on the **always-visible** wide sub-line
(`data-testid="work-row-wide-line"`, `hidden … md:block`) as well as the compact line
(`data-testid="work-row-compact-line"`, `md:hidden`), and the cell asserts WHICH line carries it
rather than scanning the whole page in a harness where Tailwind does nothing. Only the CLAIM label:
AC2 is "non-claim rows are unchanged", and purpose labels for other purposes are out of scope.

**L09-SPEC-06 — recorded, as the reviewer asked.** `clara._source_corrected_work` implements the
**source-refs** half of the brief's rule and not the **evidence-links** half: it tests
`jsonb_array_elements(w.source_refs) x where x->>'kind'='document' and x->>'document_id' =
p_document`, with no `clara.entry_evidence_links` term. The argument for the omission: an evidence
link exists only once an entry has been POSTED, and a Work holding a committed receipt is already
excluded by carve-out (c) of the same rule — so the evidence-links term would add Works the rule
then removes. It is nevertheless a NARROWER rule than `clara.list_source_dependents`' read-side
twin, and the integrator should know the write-side mirror is not complete.

**L09-SPEC-07 — recorded where it will be read.** Migration 0268's header carries a "WHAT THAT SHAPE
DOES NOT GIVE" paragraph: the reason a Work was retired is a DERIVED KEY
(`source_corrected:<revision>:<work>`, durable on `clara.op_receipts` and, for a successor, on
`clara.accounting_work.intent_key`), not a first-class cancellation reason;
`clara.cancel_accounting_work(uuid,uuid,text)` takes no reason argument and its `work.cancelled`
payload carries none. Giving the cancellation a reason of its own is a recut of 0199's door and
belongs to the ticket that needs it (#840's feed). Successor contract in §6.

**L09-SPEC-08 — deliberately left, with the reason.** "Needs-you shows the replacement" is in the
brief and still has no cell, because under the shipped mechanism there is nothing for Needs-you to
show at the moment of correction: a successor is admitted **queued with no pending question**, so
the old row disappears and a new one appears only when the successor's own run asks. A
`clara.list_review_queue` cell would pin that emptiness, not the brief's line. What DID change this
round is the other side of the same need — the person who made the correction is now told what it
retired (§2), which is the case Needs-you could never have shown at all, because a
retired-with-no-successor Work adds no row anywhere.

**L09-SPEC-09 — flagged to the owner, one line, as asked.**

> #839's newest comment names two files as "the rail's work-question affordance"; one of them
> (`apps/web/components/firm/work-question-affordance.tsx`) is Needs-you, whose own header calls it
> "#629 (B4) — Needs-you's tenth row kind". Restate is offered from `WorkCards.tsx` only. Turning it
> on in Needs-you is the single `offerRestate` prop — say the word, or amend the ticket.

Not decided unilaterally in either direction: this round's own AC3 work is about there being ONE
owner of the control per Work per surface, and adding a third surface without a ruling cuts against
it.

**L09-SPEC-12.** The migration header sentence now names the receipt and the audit row only; the
claim about the `document.fact_revised` reader contract is gone (`grep "reader contract"` on
`0268_work_source_correction_supersede.sql` returns nothing).

## 5 · Standards findings

| id | sev | outcome |
|---|---|---|
| STD-1a / 1b / 1c | major | **fixed** — `8109567c7` |
| STD-2 | minor | **fixed** — `d717803ce`; the duplicated mount is deleted, so there is nothing left to share |
| STD-3 | minor | **no fix** (as the reviewer says); recorded |
| STD-4 | note | see L09-ADV-10 |

**STD-1a/1b/1c.** `packages/db/README.md` gains one section per migration — `## 0265 — the shared
question record carries the admitted basis (#839)`, `## 0266 — the Work list labels a staff expense
claim without an N+1 read (#880)`, `## 0267 — the Work list gains a receipt-dated window (#905)` —
at the tail beside 0233's and 0234's, in migration order. Each carries what the migration changes,
the argument its own header makes (0265's body-only recut of the ungranted projection and why no
cohort is owed; 0266's unique-`work_id` join and the SECURITY INVOKER/RLS path that admits the claim
rows; 0267's drop-and-create, the five things a drop takes that are re-issued, the LATERAL `limit 1`
receipt join, the half-open MYT window and the #957-redo shape), and names the frontier-gated
battery plus the gate module that preloads it.

*Note for the integrator, not a defect:* 0268's section sits under "Document source revision (#646,
migration 0217)" by topic, while the three new ones are numeric at the tail, which is the convention
0233 and 0234 set. Two conventions now coexist in this README; unifying them is not this round's
work.

**STD-3 (process note).** Two of the four conjuncts of `clara._source_corrected_work`'s rule were
written before their own red cell (`63358cd19` landed the whole predicate; `48c9e6387` added the
carve-out cells). Both are covered now and re-run green, and the reviewer asks for no retroactive
fix. Recorded so the next migration of this shape lands each conjunct behind its own red cell.

## 6 · Successor contracts (nothing frozen was edited)

`node scripts/check-frozen-workflows.mjs` is part of the lint chain and shows no manifest diff; no
frozen body was touched in this round.

1. **A first-class retirement reason (owed to #840's feed, raised by L09-SPEC-07).** Today a Work
   retired by a source correction is distinguishable only by string-matching the cancellation's op
   key `source_corrected:<revision id>:<old work id>` on `clara.op_receipts`. The shape that would
   make it a fact: give `clara.cancel_accounting_work` a fourth argument `p_reason text default
   null`, carry it on the `work.cancelled` event payload as `reason`, and project it on the feed
   read. That is a recut of 0199's door and of every caller, so it belongs to the ticket that needs
   it — not to this one.
2. **A better sentence for the answering person on the no-successor arm.** With (1) in place,
   `clara.answer_work_question`'s converge arm could map `cancelled` + `reason='source_corrected'`
   to a new reason token (e.g. `source_corrected`), and the web would add one message key beside
   `convergeSuperseded` / `convergeCancelled`: *"The source this question was asked about has been
   corrected. This Work was stopped rather than replaced, because its figures were read from the
   value that changed — somebody has to state the instruction again."* Without (1) the door has
   nothing to key it on, and `convergeCancelled` ("This Work was stopped, so its question is
   closed") is true of every path that reaches it, which is the standard L09-SPEC-01 set.
3. **`superseded_work` on any other correcting surface.** The receipt key and its entry shape are
   now typed in `apps/web/lib/documents/types.ts` (`SupersededWork`: `work_id`, `new_work_id`,
   `reason`, `replaced`, `not_replaced_reason`, `revision_id`) and rendered by
   `SourceRevisionWorkEffect` in `apps/web/components/documents/document-facts-table.tsx`. Any other
   surface that calls `clara.revise_document_fact` should mount that component rather than
   re-deriving the sentence.

## 7 · Redo record (#957)

**No redo was needed in this round, and none was performed.** I edited no migration: the blocker was
closed at the admission seam by the earlier worker (`c5d3bec54`, which did redo 0268 under
`CLARA_MIGRATION_REDO` and recorded it in its commit message, as did `4dc9acac4`), and every finding
left for me was in test infrastructure, documentation or the web.

Verified rather than assumed — the four lane migrations' file sha256 against
`clara.schema_migrations` on `clara_l09`:

| migration | file sha256 (16) | applied checksum (16) |
|---|---|---|
| `0265_work_question_admitted_basis` | `3e35a42ce422a9ee` | `3e35a42ce422a9ee` |
| `0266_work_list_claim_label` | `ed81bcd896f27f26` | `ed81bcd896f27f26` |
| `0267_work_list_receipt_window` | `5340c2dc22dbc27c` | `5340c2dc22dbc27c` |
| `0268_work_source_correction_supersede` | `6da5df9b2f104fe0` | `6da5df9b2f104fe0` |

No sha pin moved, so none was re-measured. `apps/web/tests/firm-scope-db-pins.corpus.ts` keys on
none of 0265–0268 (grepped), so no web census re-measurement was owed.

## 8 · Gates, with counts

| gate | result |
|---|---|
| db, full 54-module gate chain (the exact `--import` list in `packages/db/package.json`), `clara_l09`: `work-question-admitted-basis` + `work-list` + `client-work-pack` + `work-source-correction-supersede` + `rig-docs-source-revision` + `preintegration-gate-chain` + `operation-census` + `rig-isolation` | **110 tests, 109 pass, 0 fail, 1 skipped** |
| …the one skip | `rig-isolation` T19 poison-role, which needs `CLARA_RIG_ALLOW_RESET`; the rig forbids setting it |
| `components/parts/work-cards.test.tsx` | **16/16**, exit 0 (before this round: 14 pass / 2 fail / process never exits) |
| `work-question-panel` + `work-restate` + `work-question-form` | **35/35** |
| `document-facts-table` + `document-revision-dialog` + `document-detail-live-refresh` + `documents-a11y` | **33/33** |
| `work-cards` + `accounting-work-list` + `work-question-form` (after the lint fixes) | **65/65** |
| `preintegration-gate-chain.test.mjs` alone | **5/5** (3 fail with the two modules on disk and no chain tokens) |
| WHOLE `apps/web` unit suite (`node scripts/run-tests.mjs`) — run 1 | 4772 tests, 4769 pass, **1 fail**, 2 skipped |
| …run 2 | 4772 tests, **4770 pass, 0 fail**, 2 skipped, exit 0 |
| …run 3 (after the lint fixes) | 4772 tests, **4770 pass, 0 fail**, 2 skipped, exit 0 |
| run 1's single failure, re-run alone | `components/documents/documents-workbench-refresh.test.tsx` **9/9**, exit 0 — a load flake in a poll-budget cell ("the poll must issue SOME read while a row is still moving"), in the same class as RIG.md's known `thread-live-clarify` whole-suite flake. Both runs reported, neither called "fixed". |
| `pnpm --filter @clara/web e2e home-board-walk` on the lane triple (3580/3581/3582) | **27 passed (1.1m)** |
| `pnpm --filter @clara/web e2e document-correction-walk` on the lane triple | **14 passed, 1 failed** — see below |
| `pnpm typecheck` | **green**, exit 0 (run three times across the round) |
| `pnpm lint` | **green**, exit 0 |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **red, on a base-level cell this lane does not own** — see below |

**The `document-correction-walk` failure is pre-existing on this branch, and that is measured, not
assumed.** The failing cell is `axe: each of the three routed views has no WCAG A/AA violations`,
with two `color-contrast` nodes on the facts view (`#6c7575` on `#f5f6f4`, ratio 4.36 against the
4.5 threshold — `text-muted-foreground` text inside a SELECTED `bg-muted` table row). Control: I
checked out `8109567c7`'s version of `apps/web/components/documents`,
`apps/web/lib/documents/types.ts` and `apps/web/messages/en.json` (i.e. this lane WITHOUT
`e4d742151`), rebuilt and re-ran the walk — **identical failure, identical two nodes, 14 passed /
1 failed** — then restored the tree (clean). My change to that surface adds a `<div class="flex
flex-col gap-2">` wrapper and a banner that renders `null` when nothing was retired; neither can
move a contrast ratio. Handed to the integrator as a pre-existing red on the documents walk.

**The `CI=true GITHUB_ACTIONS=true pnpm lint` red is a base-level cell this lane does not own.** The
chain dies before it reaches eslint, in the freeze-lint selftest, on the case *"(L05-STD-02 fix
round) `--ruling` followed by another flag … is treated as NO ruling given"*. That case spawns the
real CLI with `--retire`, which the CLI refuses under CI by design (`freeze-lint: --retire is
REFUSED under CI — a deliberate local ceremony act`), so the selftest sees the CI refusal instead of
the MISSING-RULING refusal it pins. This is exactly the shape RIG.md's wave-2 addendum describes: *a
selftest that spawns such a CLI must clear both variables for the child when the refusal it pins
sits behind the CI refusal.* Evidence that it is not this lane's: `git diff <base>..HEAD --
scripts/check-frozen-workflows.selftest.mjs scripts/check-frozen-workflows.mjs` is **empty** — both
files are byte-identical to the wave-1 base, so every wave-2 lane will see the same red. Reported
rather than fixed out of lane (ten lanes shipping the same hunk is the L09-ADV-10 lesson).

**The lane's own three lint errors WERE fixed** (`3a4e34315`), because they are this lane's: an
unused `reload` left by the deleted duplicate mount, and two ticket references spelled `#880` /
`#721` inside STRING literals, which trip the raw-colour selector exactly as ticket 994's own note
predicts (`#` + three hex-looking characters). The fix the rule names is to reword, never to weaken
it — the same fix `b703e7ac8` already made once in this lane. After them `pnpm lint` exits 0.

## 9 · Anything unverified

- **The one wiring line** from `DocumentRevisionDialog`'s `onRevised` to `DocumentFactsTable`'s
  `setWorkEffect` has no cell of its own. Its two halves do (the receipt reaches the caller; the
  component renders the sentence), and typecheck holds its shape.
  `e2e/document-correction-walk.spec.ts` is the browser that could drive it end to end, but that
  fixture retires no Work, so it exercises the silent arm only.
- **AC2's second clause** ("…and that submitting it reaches `clara.restate_accounting_work`") is
  covered at two seams rather than one: the rail's card renders the control (new cell), and the
  control's submit reaches the door with an injected door double (`work-restate.test.tsx`, as
  before). No single cell drives press-to-door.
- **`convergeCancelled` on the no-successor arm** is true but weaker than the correcting surface's
  new sentence. Successor contracts 1 and 2 in §6.
- **The CLR10 `not_restatable_purpose` and `client_inactive` arms of L09-ADV-03** are handled by the
  same `exception when sqlstate 'CLR10' or 'CLR13'` handler that `w885.sibling_posted.commits`
  drives through the `source_already_posted` path; the other two reasons are not driven end to end
  by a cell of their own. The adversarial reviewer recorded the same limit.
- **`document-correction-walk`'s axe red** is shown to be independent of this round's change; it is
  NOT shown to be independent of wave 1 (the walk cannot build at the wave-1 base in this worktree
  without `9df3f0df5`).
- Everything else in this report is backed by a command re-run in this session; no claim above rests
  on the earlier worker's own report alone.

---

# Second fix round (#885 only) — the two stale paths

- **New head** `3fd0e876ff83d5486935ccd40d435a2ea5d38f87` · four commits on top of `3a4e34315`
- **Input** `wave2-lane09-recheck.json` (accept-with-fixes; `ruling_885.stale_path_left: true`)
- **Rig** unchanged: worktree `C:\Users\zhant\Desktop\clara-wt\659`, `clara_l09` on 55749, base
  `23cfad947b5598214168ba9c43d391b4e16aa745`.

| commit | what it closes |
|---|---|
| `fa24033be` `fix(db): #885 no arm re-admits a pre-correction basis, and a corrected source closes the answer door` | point 1, point 2 (door), L09-RC-01, L09-RC-02, L09-RC-03 |
| `ab8a5e625` `fix(web): #885 a question about a corrected source is not asked again, and nothing claims a replacement` | point 2 (surface), the correcting surface's copy |
| `3fd0e876f` `test(db): #885 the new ungranted helper joins 0268's cohort, so an accidental grant fails` | the boundary of the new body |
| (in the two above) | point 3 — `CONTEXT.md`, `packages/db/README.md`, 0268's header contract |

## 1 · STALE POST — no arm re-admits, and the proof is an absence

**What the recheck measured, reproduced here before touching anything:** the `user_direct` arm
admitted a successor whose `basis_digest` was byte-identical to the retired Work's, so it could post
only the pre-correction figure — against the corrected document — and be accepted.

**The decision, and why no arm survives it.** The instruction was to apply the `clara_interpreted`
reasoning to every basis kind unless some kind can be PROVEN unable to carry a figure from the
corrected document. It cannot be proven, and the fixture says why in one line: a `user_direct` basis
whose lines are 64000 cents, on a document printing **RM 640.00**. A person who types the figure
printed on the invoice types the reading that is about to move; "a human stated it" is not evidence
that it survived. So `clara._supersede_source_corrected_work` no longer calls
`clara.restate_accounting_work` at all. Every affected Work is retired through 0199's own door,
`replaced` is always `false`, `new_work_id` is always `null`, and the receipt carries one of two
reasons — `interpreted_basis` (the figures were derived from the value that changed) or the new
`basis_predates_correction` (a person stated them before it changed). Both mean *state it again*,
through #721's door.

**The carrying cell, shaped as the instruction asked** — `w885.no_stale_post` in
`packages/db/tests/work-source-correction-supersede.test.mjs`:

- a `user_direct` Work parked on a question citing document D, basis lines **64000** cents;
- `clara.revise_document_fact` corrects `invoice.total` to **RM 999.00** (both figures literals from
  the fixture document, neither recomputed the way the code computes it);
- then the ABSENCE, over every Work the door **touched or created**: `replaced=false` and
  `new_work_id=null` on the receipt, zero rows with `supersedes = <retired>`, zero Works carrying the
  retired `basis_digest` admitted since the correction started, the retired Work's own posting of
  RM 640.00 through `wake_record_journal_entry` REFUSED, and — the one the ruling is ultimately
  about — **zero `clara.journal_lines` of 64000 cents evidence-linked to that document**, while that
  document's own live `invoice.total` region reads 99900.

Seen red first, for the right reason: `NO successor: nothing carries a figure nobody re-derived —
true !== false`.

**A structural bonus, recorded rather than claimed:** with the restatement door no longer called,
L09-ADV-03's property (a sibling Work's posted entry can never refuse a bookkeeper's correction)
stops being a caught exception and becomes unconstructible — nothing in this path can raise that
refusal. `w885.sibling_posted.commits` still drives it end to end and now asserts the basis reason
instead of `source_already_posted`.

## 2 · STALE ANSWER — the Work is left alone, the answer is refused

**What the recheck measured, reproduced here:** on the #676 carve-out (a Work holding a committed
receipt, which the brief excludes from cancellation and which stays uncancelled), answering a pending
question about the corrected document SUCCEEDED — `{status:'answered'}` after the reading had moved.

**The two halves are not in conflict.** The brief carves the WORK out of the retirement; the ruling
forbids anyone ANSWERING against a corrected reading. Both hold if the Work stays exactly where it is
and the answer is refused. That is what ships:

| piece | what it is |
|---|---|
| `clara._question_source_corrected(uuid)` | new, ungranted, SECURITY DEFINER: WHEN the source a question stands on was last corrected, **if** it was corrected after the question was asked; NULL otherwise. Same firm term and same `source_refs` term as the retirement rule; `revision_kind = 'fact'`, because that is the ruling's subject. |
| `clara.answer_work_question` | refuses CLR13 `source_corrected` on a still-PENDING question whose source moved, and uses the same word instead of `cancelled` for a question the retirement closed — so the retired Work says WHY. `detail.current.source_corrected_at` carries the instant. |
| `clara._work_question_record` | projects `source_corrected_at` (0265's body verbatim plus one key), so a surface says it BEFORE a person types rather than after they submit. |
| `work-question-form.tsx` | opens CONVERGED on a pending record carrying that instant, and `convergeKeyFor` maps both the refusal reason and the bare record onto `convergeSourceCorrected`. |

**The refusal vocabulary: one new token, and why no existing one could say it.** `already_answered`,
`stale_question`, `expired`, `cancelled`, `basis_changed`, `state_changed` and `superseded` are all
about the QUESTION or the WORK. This fact is about the DOCUMENT, and it is the only one that tells
the person what to do next. `superseded` was the closest and is now wrong twice over: the correcting
door admits no successor, so there is nothing to point at, and `superseded` still has to mean what
#721's restatement writes.

**The sentence** (`WorkQuestion.convergeSourceCorrected`): *"The source this question was asked about
has been corrected since it was asked, so an answer now would stand on a reading that has changed.
Nothing was started on the corrected figures — the instruction has to be given again on the corrected
document."* True of every path that reaches it — the Work the correction retired, and the Work it
deliberately left alone — which is the L09-SPEC-01 standard this lane was already held to.

**Cells, both seen red first:** the new assertions in `w885.posted.untouched` (red because the answer
SUCCEEDED; they now pin CLR13 `source_corrected`, the question still `pending`, and the Work's status
unmoved — the carve-out intact), and `885 a question whose source was corrected is not asked again:
the sentence, not the form` in `work-question-form.test.tsx` (red on `convergeStateChanged`), which
drives four `convergeKeyFor` arms including the no-refusal one and the already-answered control.

## 3 · THE REMAINDER — what wave 4 owes, and how #885 should close

### 3a · The successor contract for re-derivation (written into 0268's header and here)

Re-admission ON THE CORRECTED FACTS needs somebody to re-read the corrected document and propose a
basis from it. That cannot be built at this seam, and both candidate shapes are closed by measurement
rather than by argument:

- **Deriving the basis in SQL is not constructible.** `journalBasisSchema`
  (`packages/runtime/workflows/claraWork.v1.tools.ts`) is `posting_date` + `memo` + `currency` +
  lines of integer cents, with **no back-link from a line to a document field path**. Mapping a
  corrected `invoice.total` onto debit and credit lines is an interpretation act.
- **Admitting a successor "in a state that cannot post" is not constructible either.** Parking a Work
  on a confirmation question needs `clara.open_work_question`, whose step (4) transitions
  `clara.agent_tasks` out of `running` and raises CLR13 `task_not_running` otherwise (0184); a
  freshly admitted Work's task is `queued` until the runtime claims it.

**THE CONTRACT for the `claraWork_v6` / `chatTurn_v22` cut (wave 4):**

- **WHO** — the Work runtime, the only lane that can interpret a document.
- **WHAT** — on a source correction, for each retired Work, enqueue a RE-READ of the corrected
  document: same client, same `purpose`, same `source_refs`, initiated by the correcting actor.
- **FROM WHAT** — the corrected facts: the live `clara.document_regions` of the document's newest
  `done` extraction (which is what `clara.revise_document_fact` appends), never the retired Work's
  `basis`.
- **THROUGH WHICH DOOR** — admission through `clara.admit_journal_work` as usual, then
  `clara.open_work_question` from its own run, asking the person to confirm the re-derived basis and
  naming BOTH figures: what the retired Work was admitted on, and what the document now says. Nothing
  may post until that question is answered.
- **THE LINK IT CLAIMS** — the cancellation's op key `source_corrected:<revision id>:<old work id>`
  (durable on `clara.op_receipts`). The retired Work's `superseded_by` is deliberately left NULL by
  this lane precisely so a future successor can claim it honestly.
- **WHAT THE PERSON SEES WHEN IT HAPPENS** — today: the correcting surface's sentence at the moment
  of correction, and `convergeSourceCorrected` if they return to the old question. After the cut: the
  new Work's own confirmation question in Needs-you, which is the first moment "Needs-you shows the
  replacement" becomes true.

### 3b · Per arm: delivered now / waits for wave 4

| arm | delivered NOW | waits for wave 4 |
|---|---|---|
| parked, `user_direct`, no receipt | retired; question closed; answering refused `source_corrected`; receipt says `basis_predates_correction`; no successor, so no stale post is constructible | the re-derived successor and its confirmation question |
| parked, `clara_interpreted`, no receipt | identical, reason `interpreted_basis` | same |
| parked, no receipt, restatement door would have refused (sibling posted, non-journal purpose, inactive client) | identical — and that refusal can no longer reach the correcting door at all | same |
| parked AND holding a committed receipt (#676 carve-out) | Work untouched, receipt untouched, question still pending — and **not answerable**: CLR13 `source_corrected`, with the surface showing the sentence instead of the form | correcting the posted result itself (#676) |
| parked on ANOTHER document; running/queued with no question; pending residue on a terminal Work | untouched and answerable, exactly as before | — |

### 3c · What Needs-you shows after a correction — the honest answer

**"Needs-you shows the replacement" is not deliverable before wave 4, because there is no
replacement.** Measured by the recheck and unchanged by this round: `clara.list_review_queue` names
neither a retired Work nor a successor, because a retired Work's question is cancelled (it leaves the
list) and no successor is ever admitted (nothing arrives). What Needs-you shows is:

- **for a retired Work — nothing.** The row disappears. The person is told at the moment of
  correction, on the correcting surface (`SourceRevisionWorkEffect`), and again if they open the old
  question (`convergeSourceCorrected`).
- **for the carved-out Work — the same row it showed before**, still pending, and, since this round,
  carrying the sentence instead of an answer form: Needs-you renders
  `work-question-affordance.tsx` → `WorkQuestionPanel` → `WorkQuestionForm`, and the form opens
  converged on `source_corrected_at`. *Unverified at that seam:* no Needs-you cell drives this; the
  form's own cells prove the behaviour and the db cell proves the record carries the key.

### 3d · CONTEXT.md (L09-RC-01)

The `<!-- #885 -->` entry described the pre-fix mechanism and was false on two of three arms. It now
reads to the shipped one: every affected Work is **cancelled**, NOTHING is re-admitted in its place,
the retired Work points at no successor, and the answer door refuses both the retired question and a
question about the corrected document on a Work the rule left alone, as `source_corrected`. Its
_Avoid_ line gains the distinction the recheck's evidence turns on: *superseded by* is what a
restatement (a person's own act) writes, and a source correction writes none.

### 3e · How #885 should close

**PARTIAL, with a named remainder.** Delivered: the ruling's non-negotiable half for the population
the rule names *and* for the population it deliberately does not (the carve-out), plus the removal of
every path by which a pre-correction figure could reach the ledger through this door. Remainder:
(1) re-admission on the corrected facts — §3a's contract, wave 4; (2) "Needs-you shows the
replacement" — §3c, not deliverable before (1); (3) a first-class retirement reason instead of a
derived op key (L09-SPEC-07), owed to #840's feed; (4) correcting a posted result (#676), parked by
`docs/PRD.md`.

## 4 · L09-RC-04 — the out-of-lane commit

`9df3f0df5` is still on the branch, unchanged, still carrying `Co-Authored-By: Claude Sonnet 5`.
Lane 03 reports the same one-line fix (`reports/wave2-lane03-ticket846.md`). **Integrator: keep
exactly one copy**; the merger dedupes. No lane action taken, as instructed.

## 5 · Redo record (#957), second round

0268 was edited and re-applied **three times** through the supported redo mode
(`CLARA_MIGRATION_REDO=0268_work_source_correction_supersede`, with `CLARA_ALLOW_DESTRUCTIVE=1
CLARA_RIG_DB=1` on `clara_l09`). It is the highest applied version and every object it creates is
`create or replace`, which is what makes the redo safe.

| attempt | outcome |
|---|---|
| 1 | FAILED and rolled back — `syntax error at or near "$"`. Self-inflicted and worth recording: a JS patch script used `String.replace`, which eats `$$` in the replacement, so two function bodies landed with single-`$` dollar quotes. Repaired and re-run; the ledger was untouched by the failure, exactly as the redo mode promises. |
| 2 | applied, checksum `2e0cf99c1d6356eb…` |
| 3 | applied (header-only: the wave-4 successor contract), checksum **`354c049c680bee254e166ba6cc276513b39a1ec3b7d7f0c907c7f5c297ab9e60`** — the current one |

**Pins.** A THIRD marker-tolerant prestate pin was added, on `clara._work_question_record`, because
this file now recuts it too: pre-image `e3866088ee13a6ff…` (0265's post-image, measured on this rig),
tolerant of a body already carrying `source_corrected_at`, refusing any other drift. The two existing
marker-tolerant pins (`revise_document_fact`, `answer_work_question`) admitted every redo as
designed, and §T gained a check that the record's sha really moved. No OTHER migration was edited, so
no redo-from-the-top was needed. The four non-regression pins (`restate_accounting_work`,
`cancel_accounting_work`, `_work_committed_receipt`, `list_source_dependents`) are unchanged and
still re-read green — `restate_accounting_work` is no longer CALLED, and the pin's promise ("this
file must not touch it") is still exactly true.

**Web census.** `apps/web/tests/firm-scope-db-pins.corpus.ts` keys on none of 0265–0268 (grepped), so
nothing was re-measured there.

## 6 · Gates, second round

| gate | result |
|---|---|
| db, full 54-module gate chain on `clara_l09`: `work-question-admitted-basis` + `work-list` + `client-work-pack` + `work-source-correction-supersede` + `rig-docs-source-revision` + `preintegration-gate-chain` + `operation-census` + `rig-isolation` + `work-question-reads` | **130 tests, 129 pass, 0 fail, 1 skipped** |
| …after the cohort change: `work-source-correction-supersede` + `rig-isolation` + `operation-census` + `web-reads` | **42 tests, 41 pass, 0 fail, 1 skipped** |
| …the one skip, both times | `rig-isolation` T19, which needs `CLARA_RIG_ALLOW_RESET`; the rig forbids it |
| `work-source-correction-supersede.test.mjs` (`EXPECTED_CELLS` raised 8 → 9) | every cell executed, green |
| web: `work-question-form` + `document-facts-table` + `document-revision-dialog` | **45/45** |
| WHOLE `apps/web` unit suite (`node scripts/run-tests.mjs`) | **4773 tests, 4771 pass, 0 fail, 2 skipped**, exit 0 |
| `pnpm typecheck` | **green**, exit 0 |
| `pnpm lint` | **green**, exit 0 |
| `pnpm --filter @clara/web e2e work-question-walk` on the lane triple (3580/3581/3582) | **14 passed (1.2m)** — the walk that drives the answer form end to end |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | unchanged from the first round: red on the freeze-lint selftest's `--retire`-under-CI case, byte-identical to the wave-1 base in this worktree, which the recheck reports as already fixed on the integration branch (`f6d828b2c`) |

## 7 · Anything unverified, second round

- **The Needs-you seam** (§3c): no cell drives `work-question-affordance.tsx` with a corrected
  record; the form's own cells and the db record's key carry it.
- **`revision_kind = 'fact'` is the whole subject.** A KIND reclassification (`revision_kind =
  'kind'`, #646's other lane) does not make a question unanswerable. That is deliberate — it moves no
  figure — but it is a choice this round made, not one the ruling states.
- **The predicate is evaluated per answer attempt**, inside `answer_work_question` under the
  interruption's own `for update` lock, so a correction committing concurrently either precedes the
  read (refusal) or blocks on the Work rungs the correcting door holds. No new race was driven end to
  end this round; the recheck's own two-session probe is the nearest evidence and predates this
  change.
- **A correction recorded BEFORE the question was asked** does not refuse it (`recorded_at >
  i.created_at`). That is the intended reading of "corrected after the question was asked", and it is
  asserted only negatively, through `w885.answer.superseded`'s control arm (`source_corrected_at`
  null on an ordinary cancellation).
- **`document-correction-walk`'s axe contrast red** (first round §8) was not re-run this round; that
  surface's only change here is copy inside a banner that renders nothing when nothing was retired.

---

# Third fix round (#885) — the broken from-scratch apply, and two truths the surfaces owed

- **New head** `c5c408455bc09f3efc21cb37e13229b5a2e5d1eb` · three commits on top of `3fd0e876f`
- **Input** `wave2-lane09-recheck-2.json` (REJECT on one blocker; the round's three substantive
  claims were all confirmed by driving the real doors)
- **Rig** unchanged. 0268's ledger checksum after this round: `93703b0eaa233e28…`, equal to the file.

| commit | what it closes |
|---|---|
| `c25d5cc9e` `fix(db): #885 the third prestate pin is measured against 0265, and a keystroke is not a correction` | L09-RC2-01 (blocker), L09-RC2-02, the db half of L09-RC2-03 |
| `5c3f82bb8` `fix(web): #885 the source-corrected sentence names an exit that works, and the rail stops offering one that does not` | L09-RC2-03 |
| `c5c408455` `fix(web): #885 spell a ticket reference without a hash in the new cell's message` | the lint gate, run before the report rather than after it |

## 1 · BLOCKER — the pin, and the branch a redo can never reach

**Reproduced before touching anything.** Rewinding the catalog to 0265's own
`create or replace function clara._work_question_record` statement, inside a transaction that was
then rolled back, measures `sha256(prosrc)` = **`f4b62dd26d7e0acf…`**. The literal the second round
shipped was `e3866088…`, which matches neither that, nor `pg_get_functiondef` (the reviewer measured
`e614ac6a…`), nor any spelling either of us could construct: it is simply wrong. With the catalog in
that state — exactly what a from-scratch chain reaches before 0268 — 0268's own §0 raised CLR10 and
stopped the chain.

**Why three redo runs saw nothing, stated as a rule rather than an excuse.** A marker-tolerant pin
is `sha ≠ <literal> AND marker absent → refuse`. Once the live body carries the marker the sha
branch is short-circuited, and after the first redo the body always carries it. **`CLARA_MIGRATION_REDO`
can never exercise the sha branch of a marker-tolerant pin**, so the literal has to be measured
against the body the CREATING migration produces, not against whatever the rig happens to hold.

**The fix**: the literal is now `f4b62dd2…` in all three places it appears (the pin, its message and
§T's "did the recut actually commit" check), and the comment records how it was measured instead of
claiming a rig measurement.

**The proof, on the path that was broken.** One rolled-back transaction, driven by a script that
rebuilds the pre-0268 state from the migrations that create each body and then runs 0268 itself:

```
OK    rewound _work_question_record from 0265 -> f4b62dd26d7e0acf (== the pin)
OK    rewound answer_work_question   from 0200 -> 15a82c080d102e61 (== the pin)
OK    rewound revise_document_fact   from 0217 -> b89a01ba9b5f0294 (== the pin)
--- the catalog is now exactly the state a from-scratch chain reaches before 0268 ---
OK    0268 §0 PRESTATE passed on the FIRST-APPLY path (no marker anywhere)
OK    the WHOLE 0268 file applied on the first-apply path (prestate + body + §T)
rollback control: all three live bodies UNMOVED
```

Each rewind is verified against its own pinned literal *before* the prestate runs, so "this is the
real pre-0268 state" is a measurement rather than an assumption; the run above is against the FINAL
file, after every other change in this round. (A true 0001 → 0268 chain still belongs to the
integrator's disposable cluster: migration 0154 pins the cluster-wide role count and RIG.md forbids
a second from-scratch chain here.)

### The pin audit, for every bimodal or marker-tolerant branch in 0265 → 0268

| migration | pin / branch | what the lane database exercises today | how the other branch was exercised |
|---|---|---|---|
| 0265 | three plain `sha256(prosrc)` pins (`_work_question_record` ← 0180's body `cb57a131…`, `get_work_question` `19e4e418…`, `get_work_pending_question` `8a196db9…`) | **single-mode**; ran for real at apply | none exists — a redo of 0265 would refuse, by design |
| 0266 | presence guards ("the live body must NOT already carry `claim_id`/`claimant_label`") | **single-mode**; ran for real at apply | none exists — a redo would refuse, by design |
| 0267 | **bimodal** on the overload: nine-argument door → first-apply; eleven-argument → redo | the eleven-argument door is what exists today, i.e. the **redo** branch | the first-apply branch ran for real at apply (it is how the eleven-argument door came to exist); the redo branch re-run here by executing 0267's §0 verbatim in a rolled-back transaction → passes |
| 0268 | **marker-tolerant** ×3 (`revise_document_fact` `b89a01ba…`, `answer_work_question` `15a82c08…`, `_work_question_record` `f4b62dd2…`) | the **marker** branch, on every redo | the sha (first-apply) branch: the rewind proof above, all three at once. The first two also passed it for real at 0268's first apply, when no `#885` marker existed |
| 0268 §T | the record's key count was bimodal on "no work-bearing interruption exists", and tolerated it **silently** | the counting branch | **removed**: the empty case now raises a NOTICE saying the count was not measured live, and the key-by-key text assertions carry the claim on their own. An unexercised silent branch is the shape that hid this blocker |

## 2 · MINOR — a keystroke is not a correction

**Measured before the fix:** re-typing the value already on the document was ACCEPTED, advanced
`facts_version`, wrote a revision row whose `prior_value` and `new_value` are identical, retired
every parked Work standing on that document, and made a carved-out question **permanently**
unanswerable (`max(recorded_at)` can never fall back below the question's `created_at`).

**What "unchanged" means at the seam, and it is the STORED value rather than the keystrokes:** the
normalised **cents** when both sides carry them — so `RM 880.00` typed over `880.00` is the same
fact, differently spelled — otherwise the **trimmed text**. A fact the reader never persisted has no
prior value at all, and anything is a change against nothing.

**One notion, two callers, so they cannot disagree.** `clara._fact_value_changed(jsonb,jsonb)` is
ungranted like its siblings, and:

- `clara.revise_document_fact` refuses CLR10 `value_unchanged` **before anything is written** — no
  extraction, no revision row, no `facts_version`, no retirement, no question killed;
- `clara._question_source_corrected` reads revision rows **through the same helper**, so a no-op row
  written before this guard existed cannot make a question read as source-corrected either.

**Cell** `w885.noop.refused`, seen red first (the no-op was accepted): the same text refused, the
same figure respelled refused, zero revision rows written, the parked Work untouched, its question
still `pending`, `source_corrected_at` still null, **the question answered normally**, and the
control that a genuine correction of the same field still commits to `facts_version 2`.

**One existing cell had to change, and that is worth naming:** `p646.replay.one_receipt`'s
concurrency leg revised `invoice.currency` to the value the fixture already carried. Two no-ops are
now refused *before* they reach the document row lock, which would prove nothing about concurrency,
so that leg makes a real change (`MYR` → `SGD`) and still asserts one winner and one CLR19 loser.

## 3 · MINOR — the sentence and the controls now agree with the doors

**Measured:** on the #676 carve-out (a Work holding a committed receipt, left alone by the
retirement rule), `clara.restate_accounting_work` refuses CLR13 `not_restatable` — a Work that has
posted reads as completed — while Cancel Work (`clara.cancel_agent_task`) is accepted and closes the
question. The sentence told that person to give the instruction again, and the rail offered
"Restate as a new instruction": a control that can only ever be refused, which is the exact rule
L09-ADV-06 was fixed under one rank down.

**The fix keys on a fact, not an inference.** `clara._work_question_record` projects `work_posted`
(`clara._work_committed_receipt(w.id) is not null`), and:

| arm | sentence | controls |
|---|---|---|
| retired Work (question cancelled) | `convergeSourceCorrected` — "…the instruction has to be given again on the corrected document" | restate is the way back (#721's door admits it) |
| #676 carve-out (question pending, `work_posted`) | `convergeSourceCorrectedPosted` — "…This Work has already posted an entry, so it cannot be restated — use Cancel Work to stop it, and start a new one on the corrected document if it is still needed." | `offersRestateFor` **withholds** restate; Cancel Work is the control the card already carries |

**The no-refusal path now mirrors the door** instead of guessing: the door says `source_corrected`
for a question the retirement cancelled and refuses a PENDING one on the same ground, so the surface
reads the record's instant on exactly those two statuses. An ALREADY ANSWERED question keeps its own
sentence — a later correction does not rewrite what happened — and an EXPIRED one keeps 0180's word.

**Cells, one per arm, rendered:** `885 the source-corrected sentence names the exit that actually
works on each arm` maps *and renders* both arms (red first: the retired arm rendered
`convergeCancelled`, the posted arm had no sentence of its own); `885 offersRestateFor withholds the
control on a Work that has already posted`; and `885 the rail withholds restate on a Work that has
already posted`, which drives the REAL card at bookkeeper rank off the Work's own detail route, with
a positive control that the question door was read. Vacuity control: with the new conjunct removed
that last cell fails *"Missing expected rejection"*; subject restored byte for byte.

## 4 · L09-RC2-04 — unchanged

`9df3f0df5` is still on the branch, still lane 03's hunk too. **Integrator: keep exactly one copy.**
No lane action, as instructed.

## 5 · Redo record (#957), third round

| act | outcome |
|---|---|
| redo of 0268 (pin + no-op guard + `work_posted` + §T) | applied, checksum **`93703b0eaa233e2861f741e38f9b55f077b2cbdc6bff43e0063faf58ac81b3ef`**, equal to the file on disk (verified against `clara.schema_migrations` after the last commit) |
| first-apply proof | the rolled-back rewind above, re-run against the final file |
| 0267's redo branch | exercised in a rolled-back transaction (see the audit table) |

No other migration was edited, so no redo-from-the-top was needed. The 0268 cohort in
`packages/db/tests/rig-meta.mjs` gains `_fact_value_changed` (fifth ungranted name), and the
battery's half-applied check counts five routines.

## 6 · Gates, third round

| gate | result |
|---|---|
| db, full 54-module gate chain on `clara_l09`: `work-question-admitted-basis` + `work-question-reads` + `work-list` + `client-work-pack` + `work-source-correction-supersede` + `rig-docs-source-revision` + `preintegration-gate-chain` + `web-reads` + `operation-census` + `rig-isolation` | **131 tests, 130 pass, 0 fail, 1 skipped** (rig-isolation T19, which needs `CLARA_RIG_ALLOW_RESET`) |
| `work-source-correction-supersede.test.mjs` (`EXPECTED_CELLS` 9 → 10) | every cell executed, green |
| web: `work-question-form` + `work-question-panel` + `work-cards` | **49/49** and **17/17** |
| WHOLE `apps/web` unit suite, after every change | **4776 tests, 4774 pass, 0 fail, 2 skipped**, exit 0 |
| `pnpm typecheck` | **green**, exit 0 |
| `pnpm lint` | **green**, exit 0 — after the one-word fix in `c5c408455`; the first run found a `#721` inside a test message, which the raw-colour selector cannot tell from a hex literal (ticket 994's own note) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | unchanged: the freeze-lint `--retire`-under-CI case, byte-identical to the wave-1 base here, reported fixed on the integration branch (`f6d828b2c`) |

No browser walk was run this round: the two surfaces touched are covered by
`work-question-walk` (green last round, and the form's phase logic is exercised by the new rendered
cells) and the facts-table banner, which is unchanged here.

## 7 · Anything unverified, third round

- **The true 0001 → 0268 chain** is still the integrator's, on a disposable cluster. What is proven
  here is the state-and-file equivalent: the exact pre-0268 catalog, 0268's own prestate on its
  first-apply branch, and the whole file applying from there.
- **`_fact_value_changed`'s text arm** is exercised only through `invoice.currency` in
  `p646.replay.one_receipt` (a real change) — no cell drives a non-monetary NO-OP, because every
  revisable invoice field in the fixtures carries cents. The cents arm is driven both ways.
- **A no-op revision on a document with no prior region** (the fact the reader never persisted) is
  admitted by construction and has no cell; the guard's `v_prior_value is not null` term is what
  makes that explicit.
- **The `work_posted` projection is a point read**: it says whether the Work holds a committed
  receipt *now*, so a receipt committed between the record read and the person's press would leave
  the older, wrong sentence on screen until the next poll. The door is still the wall — restate
  refuses either way.
