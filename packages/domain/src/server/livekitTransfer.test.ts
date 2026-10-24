import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ call: undefined as Record<string, unknown> | undefined, transaction: vi.fn() }));
vi.mock("@lobbystack/db", async original => ({ ...(await original<typeof import("@lobbystack/db")>()), withBusinessTransaction: state.transaction }));
import { advanceLivekitTransfer, claimLivekitTransfer } from "./liveCalls";
const input = { businessId: "biz_1", callId: "call_1" };
const context = { db: {} } as Parameters<typeof claimLivekitTransfer>[0];
beforeEach(() => {
  state.call = { id: input.callId, provider: "livekit", transport: "web_voice", endedAt: null, mediaStartedAt: new Date(), gatewaySessionId: "lobby-00000000-0000-4000-8000-000000000003", webCallMaxDurationMs: 300000, transferState: null };
  const query = { from: () => query, where: () => query, limit: () => query, for: async (lock: string) => { expect(lock).toBe("update"); return state.call ? [state.call] : []; } };
  state.transaction.mockImplementation(async (_db, scope, callback) => {
    expect(scope).toEqual({ businessId: input.businessId, actorType: "worker" });
    return callback({ select: () => query, update: () => ({ set: (patch: object) => ({ where: async () => Object.assign(state.call!, patch) }) }) });
  });
});
it("durably claims an active browser call before dialing, then rejects another attempt", async () => {
  expect(await claimLivekitTransfer(context, input)).toMatchObject({ room: state.call!.gatewaySessionId });
  expect(state.call!.transferState).toBe("claiming");
  expect(await claimLivekitTransfer(context, input)).toBeNull();
});
it.each([
  { endedAt: new Date() }, { provider: "twilio" }, { transport: "voice" }, { mediaStartedAt: null },
  { gatewaySessionId: "other-room" }, { transferState: "failed" }, { mediaStartedAt: new Date(Date.now() - 280000) },
])("does not claim an ineligible call: %j", async patch => {
  Object.assign(state.call!, patch);
  expect(await claimLivekitTransfer(context, input)).toBeNull();
});
it("does not claim a call absent from the scoped workspace", async () => {
  state.call = undefined;
  expect(await claimLivekitTransfer(context, input)).toBeNull();
});

it("advances screening exactly once and rejects stale or ended phases", async () => {
  state.call!.transferState = "preparing";
  const phase = { ...input, from: "preparing", to: "ringing" };
  expect(await advanceLivekitTransfer(context, phase)).toMatchObject({ room: state.call!.gatewaySessionId });
  expect(state.call!.transferState).toBe("ringing");
  expect(await advanceLivekitTransfer(context, phase)).toBeNull();
  state.call!.endedAt = new Date();
  expect(await advanceLivekitTransfer(context, { ...input, from: "ringing", to: "screening" })).toBeNull();
});
