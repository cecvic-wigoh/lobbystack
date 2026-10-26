import { expect, it } from "vitest";
import { humanTransferPlanAllowed } from "./transferAccess";

it.each(["free_cloud", "starter", null])("denies transfers on %s", plan => {
  expect(humanTransferPlanAllowed({ deploymentMode: "cloud", plan, subscriptionState: "active" })).toBe(false);
});
it.each(["pro", "enterprise"])("allows %s only for a live subscription", plan => {
  for (const subscriptionState of ["active", "trialing", "past_due"]) expect(humanTransferPlanAllowed({ deploymentMode: "cloud", plan, subscriptionState })).toBe(true);
  for (const subscriptionState of ["canceled", "unpaid", null]) expect(humanTransferPlanAllowed({ deploymentMode: "cloud", plan, subscriptionState })).toBe(false);
});
it("preserves self-hosted transfers", () => {
  expect(humanTransferPlanAllowed({ deploymentMode: "self_hosted_standard", plan: null, subscriptionState: null })).toBe(true);
});
