# Crawl4AI website knowledge

The active receptionist in `../ai-receptionist/apps/voice-worker` delegates business
questions through `LobbyStackClient.askReceptionist` to this application's LiveKit
`respond` endpoint. This application's worker owns website ingestion. The older
standalone `ai-workers/ai-receptionist` crawler is not the active LobbyStack path.

## Runtime

- The worker selects Crawl4AI when `CRAWL4AI_BASE_URL` is set. A missing
  `CRAWL4AI_API_TOKEN` fails startup rather than silently starting paid crawls.
- Existing Firecrawl configurations remain supported when Crawl4AI is unset.
- Imports use authenticated asynchronous `/crawl/job` requests. Single-page imports
  fetch only that URL; full imports use same-site breadth-first discovery, at most
  12 levels and the requested page budget (maximum 10,000). `robots.txt` is enabled.
- Raw Markdown preserves headings, tables, contact links, and conditions. Navigation
  and footer elements are excluded; no LLM relevance filter removes source facts.
- Results retain the final URL (including query parameters), reject failed HTTP
  pages and off-site redirects, and deduplicate canonical URLs. Empty/failed/timed
  out jobs fail instead of being marked successfully indexed.
- Background indexing retains the existing revision/cancellation checks, business
  isolation, embedding fingerprint, pgvector storage, keyword search, reciprocal
  rank fusion, and evidence revision checks. No database migration or embedding
  model change is required.
- No crawl happens in the phone's question-answering path.

## Railway deployment

Target: existing `suncrest-lobbystack` project
`61fb9bb1-2ca6-4333-8c78-eafaf439f43a`, production environment. This is separate
from the newer project's `.railway/railway.ts` infrastructure ownership; do not
apply that full-project definition to this project.

Build the crawler from `docker/crawl4ai/Dockerfile`, using that directory as the
build context. It extends the digest-pinned upstream Crawl4AI 0.9.5 image. The
server's default 100-page/depth-5 limits are increased to match the application's
existing full-import budget. Only one crawler job executes at a time, with a
30-minute deadline and four browser-page slots. Its Redis queue is internal and
ephemeral; the application's durable outbox/BullMQ queue retries failed imports.

Crawler variables:

- `CRAWL4AI_API_TOKEN`: generated secret, held only in Railway.
- `CRAWL4AI_ALLOW_DEEP_CRAWL=true`
- `PORT=11235`

Worker variables:

- `CRAWL4AI_BASE_URL=http://crawl4ai.railway.internal:11235`
- `CRAWL4AI_API_TOKEN`: same secret as the crawler.
- `CRAWL4AI_MAX_PAGES=10000`
- `AI_EMBEDDING_API_KEY`: reference to the admin service's verified OpenAI key.
  The worker's older fallback OpenAI key was invalid; the embedding model,
  dimensions, endpoint, and fingerprint are unchanged.
- Optional `CRAWL4AI_EXCLUDE_PATHS`: comma-separated Crawl4AI globs, for example
  `*/news/*,*/events/*`. These are globs, **not** Firecrawl regular expressions.

Keep the crawler private; its API token is required even on the private network.
Use the upstream `/health` endpoint for liveness. The image includes upstream URL
validation and a guarded browser egress proxy; never enable request-supplied hooks
or disable those protections. No LLM key is required for crawling. Existing
embedding and answer-generation providers still have their normal usage costs.

## Rollback and limits

Remove the worker's `CRAWL4AI_BASE_URL` and `CRAWL4AI_API_TOKEN` and redeploy to
restore its existing Firecrawl configuration. Already indexed evidence stays in
PostgreSQL. Switching crawlers does not recrawl every customer's website or delete
stored knowledge.

Link discovery is bounded by site navigation, depth, page budget, robots rules,
and the job deadline; this is not a guarantee of exhaustive website coverage.
Sitemap-only orphan pages and linked external domains are not automatically
imported. Import an individual public URL when it is outside the discovered graph.
Large browser crawls need proportionate Railway memory; increase capacity based
on measured jobs rather than disabling crawl budgets.

This project uses Crawl4AI (https://github.com/unclecode/crawl4ai) for web data extraction.

## Validation — 6 November 2026

- Provider suite: 88 passing tests; worker suite: 100 passing tests.
- Focused knowledge search/reindex/crawl-limit and existing program-catalog
  regressions: 70 passing tests. Provider and worker typechecks passed; the
  worker and its workspace dependencies built successfully.
- Crawl4AI 0.9.5 health returned HTTP 200. An unauthenticated job request was
  rejected with HTTP 401.
- An isolated test business imported three live Shercom Industries pages through
  the actual worker handler: 85 chunks, all with completed 1,536-dimensional
  embeddings. Hybrid retrieval returned five source-linked passages; another
  business returned no passages. The isolated business was deleted afterward.
- Existing unrelated, uncommitted `programCatalog` changes were excluded from the
  uploaded release snapshot and remain untouched in the working tree.
- Deployed crawler: `70b3223d-f91c-4999-89d5-7df87bffaaa0`; worker:
  `a10957c0-b8d7-489c-8a49-3616fb82734e`. Both reached Railway `SUCCESS`.
- A job submitted through the deployed outbox/queue used the private crawler,
  completed a single-page import, and stored 23 completed embeddings. Hybrid
  retrieval returned six passages. Using the real business identity, the existing
  grounded-answer generator/verifier returned a supported answer: parking curbs
  measure 72 × 6 × 4 inches and weigh 30 lbs, citing the imported product page.
  A placeholder business name in the first fixture caused conservative refusals;
  no answer-verification rules were relaxed. The test business was removed.
- Temporary public crawler networking and the temporary database TCP proxy were
  removed after verification. Existing customer documents were not bulk-recrawled.
- Live phone audio and broad answer-quality/latency benchmarks were not tested.
