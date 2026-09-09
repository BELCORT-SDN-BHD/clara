// OPERATION-CONTRACT CENSUS — SCOPE. The vocabulary every other module in this directory
// reads from: the finding labels, the roles, the lane wrappers, and the exact source roots
// the caller census walks.
//
// It lives in ONE module because scope is the census's completeness statement. "The catalog
// it read and the files it scanned" is the only claim the tool makes (see the entry point's
// header), so the roots, the extensions and the test-file exclusion must have a single home
// that the report itself quotes back — never a list restated in a scanner and again in the
// renderer, where the two can drift and the report becomes a description of a scan that did
// not happen.
//
// Split out of scripts/operation-census.mjs when that file crossed this repository's 500-line
// ceiling (the same convention hrd-b-upgrade-kit.mjs and pool-error-contract.mjs record).
// No behaviour moved: every value below is byte-identical to the one it replaced.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** scripts/operation-census -> scripts -> packages/db -> packages -> <repo root>.
 *  Never a hard-coded path. */
export const REPO_ROOT = join(HERE, "..", "..", "..", "..");
export const DEFAULT_MIGRATIONS_DIR = join(HERE, "..", "..", "migrations");

/** The seven finding labels. Distinct by construction: a waiver key names exactly one. */
export const FINDING_LABELS = [
  "called_missing",
  "called_ungranted",
  "frontier_mismatch",
  "granted_uncalled",
  "named_arg_mismatch",
  "public_execute",
  "unattributed",
];

/** The labels a green boundary must carry ZERO of after waivers. `granted_uncalled` is
 *  informational (a door reached only from SQL inside another door is legitimate). */
export const HARD_LABELS = [
  "called_missing",
  "called_ungranted",
  "frontier_mismatch",
  "named_arg_mismatch",
  "public_execute",
  "unattributed",
];

/** The one role that owns the bodies. Everything else in the clara_* family is an
 *  APPLICATION role for boundary purposes; the actual list is read from pg_roles. */
export const OWNER_ROLE = "clara_fn_owner";

/** Web call sites reach the database only through PostgREST as clara_authenticated
 *  (apps/web/lib/wire.ts pgrestRpc + lib/doors.ts callDoor). */
export const WEB_LANE_ROLE = "clara_authenticated";

/** Runtime pool wrappers, each of which issues exactly one `SET ROLE` on checkout
 *  (packages/runtime/lib/pools.mjs POOLS_LANE_DESCRIPTORS, lib/freeform-read.mjs,
 *  lib/checkout-pools.mjs). A call site lexically INSIDE one of these is that lane's. */
export const LANE_WRAPPERS = new Map([
  ["withRuntime", "clara_runtime"],
  ["withMetricEvaluationBatch", "clara_runtime"],
  ["makeRuntimeClient", "clara_runtime"],
  ["setRuntimeRoleOn", "clara_runtime"],
  ["withRead", "clara_agent_ro"],
  ["withReadWakeScoped", "clara_agent_ro"],
  ["withWriteWakeScoped", "clara_wake_interactive"],
  ["withBankWakeScoped", "clara_wake_bank"],
  ["withFreeformRead", "clara_freeform_ro"],
]);

/** The lane a runtime call site falls back to when neither a wrapper nor a role literal in
 *  the module names one. clara_runtime is the runtime's default checkout (pools.mjs). */
export const RUNTIME_DEFAULT_ROLE = "clara_runtime";

/** Web roots scanned for callers. Test files are EXCLUDED and that exclusion is reported:
 *  apps/web/lib/wire.test.ts calls pgrestRpc("void_verb", …) against a fake fetch, which is
 *  a test double, not a call site on the boundary. */
export const WEB_ROOTS = ["apps/web/lib", "apps/web/app", "apps/web/components"];
export const RUNTIME_ROOTS = [
  "packages/runtime/lib",
  "packages/runtime/src",
  "packages/runtime/scripts",
  "packages/runtime/plugins",
  "packages/runtime/workflows",
];
export const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs", ".js", ".cjs"];
export const SKIP_DIRS = new Set(["node_modules", ".next", ".output", ".nitro", "dist", "coverage", ".wrangler", ".open-next"]);
/** A file whose name matches is a test double, not a boundary call site. */
export const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** The RAISE census regex, byte-identical in shape to the one the chat-turn CLR census uses
 *  (packages/runtime/tests/c5-chat-clr-census-db.test.mjs) so both read prosrc the same way.
 *
 *  SCOPE, STATED SO NOBODY OVER-READS IT: `codes` is what a body raises ITSELF. Clara's doors
 *  are typically a thin `_human_ctx` wrapper over a `_core`, and the codes live in the core —
 *  `clara.approve_entry` measures ZERO codes and refuses with five. This field is an index of
 *  raise sites, NOT the refusal surface of a door; the reachable set needs the call graph AND
 *  the triggers on every relation written, which is why c5-chat-clr-census-db reads pg_trigger
 *  for its one door rather than trusting a prosrc sweep. */
export const RAISE_RE = /raise exception\s+'((?:[^']|'')*)'([\s\S]{0,300}?)errcode\s*=\s*'([A-Z0-9]+)'/gi;

/** SQL keywords that make a following `clara.<name>` a RELATION reference rather than a
 *  call — used only when the catalog resolves the name to NEITHER a function nor a
 *  relation, so a set-returning function in FROM position is never misclassified. */
export const RELATION_KEYWORDS = new Set(["into", "from", "join", "update", "table", "references", "only", "exists"]);

/** The scan's own exclusion, reported verbatim in `scope.excluded` so a reader of the output
 *  learns what was NOT read without opening this file. */
export const EXCLUDED_NOTE =
  "files matching *.test.* / *.spec.* under those roots (test doubles are not boundary call sites)";
