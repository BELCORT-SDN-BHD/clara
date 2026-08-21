# Clara — the R2 off-site backup wiring, as executed

*Split out of `docs/ops/DR.md` §9 at the 2026-08-20 clock-out, under the outgrow law and the
same split precedent `DR.md` §10 already names for `DR-full-drill.md` and `DR-render.md`: a
document that outgrows a read is SPLIT, never pruned. **Nothing here is superseded** — these
are the exact owner inputs and flyctl mechanics that stood up the `clara-backup` app, kept
because the next person to rebuild or re-key that app needs them, and because two of the
footnotes below were learned live and cost real time.*

**`DR.md` keeps what an operator needs day to day** — what the pipeline does, the crown-jewel
secret inventory, which steps the classifier forces the owner to run, the wiring evidence, and
the verify cadence. This file holds the one-time standing-it-up procedure.

**Executed and passed 2026-07-22.** The evidence is in `docs/ops/DR.md` §9 ("Wiring evidence"),
not repeated here.

---

## Fly mechanics these steps rely on

*(verified against fly.io/docs, 2026-07-22 — each one changes what a step must say)*

- A plain `fly deploy` on a service-less app still creates AND STARTS a machine (+1 stopped
  standby) — i.e. it would fire a live backup run on every deploy. So the image is shipped
  **build-only + push**, and the ONE scheduled machine is created from the pushed image.
- `fly machine run` **disregards fly.toml** (env/files/vm — it reads only the app name), so the
  step-6 flag set **IS** the runtime contract. Nothing in `fly.toml` backs it up.
- A `--file-secret`'s Fly secret must hold the **base64** of the file content; machine creation
  fails otherwise.
- A scheduled machine **starts once immediately at creation** — that supervised boot is the
  owner-gated first live run — then re-runs ~daily (fuzzy; the 26h grace tolerates it), exit 0
  → stopped until the next cycle.
- The corollary of the on-fail restart policy: a NON-zero exit makes Fly **retry** the run
  (repeated live dump attempts), each failure firing the `/fail` ping — so the dead-man's
  switch alarms promptly instead of waiting out the grace window.

## The exact owner inputs

1. Create the **R2 bucket** + a **scoped R2 API token** (Object Read&Write on the ONE DR
   bucket). Its access-key pair + account endpoint become the `RCLONE_CONFIG_R2_*` Fly secrets
   in step 4. (For a LOCAL rehearsal use `packages/backup/deploy/rclone.conf.example` instead.)
2. `age-keygen` → paste the `age1…` **recipient** into `packages/backup/deploy/age-recipient.txt`
   (it replaces the placeholder — **the job refuses to run until it is real**); custody the
   **identity** key off-repo and off-R2, with an offline backup.
3. A **healthchecks.io** check (period 1 day, **26h grace**) → `tools@belcort.com`; its ping URL
   becomes the `CLARA_BACKUP_PING_URL` secret.
4. `fly apps create clara-backup`, then stage the six secrets from a NAME=VALUE file written
   **OUTSIDE the repo** (e.g. `%USERPROFILE%\clara-backup-secrets.env`, in Notepad — **never**
   via chat or argv, and never inside the working tree, where no ignore pattern covers it;
   delete it after the import):

   ```text
   DATABASE_URL=              # session pooler, port 5432 (NOT 6543)
   CLARA_BACKUP_STORAGE_SERVICE_KEY_B64=   # base64 of the service_role key
   RCLONE_CONFIG_R2_ACCESS_KEY_ID=
   RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=
   RCLONE_CONFIG_R2_ENDPOINT= # https://<account-id>.r2.cloudflarestorage.com
   CLARA_BACKUP_PING_URL=     # https://hc-ping.com/<uuid>
   ```

   ```sh
   fly secrets import -a clara-backup --stage < "$env:USERPROFILE\clara-backup-secrets.env"
   ```

5. An **R2 Object-Lifecycle rule**: delete `db-snapshots/` objects older than 30 days. **The
   `firm-docs-mirror/` prefix is write-once, delete-never — do not lifecycle it away.**
6. Build + push the image, then create the ONE scheduled machine from it (from the **repo
   root**; `--dockerfile` is explicit because `[build].dockerfile` resolution relative to a
   nested `--config` is not doc-guaranteed):

   ```sh
   fly deploy . --config packages/backup/fly.toml \
       --dockerfile packages/backup/Dockerfile \
       --build-only --push --image-label dr-wiring-1 -a clara-backup

   fly machine run registry.fly.io/clara-backup:dr-wiring-1 \
       -a clara-backup --region sin --schedule daily \
       --vm-size shared-cpu-1x --vm-memory 1024 \
       --file-secret //run/secrets/clara_storage_service_key=CLARA_BACKUP_STORAGE_SERVICE_KEY_B64 \
       -e CLARA_BACKUP_STORAGE_URL=https://<project-ref>.supabase.co \
       -e CLARA_BACKUP_R2_BUCKET=<bucket>
   ```

   The machine boots immediately — that supervised boot is the first live run: watch
   `fly logs -a clara-backup` for the `clara-backup: DONE` line, then the healthchecks green
   ping and the R2 objects. Non-secret deploy-specific env rides as `-e`; the rclone remote
   constants (including the load-bearing `RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true` — see the
   Dockerfile) are baked into the image; every secret is already on the app from step 4.
7. *(Optional corroboration)* deploy the freshness Worker (`packages/backup/deploy/cf-worker/`).

## Two field notes, learned live

**Running flyctl from Windows (2026-07-22).** The guest path is written `//run/…` **on
purpose**: flyctl validates it with the HOST's path rules, so a single `/run/…` is rejected as
non-absolute on Windows, while the UNC-shaped double slash passes and Linux resolves `//run` =
`/run`. Prefix the command with `MSYS_NO_PATHCONV=1` under Git Bash (MSYS otherwise rewrites the
guest path), and put any command override **after a `--` terminator** or flyctl eats `sh -c`'s
`-c` as its own `--config` flag.

**The rclone 501 (resolved, Wave A2.1 §7).** The Debian bookworm rclone (1.60) got a
first-attempt `501 NotImplemented` on R2 single-file PUTs, which its internal retry cleared —
uploads succeeded, logs were noisy. The Dockerfile now pins a checksum-verified current upstream
rclone release binary (1.74.4 at pin time; a bump is the two ARG lines). Re-verify with a
supervised run at the next image rebuild + deploy.
