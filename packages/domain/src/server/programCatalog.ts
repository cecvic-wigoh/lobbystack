import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { knowledgeChunks, knowledgeDocuments, withBusinessTransaction } from "@lobbystack/db";

import { parseProgramPage, type ProgramEntry } from "../programCatalog";
import type { DomainContext } from "./context";

const cache = new Map<string, { signature: string; catalog: ProgramEntry[] }>();
const PROGRAM_PAGE = sql`${knowledgeDocuments.sourceUrl} ~ '/programs/[^/?#]+/?$'`;

/**
 * The business's indexed program pages parsed into published intakes and
 * requirements. Rebuilt only when a program page's revision changes.
 */
export async function loadProgramCatalog(context: DomainContext, input: { businessId: string }): Promise<ProgramEntry[]> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '2000ms'`);
    const pages = await tx.select({ id: knowledgeDocuments.id, title: knowledgeDocuments.title, sourceUrl: knowledgeDocuments.sourceUrl, revision: knowledgeDocuments.revision })
      .from(knowledgeDocuments)
      .where(and(eq(knowledgeDocuments.businessId, input.businessId), eq(knowledgeDocuments.active, true), eq(knowledgeDocuments.status, "indexed"), PROGRAM_PAGE))
      .orderBy(asc(knowledgeDocuments.sourceUrl));
    const signature = pages.map(page => `${page.id}:${page.revision}`).join(",");
    const cached = cache.get(input.businessId);
    if (cached?.signature === signature) return cached.catalog;
    const chunks = pages.length ? await tx.select({ documentId: knowledgeChunks.documentId, content: knowledgeChunks.content })
      .from(knowledgeChunks)
      .where(and(eq(knowledgeChunks.businessId, input.businessId), inArray(knowledgeChunks.documentId, pages.map(page => page.id))))
      .orderBy(asc(knowledgeChunks.documentId), asc(knowledgeChunks.sequence)) : [];
    const text = new Map<string, string[]>();
    for (const chunk of chunks) text.set(chunk.documentId, [...(text.get(chunk.documentId) ?? []), chunk.content]);
    const catalog = pages.map(page => parseProgramPage({ url: page.sourceUrl!, title: page.title, text: (text.get(page.id) ?? []).join("\n\n") }));
    cache.set(input.businessId, { signature, catalog });
    return catalog;
  });
}
