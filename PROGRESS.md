# Clara — progress

The state authority. Posture, lanes, backlog and known issues live **here** — not in
`AGENTS.md` (which stays stable across sessions) and not in memory (a preferences-and-lessons
cache). If this file disagrees with any other source about where the work stands, either this
file wins or it is stale — and truing it is the first thing you do.

## Current posture

<!-- TODO:ORCH posture -->

## Lanes

| Lane | Scope | State | PR |
|---|---|---|---|
<!-- TODO:ORCH lanes -->

State vocabulary: `design` · `building` · `in review` · `merged` · `ceremonied` · `blocked` ·
`parked`. A `blocked` lane names its blocker in the Scope cell. A lane leaves this table only
once it is ceremonied — or abandoned, which goes in the session log with a reason.

## Next

The ordered short list the next session picks up, most-ready first. Anything that needs an
owner decision before it can start belongs under Known issues instead.

<!-- TODO:ORCH next -->

## Backlog

Registered but not scheduled. Each item carries enough context to be picked up cold: what it
is, why it matters, and what it is waiting on.

<!-- TODO:ORCH backlog -->

## Known issues

Live defects, harness files known to be stale, and open owner questions. An owner question
records the question, the date it was raised, and what is blocked behind it.

<!-- TODO:ORCH known-issues -->

## Session log

The last three sessions, newest first, one line each: date, what moved, what landed. Older
entries drop off — the durable record is the decision log (`docs/adr/`), not this list.

<!-- TODO:ORCH session-log -->

---

**Keeping this file honest.** Update it at clock-out, every session — posture first, then
lanes, then anything that moved into or out of the backlog. It is cheap to update and
expensive to distrust: a `PROGRESS.md` that has been wrong once gets re-verified forever
after, which costs far more than the updates ever did.
