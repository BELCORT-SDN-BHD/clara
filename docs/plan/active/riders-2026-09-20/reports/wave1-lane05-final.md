# Wave 1 · Lane 05 — final report

**Branch** `riders/w1-lane05` in `C:\Users\zhant\Desktop\clara-wt\655`, cut from `origin/main`
`dd3f8f1d`. Database `clara_l05` @ 127.0.0.1:55745 (unused for a real migration chain — no
from-scratch chain run; #957's tests each spin their own disposable database + synthetic
migrations directory). Playwright triple `https://127.0.0.1:3540` / `3541` / `3542` (unused — no
`apps/web` browser-walk work in this lane). Tooling lane: six tickets, six commits, `git status`
clean at hand-off, no push, no PR, no GitHub write, no other worktree touched.

```
a4db0de2 fix(web): #969 ui:add guard drops the bogus cn dependency the pinned CLI adds
247dfc89 fix(lint): #994 NO_RAW_COLOR_VALUES message names the ticket-reference case
e488a57b fix(scripts): #959 maskComments no longer swallows the rest of the input on an unterminated quote/dollar tag
0d906477 feat(db): #957 guarded migration redo mode
10b603a4 fix(ops): #917 dsn-pipe.mjs --child-os wsl CA respelling
f01b4d34 feat(scripts): #849 --print-closure reverse index and --retire command
```

Order built: #849, #917, #957, #959, #994, #969 — the lane's own listed order. All six were
verified still live and unaddressed on `main` before building (each ticket's newest triaged Agent
Brief was read via `gh issue view <n> --comments`; none carried a 2026-09-20 owner-ruling comment,
so the newest triage comment is what was built against). None was already satisfied — each
described gap was independently reproduced against the current tree before any fix landed (see
each ticket's own "measured" evidence below).

---

## #849 — `--print-closure`: add a reverse index and a `--retire` command — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| `--print-closure <module>` filters to entries whose closure includes that module | `formatClosureReport(closure, moduleFilter)` in `scripts/freeze-lint-closure.mjs`. CLI-level smoke test: `node scripts/check-frozen-workflows.mjs --print-closure packages/runtime/lib/work-trace.mjs` prints exactly the 6 entries #815's own selftest independently attributes to that module (`claraWork.v3/v4/v5` × `.ts`/`.impl.ts`), none of the other 306. |
| `--retire <path> --ruling <ref>` moves the entry, keeping its last hash, citing the ruling; a subsequent verify reports no `RETIRED-*` violation | New pure module `scripts/freeze-lint-retire.mjs` (`retireFrozenEntry`), wired into the CLI. Selftest case `#849 retireFrozenEntry's output leaves a subsequent verify (compareFrozenManifestText) clean` feeds its output through the real `compareFrozenManifestText` and asserts zero violations. |
| `--retire` refuses, no manifest write, when the file is still present or has no current entry | Two selftest cases plus a live CLI check: `node scripts/check-frozen-workflows.mjs --retire packages/runtime/workflows/does-not-exist-in-manifest.ts --ruling "#1"` → exit 1, `git status --porcelain frozen-workflows.json` empty. |
| A cell covers each of the three behaviours | `scripts/check-frozen-workflows.selftest.mjs`, new "#849" section, **8 cases**: targeted-filter (2, incl. a real-tree canary against #815's own attribution), retire success, retire-leaves-verify-clean, refuse-file-present, refuse-no-entry, refuse-no-ruling (covers both empty-string and `undefined`). |

**Gates for this ticket:** `node scripts/check-frozen-workflows.selftest.mjs` — **all cases pass**
(full file, including the 8 new #849 cells and every pre-existing #810/#815/enqueue-provenance
cell, unaffected). `node scripts/check-frozen-workflows.registration.selftest.mjs` — unaffected,
green. Manual CLI checks: `--print-closure <module>` against the real tree; `--retire` refused
under `CI=1`; `--retire` refused for a path absent from the manifest, `git status` confirming no
write; the ordinary (unfiltered) `node scripts/check-frozen-workflows.mjs` verify still reports
**OK — 312 frozen file(s) … 3 retired entr(ies)**, unchanged.

**Deliberately left:** the four hand-written `note` prose lines the ticket names as "related,
optional" — replacing them with computed text is explicitly out of scope in the ticket's own body.

**Docs:** `packages/runtime/README.md`'s `#815`/`#810` sections gained the targeted
`--print-closure` example and the `--retire` command with its refusal conditions.

---

## #917 — `dsn-pipe.mjs` pins the CA with a Windows path a WSL child cannot open — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| `<dsn> \| node scripts/ops/dsn-pipe.mjs --child-os wsl -- wsl -u root -- bash -c '…'` succeeds from Git Bash, no wrapper | **Verified LIVE against this rig's real `wsl.exe`** (not part of the CI battery — a live WSL dependency does not belong in a gate every PR runs): `echo "$DSN" \| node scripts/ops/dsn-pipe.mjs --child-os wsl -- wsl -u root -- bash -c 'echo host=$PGHOST db=$PGDATABASE cert=$PGSSLROOTCERT; test -f "$PGSSLROOTCERT" && echo CERT_OK'` → `host=127.0.0.1 db=d cert=/mnt/c/Users/zhant/Desktop/clara-wt/655/ops/tls/pooler-ca.crt` then `CERT_OK`, exit 0. |
| The Windows-side fingerprint refusal for a swapped CA still fires under `--child-os wsl` | Live: a `mintCert`-swapped committed CA under `--child-os wsl` → exit 1, `MUST-NOT-RUN` never printed. Also a committed selftest case doing the same via the symlinked-copy fixture pattern. |
| Unit cell: a Windows CA path + `--child-os wsl` → the DSN's `sslrootcert` carries `/mnt/c/…`, nothing else about the DSN changes | `toWslPath` (pure) + the `(#917 AC3)` selftest cell: `withVerifyFull` before/after respelling, `sslrootcert` deleted from both, remaining URLs compared equal. |
| `packages/db/README.md`'s backup paragraph and both release runbooks' step-3f invocation updated | `packages/db/README.md`'s "Backup and recovery" section; `RELEASE-RUNBOOK-0199-0224.md`'s pre-flight bullet and `RELEASE-RUNBOOK-0225-0233.md`'s step 3f, each with an "Update (#917)" note showing the new invocation for the NEXT ceremony — each ceremony's own already-run RESULTS record is left untouched as history. |

**Beyond the stated AC, actually implemented and measured on this real rig** (the lane brief's own
recipe, incorporated because it is what makes the WSL child actually SEE the values, not merely
have them assigned in `dsn-pipe.mjs`'s own env): `WSLENV` is set to the six PG identity vars plus
the two CA vars (never `DATABASE_URL`) — **measured empirically on this host** that a Windows env
var invisible to a `wsl.exe` child unless named in `WSLENV` (`echo $VAR` inside WSL returned empty
without it, and returned the value once added), and that Git Bash's own MSYS layer mangles a
POSIX-looking env value when a *shell* (not Node) execs a native child directly — irrelevant here
because `dsn-pipe.mjs`'s own `spawn()` call goes straight from Node to `wsl.exe`, never through
that layer (confirmed by the live run above returning the correct, unmangled path).

**Gates:** `node scripts/ops/dsn-pipe.selftest.mjs` — **all cases pass** (new "(#917)" section,
**11 cases**: `toWslPath`'s respelling + POSIX no-op, `resolveChildOs`'s three cases, `splitArgv`
accepting/reporting/refusing `--child-os`, the AC3 unit cell, `buildChildEnv` carrying the
respelled path into both CA vars, a hermetic through-the-CLI cell using a plain `node` stand-in
for `wsl` so it runs on Linux CI too, and the AC2 swapped-CA refusal). `dsn-pipe.ca.selftest.mjs`
and `dsn-pipe.pgpath.selftest.mjs` — unaffected, green.

**Deliberately left:** any child OS other than WSL (the ticket's own out-of-scope); the committed
CA file or its pinned fingerprint (untouched).

---

## #957 — Migration runner has no supported redo for one edited, unmerged migration — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| Redoing the highest applied version after an edit succeeds; an immediately following normal run reports nothing pending, no drift | `migrate-redo.test.mjs`'s `AC1` cell: applies 2 synthetic migrations, edits the highest (a `create or replace function`, chosen because redo re-runs the WHOLE file and a bare `create table` would collide with itself — documented in the fix's own README paragraph), `migrate({redo})` → `{redone, checksum}`, the function's new return value proven (`select clara.redo_ac1_fn()` → `2`, was `1`), then a plain `migrate()` → `{applied: 0, total: 2}`, no throw. |
| Redo refuses when the destructive guard is not satisfied; changes nothing | `AC2` cell: guard unset → rejects matching `/destructive\|CLARA_ALLOW_DESTRUCTIVE/i`; ledger read byte-for-byte identical before/after. |
| Redo refuses a version that is not the highest applied version; changes nothing | `AC3` cell: 3 applied migrations, `redo` on the middle one → rejects `/not the highest applied version/`; ledger unchanged. |
| A redo that fails mid-apply leaves the ledger row intact or absent (never undescribable), names the version | `AC4` cell, tightened to prove the body actually ran (not merely the pre-flight drift check): a `create or replace function` edited to reference a missing relation → rejects naming `0001_only` AND the real Postgres error (`does_not_exist_at_all`), explicitly asserting the rejection is **not** the ordinary drift message; the ORIGINAL row is still there, byte-identical; a subsequent normal `migrate()` then describes the resulting state with the pre-existing, well-known drift message. |
| Ordinary apply path still aborts on checksum drift with its existing message; a test covers no regression | `AC5` cell: no `redo` option at all, edits an applied file, asserts the exact pre-existing message string. |

**Additional cells beyond the five AC bullets:** redo target never applied at all (`/not currently
applied/`); redo target naming a version with no file on disk at all, proven via a `clientFactory`
that throws if ever called — the refusal fires before any connection opens.

**Gates:** `packages/db/tests/migrate-redo.test.mjs` (new, **7 cases**, each its own disposable
database via `migrate-harness.mjs`'s `disposableDatabaseName`/`connectionConfig`/`withDatabaseEnv`
+ a synthetic migrations dir) — run through the
full `$GATES` chain (every `--import ./tests/*-preintegration-gate.mjs` flag from
`packages/db/package.json`'s own `test` script) — **7/7 pass**. Full existing
`migrate-runner-unit.test.mjs` (43), `migrate-session-reset.test.mjs`, `migrate-cleanup-unit.test.mjs`,
`migrate-guc-reset-witness.test.mjs`, `migrate-transform-default-pin.test.mjs`,
`migrate-post-body-timeout.test.mjs`, `migrate-harness-clone-guard.test.mjs`,
`migrate-lock-serialization.test.mjs`, `migrate-evaluator-freeze.test.mjs` re-run **green, 0 fail**.
`packages/db` rule-8 extras: `operation-census.test.mjs` **10/10 pass**; `rig-isolation.test.mjs`
**20 pass, 1 skip** (T19, correctly gated on `CLARA_RIG_ALLOW_RESET`, unset — never run with the
reset flags, per RIG.md).

**Deliberately left:** down migrations / rolling back arbitrary or already-merged migrations
(explicit out-of-scope); any change to the immutability rule for merged migrations; no new
migration file (runner work only) — all per the ticket's own "Out of scope" section.

**Docs:** `packages/db/README.md`'s "Migration and deployment behavior" section gained a "Redo
(#957)" paragraph, including the idempotent-DDL caveat this ticket's own test round surfaced.

---

## #959 — `wiki-lint-checks.mjs`'s `maskComments` desynchronises on an unbalanced token — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| An apostrophe inside a `--` comment: every later comment still masked | `[#959 control]` cell — **passes unchanged, before and after the fix**: measured that a `--` comment blanks blindly to end-of-line without ever invoking the quote-skip helper, so this specific shape was never actually broken; kept as a documented positive control per the ticket's own "worth a selftest case" framing. |
| An unterminated dollar-quote tag: later comments still masked, or reported unparseable — behaviour stated | **Chosen: bounded, stated in `skipQuoted`'s own doc comment** (every caller depends on a same-length string, never an exception). `[#959]` cell: genuinely red before the fix (comment swallowed), green after. |
| Regression: an assertion-only `do` block whose preceding comment names `pg_get_functiondef` is not classified as a change-of-record patch | Reproduced through the REAL production entry point, `parseCoRPatches` — not a re-implementation: an earlier, unrelated, deliberately unterminated quote in a `do` block, followed by a LEGITIMATE `select count(*) into v_n from … pg_get_functiondef(…) …` census read. **Before the fix:** `censusOnly: [false]`, `censusReads: []` (the real read misclassified as unattributable). **After:** `censusOnly: [true]`, `censusReads: [{variable:"v_n"}]` — confirmed by literally stashing the source fix and re-running. |
| Inverse: a genuine dynamic-SQL patch still flagged when an earlier comment contains a benign-sounding, apostrophe-bearing token | `[#959 inverse]` cell: a real `execute 'select * from clara.wiki_pages'` preceded by such a comment → `scanSources` still reports exactly 1 finding naming `wiki_pages`. |
| Running the wiki lint over every migration file yields the same verdicts as before | `node scripts/check-wiki-dynamic-sql.mjs` over the real `packages/db/migrations/` tree: **identical** before and after (stashed the fix, re-ran) — `1410` function definitions, `212` change-of-record patches, same 13 named waivers, `OK`. No verdict moved. |

**Gates:** `node scripts/check-wiki-dynamic-sql.selftest.mjs` — **all cases pass** (new "#959"
section, **5 cases**, 3 genuinely red-before/green-after — confirmed by stashing the source
change and re-running — plus the 2 controls above); the file's full pre-existing battery
(persisted-function, fail-closed-dynamic-SQL, CoR-patch, whole-tree-invariant sections) unaffected.

**Deliberately left:** weakening or relaxing the fail-closed dynamic-SQL classification (explicit
out-of-scope); editing any applied migration or rewording a migration comment to work around the
masker (the whole point of the fix is that this is no longer necessary).

**Docs:** none — this is an internal script with no dedicated module README; the contract choice
is documented in `skipQuoted`'s own doc comment (the file's own convention for this kind of
decision, matching e.g. the RATCHET R2/R4 notes already there).

---

## #994 — Raw-hex-colour lint message doesn't explain the ticket-reference false case — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| The message names the ticket-reference case and states the recommended fix | New sentence appended to `NO_RAW_COLOR_VALUES.message` in `eslint.config.mjs`: names `#658` as an example, states any `#` + 3/4/6/8 hex-looking chars trips the selector, and says to REWORD the string, never weaken the rule. |
| The selector is unchanged: no real colour literal banned today becomes allowed, no non-colour token allowed today becomes banned | Selector string untouched (only `message` edited — the diff shows exactly one string literal changed). Empirically proven, not merely asserted: a new selftest runs the REAL extracted rule object through ESLint's own `Linter` and confirms `#fff`/`#ffffff`/`#ffffffff`/`rgba()`/`hsl()`/`oklch()`/a `bg-[#abc123]` template are still banned, `"ticket 658"`/`"bg-card"`/`"text-foreground"`/a `"#" + var` concatenation are still allowed, and a bare `"#658"` literal still fires (proving the fix is the message, not a selector carve-out). |
| `pnpm lint` at the repo root still exits 0 | Run twice, full root `pnpm lint` (root gates + `apps/web` + `packages/reporting-render`): **exit 0** both times, including the new selftest wired into the chain. |

**Gates:** new `scripts/eslint-config.selftest.mjs`, wired into root `package.json`'s `lint` script
(alongside every other config-adjacent selftest already in that chain) — **6 cases**, 2 genuinely
red-before/green-after (confirmed by running before editing the message), 1 control (the ruling
citation and token-map guidance survive), 3-case selector-regression battery (still-banned /
still-allowed / still-fires-on-a-bare-ticket-number). Full `pnpm lint` re-run green at the repo
root twice (once before wiring the selftest into `package.json`, once after, to prove the wiring
itself doesn't regress anything).

**Deliberately left:** changing which literals the rule flags, or adding a carve-out for
ticket-number-shaped strings (explicit out-of-scope); no existing ticket-number string literal
elsewhere in the codebase was touched.

**Docs:** none beyond the message itself — the ticket's own AC scope the fix to the rule's message.

---

## #969 — The pinned shadcn CLI adds a bogus `cn` dependency on every resolved item — **DONE**

| Acceptance criterion | Evidence |
|---|---|
| An install whose resolution names `cn` leaves no `cn` entry anywhere, no manual revert | **Verified LIVE, end to end, reverted afterward:** `pnpm ui:add avatar` (through the fixed guard) had the pinned CLI install `cn 0.3.0` for real (its own output: `dependencies: - cn 0.3.0`), then the guard's own cleanup ran `pnpm remove cn`; `grep '"cn"' apps/web/package.json pnpm-lock.yaml` afterward: **no matches**; `apps/web/node_modules/cn`: **does not exist**. `avatar.tsx` and the lockfile's own unrelated minor peer-resolution churn from the add-then-remove (a `debug` variant gaining/losing a `supports-color` peer annotation — a normal pnpm graph-resolution artifact, not a `cn` residue) were reverted afterward, since shipping a real new component is outside this fix's own scope; `git status` clean before and after. |
| The guard reports what it did about `cn` | Same live run's own stdout: `[ui-add] dropped 1 bogus local dependency stand-in(s) the pinned CLI added: cn — … No manual revert needed. Set CLARA_UI_ADD_OVERWRITE=1 to take the real npm package instead.` |
| A dry run names the dependencies the item would add, including the one classified as local | Live: `node scripts/ui-add.mjs avatar --dry-run` → `[ui-add] dependencies avatar would add: cn (local — this repo's own, see lib/utils.ts; never installed as a real npm package).`, alongside the pinned CLI's own dry-run output separately confirming `Dependencies (1): + cn`. |
| Protected-file refusal, the override knob, and installs of items that do not touch `cn` behave exactly as today, selftest green | Every pre-existing cell in `check-ui-add-guard.selftest.mjs` (protected-file refusal ×3 flag/TTY variants, override, non-protected pass-through, the `button.tsx` byte-identity control) re-runs **unchanged and green**. New `[AC4]` cell proves a protected payload that ALSO resolves `cn` is refused on the protected file FIRST — dependencies are never even resolved. |

**Design note, worth recording:** the pinned CLI's own file-WRITE step already correctly rewrites
a registry item's placeholder `import { cn } from "cn"` to this project's real `@/lib/utils` alias
(verified: `avatar.tsx` as written imports from `@/lib/utils`, matching every other installed
component) — only the CLI's separate dependency-INSTALL step is naive. This is why stripping the
package dependency after the fact is safe: the file it "belongs to" was never actually wired to it.

**Gates:** `apps/web/scripts/check-ui-add-guard.selftest.mjs` — **all 25 cases pass** (17
pre-existing + 8 new "#969" cases: `classifyDependencies`'s split and empty-list case, the full
report+strip flow, the `--dry-run` report with no strip call, the override keeping `cn` with no
strip call, a non-`cn` item behaving identically to before, the protected-file short-circuit, and
a failed-strip surfacing loudly). Confirmed genuinely red before the fix (import failure — the new
exports did not exist yet) by stashing `ui-add.mjs` and re-running.

**Deliberately left:** any other resolved-dependency problem in the pinned CLI beyond `cn`
(explicit out-of-scope); finishing the AC2 shadcn native-chat component migration (a separate,
named-out item).

**Docs:** `apps/web/components/ui/README.md` gained "The `cn` dependency stand-in (#969)" plus the
live-rehearsal evidence in its own "Proof" section.

---

## Gates run for this lane, with counts

- **Every test file added or touched**, run standalone and green (counts above, per ticket):
  `scripts/check-frozen-workflows.selftest.mjs` (+8 cases), `scripts/ops/dsn-pipe.selftest.mjs`
  (+11), `packages/db/tests/migrate-redo.test.mjs` (new, 7), `scripts/check-wiki-dynamic-sql.selftest.mjs`
  (+5), `scripts/eslint-config.selftest.mjs` (new, 6), `apps/web/scripts/check-ui-add-guard.selftest.mjs`
  (+8, 25 total).
- **`pnpm typecheck`** (worktree root): **green**, exit 0.
- **`pnpm lint`** (worktree root): **green**, exit 0 — run three times across the session (twice
  while landing #994, once as the final comprehensive pass after all six tickets); the final pass
  includes every one of this lane's own new/changed selftests in the chain
  (`check-frozen-workflows*`, `check-wiki-dynamic-sql*`, `dsn-pipe.*.selftest.mjs`,
  `eslint-config.selftest.mjs`) plus `apps/web`'s own lint (which runs `check-ui-add-guard.selftest.mjs`)
  and `packages/reporting-render`'s lint.
- **`apps/web` touched → whole unit suite**: `node scripts/run-tests.mjs` from `apps/web` —
  **4633 tests · 135 suites · 4631 pass · 0 fail · 2 skipped**, `EXIT:0`. The 2 skips are the
  pre-existing, unrelated live-Supabase-auth-provider cells (gated on
  `CLARA_LIVE_SUPABASE_AUTH_URL`/`…ANON_KEY`, unset); RIG.md's named
  `thread-live-clarify.test.tsx` whole-suite load flake did not manifest this run (0 fail overall).
- **No browser walk touched** in this lane (no e2e spec edited) — none run.
- **`packages/db/tests` touched → full gate chain + rule-8 extras**: covered under #957 above
  (`operation-census.test.mjs` 10/10, `rig-isolation.test.mjs` 20 pass/1 correctly-skipped, never
  with the reset flags).
- **`packages/runtime` not touched** in this lane — `check-frozen-workflows.mjs`/`check-parts-parity.mjs`
  not required by rule 8 for that reason (the former was still run anyway as part of #849's own
  gate and the full `pnpm lint` pass, and stayed green throughout).

## Docs updated (same commits as the code)

`packages/runtime/README.md` (#849), `packages/db/README.md` (#917, #957), both release runbooks
`RELEASE-RUNBOOK-0199-0224.md`/`RELEASE-RUNBOOK-0225-0233.md` (#917), `apps/web/components/ui/README.md`
(#969). No `CONTEXT.md` entry: none of the six tickets introduced accounting/product vocabulary —
all six are internal tooling (a CLI flag, a masker's contract, an ESLint message, a dependency
classifier).

## Successor contracts

None. No ticket in this lane touched a frozen workflow, a frozen closure, `docs/PRD.md`,
`docs/ARCHITECTURE.md`, or an applied migration; `node scripts/check-frozen-workflows.mjs` reports
the identical `312 frozen file(s) … 3 retired entr(ies)` before and after this lane's six commits.

## Follow-ups worth filing

None new. #917's own WSLENV mechanism (the lane brief's "recipe that worked") is now fully
implemented, not merely documented as a workaround — no follow-up needed there. #969's live
rehearsal surfaced a benign pnpm lockfile peer-dependency resolution artifact (a `debug` variant
gaining/losing an inert `supports-color` peer annotation) from the add-then-remove cycle; this is
expected pnpm graph-resolution behaviour, not a defect, and was reverted along with the rehearsal's
other throwaway changes — not worth a ticket.

## Unverified

- **Whether another lane's concurrent work touches `eslint.config.mjs`, `package.json`'s `lint`
  script, `packages/db/README.md`, or `packages/runtime/README.md`** in a way that conflicts with
  this lane's own edits to those shared-ish (though not rule-7-listed) files — not checked against
  other lanes' branches, since this lane never reads or merges another lane's work per the work
  order.
- **The real `resolveRegistryItems(["message"\|"bubble"\|"marker"])` payloads** (only `avatar` was
  actually resolved live, per the ticket's own "message/bubble/marker/avatar family" phrasing) —
  `avatar`'s resolution was measured directly and is what the live rehearsal and one fixture
  (`AVATAR_DEPS = {dependencies: ["cn"]}`) are built from; the other three names in that family
  were not independently queried against the live registry this session, though `#969`'s own fix
  (`classifyDependencies`/`LOCAL_DEPENDENCY_NAMES`) is generic over any registry item naming `cn`,
  not specific to `avatar`.
