import { and, asc, eq, ilike } from "drizzle-orm";
import { auditLogs, businesses, businessMemberships, users, withBusinessTransaction, type Database } from "@lobbystack/db";
import { requirePlatformAdmin } from "../authz";
import type { DomainContext } from "./context";
import { createBusiness, inviteMember } from "./tenancy";

export async function authorizePlatformAdmin(context: DomainContext, userId: string): Promise<void> {
  await withBusinessTransaction(context.db, { userId, actorType: "operator" }, tx => requirePlatformAdmin(tx, userId));
}

export async function listPlatformCustomers(context: DomainContext, discoveryDb: Database, input: { userId: string; search: string; offset: number }) {
  await authorizePlatformAdmin(context, input.userId);
  // Discovery uses the existing read-only business-directory policy; mutations remain tenant-scoped.
  return withBusinessTransaction(discoveryDb, { actorType: "dispatcher" }, async tx => {
    const rows = await tx.select({ businessId: businesses.id, name: businesses.name, timezone: businesses.timezone, status: businesses.status, onboardingStage: businesses.onboardingStage })
      .from(businesses).where(input.search ? ilike(businesses.name, `%${input.search.replace(/[\\%_]/g, "\\$&")}%`) : undefined)
      .orderBy(asc(businesses.name), asc(businesses.id)).offset(input.offset).limit(51);
    return { customers: rows.slice(0, 50), hasNext: rows.length > 50 };
  });
}

export async function createPlatformCustomer(context: DomainContext, input: { userId: string; name: string; timezone: string; businessType: string; email: string }) {
  return withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async tx => {
    await requirePlatformAdmin(tx, input.userId);
    const [operator] = await tx.select({ activeBusinessId: users.activeBusinessId }).from(users).where(eq(users.id, input.userId)).limit(1);
    const scoped = { ...context, db: tx as unknown as Database };
    const created = await createBusiness(scoped, input);
    await inviteMember(scoped, { userId: input.userId, businessId: created.businessId, email: input.email, role: "business_admin" });
    await tx.update(users).set({ activeBusinessId: operator?.activeBusinessId ?? null, updatedAt: new Date() }).where(eq(users.id, input.userId));
    return created;
  }, { maxRetries: 0 });
}

export async function openPlatformCustomer(context: DomainContext, input: { userId: string; businessId: string }) {
  await withBusinessTransaction(context.db, { ...input, actorType: "system" }, async tx => {
    await requirePlatformAdmin(tx, input.userId);
    const [business] = await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    if (!business) throw Object.assign(new Error("Customer not found."), { status: 404 });
    const [membership] = await tx.select({ id: businessMemberships.id, role: businessMemberships.role }).from(businessMemberships)
      .where(and(eq(businessMemberships.businessId, input.businessId), eq(businessMemberships.userId, input.userId))).limit(1);
    if (membership) {
      await tx.update(businessMemberships).set({ role: membership.role === "business_owner" ? "business_owner" : "business_admin", status: "active", updatedAt: new Date() }).where(eq(businessMemberships.id, membership.id));
    } else {
      await tx.insert(businessMemberships).values({ businessId: input.businessId, userId: input.userId, role: "business_admin", status: "active" });
    }
    await tx.update(users).set({ activeBusinessId: input.businessId, updatedAt: new Date() }).where(eq(users.id, input.userId));
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "platform.customer.opened", entityType: "business", entityId: input.businessId });
  });
}
