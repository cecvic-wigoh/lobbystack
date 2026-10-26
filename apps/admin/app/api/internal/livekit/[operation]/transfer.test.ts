import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  call: { id: "00000000-0000-4000-8000-000000000002", endedAt: null, gatewaySessionId: "lobby-00000000-0000-4000-8000-000000000003", webCallMaxDurationMs: 300000 },
  snapshot: { displayName: "CertNova", defaultLocale: "en", timezone: "UTC", greeting: "Hello", voiceInstructions: "", rules: [{ title: "Intake", content: "Ask which product the caller needs.", order: 0 }], transferPolicy: { mode: "on_request", transferNumber: "+13065550101" } },
  canTransfer: vi.fn(), advance: vi.fn(), create: vi.fn(), deleteRoom: vi.fn(), move: vi.fn(), message: vi.fn(), transaction: vi.fn(), claim: vi.fn(), reserve: vi.fn(), result: vi.fn(), dial: vi.fn(), remove: vi.fn(), participants: vi.fn(),
}));
vi.mock("@lobbystack/db", async original => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: mocks.transaction }));
vi.mock("@lobbystack/domain", () => ({
  canTransferToHuman: mocks.canTransfer,
  getCachedBusinessSnapshot: async () => mocks.snapshot, claimLivekitTransfer: mocks.claim, prepareLiveCallTransfer: mocks.reserve, recordLiveCallTransferResult: mocks.result,
  advanceLivekitTransfer: mocks.advance, createVoiceFollowUpTask: mocks.message, completeCall: vi.fn(), markLiveCallMediaStarted: vi.fn(), saveLiveCallTurn: vi.fn(),
}));
vi.mock("@lobbystack/agent-core", () => ({ createAgentModel: vi.fn(), answerGroundedQuestion: vi.fn() }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));
vi.mock("@/lib/livekit", () => ({ livekitConfig: () => ({ url: "wss://livekit.test", key: "test-key", secret: "test-secret", sip: { createSipParticipant: mocks.dial }, rooms: { createRoom: mocks.create, deleteRoom: mocks.deleteRoom, moveParticipant: mocks.move, removeParticipant: mocks.remove, listParticipants: mocks.participants } }) }));
import { POST } from "./route";
const tenantId = "00000000-0000-4000-8000-000000000001";
const identity = `human-${mocks.call.id}`;
const room = "lobby-00000000-0000-4000-8000-000000000003";
function request(operation = "transfer", token = "s".repeat(32), extra = {}) {
  return POST(new Request("https://app.test/api/internal/livekit/transfer", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ tenantId, callId: mocks.call.id, ...extra }) }), { params: Promise.resolve({ operation }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.canTransfer.mockResolvedValue(true);
  vi.stubEnv("VOICE_PROVIDER", "livekit"); vi.stubEnv("INTERNAL_SERVICE_TOKEN", "s".repeat(32)); vi.stubEnv("LIVEKIT_SIP_OUTBOUND_TRUNK_ID", "ST_test");
  mocks.snapshot.transferPolicy.mode = "on_request";
  mocks.transaction.mockResolvedValue(mocks.call);
  mocks.claim.mockResolvedValue({ room, remainingSeconds: 180 }); mocks.advance.mockResolvedValue({ room, remainingSeconds: 180 }); mocks.reserve.mockResolvedValue(true);
  mocks.create.mockResolvedValue({}); mocks.deleteRoom.mockResolvedValue(undefined); mocks.move.mockResolvedValue(undefined);
  mocks.dial.mockResolvedValue({ participantId: "PA_test" }); mocks.remove.mockResolvedValue(undefined);
  mocks.participants.mockResolvedValue([{ identity }, { identity: `caller-${mocks.call.id}` }]);
});
afterEach(() => vi.unstubAllEnvs());
it("creates a private screening room without dialing or bridging", async () => {
  expect(await (await request("transfer", undefined, { destination: "+19005550101" })).json()).toMatchObject({ status: "screening", room: `${room}-transfer` });
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: `${room}-transfer`, maxParticipants: 2 }));
  expect(mocks.dial).not.toHaveBeenCalled(); expect(mocks.move).not.toHaveBeenCalled();
});
it("dials only the configured number into the private room and never directly bridges", async () => {
  expect(await (await request("transfer-dial", undefined, { destination: "+19005550101" })).json()).toMatchObject({ status: "answered" });
  expect(mocks.dial).toHaveBeenCalledWith("ST_test", "+13065550101", `${room}-transfer`, expect.objectContaining({ participantIdentity: identity, waitUntilAnswered: true, ringingTimeout: 20 }));
  expect(mocks.move).not.toHaveBeenCalled();
});
it("moves staff only on the trusted acceptance endpoint", async () => {
  expect(await (await request("transfer-accept")).json()).toMatchObject({ status: "connected" });
  expect(mocks.move).toHaveBeenCalledWith(`${room}-transfer`, identity, room);
  expect(mocks.result).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ok: true }));
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
  expect(await (await request("transfer-dial")).json()).toMatchObject({ status: "unavailable" });
  expect(mocks.remove).toHaveBeenCalledWith(room, identity);
  expect(mocks.result).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ok: false }));
});
it("disconnects the staff phone if the browser caller left during ringing", async () => {
  mocks.participants.mockResolvedValue([{ identity }]);
  expect(await (await request("transfer-dial")).json()).toMatchObject({ status: "unavailable" });
  expect(mocks.remove).toHaveBeenCalledWith(room, identity);
});

it("does not redial a claimed phase", async () => {
  mocks.advance.mockResolvedValue(null);
  expect(await (await request("transfer-dial")).json()).toMatchObject({ status: "unavailable" });
  expect(mocks.dial).not.toHaveBeenCalled();
});
it("requires a confirmed callback number and consent before saving a browser message", async () => {
  expect((await request("message", undefined, { payload: { name: "Alex", message: "Please call" } })).status).toBe(400);
  expect(mocks.message).not.toHaveBeenCalled();
  expect(await (await request("message", undefined, { payload: { name: "Alex", callbackPhone: "+13065550101", message: "Please call", permissionToContact: true } })).json()).toMatchObject({ status: "saved" });
  expect(mocks.message).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ businessId: tenantId, callId: mocks.call.id, channel: "web_voice" }));
});

it.each(["transfer", "transfer-dial", "transfer-accept"])("blocks %s on a lower tier before side effects", async operation => {
  mocks.canTransfer.mockResolvedValue(false);
  expect(await (await request(operation)).json()).toMatchObject({ status: "unavailable" });
  expect(mocks.dial).not.toHaveBeenCalled(); expect(mocks.move).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled();
});
it("still cancels and cleans up if the subscription changes during screening", async () => {
  mocks.canTransfer.mockResolvedValue(false);
  await request("transfer-cancel");
  expect(mocks.deleteRoom).toHaveBeenCalled(); expect(mocks.remove).toHaveBeenCalled();
});

it("passes saved intake rules to the voice agent while preserving the tier restriction", async () => {
  mocks.canTransfer.mockResolvedValue(false);
  const context = await (await request("context")).json();
  expect(context.agent.persona).toContain("Ask which product the caller needs.");
  expect(context.agent.enabledTools).not.toContain("escalateToHuman");
});
