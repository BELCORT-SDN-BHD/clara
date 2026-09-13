// #620 AC4 — WHICH Supabase stack this battery measures, or the NAMED reason it measures none.
//
// WHY THIS IS ITS OWN MODULE, like verdicts.mjs beside it. `run.mjs` boots containers before it
// can answer anything, so nothing inside it is testable without Docker. This decision is not about
// containers at all: it reads an environment and a capability probe and returns a plan. Split out,
// it is measured by packages/db/tests/storage-battery-contract.test.mjs on any box, with no stack,
// no database and no network — which is exactly the half of AC4 that should not depend on Docker.
//
// THE THREE ANSWERS, AND WHY THERE IS NO FOURTH.
//
//   adopted — the caller named a stack through CLARA_STORAGE_BATTERY_DB_URL / _API_URL /
//             _JWT_SECRET (a `supabase start` someone else is already running, a CI service
//             container, a disposable self-hosted stack). The battery applies the ceremony and
//             runs the cells against it, and NEVER stops a stack it did not start.
//   boot    — no named stack, but a usable CLI and Docker: the battery boots its own disposable
//             stack and disposes it in a `finally`. This is the CI path.
//   skip    — no named stack, no way to boot one, and the caller explicitly allowed a skip
//             (CLARA_STORAGE_BATTERY_ALLOW_SKIP=1). The reason NAMES what was missing and what
//             would let it run. This is the developer-box path.
//
// The fourth answer a battery like this usually grows — "quietly exit 0 because the tools are
// absent" — is deliberately not available. CI never sets the skip switch, so a runner that lost
// Docker, a `supabase/setup-cli` step that silently failed, or a misspelt variable go RED there,
// where a skipped-green battery is indistinguishable from a passing one. `abort` is that red.
//
// A PARTLY-CONFIGURED TARGET IS ALWAYS AN ABORT, even with the skip switch on. Two of the three
// variables set means somebody meant to point this battery somewhere; falling back to booting a
// different stack, or skipping green, would answer a question nobody asked while the question
// they did ask goes unanswered.

/** The variables that, TOGETHER, name an existing stack. All three or none. */
export const ADOPTED_ENV_KEYS = Object.freeze([
  "CLARA_STORAGE_BATTERY_DB_URL",
  "CLARA_STORAGE_BATTERY_API_URL",
  "CLARA_STORAGE_BATTERY_JWT_SECRET",
]);

/**
 * OPTIONAL. A stack whose anon key is a JWT signed with the stack's own secret needs nothing here
 * — the battery mints one. A stack using the vendor's newer publishable-key format (`sb_...`,
 * https://supabase.com/docs/guides/api/api-keys) has a key that is NOT derivable from the secret,
 * and this is where it goes.
 */
export const ADOPTED_ANON_KEY = "CLARA_STORAGE_BATTERY_ANON_KEY";

/** The explicit opt-in that turns "cannot run" from a red into a named skip. */
export const ALLOW_SKIP_ENV = "CLARA_STORAGE_BATTERY_ALLOW_SKIP";

const HOW_TO_ADOPT =
  `set ${ADOPTED_ENV_KEYS.join(", ")} (optionally ${ADOPTED_ANON_KEY}) to point this battery at a `
  + `Supabase stack you are already running`;

/**
 * Decide what this run will measure.
 *
 * @param {object} input
 * @param {Record<string,string|undefined>} input.env  the environment to read (never read ambiently,
 *        so a test can hand it a fabricated one).
 * @param {() => {cli: boolean, docker: boolean}} input.probe  capability probe: is a usable CLI on
 *        PATH (or reachable through npx), and is a docker daemon answering. Called ONLY when no
 *        stack was named, so an adopted run never shells out.
 * @returns {{mode:"adopted", stack:{apiUrl:string,dbUrl:string,jwtSecret:string,anonKey:string|null}, disposes:false, why:string}
 *         | {mode:"boot", disposes:true, why:string}
 *         | {mode:"skip", reason:string}
 *         | {mode:"abort", reason:string}}
 */
export function resolveStackPlan({ env = {}, probe }) {
  const present = ADOPTED_ENV_KEYS.filter((k) => nonBlank(env[k]));
  const missing = ADOPTED_ENV_KEYS.filter((k) => !nonBlank(env[k]));

  // ---- a named stack, whole ---------------------------------------------------------------
  if (missing.length === 0) {
    return {
      mode: "adopted",
      disposes: false,
      why: `adopting the stack named by ${ADOPTED_ENV_KEYS.join(" + ")} — this run boots nothing and stops nothing`,
      stack: {
        apiUrl: stripTrailingSlash(env.CLARA_STORAGE_BATTERY_API_URL),
        dbUrl: env.CLARA_STORAGE_BATTERY_DB_URL,
        jwtSecret: env.CLARA_STORAGE_BATTERY_JWT_SECRET,
        anonKey: nonBlank(env[ADOPTED_ANON_KEY]) ? env[ADOPTED_ANON_KEY] : null,
      },
    };
  }

  // ---- a named stack, in pieces: always red, skip switch or not ---------------------------
  if (present.length > 0) {
    return {
      mode: "abort",
      reason:
        `a partly-configured target: ${present.join(", ")} set, ${missing.join(", ")} missing. `
        + `All of ${ADOPTED_ENV_KEYS.join(", ")} name ONE stack; with some of them set this run `
        + `will neither adopt that stack nor boot a different one behind your back.`,
    };
  }

  // ---- nothing named: can this box build one? ---------------------------------------------
  const can = probe ? probe() : { cli: false, docker: false };
  if (can.cli && can.docker) {
    return {
      mode: "boot",
      disposes: true,
      why: "no stack named — booting a disposable one with the pinned Supabase CLI and disposing it in a finally",
    };
  }

  const lacks = [];
  if (!can.docker) lacks.push("a docker daemon is unavailable");
  if (!can.cli) lacks.push("the Supabase CLI could not be resolved at its pinned version");
  const reason = `${lacks.join("; ")} — so no disposable stack can be booted here. Either install them, or ${HOW_TO_ADOPT}.`;

  return nonBlank(env[ALLOW_SKIP_ENV])
    ? { mode: "skip", reason }
    : {
      mode: "abort",
      reason: `${reason} (Set ${ALLOW_SKIP_ENV}=1 to make this a named SKIP instead of a failure; `
        + `CI deliberately does not set it, so a runner that lost these goes red here.)`,
    };
}

function nonBlank(v) {
  return typeof v === "string" && v.trim() !== "";
}

function stripTrailingSlash(url) {
  return String(url).replace(/\/+$/, "");
}
