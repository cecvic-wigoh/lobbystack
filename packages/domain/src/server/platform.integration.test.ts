import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auditLogs, businesses, businessInvitations, businessMemberships, createDatabaseClient, outboxMessages, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { authorizePlatformAdmin, createPlatformCustomer, listPlatformCustomers, openPlatformCustomer } from "./platform";
import { acceptInvitation } from "./tenancy";

const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) throw new Error("Platform tests require a dedicated local test database.");
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });
async function rollback(run: (tx: DatabaseTransaction) => Promise<void>) {
  const sentinel = new Error("rollback");
  try { await client!.db.transaction(async tx => { await run(tx); throw sentinel; }); } catch (error) { if (error !== sentinel) throw error; }
}
async function seedUser(tx: DatabaseTransaction, platformRole = "operator") {
  const id = randomUUID(); const email = `${id}@example.test`;
  await tx.insert(users).values({ id, email, normalizedEmail: email, platformRole });
  return { id, email };
}
const input = { name: "Customer test", timezone: "America/Regina", businessType: "service_company", email: "client@example.test" };

describe.skipIf(!client)("platform customer management under RLS", () => {
  it("rejects ordinary users before discovery, creation, or opening a workspace", async () => rollback(async tx => {
    const user = await seedUser(tx);
    await tx.execute(sql`set local role lobbystack_app`);
    const context = { db: tx as unknown as Database };
    await expect(authorizePlatformAdmin(context, user.id)).rejects.toMatchObject({ status: 403 });
    await expect(listPlatformCustomers(context, {} as Database, { userId: user.id, search: "", offset: 0 })).rejects.toMatchObject({ status: 403 });
    await expect(createPlatformCustomer(context, { ...input, userId: user.id })).rejects.toMatchObject({ status: 403 });
    await expect(openPlatformCustomer(context, { userId: user.id, businessId: randomUUID() })).rejects.toMatchObject({ status: 403 });
  }));
  it("lists and searches the customer directory only after platform authorization", async () => rollback(async tx => {
    const admin = await seedUser(tx, "platform_admin");
    const businessId = randomUUID();
    await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "100% Customer", timezone: "UTC", businessType: "test" });
    await tx.execute(sql`set local role lobbystack_app`);
    const context = { db: tx as unknown as Database };
    const discovery = { transaction: (run: (nested: DatabaseTransaction) => Promise<unknown>) => tx.transaction(async nested => {
      await nested.execute(sql`set local role lobbystack_dispatcher`);
      try { return await run(nested); } finally { await nested.execute(sql`set local role lobbystack_app`); }
    }) } as unknown as Database;
    const result = await listPlatformCustomers(context, discovery, { userId: admin.id, search: "100%", offset: 0 });
    expect(result.customers).toEqual([expect.objectContaining({ businessId, name: "100% Customer" })]);
  }));
  it("creates a tenant and queues an admin invitation atomically without changing the operator's active workspace", async () => rollback(async tx => {
    const admin = await seedUser(tx, "platform_admin");
    await tx.execute(sql`set local role lobbystack_app`);
    const context = { db: tx as unknown as Database };
    const created = await createPlatformCustomer(context, { ...input, userId: admin.id });
    await tx.execute(sql`reset role`);
    const [invitation] = await tx.select().from(businessInvitations).where(eq(businessInvitations.businessId, created.businessId));
    expect(invitation).toMatchObject({ normalizedEmail: input.email, role: "business_admin", status: "pending" });
    const [delivery] = await tx.select().from(outboxMessages).where(eq(outboxMessages.aggregateId, invitation!.id));
    expect(delivery!.payload).toMatchObject({ template: "invitation", email: input.email });
    const [operator] = await tx.select().from(users).where(eq(users.id, admin.id));
    expect(operator!.activeBusinessId).toBeNull();
    const customer = await seedUser(tx);
    await tx.update(users).set({ email: input.email, normalizedEmail: input.email }).where(eq(users.id, customer.id));
    const token = (delivery!.payload as { token: string }).token;
    await tx.execute(sql`set local role lobbystack_app`);
    await acceptInvitation(context, { userId: customer.id, tokenHash: createHash("sha256").update(token).digest("hex") });
    await tx.execute(sql`reset role`);
    const [joined] = await tx.select().from(users).where(eq(users.id, customer.id));
    expect(joined!.activeBusinessId).toBe(created.businessId);
  }));
  it("opens an existing customer with business admin access and an audit entry", async () => rollback(async tx => {
    const admin = await seedUser(tx, "platform_admin");
    const businessId = randomUUID();
    await tx.insert(businesses).values({ id: businessId, slug: businessId, name: "Existing customer", timezone: "UTC", businessType: "test" });
    await tx.execute(sql`set local role lobbystack_app`);
    const context = { db: tx as unknown as Database };
    await openPlatformCustomer(context, { userId: admin.id, businessId });
    await openPlatformCustomer(context, { userId: admin.id, businessId });
    await tx.execute(sql`reset role`);
    const members = await tx.select().from(businessMemberships).where(eq(businessMemberships.businessId, businessId));
    expect(members).toHaveLength(1); expect(members[0]).toMatchObject({ userId: admin.id, role: "business_admin", status: "active" });
    const audits = await tx.select().from(auditLogs).where(eq(auditLogs.businessId, businessId));
    expect(audits).toHaveLength(2); expect(audits[0]).toMatchObject({ actorUserId: admin.id, eventType: "platform.customer.opened" });
  }));
});
