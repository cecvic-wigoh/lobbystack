import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), list: vi.fn(), save: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ listPlatformAdministrators: mocks.list, setPlatformAdministrator: mocks.save }));
vi.mock("@/lib/auth", () => ({ getAuthDatabase: () => ({ db: "auth" }) }));
vi.mock("@/lib/api-helpers", async original => ({ ...await original<typeof import("@/lib/api-helpers")>(), requireApiSession: mocks.session }));
import { GET, PATCH } from "./route";
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ user: { id: "actor" } }); mocks.save.mockResolvedValue({ ok: true }); mocks.list.mockResolvedValue([]); });
const request = (body: unknown) => new Request("https://app.test/api/platform/admins", { method: "PATCH", body: JSON.stringify(body) });
it("validates input and takes the acting user only from the authenticated session", async () => {
  for (const body of [{ email: "bad", enabled: true }, { email: "admin@example.test", enabled: "yes" }]) expect((await PATCH(request(body))).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
  expect((await PATCH(request({ email: "admin@example.test", enabled: true, userId: "spoofed" }))).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith({ db: "auth" }, { email: "admin@example.test", enabled: true, userId: "actor" });
});
it("requires login and propagates forbidden and last-admin failures", async () => {
  mocks.session.mockRejectedValueOnce(Response.json({ error: "Unauthorized" }, { status: 401 }));
  expect((await GET(new Request("https://app.test/api/platform/admins"))).status).toBe(401);
  mocks.list.mockRejectedValueOnce(Object.assign(new Error("Forbidden"), { status: 403 }));
  expect((await GET(new Request("https://app.test/api/platform/admins"))).status).toBe(403);
  mocks.save.mockRejectedValueOnce(Object.assign(new Error("Last administrator"), { status: 409 }));
  expect((await PATCH(request({ email: "admin@example.test", enabled: false }))).status).toBe(409);
});
