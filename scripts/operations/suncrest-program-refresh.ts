// One-time, source-audited refresh; uses the same cleaner and indexer as website jobs.
import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import {
  createDatabaseClient,
  knowledgeDocuments,
  withBusinessTransaction,
} from "../../packages/db/src/index";
import {
  chunkText,
  hashContent,
  indexDocumentText,
  normalizeWebsiteSourceUrl,
  upsertWebsiteDocument,
} from "../../packages/domain/src/index";
import { createEmbeddingProvider } from "../../packages/providers/src/index";
import { websiteKnowledgeText } from "../../apps/worker/src/websiteText";
const businessId = "9598f317-838d-4126-804c-cb8b376ac0e2";
const database = createDatabaseClient("lobbystack_worker");
async function main() {
  const payload = JSON.parse(await readFile(process.argv[2]!, "utf8"));
  if (!Array.isArray(payload.data) || payload.data.length > 2000)
    throw new Error("Expected bounded Firecrawl page data.");
  const embeddings = createEmbeddingProvider();
  if (!embeddings) throw new Error("Embedding provider missing.");
  const context = { db: database.db, embeddings };
  const results = [];
  const seen = new Set<string>();
  for (const page of payload.data) {
    const raw = page.metadata?.sourceURL;
    if (typeof raw !== "string") throw new Error("Page source URL missing.");
    const url = new URL(raw);
    url.hash = "";
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !["suncrestcollege.ca", "courses.suncrestcollege.ca"].includes(
        url.hostname,
      )
    )
      throw new Error("Source outside approved Suncrest websites.");
    if (
      url.hostname === "suncrestcollege.ca" &&
      !/^\/(?:programs|courses|interest)(?:\/|$)/.test(url.pathname) &&
      !/^\/uploads\/.+\.pdf$/i.test(url.pathname) &&
      ![
        "/ed2go",
        "/professional-development",
        "/safety-training",
        "/saskatchewan-emergency-response-institute",
        "/computer-training",
        "/domestic-application-process",
        "/international-application-process",
        "/language-proficiency-requirements",
        "/applying-registering",
        "/domestic-students",
        "/international-students",
      ].includes(url.pathname)
    )
      continue;
    if (
      url.hostname === "courses.suncrestcollege.ca" &&
      !/^\/(?:catalog|product|images\/[^/]+\.pdf)?\/?$/.test(url.pathname)
    )
      continue;
    const sourceUrl = normalizeWebsiteSourceUrl(url.toString());
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    const text = websiteKnowledgeText(sourceUrl, page.markdown);
    if (
      page.metadata?.statusCode >= 400 ||
      !text ||
      /^#?\s*Hello world, again!\s*$/i.test(text)
    ) {
      results.push({ url: sourceUrl, status: "unreadable" });
      continue;
    }
    const existing = await withBusinessTransaction(
      database.db,
      { businessId, actorType: "worker" },
      async (tx) =>
        (
          await tx
            .select()
            .from(knowledgeDocuments)
            .where(
              and(
                eq(knowledgeDocuments.businessId, businessId),
                eq(knowledgeDocuments.sourceUrl, sourceUrl),
              ),
            )
            .limit(1)
        )[0],
    );
    if (existing && !existing.active) {
      results.push({ url: sourceUrl, status: "disabled-preserved" });
      continue;
    }
    if (
      existing?.status === "indexed" &&
      existing.contentHash === hashContent(text)
    ) {
      results.push({ url: sourceUrl, status: "unchanged" });
      continue;
    }
    try {
      const vectors = await embeddings.embed(chunkText(text));
      const documentId = await upsertWebsiteDocument(context, {
        businessId,
        sourceUrl,
        title: page.metadata?.title ?? sourceUrl,
      });
      const indexed = await indexDocumentText(context, {
        businessId,
        documentId,
        text,
        embeddings: vectors,
        embeddingFingerprint: embeddings.fingerprint,
      });
      results.push({
        url: sourceUrl,
        status: existing ? "updated" : "added",
        chunks: indexed.chunkCount,
      });
    } catch (error) {
      results.push({
        url: sourceUrl,
        status: "failed",
        error: error instanceof Error ? error.name : "error",
      });
    }
  }
  console.log(JSON.stringify(results));
  if (results.some((r) => r.status === "failed")) process.exitCode = 1;
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => database.pool.end());
