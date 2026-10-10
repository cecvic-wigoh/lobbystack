import { afterEach, describe, expect, it, vi } from "vitest";
import { FirecrawlProvider } from "./firecrawl";

vi.mock("./urlSafety", () => ({ assertPublicHttpUrl: async (url: string) => new URL(url) }));

afterEach(() => vi.unstubAllGlobals());

function responses(...payloads: unknown[]) {
  const fetcher = vi.fn();
  for (const payload of payloads) fetcher.mockResolvedValueOnce(new Response(JSON.stringify(payload)));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const provider = () => new FirecrawlProvider({ apiKey: "test-key", pollIntervalMs: 0 });
const page = (url: string) => ({ metadata: { sourceURL: url, title: "Page" }, markdown: "Content" });

describe("FirecrawlProvider", () => {
  it.each([1000, 10000])("sizes a full import of %i pages from the site map and excludes XML from the crawl budget", async limit => {
    const fetcher = responses({ links: ["https://example.com/", "https://example.com/about", "https://example.com/sitemap.xml", "https://other.test/"] }, { id: "job" }, { status: "completed", data: [page("https://example.com/")] });
    await provider().crawl({ url: "https://example.com", limit });
    expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toMatchObject({ limit: 3, allowExternalLinks: false, ignoreQueryParameters: false, excludePaths: [".*\\.xml$"] });
  });
  it("honors the configured page limit and priority exclusions", async () => {
    const fetcher = responses({ id: "job" }, { status: "completed", data: [page("https://example.com/")] });
    await new FirecrawlProvider({ apiKey: "test", maxPages: 800, excludePaths: ["^/news/"], pollIntervalMs: 0 }).crawl({ url: "https://example.com", limit: 10000 });
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toMatchObject({ limit: 800, excludePaths: [".*\\.xml$", "^/news/"] });
  });
  it("imports an existing stopped crawl only for its configured website without another paid crawl", async () => {
    const fetcher = responses({ status: "cancelled", data: [page("https://example.com/")] });
    const pages = await new FirecrawlProvider({ apiKey: "test", savedCrawlId: "saved", savedCrawlUrl: "https://example.com/" }).crawl({ url: "https://example.com", limit: 800 });
    expect(pages).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.firecrawl.dev/v1/crawl/saved");
    expect(fetcher.mock.calls[0]?.[1].method).toBe("GET");
  });
  it("replays a saved batch while paid crawls stay paused, including guarded pagination", async () => {
    const fetcher = responses(
      { status: "completed", data: [page("https://example.com/a")], next: "https://api.firecrawl.dev/v2/batch/scrape/batch?skip=1" },
      { status: "completed", data: [page("https://example.com/b")] },
    );
    expect(await new FirecrawlProvider({ apiKey: "test", savedBatchIds: ["batch"], savedCrawlUrl: "https://example.com/", pauseNewCrawls: true }).crawl({ url: "https://example.com", limit: 10000 })).toHaveLength(2);
    expect(fetcher.mock.calls.every(call => call[1].method === "GET")).toBe(true);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.firecrawl.dev/v2/batch/scrape/batch");
  });
  it("collects multiple saved batches without a new paid request", async () => {
    const fetcher = responses({ status: "completed", data: [page("https://example.com/a")] }, { status: "completed", data: [page("https://example.com/b")] });
    expect(await new FirecrawlProvider({ apiKey: "test", savedBatchIds: ["one", "two"], savedCrawlUrl: "https://example.com/", pauseNewCrawls: true }).crawl({ url: "https://example.com", limit: 10000 })).toHaveLength(2);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["https://api.firecrawl.dev/v2/batch/scrape/one", "https://api.firecrawl.dev/v2/batch/scrape/two"]);
    expect(fetcher.mock.calls.every(call => call[1].method === "GET")).toBe(true);
  });
  it("preserves raw PDF bytes from a saved batch for our document reader", async () => {
    responses({ status: "completed", data: [{ metadata: { sourceURL: "https://example.com/report.pdf" }, rawBase64: "JVBERi0=" }] });
    expect(await new FirecrawlProvider({ apiKey: "test", savedBatchIds: ["batch"], savedCrawlUrl: "https://example.com/", pauseNewCrawls: true }).crawl({ url: "https://example.com" })).toEqual([{ url: "https://example.com/report.pdf", rawBase64: "JVBERi0=" }]);
  });
  it("does not index a dead link's HTML error page as published business evidence", async () => {
    responses({ status: "completed", data: [{ metadata: { sourceURL: "https://example.com/missing", statusCode: 404 }, markdown: "Not found. Generic homepage and navigation." }, { ...page("https://example.com/live"), metadata: { sourceURL: "https://example.com/live", statusCode: 200 } }] });
    expect(await new FirecrawlProvider({ apiKey: "test", savedBatchIds: ["batch"], savedCrawlUrl: "https://example.com/", pauseNewCrawls: true }).crawl({ url: "https://example.com" })).toEqual([{ url: "https://example.com/live", markdown: "Content" }]);
  });
  it("does not replay a saved batch for another tenant website while paused", async () => {
    const fetcher = responses();
    await expect(new FirecrawlProvider({ apiKey: "test", savedBatchIds: ["batch"], savedCrawlUrl: "https://example.com/", pauseNewCrawls: true }).crawl({ url: "https://other.test" })).rejects.toThrow("paused");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not replay saved content for a different website", async () => {
    const fetcher = responses({ id: "fresh" }, { status: "completed", data: [page("https://other.test/")] });
    await new FirecrawlProvider({ apiKey: "test", savedCrawlId: "saved", savedCrawlUrl: "https://example.com/" }).crawl({ url: "https://other.test", limit: 2 });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.firecrawl.dev/v1/crawl");
    expect(fetcher.mock.calls[0]?.[1].method).toBe("POST");
  });
  it("makes no provider request while new paid crawls are paused", async () => {
    const fetcher = responses();
    await expect(new FirecrawlProvider({ apiKey: "test", pauseNewCrawls: true }).crawl({ url: "https://example.com", limit: 2 })).rejects.toThrow("paused");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("waits for completion and collects paginated results", async () => {
    const fetcher = responses(
      { success: true, id: "job" },
      { status: "scraping", data: [] },
      { status: "completed", data: [page("https://example.com/")], next: "https://api.firecrawl.dev/v1/crawl/job?skip=1" },
      { status: "completed", data: [page("https://example.com/about")] },
    );
    expect(await provider().crawl({ url: "https://example.com" })).toEqual([
      { url: "https://example.com/", title: "Page", markdown: "Content" },
      { url: "https://example.com/about", title: "Page", markdown: "Content" },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[0]?.[1].method).toBe("POST");
    expect(fetcher.mock.calls[1]?.[1].method).toBe("GET");
  });

  it("scrapes the requested page directly for a single-page import", async () => {
    const fetcher = responses({ success: true, data: page("https://example.com/contact") });
    expect(await provider().crawl({ url: "https://example.com/contact", limit: 1 })).toEqual([{ url: "https://example.com/contact", title: "Page", markdown: "Content" }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.firecrawl.dev/v1/scrape");
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toMatchObject({ url: "https://example.com/contact", formats: ["markdown"] });
  });

  it.each(["failed", "cancelled", "canceled"])("rejects a %s job", async (status) => {
    responses({ id: "job" }, { status });
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("crawling provider");
  });

  it.each(["https://attacker.example/", "https://api.firecrawl.dev/v1/crawl/other", "https://api.firecrawl.dev/v1/crawl/job"])("rejects unsafe or cyclic pagination: %s", async (next) => {
    const fetcher = responses({ id: "job" }, { status: "completed", data: [], next });
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("invalid pagination URL");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects an unsuccessful start", async () => {
    responses({ success: false });
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("crawling provider");
  });

  it("requires a job ID", async () => {
    responses({ success: true });
    await expect(provider().crawl({ url: "https://example.com" })).rejects.toThrow("job ID");
  });

  it("bounds the overall crawl duration", async () => {
    const fetcher = responses();
    await expect(new FirecrawlProvider({ apiKey: "test", timeoutMs: 0 }).crawl({ url: "https://example.com" })).rejects.toThrow("timed out");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
