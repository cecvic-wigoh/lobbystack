/** Suncrest appends the same inactive application wizard to public course pages. */
export function websiteKnowledgeText(url: string, markdown: string | undefined): string {
  const text = markdown?.trim() ?? "";
  let host: string;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return text; }
  if (host !== "suncrestcollege.ca") return text;
  const wizard = /\nBack\s*\nPrint Application Form\s*\n##### Application Timeline\b/.exec(text);
  return wizard ? text.slice(0, wizard.index).trim() : text;
}
