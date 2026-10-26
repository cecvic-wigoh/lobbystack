import { NextResponse } from "next/server";
import { z } from "zod";
import { createPlatformCustomer, listPlatformCustomers, openPlatformCustomer } from "@lobbystack/domain";
import { asApiResponse, getDispatcherDatabase, readJson, requireApiSession } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";

export const dynamic = "force-dynamic";
const customerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.email().transform(value => value.toLowerCase()),
  timezone: z.string().max(80).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Invalid timezone"),
  businessType: z.string().trim().min(1).max(64),
});
export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    const url = new URL(request.url);
    const offset = z.coerce.number().int().min(0).max(100000).parse(url.searchParams.get("offset") ?? 0);
    return NextResponse.json(await listPlatformCustomers(createDomainContext(), getDispatcherDatabase().db, { userId: session.user.id, search: (url.searchParams.get("search") ?? "").slice(0, 160), offset }));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid customer details." }, { status: 400 });
    return asApiResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const input = customerSchema.parse(await readJson(request));
    const created = await createPlatformCustomer(createDomainContext(), { ...input, userId: session.user.id });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid customer details." }, { status: 400 });
    return asApiResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const session = await requireApiSession(request);
    const { businessId } = z.object({ businessId: z.uuid() }).parse(await readJson(request));
    await openPlatformCustomer(createDomainContext(), { userId: session.user.id, businessId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid customer details." }, { status: 400 });
    return asApiResponse(error);
  }
}
