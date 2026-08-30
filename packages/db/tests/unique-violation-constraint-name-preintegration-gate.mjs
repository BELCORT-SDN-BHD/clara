// Pre-integration gate for the unique_violation constraint-name battery. NOT a test file: it
// is preloaded by the package test script so the package-wide sweep can run against HEAD's
// numbered chain while this PR's migration is still UNNUMBERED. The sweep skips LOUDLY in that
// authoring state; after the conductor numbers the migration, the catalog gate is live and both
// behavioural cells execute normally.
//
// It sets an environment variable because node --test runs each test file in a child process;
// children inherit process.env at spawn time. A focused invocation does not preload this file,
// so the variable stays unset and a pre-migration database still fails loudly. Final migration
// acceptance therefore remains the focused two-cell run with this variable UNSET.
process.env.CLARA_ALLOW_MISSING_UNIQUE_VIOLATION_CONSTRAINT_NAME = "1";
