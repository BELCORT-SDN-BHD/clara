// Pre-integration gate for #979's depreciation-authority retired-read fallback (migration
// 0251). NOT a test file: preload it for an estate sweep run against a chain that predates this
// PR's migration, so the sweep greens with a LOUD skip instead of hard-failing every cell
// against a database where `clara.get_depreciation_authority` still returns a bare null for a
// client whose only authority is retired.
//
// Mirrors fa-birth-watermark-preintegration-gate.mjs exactly.
//
// A FOCUSED invocation (`node --test tests/fa-authority-retired-read.test.mjs`) does not preload
// this file, so the variable stays unset and a chain missing the fallback FAILS LOUDLY. Final
// acceptance is exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_FA_AUTHORITY_RETIRED_READ = "1";
