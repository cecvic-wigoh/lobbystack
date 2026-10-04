import { extractDocumentText } from "./documentExtraction";

/** Suncrest appends the same inactive application wizard to public course pages. */
export function websiteKnowledgeText(url: string, markdown: string | undefined): string {
  const text = markdown?.trim() ?? "";
  let host: string;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return text; }
  if (host !== "suncrestcollege.ca") return text;
  const wizard = /\nBack\s*\nPrint Application Form\s*\n##### Application Timeline\b/.exec(text);
  return wizard ? text.slice(0, wizard.index).trim() : text;
}

/** Process downloaded PDFs with our document reader instead of paid per-page parsing. */
export async function websitePageText(page: { url: string; markdown?: string; rawBase64?: string }): Promise<string> {
  if (page.markdown?.trim() || !page.rawBase64 || !/\.pdf(?:$|[?#])/i.test(page.url)) return websiteKnowledgeText(page.url, page.markdown);
  const encoded = page.rawBase64.replace(/^data:application\/pdf;base64,/, "");
  if (encoded.length > 48 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error("Downloaded PDF exceeds its size limit or has invalid encoding.");
  const body = Buffer.from(encoded, "base64");
  if (body.subarray(0, 5).toString() !== "%PDF-") throw new Error("Downloaded website file is not a PDF.");
  return websiteKnowledgeText(page.url, await extractDocumentText({ body, contentType: "application/pdf" }));
}
