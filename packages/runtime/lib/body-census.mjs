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
// WARNING-ONLY, ALWAYS. Nothing here decides anything. A stranded body means this process cannot
// resume those runs; it does not mean this process should stop serving the ones it can. Refusing
// to boot would take the estate down to report a condition that a re-release of the previous
// image fixes and that harms nothing while it lasts — the runs are PARKED, not failing.

const state = {
  measured: false,
  stranded: null,
  names: [],
  runs: [],
  at: null,
  error: null,
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
 * @returns {{measured:boolean, stranded:number|null, names:string[], at:string|null, error:string|null}}
 */
export function bodyCensusHealth() {
  return {
    measured: state.measured,
    stranded: state.stranded,
    names: [...state.names],
    at: state.at,
    error: state.error,
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
}

/** Test-only reset — cells must not leak into each other. */
export function _resetBodyCensusForTest() {
  state.measured = false;
  state.stranded = null;
  state.names = [];
  state.runs = [];
  state.at = null;
  state.error = null;
}
