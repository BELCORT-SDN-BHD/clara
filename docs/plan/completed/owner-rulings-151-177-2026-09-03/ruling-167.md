# 裁-167 — OD-17 (DS-07): the design authority `clarabook-frontend` is followed — its SHIPPED button component (24/28/32/36 px, byte-identical to `apps/web/components/ui/button.tsx`) is authoritative; its token contract §5.2 (32/36/40) is recorded as NEVER IMPLEMENTED in either repo

**Ruled 2026-09-03 ≈20:4x MYT (shell clock; owner, AskUserQuestion), verbatim:** 「跟著clarabook-frontend就對了」.

**Reading.** "Follow clarabook-frontend" = follow what the design repo actually ships. Its component's
size-variant block is byte-identical to the shipped `apps/web` block (md5
`6f29955ea9f9f080f7e602149d6a4aa6`); §5.2's 32/36/40 exists in neither repo's code. So this is
option B in substance, with the owner's framing: the design repo is the authority, and the authority
is what it ships, not what a contract paragraph says. If `clarabook-frontend` later implements §5.2,
`apps/web` follows it then — a note on the DS-07 row, not a lane.

**Consequences.** 裁-13's 24 px target-size gate stays GREEN on the shipped heights; the 13
`size="xs"` buttons sit on the SC 2.5.8 floor with zero headroom (lawful; recorded). §5.2 is written
down as unimplemented in both repos. Record shape: a digest row + a dated `README-log.md` line
(裁-137-shape, contract vs reference) — never a new ADR (裁-140). FS-9's open owner-owed line
closes; the `PROGRESS.md` DS-07 row gets its owner and next step (T-I).

**Record.** Ledger `-09-03` + digest row + README-log line at the final truing.
