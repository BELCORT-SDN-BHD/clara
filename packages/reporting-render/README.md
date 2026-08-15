# `@clara/reporting-render` — the deterministic report render worker

Wave E lane ζ. Design of record: `docs/plan/active/wave-e-design-reporting-part2.md` §10 (this
worker), §9 (sealed artifacts and custody), §7 (the claim gates). Operations, the drill and the
deploy commands: `docs/ops/DR-render.md`.

A **separate Fly app** (`clara-render`, `sin`) and **not a pnpm workspace member** — excluded in
`pnpm-workspace.yaml` beside `packages/backup`, for the same two reasons: it is a self-contained,
separately-imaged batch app, and adding a workspace importer with no `pnpm-lock.yaml` entry would
fail `pnpm install --frozen-lockfile`, which is every CI job's first step. Its dependencies are
installed **inside its own Docker image**.

## What it does, in order

1. **Claim** one job from `clara.render_jobs` (`for update skip locked`) over a **short-lived DSN
   session** — no pool, no LISTEN client, concurrency 1 in v1.
2. **Read** only what that job pins, through `clara.render_job_payload`, which is lease-scoped: a
   worker with no live lease reads nothing at all.
3. **Assemble** a typesetting source from the resolved layout AST. Every database string is
   emitted as a **string literal**, never as markup, so firm and statutory text cannot become
   typesetting instructions. No number is ever formatted here — cell values arrive as the
   database's own `displayed_text`.
4. **Typeset** with a pinned declarative engine, network disabled, system fonts unavailable, and
   `SOURCE_DATE_EPOCH` derived from the reporting period rather than from a clock.
5. **Extract** the text from the **produced PDF bytes** with a pinned extractor whose exact
   version is read from the binary, and run the **§7 gate-3 claim scan** over that extraction plus
   the uncompressed metadata.
6. **Put** the bytes at their content address (`x-upsert:false`, so overwrite is structurally
   impossible) and **read them back** to prove they are there.
7. **Complete** the job, which seals the `clara.report_artifacts` row through lane ε's own gate.

The order only looks circular until you read §9: the bytes are produced → the extractor reads them
→ the scan runs over that extraction → the extraction's hash and the tool version join the
manifest → the manifest is sealed. The scan runs strictly **before** the seal and its output is an
**input** to it.

## Where the decisions live

Everything that DECIDES is a pure function with no database, no container and no PDF, so it can be
exercised directly with `npm test` — which prints its own case count, and is the number to quote
rather than one written here (a spelled count over an enumerable set has been wrong twice in this
lane already):

| Module | Decides |
|---|---|
| `lib/decisions.mjs` | the render gate (§7 gate 2), the uncertified stamp (§11), the pin check, duplicate completion, bounded retry |
| `lib/lexicon.mjs` | the gate-3 claim scan — including the ruling that **a locale with no effective lexicon row is a refusal, never a pass** |
| `lib/chart.mjs` | the four named axis policies, and the same-source data table asserted **by cell id** |
| `lib/layout.mjs` | the AST walk; an unrecognised node kind refuses rather than being dropped |
| `lib/manifest.mjs` | the environment pins (each mandatory, none defaulted) and the clock-free document metadata |
| `lib/canonical-json.mjs` | the deterministic serialisation everything else derives from |

Those six carry the `@frozen` marker, so `scripts/check-frozen-workflows.mjs` hash-locks them and
their import closure on every PR (design §4.2).

**The five adapters deliberately carry no freeze marker, and each has the same reason:** every one
of them imports something outside this package (`packages/runtime/lib/storage.mjs`) or shells out
to a pinned binary, and the freeze-lint freezes a marked file's *entire relative import closure* —
so marking any of them would hash-lock a runtime-lane file that lane legitimately edits, and the
next storage change would fail this gate for a reason that has nothing to do with rendering.

That includes **`fonts.mjs`, which is the security-sensitive one** and therefore worth stating
rather than leaving to inference: it fetches and hash-verifies typefaces, so a future change there
— a system-font fallback, a relaxed verify — would escape the frozen surface. Its protection is
not the freeze marker but its own battery (ten cases, every refusal exercised) plus the fact that
the *decisions* it feeds (`layout.mjs`'s font-hash validation) are frozen. If the import boundary
ever changes so `fonts.mjs` depends on nothing outside this package, it should be frozen too.

## What it is NOT allowed to do

- **Serve traffic.** No port, no `[http_service]`, no `[[services]]`, no inbound connection.
- **Format a figure.** E-R8 floor ①: every number comes from the database's algebra. A layout that
  asks for a different rounding than the database produced is a refusal, not a re-round.
- **Seal without its pins.** The image **digest** (never a tag) and the source commit are passed at
  machine-create time, and the worker refuses to seal without them — "unknown" and "reproducible"
  must never be indistinguishable inside a sealed artifact.
- **Fall back to a system font**, an ambient clock, an ambient timezone, or a network fetch.

## Running it

```sh
npm run check     # node --check across every module
npm test          # the pure decision battery — no DB, no Docker, no Fly
npm run worker    # the loop; needs DATABASE_URL and the storage/env pins
```

Deploy is **build-only + push, then `fly machine run`** — never a plain `fly deploy`, which would
start a machine and fire a live render. The commands live in exactly one place:
`docs/ops/DR-render.md`.
