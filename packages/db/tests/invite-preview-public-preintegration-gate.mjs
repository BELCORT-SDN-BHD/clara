// Pre-integration gate for #871's signed-out invite preview (migration 0309). NOT a test file:
// preload it for an estate sweep run against a chain that predates it, so the sweep greens with a
// LOUD skip instead of hard-failing invite-preview-public.test.mjs's twelve cells (the open-invite
// answer, the no-oracle refusal, the five-state agreement with the roster, the grant boundary, the
// credential-less role pair, the from-scratch role-order proof, the two rate-wall limbs, the
// wall's evidence and the shared-derivation pin).
//
// Mirrors wave4-chart-rows-preintegration-gate.mjs exactly.
//
// THE STEM, NEVER THE NUMBER. The battery detects its premise off `to_regprocedure` and, where a
// migration recuts an existing body, off a `clara.schema_migrations` STEM — never off `^0309_`,
// because numbers are claimed at merge and a number-keyed probe turns every cell into a silent
// green SKIP the moment the integrator renumbers this file (adversarial ADV-L10-04, 2026-09-20).
//
// A FOCUSED invocation (node --test tests/invite-preview-public.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing 0309 FAILS LOUDLY. Final acceptance is
// exactly that focused shape with the variable UNSET, counting ZERO skips.
process.env.CLARA_ALLOW_MISSING_INVITE_PREVIEW_PUBLIC = "1";
