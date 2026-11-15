import { afterEach, describe, expect, it, vi } from "vitest";
import { Crawl4AIProvider } from "./crawl4ai";

vi.mock("./urlSafety", () => ({ assertPublicHttpUrl: async (value: string) => {
  const url = new URL(value);
  if (url.hostname === "127.0.0.1") throw new Error("public address required");
  return url;
} }));
afterEach(() => vi.unstubAllGlobals());
const page = (url = "https://example.com/") => ({ url, success: true, status_code: 200, metadata: { title: "Services" }, markdown: { raw_markdown: "## Prices\n| Service | Price |\n| Visit | $50 |\nConditions apply." } });
function responses(...payloads: unknown[]) {
  const fetcher = vi.fn();
  for (const payload of payloads) fetcher.mockResolvedValueOnce(new Response(JSON.stringify(payload)));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const provider = (extra: Partial<ConstructorParameters<typeof Crawl4AIProvider>[0]> = {}) => new Crawl4AIProvider({ baseUrl: "http://crawl4ai.railway.internal:11235", apiToken: "test-secret", pollIntervalMs: 0, ...extra });

describe("Crawl4AIProvider", () => {
  it("polls an authenticated bounded job and retains raw headings, tables and conditions", async () => {
    const fetcher = responses({ task_id: "crawl_123" }, { status: "processing" }, { status: "completed", result: { success: true, results: [page()] } });
    expect(await provider({ maxPages: 80, excludePaths: ["*/news/*"] }).crawl({ url: "https://example.com", limit: 10000 })).toEqual([{ url: "https://example.com/", title: "Services", markdown: page().markdown.raw_markdown }]);
    const request = fetcher.mock.calls[0]![1];
    expect(request.headers.authorization).toBe("Bearer test-secret");
    expect(request.redirect).toBe("error");
    expect(JSON.parse(request.body)).toMatchObject({ urls: ["https://example.com/"], crawler_config: { params: {
      cache_mode: "bypass", check_robots_txt: true, deep_crawl_strategy: { params: { max_pages: 80, include_external: false,
        filter_chain: { params: { filters: [{ params: { reverse: true, use_glob: true, patterns: expect.arrayContaining(["*/news/*"]) } }] } },
      } },
    } } });
    expect(fetcher.mock.calls[2]![0].toString()).toBe("http://crawl4ai.railway.internal:11235/crawl/job/crawl_123");
  });
  it("uses only the requested page for a single-page import", async () => {
    const fetcher = responses({ task_id: "one" }, { status: "completed", result: { success: true, results: [page()] } });
    await provider().crawl({ url: "https://example.com", limit: 1 });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).crawler_config.params.deep_crawl_strategy).toBeUndefined();
  });
  it("discards errors, empty pages and off-site redirects, retaining canonical query URLs", async () => {
    responses({ task_id: "job" }, { status: "completed", result: { success: true, results: [
      { ...page(), status_code: 404 }, { ...page(), success: false }, { ...page(), markdown: "" },
      { ...page(), redirected_url: "https://other.test/" },
      { ...page(), redirected_url: "https://www.example.com/product?catalog=ABC#details", markdown: "Course ABC" },
    ] } });
    expect(await provider().crawl({ url: "https://example.com" })).toEqual([{ url: "https://www.example.com/product?catalog=ABC", title: "Services", markdown: "Course ABC" }]);
  });
  it.each(["failed", "cancelled", "unexpected"])("rejects %s tasks rather than importing partial evidence", async status => {
    responses({ task_id: "job" }, { status });
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("failed at Crawl4AI");
  });
  it("does not follow a provider-supplied job URL", async () => {
    const fetcher = responses({ task_id: "https://attacker.test/job" });
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("valid job ID");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("fails closed for private websites, authentication errors and empty crawls", async () => {
    const fetcher = responses();
    await expect(provider().crawl({ url: "http://127.0.0.1" })).rejects.toThrow("public address");
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("status 401");
    responses({ task_id: "empty" }, { status: "completed", result: { success: true, results: [] } });
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("no readable content");
  });
  it("bounds the overall deadline and rejects invalid limits", async () => {
    const fetcher = responses();
    await expect(provider({ timeoutMs: 0 }).crawl({ url: "https://example.com" })).rejects.toThrow("timed out");
    await expect(provider({ maxPages: NaN }).crawl({ url: "https://example.com" })).rejects.toThrow("page limit");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it("uses the guarded PDF reader for published policy documents instead of browser downloads", async () => {
 const fetcher = responses({ task_id: "pdf" }, { status: "completed", result: { success: true, results: [{ ...page("https://example.com/policy.pdf"), markdown: "Refund conditions." }] } });
 await provider().crawl({ url: "https://example.com/policy.pdf", limit: 1 });
 expect(JSON.parse(fetcher.mock.calls[0]![1].body).crawler_config.params.scraping_strategy.type).toBe("PDFContentScrapingStrategy");
});
