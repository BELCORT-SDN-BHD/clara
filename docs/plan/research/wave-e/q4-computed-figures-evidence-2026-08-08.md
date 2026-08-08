# Q4 evidence dossier — may the LLM compute financial figures? (2026-08-08)

> The Wave-E grill's Q4: the owner challenged the cardinal "the agent never computes a
> figure" line for report ratios ("LLMs are precise now; the raw numbers come from OCR/XML
> anyway") and ordered a three-lane evidence run: Anthropic docs · OpenAI docs + published
> arithmetic benchmarks · a Codex gpt-5.6-sol xhigh adversarial debate. The synthesis was
> presented 2026-08-08 and the owner RATIFIED the E-R4 law amendment and the E-R5 typed
> metric algebra (see `docs/plan/wave-e-contract.md`, ADR-065). This file preserves the
> three lanes' outputs as evidence of record. Claims below carry their authors' own
> confidence labels — several vendor-doc quotes are flagged secondary-corroborated rather
> than first-hand-fetched; treat labels as part of the evidence. Neither vendor states a
> blanket in-context arithmetic ban (Anthropic's line is explicitly threshold-based), no
> Clara-specific production error rate exists, and the "semantic errors will dominate"
> claim is the Codex paper's engineering judgment — the E-R4 ruling adopts it as a design
> premise, not a measured fact. *(Portability note: workstation-absolute repo links in
> the verbatim Codex section were rewritten repo-relative; content otherwise verbatim.)*

---

## Lane 1 — Anthropic's official position (Claude-native research agent, sonnet-5, as returned)

Evidence brief — Anthropic's official position on LLM arithmetic/computation vs. tool
delegation. Verbatim quotes with URLs, each labeled by evidence type.

**(a) WHAT ANTHROPIC SAYS OFFICIALLY**

1. **Code execution tool — explicit trigger criteria** (docs.claude.com → platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool):

> "Claude runs code when the request benefits from computation or file handling:
> - Non-trivial math (large numbers, many steps, precision-sensitive results)
> - Data analysis, file parsing, or visualization
> - Algorithm execution or simulation
> - Explicit requests to 'run', 'compute', or 'execute'
>
> Claude answers directly without running code for:
> - Simple arithmetic and well-known math facts
> - Factual, conversational, or creative requests
> - Simple unit conversions or translations
>
> If you want Claude to run code for a borderline request, ask explicitly (for example, 'run code to verify this')."

Proves: Anthropic draws an explicit, named line — "large numbers, many steps,
precision-sensitive results" is exactly the growth-rate/ratio/percentage territory — and
treats code execution as the correct venue once a calculation crosses that line. Does NOT
prove a blanket "never compute in-context" — "simple arithmetic" stays a direct-answer
case; the position is threshold-based, not absolute.

2. **Benchmark methodology — system cards report math scores BOTH with and without tool
access, and the gap is large** (secondary sources quoting the cards, cross-checked twice;
primary PDFs exceeded the fetch size cap — flagged lower-confidence): Claude Opus 4.5:
92.77% on MATH without tools vs 100% with Python tools (Opus 4.5 System Card, Nov 2025;
Anthropic itself raises a contamination caveat on the 100%). Claude Sonnet 4.5: 87% on
AIME 2025 without tools vs 100% with Python tools (Sonnet 4.5 System Card, Sep 2025).
Proves: Anthropic's own evaluation methodology treats raw model computation and
tool-assisted computation as distinct, separately-reported conditions, with a
7.23-point (Opus 4.5, MATH) to 13-point (Sonnet 4.5, AIME) gap on competition math.

3. **Hallucination guidance** (docs.claude.com/.../reduce-hallucinations): "For tasks
involving long documents (>20k tokens), ask Claude to extract word-for-word quotes first
before performing its task… Always validate critical information, especially for
high-stakes decisions." General factuality guidance, not numbers-specific; a
numbers-in-haystack transcription-fidelity claim was NOT FOUND at that specificity.

**(b) WHAT THE TOOLING DESIGN IMPLIES**

4. **Advanced Tool Use engineering blog** (anthropic.com/engineering/advanced-tool-use):
"Claude excels at writing code and by letting it express orchestration logic in Python
rather than through natural language tool invocations, you get more reliable, precise
control flow." The worked example contrasts an agent that "manually sums each person's
expenses…" against delegating the loop to Python.

5. **Agent design guidance** (bundled Anthropic tooling docs): replace "Inline lookup
tables, point systems, arithmetic rubrics the model must compute" with "Data in files or
tool results; arithmetic in code. Leave the model the judgment layer." A direct
architectural instruction.

**(c) NOT FOUND / UNKNOWN**

No blanket "never let the model compute a number" statement; no official raw-arithmetic
accuracy benchmark (published math numbers are reasoning-benchmark scores); no
numbers-specific long-context transcription claim; item 2's exact wording not verified
against the primary PDFs (fetch size cap) — if a figure goes into an ADR verbatim, pull
the PDF by page range first.

---

## Lane 2 — OpenAI docs + published benchmarks (Claude-native research agent, sonnet-5, as returned)

Labels: a = official vendor statement, b = peer-reviewed/benchmark, c = secondary-only.

**STRAND 1 — OpenAI's position**

(a) Code Interpreter / python tool (developers.openai.com/api/docs/guides/tools-code-interpreter,
verified live): lets the model "write and run Python code in a sandboxed environment to
solve complex problems in domains like data analysis, coding, and math," with an
iterate-until-it-runs loop. OpenAI's dedicated mechanism for offloading computation to a
deterministic interpreter. NOT FOUND: a verbatim sentence "the model should write code for
calculations rather than compute them itself" — the design intent is the strongest
evidence, not a literal quote.

(a/c) The prompt-engineering guide's "use external tools" strategy: convergent secondary
summaries agree OpenAI frames code execution as the reliable path for math; the live page
resisted extraction (client-side rendering) — corroborated, not first-hand-confirmed.

(c) Structured Outputs `strict: true` guarantees schema conformance (a field IS a number)
— never that the VALUE was computed correctly. Schema-valid ≠ arithmetically-correct.

(c) Model/system cards: PDFs unparseable via fetch; no card found stating a concrete
arithmetic error rate.

**STRAND 2 — Quantitative evidence**

(b) Dziri et al., "Faith and Fate: Limits of Transformers on Compositionality" (NeurIPS
2023, arXiv:2305.18654): GPT-4 zero-shot multiplication **59% at 3×3 digits, 4% at 4×4,
0% at 5×5**; attributes the cliff to pattern-matching rather than algorithm execution.

(b) "GPT Can Solve Mathematical Problems Without a Calculator" (arXiv:2309.03241) states
GPT-4 multi-digit multiplication baseline **4.3%** — not reconciled with the 59/4/0
breakdown (eval-dependent); both agree untooled multi-digit multiplication is unreliable.

(b) "Even GPT-5.2 Can't Count to Five: The Case for Zero-Error Horizons in Trustworthy
LLMs" (arXiv:2601.15714, Jan 2026): GPT-5.2 answers 127×82 = **10314** (correct: 10414) —
a single-digit slip; concludes scale pushes the failure point out but a hard zero-error
horizon persists in current frontier reasoning models.

(b) arXiv:2410.11781 ("Language Models Encode Numbers Using Digit Representations in Base
10"): LLM numeric errors are distributed per-digit — a wrong answer is not usually a
near-miss; it can be off by an arbitrary digit or magnitude.

(b) arXiv:2601.03640 (2026, verbatim transcription failures in code generation):
numeric/state-tracking accuracy degrades with context length; high-precision decimals are
"particularly problematic because they have low redundancy — if one digit is wrong, nearby
digits do not 'pull' the model back toward correctness." Adjacent (code-gen frame), the
closest sourced evidence for copy-with-altered-digit as a named failure mode.

(b) FinanceQA (arXiv:2501.18062): models "failing approximately 60% of realistic tasks"
on real-world-style financial analysis; the tool-use-vs-no-tool delta could not be
extracted (PDF unreadable) — treat as NOT FOUND.

(c) FinSheet-Bench (secondary only, unverified): strongest tested model reportedly drops
82.4% → 48.6% on complex financial spreadsheets — needs primary confirmation before
citing further.

**Net read:** no OpenAI document explicitly bans in-context arithmetic, but the entire
tool-design posture delegates computation to a deterministic interpreter, and the
independent benchmark literature (through Jan 2026) shows a hard, scale-resistant failure
boundary for raw multi-digit arithmetic, with financial-domain tasks failing at high rates.

---

## Lane 3 — the Codex gpt-5.6-sol adversarial position paper (direct `codex exec`, read-only, xhigh; verbatim below)

## 1. Steelman the owner seriously

The owner’s strongest argument is the one Claude understates: a fixed catalog cannot cover the long tail of legitimate management-accounting questions. Firms will invent client-specific KPIs, covenant ratios, operational percentages, and industry measures faster than engineers can deploy Postgres functions. A catalog-only product eventually drives accountants back to Excel, where Clara loses control and provenance altogether.

A frontier LLM can safely participate in the numeric path as:

- An extractor or independent reader of document values—provided its output remains a claim until corroborated.
- The translator from natural-language intent into a proposed formula, period, account population, and treatment of exceptions.
- The author of a typed calculation specification or executable program.
- An independent checker that recalculates or challenges a deterministic result.
- A scratch calculator for clearly non-authoritative conversation, provided any number entering a durable artifact is independently recomputed.
- The narrator of results, preferably through numeric placeholders populated from the validated artifact rather than by asking the model to retype figures.

What it should not be is the sole arithmetic authority.

There is no credible published SLA for “GPT‑5.6 or current Claude computes arbitrary percentages correctly from Clara-sized contexts.” Anyone supplying a single confident percentage is bluffing. The closest evidence is workload-dependent:

- A 2025 controlled study instructed GPT‑4o to answer directly without intermediate work. Exact accuracy for multiplying two numbers fell from 76.6% at three digits to 21.5% at four digits and 4.1% at five digits. That is an older model and an intentionally bare prompting regime, but it demonstrates that fluent output is not an arithmetic algorithm. [ACL paper, Table 9](https://aclanthology.org/2025.findings-acl.3.pdf)
- A newer frontier-model study sampled numbers across a very wide range and reported GPT‑5 at maximal reasoning achieving 97.8% exact-match multiplication and 91.4% division, versus 14.2% and 6.6% at minimal reasoning. It also found frontier models sometimes spent 5,000–30,000 reasoning tokens on one calculation. These are not Clara forecasts—the inputs are much harsher than ordinary ratios—but they destroy the claim that raw arithmetic is reliably solved merely by setting temperature to zero. [Efficient numeracy study](https://arxiv.org/abs/2510.06824)
- For long-context financial work, the failure rate is much worse because retrieval and accounting semantics join the arithmetic. In the 2026 FinIndices benchmark over uncropped statements up to 32K tokens, a leading proprietary model scored about 70% on table tasks with formula hints and 38% without; Claude Opus 4.8 scored 38.85% without hints. This is not an arithmetic-only test—it is evidence that the real problem is selecting the right periods, definitions, and inputs under structural pressure. [FinIndices paper](https://arxiv.org/abs/2607.28661)

Percentage calculation is division, multiplication by 100, and rounding. Isolated, explicit ratios with modest operands should perform far better than the harsh benchmarks above. But there is no published basis for treating them as 100.000% reliable across long reports.

OpenAI’s own current guidance is revealing. The GPT‑5.6 Code Interpreter example explicitly instructs the model to use Python for math; OpenAI describes the tool as combining model reasoning with deterministic code execution, “especially when there are numbers involved.” [OpenAI Code Interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter), [OpenAI agent-building guidance](https://developers.openai.com/tracks/building-agents#code-interpreter). Anthropic similarly offers sandboxed Python specifically for financial modelling and complex financial metrics. [Anthropic code-execution announcement](https://www.anthropic.com/news/agent-capabilities-api)

That does not prove LLMs cannot calculate. It proves that the impressive 2026 “agent” is a model-plus-tools system. The owner is right about the capability of the whole agent, but is conflating that with the reliability of unaided token generation.

Code Interpreter is not itself Clara’s answer: a model can write the wrong code, select the wrong operands, or mishandle units; OpenAI also describes its containers as ephemeral. Clara should use its own decimal evaluator and durable database artifacts, not a vendor Python session, for authoritative figures.

## 2. Attack Claude’s middle path

Claude’s proposal is directionally safer than direct model arithmetic, but it has serious defects.

First, Route A is a scalability trap if “one metric” means “one hand-written Postgres function.” Every variant creates code-review, migration, testing, documentation, and effective-dating work. “Debtor days” alone has choices over average versus closing receivables, gross versus net balances, credit versus total sales, 365 versus actual period days, SST inclusion, and period length. The catalog either explodes or conceals assumptions.

Second, “the LLM composes catalog items freely” is not automatically safe. It can combine individually correct measures across incompatible periods, currencies, scopes, or accounting bases. Deterministic execution of a semantically invalid composition gives a precisely wrong answer.

Third, arbitrary model-authored SQL is the wrong governed lane:

- SQL validation can reject dangerous syntax; it cannot prove accounting correctness.
- Approved read functions do not prevent double-counting through bad joins, mixing point-in-time and flow measures, or aggregating already-aggregated values.
- SQL introduces RLS, query-cost, denial-of-service, volatile-function, cast, `NULL`, division-by-zero, rounding, and join-cardinality concerns.
- Reviewing SQL is hostile to the accountant who carries the liability. Human sign-off becomes ceremonial if the reviewer cannot see the formula and sample workings in accounting language.
- A sufficiently strong SQL validator is effectively a programming-language implementation anyway. Clara should admit that and design the language deliberately.

Fourth, “formula + inputs + data version” is inadequate provenance. A data-version token does not reproduce an old answer unless Clara can replay that version. The artifact needs the normalized formula, account-set and presentation-map versions, exact period IDs, input values and source references, evaluator and rounding versions, books watermark, result before and after rounding, and approval identity.

Fifth, “later” is dangerous. Flexible reporting is already the user requirement. Shipping catalog-only now will establish rigid APIs and encourage shadow calculations in Excel before the governed lane arrives.

Finally, Claude’s maxim is worded too theatrically. The LLM already makes the consequential calculation decision when it chooses “average trade receivables divided by credit sales.” Moving only the final division to SQL does not make the model harmless. Arithmetic determinism solves one narrow failure class; it does not validate accounting meaning.

The correct distinction is not “did an LLM ever perform arithmetic?” It is: **Can an unverified model-generated numeral become authoritative?**

## 3. The counterfactual: direct LLM ratios at 10,000 cells/year

Suppose Clara supplies the correct operands and explicit formula, disables tools, uses temperature zero, and asks the model to calculate each result. Even tiny failure probabilities become operationally material:

| Exact cell accuracy | Expected wrong cells per 10,000 |
|---:|---:|
| 99.99% | 1 |
| 99.9% | 10 |
| 99.5% | 50 |
| 99.0% | 100 |
| 97.8% | 220 |
| 91.4% | 860 |

The last two rows illustrate published benchmark rates, not a forecast for Clara. For isolated, ordinary ratios on a high-reasoning frontier model, my engineering prior would be roughly **0.1%–1% raw arithmetic failure until Clara’s own eval proves otherwise**: perhaps 10–100 wrong cells per year. Claiming a lower production rate without testing the exact model, prompt, number shapes, context lengths, and rounding rules would be salesmanship.

Temperature zero does not fix correctness. It can make a wrong answer repeatable, and OpenAI describes seeded determinism only as best-effort, not guaranteed. [OpenAI API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)

Arithmetic is probably not the dominant failure class. These are worse:

- **Period selection:** month, quarter, YTD, comparative FY, trailing twelve months, pre- or post-restatement.
- **Definition selection:** growth versus CAGR; percentage change versus percentage-point change.
- **Population selection:** trade debtors only or all receivables; credit sales or total revenue; continuing operations or total entity.
- **Stock/flow mismatch:** closing receivables divided by annual sales versus average receivables.
- **Sign conventions:** revenue stored as credits; liabilities presented positive despite negative ledger signs.
- **Classification drift:** three staff map “gross margin” to three different account sets.
- **Zero and negative denominators:** prior-year zero, negative equity, credit balances in debtors.
- **Units and currencies:** cents versus ringgit, days versus months, native currency versus translated values.
- **Rounding:** ratio of rounded displayed totals versus ratio of exact underlying values.
- **Source completeness:** correct OCR values do not imply that accruals, depreciation, stock adjustments, credit notes, or cut-off entries are complete.

The owner’s “numbers come from raw documents” premise is therefore incomplete. Gross margin does not come from an invoice. It comes from accounting classifications, cut-off, stock treatment, adjustments, and a definition of revenue and cost of sales. Two OCR readers can agree perfectly on RM10,000 and still place it in the wrong period or metric population.

In production, semantic and scope errors will dominate arithmetic errors. They are also correlated: one defective definition can generate hundreds of consistently wrong cells. An independence-based error calculation therefore understates the danger.

## 4. Auditability and professional liability

The architectures answer “Where did this 12.3% come from?” very differently:

| Architecture | Defensible answer | One-year reproducibility |
|---|---|---|
| Direct LLM arithmetic | “This model, prompt, and context emitted 12.3%.” The stored output proves what happened, not that the derivation was correct. | Weak. Temperature zero is not guaranteed replay; model deployments and surrounding context can change. |
| Named metric catalog | “Gross margin v3 used these account groups and periods; numerator X divided by denominator Y under rounding rule Z.” | Strong if inputs or a replayable books version are retained. |
| Model-authored SQL | “This SQL produced it against this database version.” | Technically replayable if fully snapshotted, but opaque to many reviewers and vulnerable to semantic SQL errors. |
| Typed formula specification | “This approved formula used these exact cells, account populations, periods, and rounding rules; here are the numerator and denominator.” | Strongest combination of intelligibility, replayability, and flexibility. |

Clara must preserve two different notions of reproduction:

- **As issued:** reproduce exactly the values and workings that existed when the report was signed.
- **As restated now:** run the same definition against today’s corrected books and create a new, clearly related artifact.

A books-version token alone cannot provide the first unless old values are queryable. Preserve the exact input facts or support event-sequence/bitemporal replay.

This matters in Malaysia beyond abstract “AI safety.” The Companies Act 2016 defines accounting records to include working papers and documents necessary to explain the methods and calculations by which accounts are prepared. Section 245 requires records sufficient to explain transactions and financial position, capable of proper audit, and retained for seven years. [SSM Companies Act, definition](https://www.ssm.com.my/acts/aktaBI_20160915_CompaniesAct2016Act777.pdf), [section 245](https://www.ssm.com.my/acts/aktaBI_20160915_CompaniesAct2016Act777.pdf#page=249). LHDN’s published section 82 materials likewise require sufficient business records to be retained for seven years. [LHDN section 82](https://phl.hasil.gov.my/pdf/pdfam/3687.pdf)

MIA’s professional rules require competence, due care, diligence, and appropriate supervision. They do not prescribe a database architecture, but “the model seemed extremely precise” is not persuasive evidence of due care. [MIA By-Laws](https://mia.org.my/storage/2025/07/By-Laws-updated-Feb-2025-Effective-1-July-2025.pdf)

This is also exactly the boundary the prior Clara build violated: it could launder model-authored figures into branded artifacts and describe SQL literals as database-computed. [Gate‑1 pattern 9](../../../audit/00-GATE-1-README.md:59) The present [PRD law](../../../prd/PRD.md:123) is a rational response to that evidence, not superstition.

## 5. Verdict

I would ship neither catalog-only Route A nor arbitrary-SQL Route B. I would ship a **typed metric algebra in Wave E now**, with the catalog implemented as approved definitions in that algebra.

The design:

- Keep a canonical catalog for gross margin, growth, current ratio, debtor days, and other common measures. Each definition is named, versioned, effective-dated, tested, and explained in plain accounting language.
- Add a governed ad-hoc lane immediately. The LLM authors a declarative formula tree—not SQL—using approved primitives such as `measure`, `sum`, `average`, `lag`, `subtract`, `divide`, `days_in_period`, and `percent_change`.
- Give every value a type and scope: currency, count, days, ratio, point-in-time versus flow, entity, period, currency, and accounting basis. Reject incompatible compositions mechanically.
- Execute the normalized specification inside Clara’s trusted data plane using exact decimal arithmetic. Define division-by-zero, negative-denominator, missing-data, sign-normalization, and rounding policies explicitly.
- Let the validator prove syntax, types, scope compatibility, cost bounds, and provenance completeness. Do not pretend it proves that a novel accounting definition is appropriate.
- Show the accountant the formula, assumptions, numerator, denominator, sample result, and alternatives. Novel definitions remain drafts until human approval; firm-approved definitions can then be reused. Canonical definitions need no per-run formula approval.
- Restrict statutory or externally issued reports to canonical or explicitly firm-approved definitions. One-off management analysis can be more permissive but must remain labelled.
- Render model prose using metric placeholders populated from the artifact. Reject or flag unsourced numerals in narrative text.
- Store, per cell: definition/version or normalized formula hash, periods, account-set and presentation-map versions, input values and entry/document references, books watermark, evaluator and renderer versions, exact result, displayed rounding, model proposal, human approval, and supersession links.
- Test with golden accountant examples, zero/negative cases, period and sign traps, dimensional property tests, and a Clara-specific eval across at least thousands of generated cells before assigning an error rate.

I would amend—not discard—the cardinal law:

> **The DB owns every authoritative number. The LLM may propose or independently check a calculation, but no model-generated numeral enters a durable report unless a versioned deterministic evaluator reproduces it from DB-owned inputs.**

That wording concedes what the owner gets right: the model is capable of inventing useful formulas, handling the long tail, and even doing arithmetic as part of its reasoning. It preserves what Claude gets right: professional reports cannot depend on unaided probabilistic arithmetic. The owner’s flexibility instinct should be served through an expressive, governed formula language—not through hundreds of hardcoded functions and not through a stochastic calculator.

**Plain-language summary:** Let Clara understand whatever ratio you ask for and propose the formula, just as a capable junior accountant would. But before 12.3% appears in a report you sign, Clara must show the formula, the exact numerator and denominator, the periods and accounts used, and a database calculation that can be rerun years later. The AI may think and check; it must not be the only calculator or the only witness.
