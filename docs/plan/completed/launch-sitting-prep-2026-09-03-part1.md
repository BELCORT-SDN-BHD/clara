*Part 1 of 3 of the launch-sitting PREP pack (2026-09-03) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: none (this is the first part) · Next: `launch-sitting-prep-2026-09-03-part2.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

# The LAUNCH SITTING — prep record

*The owner's beta-live go/no-go with the lead, held after FS-10 (the cutover) and FS-11 (the
reduced Wave G). Prepared read-only against `main` @ `5eab358d` ("docs: 裁-146 … (#537)"),
2026-09-03, folded ≈18:50 MYT. Every line names the file (and where it exists, the line) that
PROVES it — nothing here is a memory.*

**Where state is measured from.** Every state claim below is read from **the tree or `gh`**, never
from `PROGRESS.md`'s banner. `PROGRESS.md` is the state authority by constraint 8, but at this tip
it is **STALE on #517** — truing-4 is writing it now. Where the two disagree, this record cites the
tree read and says so.

**Scope note.** This is a PREP record, not the sitting's minutes and not an as-run. It carries the
owner decisions, the agenda, the evidence addresses, the owner's own-eyes acts, the first-hour
watch list and the close protocol. It grades nothing: at the time of writing FS-10 and FS-11 have
not run, so every gate is stated as *the positive read that would discharge it*, per
`docs/product/EVALUATION_RUBRIC.md` DF-1 ("unverified is incomplete, not probably fine").

**Rulings 裁-142 … 裁-150 govern this record and are only PARTLY in the repo.** Measured
2026-09-03 on `5eab358d`: 裁-146 is filed (`docs/plan/active/mohe-grill-rulings-2026-09-03.md`,
digest law 87 at `docs/adr/README.md:500`); 裁-147 appears only as an *owed* row
(`…-09-03.md:235`, blocked because the digest sits at exactly 500/500 lines); **裁-148, 裁-149 and
裁-150 return zero hits across `docs/`, `PROGRESS.md` and `AGENTS.md`.** Their governing texts are
the owner's ruling files in the session scratchpad (`…/scratchpad/truing/ruling-148.md`,
`-149.md`, `-150.md`), and **truing-4 is the PR that lands them**. Until it merges, this record is
the only place several of them are written down — which is itself a close-protocol obligation (§7).

**The bar the sitting judges against.** `docs/product/EVALUATION_RUBRIC.md` in full, but four lines
do the work at a go/no-go:

- **DF-1 / EV-1** — every gate discharges on a *positive read with its instrument named*. A report
  is not a measurement (裁-112).
- **DF-2 / DF-3 / EV-9** — an absence discharges nothing, and a derived state is not evidence.
  "No error appeared" and "the deploy exited zero" are both refused.
- **DF-5** — *"a wall that never refused anything is not a wall that held — it is a wall that was
  never asked."* Any refusal criterion counting zero on the corpus is recorded **UNPROVEN IN THE
  FIELD**, with which of the two it was: never triggered, or never asked.
- **IT-4 / V-OWNER** — the own-eyes acts in §4 are **V-OWNER cells: an agent can never satisfy
  one.** That is the whole reason the sitting exists.

Product law is `docs/product/PRD.md` §6 (LAW) — invariant 1 (the DB owns every authoritative
number), invariant 2(a)-(d) (the four structural walls), invariant 16(a)/(b) as split by 裁-114, and
the Split-trust corollary (no service credential reaches a browser; no `NEXT_PUBLIC_` variable ever
carries one; `apps/web`'s server-only Route Handlers are a second, browser-isolated holder —
example corrected by 裁-142 to `STRIPE_SECRET_KEY`, the webhook signing secret being RUNTIME env).

---

## OWNER DECISIONS — the two the sitting still owes

*Everything else on the agenda is a READ. These two are rulings only the owner can make. Each is
put in one sentence, in English and 大白话, with the lead's recommendation, its cost, and what
happens if it is not ruled. Per hard constraint 1 a design-vs-contract collision goes to the owner
— never a unilateral call.*

### DECISION 1 — DS-07: which artifact is authoritative for control heights *(was "DECISION A")*

**Question (EN).** For button and input heights, which document is authoritative — the design
repo's token contract §5.2 (`--control-sm`/`--control-md`/`--control-lg` = **32 / 36 / 40 px**), or
the shipped reference in `apps/web/components/ui/button.tsx` (**24 / 28 / 32 / 36 px**), whose
size-variant block is **byte-identical to the design authority's own component**?

**问题（大白话）.** 按钮和输入框的高度，以哪一份为准——设计仓库那份"代币合同"写的 **32/36/40**，还是现在
真的在跑、而且和设计仓库自己的组件**一个字都不差**的 **24/28/32/36**？

**Recommendation: option B — the shipped reference is authoritative, and the token contract's §5.2
is recorded as never implemented.** Three facts carry it: §5.2 was **never implemented in EITHER
repo** (the 2026-08-28 resource audit read §5.2 but extracted only its `--target-min` row, which
became 裁-13 — a genuine gap in that audit, not a re-finding); the shipped block is byte-identical
to the authority's own (md5 `6f29955ea9f9f080f7e602149d6a4aa6`), so choosing A would
**desynchronise `apps/web` from the port it came from** — the one thing Q1/Q4 forbid; and 裁-13's
24 px target-size gate goes **GREEN** on the shipped heights, so nothing is unlawful today. Shape of
the ruling: the same kind as 裁-137, *contract vs. reference*, recorded per 裁-140 as a **digest row
plus a dated `README-log.md` line, never a new ADR**.

**Cost.** B costs nothing tonight but leaves the **13 `size="xs"` buttons sitting exactly on the
SC 2.5.8 target-size floor with zero headroom** — lawful, with nothing to spare — and leaves §5.2
unimplemented in both repos, which must then be *written down as such* rather than silently
carried. A costs a re-map of `apps/web`'s size-variant block **plus a THIRD owner PR** in
`clarabook-frontend` beside the two in DECISION 2, and gives those 13 buttons headroom.

**If it is not ruled.** FS-9's sign-off keeps one of its three owner-owed lines open
(`docs/plan/active/clarabook-conformance-pass-3-2026-09-02.md:59-65`, measurement at `:369-375`),
and `PROGRESS.md:375`'s DS-07 row goes into the handover with **no owner and no next step** — the
one shape 裁-150 point 1 forbids. Nothing in the product breaks; it is not beta-gating.

### DECISION 2 — the two `clarabook-frontend` recut PRs *(was "DECISION D")*

**Question (EN).** Do the two recut PRs to the design-authority repo — 裁-64②'s `--input` token
value and R3 §9's focus-ring founder amendment — get opened now, or deferred again with a dated
Backlog row naming their owner?

**问题（大白话）.** 设计权威仓库（`clarabook-frontend`）还欠两个"回改"PR：一个是 `--input` 那个色值，一个是
§9 焦点环的创始人修订。**今晚开，还是再押后**——但要在 Backlog 里写清楚是谁的、下一步是什么？

**Recommendation: DEFER, with a dated `PROGRESS.md` Backlog row naming the owner as the actor and
裁-64② / R3 §9 as the rulings.** They are the owner's PRs by two rulings (裁-64② and 裁-138,
`docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md:193`), they sit **outside every lane's write
boundary** (`clarabook-conformance-pass-3-2026-09-02.md:48-49`), they change **no shipped
behaviour** in this repo — the `--input` value is already set lawfully here by #515
(`apps/web/app/globals.css:304`) — and 裁-150 point 2 says no lane runs after the e2e, so "open
now" means the owner's own hands at the end of a launch night.

**Cost.** Deferring means the ClaraBook design law on that side **keeps drifting from the shipped
app**, and any future port from that repo re-imports the drift (`PROGRESS.md:371`). Opening tonight
costs the owner two small PRs in a second repo, at the worst hour to do them.

**If it is not ruled.** The drift has no lawful home: ADR-0075 §6 makes a `PROGRESS.md` row the only
place a deferral may live, and FS-9's sign-off already flagged that all four of its residuals owe
one. An unruled row is exactly the handover shape 裁-150 point 1 rules out.

### Already settled — do NOT re-open these at the sitting

- **The Stripe TEST/sandbox-vs-LIVE question is RULED and is no longer a decision** *(was
  "DECISION B")*. **裁-126** keeps Stripe in the **BELCORT sandbox for the whole beta**, and
  **裁-148** settles the price: **walk checkout ONCE at the seeded beta price — sandbox, MYR 0**;
  the **non-zero-price walk belongs to the REAL-MONEY SWITCH ceremony** (with Stripe live mode and
  KYB, 裁-125/126); and there is **no temporary "switch the current plan" OPS act at Wave-G**. Any
  repo text that says "switch Stripe to LIVE at the launch sitting" is **superseded** — see the
  truing line in §5.
- **裁-133 and 裁-111's time boxes are MOOT for this session** *(was "DECISION C")* — **one-line
  owner acknowledgement, not a decision.** Both are time-boxed "until beta live"
  (`AGENTS.md` Working protocol; digest `docs/adr/README.md:250`, `:496`), and 裁-150 point 2 rules
  that **no lane runs after the e2e** — so no lane exists for the Codex build lane or the
  cross-family review leg to resume into. The acknowledgement to record: *"both remain suspended,
  not repealed; whether they resume is decided when the next session starts, on my ask."*

---

## 0 · Preconditions — the sitting does not convene until these are true

| # | Precondition | Where it is proven |
|---|---|---|
| P1 | **Lane B (#517) is MERGED and `0164` is on `main`** | **MEASURED, MET.** `gh pr view 517` → `state: MERGED`, `mergedAt 2026-09-03T09:02:02Z` (= **17:02:02 MYT**), `mergeCommit aa789d65…`. `git log -1 -- packages/db/migrations/0164_checkout_gate_c6_web_reads.sql` → **`aa789d65`**, and `git merge-base --is-ancestor aa789d65 HEAD` → **true**: the migration is on `5eab358d`. The merge carried **55 files**. **FS-4 is CLOSED.** `PROGRESS.md`'s banner still reads DRAFT at this tip — it is stale and truing-4 is fixing it; read the tree, not the banner |
| P2 | **FS-9 signed off** — P6's entry gate CLOSED | DONE: `docs/plan/active/clarabook-conformance-pass-3-2026-09-02.md` header, `5d70b8dd`, 19 MET · 3 owner-owed · 2 deferred · 3 carried open |
| P3 | **FS-10 as-run filed** in `docs/plan/completed/` — Pages Git integration disconnected FIRST, preview URL walked route by route, DNS moved, Pages retired | orders `:455-477`; `docs/ops/wave-g-setup-checklist.md:204-217` |
| P4 | **FS-11 as-run filed** — `docs/plan/completed/wave-g-reduced-asrun-2026-09-XX.md`, every proof artifact retained (裁-122) | orders `:478-487`; checklist `:219-233` |
| P5 | **The Wave-G checklist re-walked WITH PROOFS** (裁-122) — every box either ticked with its named proof, or moved to a `PROGRESS.md` Known-issues row (ADR-0075 §6: a row is a deferral's only lawful home). **The four boxes that had no home in this agenda are now enumerated in G1, G2 and G5** | `docs/ops/wave-g-setup-checklist.md` end to end |
| P6 | **The weekly sweep GREEN on the launch tip** — read from `gh run view`'s job list, never a PR's colours | `AGENTS.md` CI/CD ¶3; last proof run `33712469717`, 13/13 green 2026-09-03 04:58Z |
| P7 | **The owner's console acts done before the walk** (see §4's list): the three below-the-fold SMTP fields (port · username = the literal `resend` · password) verified; the `whsec_` signing secret in Fly secrets; the Supabase PAT for the FS-11 receipts; OTP expiry 60 min once C-5's wall is live; **the *Reset password* template read back as a LINK template**; **the `age` identity in hand and the latest R2 bundle proven to decrypt** | checklist `:24-78`; `PROGRESS.md:109` owner-acts clause; 裁-131; 裁-146; `docs/ops/DR.md:376-381` |

---

## 1 · The go/no-go agenda — each gate, its positive read, where the evidence lives

Order is by what blocks a live launch, not by wave number.

### G1 · MAIL — the launch gate (裁-146)

- **Positive read that discharges it:** a **real signup confirmation** sent to and received at a
  **NON-team address** (not a member of the project's Supabase organisation) through the custom
  SMTP, the **six-digit code** arriving in about a minute and **verifying on the confirm page**.
- **What is ALREADY MEASURED, and exactly how far it gets you** (裁-146's own record, digest law 87
  at `docs/adr/README.md:500`; checklist `:24-33` and `:55-58`):
  - **custom SMTP CONFIGURED ≈16:08 MYT 2026-09-03** — Enable custom SMTP ON, host
    `smtp.resend.com`, sender `no-reply@mail.clarabook.com`, sender name Clara. **The port,
    username and password sat below the screenshot's fold and were NOT read back** — P7 owes that
    read, and the username must be the literal string `resend`, not a mailbox address.
  - **delivery to a NON-team address PROVEN ≈16:55 MYT 2026-09-03** — but through the **Supabase
    *Invite user* arm**, fired from the dashboard, carrying a **LINK**. That proves the transport
    and the sender identity and retires the default mailer's *Email address not authorized* wall
    **as a measurement**. It does **not** certify the gate.
  - **Therefore what is still OWED at the walk: the `/signup` six-digit-code arm** — the app's own
    courier path, `{{ .Token }}`, nothing to click. That is Act 1 in §4.
- **What does NOT discharge it, named explicitly:** a settings screenshot; a message delivered to a
  team address; the ≈16:55 Invite-user proof above.
- **Three items are REPORTED, not measured (裁-112), and are read back at the walk:** the test user
  deleted · the Rate Limits raise applied (**the raised value was never stated, so no number is
  recorded anywhere**) · the *Confirm signup* template carrying `{{ .Token }}`. The template read
  must be a **Management API read, not a screenshot of the editor** —
  `docs/plan/active/security-pass-2026-09-02.md` item 8.
- **The Resend-side boxes that belong to this gate and had no home before** — all three are
  checklist boxes and all three are still open:
  - **the API key scope is `sending_access` ONLY, domain-restricted to the verified domain**
    (`docs/ops/wave-g-setup-checklist.md:19`). Read: the key's scope page in the Resend dashboard.
    A full-access key on a public-repo estate is a standing credential-blast-radius item.
  - **Message storage OFF** (`:20-21`) — the invite link's `?ct=` bearer token sits in the request
    body; Resend must not retain it.
  - **Team log access restricted** (`:22-23`) — the Logs API/dashboard is the same body-and-ingress
    exposure named at P4-4 round 3 (H1).
  - Each either ticks with a named proof, or moves to a `PROGRESS.md` Known-issues row (ADR-0075 §6).

### G2 · THE CUTOVER (FS-10) and its 11-line security checklist

- **Positive read:** the FS-10 as-run, plus **every one of the eleven lines ticked** in
  `docs/plan/active/security-pass-2026-09-02.md:542-592`. The four that decide whether a real
  applicant can get in at all: (1) the C-5 runtime route replaces **both** stubs in
  `apps/web/app/(entry)/auth/confirm/verify/confirmation-wall.ts`; (2) claim → `verifyOtp` → settle
  happen **inside one server request**, `attempt_id` never crossing the wire; (3) the trusted
  client-IP courier live — `CLARA_TRUSTED_CLIENT_IP_HEADER` + `CLARA_RATE_WALL_PEPPER` set on
  `apps/web`; (4) `clara_auth_wall_login` flipped to **LOGIN out of band**, its DSN in the runtime
  env only.
- **The variable most likely to be got wrong** — same NAME, two correct VALUES:
  `CLARA_TRUSTED_CLIENT_IP_HEADER` is **`CF-Connecting-IP`** on `apps/web` and
  **`X-Clara-Client-IP`** on the RUNTIME. Any other runtime value ⇒ 503 on every applicant's
  confirm, with nothing in either app's config looking wrong
  (`docs/ops/wave-g-setup-checklist.md:114-124`).
- **The two reverted-state reads FS-10 owes this gate, and they are GATING, not assumptions.** The
  preview walk can widen the auth surface, and nothing in the agenda asserted it was narrowed
  again:
  - **the redirect allowlist is back to exactly two entries with no wildcard** —
    `<origin>/auth/confirm` and `<origin>/auth/recover`
    (`docs/ops/wave-g-setup-checklist.md:151-156`). The instrument is the **Management API read
    `GET /v1/projects/{ref}/config/auth`** (`apps/web/README.md:396-403`), not the dashboard screen.
    Widening it for a preview walk is a security-mechanism change, and constraint 14's operative
    clause says mechanisms are never weakened for testing convenience — so if it was widened, the
    read proves it was put back (FS-10 prep A8 `:344-349`, R5 `:397-406`).
  - **the `workers.dev` preview alias is deleted or preview URLs disabled** — it was publicly
    reachable and wired to the LIVE Supabase project (FS-10 prep R4 `:397-401`). The read is the
    alias returning nothing, recorded in the FS-10 as-run.
- **Two more checklist boxes that belong here and had no home before:**
  - **the invite-link `?ct=` query VALUE is redacted at the edge/access log**
    (`docs/ops/wave-g-setup-checklist.md:142-145`, 裁-65 / P4-4 round 3 item 75). **Its proof is
    named in the checklist and is a real read:** a request against a live invite link, then a read
    of the edge/access log showing the `ct` value masked or absent. This is the ingress half of
    G1's Resend-side "Message storage OFF" — both halves or neither.
  - **Supabase Auth → "Allow new users to sign up" is ON** (`:149-150`) — the tier-3 self-serve
    path (裁-43/裁-68). With it OFF, every gate below it passes and no applicant can start.
- **Also on this gate:** OPS.x — the Workers deploy's parts union ⊇ the serving runtime's emittable
  kinds (裁-121②, checklist `:230-231`); HTTPS-only on the deployed origin (`__Host-` cookies are
  silently dropped over plain HTTP, security pass item 11); the FS-10 acceptance line that
  **self-serve signup is unreachable in the deployed build until the confirmation wall is wired**
  (`PROGRESS.md` Known issues, the SECURITY row).

### G3 · THE RESET AND THE SPAN (FS-11)

**The mechanism, written the way it actually runs — there is no delta apply.**

1. **BANK THE BACKUP, then PROVE IT RESTORES — before anything destructive.** The checklist's own
   words are "confirm the backup completed **and is restorable** before the reset proceeds"
   (`docs/ops/wave-g-setup-checklist.md:263-265`).
   - **The instrument is a REAL restore of that bundle**, under `docs/ops/DR.md` §9's
     **monthly-light** recipe (`:433-437`) — decrypt the latest bundle with the `age` identity →
     restore the DB dumps into a **local throwaway PG17** → the subset of `dr-verify` (schema
     presence + the manifest migration floor + the AP gate) — or, at the stronger bar, the STRICT
     fresh-project recipe (§5b `:203-…` / `docs/ops/DR-full-drill.md` §3 `:51-…`).
   - **`DR.md` §5 does NOT discharge this, and DR.md says so itself:** §5 is the **default-profile**
     single-schema selftest, and `DR.md:194-201` states *"Do not treat the single-schema drill alone
     as evidence of full recoverability — §5b is that evidence."* Citing §4/§5 here was the wrong
     instrument.
   - **State the drill's DATE at the sitting** (§4, owner acts) — and note that this restore, run on
     the pre-reset bundle, simultaneously discharges G9's overdue monthly-light cadence.
   - **`DR-full-drill.md:128-146` enumerates the POST-RESTORE ceremonies none of which the dump
     carries** — `roles-bootstrap.sql`, the storage provision, the two login ceremonies,
     **`acl-baseline.sql` (MANDATORY)**, the engine-sanity check, then `dr-verify`. A restore that
     skips them is not a proven restore.
2. **RESET = `DROP SCHEMA clara CASCADE`, scoped.** The runner is `packages/db/scripts/reset.mjs`;
   it **preflights `pg_depend` for cross-schema dependents and ABORTS** rather than cascading beyond
   `clara` (`:71-80`), and it short-circuits when the schema does not exist (`:64-68`).
   **Hard constraint 15 holds by construction:** the Slice-0 spike's `workflow`,
   `graphile_worker` and `spike` schemas are independent of `clara` and are never touched
   (`reset.mjs:11-13`). Positive read: `to_regnamespace('clara') is null` → true, **and the other
   four schemas still present**.
3. **APPLY THE WHOLE CHAIN `0001` … `0164` — a FRESH apply, not a delta.** `clara.schema_migrations`
   lives **inside** `clara` (`packages/db/scripts/migrate.mjs:322`), so it goes with the drop and the
   migrator re-applies every file from the floor. **Count the directory, never a document's list:**
   `ls packages/db/migrations/*.sql | wc -l` = **159**, floor `0001_smoke.sql`, frontier
   `0164_checkout_gate_c6_web_reads.sql`. Positive read: `159` rows and version
   `0164_checkout_gate_c6_web_reads` from `clara.schema_migrations`.
4. **SEED** (synthetic only) → **`0155`'s UNIQUE constraint applies AFTER the reset, never before**
   (裁-41/裁-45/裁-67; checklist `:266-269`).
5. **Re-deploy the nine evaluators** — a full re-migration ships every evaluator **DARK**
   (FS-11 prep §1.3); nine `deployed = true` rows plus a clean freeze verify.
6. **BELCORT's `is_operator` as its own ceremony step** (裁-121③, runbook
   `docs/ops/g1-operator-firm-ceremony.md`) — and note FS-11 prep §1.2: it **cannot** run where the
   stated order puts it, because BELCORT does not exist immediately after the reset.
7. **The `stripe_object_map` OPS act.** Positive read:
   `select object_kind, local_key, stripe_id` showing
   `('product','clara-beta-2026','prod_VBS7ZUaIFPedCs')` and
   `('price','clara-beta-2026','price_1UB5DZHD90w0k86XNfkgYPWq')`, **plus one
   `open_checkout_intent` call that does NOT raise `CLR10 no stripe price is mapped for this
   plan`** (checklist `:184-189`). Without this seed a beta signup dies there.
8. **THE 裁-136 ONE-SHOT MEASUREMENT, TAKEN HERE — a PRE-WALK read, not a first-hour one.**
   `select count(*) from clara.report_artifacts;` **after the seed and BEFORE the walk's first
   seal.** The first seal lands *inside* the walk (step 15, the byte-burn render — §8 item 3), so by
   the time the sitting convenes the fact is **no longer checkable**. It is recorded in the **FS-11
   as-run** (checklist `:252-254`), and the sitting **reads it back** rather than taking it. G6
   below is a read-back gate for exactly this reason.

### G4 · THE WALK — beta-ready as defined

- **Positive read:** all sixteen happy-path steps walked end to end on the reset estate with the
  desktop corpus, **driven in a real browser** (Playwright, 裁-86), each step receipted, the as-run
  written, every MBB-1 gap the corpus cannot supply marked **资料缺失** and never awaited (裁-63).
- **Two pre-walk reads gate the walk's start** (both from G3): the `report_artifacts` count taken
  before the first seal, and the `stripe_object_map` seed proven by an `open_checkout_intent` that
  does not raise `CLR10`.
- **The checkout leg is re-cut by 裁-148:** it walks **ONCE at the seeded beta price — sandbox,
  MYR 0**. It does **not** walk a non-zero test price, and **no temporary "switch the current plan"
  OPS act** is performed to make one walkable.
- **Evidence lives:** `docs/plan/active/frontend-sprint-handoff-2026-08-31.md:285-293` (§9, the
  definition of done) · 裁-83 (`docs/plan/active/mohe-grill-rulings-2026-08-31.md:175-182`) ·
  checklist `:219-233`.
- **Carry a warning into this gate:** see §9 risk R4 — "sixteen" is a COUNT with no enumerated list
  in the repo.

### G5 · BILLING / STRIPE

- **RULED, and this gate is now simple (裁-126 + 裁-148).** Beta runs **entirely in the BELCORT
  Stripe sandbox at MYR 0, for the whole beta.** There is no live-mode flip at this sitting.
- **Positive read (a) — the beta journey, and the only checkout walk at Wave-G:** a checkout at the
  **seeded beta price (sandbox, MYR 0) completing with no payment details entered at all** — the
  plan row drives `payment_method_collection='if_required'` while the amount is 0, flipping to
  `'always'` when the amounts are ruled (`docs/plan/active/checkout-gate-gate-record.md` §G13,
  `:355-370`). The chain read end to end: the checkout completes → the **signed webhook** arrives →
  the **firm is born** → the invoice/receipt surface renders.
- **Positive read (b) — the rendering rule:** the string **"RM0" appears on no customer-facing
  surface** — the surfaces say "no fee is charged" / "trial" in words (裁-58;
  `docs/ops/legal/clara-beta-terms.md:104-110`).
- **Positive read (c) — the box that had no home before: Stripe Tax / Malaysian SST**
  (`docs/ops/wave-g-setup-checklist.md:181-183`). The checklist's own rule is *"switched on only
  once BELCORT's own SST registration status says so — no tax line before registration."* At MYR 0
  there is no tax line to compute, so the expected read is **Stripe Tax OFF for beta**, and what the
  sitting needs from the owner is **BELCORT's SST registration status, stated on the record** — so
  the real-money switch ceremony inherits a fact rather than a question.
- **What moved OUT of this gate:** the non-zero-test-price walk. 裁-148 moves it to the
  **REAL-MONEY SWITCH ceremony** (Stripe live mode + KYB, 裁-125/126). It is not a beta gate and
  must not be walked here.
- **The pre-上市 roadmap this gate sits inside** (裁-148 point 3, to be carried as an ordered
  `PROGRESS.md` Backlog list per 裁-150 point 3): **beta live** (template legal texts + RM 0) → the
  **pricing sitting** (裁-58) → the **billing tier tranche** build (裁-144) → the **lawyer pass** on
  the legal texts → the **real-money switch + KYB + the non-zero checkout walk** = **上市**.

### G6 · THE FIRST REAL SEALED ARTIFACT (裁-136) — a READ-BACK gate

- **Positive read, read back from the FS-11 as-run, not re-measured here:**
  1. the **first sealed artifact's manifest** naming `-raw` in its `extraction_tool` string — read
     off the artifact, never off the source (the mode is pinned in
     `packages/reporting-render/lib/extract.mjs:70`, `EXTRACT_FLAGS`). A manifest that does not name
     `-raw` means an older image ran and **the seal must be redone**;
  2. the **pre-walk `clara.report_artifacts` count** captured in G3 step 8 — the last moment that
     fact was checkable, and what makes "no hash migration is owed" a measurement rather than a
     memory.
- **If either line is missing from the as-run, it cannot be recovered.** The gate then records
  **UNPROVEN IN THE FIELD**, with which it was, and a Known-issues row carries the consequence.
- **After this gate the mode is load-bearing history:** any later change is a **HASH MIGRATION**
  needing its own owner ruling, because `clara.report_artifacts` is insert-once with UPDATE
  trigger-blocked. 裁-136 is not a precedent for a second free change
  (`docs/ops/wave-g-setup-checklist.md:235-259`).

### G7 · THE OPERATOR TIER (裁-143) — and 裁-147's manual line

- **Positive read:** BELCORT carries `is_operator` after the reset ceremony, and the operator
  surface renders for a BELCORT **owner** and **not** for anyone else. The nav entry is
  `operatorOnly: true` at owner floor (`apps/web/lib/firm/navigation.ts:91`), gated by
  `isOperatorConsoleEligible` (`:129`), on the `caller_context` row's `is_operator` field
  (`apps/web/lib/identity/caller-context.ts:27,43`).
- **The hard cap is LAW and the sitting confirms nothing widened it** — two read queues
  (registration applications; Stripe problem events) plus one control that reads nothing
  (`clara.set_wake_source_enabled`), and **never any figure of another firm's books**
  (`docs/product/PRD.md:106-157`, the OPERATOR-tier subsection; digest law at
  `docs/adr/README.md:499`). Both queues are pre-firm admission-plane objects, so §6 invariant 2's
  tenancy wall is untouched by design.
- **裁-147's manual line, now a gate item.** The operator screen for the C-2 Stripe problem-event
  doors is **built AFTER beta live** (a Backlog row). Meanwhile: **at the walk AND at the cutover
  the operator runs `clara.list_stripe_event_problems()` (or a select on
  `clara.stripe_event_problems`), and the result must be EMPTY of unhandled rows before the cutover
  proceeds**; a non-empty result is resolved through `resolve_stripe_event_problem` with its reason.
  Both doors are `packages/db/migrations/0160…:562,580`.
- **Not in the repo yet:** 裁-147's checklist line and its Backlog row ride **truing-4**; the
  governing text is `…/scratchpad/truing/ruling-147.md`. The ledger records it as owed at
  `docs/plan/active/mohe-grill-rulings-2026-09-03.md:235` — **blocked because
  `docs/adr/README.md` is at exactly 500/500 lines and needs the split first.**
- **Known shape, not a defect:** those two doors have **no operator screen yet** — which is exactly
  why §6.2 reads them by manual select.

### G8 · LEGAL

- **DPA — the instrument, named.** v1 is seeded and its body must be **byte-identical** to the
  canonical block of `docs/ops/legal/clara-beta-dpa.md` (`:18-30`, THE BYTE-IDENTITY LAW, with the
  mechanical extraction rule at `:25-30`). **The DB CHECK recomputes the digest from the STORED
  bytes, so nothing in the database can catch file-vs-row drift — only this law and a reader can.**
  The read is two commands and a comparison, run at the sitting:
  1. **From the file**, at the repo root (the block is `docs/ops/legal/clara-beta-dpa.md:91-97`,
     printed verbatim there so it cannot close its own fence):
     `node -e 'const F = "```"; const s = require("fs").readFileSync("docs/ops/legal/clara-beta-dpa.md","utf8"); const re = new RegExp("clara-dpa-body:begin ([^>]*?) -->\n" + F + "[a-z]*\n(.*?)\n" + F + "\n<!-- clara-dpa-body:end","gs"); for (const m of s.matchAll(re)) console.log(require("crypto").createHash("sha256").update(m[2],"utf8").digest("hex"), m[1].trim());'`
     It prints one line per canonical body; **v1 must print
     `6d1c97a5cf8a22994b12dcb1b113c53bc2b1edb282f5c1237ff1ef12c679c7b3`** (99 bytes,
     `clara-beta-dpa.md:79`).
  2. **From the row**, through the CA-pinned bridge:
     `select version, body_sha256, source_path, effective_from, effective_to from clara.dpa_documents order by version;`
  3. **Compare the two hex strings.** Equal ⇒ the provenance claim holds. Unequal ⇒ the seeded row
     and the file have drifted and the sitting has found a real defect, not a nit.
  The lawyer-reviewed text is owed at official launch and publishes as a **new version row, zero
  code change** (`PROGRESS.md` Backlog; 裁-90).
- **Beta terms:** a **SEPARATE document kind**, never one combined signature (裁-129); RM 5,000
  liability floor; courts of Kuala Lumpur. Template with 27 `[LAWYER]` / 34 `[verify]` markers,
  **never darkened for beta** (裁-125). The lawyer's ordered checklist is
  `docs/ops/legal/clara-beta-terms.md:111-129`.
- **Positive read required, not a reading:** the same `select` above must show the **terms row in
  force** — see §9 risk R3, where the repo contradicts itself on whether it is
  (`clara-beta-terms.md:840` says **"NOT SEEDED. NOT IN FORCE."**).
- **Signup-gate composition (裁-145):** five items, four live — DPA e-sign · Beta terms · rate wall ·
  Stripe checkout success. The email-bound token is **RETIRED** by 裁-89's one-transaction fold and
  was never built (`docs/adr/README.md:499`).

### G9 · DR / READINESS / SLO — discharged by reads and dates, not by document claims

- **Positive read, the runtime:** `/ready` returns `ready:true` with `checks.db.ok` true
  (`docs/ops/DR.md` §6); `fly status -a clara-runtime` shows the intended VERSION with checks 2/2.
- **Positive read, the backup alarm — a READ, not the document's claim.** `DR.md:297-299` says the
  healthchecks.io dead-man's switch has been live since 2026-07-22 with a daily period and 26h
  grace. **That is a report.** The gate discharges on **opening the healthchecks.io check and
  reading its STATUS and its LAST PING time** — green and within grace. Beside it, the last
  `clara-backup` run line from `fly logs -a clara-backup` (the pipeline ends in a success ping;
  `DR.md:359-370`). The ping URL itself is a Fly secret (`CLARA_BACKUP_PING_URL`, `DR.md:381`) —
  **read the dashboard, never print the URL** (裁-135: the repo is public).
- **Positive read, the verify cadence — state three dates and mark each against its cadence**
  (`DR.md:431-440`):

  | Drill | Cadence | Last, per the repo | Status at 2026-09-03 |
  |---|---|---|---|
  | Monthly-light: decrypt the latest **R2 bundle** + restore + the `dr-verify` subset | monthly | **2026-07-22** (`DR.md:404-415` — the bundle downloaded from R2, owner-decrypted, restored into a throwaway PG17) | **OVERDUE (~43 days)** |
  | Local full-profile round trip, STRICT | (the same bar, run locally) | **2026-08-06**, 330 probes (`DR.md:418-429`, ADR-062) | 28 days — recent, but **not against an R2 bundle** |
  | Quarterly-full: the STRICT **fresh-project** drill (§5b / `DR-full-drill.md` §3) | quarterly | **2026-07-20**, 177/0 STRICT (`DR.md:203`) | not due until ≈2026-10-20 |

  **The overdue row is discharged by G3's own pre-reset restore** — that restore *is* a monthly-light
  run against the freshest bundle. Say so on the record so the two are not counted twice, and so the
  sitting does not accept "the backup ran" in place of "the backup restored".
- **Knowingly open, accepted at launch:** the **external `/ready` uptime check is NOT wired** —
  `DR.md:299` calls it "the open wiring piece" and `PROGRESS.md` Backlog carries it. For the first
  hour **the lead is the alarm** (§6).
- **Knowingly open:** no PITR — recovery granularity is the last daily backup (`DR.md:322`, the
  residual the owner accepted 2026-07-20); the off-site dump cadence and the D1 write-quiesce
  discipline are the compensating levers. **This residual only has a recovery path behind it if the
  `age` identity is in hand** — see the P7 owner act; the identity lives in **owner custody,
  off-repo AND off-R2** and **decrypts the whole bundle, books and `auth` PII**
  (`DR.md:376-381`), and any restore-into-a-project is **owner-run by the classifier**
  (`DR.md:397-402`).
- **Knowingly open:** the e2e re-render DR drill stays UNRUN until the first sealed artifact
  (`docs/ops/DR-render.md`; `PROGRESS.md` Backlog).

### G10 · ENGINEERING GATES AND GOVERNANCE

- **CI:** the required check `ci` is a fail-closed meta-gate; the sweep-only legs (closed-wave
  drills, D-b frontier matrix) run on the weekly sweep + manual dispatch, and **a hand dispatch is
  OWED after any merge touching a closed drill or the pipeline** (`AGENTS.md` CI/CD).
- **SG-3 stands unchanged at launch:** ADR-060/ADR-0075's authority is **DATA-scoped only**; the
  product's mechanisms and these criteria never relax for convenience — the operative clause on any
  collision (`EVALUATION_RUBRIC.md` SG-3; `AGENTS.md` hard constraint 14). **This is the clause that
  decides G2's two reverted-state reads:** a preview-widened allowlist is a weakened mechanism until
  a read proves it narrow again.
- **SG-2, the agent-native surface test:** remove the chat rail and the workbench still shows what
  Clara did, why, with what evidence, and offers every Clara action as an object-level verb.
- **SG-4, accessibility is a shipping gate:** the token-contrast script, the WCAG rule engine,
  the keyboard walk, 裁-13's 24 px target floor read from `--target-min`, and the built-app leg
  `apps/web/e2e/a11y-finish-walk.spec.ts`.
- **The two time boxes are ACKNOWLEDGED, not ruled** (see the OWNER DECISIONS block): **裁-133** (no
  Codex lane of any kind, builds included) and **裁-111** (the cross-family Codex adversarial review
  leg). Both are "until beta live"; 裁-150 point 2 closes the session after the e2e with **no next
  lanes**, so there is nothing for either to resume into tonight. Neither is repealed; both are
  decided when the next session starts, on the owner's ask
  (`AGENTS.md` Working protocol; `docs/adr/README.md:250`, `:496`).
- **裁-135 stands until the owner reverses it at official launch:** the repo is **PUBLIC** and CI is
  GitHub-hosted. Consequence for this sitting's paperwork: **no as-run, ledger or PROGRESS line may
  carry a secret, a DSN, a `whsec_`, a healthchecks ping URL or a PAT value** — env-to-env, never
  printed (hard constraint 4, hard constraint 14).

---

## 2 · Knowingly open at launch — the list the owner accepts

*Every row below is already carried in `PROGRESS.md` (Known issues or Backlog), which ADR-0075 §6
makes the only lawful home for a deferral. None is beta-gating on the record as it stands; the
sitting's job is to accept them **out loud**, not to discover them.*

**Product / security shape**

1. **`livemode` is stored and never read** (裁-120 A-M5). C-5's webhook route gates on
   `CLARA_STRIPE_LIVEMODE`, fail-closed when unset. **Beta never flips it** (裁-126/148); the flip
