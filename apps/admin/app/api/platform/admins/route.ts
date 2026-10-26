import { NextResponse } from "next/server";
import { z } from "zod";
import { listPlatformAdministrators, setPlatformAdministrator } from "@lobbystack/domain";
import { asApiResponse, readJson, requireApiSession } from "@/lib/api-helpers";
import { getAuthDatabase } from "@/lib/auth";

export const dynamic = "force-dynamic";
const schema = z.object({ email: z.string().trim().email().max(254), enabled: z.boolean() });
export async function GET(request: Request) {
  try {
    const session = await requireApiSession(request);
    return NextResponse.json({ admins: await listPlatformAdministrators({ db: getAuthDatabase().db }, session.user.id), currentUserId: session.user.id });
  } catch (error) { return asApiResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const session = await requireApiSession(request);
    const input = schema.safeParse(await readJson(request));
    if (!input.success) return NextResponse.json({ error: "A valid email address and enabled flag are required." }, { status: 400 });
    return NextResponse.json(await setPlatformAdministrator({ db: getAuthDatabase().db }, { ...input.data, userId: session.user.id }));
  } catch (error) { return asApiResponse(error); }
}
