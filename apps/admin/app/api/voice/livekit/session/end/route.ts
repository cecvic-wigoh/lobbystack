import { NextResponse } from "next/server";
import { z } from "zod";
import { asApiResponse, readJson } from "@/lib/api-helpers";
import { publicCallCorsHeaders, verifyLiveSessionEndToken } from "@/lib/live-web-call";
import { livekitConfig } from "@/lib/livekit";
export const dynamic = "force-dynamic";
export async function OPTIONS(request: Request) { return new NextResponse(null, { status: 204, headers: publicCallCorsHeaders(request.headers.get("origin")) }); }
export async function POST(request: Request) {
 const cors = publicCallCorsHeaders(request.headers.get("origin"));
 try {
  const body = z.object({ sessionId: z.string().regex(/^lobby-[a-f0-9-]{36}$/), endToken: z.string().max(128) }).parse(await readJson(request));
  if (!verifyLiveSessionEndToken(body.sessionId, body.endToken)) return NextResponse.json({ code: "forbidden" }, { status: 403, headers: cors });
  await livekitConfig().rooms.deleteRoom(body.sessionId);
  return new NextResponse(null, { status: 204, headers: cors });
 } catch (error) { const response = asApiResponse(error); for (const [key, value] of Object.entries(cors)) response.headers.set(key, value); return response; }
}
