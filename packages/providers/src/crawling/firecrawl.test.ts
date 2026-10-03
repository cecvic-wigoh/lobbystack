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
  it("sizes a full import from the site map and excludes XML from the crawl budget", async () => {
    const fetcher = responses({ links: ["https://example.com/", "https://example.com/about", "https://example.com/sitemap.xml", "https://other.test/"] }, { id: "job" }, { status: "completed", data: [page("https://example.com/")] });
    await provider().crawl({ url: "https://example.com", limit: 10000 });
    expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toMatchObject({ limit: 3, allowExternalLinks: false, excludePaths: [".*\\.xml$"] });
  });
  it("honors the configured credit budget and priority exclusions", async () => {
    const fetcher = responses({ id: "job" }, { status: "completed", data: [page("https://example.com/")] });
    await new FirecrawlProvider({ apiKey: "test", maxPages: 800, excludePaths: ["^/news/"], pollIntervalMs: 0 }).crawl({ url: "https://example.com", limit: 10000 });
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toMatchObject({ limit: 800, excludePaths: [".*\\\\.xml$", "^/news/"] });
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
