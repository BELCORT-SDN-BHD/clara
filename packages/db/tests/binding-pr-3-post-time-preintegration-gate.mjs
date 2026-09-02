// Pre-integration preload for the PR-3 post-time battery. NOT a test file. The battery itself
// still decides by a positive catalog identity read: this flag only distinguishes the package
// sweep (loud named skips on the exact pre-image) from a focused acceptance run (hook failures).
process.env.CLARA_ALLOW_MISSING_BINDING_PR3_POST_TIME = "1";
