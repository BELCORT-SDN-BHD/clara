// Pre-integration gate for #899's client birth wall (migration 0287_client_birth_wall.sql).
// NOT a test file: preload it for an estate sweep run against a chain that predates this
// migration, so the sweep greens with a LOUD skip instead of hard-failing every cell that
// needs clara.open_client_onboarding / the re-pointed clara.begin_client_onboarding.
//
// A FOCUSED invocation (node --test tests/client-birth-wall.test.mjs) does not preload this
// file, so the variable stays unset and a chain missing the migration FAILS LOUDLY — the same
// polarity client-onboarding-identity.test.mjs's own gate documents for 0219.
process.env.CLARA_ALLOW_MISSING_CLIENT_BIRTH_WALL = "1";
