import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  call: { id: "00000000-0000-4000-8000-000000000002", endedAt: null, webCallMaxDurationMs: 300000 },
  snapshot: { displayName: "CertNova", defaultLocale: "en", timezone: "UTC", greeting: "Hello", voiceInstructions: "", transferPolicy: { mode: "on_request", transferNumber: "+13065550101" } },
  transaction: vi.fn(), claim: vi.fn(), reserve: vi.fn(), result: vi.fn(), dial: vi.fn(), remove: vi.fn(), participants: vi.fn(),
}));
vi.mock("@lobbystack/db", async original => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: mocks.transaction }));
vi.mock("@lobbystack/domain", () => ({
  getCachedBusinessSnapshot: async () => mocks.snapshot, claimLivekitTransfer: mocks.claim, prepareLiveCallTransfer: mocks.reserve, recordLiveCallTransferResult: mocks.result,
  completeCall: vi.fn(), markLiveCallMediaStarted: vi.fn(), saveLiveCallTurn: vi.fn(),
}));
vi.mock("@lobbystack/agent-core", () => ({ createAgentModel: vi.fn(), answerGroundedQuestion: vi.fn() }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));
vi.mock("@/lib/livekit", () => ({ livekitConfig: () => ({ sip: { createSipParticipant: mocks.dial }, rooms: { removeParticipant: mocks.remove, listParticipants: mocks.participants } }) }));
import { POST } from "./route";
const tenantId = "00000000-0000-4000-8000-000000000001";
const identity = `human-${mocks.call.id}`;
const room = "lobby-00000000-0000-4000-8000-000000000003";
function request(operation = "transfer", token = "s".repeat(32), extra = {}) {
  return POST(new Request("https://app.test/api/internal/livekit/transfer", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ tenantId, callId: mocks.call.id, ...extra }) }), { params: Promise.resolve({ operation }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VOICE_PROVIDER", "livekit"); vi.stubEnv("INTERNAL_SERVICE_TOKEN", "s".repeat(32)); vi.stubEnv("LIVEKIT_SIP_OUTBOUND_TRUNK_ID", "ST_test");
  mocks.snapshot.transferPolicy.mode = "on_request";
  mocks.transaction.mockResolvedValue(mocks.call);
  mocks.claim.mockResolvedValue({ room, remainingSeconds: 180 }); mocks.reserve.mockResolvedValue(true);
  mocks.dial.mockResolvedValue({ participantId: "PA_test" }); mocks.remove.mockResolvedValue(undefined);
  mocks.participants.mockResolvedValue([{ identity }, { identity: `caller-${mocks.call.id}` }]);
});
afterEach(() => vi.unstubAllEnvs());
it("dials only the business-configured number and waits for the answer", async () => {
  expect(await (await request("transfer", undefined, { destination: "+19005550101" })).json()).toMatchObject({ status: "connected" });
  expect(mocks.transaction).toHaveBeenCalledWith(expect.anything(), { businessId: tenantId, actorType: "worker" }, expect.any(Function));
  expect(mocks.claim).toHaveBeenCalledWith(expect.anything(), { businessId: tenantId, callId: mocks.call.id });
  expect(mocks.dial).toHaveBeenCalledWith("ST_test", "+13065550101", room, expect.objectContaining({ participantIdentity: identity, waitUntilAnswered: true, ringingTimeout: 20, maxCallDuration: 180 }));
  expect(mocks.result).toHaveBeenCalledWith(expect.anything(), { businessId: tenantId, callId: mocks.call.id, ok: true });
});
it("rejects unauthorized and wrong-workspace calls before dialing", async () => {
  expect((await request("transfer", "wrong")).status).toBe(401);
  expect(mocks.transaction).not.toHaveBeenCalled();
  mocks.transaction.mockResolvedValue(undefined);
  expect((await request()).status).toBe(404);
  expect(mocks.dial).not.toHaveBeenCalled();
});
it("does not dial a disabled, repeated, or unentitled transfer", async () => {
  mocks.snapshot.transferPolicy.mode = "never";
  expect(await (await request()).json()).toMatchObject({ status: "unavailable" });
  expect(mocks.claim).not.toHaveBeenCalled();
  mocks.snapshot.transferPolicy.mode = "on_request"; mocks.claim.mockResolvedValue(null);
  expect(await (await request()).json()).toMatchObject({ status: "unavailable" });
  mocks.claim.mockResolvedValue({ room, remainingSeconds: 180 }); mocks.reserve.mockResolvedValue(false);
  expect(await (await request()).json()).toMatchObject({ status: "unavailable" });
  expect(mocks.dial).not.toHaveBeenCalled();
});
it("cleans up busy, unanswered, and unknown outcomes without claiming success", async () => {
  mocks.dial.mockRejectedValue(new Error("SIP 486"));
  expect(await (await request()).json()).toMatchObject({ status: "unavailable" });
  expect(mocks.remove).toHaveBeenCalledWith(room, identity);
  expect(mocks.result).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ok: false }));
});
it("disconnects the staff phone if the browser caller left during ringing", async () => {
  mocks.participants.mockResolvedValue([{ identity }]);
  expect(await (await request()).json()).toMatchObject({ status: "unavailable" });
  expect(mocks.remove).toHaveBeenCalledWith(room, identity);
});
