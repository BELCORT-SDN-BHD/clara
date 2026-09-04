// CB-AE2E-035 — what is actually serving.
//
// THE DEFECT. Nothing in the product could say what code was running. `/health` returns a pid,
// `/ready` returns liveness, `/workflows` names workflow EXPORTS — none of them names a commit,
// an image, or a schema frontier. The launch night spent a `fly releases --json` investigation
// to establish that v71…v74 all carried ONE image, because `fly status` VERSION read 74 and
// nothing in the product could contradict it. H-01 is the same class: the image and the schema
// disagreed for four hours and nobody could see it from outside.
//
// THE HONESTY RUNGS, which are the whole point of this module:
//   * `git_sha` is NULL when `CLARA_BUILD_SHA` is unset. Never a placeholder, never "unknown",
//     never a guess. A fabricated sha is worse than no sha — it would be believed.
//   * the frontier read CANNOT fail the route. If the DB is unreachable, or if
//     `clara.build_frontier()` does not exist yet, `frontier` is null and `frontier_reason`
//     says which — because build-info's job is to tell you what is serving PRECISELY when
//     something else is broken.
//   * `frontier_reason` distinguishes "the verb is not deployed" from "the read failed". Those
//     are different facts about the estate and collapsing them would hide a migration gap.

// THE REGISTRY IS NOT IMPORTED HERE, DELIBERATELY. `workflows/registry.ts` is TypeScript: it
// resolves inside the nitro build and from `src/*.ts`, but a plain-Node `.mjs` importing
// `../workflows/registry.js` fails to resolve (proven — ERR_MODULE_NOT_FOUND), which would make
// this module untestable without a build. The workflow names are therefore passed IN by
// `src/buildInfoRoutes.ts`, which can import the registry, and a cell pins that it does.
import { withRuntime } from "./pools.mjs";

/** Postgres `undefined_function`. The verb ships in DB-B's web-reads migration; a runtime
 *  deployed ahead of it must say so rather than report a null that reads like "no migrations". */
const UNDEFINED_FUNCTION = "42883";

const FRONTIER_DEADLINE_MS = Number(process.env.CLARA_BUILD_INFO_FRONTIER_MS) > 0
  ? Number(process.env.CLARA_BUILD_INFO_FRONTIER_MS)
  : 3000;

/**
 * Read the migration frontier through `clara.build_frontier()` — a SECURITY DEFINER over
 * `clara.schema_migrations` granted to `clara_runtime` alone (the table itself gains no grant:
 * a broad SELECT on the migration runner's ledger is a schema-history oracle nobody asked for).
 * NEVER throws.
 * @param {{withRuntime?:Function, timeoutMs?:number}} [deps]
 * @returns {Promise<{frontier: {count:number, max_version:string|null}|null, frontier_reason: string|null}>}
 */
export async function readMigrationFrontier(deps = {}) {
  const run = deps.withRuntime ?? withRuntime;
  const budget = Number.isFinite(deps.timeoutMs) && deps.timeoutMs > 0 ? deps.timeoutMs : FRONTIER_DEADLINE_MS;
  let timer;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("__frontier_deadline__"), { code: "frontier_timeout" })), budget);
    });
    const work = run(async (c) => c.query("select clara.build_frontier() as frontier"));
    const r = await Promise.race([work, deadline]);
    const raw = r?.rows?.[0]?.frontier;
    if (raw === undefined || raw === null) {
      return { frontier: null, frontier_reason: "build_frontier returned no row" };
    }
    // The door returns jsonb {count, max_version}. Report exactly those two keys, coerced —
    // count arrives as a JSON number, max_version as a string or null.
    return {
      frontier: { count: Number(raw.count ?? 0), max_version: raw.max_version == null ? null : String(raw.max_version) },
      frontier_reason: null,
    };
  } catch (err) {
    const code = err && typeof err === "object" ? err.code : undefined;
    if (code === UNDEFINED_FUNCTION) {
      return {
        frontier: null,
        frontier_reason: "clara.build_frontier() is not deployed to this database yet",
      };
    }
    if (code === "frontier_timeout") {
      return { frontier: null, frontier_reason: "the frontier read exceeded its deadline" };
    }
    // Server-side only: the full message may name a host or a role.
    console.error("[clara-runtime] build-info frontier read failed:", err?.message ?? err);
    return { frontier: null, frontier_reason: "the frontier read failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The full build-info payload. Everything except the frontier is process-local and cannot fail.
 * `names` is REQUIRED from the caller (see the registry note at the top of this file); the
 * route passes `workflowNames` and a cell pins that it does.
 * @param {{env?:NodeJS.ProcessEnv, names?:ReadonlyArray<string>, withRuntime?:Function, timeoutMs?:number}} [deps]
 */
export async function buildInfo(deps = {}) {
  const env = deps.env ?? process.env;
  const { frontier, frontier_reason } = await readMigrationFrontier(deps);
  // Assembled BY ASSIGNMENT rather than by spread — check-parts-parity.mjs refuses any object
  // spread under packages/runtime outside tests/ (checkout-pools.mjs states the same reason).
  const out = {
    service: "clara-runtime",
    // NULL, not a placeholder, when the build arg was not passed. An empty string is treated as
    // unset: the Dockerfile's ARG defaults to "" and Docker sets the ENV to that empty value, so
    // a truthiness test — not `in process.env` — is what tells the truth here.
    git_sha: env.CLARA_BUILD_SHA ? String(env.CLARA_BUILD_SHA) : null,
    image_ref: env.FLY_IMAGE_REF ? String(env.FLY_IMAGE_REF) : null,
    machine_version: env.FLY_MACHINE_VERSION ? String(env.FLY_MACHINE_VERSION) : null,
    machine_id: env.FLY_MACHINE_ID ? String(env.FLY_MACHINE_ID) : null,
    // The registry's own export names — the only version-ish signal the runtime had before this
    // route existed, kept here so one read answers "which workflows, from which commit". Copied
    // rather than aliased so a caller cannot mutate the registry's array through the response.
    workflows: [...(deps.names ?? [])],
    frontier,
    frontier_reason,
    ts: new Date().toISOString(),
  };
  return out;
}
