import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), generate: vi.fn(), agent: vi.fn(), complete: vi.fn(), deleteRoom: vi.fn(), history: vi.fn(async () => [] as unknown[]), greeting: "Hello" }));
vi.mock("@/lib/livekit", () => ({ livekitConfig: () => ({ rooms: { deleteRoom: mocks.deleteRoom } }) }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));
vi.mock("@/lib/api-helpers", () => ({ asApiResponse: () => new Response(null, { status: 400 }) }));
vi.mock("@lobbystack/db", () => ({ calls: {}, withBusinessTransaction: async (_db: unknown, _ctx: unknown, fn: (tx: unknown) => unknown) => fn({ select: () => ({ from: () => ({ where: () => ({ limit: mocks.lookup }) }) }) }) }));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({
  canTransferToHuman: vi.fn(async () => true), getCachedBusinessSnapshot: async () => ({ businessId: "biz", defaultLocale: "en", displayName: "Suncrest", timezone: "America/Regina", greeting: mocks.greeting, voiceInstructions: "Helpful", transferPolicy: { mode: "never" } }), listLiveCallHistory: mocks.history, completeCall: mocks.complete, markLiveCallMediaStarted: vi.fn(), saveLiveCallTurn: vi.fn() }));
vi.mock("@lobbystack/agent-core", () => ({ createAgentModel: () => ({}), answerGroundedQuestion: mocks.agent }));
import { POST } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); mocks.greeting = "Hello"; });
it("protects bridge requests and denies missing or ended workspace calls before running the agent", async () => {
 vi.stubEnv("VOICE_PROVIDER", "livekit"); vi.stubEnv("INTERNAL_SERVICE_TOKEN", "s".repeat(32));
 const input = { tenantId: crypto.randomUUID(), callId: crypto.randomUUID(), question: "Admissions contact?" };
 const request = (token = "s".repeat(32)) => new Request("https://lobby.example/api/internal/livekit/respond", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
 const route = { params: Promise.resolve({ operation: "respond" }) };
 expect((await POST(request("wrong"), route)).status).toBe(401);
 expect(mocks.lookup).not.toHaveBeenCalled();
 mocks.lookup.mockResolvedValueOnce([]);
 expect((await POST(request(), route)).status).toBe(404);
 mocks.lookup.mockResolvedValueOnce([{ id: input.callId, endedAt: new Date() }]);
 expect((await POST(request(), route)).status).toBe(410);
 expect(mocks.agent).not.toHaveBeenCalled();
 mocks.lookup.mockResolvedValueOnce([{ id: input.callId, endedAt: null }]);
 mocks.agent.mockResolvedValue({ answer: "Use the college admissions contact.", sources: [], outcome: "unknown" });
 const reply = await POST(request(), route);
 expect(reply.status).toBe(200); expect(await reply.json()).toEqual({ answer: "Use the college admissions contact.", sources: [], outcome: "unknown" });
 expect(mocks.agent).toHaveBeenCalledWith(expect.objectContaining({ question: input.question, context: expect.objectContaining({ callId: input.callId }) }));
});

it("records whole seconds when finishing a call", async () => {
 vi.stubEnv("VOICE_PROVIDER", "livekit"); vi.stubEnv("INTERNAL_SERVICE_TOKEN", "s".repeat(32));
 const tenantId = crypto.randomUUID(); const callId = crypto.randomUUID();
 mocks.lookup.mockResolvedValueOnce([{ id: callId, endedAt: null, mediaStartedAt: new Date(Date.now() - 1500) }]);
 const request = new Request("https://lobby.example/api/internal/livekit/events", { method: "POST", headers: { authorization: `Bearer ${"s".repeat(32)}` }, body: JSON.stringify({ tenantId, callId, type: "completed" }) });
 expect((await POST(request, { params: Promise.resolve({ operation: "events" }) })).status).toBe(200);
 expect(Number.isInteger(mocks.complete.mock.calls[0]![1].providerDurationSeconds)).toBe(true);
});

it("closes the room and staff phone only when the complete caller session ends", async () => {
 vi.stubEnv("VOICE_PROVIDER", "livekit"); vi.stubEnv("INTERNAL_SERVICE_TOKEN", "s".repeat(32));
 const tenantId = crypto.randomUUID(); const callId = crypto.randomUUID(); const room = `lobby-${crypto.randomUUID()}`;
 mocks.lookup.mockResolvedValueOnce([{ id: callId, gatewaySessionId: room, endedAt: null, mediaStartedAt: new Date() }]);
 mocks.deleteRoom.mockResolvedValue(undefined);
 const request = new Request("https://lobby.example/api/internal/livekit/events", { method: "POST", headers: { authorization: `Bearer ${"s".repeat(32)}` }, body: JSON.stringify({ tenantId, callId, type: "completed" }) });
 expect((await POST(request, { params: Promise.resolve({ operation: "events" }) })).status).toBe(200);
 expect(mocks.deleteRoom).toHaveBeenCalledWith(room);
 expect(mocks.complete).toHaveBeenCalledTimes(1);
});

it("passes earlier call turns so spoken follow-ups keep their topic", async () => {
 vi.stubEnv("VOICE_PROVIDER", "livekit"); vi.stubEnv("INTERNAL_SERVICE_TOKEN", "s".repeat(32));
 const tenantId = crypto.randomUUID(); const callId = crypto.randomUUID();
 const history = [{ role: "user", content: "Do you offer Practical Nursing?" }, { role: "assistant", content: "Yes, in Yorkton." }];
 mocks.lookup.mockResolvedValueOnce([{ id: callId, endedAt: null }]);
 mocks.history.mockResolvedValueOnce(history);
 mocks.agent.mockResolvedValue({ answer: "ok", sources: [], outcome: "supported" });
 const request = new Request("https://lobby.example/api/internal/livekit/respond", { method: "POST", headers: { authorization: `Bearer ${"s".repeat(32)}` }, body: JSON.stringify({ tenantId, callId, question: "What about Melville?" }) });
 expect((await POST(request, { params: Promise.resolve({ operation: "respond" }) })).status).toBe(200);
 expect(mocks.history).toHaveBeenCalledWith(expect.anything(), { businessId: tenantId, callId });
 expect(mocks.agent).toHaveBeenCalledWith(expect.objectContaining({ question: "What about Melville?", history }));
});

it("discloses the AI receptionist once in the greeting", async () => {
 vi.stubEnv("VOICE_PROVIDER", "livekit"); vi.stubEnv("INTERNAL_SERVICE_TOKEN", "s".repeat(32));
 const context = async () => {
  mocks.lookup.mockResolvedValueOnce([{ id: crypto.randomUUID(), endedAt: null }]);
  const request = new Request("https://lobby.example/api/internal/livekit/context", { method: "POST", headers: { authorization: `Bearer ${"s".repeat(32)}` }, body: JSON.stringify({ tenantId: crypto.randomUUID(), callId: crypto.randomUUID() }) });
  return (await (await POST(request, { params: Promise.resolve({ operation: "context" }) })).json()).agent.greeting.en;
 };
 expect(await context()).toBe("Hello I’m the AI receptionist.");
 mocks.greeting = "Hi, I'm Suncrest's AI assistant. How can I help?";
 expect(await context()).toBe("Hi, I'm Suncrest's AI assistant. How can I help?");
});
