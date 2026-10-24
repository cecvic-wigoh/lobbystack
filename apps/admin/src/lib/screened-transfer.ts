import { AccessToken } from "livekit-server-sdk";
import { advanceLivekitTransfer, claimLivekitTransfer, prepareLiveCallTransfer, recordLiveCallTransferResult } from "@lobbystack/domain";
import { createWorkerDomainContext } from "./domain-context";
import { livekitConfig } from "./livekit";

export async function screenedTransfer(operation: string, input: { businessId: string; callId: string; room: string; target: string; name: string }) {
  const domain = createWorkerDomainContext();
  const config = livekitConfig();
  const scope = { businessId: input.businessId, callId: input.callId };
  const room = `${input.room}-transfer`;
  const identity = `human-${input.callId}`;
  const unavailable = { status: "unavailable", message: "The team is unavailable. Offer to take a message using captureLead. Do not retry or claim a message is saved yet." };
  const callerPresent = async () => (await config.rooms.listParticipants(input.room)).some(p => p.identity === `caller-${input.callId}`);
  const cancel = async () => {
    await Promise.allSettled([config.rooms.deleteRoom(room), config.rooms.removeParticipant(input.room, identity)]);
    await recordLiveCallTransferResult(domain, { ...scope, ok: false });
    return unavailable;
  };
  try {
    if (operation === "transfer-cancel") return await cancel();
    if (operation === "transfer") {
      const claimed = await claimLivekitTransfer(domain, scope);
      if (!claimed) return unavailable;
      if (!await prepareLiveCallTransfer(domain, scope)) return unavailable;
      if (!await callerPresent()) return await cancel();
      await config.rooms.createRoom({ name: room, emptyTimeout: 45, maxParticipants: 2 });
      const token = new AccessToken(config.key, config.secret, { identity: `screen-${input.callId}`, ttl: 90 });
      token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false });
      return { status: "screening", url: config.url, room, token: await token.toJwt() };
    }
    if (operation === "transfer-dial") {
      const claimed = await advanceLivekitTransfer(domain, { ...scope, from: "preparing", to: "ringing" });
      if (!claimed) return unavailable;
      if (!await callerPresent()) return await cancel();
      await config.sip.createSipParticipant(process.env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID!, input.target, room, {
        participantIdentity: identity, participantName: `${input.name} team`, hidePhoneNumber: true,
        waitUntilAnswered: true, playDialtone: false, ringingTimeout: 20, timeout: 30,
        maxCallDuration: claimed.remainingSeconds,
      });
      if (!await callerPresent() || !await advanceLivekitTransfer(domain, { ...scope, from: "ringing", to: "screening" })) return await cancel();
      return { status: "answered" };
    }
    const claimed = await advanceLivekitTransfer(domain, { ...scope, from: "screening", to: "merging" });
    if (!claimed) return unavailable;
    if (!await callerPresent()) return await cancel();
    // Only the authenticated worker invokes this after a DTMF 1 from the staff participant.
    await config.rooms.moveParticipant(room, identity, input.room);
    if (!await callerPresent() || !await advanceLivekitTransfer(domain, { ...scope, from: "merging", to: "accepted" })) return await cancel();
    await recordLiveCallTransferResult(domain, { ...scope, ok: true });
    await config.rooms.deleteRoom(room).catch(() => {});
    return { status: "connected", message: "The staff member pressed 1 and is connected. Stop speaking." };
  } catch {
    return await cancel();
  }
}
