import { Crawl4AIProvider } from "@lobbystack/providers/crawling/crawl4ai";
import { FirecrawlProvider } from "@lobbystack/providers/crawling/firecrawl";

export function createCrawlerProvider(env: NodeJS.ProcessEnv = process.env): Crawl4AIProvider | FirecrawlProvider | undefined {
  if (env.CRAWL4AI_BASE_URL) {
    if (!env.CRAWL4AI_API_TOKEN) throw new Error("CRAWL4AI_API_TOKEN is required when Crawl4AI is configured.");
    return new Crawl4AIProvider({ baseUrl: env.CRAWL4AI_BASE_URL, apiToken: env.CRAWL4AI_API_TOKEN,
      ...(env.CRAWL4AI_MAX_PAGES ? { maxPages: Number(env.CRAWL4AI_MAX_PAGES) } : {}),
      ...(env.CRAWL4AI_EXCLUDE_PATHS ? { excludePaths: env.CRAWL4AI_EXCLUDE_PATHS.split(",").filter(Boolean) } : {}),
    });
  }
  // Retain existing installations and saved imports until explicitly switched.
  return env.FIRECRAWL_API_KEY ? new FirecrawlProvider({ apiKey: env.FIRECRAWL_API_KEY,
    pauseNewCrawls: env.FIRECRAWL_PAUSE_NEW_CRAWLS === "true",
    ...(env.FIRECRAWL_SAVED_BATCH_ID ? { savedBatchIds: env.FIRECRAWL_SAVED_BATCH_ID.split(",").filter(Boolean) } : {}),
    ...(env.FIRECRAWL_SAVED_CRAWL_URL ? { savedCrawlUrl: env.FIRECRAWL_SAVED_CRAWL_URL, ...(env.FIRECRAWL_SAVED_CRAWL_ID ? { savedCrawlId: env.FIRECRAWL_SAVED_CRAWL_ID } : {}) } : {}),
    ...(env.FIRECRAWL_MAX_PAGES && Number.isFinite(Number(env.FIRECRAWL_MAX_PAGES)) ? { maxPages: Number(env.FIRECRAWL_MAX_PAGES) } : {}),
    ...(env.FIRECRAWL_EXCLUDE_PATHS ? { excludePaths: env.FIRECRAWL_EXCLUDE_PATHS.split(",").filter(Boolean) } : {}),
    ...(env.FIRECRAWL_BASE_URL ? { baseUrl: env.FIRECRAWL_BASE_URL } : {}),
  }) : undefined;
}
