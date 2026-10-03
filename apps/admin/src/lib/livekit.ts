import { AccessToken, AgentDispatchClient, RoomServiceClient, TrackSource } from "livekit-server-sdk";

export function livekitConfig() {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (process.env.VOICE_PROVIDER !== "livekit" || !url || !key || !secret) throw new Error("LiveKit is not configured.");
  const http = url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return { url, key, secret, rooms: new RoomServiceClient(http, key, secret), dispatch: new AgentDispatchClient(http, key, secret) };
}

export async function createLivekitRoom(room: string) {
  const config = livekitConfig();
  await config.rooms.createRoom({ name: room, emptyTimeout: 60, maxParticipants: 2 });
  return config;
}

export async function livekitCallerToken(room: string, identity: string) {
  const config = livekitConfig();
  const token = new AccessToken(config.key, config.secret, { identity, ttl: 600 });
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: [TrackSource.MICROPHONE] });
  return token.toJwt();
}
