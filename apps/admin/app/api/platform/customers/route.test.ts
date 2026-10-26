import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), open: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ createPlatformCustomer: mocks.create, listPlatformCustomers: mocks.list, openPlatformCustomer: mocks.open }));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({}) }));
vi.mock("@/lib/api-helpers", async original => ({ ...await original<typeof import("@/lib/api-helpers")>(), requireApiSession: async () => ({ user: { id: "operator" } }), getDispatcherDatabase: () => ({ db: {} }) }));
import { GET, POST, PATCH } from "./route";
beforeEach(() => { vi.resetAllMocks(); mocks.create.mockResolvedValue({ businessId: "created" }); });
function post(body: unknown) { return POST(new Request("https://app.test/api/platform/customers", { method: "POST", body: JSON.stringify(body) })); }
const input = { name: "Client", email: "CLIENT@example.test", timezone: "America/Regina", businessType: "service_company" };
it("validates the email and timezone before creating a customer", async () => {
  expect((await post({ ...input, email: "bad" })).status).toBe(400);
  expect((await post({ ...input, timezone: "Mars/Olympus" })).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
  expect((await post(input)).status).toBe(201);
  expect(mocks.create).toHaveBeenCalledWith({}, { ...input, email: "client@example.test", userId: "operator" });
});
it("returns authorization failures on every operation", async () => {
  const denied = Object.assign(new Error("Forbidden"), { status: 403 });
  mocks.create.mockRejectedValue(denied); mocks.list.mockRejectedValue(denied); mocks.open.mockRejectedValue(denied);
  expect((await post(input)).status).toBe(403);
  expect((await GET(new Request("https://app.test/api/platform/customers"))).status).toBe(403);
  expect((await PATCH(new Request("https://app.test/api/platform/customers", { method: "PATCH", body: JSON.stringify({ businessId: "00000000-0000-4000-8000-000000000001" }) }))).status).toBe(403);
});
