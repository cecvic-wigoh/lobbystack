import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient, users, type Database, type DatabaseTransaction } from "@lobbystack/db";
import { listPlatformAdministrators, setPlatformAdministrator } from "./platformAdministrators";

const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) throw new Error("Platform administrator tests require a dedicated local test database.");
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });
async function seed(tx: DatabaseTransaction, role: string, verified = true) {
  const id = randomUUID(), email = `${id}@example.test`;
  await tx.insert(users).values({ id, email, normalizedEmail: email, platformRole: role, emailVerified: verified });
  return { id, email };
}
async function rollback(run: (tx: DatabaseTransaction) => Promise<void>) {
  const sentinel = new Error("rollback");
  try { await client!.db.transaction(async tx => { await run(tx); throw sentinel; }); } catch (error) { if (error !== sentinel) throw error; }
}
async function asAuth(tx: DatabaseTransaction) {
  await tx.execute(sql`set local role lobbystack_auth`);
  return { db: tx as unknown as Database };
}

describe.skipIf(!client)("platform administrator management", () => {
  it("denies ordinary users, even when using the privileged auth connection", async () => rollback(async tx => {
    const operator = await seed(tx, "operator"), admin = await seed(tx, "platform_admin");
    const context = await asAuth(tx);
    await expect(listPlatformAdministrators(context, operator.id)).rejects.toMatchObject({ status: 403 });
    await expect(setPlatformAdministrator(context, { userId: operator.id, email: operator.email, enabled: true })).rejects.toMatchObject({ status: 403 });
    await expect(setPlatformAdministrator(context, { userId: operator.id, email: admin.email, enabled: false })).rejects.toMatchObject({ status: 403 });
  }));
  it("grants only verified existing accounts and supports listing and removal", async () => rollback(async tx => {
    const admin = await seed(tx, "platform_admin"), target = await seed(tx, "operator"), unverified = await seed(tx, "operator", false);
    const context = await asAuth(tx);
    await expect(setPlatformAdministrator(context, { userId: admin.id, email: `${randomUUID()}@example.test`, enabled: true })).rejects.toMatchObject({ status: 404 });
    await expect(setPlatformAdministrator(context, { userId: admin.id, email: unverified.email, enabled: true })).rejects.toMatchObject({ status: 409 });
    await setPlatformAdministrator(context, { userId: admin.id, email: ` ${target.email.toUpperCase()} `, enabled: true });
    expect(await listPlatformAdministrators(context, admin.id)).toEqual(expect.arrayContaining([expect.objectContaining({ id: target.id, email: target.email })]));
    await setPlatformAdministrator(context, { userId: admin.id, email: target.email, enabled: false });
    await expect(listPlatformAdministrators(context, target.id)).rejects.toMatchObject({ status: 403 });
    expect(await listPlatformAdministrators(context, admin.id)).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: target.id })]));
  }));
  it("cannot remove the last administrator", async () => rollback(async tx => {
    // This fixture is the only admin visible in this transaction; clear only local test fixture roles.
    await tx.update(users).set({ platformRole: "operator" }).where(eq(users.platformRole, "platform_admin"));
    const admin = await seed(tx, "platform_admin");
    const context = await asAuth(tx);
    await expect(setPlatformAdministrator(context, { userId: admin.id, email: admin.email, enabled: false })).rejects.toMatchObject({ status: 409 });
    expect(await listPlatformAdministrators(context, admin.id)).toEqual([expect.objectContaining({ id: admin.id })]);
  }));
  it("serializes concurrent self-removals so one administrator remains", async () => {
    // Use committed fixtures for separate connections; never runs against a production URL.
    const previous = await client!.db.select({ id: users.id }).from(users).where(eq(users.platformRole, "platform_admin"));
    await client!.db.update(users).set({ platformRole: "operator" }).where(eq(users.platformRole, "platform_admin"));
    let first: { id: string; email: string } | undefined, second: { id: string; email: string } | undefined;
    try {
      [first, second] = await client!.db.transaction(async tx => [await seed(tx, "platform_admin"), await seed(tx, "platform_admin")]);
      const remove = (admin: { id: string; email: string }) => client!.db.transaction(async tx => setPlatformAdministrator(await asAuth(tx), { userId: admin.id, email: admin.email, enabled: false }));
      const results = await Promise.allSettled([remove(first!), remove(second!)]);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const remaining = await client!.db.select({ id: users.id }).from(users).where(eq(users.platformRole, "platform_admin"));
      expect(remaining).toHaveLength(1);
    } finally {
      const ids = [first?.id, second?.id].filter((id): id is string => Boolean(id));
      if (ids.length) await client!.db.delete(users).where(inArray(users.id, ids));
      if (previous.length) await client!.db.update(users).set({ platformRole: "platform_admin" }).where(inArray(users.id, previous.map(user => user.id)));
    }
  });
});
