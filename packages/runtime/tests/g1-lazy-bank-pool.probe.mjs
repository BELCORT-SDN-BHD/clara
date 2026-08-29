// A PRODUCTION-MODE probe for Gate G1 MUST G — the bank pool's laziness.
//
// WHY A CHILD PROCESS AND NOT A PLAIN CELL. pools.mjs reads RELAY_TEST_MODE ONCE, at module
// load, into a module-level constant. A cell that deleted the env var mid-suite would still be
// talking to a module that had already decided it was in test mode — the question would be
// asked of an instrument that cannot answer it. This file is spawned with RELAY_TEST_MODE
// genuinely unset and the three eagerly-required DSNs present, so the import evaluates the
// production branch for real.
//
// THE CLAIM UNDER TEST: assertProductionPoolConfig() must NOT require CLARA_BANK_DATABASE_URL.
// An earlier draft of pools.mjs put it in the eager set, which would refuse to BOOT the whole
// server+worker until the bank ceremony ran — and that ceremony is itself gated on G1 merging
// first (a deadlock). getBankPool() must still fail CLOSED, just LAZILY, at first actual use.
//
// The DSNs below are deliberately unreachable placeholders. Nothing here CONNECTS: the assert is
// pure env reading, and getBankPool() throws while resolving its config, before any socket.
//
// Prints one JSON line to stdout. Any thrown error is caught and reported IN that line, so the
// parent reads a verdict rather than inferring one from an exit code.

const out = { assertThrew: null, bankPoolThrew: null, bankPoolMessage: null, eagerDsnStillRequired: null };

const pools = await import("../lib/pools.mjs");

// 1. The eager assert, with every DSN present EXCEPT the bank one.
try {
  pools.assertProductionPoolConfig();
  out.assertThrew = false;
} catch (e) {
  out.assertThrew = true;
  out.assertMessage = e instanceof Error ? e.message : String(e);
}

// 2. The lazy pool, same env. It must fail CLOSED — never fall back to a shared identity.
try {
  pools.getBankPool();
  out.bankPoolThrew = false;
} catch (e) {
  out.bankPoolThrew = true;
  out.bankPoolMessage = e instanceof Error ? e.message : String(e);
}

// 3. A POSITIVE CONTROL on the assert itself, so "it did not throw" is not vacuous: drop one of
//    the genuinely eager DSNs — the WRITE one — and the SAME call must throw. An assert that
//    never throws for any input would satisfy step 1 while proving nothing. (The field is named
//    for what it measures: an eager DSN is still required. An earlier name said "freeform", which
//    described neither the DSN dropped nor the claim proven.)
delete process.env.CLARA_WRITE_DATABASE_URL;
try {
  pools.assertProductionPoolConfig();
  out.eagerDsnStillRequired = false;
} catch {
  out.eagerDsnStillRequired = true;
}

process.stdout.write(JSON.stringify(out) + "\n");
