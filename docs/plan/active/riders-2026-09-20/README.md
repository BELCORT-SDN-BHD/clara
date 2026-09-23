# Riders 2026-09-20 — everything outside the #597 mainline, in waves

**Owner's direction (2026-09-20):** one long-running session finishes every open ticket outside the
mainline (small riders, the grilled follow-ups, the idea-round features #927–#949), orchestrator
style; the next session resumes the mainline on a clean board. "无损": quality first, nothing broken.

Standing rulings that bind every lane: **beta, nothing dark** (a compliance gate prompts, never
disables; access control is not loosened); **Client KB, no manual pre-registration**; **shadcn upstream
is the standard** for UI primitives; **verify accounting against the standard** (IAS 8 / MFRS / MPERS)
and let Clara ask for a professional judgement. The 24 grill rulings of 2026-09-20 are on their
tickets.

## Inputs
- The scan of 109 agent-ready tickets (what each touches, migration, successor cut, dependencies,
  size, risk): session scratchpad `riders/scan-all.json` (2026-09-20, base `main` `dd3f8f1d`).
- The rig: ten worktrees and ten fresh PostgreSQL 17 clusters at 229 / `0234` (`RIG.md`).
- The common rules: `WORK-ORDER.md` here, which extends the wave's
  `../refresh-wave-2026-09-18/WORK-ORDER.md`.

## Method: the repo's own `/implement` philosophy, followed to the letter

The owner asked on 2026-09-20 whether this programme really follows `/implement`. Read against the
skills (`.claude/skills/implement`, `implement-spec`, `tdd`, `code-review`) the first work order had
three gaps, corrected from wave 2 on (and patched onto wave 1 before it integrates):

- **`/tdd` = vertical slices.** One test → red → minimal code → green → the next test; never a
  battery of red cells first. Tests go through the public seams the ticket names, with expected
  values from an independent source; mock only at system boundaries; refactor in review.
- **One implementer per ticket** (`/implement-spec`): every ticket gets a FRESH worker context. A
  lane is only a resource (one worktree, one database) that runs its tickets one after another.
- **`/code-review` = two SEPARATE axes**, Spec and Standards, run in parallel and reported side by
  side, never merged; Standards always carries the Fowler smell baseline. The adversarial lens and
  the recheck are additions on top, never substitutes.

Wave 1 started under the older wording (several tickets per worker, one merged reviewer). It is not
restarted; before it integrates, every lane gets a faithful two-axis `/code-review` pass (with the
smell baseline and a check of test quality), a fix round and a recheck.

## Waves
1. **Wave 1 — no migration at all** (42 tickets, ten lanes): test infrastructure, CI and tooling, web
   polish, non-frozen runtime. Ships as one PR; release = web + runtime image, no database window.
2. **Wave 2: migrations, small and medium** (42 tickets, ten lanes). A ticket that needs a migration gets its
   OWN migration file, its number reserved in lane order then ticket order from the next free
   number; tickets that recut the same bodies sit in the SAME lane so each measures its pins after
   the one before it. The lane table with the reserved numbers is under "Wave 2 lanes" below.
3. **Wave 3 — the rest of the small and medium work**: counterparties (#889 #890 #921 #982 #1007),
   cash and bank (#958 #1001 #1002 #990), shadcn and test infrastructure (#970 #989 #864 #997),
   fixed assets B (#975 #932 #882 #978), plans small (#908 #909 #919 #936, #927→#928→#929), #899,
   #1012, #986, #1000, #944.
4. **Wave 4 — the feature chains** (payroll #945→#946→#947, staff claims #930→#931, accruals #937
   #938 #942, prepayments #939 #940 #941 #915, hire purchase and tenancy #948 #949, firm setup
   #934→#935, #885), ending with the ONE shared successor cut `chatTurn_v22` / `claraWork_v6` that
   carries every successor contract delivered on the way (#915 #931 #933 #937 #940 #941 #942 #948
   #949 #982 #985 #1000 #1007). Five tickets still carry an open product question the scan found
   (#885 #934 #935 #942 #949): the owner is asked before their lanes start.

Each wave: per ticket implement (vertical-slice TDD) → two-axis code review (+ adversarial where the
risk is high) → fix → recheck → integration branch (merges in lane order, from-scratch chain on a
fresh cluster when a migration exists) → PR → `ci` → merge → hosted release → hosted-evidence
comment and close on every ticket.

## Wave 3 lanes (planned 2026-09-20 from the scan of the integrated wave-2 head)

42 tickets, reserved migration numbers `0273` to `0291`. Grouped so that no function body is written in one lane and written or likely pinned in another (the wave-2 lesson: a prestate pins neighbour bodies too).

| lane | worktree | theme | tickets (reserved migration) | adversarial lens |
|---|---|---|---|---|
| 01 | `clara-wt/635` | counterparties | #890 (none) #921 (0273) | no |
| 02 | `clara-wt/636` | trade invoice integrity | #982 (0274) #1007 (0275) | yes |
| 03 | `clara-wt/642` | cash presentation and governance | #958 (none) #1001 (none) #1002 (0276) | no |
| 04 | `clara-wt/651` | fixed assets | #932 (0277) #882 (0278) #975 (0279) #978 (none) | yes |
| 05 | `clara-wt/655` | plans core | #908 (0280) #909 (0281) #927 (0282) #928 (none) #929 (0283) | yes |
| 06 | `clara-wt/656` | plans and journals reads | #936 (0284) #919 (0285) #986 (0286) | yes |
| 07 | `clara-wt/657` | client and document governance | #899 (0287) #1012 (0288) #889 (0289, narrowed on the ticket) | yes |
| 08 | `clara-wt/658` | small fixes | #857 (0290, the CHECK half) #990 (0291) #1019 (none) #1020 (none) | no |
| 09 | `clara-wt/659` | shadcn and browser test infrastructure | #970 #989 #864 #997 #1017 (none) | no |
| 10 | `clara-wt/660` | runtime and CI test infrastructure | #1015 #1016 #1018 #1023 #1028 (none) | no |
| 11 | `clara-wt/int` (no database) | web tests and the Clara rail defect | #1024 #897 #1021 #1022 (none) | no |

Held out: #1000 (its whole scope needs the successor cut: wave 4), #944 (a blueprint statement: lands with #945 in wave 4). Rulings of 2026-09-23 (the owner took every recommendation): #871 rides wave 4 as a server-only database door on the auth-wall pattern (re-briefed on the ticket); #1032 (the #891 remainder) rides wave 4 as option A (TIN always offered, required only when MyInvois is mandatory); #1030 (the #885 remainder) rides wave 4 with the successor cut; #912 ratified as shipped. Also wave 4: #877 (a Tier-A-complete autodraft fixture, runtime test infrastructure), which the wave-3 scan had missed.

## Wave 2 lanes (planned 2026-09-20, numbers reserved before the wave starts)

42 tickets, 37 reserved migration numbers `0235` to `0271`, assigned in lane order then ticket order. A
ticket that turns out to need no migration leaves its number unused (the runner does not ask for
gapless numbering). Tickets that recut the same function body sit in ONE lane; the scan found no
function body touched from two lanes (`clara.fa_depreciation_authorities` is read by #979 in lane 04
and by #974 in lane 07, neither alters it).

| lane | worktree | theme | tickets (reserved migration) | adversarial lens |
|---|---|---|---|---|
| 01 | `clara-wt/635` | journals and the opening lane | #1014 (0235) #868 (0236) #906 (0237) #914 (0238) #984 (0239) | yes |
| 02 | `clara-wt/636` | Knowledge keys and the audit log | #898 (0240) #913 (0241) #993 (0242) #912 (0243) #991 (none) | yes |
| 03 | `clara-wt/642` | capability registry and operation levels | #846 (0244) #782 (0245) #988 (0246) | yes |
| 04 | `clara-wt/651` | fixed assets | #972 (0247) #973 (0248) #976 (0249) #977 (0250) #979 (0251) | yes |
| 05 | `clara-wt/655` | document intake | #964 (0252) #968 (0253) #965 (0254) | yes |
| 06 | `clara-wt/656` | firm setup | #894 (0255) #895 (0256) #891 (0257) #934 (0258) #935 (0259) | no |
| 07 | `clara-wt/657` | Firm Home | #974 (0260) #995 (none) #1009 (none) #998 (0261) | no |
| 08 | `clara-wt/658` | Activity and the operator timeline | #840 (0262) #843 (0263) #861 (0264) | yes |
| 09 | `clara-wt/659` | Work list and parked Work | #839 (0265) #880 (0266) #905 (0267) #885 (0268) | yes |
| 10 | `clara-wt/660` | settings, invitations, firm caps | #871 (none) #872 (0269) #996 (none) #960 (0270) #1003 (0271) | yes |

Moved since the first plan: #1014 (found by #854) leads lane 01; #934 and #935 joined lane 06 and
#885 joined lane 09 once the owner settled their open questions on 2026-09-20; #998 moved to lane 07
beside the other Firm Home work; #897 (stopped in wave 1, scope widened on the ticket) rides wave 3.

## Wave 1 lanes

| lane | worktree | cluster / db | tickets |
|---|---|---|---|
| 01 | `clara-wt/635` | `rl01` 55741 `clara_l01` | #862 #863 #865 #902 #853 #848 |
| 02 | `clara-wt/636` | `rl02` 55742 `clara_l02` | #851 #858 |
| 03 | `clara-wt/642` | `rl03` 55743 `clara_l03` | #845 #844 #884 |
| 04 | `clara-wt/651` | `rl04` 55744 `clara_l04` | #866 #867 #854 #857 |
| 05 | `clara-wt/655` | `rl05` 55745 `clara_l05` | #849 #917 #957 #959 #994 #969 |
| 06 | `clara-wt/656` | `rl06` 55746 `clara_l06` | #850 #967 #963 |
| 07 | `clara-wt/657` | `rl07` 55747 `clara_l07` | #842 #878 #896 #900 #903 #904 #876 #987 |
| 08 | `clara-wt/658` | `rl08` 55748 `clara_l08` | #1005 #956 #875 #874 #879 #897 |
| 09 | `clara-wt/659` | `rl09` 55749 `clara_l09` | #852 #966 |
| 10 | `clara-wt/660` | `rl10` 55750 `clara_l10` | #981 #980 |

Held out of wave 1 on purpose: #864 (needs #851 first), #989 (rides #970's shadcn ruling in wave 2),
#944 (a blueprint statement, lands with #945 in wave 3).
