import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { calls, withBusinessTransaction } from "@lobbystack/db";
import { completeCall, getCachedBusinessSnapshot, markLiveCallMediaStarted, saveLiveCallTurn } from "@lobbystack/domain";
import { createAgentModel, createReceptionistAgent } from "@lobbystack/agent-core";
import { z } from "zod";
import { asApiResponse } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ tenantId: z.string().uuid(), callId: z.string().uuid(), question: z.string().trim().min(1).max(2000).optional(), type: z.enum(["active", "completed", "failed", "transcript", "telemetry", "tool", "ringing"]).optional(), payload: z.record(z.string(), z.unknown()).default({}) });
export async function POST(request: Request, route: { params: Promise<{ operation: string }> }) {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  const presented = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (process.env.VOICE_PROVIDER !== "livekit" || !expected || !presented || Buffer.byteLength(expected) !== Buffer.byteLength(presented) || !timingSafeEqual(Buffer.from(expected), Buffer.from(presented))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const operation = (await route.params).operation;
    if (!["context", "respond", "events"].includes(operation)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const text = await request.text();
    if (Buffer.byteLength(text) > 32 * 1024) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const input = schema.parse(JSON.parse(text));
    // In this bridge tenantId names the LobbyStack workspace. The call must belong to it.
    const businessId = input.tenantId;
    const domain = createWorkerDomainContext();
    const call = await withBusinessTransaction(domain.db, { businessId, actorType: "worker" }, async tx => (await tx.select().from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, businessId), eq(calls.provider, "livekit"))).limit(1))[0]);
    if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
    if (call.endedAt && operation !== "events") return NextResponse.json({ error: "Call ended" }, { status: 410 });
    if (operation === "events") {
      if (input.type === "active") await markLiveCallMediaStarted(domain, { businessId, callId: call.id });
      if (input.type === "transcript") {
        const turn = z.object({ sequence: z.number().int().min(1), speaker: z.enum(["caller", "assistant"]), text: z.string().max(8000) }).parse(input.payload);
        await saveLiveCallTurn(domain, { businessId, callId: call.id, ...turn });
      }
      if (input.type === "completed" || input.type === "failed") {
        const seconds = call.mediaStartedAt ? Math.max(0, (Date.now() - call.mediaStartedAt.getTime()) / 1000) : 0;
        await completeCall(domain, { businessId, callId: call.id, status: input.type === "failed" ? "failed" : "completed", endedAt: new Date().toISOString(), providerDurationSeconds: seconds, mediaDurationSeconds: seconds });
      }
      return NextResponse.json({ ok: true });
    }
    const snapshot = await getCachedBusinessSnapshot(domain, { businessId });
    if (!snapshot) return NextResponse.json({ error: "Snapshot unavailable" }, { status: 409 });
    const voiceLocale = snapshot.defaultLocale === "fr" ? "fr-CA" : "en";
    if (operation === "context") return NextResponse.json({
      call: { id: call.id, direction: "inbound", locale: voiceLocale, fromNumber: "web", maxDurationMs: call.webCallMaxDurationMs ?? 300000 },
      business: { id: businessId, name: snapshot.displayName, timezone: snapshot.timezone },
      agent: { persona: snapshot.voiceInstructions, greeting: { [voiceLocale]: `${snapshot.greeting} ${snapshot.defaultLocale === "fr" ? "Je suis la réceptionniste IA." : "I’m the AI receptionist."}` }, languagePolicy: voiceLocale, enabledTools: ["askReceptionist"] },
      knowledge: [],
    });
    if (!input.question) return NextResponse.json({ error: "Question required" }, { status: 400 });
    const model = createAgentModel();
    if (!model) return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
    const agent = createReceptionistAgent({ model, context: { domain, snapshot, channel: "web_voice", callId: call.id }, readOnly: true, extraInstructions: "Answer this caller's business question briefly in the configured language. Look up website facts with searchKnowledge. Give published admissions contacts when relevant. Do not claim to book, transfer, save messages or send anything: this call supports information lookup only. Keep the answer under 50 words." });
    const result = await agent.generate({ prompt: input.question });
    return NextResponse.json({ answer: result.text });
  } catch (error) { return asApiResponse(error); }
}
