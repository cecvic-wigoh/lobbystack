import { describe, expect, it } from "vitest";

import { normalizeWebsiteSourceUrl } from "./knowledgeUrl";

describe("knowledge website URLs", () => {
  it("normalizes public HTTP URLs", () => {
    expect(normalizeWebsiteSourceUrl("https://example.com/docs")).toBe("https://example.com/docs");
  });

  it("accepts bare domains and canonicalizes onboarding URLs like the reference", () => {
    expect(normalizeWebsiteSourceUrl(" example.com ")).toBe("https://example.com/");
    expect(normalizeWebsiteSourceUrl("https://example.com/docs///?utm_source=test#section")).toBe("https://example.com/docs");
  });

  it("keeps course identity and pagination while discarding tracking and fragments", () => {
    expect(normalizeWebsiteSourceUrl("https://courses.suncrestcollege.ca/product?catalog=NFPA1140-1&utm_source=test#details")).toBe("https://courses.suncrestcollege.ca/product?catalog=NFPA1140-1");
    expect(normalizeWebsiteSourceUrl("https://courses.suncrestcollege.ca/catalog?pagename=All-Courses&page=2&fbclid=test")).toBe("https://courses.suncrestcollege.ca/catalog?page=2&pagename=All-Courses");
    expect(normalizeWebsiteSourceUrl("https://courses.suncrestcollege.ca/product?catalog=NFPA1001-1")).not.toBe(normalizeWebsiteSourceUrl("https://courses.suncrestcollege.ca/product?catalog=NFPA1140-1"));
  });

  it.each(["ftp://example.com", "http://user:pass@example.com", "http://localhost/private", "http://localhost./private", "http://192.168.1.1", "http://[::1]", "http://server.local", "http://router.home.arpa"])("rejects unsafe source %s", (url) => {
    expect(() => normalizeWebsiteSourceUrl(url)).toThrow();
  });
});
