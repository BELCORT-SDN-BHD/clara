# As-run — the 0141 apply ceremony (D1 window), 2026-08-28

**Result: live advanced 135/`0140` → 136/`0141_p4_tranche1_invite_rbac`. One migration, atomic,
prestate and tail census OK on live; the window held ~37 seconds of runtime stop
(14:10:24 → 14:10:51 UTC, `/ready` 200 at 14:11:01); every refuse-condition read positively.**
Conducted by the agent under the ceremony run grant; run from merged `main` at `31c1479d`
(P4 tranche-1 merged as #393 at `8d994063`; the two later commits are docs-only), migration
file sha256 `b7d37b085c24cf4f521d49c07684bbf80066c100dde767c44654e7f7886aa334` re-confirmed
at apply time.

## 1 · Why a window

`0141` REPLACES the live `clara.add_member` body (the `_add_member_core` extraction) — the
D1 write-quiesce law binds. Everything else in the file is additive (one table, seven
functions, three `security_barrier` views, two event types).

## 2 · The window's measured basis (the five refuse-conditions, each a positive read)

1. **Full manual-dispatch CI sweep ALL-GREEN** on `main` @ `31c1479d` (run 33175864594;
   lint · build · render-drill · db-estate · db-live-gates · db-split-partition-total ·
   closed-wave-drills · the four D-b frontier legs · the `ci` meta-gate). A ceremony never
   opens on a red sweep.
2. **Backup banked FIRST**: bundle **23,106,784 bytes** →
   `r2:clara-dr/db-snapshots/2026/2026-08-28T13-36-18-360Z/`, `DONE`, migration-head 135
   in the bundle manifest (the scheduled `clara-backup` machine started for one cycle and
   auto-stopped; the DONE line pinned by a start timestamp captured before the start).
3. **Tripwire — live ≡ rig**: a throwaway rig replayed 0001..`0140` (135 applied, 111 s) and
   captured the prosrc sha256 + ACL + owner of `add_member` and the twelve functions `0141`'s
   prestate depends on; the same read on live through the bridge matched **12/12 SHA rows
   byte-identical** (plus the 11 new names absent, both partial-unique invariants present,
   no event-type collision). No hand-patched live body; the superseded-body class had
   nothing to erase. *(The raw diff showed 4 lines — the `NEWFN_ABSENT` rows in a different
   ORDER: `order by 1` on text sorts `_` differently under the container's and the pooler's
   collations. Sorted-set compare: identical 27/27. Recorded so the next operator sorts
   before diffing.)*
4. **In-flight census zero with positive controls**: `agent_tasks` in-flight 0 (of 232) ·
   `document_processing_tasks` open 0 (of 435) · `document_intakes` in-flight 0 (of 159) ·
   both `wake_engine_sources` rows `enabled=false`.
5. **TLS live leg both polarities** (`docs/ops/dsn-bridge.md` review item): pinned CA
   `Verification: OK` / `Verified peername: *.pooler.supabase.com` / exit 0; default trust
   store `verify error:num=19` / exit 1. `/ready` positive control 200 before the window.

## 3 · The window as run (UTC)

1. 14:10:24 `fly machine stop 48ee715b763048 -a clara-runtime` — stopped clean.
2. Quiesce through the bridge: 12 idle `clara_runtime_login` sessions reaped, then the
   **positive read `NON_IDLE_AFTER|0`** across the five runtime-family login roles.
3. 14:10:35 **Apply** via the sleeper bridge (`fly machine exec <sleeper> "printenv
   DATABASE_URL" | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/migrate.mjs`,
   env-to-env, `verify-full`, pinned CA): `p4t1 prestate: OK` (11 new names clear, 12
   depended-upon functions resolve, both invariants present, `add_member` prosrc/ACL/owner
   stashed, both wall strings present) → `p4t1 tail: OK` (`firm_invites` forced RLS
   owner-only · the five human entrances reach `clara_authenticated` only, three cores +
   `_jwt_email` ungranted everywhere · `add_member`'s ACL byte-unchanged across a
   genuinely-changed body · the three views closed-world column census · both event types
   registered · `uq_membership_active_user` / `uq_firms_one_operator` / `create_firm`
   byte-untouched · ROUND 2 pins: all three views `security_barrier`, F4's wall-before-dedupe
   and F3's `lower()` pinned by position on comment-stripped code, the actor+display-name
   bound dedupe hash, the concurrent unique_violation → typed CLR10). `migrate: 1 new
   migration(s) applied · 136 total`.
4. 14:10:51 runtime restarted → **`/ready` HTTP 200** at 14:11:01. Sleeper `857162a4e79568`
   destroyed at close.
5. **Post-reads** (a second sleeper `48e1403c432338`, windowless, destroyed after): frontier
   `0141` / 136 · `claim_identity` / `invite_member` / `accept_invite` / `revoke_invite`
   grantees = `clara_authenticated, clara_fn_owner` exactly · `_add_member_core` /
   `_claim_identity_core` / `_jwt_email` owner-only · all three views
   `security_barrier=true`, ACL `clara_authenticated=r` · `firm_invites` rls+forced, relacl
   NULL, one owner policy (`p_firm_invites_owner`, ALL) · `add_member` delegates to the core,
   ACL byte-identical to the tripwire's pre row, prosrc sha `60e0e9fb…` → `8265d699…` ·
   the N2 subject on live: `accept_invite` wall at position 845 < `_reserve_op` at 953 on
   comment-stripped code · `invite.issued` / `invite.revoked` present · wake allowlist 87
   rows (no wake door added — the tail asserts zero wake reach; no pre-window baseline of
   this count was captured, reported not asserted) · frozen schemas reported: `graphile_worker`
   20 relations, `workflow` 23 (constraint 15; untouched by the file's own tail assertion).

## 4 · Instrument notes for the next operator

- **The first window launch aborted BEFORE touching the runtime** on its own sleeper gate:
  `fly machine status` prints TWO lines matching `State` (`State: started` and a table row),
  so `grep 'State' | awk '{print $NF}'` yielded `started\nstarted` ≠ `started`. Fixed to
  `grep -m1 '^State:' | awk '{print $2}'`, positive-controlled on both machines, relaunched.
  A gate that aborts fail-closed on its own parse bug is the right failure; recorded so it
  is not repeated.
- **The post-reads file died at statement 28** (`polcmd` is `"char"`; `text || "char"` is
  ambiguous) under `ON_ERROR_STOP`, so the first post-read pass was partial; the fixed file
  (`polcmd::text`) re-ran windowless on a fresh sleeper — the reads above are the complete
  set. A read instrument's own type error is not a finding about live.
- The window sleeper was created at 13:38 for the pre-reads and reused for the window
  (single-phase, same purpose); the post-read re-run used a fresh one. Both destroyed, zero
  residue (`fly machine list -a clara-backup` shows only the scheduled machine).
- Scripts lived in the session scratchpad only; nothing tracked; no DSN printed, logged or
  persisted; no pinned id touched (canary `daba7f2e`, witness `d023b48c`).

## 5 · What is now live

The P4 identity/invite doors are callable by any `clara_authenticated` session (their UI is
P4's frontend tranche); `add_member`'s callers behave as before (ACL and wall strings
preserved, proven by the tail). Next: P4 DB tranche-2 (asks 2 · 7 · 8 + 裁-11's
`counterparty_aliases` grant + policy), dispatched at this window's close.
