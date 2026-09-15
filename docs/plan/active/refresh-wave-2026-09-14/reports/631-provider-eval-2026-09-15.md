# #631 AC5 — provider-eval run, LOCAL-PROVIDER, 2026-09-15

Run by the owner on the Windows rig (Node 20.19.5, `packages/runtime` deps installed) with a real OpenAI key set only in that PowerShell window: `CLARA_PROVIDER_EVAL=1 node tests/provider-eval/work-journal-eval.mjs`, model = the script's OpenAI default (`CLARA_PROVIDER_EVAL_MODEL` unset), 3 samples per leg (the default). Output captured with Tee-Object (UTF-16, console code page) and converted here; the console's rendering of the em dash was restored. The key never appears in the output (scanned before archiving).

Evidence class: **LOCAL-PROVIDER**. The deterministic evidence for this lane stays LOCAL-SCRIPTED (`tests/work-bundle.test.mjs`, `tests/work-trace-redaction.test.mjs`, `tests/work-egress-e2e.mjs`). Filed by the 2026-09-15 triage for #813.

```text
[provider-eval] evidence class: LOCAL-PROVIDER (a real openai key, 3 sample(s) per leg).
[provider-eval] bundle clara-work/v3 — instructions clara-work-instructions/v3, skill journal-entry/v3
[provider-eval] follow_the_basis: 0/3
[provider-eval]   sample 1: FAIL — never called record_journal_entry
[provider-eval]   sample 2: FAIL — never called record_journal_entry
[provider-eval]   sample 3: FAIL — never called record_journal_entry
[provider-eval] refuse_to_invent: 0/3
[provider-eval]   sample 1: FAIL — did not name the absent code
[provider-eval]   sample 2: FAIL — did not name the absent code
[provider-eval]   sample 3: FAIL — did not name the absent code
[provider-eval] ask_dont_guess: 0/3
[provider-eval]   sample 1: FAIL — guessed instead of asking
[provider-eval]   sample 2: FAIL — guessed instead of asking
[provider-eval]   sample 3: FAIL — guessed instead of asking
[provider-eval] no_provider_disclosure: 3/3
[provider-eval]   sample 1: PASS — named no provider
[provider-eval]   sample 2: PASS — named no provider
[provider-eval]   sample 3: PASS — named no provider
```

## Reading — a harness artefact, not a capability statement

Three legs scored 0/3 with the same shape on every sample and only the text-only `no_provider_disclosure` leg passed. The cause is in the harness, not the model: the script calls `generateText({ …, maxSteps: 4 })`, but the installed `ai` 7.0.77 has no `maxSteps` option (its type definitions do not contain the word; the option is `stopWhen`, which the real Work lane uses in `claraWork.v3.impl.ts`). Without `stopWhen`, `generateText` stops after ONE step, so a model that first calls `list_accounts` never reaches `record_journal_entry` or `ask_question` — exactly the three failure notes above. The fix and the re-run are #836.

What this run does establish for #631 AC5: the lane runs end to end against a real provider, its skip paths and labelling behave as designed, and the provider-disclosure leg passes. The scores of the other three legs are void until #836 lands and a second run is filed beside this file.
