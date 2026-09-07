# Classifier recall fixtures

[measure-classify-recall.mjs](../../../scripts/measure-classify-recall.mjs) measures the document
classifier against labeled, persisted OCR text. It does not re-OCR documents.

| File | Purpose |
|---|---|
| `manifest.example.json` | Manifest shape with placeholder identities |
| `baseline-prompt-2026-09-04.txt` | Fixed baseline prompt for before/after replay |

Real client documents and labeled manifests stay outside the repository. A manifest row identifies
an already-ingested `document_id`, its `firm_id`, an `expected_kind` from `CLASSIFY_KINDS`,
and an optional human-readable name.

Run from the repository root:

```sh
node packages/runtime/scripts/measure-classify-recall.mjs
node packages/runtime/scripts/measure-classify-recall.mjs live --manifest /private/manifest.json
node packages/runtime/scripts/measure-classify-recall.mjs replay --manifest /private/manifest.json
```

The default mode uses a stub model and proves only the scorer's arithmetic.
Live/replay require the connection environment and model credentials; their model calls send
document text to the configured provider. Use the appropriately authorized corpus.
Run from the source checkout: the deployed image currently lacks dependencies/fixtures needed by
the script's live/replay path.

`recall_at_gate` counts correct predictions at confidence >= 0.8; `recall_any` includes correct
predictions below that threshold. The 0.8 value is the database's per-row classification gate,
not an overall quality target.

The approved comparison gate is per-kind non-regression against the baseline and no newly
confident-wrong row that the baseline got right. No absolute recall floor has been chosen.
Print model/prompt provenance with results. A passing replay does not verify dispatcher ordering:
classification must also be tested when its task appears before OCR finishes.