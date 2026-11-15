import { setTimeout as sleep } from "node:timers/promises";
import type { CrawlPage } from "./firecrawl";
import { assertPublicHttpUrl } from "./urlSafety";

type Page = {
  url: string; redirected_url?: string; success?: boolean; status_code?: number;
  metadata?: { title?: string }; markdown?: string | { raw_markdown?: string };
};
type CrawlResult = { success?: boolean; results?: Page[] };
type Task = { task_id?: string; status?: string; result?: CrawlResult };

/** Self-hosted Crawl4AI jobs run outside calls; only extracted evidence reaches the agent. */
export class Crawl4AIProvider {
  readonly name = "crawl4ai";
  constructor(private readonly config: { baseUrl: string; apiToken: string; maxPages?: number; excludePaths?: string[]; timeoutMs?: number; pollIntervalMs?: number }) {
    const endpoint = new URL(config.baseUrl);
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || !config.apiToken.trim()) throw new Error("Crawl4AI requires an HTTP endpoint and API token.");
  }

  async crawl(input: { url: string; limit?: number }): Promise<CrawlPage[]> {
    const seed = await assertPublicHttpUrl(input.url);
    const requestedLimit = input.limit ?? 50;
    const maximum = this.config.maxPages ?? 10000;
    if (!Number.isFinite(requestedLimit) || !Number.isFinite(maximum)) throw new Error("Invalid website crawl page limit.");
    const limit = Math.max(1, Math.min(10000, Math.floor(requestedLimit), Math.floor(maximum)));
    const deadline = Date.now() + (this.config.timeoutMs ?? 30 * 60_000);
    const request = async <T>(path: string, body?: object): Promise<T> => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Website crawl timed out before completion.");
      const response = await fetch(new URL(path, this.config.baseUrl), {
        method: body ? "POST" : "GET", redirect: "error",
        headers: { authorization: `Bearer ${this.config.apiToken}`, ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(Math.min(30_000, remaining)),
      });
      if (!response.ok) throw new Error(`Crawl4AI request failed with status ${response.status}.`);
      return await response.json() as T;
    };
    const excluded = ["*.xml", "*.css", "*.js", "*.png", "*.jpg", "*.jpeg", "*.gif", "*.svg", "*.webp", "*.zip", "*.mp4", "*.mp3", ...(this.config.excludePaths ?? [])];
    const params = {
      cache_mode: "bypass", check_robots_txt: true, page_timeout: 30000,
      ...(/\.pdf(?:[?#]|$)/i.test(seed.toString()) ? { scraping_strategy: { type: "PDFContentScrapingStrategy", params: {} } } : {}),
      // Keep headings, tables and conditions; no LLM or relevance-based pruning.
      excluded_tags: ["nav", "footer"], remove_overlay_elements: true,
      ...(limit > 1 ? { deep_crawl_strategy: { type: "BFSDeepCrawlStrategy", params: {
        max_depth: 12, max_pages: limit, include_external: false,
        filter_chain: { type: "FilterChain", params: { filters: [
          { type: "URLPatternFilter", params: { patterns: excluded, use_glob: true, reverse: true } },
        ] } },
      } } } : {}),
    };
    const started = await request<Task>("/crawl/job", { urls: [seed.toString()], crawler_config: { type: "CrawlerRunConfig", params } });
    if (!started.task_id || !/^[a-zA-Z0-9_-]+$/.test(started.task_id)) throw new Error("Crawl4AI did not return a valid job ID.");
    let task: Task;
    for (;;) {
      task = await request<Task>(`/crawl/job/${encodeURIComponent(started.task_id)}`);
      if (task.status === "completed") break;
      if (!["processing", "pending", "queued"].includes(task.status ?? "")) throw new Error("Website crawl failed at Crawl4AI.");
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Website crawl timed out before completion.");
      await sleep(Math.min(this.config.pollIntervalMs ?? 2000, remaining));
    }
    if (task.result?.success !== true || !Array.isArray(task.result.results)) throw new Error("Crawl4AI returned an unsuccessful result.");
    const pages = new Map<string, CrawlPage>();
    for (const page of task.result.results) {
      if (!page.success || (page.status_code !== undefined && (page.status_code < 200 || page.status_code >= 300))) continue;
      const source = await assertPublicHttpUrl(page.redirected_url || page.url);
      // Redirected third-party content must never become this business's knowledge.
      if (source.hostname.replace(/^www\./, "") !== seed.hostname.replace(/^www\./, "")) continue;
      source.hash = "";
      const markdown = typeof page.markdown === "string" ? page.markdown : page.markdown?.raw_markdown;
      if (!markdown?.trim()) continue;
      pages.set(source.toString(), { url: source.toString(), ...(page.metadata?.title ? { title: page.metadata.title } : {}), markdown });
      if (pages.size >= limit) break;
    }
    if (!pages.size) throw new Error("Website crawl returned no readable content.");
    return [...pages.values()];
  }
}
