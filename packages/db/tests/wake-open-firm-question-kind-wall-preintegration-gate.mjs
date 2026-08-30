// Pre-integration gate for the wake_open_firm_question kind-wall battery. NOT a test file:
// the package-wide sweep preloads it while this PR's migration is still UNNUMBERED and absent
// from the numbered replay. Test files still prove the live function body's exact identity;
// this preload alone never authorizes a skip.
//
// A focused invocation does not preload this file. Against the exact known pre-image, that
// shape fails loudly instead of turning a missing migration into a green skip.
process.env.CLARA_ALLOW_MISSING_WAKE_OPEN_FIRM_QUESTION_KIND_WALL = "1";
