# Rider #1008 — the legal enforcement mode (beta: nothing dark)

One ticket, one worktree, one branch. The ticket is the contract: `gh issue view 1008 --comments`.
This brief adds the orchestrator's binding decisions and the rig. The common rules are the wave's:
`docs/plan/active/refresh-wave-2026-09-18/WORK-ORDER.md` rules 0 to 10 apply unchanged, except where
this file says otherwise (rig, report location).

## Why now

The owner ruled on 2026-09-20: "现在是beta phase, 我要所有东西都可以用和test, 这些东西反而是最不重要的,
正式发布前我会和律师核对, 你不要DARk东西了", and then: implement #1008 now and release it. On hosted,
firms admitted before 2026-09-13 have no Terms of Service acceptance, so 0195's derived basis is not
live and their Work cannot use the model.

## Rig

- Worktree `C:\Users\zhant\Desktop\clara-wt\int`, branch `impl/1008-legal-enforcement-mode`, based on
  `origin/main` `511df8f8`. Dependencies are installed. Node 22: start every Bash command with
  `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`.
- Database: WSL PostgreSQL 17 cluster `rigreh`, `127.0.0.1:55730`, db `clara_reh`, user `postgres`,
  trust auth. It is at **228 / `0233_firm_commercial_settings`**, seeded, reached by a 0001 to 0224
  chain and then the nine wave files (the release rehearsal). No Workflow World is bootstrapped on it.
  Env: `export PGHOST=127.0.0.1 PGPORT=55730 PGUSER=postgres PGDATABASE=clara_reh CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`.
  NEVER set `CLARA_RIG_ALLOW_RESET` or `CLARA_RIG_ALLOW_ROLE_SWEEP`, never run a second from-scratch
  chain on this cluster (0154 pins the cluster-wide role count). If you must re-apply an edited,
  unmerged 0234, use the wave's manual recipe (restore the pre-images you measured, drop what 0234
  created, delete its ledger row, re-migrate) and record that you did.
- Browser walks, if you add one: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3400 CLARA_E2E_NEXT_PORT=3401 CLARA_E2E_RUNTIME_PORT=3402`,
  always through `pnpm --filter @clara/web e2e <spec>`.
- `docs/plan/active/refresh-wave-2026-09-18/RIG.md` describes test commands and the known Windows-only reds.

## Orchestrator decisions (binding)

1. **Migration:** exactly one new file, `0234_legal_enforcement_mode.sql`. House shape: header,
   prestate with sha256(prosrc) pins MEASURED on the rig for every body you recut or rely on, tail
   assertions, a preintegration gate module, a `rig-meta.mjs` cohort, the gate chain entry after
   0233's. Never edit an applied migration.
2. **The mode:** one platform-level setting with two values, `prompt` and `enforce`; the migration
   leaves it at `prompt`. Storage is a relation with FORCE RLS and zero application-role DML. One
   write door at the floor `clara.set_admission_capacity` uses (the operator firm's owner), copied
   from that door's shape including its idempotency key, receipt and audit. No web control for the
   flip in this ticket: say so in the report as a follow-up.
3. **`clara._accounting_work_egress_live`** is recut. `enforce` = today's rule, unchanged in
   behaviour. `prompt` = an ACTIVE client of the firm, and an ACTIVE OWNER of the firm who holds at
   least one real `clara.legal_acceptances` row (either kind, any version). The acceptance it cites
   is that owner's most recent data processing agreement acceptance when one exists, otherwise their
   most recent Terms acceptance. No published version is required to exist in `prompt` mode. The
   function stays ungranted and its negatives stay indistinguishable.
4. **`clara.prepare_egress_dispatch`** may be patched ONLY in its accounting_work mint arm, by the
   house string-splice pattern (replace over `pg_get_functiondef`, each anchor asserted to occur
   exactly once, the pre-image pinned, the tail proving every other byte is unchanged): the consent's
   `scope_note`, the audit payload and the `egress.purpose_consent_derived` event must say truthfully
   which mode granted the basis and which acceptance it cites. A key name must never call a Terms
   acceptance a DPA acceptance. If you can satisfy that without touching this body, do not touch it.
   `clara.consume_egress_dispatch` is never touched.
5. **`clara.restore_client_egress_purpose`** keeps refusing CLR28 `derived_basis_not_live` when the
   basis is not live; it needs no recut if it only calls the helper. Measure, do not assume.
6. **`clara.get_firm_legal_standing`** (0233; arity 0 is pinned forever, the body is not) reports the
   mode. The standing facts it already reports stay true in both modes: "not current" is still
   reported in `prompt` mode, because the settings card and #1009's prompt need it.
7. **Web:** the legal-standing card chooses its copy by mode. In `prompt` mode it asks the owner to
   accept and must not say the model is switched off. Message keys only. Update the e2e mock and the
   fixture-ownership census if the read's shape changes. No Firm Home work: that is #1009.
8. **Tests first** (red, then green), at these seams: the helper in both modes (the BELCORT shape:
   DPA accepted at signup, Terms published later and unaccepted; a newer publication; a firm whose
   active owner holds no acceptance; an inactive client); the mint arm's evidence in `prompt` mode;
   the sticky revoke and the deactivate/reactivate pair in both modes; the mode door's floor, replay
   and receipt; the standing read's mode; the card's two copies. Existing 0195 / 0211 / 0233 cells
   must pass unchanged with the mode set to `enforce` where they assert enforcement; if a cell's
   fixture now needs the mode set explicitly, set it in the cell, never by weakening the assertion.
9. **Frozen law:** no frozen workflow body or closure module changes. Run
   `node scripts/check-frozen-workflows.mjs` and expect no diff to `frozen-workflows.json`. No runtime
   code change is expected; if you find one is needed, stop and say why in the report.
10. **Docs on the branch:** `packages/db/README.md` (the mode, the door, the deploy note: 0234 recuts a
    live body, so it rides a writer-quiescence window), `apps/web/README.md` if the card's contract
    moved, `CONTEXT.md` for the new term (house "term / _Avoid_" shape). Never `docs/PRD.md` or
    `docs/ARCHITECTURE.md`: list the drift in the report.
11. **Reports** go in this folder's `reports/` IN THE WORKTREE (not the main checkout), uncommitted:
    `1008-final.md` in WORK-ORDER rule 10's shape, plus one section the release needs: the read-only
    SQL that counts, on hosted, the firms whose basis is not live under `enforce` and live under
    `prompt`, and the exact prestate pins 0234 checks (names and shas).
12. Commit early and often on the branch; every commit message ends with
    `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never push, never open a PR.
