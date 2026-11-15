import { sql } from "drizzle-orm";
import { withBusinessTransaction } from "@lobbystack/db";
import { parseCourseCatalogue, type CatalogueEntry, type CataloguePage } from "../courseCatalogue";
import type { DomainContext } from "./context";

const cache = new Map<string, { signature: string; entries: CatalogueEntry[] }>();

/** Fetch only this business's current indexed catalogue; revisions and active membership invalidate it. */
export async function loadCourseCatalogue(context: DomainContext, input: { businessId: string }): Promise<CatalogueEntry[]> {
  return withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async tx => {
    await tx.execute(sql`SET LOCAL statement_timeout = '3000ms'`);
    const eligible = sql`d.business_id=${input.businessId} AND d.active=true AND d.status='indexed'
      AND (d.source_url ~ '/(?:programs|courses)/[^/?#]+/?$' OR d.source_url ~ '/product[?].*catalog=')`;
    const pages = (await tx.execute<{ id: string; revision: number; title: string; url: string }>(sql`SELECT d.id,d.revision,d.title,d.source_url AS url FROM knowledge_documents d WHERE ${eligible} ORDER BY d.id`)).rows;
    const signature = JSON.stringify(pages);
    const hit = cache.get(input.businessId);
    if (hit?.signature === signature) return hit.entries;
    const rows = (await tx.execute<CataloguePage>(sql`SELECT d.title,d.source_url AS url,
      string_agg(c.content,E'\n\n' ORDER BY c.sequence) AS text
      FROM knowledge_documents d JOIN knowledge_chunks c ON c.document_id=d.id AND c.business_id=d.business_id
      WHERE ${eligible} AND (d.source_url ~ '/programs/[^/?#]+/?$' OR c.sequence=0)
      GROUP BY d.id,d.title,d.source_url ORDER BY d.source_url`)).rows;
    const entries = parseCourseCatalogue(rows);
    if (cache.size >= 32 && !cache.has(input.businessId)) cache.delete(cache.keys().next().value!);
    cache.set(input.businessId, { signature, entries });
    return entries;
  });
}
