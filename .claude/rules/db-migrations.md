---
paths: ["packages/db/**"]
description: How to author a migration here — the conventions and the standing laws that bind them.
---

# Writing a migration

**Numbers are claimed at MERGE time, not at authoring.** Pick the number when the PR is ready
to land: the repo frontier moves under you while you build, and two branches that both claimed
early will collide. This is also why the README's migration ledger is a snapshot rather than an
authority — `select count(*), max(version) from clara.schema_migrations` is the authority for
live, and `ls packages/db/migrations/` for the repo.

**Rig-validate on a throwaway before anything live.** Baseline a scratch Postgres from `0001`,
apply your file, then apply it again against an already-migrated database — the
deploy-onto-existing path is what CI proves and what a ceremony actually walks. `pnpm db:reset`
drops only the `clara` schema, so redoing a scratch DB stays cheap.

**Put the timeout in the file, not in the ceremony.** A heavy pass carries its own
`set local statement_timeout = '20min';` near the top, inside the runner's per-migration
transaction, so it cannot be forgotten at deploy time. Say in a comment whether the setting is
load-bearing or precautionary — a reader should not have to guess which.

**Measure before, measure after, in the same transaction.** Open with a prestate section that
measures every claim the file makes about what it is editing, and abort if a claim turns out
false rather than proceeding on a wrong premise. Close with a tail census that re-reads the
live catalog and `raise notice`s what it found. The census is the evidence a reviewer reads; a
migration whose tail only says "OK" has proven nothing.

**Every new table gets forced RLS and its policy pair.** `enable row level security` plus
`force row level security`, then the owner policy (`for all to clara_fn_owner`) and the scoped
human read (`for select to clara_authenticated using (firm_id = clara.jwt_firm())`) with the
matching grant. A table without forced RLS is a cross-tenant leak waiting for its first bug.

**Applied files are immutable.** The runner records each file's sha256, so editing an applied
migration trips a checksum-drift error. Fix forward with a new file.

**Never touch `workflow`, `graphile_worker`, or `spike`.** The Slice-0 spike holds a live
parked run in them — which is exactly why this pipeline is schema-scoped to `clara`.

**A migration that adds a `clara_authenticated` door must name its frontend home in the PR
body** — the journey/panel that will call it, or the explicit non-UI ruling (ops drill,
internal-only, cutover-owed). Minted 2026-08-28 from the verb-coverage census: every orphan it
found was a door merged without a named home. The census re-run at the P6 exit gate is the
closing instrument; this rule is what keeps the gap from re-opening between censuses.

**A migration that replaces an audited writer's body carries the D1 write-quiesce obligation**
at deploy. PostgreSQL runs an in-flight PL/pgSQL call to completion on the body it *started*
with, so a call that spans the migration silently runs the OLD body and skips the new
behaviour. Full rule: `packages/db/README.md`, "Deploy contract".

Enforced by machine, not restated here: no committed credentials (leak-scan) and no
hand-written books rows where an audited function exists (EXECUTE-only grants).
