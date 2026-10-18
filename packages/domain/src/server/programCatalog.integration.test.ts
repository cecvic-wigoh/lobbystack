import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { businesses, calls, contacts, conversations, createDatabaseClient, knowledgeChunks, knowledgeDocuments, transcripts, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { listLiveCallHistory } from "./liveCalls";
import { loadProgramCatalog } from "./programCatalog";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Program catalog integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  try {
    await client!.db.transaction(async (tx) => {
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function seedBusiness(tx: DatabaseTransaction) {
  const businessId = randomUUID();
  await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Catalog test college", timezone: "UTC", businessType: "test", defaultLocale: "en", telemetryEnabled: false });
  return businessId;
}

async function seedPage(tx: DatabaseTransaction, input: { businessId: string; sourceUrl: string; chunks: string[]; active?: boolean }) {
  const [document] = await tx.insert(knowledgeDocuments).values({ businessId: input.businessId, sourceType: "website", title: input.sourceUrl, sourceUrl: input.sourceUrl, status: "indexed", active: input.active ?? true, revision: 1 }).returning({ id: knowledgeDocuments.id });
  await tx.insert(knowledgeChunks).values(input.chunks.map((content, sequence) => ({ businessId: input.businessId, documentId: document!.id, sequence, content, contentHash: `hash-${sequence}` })));
  return document!.id;
}

const welding = ["# Welding", "#### Yorkton\n\nFull-Time\n\nFall 2027\n\n**Start Date**August 30, 2027"];

describe.skipIf(!testUrl)("program catalog and call history against PostgreSQL under worker RLS", () => {
  it("parses only the business's active indexed program pages and refreshes on a new revision", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await seedBusiness(tx);
      const otherBusinessId = await seedBusiness(tx);
      const weldingId = await seedPage(tx, { businessId, sourceUrl: `https://${businessId}.test/programs/welding`, chunks: welding });
      await seedPage(tx, { businessId, sourceUrl: `https://${businessId}.test/programs/retired`, chunks: ["# Retired", "#### Melfort\n\nFull-Time\n\nFall 2027"], active: false });
      await seedPage(tx, { businessId, sourceUrl: `https://${businessId}.test/contact-us`, chunks: ["# Contact"] });
      await seedPage(tx, { businessId: otherBusinessId, sourceUrl: `https://${otherBusinessId}.test/programs/nursing`, chunks: ["# Nursing", "#### Yorkton\n\nFull-Time\n\nFall 2027"] });
      await tx.execute(sql`set local role lobbystack_worker`);
      const db = tx as unknown as Database;

      expect(await loadProgramCatalog({ db }, { businessId })).toEqual([
        { title: "Welding", url: `https://${businessId}.test/programs/welding`, intakes: [{ campus: "Yorkton", term: "Fall 2027", commitment: "Full-Time", startDate: "August 30, 2027" }] },
      ]);

      await tx.execute(sql`reset role`);
      await tx.update(knowledgeChunks).set({ content: "#### Tisdale\n\nFull-Time\n\nFall 2027" }).where(eq(knowledgeChunks.documentId, weldingId));
      await tx.update(knowledgeDocuments).set({ revision: 2 }).where(eq(knowledgeDocuments.id, weldingId));
      await tx.execute(sql`set local role lobbystack_worker`);
      expect((await loadProgramCatalog({ db }, { businessId }))[0]!.intakes).toEqual([{ campus: "Tisdale", term: "Fall 2027", commitment: "Full-Time" }]);
    });
  });

  it("returns the call's recent turns in spoken order and nothing for another business", async () => {
    await rollbackTest(async (tx) => {
      const businessId = await seedBusiness(tx);
      const contactId = randomUUID();
      const conversationId = randomUUID();
      const callId = randomUUID();
      await tx.insert(contacts).values({ id: contactId, businessId, phone: "+13065550100" });
      await tx.insert(conversations).values({ id: conversationId, businessId, contactId, channel: "voice" });
      await tx.insert(calls).values({ id: callId, businessId, conversationId, contactId, providerCallId: `rtc_${callId}`, transport: "web_voice", status: "in_progress", startedAt: new Date() });
      const turns: Array<[string, string]> = [["assistant", "Hello."], ["caller", "Is Practical Nursing in Yorkton?"], ["assistant", "Yes, Winter 2028."], ["caller", "What about Melfort?"]];
      await tx.insert(transcripts).values(turns.map(([speaker, text], index) => ({ businessId, callId, sequence: index + 1, speaker, text, final: true })));
      await tx.execute(sql`set local role lobbystack_worker`);
      const db = tx as unknown as Database;

      expect(await listLiveCallHistory({ db }, { businessId, callId, limit: 3 })).toEqual([
        { role: "user", content: "Is Practical Nursing in Yorkton?" },
        { role: "assistant", content: "Yes, Winter 2028." },
        { role: "user", content: "What about Melfort?" },
      ]);
      expect(await listLiveCallHistory({ db }, { businessId: randomUUID(), callId })).toEqual([]);
    });
  });
});
