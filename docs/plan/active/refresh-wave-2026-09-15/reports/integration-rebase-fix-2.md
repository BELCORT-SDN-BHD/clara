# Wave 2026-09-15 — integration fix round 2: the `db-live-gates` interview-e2e OOM

Branch `integration/wave-2026-09-15`, worktree `C:\Users\zhant\Desktop\clara-wt\int`, was at
`7c75455c`; **one commit, `79ec5e63`, four files, +472 / −0** (two new files under
`packages/runtime/tests/`). Nothing pushed. **No workflow body, no frozen file, no migration, no
product code** — the whole change is test-side. `frozen-workflows.json` is byte-identical after a
`--update`. Everything below was measured on **rigrt `127.0.0.1:55623` / `clara_wave_b_ci`**.

---

## 1 · Cause

**The leg was not looping and nothing leaks. It was V8 declining to collect.**

`tests/interview-e2e.mjs` imports `.output/server/index.mjs`, so the WDK engine replays workflows
inside the same process that asserts on them. The WDK re-evaluates the **whole workflow bundle
against a fresh vm context once per durable step**. That is its own stated design, in
`@workflow/core/dist/vm/script-cache.js`:

> Replaying a workflow re-evaluates the workflow bundle against a fresh VM context on every
> iteration of the inline replay loop … The bundle is a single string that contains every workflow
> function in the app.

The cache added there is over the compiled `vm.Script` only; the **evaluation**, which is what
allocates, is paid every time. This image's bundle is
`packages/runtime/node_modules/.nitro/workflow/workflows.mjs` — **7,703,687 bytes**, all 53
registered bodies (boot banner `bodies=53`) — and its module top level rebuilds every tool schema,
every prompt table and four `sha256Hex(canonicalJson(CLARA_WORK_BUNDLE_Vn))` digests before the
first step runs.

| Measured on the rig | Value |
|---|---|
| Durable steps in one full client drive | 91–92 (`count(*) from workflow.workflow_steps`) |
| Steady live set, forced collection every 3 s | 119 MB, flat across all four scenarios |
| Live footprint of one evaluation in flight | 309–533 MB |
| Churn while a run is driving | ~60–70 MB/s, all of it collectable |
| CPU in the bundle's own module scope (`--cpu-prof`) | 32.4 % of samples |

So the heap grows only because, under the default ~4 GB old-space ceiling, V8 has no reason to
collect 60 MB/s of garbage until the ceiling — and then a bundle evaluation needing a few hundred
MB of headroom has nowhere to put it. That is exactly how run 35225394786 died:
`Mark-Compact 4016.5 (4132.6) -> 4004.7 (4138.4) MB`, twice, ~12 MB recovered each time, exit 134
at 77 s, **inside `p649.interview.sst_park_closed`** (the positive PASS is logged at 13:17:40, the
abort at 13:18:14).

Reproduced locally on the pre-fix tip: peak **3.3 GB**, passing by a hair at
`--max-old-space-size=4096`; at `--max-old-space-size=768` it dies the same way, in the same
scenario, with its last Mark-Compact recovering 2.6 MB. At `--max-old-space-size=2048` **with** a
forced collection every 3 s it holds a flat 119 MB and passes.

### Ruled out, each with evidence

- **The reconcile `EACCES mkdir '/data'` lines.** An idle boot probe — world up, no HTTP traffic —
  held a flat 105 MB for 60 s.
- **`/api/interview/state` polling.** Instrumented: **75 calls in the whole leg**, mean body
  2.5 KB. Scenario (a) allocated ~400 MB against fewer than 25 calls.
- **`c681b58e`'s R1 precedence fold** (`knownFactsFromPack`). `clara.client_facts` is **empty** on
  this database (`count = 0`), so no legacy row can outrank anything, and both of its loops are
  bounded by `KNOWN_FACT_KEYS` × `records`.
- **A runaway body.** The runs reach `interview_complete`; step counts are 91/92, not unbounded.

### What the cut actually contributed

`clientOnboarding_v5` adds **six steps** to a drive — `loadKnownFactsStep` plus the `fye_day`
segment — about **2 %**, on top of a shared bundle the wave grew with its new bodies. Enough to
cross a ceiling the leg was already sitting under; not the cost itself. No change to a v5 body or
to `interview.v4.*` would have fixed this: v4 pays the same per-step price.

---

## 2 · Fix

**`packages/runtime/tests/heap-bound.mjs` (new, 148 lines).** A best-effort heap ceiling for a
standalone e2e that boots the world in-process: forces a full collection through an in-process
`node:inspector` session whenever `heapUsed` passes **512 MB**, checked each second.

- `HeapProfiler.collectGarbage` rather than `global.gc`, because the CI step runs a bare
  `node tests/interview-e2e.mjs` and a fix behind `--expose-gc` is not a fix. Verified to work with
  no flag and no port (51 MB → 4 MB on a throwaway heap).
- **Unref'd.** A ref'd interval in a harness that exits explicitly would trade an OOM for a CI hang.
- **Best-effort.** A collector that cannot connect, a `collect` that throws and a `memoryUsage()`
  that throws are each survived and counted. A diagnostic aid must not fail a green run.
- **A ceiling, not a metronome.** Below the threshold it does nothing, so a quiet process never pays
  for a full GC it does not need.

**`packages/runtime/tests/interview-e2e.mjs`** arms it after `waitHealthy()` and prints
`peak / ticks / collections / refusals` before the final PASS, so a future OOM is read against a
number rather than a guess.

---

## 3 · Red cell

**`packages/runtime/tests/heap-bound.test.mjs` (new, 7 cells)** over a fake heap and a hand-cranked
timer — no real timers, no real GC. **Red first:** the file failed whole (`ERR_MODULE_NOT_FOUND`)
before `heap-bound.mjs` existed; then 6/7, with the runaway cell red because its assertion assumed
a collection per tick rather than the sawtooth the mechanism actually produces; **7/7** once the
assertion matched the guarantee (peak ≤ threshold + one tick's growth).

**`packages/runtime/tests/client-onboarding-v5.test.mjs`** gains three `v5.bounded:` cells guarding
the other half — the **inventory's park budget**, because in the leg that drives it every park is
~5 durable steps of real heap:

1. a full scripted walk terminates in **exactly 37 parks**, answering 16 segments;
2. the H-52 walk is **exactly one park shorter** and never parks on `sst_no`;
3. two register-supplied facts shorten the walk by **exactly 4 parks** and never lengthen it.

Each carries a hard 120-park cap, so a runaway inventory fails as a **budget** rather than as a hang.

---

## 4 · Counts

| Gate | Result |
|---|---|
| `interview-e2e.mjs`, no flag (CI's own shape) | **ALL PASS** — peak 622 MB, 85 ticks, 14 collections, 0 refusals (was 3.3 GB) |
| `interview-e2e.mjs --max-old-space-size=4096` | **ALL PASS** — peak 660 MB, 100 ticks, 18 collections, 0 refusals |
| `interview-kill-resume-e2e.mjs` | **PASS** |
| `chat-turn-v20-e2e.mjs` | **PASS (4 legs)** |
| Unit batteries (v5 25, heap-bound 7, clara-work-v4, chat-turn-v20-tools, built-bundle-gate, coa-interview-v4) | **91 pass / 0 fail** |
| `check-parts-parity.mjs` | OK, exit 0 |
| `check-frozen-workflows.mjs --update` | re-baselined 296 files; `frozen-workflows.json` **byte-identical** (absent from `git status`) |
| `check-frozen-workflows.mjs --compare-base origin/main` | OK — 278 entries retain hash + deployed flag, **18 additions, 3 recorded retirements, additions only** |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |

No rebuild was needed: `RUNTIME_SOURCE_ROOTS` is `workflows, lib, src, plugins, nitro.config.ts,
package.json` — `tests/` is not watched — and `built-bundle-gate.test.mjs` passes against the
session's build.

---

## 5 · Residuals, named not fixed

- **The four eager bundle digests.** `sha256Hex(canonicalJson(CLARA_WORK_BUNDLE_Vn))` runs once per
  bundle evaluation for values that never change — **8.5 % of this leg's entire CPU** in a
  `--cpu-prof`, the single largest identifiable item inside the bundle's module scope. Three of the
  four modules are frozen and deployed, and memory-wise the four are ~0.1 % of an evaluation, so
  this is a CPU residual rather than a fix for this red. Worth a lazy memo the next time
  `claraWork.v*.bundle.ts` opens for a successor.
- **Every standalone World e2e pays the same churn.** Only interview-e2e is red today, so only it is
  bounded. If another leg OOMs, `startHeapBound()` is one import.
- **The underlying cost is the WDK's**, not ours: a deployed runtime serves one step per invocation
  and never stacks 92 evaluations in one heap. Nothing here is a product memory defect.
