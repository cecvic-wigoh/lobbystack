import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { completeCall, getWebVoiceBillingAllowance, startCall } from "@lobbystack/domain";
import { z } from "zod";
import { asApiResponse, readJson } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { loadValidBusinessSnapshot } from "@/lib/business-snapshot";
import { createLivekitRoom, livekitCallerToken } from "@/lib/livekit";
import { liveSessionEndToken, publicCallCorsHeaders, resolveLiveWebCallAccess, LIVE_WEB_CALL_WIDGET_IDS } from "@/lib/live-web-call";
import { enforceWebVoiceRateLimits } from "@/lib/web-voice-policy";
import { requestIpHash } from "@/lib/widget-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const bodySchema = z.object({ widgetId: z.enum(LIVE_WEB_CALL_WIDGET_IDS), businessSlug: z.string().max(128).optional(), visitorId: z.string().uuid().optional(), pageUrl: z.string().url().max(2048).optional(), prospectDemoToken: z.string().max(512).optional() });
export async function OPTIONS(request: Request) { return new NextResponse(null, { status: 204, headers: publicCallCorsHeaders(request.headers.get("origin")) }); }
export async function POST(request: Request) {
  const cors = publicCallCorsHeaders(request.headers.get("origin"));
  try {
    const body = bodySchema.parse(await readJson(request));
    const access = await resolveLiveWebCallAccess(request, { widgetId: body.widgetId, sdp: "livekit", ...(body.businessSlug ? { businessSlug: body.businessSlug } : {}), ...(body.visitorId ? { visitorId: body.visitorId } : {}), ...(body.prospectDemoToken ? { prospectDemoToken: body.prospectDemoToken } : {}) });
    if (!("businessId" in access)) return NextResponse.json({ code: access.code }, { status: access.status, headers: cors });
    const limit = await enforceWebVoiceRateLimits({ businessId: access.businessId, origin: access.origin, widgetId: access.widgetId, ipHash: requestIpHash(request), ...(access.visitorId ? { visitorId: access.visitorId } : {}), dashboardTestCall: access.dashboardTestCall }, { consume: true });
    if (!limit.allowed) return NextResponse.json({ code: limit.code }, { status: limit.status, headers: cors });
    const domain = createWorkerDomainContext();
    const maxDurationMs = 5 * 60_000;
    const [allowance, snapshot] = await Promise.all([getWebVoiceBillingAllowance(domain, { businessId: access.businessId, maxDurationMs }), loadValidBusinessSnapshot(access.businessId)]);
    if (!allowance.allowed) return NextResponse.json({ code: allowance.errorCode }, { status: 402, headers: cors });
    if (!snapshot) return NextResponse.json({ code: "snapshot_missing" }, { status: 409, headers: cors });
    const room = `lobby-${randomUUID()}`;
    const config = await createLivekitRoom(room);
    let callId: string | undefined;
    try {
      const call = await startCall(domain, { businessId: access.businessId, provider: "livekit", providerCallId: room, gatewaySessionId: room, from: "web", to: "web", transport: "web_voice", widgetId: access.widgetId, maxDurationMs: allowance.maxDurationMs, billable: !access.prospectDemoId });
      callId = call.callId;
      await config.dispatch.createDispatch(room, process.env.LIVEKIT_AGENT_NAME || "ai-receptionist-voice", { metadata: JSON.stringify({ version: 1, backend: "lobbystack", direction: "web", tenantId: access.businessId, callId, maxDurationMs: call.webCallMaxDurationMs ?? maxDurationMs }) });
      return NextResponse.json({ serverUrl: config.url, token: await livekitCallerToken(room, `caller-${callId}`), sessionId: room, endToken: liveSessionEndToken(room) }, { headers: cors });
    } catch (error) {
      await config.rooms.deleteRoom(room).catch(() => undefined);
      if (callId) await completeCall(domain, { businessId: access.businessId, callId, status: "failed", disposition: "setup_failed", endedAt: new Date().toISOString(), providerDurationSeconds: 0 });
      throw error;
    }
  } catch (error) { const response = asApiResponse(error); for (const [key, value] of Object.entries(cors)) response.headers.set(key, value); return response; }
}
