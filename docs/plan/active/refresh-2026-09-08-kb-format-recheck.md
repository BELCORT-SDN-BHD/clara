# Knowledge-base format recheck

**Research date:** 2026-09-08 (Asia/Kuala Lumpur)  
**Scope:** Primary-source check of the LLM Wiki pattern, the canonical Open Knowledge Format (OKF), and Google's current reference implementation. This note makes no adoption decision.

## Corrections to the earlier research

- The gist is currently titled **“LLM Wiki.”** Its author and 2026-04-04 publication date are confirmed on Karpathy's own Gist page.
- OKF's canonical home is now [`GoogleCloudPlatform/open-knowledge-format`](https://github.com/GoogleCloudPlatform/open-knowledge-format). The old [`knowledge-catalog/okf` README](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/README.md) explicitly calls its copy a frozen snapshot and says to stop using it. Both copies happened to have the same `SPEC.md` blob on this check, but only the new repository is maintained.
- The current document version remains **0.2**. The repository has no Git tags or GitHub releases; `0.2` is the specification's version, not evidence of a tagged stable release. The checked head was [`ad30107c31c06aec8a7d5636e0d1058118604e6f`](https://github.com/GoogleCloudPlatform/open-knowledge-format/commit/ad30107c31c06aec8a7d5636e0d1058118604e6f), dated 2026-08-21.
- Current v0.2 requires every timestamp-valued field to be an ISO 8601 datetime with an explicit offset. Earlier date-only examples such as `stale_after: 2026-12-31` are superseded; use a value such as `2026-12-31T00:00:00Z`.

## Primary-source notes

### Karpathy: LLM Wiki

[Author Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), accessed 2026-09-08. It proposes three layers: immutable raw sources, an agent-maintained interlinked Markdown wiki, and a co-evolved `CLAUDE.md`/`AGENTS.md` schema for conventions and workflows. The named operations are ingest, query, and lint; `index.md` supports progressive discovery and `log.md` records activity. The stated experience is only moderate scale (about 100 sources and hundreds of pages), with local search suggested as an optional later addition. The note is intentionally abstract. It does not define a portable format, tenant isolation, authenticated provenance, access control, durable execution, or an accounting authority boundary.

### Google: canonical OKF v0.2

[Canonical specification](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md), accessed 2026-09-08. OKF is a directory of UTF-8 Markdown concepts with YAML frontmatter. A parseable frontmatter block and non-empty `type` are the substantive concept-level conformance floor; provenance, trust, lifecycle, `index.md`, and most other fields are optional. `sources` supports stable IDs, resource links, source metadata, and claim-level footnote joins. `generated` records production; `verified` records confirmation events; consumers derive unverified, machine-confirmed, or human-reviewed tiers. `status` describes lifecycle, and `stale_after` is an optional absolute datetime. Trust tiers are explicitly advisory rather than access control. The full runtime protocol and attester ABI, portability, and sandboxing remain deferred; the spec only anticipates the latter alongside future serving and Skills work.

### Google Cloud: format versus serving system

[The v0.1 announcement](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/), [v0.2 trust update](https://cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals/), and [Knowledge Catalog serving article](https://cloud.google.com/blog/products/data-analytics/scale-okf-bundles-across-an-organization-with-knowledge-catalog), accessed 2026-09-08. Google describes OKF as a format rather than a platform. Its later article assigns organization-wide search, discovery, ownership, lineage, and IAM to Knowledge Catalog. This confirms that an OKF bundle can carry trust signals without itself supplying storage governance or authorization. The July blog still links the old repository and uses date-only timestamp examples; the canonical repository and current spec control this recheck.

### Current reference agent and “skills”

[Reference-agent README](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/README.md), [`agent.py`](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/src/reference_agent/agent.py), [`cli.py`](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/src/reference_agent/cli.py), and [`bundle_tools.py`](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/src/reference_agent/tools/bundle_tools.py), accessed 2026-09-08. The proof-of-concept supports BigQuery ingestion, an optional bounded web-enrichment pass, and static visualization. It auto-records `generated`, prompts for `sources` and per-claim footnotes, and guards against shrinking existing BigQuery schemas or source lists. Its CLI exposes `enrich` and `visualize`, not lint or verification, and it has no authenticated workflow that grants `verified`. The bundled [BigQuery executor skill](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/bundles/acme_retail/skills/run-on-bq.md) is a Markdown procedure referenced by an attested-computation example; OKF does not provide the executor, permissions, or general skill runtime.

## Clara inference

**Inference, not an OKF requirement:** treat OKF as an import/export and compiled-view contract. Parsing a conformant bundle should only admit it to an untrusted staging boundary. Promotion into Clara's governed knowledge should separately verify tenant/client scope, source custody and hashes, actor identity, citation resolvability, verification recency relative to generation, lifecycle/freshness policy, and authorization. A conformant concept may legally omit every trust field, and a `human-reviewed` label is metadata unless Clara authenticates the actor and binds the review to the exact content version. Clara's database, private object storage, row-level controls, audited compiler, and versioned evaluator receipts therefore remain authoritative.

## Limits

The Gist REST endpoint returned a server error, so the delegated research lane checked its content through the author's HTML page and raw Gist URL. GitHub repository metadata and the complete canonical spec/source were checked directly. The root's separate Gist fetch failed; the root reviewed this note and independently opened the canonical OKF specification. No package was installed, reference agent or hosted knowledge runtime was run, or client data was transmitted. The research lane wrote only this note; its reference-agent findings are source inspection, not runtime verification.
