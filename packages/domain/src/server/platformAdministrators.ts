import { asc, eq, sql } from "drizzle-orm";
import { users, withBusinessTransaction } from "@lobbystack/db";
import { normalizeAuthEmail } from "@lobbystack/shared";
import { requirePlatformAdmin } from "../authz";
import type { DomainContext } from "./context";

/** These operations use the auth database role, after checking the acting user's current role. */
export async function listPlatformAdministrators(context: DomainContext, userId: string) {
  return withBusinessTransaction(context.db, { userId, actorType: "operator" }, async tx => {
    await requirePlatformAdmin(tx, userId);
    return tx.select({ id: users.id, email: users.email, name: users.name }).from(users)
      .where(eq(users.platformRole, "platform_admin")).orderBy(asc(users.email));
  });
}

export async function setPlatformAdministrator(context: DomainContext, input: { userId: string; email: string; enabled: boolean }) {
  return withBusinessTransaction(context.db, { userId: input.userId, actorType: "operator" }, async tx => {
    // Serialize grants and removals so concurrent requests cannot remove the final administrators.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('lobbystack:platform-administrators'))`);
    await requirePlatformAdmin(tx, input.userId);
    const [target] = await tx.select({ id: users.id, platformRole: users.platformRole, emailVerified: users.emailVerified }).from(users)
      .where(eq(users.normalizedEmail, normalizeAuthEmail(input.email))).limit(1).for("update");
    if (!target) throw Object.assign(new Error("This person must create an account before receiving platform administrator access."), { status: 404 });
    if (input.enabled && !target.emailVerified) throw Object.assign(new Error("This person must verify their email address first."), { status: 409 });
    if (!input.enabled && target.platformRole === "platform_admin") {
      const admins = await tx.select({ id: users.id }).from(users).where(eq(users.platformRole, "platform_admin"));
      if (admins.length <= 1) throw Object.assign(new Error("The last platform administrator cannot be removed."), { status: 409 });
    }
    if (input.enabled || target.platformRole === "platform_admin") {
      await tx.update(users).set({ platformRole: input.enabled ? "platform_admin" : "operator", updatedAt: new Date() }).where(eq(users.id, target.id));
    }
    return { ok: true as const };
  });
}
