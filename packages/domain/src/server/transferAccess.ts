import { eq } from "drizzle-orm";
import { billingAccounts, businesses, withBusinessTransaction } from "@lobbystack/db";
import { isPaidSubscription } from "@lobbystack/shared";
import type { DomainContext } from "./context";

export function humanTransferPlanAllowed(input: { deploymentMode: string; plan: string | null; subscriptionState: string | null }): boolean {
  if (input.deploymentMode !== "cloud") return true;
  return ["pro", "enterprise"].includes(input.plan ?? "") && isPaidSubscription(input.plan, input.subscriptionState);
}

export async function canTransferToHuman(context: DomainContext, input: { businessId: string }): Promise<boolean> {
  return withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async tx => {
    const [account] = await tx.select({ deploymentMode: businesses.deploymentMode, plan: billingAccounts.plan, subscriptionState: billingAccounts.subscriptionState })
      .from(businesses).leftJoin(billingAccounts, eq(billingAccounts.businessId, businesses.id)).where(eq(businesses.id, input.businessId)).limit(1);
    return account ? humanTransferPlanAllowed(account) : false;
  });
}
