# classify recall — fixtures

**H-04.** What the recall harness (`packages/runtime/scripts/measure-classify-recall.mjs`) reads.

| file | what it is |
|---|---|
| `manifest.example.json` | the SHAPE of a labelled manifest, with placeholder ids. Never a real corpus. |
| `baseline-prompt-2026-09-04.txt` | the classifier system prompt as it stood on `main` before this PR sharpened it, captured verbatim so `replay` can measure a before/after on identical input. |

## The corpus is OFF-REPO and stays there

Real client payloads never enter the repo or CI — the F-A1 precedent
(`docs/plan/completed/f-a1-corpus-measurement.md`) is explicit about it. The inventory of what
exists, and where, is `docs/plan/completed/corpus-manifest-2026-09-04.md`: four desktop folders,
their counts, what each holds, and the three 资料缺失 marks. **This directory records the
SHAPE of a manifest, never its contents.**

## Writing the real manifest

The harness's `live` mode reads each document's PERSISTED OCR layout text — the same substrate
`packages/runtime/lib/classify.mjs` feeds the model. It never re-OCRs, because a measurement
that re-OCRs is measuring OCR too. So a manifest row addresses a document that has already been
ingested: `document_id`, `firm_id`, `expected_kind`, and an optional human `name`.

```sh
# fixtures (default): no model, no DB, no corpus — proves the harness's own arithmetic
node packages/runtime/scripts/measure-classify-recall.mjs

# live: the real model over real persisted OCR text
node packages/runtime/scripts/measure-classify-recall.mjs live --manifest ./my-manifest.json

# replay: the baseline prompt and the current one, over ONE input set
node packages/runtime/scripts/measure-classify-recall.mjs replay --manifest ./my-manifest.json
```

`expected_kind` must be a member of `CLASSIFY_KINDS`; the reader refuses a manifest that labels
anything else, refuses one with missing ids, and reports "fixture absent" rather than inventing
rows when the file is not there.

## What the numbers mean

Two recall figures per kind, and the gap between them is the finding:

- **`recall_at_gate`** — correct AND confidence ≥ 0.8. This is the headline, because it is the
  gate `clara.classify_document` actually applies: a correct kind at 0.4 sets nothing and opens
  a human review question instead.
- **`recall_any`** — correct at any confidence. A large gap means the model KNOWS but is
  under-confident, which is a calibration repair, not a definition repair.

**The recall floor for "done" is the owner's to set.** This harness reports what it measured and
nothing else.
