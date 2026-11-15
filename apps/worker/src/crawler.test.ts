import { describe, expect, it } from "vitest";
import { createCrawlerProvider } from "./crawler";

describe("crawler selection", () => {
  it("prefers Crawl4AI when configured, even if legacy credentials remain", () => {
    expect(createCrawlerProvider({ CRAWL4AI_BASE_URL: "http://crawler:11235", CRAWL4AI_API_TOKEN: "secret", FIRECRAWL_API_KEY: "legacy" })?.name).toBe("crawl4ai");
  });
  it("rejects incomplete Crawl4AI configuration instead of silently using a paid provider", () => {
    expect(() => createCrawlerProvider({ CRAWL4AI_BASE_URL: "http://crawler:11235", FIRECRAWL_API_KEY: "legacy" })).toThrow("CRAWL4AI_API_TOKEN");
  });
  it("retains existing Firecrawl installations and handles an unconfigured worker", () => {
    expect(createCrawlerProvider({ FIRECRAWL_API_KEY: "legacy" })?.name).toBe("firecrawl");
    expect(createCrawlerProvider({})).toBeUndefined();
  });
});
