import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auditLogs, businesses, businessMemberships, calls, callQualityReviews, createDatabaseClient, transcripts, users, withBusinessTransaction, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { callQualityReviewSchema, getCallQualityDetail, listCallQualityReviews, saveCallQualityReview } from "./callQuality";

const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) throw new Error("Call quality tests require a dedicated local test database.");
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });
async function rollback(run: (tx: DatabaseTransaction) => Promise<void>) {
  const sentinel = new Error("rollback");
  try { await client!.db.transaction(async tx => { await run(tx); throw sentinel; }); } catch (error) { if (error !== sentinel) throw error; }
}
async function seed(tx: DatabaseTransaction) {
  const adminId = randomUUID(), userId = randomUUID();
  for (const [id, platformRole] of [[adminId, "platform_admin"], [userId, "operator"]]) {
    await tx.insert(users).values({ id, email: `${id}@example.test`, normalizedEmail: `${id}@example.test`, platformRole });
  }
  const businessIds = [randomUUID(), randomUUID()];
  const callIds: string[] = [];
  for (const businessId of businessIds) {
    await tx.insert(businesses).values({ id: businessId, slug: businessId, name: `QC ${businessId}`, timezone: "UTC", businessType: "test" });
    const callId = randomUUID(); callIds.push(callId);
    await tx.insert(calls).values({ id: callId, businessId, providerCallId: callId, transport: "web_voice", status: "completed", startedAt: new Date(), endedAt: new Date() });
    await tx.insert(transcripts).values([{ businessId, callId, sequence: 0, speaker: "caller", text: "Product coverage?", final: true }, { businessId, callId, sequence: 1, speaker: "assistant", text: "Interim", final: false }]);
  }
  await tx.insert(businessMemberships).values({ businessId: businessIds[0]!, userId, role: "business_admin", status: "active" });
  await tx.execute(sql`set local role lobbystack_app`);
  return { context: { db: tx as unknown as Database }, adminId, userId, businessIds, callIds };
}

it("requires a flag and correction or retest note for problem reviews", () => {
  const input = { callId: randomUUID(), status: "needs_correction", flags: [], notes: "" };
  expect(callQualityReviewSchema.safeParse(input).success).toBe(false);
  expect(callQualityReviewSchema.parse({ ...input, flags: ["retrieval", "retrieval"], notes: " Check coverage. " })).toMatchObject({ flags: ["retrieval"], notes: "Check coverage." });
});

describe.skipIf(!client)("platform call quality under RLS", () => {
  it("includes historical calls across clients without creating duplicate transcripts or review rows", async () => rollback(async tx => {
    const { context, adminId, callIds } = await seed(tx);
    const queue = await listCallQualityReviews(context, { userId: adminId, search: "QC ", offset: 0, status: "unreviewed" });
    expect(queue.calls.map(call => call.callId).sort()).toEqual([...callIds].sort());
    expect(queue.calls.every(call => call.transcriptCount === 1 && call.status === "unreviewed")).toBe(true);
    const detail = await getCallQualityDetail(context, { userId: adminId, callId: callIds[1]! });
    expect(detail.transcript.map(turn => turn.text)).toEqual(["Product coverage?"]);
    await tx.execute(sql`reset role`);
    expect(await tx.select().from(callQualityReviews)).toHaveLength(0);
    expect(await tx.select().from(auditLogs).where(eq(auditLogs.entityId, callIds[1]!))).toEqual([expect.objectContaining({ eventType: "platform.call_quality.viewed", actorUserId: adminId })]);
  }));
  it("saves one review per call and filters the queue by its current status", async () => rollback(async tx => {
    const { context, adminId, callIds } = await seed(tx);
    const input = { userId: adminId, callId: callIds[0]!, status: "needs_correction" as const, flags: ["retrieval" as const], notes: "Coverage exists on the product page." };
    await saveCallQualityReview(context, input);
    await saveCallQualityReview(context, { ...input, status: "resolved", notes: "Corrected retrieval; coverage retest passed." });
    const queue = await listCallQualityReviews(context, { userId: adminId, search: "QC ", offset: 0, status: "resolved" });
    expect(queue.calls).toEqual([expect.objectContaining({ callId: input.callId, status: "resolved", reviewedBy: adminId, flags: ["retrieval"] })]);
    await tx.execute(sql`reset role`);
    expect(await tx.select().from(callQualityReviews).where(eq(callQualityReviews.callId, input.callId))).toHaveLength(1);
    expect(await tx.select().from(auditLogs).where(eq(auditLogs.entityId, input.callId))).toHaveLength(2);
  }));
  it("denies ordinary tenant admins at both domain and database boundaries", async () => rollback(async tx => {
    const { context, adminId, userId, callIds, businessIds } = await seed(tx);
    await saveCallQualityReview(context, { userId: adminId, callId: callIds[0]!, status: "passed", flags: [], notes: "Reviewed." });
    await expect(listCallQualityReviews(context, { userId, search: "", offset: 0 })).rejects.toMatchObject({ status: 403 });
    await expect(getCallQualityDetail(context, { userId, callId: callIds[1]! })).rejects.toMatchObject({ status: 403 });
    await expect(saveCallQualityReview(context, { userId, callId: callIds[0]!, status: "passed", flags: [], notes: "" })).rejects.toMatchObject({ status: 403 });
    await withBusinessTransaction(context.db, { userId, businessId: businessIds[0], actorType: "operator" }, async scoped => {
      expect(await scoped.select().from(callQualityReviews)).toEqual([]);
      expect((await scoped.select().from(calls)).map(call => call.id)).toEqual([callIds[0]]);
      expect((await scoped.select().from(transcripts)).every(turn => turn.callId === callIds[0])).toBe(true);
    });
    await expect(getCallQualityDetail(context, { userId: adminId, callId: randomUUID() })).rejects.toMatchObject({ status: 404 });
  }));
});
