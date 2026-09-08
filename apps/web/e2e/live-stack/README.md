# Real-stack browser tests

This directory contains the two Playwright runners that exercise the production web bundle against a real disposable Postgres, PostgREST, and Clara runtime. Both runners create and mutate fixtures in the target database. Their database guards reject remote hosts and database names that do not look disposable.

The default mock-backed browser suite is documented in [`../README.md`](../README.md).

## Prepare a disposable database

Start PostgreSQL 17 on loopback, then migrate and seed it with the repository database package. Set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` for that rig. The interview runner accepts only `clara_rt_test` or `clara_wave_b_ci`; the reports runner accepts a `clara_*` name ending in `_test`, `_ci`, `_tmp`, or `_rig`.

Build `WORKFLOW_POSTGRES_URL` from those values in the shell. Leave the password out of the URL and supply it through `PGPASSWORD`:

```sh
CLARA_ALLOW_DESTRUCTIVE=1 pnpm --filter @clara/db migrate
CLARA_ALLOW_DESTRUCTIVE=1 pnpm --filter @clara/db seed
export WORKFLOW_POSTGRES_URL="postgres://$PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
```

The scripts use `wsl -d Ubuntu -- docker` on Windows and `docker` elsewhere. They run PostgREST with host networking, which assumes Docker runs in the Linux or WSL network namespace. A Docker Desktop VM needs an explicit bridge and host-gateway configuration instead.

## Onboarding interview walk

```sh
node apps/web/e2e/live-stack/run-live-walk.mjs
```

[`run-live-walk.mjs`](run-live-walk.mjs) bootstraps the workflow schema, builds and starts the runtime, starts PostgREST, creates complete/cancel/race onboarding fixtures, and runs [`../interview-walk.spec.ts`](../interview-walk.spec.ts). It stops the runtime and PostgREST when it exits. The PostgreSQL process or container remains the caller's responsibility.

[`serve-live.mjs`](serve-live.mjs) supplies the local HTTPS shell, mints a real HS256 test JWT, proxies REST reads to PostgREST, and proxies runtime traffic to the local runtime.

## Reports download walk

```sh
node apps/web/e2e/live-stack/run-reports-download-walk.mjs
```

[`run-reports-download-walk.mjs`](run-reports-download-walk.mjs) provisions complete and pending report artifacts, starts the real report doors and runtime, and runs [`../reports-download-walk.spec.ts`](../reports-download-walk.spec.ts). The report object store is a temporary local directory; object storage itself is outside this test.

The runners use separate default ports. Their `CLARA_E2E_*_PORT` variables can be overridden when another local stack is active. Playwright retains a trace on failure.

## Security and coverage boundary

The harness PostgREST connects with the disposable rig's privileged database user and then executes requests under the JWT role with `SET ROLE`. This still exercises the target role's RLS policies, but it does not reproduce production's narrow authenticator login. Do not copy this connection shape into a deployed service.

These walks prove browser-to-runtime-to-database behavior for onboarding interviews and report downloads. They do not prove Cloudflare behavior, production secrets, mail delivery, Stripe, or a production database. They are not required GitHub Actions checks today; browser verification and its delivery obligations are included in the [refresh spec and audit appendices](https://github.com/BELCORT-SDN-BHD/clara/issues/612).
