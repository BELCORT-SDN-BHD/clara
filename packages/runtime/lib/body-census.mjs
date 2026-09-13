// #637 (D6 / C88.8) — WHICH BODIES ARE LIVE RUNS PARKED ON THAT THIS IMAGE DOES NOT CARRY.
//
// THE GAP THIS CLOSES. `/workflows` names the registry's CLASSES. `/api/build-info` names what
// this image HAS. Nothing compared either against LIVE STATE, so no surface could tell a reader
// that a Work is parked on a body the current image no longer pins — the exact condition a
// rollback creates, and the exact condition that looks like nothing at all until somebody asks
// why a Work has been `awaiting_input` for three days.
//
// WHY A MODULE AND NOT A FIELD SOMEWHERE. `lib/health.mjs` must stay ~0ms and DB-free on the
// /ready path (its own storage-probe and lane-probe paragraphs say why: fly's 5s budget is
// already shared by two sequential bounded round trips, and a third would turn a warning into a
// timed-out health check). So the census is MEASURED elsewhere — once, at world start, by
// plugins/startWorld.ts, which is the only place that can import the TypeScript registry — and
// READ from here. That is `lib/leader-state.mjs`'s shape exactly, and for the same reason: no
// imports, no DB reach, four scalars.
//
// THREE ANSWERS, NOT TWO (#617's law, applied here). `measured:false` means the boot census has
// not run in this process — a world-off skeleton, a health-only test file. That is NOT the same
// fact as "ran and found nothing stranded", and reporting it as a clean zero would be exactly the
// absence-is-served-as-evidence shape this estate has already paid for twice. A census that
// FAILED carries `measured:false` plus a sanitized `error` code, which is a third answer again.
//
// THE WORLD REFUSES, NOT WARNS (#637 review S5 — this superseded the module's original
// warning-only design, below, before it ever shipped). `plugins/startWorld.ts` takes this census
// BEFORE `getWorld().start()`, because after start is too late: the world's own boot re-enqueue is
// what raises `ReplayDivergenceError` on a run whose body this image does not export, and a census
// that ran afterwards could only describe the crash. A non-zero census REFUSES to start the durable
// world — HTTP stays up, so `/ready` still answers 503 with `checks.bodies.world_start_refused` and
// the stranded body names, and `/api/build-info` stays readable — but no lane runs until the image
// is replaced or the operator sets `CLARA_ALLOW_STRANDED_BODIES=1`, which starts the world anyway on
// the operator's own authority and may crash on replay. The ONE fail-OPEN case is a census that
// could not even be TAKEN (the read itself failing, not a nonzero result): that is not evidence of
// a stranded body, so the world starts and `/ready` reports `measured:false` rather than a false
// clean zero.
//
// This is an accepted ruling, not a settled one: refusing is database-WIDE (any non-terminal run of
// an unexported body blocks every later runtime process on that database, not only the one that
// left it), and that blast radius is still pending the owner's confirmation (packages/runtime/
// README.md's boot-gate section and docs/ARCHITECTURE.md §10 name it).

const state = {
  measured: false,
  stranded: null,
  names: [],
  runs: [],
  at: null,
  error: null,
  worldStartRefused: false,
};

/**
 * Record a completed census (plugins/startWorld.ts, once, after the world is dispatchable).
 * @param {{stranded:number, names:ReadonlyArray<string>, runs?:ReadonlyArray<object>}} census
 */
export function recordBodyCensus(census) {
  state.measured = true;
  state.stranded = Number(census?.stranded ?? 0);
  state.names = [...(census?.names ?? [])];
  state.runs = [...(census?.runs ?? [])];
  state.at = new Date().toISOString();
  state.error = null;
  state.worldStartRefused = false;
}

/**
 * The world was NOT started because live runs are parked on bodies this image does not export
 * (#637 review S5). A distinct recorder rather than a flag on the one above, because this is a
 * different fact: the census ran, it found something, AND the process acted on it.
 * @param {{stranded:number, names:ReadonlyArray<string>, runs?:ReadonlyArray<object>}} census
 */
export function recordWorldStartRefused(census) {
  state.measured = true;
  state.stranded = Number(census?.stranded ?? 0);
  state.names = [...(census?.names ?? [])];
  state.runs = [...(census?.runs ?? [])];
  state.at = new Date().toISOString();
  state.error = null;
  state.worldStartRefused = true;
}

/**
 * Record a census that could not be taken. `measured` stays FALSE — the whole point is that a
 * failed read must never be readable as a clean estate.
 * @param {string} code a sanitized, identifier-shaped code — never raw database text
 */
export function recordBodyCensusFailure(code) {
  state.measured = false;
  state.stranded = null;
  state.names = [];
  state.runs = [];
  state.at = new Date().toISOString();
  state.error = typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : "census_failed";
}

/**
 * The /ready view. Names and counts only — `/ready` is unauthenticated (lib/health.mjs's opening
 * contract), so a body IDENTIFIER is admissible (it is a public fact about the image) and a run
 * id, a DSN or raw database text is not.
 * @returns {{measured:boolean, stranded:number|null, names:string[], at:string|null, error:string|null,
 *            world_start_refused:boolean}}
 */
export function bodyCensusHealth() {
  return {
    measured: state.measured,
    stranded: state.stranded,
    names: [...state.names],
    at: state.at,
    error: state.error,
    // Snake_case on the wire, matching every other /ready field (`last_error_code`, `frontier_reason`).
    world_start_refused: state.worldStartRefused,
  };
}

/** Test-only injector — the record is process-global, so cells must set it explicitly. */
export function _setBodyCensusForTest(next) {
  state.measured = Boolean(next?.measured);
  state.stranded = next?.stranded === undefined ? null : next.stranded;
  state.names = [...(next?.names ?? [])];
  state.runs = [...(next?.runs ?? [])];
  state.at = next?.at ?? new Date().toISOString();
  state.error = next?.error ?? null;
  state.worldStartRefused = Boolean(next?.worldStartRefused);
}

/** Test-only reset — cells must not leak into each other. */
export function _resetBodyCensusForTest() {
  state.measured = false;
  state.stranded = null;
  state.names = [];
  state.runs = [];
  state.at = null;
  state.error = null;
  state.worldStartRefused = false;
}
