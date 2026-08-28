# As-run — the 0139+0140 apply ceremony (D1 window), 2026-08-28

**Result: live advanced 133/`0138` → 135/`0140_f_a4_pr_2a_prepayment_limb`. Both applies
atomic, every prestate and tail census green, the window held ~4 minutes of runtime stop,
`/ready` 200 on restart.** Conducted by the agent under the ceremony run grant; run from
merged `main` at `bc4cdc8`'s frontier, migration file sha256
`65f68dc9fdab0da25a90ded5a2dd0d536730b3fca0b8fb1802ea0ce1babba7ee` re-confirmed pre-window.

## 1 · The window's measured basis

- **Rig precondition (W36/W37 null-stability) PROVEN pre-window** on an instance-unique
  throwaway at the 0139 frontier: twin-template occurrence lines byte-identical across the
  apply, 7-arg hash moved on 0 templates, 7-vs-8-arg disagreements 0, `content_hash`
  reproduction flips 0. The probe met CLR38 `period_shape_already_met` on its first cut —
  a real wall refusing a duplicate charge — and moved twin B to its own client rather than
  working around it. The rig catalog differential (972 → 982 functions) showed **exactly
  the 7 declared bodies moving** — 4 quiesce-bearing writers, 1 read projection, 2 idle.
- **Full manual-dispatch CI sweep ALL-GREEN at the frontier** (run 33144999230), closed-wave
  drills and the D-b frontier matrix included. A ceremony never opens on a red sweep.
- **Backup banked FIRST**: bundle **23,107,862 bytes** →
  `r2:clara-dr/db-snapshots/2026/2026-08-28T05-33-13-879Z/`, exit 0, hc-ping success,
  migration-head 133 confirmed in the bundle manifest.
- **TLS live leg re-proven both polarities** (`docs/ops/dsn-bridge.md` review item): pinned
  CA `Verification: OK` + `Verified peername: *.pooler.supabase.com` exit 0; default trust
  store exit 1 (self-signed in chain). The pin binds.

## 2 · The five refuse-conditions, each a positive read on live

1. **Tripwire**: all SEVEN prosrc sha256 values byte-identical to the rig's 0139-frontier
   captures (`b95e213c…`, `3d0664d4…`, `34b8b7ef…`, `81b1bb06…`, `91bc7f0a…`, `e54d9cbb…`,
   `527ca79a…`) — no hand-patched live body; the superseded-body class had nothing to erase.
2. **No eighth body**: live pre-state ≡ rig pre-state (the tripwire) + the rig differential
   moved exactly 7 ⇒ the live apply moves exactly 7.
3. **`close_prep` read positively `enabled=false`** (whole population) — the two idle
   bodies' quiesce excuse held; §0 would also have refused.
4. **`agent_act_receipts` count 0** — the one validating CHECK scanned nothing.
5. The sweep above.

## 3 · The window as run (times UTC)

1. ~05:44 `fly machine stop 48ee715b763048 -a clara-runtime` — stopped clean.
2. Session reap + **positive zero-non-idle read**: `NON_IDLE_AFTER|0` across the five
   runtime-family login roles (the stop had already closed every session; nothing to reap).
3. **Apply** via the sleeper bridge (`fly machine exec <sleeper> "printenv DATABASE_URL" |
   node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/migrate.mjs` — env-to-env,
   verify-full, pinned CA): `0139` applied (tail: 27 cols · 25 named constraints · the
   supersede-only/no-delete/no-truncate trigger trio · forced RLS, exactly 1 owner policy ·
   relacl NULL true-closed-world · clean 5-role roster · zero rows) then `0140` applied
   (prestate: null-stability premise HELD on live, 5 replaced bodies pinned with ACL/secdef/
   config triples; tail highlights: **the park is OVER** — wrapper 12 + the evaluator invert
   0138 T.9's positive-absence gate · close_prep allowlist **12 → 13 measured** · wrapper 12
   holds exactly ONE grant, `clara_wake_interactive` · **exactly one 11-arg
   `propose_adjustment_template` overload with its harvested ACL** · the R6 scope cut PROVEN
   (three untouched bodies byte-identical to prestate shas) · `proposed_request_digest` is
   sha256-not-md5 and absent from `v_frozen` (immutable by absence) · frozen schemas
   (constraint 15) positively checked). `migrate: 2 new migration(s) applied · 135 total`.
4. **Post-reads**: frontier `0140_f_a4_pr_2a_prepayment_limb` · 135 migrations · evaluator
   row `prepayment_schedule | 1 | 0140… | deployed=f` (**dark until PR-2b's own ceremony —
   correct**) · `close_prep` still `f` · door overloads = 1.
5. ~05:52 runtime restarted → **`/ready` HTTP 200**. Sleeper `871427f0144228` destroyed
   (one sleeper served the whole single-phase window; created and destroyed in-session,
   zero residue).

## 4 · Instrument notes for the next operator

- **A guessed signature is an absence generator**: the post-read probed wrapper 12 at
  `(jsonb)` and printed no row; the by-NAME re-read resolved it at its real
  `(uuid,uuid,text,text,text,jsonb,text)`. The absent row was the probe's fault — law 2
  applied to one's own instrument: disambiguate an absence before reading it as a finding.
- Both sha256 spellings (`convert_to` and `::bytea`) agree on all seven bodies here, but
  the `::bytea` cast dies 22P02 on at least one other body in the namespace — do not treat
  the two spellings as interchangeable in general.
- `0139` was proven windowless by differential (+1 function, +3 relations, 0 replaced/
  dropped/altered) and rode 0140's window at zero extra cost — the combined-window practice.

## 5 · What is now live, and what stays dark

The prepayment limb is live-inert: `document_service_periods` exists (0 rows), wrapper 12
is granted to `clara_wake_interactive` only, the evaluator is registered `deployed=false`,
and `close_prep` remains `enabled=false` (F-A4's G1 INSERT-and-flip follow-up unchanged).
`statutory_deadlines` exists (0 rows) — F-T2 contributes ROWS through its own train.
Nothing serves new behaviour until PR-2b's runtime train and its own ceremony.
