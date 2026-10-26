import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { authorizePlatformAdmin } from "@lobbystack/domain";
import { getSession } from "@/lib/auth";
import { createDomainContext } from "@/lib/domain-context";
import { PlatformCustomersSurface } from "@/components/platform-customers-surface";

export default async function PlatformPage() {
  const session = await getSession(new Headers(await headers()));
  if (!session) notFound();
  try { await authorizePlatformAdmin(createDomainContext(), session.user.id); }
  catch (error) { if ((error as { status?: number }).status === 403) notFound(); throw error; }
  return <PlatformCustomersSurface />;
}
