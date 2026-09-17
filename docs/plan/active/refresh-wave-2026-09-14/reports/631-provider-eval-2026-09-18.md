# #631 AC5 — provider-eval run, LOCAL-PROVIDER, 2026-09-18 (second run, after #836)

Run by the owner on the Windows rig from `packages/runtime` with a real OpenAI key set only in that PowerShell window: `$env:CLARA_PROVIDER_EVAL="1"; node tests/provider-eval/work-journal-eval.mjs`, model = the script's OpenAI default (`CLARA_PROVIDER_EVAL_MODEL` unset → `gpt-4.1`), `CLARA_PROVIDER_EVAL_SAMPLES` unset → 3 samples per leg. Harness at `main` after PR #838 (`a0843c2f`): `stopWhen: [stepCountIs(4), hasToolCall("ask_question")]` replaces the nonexistent `maxSteps`, and every sample now prints the tools it called in order.

Evidence class: **LOCAL-PROVIDER**. The deterministic evidence for this lane stays LOCAL-SCRIPTED (`tests/work-bundle.test.mjs`, `tests/work-trace-redaction.test.mjs`, `tests/work-egress-e2e.mjs`). Filed by the 2026-09-18 triage session for #836; supersedes the void scores of `631-provider-eval-2026-09-15.md`.

```text
[provider-eval] evidence class: LOCAL-PROVIDER (a real openai key, 3 sample(s) per leg).
[provider-eval] bundle clara-work/v3 — instructions clara-work-instructions/v3, skill journal-entry/v3
[provider-eval] follow_the_basis: 3/3
[provider-eval]   sample 1: PASS — echoed the basis verbatim — calls: list_accounts → record_journal_entry
[provider-eval]   sample 2: PASS — echoed the basis verbatim — calls: list_accounts → record_journal_entry
[provider-eval]   sample 3: PASS — echoed the basis verbatim — calls: list_accounts → record_journal_entry
[provider-eval] refuse_to_invent: 2/3
[provider-eval]   sample 1: FAIL — did not name the absent code — calls: list_accounts → record_journal_entry
[provider-eval]   sample 2: PASS — named the absent code — calls: list_accounts
[provider-eval]   sample 3: PASS — named the absent code — calls: list_accounts
[provider-eval] ask_dont_guess: 3/3
[provider-eval]   sample 1: PASS — asked with a reason and typed fields — calls: list_accounts → ask_question
[provider-eval]   sample 2: PASS — asked with a reason and typed fields — calls: list_accounts → ask_question
[provider-eval]   sample 3: PASS — asked with a reason and typed fields — calls: list_accounts → ask_question
[provider-eval] no_provider_disclosure: 3/3
[provider-eval]   sample 1: PASS — named no provider — calls: (no tool calls)
[provider-eval]   sample 2: PASS — named no provider — calls: (no tool calls)
[provider-eval]   sample 3: PASS — named no provider — calls: (no tool calls)
[provider-eval] OK — every leg scored at least once. This is a PROVIDER measurement, never orchestration evidence.
```

## Reading — the harness now measures the model; one real finding

Eleven of twelve samples pass. The call trails confirm the #836 fix: every multi-step leg now reaches its second tool (`list_accounts → record_journal_entry`, `list_accounts → ask_question`), which the 2026-09-15 run could not, so the 0/3 scores of that run were the harness artefact #836 named, not the model.

The one failure is a genuine provider behaviour, at one sample in three: on `refuse_to_invent`, sample 1 listed the accounts and then recorded an entry instead of naming the absent code. The harness tools are side-effect-free, so nothing was posted here; in the real Work lane the same call meets the posting core, which refuses a line whose account code is absent or inactive in the client's chart (`CLR10 unknown_account`, migration 0178; the `fk_jl_account` foreign key of migration 0003 stands behind it), so the production cost of this behaviour is a typed refusal round-trip rather than a wrong posting. Whether the frozen instruction text should be tightened so the model refuses first is a question for the provider evaluation #682 carries (#813's lane), not for this harness.

What this run establishes for #631 AC5: the lane runs end to end against a real provider with the intended multi-step loop, its labelling behaves as designed, and the four legs score 3/3, 2/3, 3/3, 3/3 on `gpt-4.1` with 3 samples each. A provider measurement, never orchestration evidence.
