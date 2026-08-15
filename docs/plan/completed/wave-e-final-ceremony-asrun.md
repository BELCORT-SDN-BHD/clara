# The 0077-0084 ceremony — as run (2026-08-15, the wave-closing ceremony)

**Scope:** the final eight migrations of Wave E (η's wake wrappers 0077-0078 · ζ's render
queue 0079-0083 · the B4 approve-verb maker rule 0084) applied to the live project from
merged `main` (faf33ecb), inside a **D1 write-quiesce window**, followed by the **chatTurn
v11 runtime deploy** and the first real **`freeze --lock-deployed`**. **Result: 8/8 applied
clean, zero stops; positive reads PASS on every probe; v11 LIVE (`/ready` 200); all 140
manifest entries deploy-locked.** Live frontier: 71/`0072` → **79/`0084`**.

## Order of operations (the D1 recipe as executed)

1. **Backup banked first**: `clara-backup` on-demand run `2026-08-15T09-31-05-083Z` → R2
   (with the daily scheduled run also landing independently — two bundles banked).
2. **D1 window OPEN**: the single `clara-runtime` machine stopped (v60 down; no writer can
   span the 0084 approve-verb body swap).
3. **Apply** via the no-print DSN bridge (sleeper machine + `printenv` piped into
   `dsn-pipe.mjs`; `sslmode=verify-full` with the pinned pooler CA; port 5432 session mode;
   `node scripts/migrate.mjs` direct — the Windows pnpm-shim trap avoided per the 0064-0072
   record). All eight NOTICEs matched the author's field brief verbatim.
4. **Positive reads** (asserted by script): ledger 79/`0084` · the four wake wrappers
   allowlisted interactive-ONLY (4/0) · `approve_metric_definition`'s live prosrc sha256 =
   `5d41f253…` — **exactly δ's catalog-census pin** · `render_jobs` 0 rows + forced RLS ·
   nine runtime verbs granted to `clara_runtime` · `NOTIFY pgrst` sent.
5. **v11 deploy**: `fly deploy` from the merged-main clone (remote builder); machine
   restarted on the new image; `/ready` 200. The D1 window closed with the deploy — the
   first writer to run after the body swap was the new image.
6. **`freeze --lock-deployed`**: 10 newly-deployed entries locked (ζ's six render modules +
   η's four chatTurn v11 files); **every manifest entry is now deploy-locked**; freeze-lint
   green (140 files, append-only). From this commit, any behavioural change to a locked
   workflow ships as a new `_vN` export — the v11 files included.

## Field notes

- **The #241 isolation pin spoke on live for the first time**: "1 isolation-pinned
  migration(s) already applied and skipped (0057 · repeatable read); this run does not
  re-apply them, and the pin governs only transactions this runner opens" — the honestly-
  worded note doing exactly what its review demanded.
- The session-pin nonce + pooled-backend notes rode every file, as designed (#236).
- 0084's prosrc prestate pin (δ's body at `494c5a92…`) matched live — the live estate
  carried δ's reviewed body byte-exactly, so the fail-closed refusal path stayed silent.
- No Supavisor interaction: ζ's queue wires no standing consumers until the render worker's
  own fly ceremony; η's wrappers are wake-lane only.

## What is now live

The complete Wave E estate: client facts (0055) · the close model (0056) · period registry
(0057) · the metric algebra + evaluator freeze + A30b receipts (0058-0061) · the RS
name-only wall (0062-0063) · get_close_plan (0064) · the FS reporting layer (0065-0072) ·
the wake authoring wrappers (0077-0078) · the render queue + human doors (0079-0083) · the
maker-rule approve verb (0084). Runtime: chatTurn **v11** (the five authoring tools live,
client-scoped; v10 exported for parked runs). All frozen workflows deploy-locked.

## Residue

- The render WORKER itself (fly app `clara-render`) deploys in ζ's own ceremony, next.
- The #43 wording packet seeds through its own reviewed migration (statutory packs assess
  `failed` until then — a DB state, not a defect).
- The ceremony ran on the owner's standing full-permission grant; password-bearing acts
  structurally avoided throughout.
