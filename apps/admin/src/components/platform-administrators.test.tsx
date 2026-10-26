// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlatformAdministrators } from "./platform-administrators";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
let admins: Array<{ id: string; email: string; name: null }>;
let changes: Array<{ email: string; enabled: boolean }>;
let denyRemoval = false;
let client: QueryClient;
beforeEach(() => {
  admins = [{ id: "me", email: "owner@example.test", name: null }]; changes = []; denyRemoval = false;
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") {
      const input = JSON.parse(String(options.body)); changes.push(input);
      if (!input.enabled && denyRemoval) return Response.json({ error: "The last platform administrator cannot be removed." }, { status: 409 });
      admins = input.enabled ? [...admins, { id: "other", email: input.email, name: null }] : admins.filter(admin => admin.email !== input.email);
      return Response.json({ ok: true });
    }
    return Response.json({ admins, currentUserId: "me" });
  }));
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
function mount() { render(<QueryClientProvider client={client}><PlatformAdministrators /></QueryClientProvider>); }
it("adds an administrator, confirms removal, and disables removal of the final admin", async () => {
  mount(); const user = userEvent.setup();
  await screen.findByText("owner@example.test");
  expect((screen.getByRole("button", { name: "administrators.remove" }) as HTMLButtonElement).disabled).toBe(true);
  await user.type(screen.getByLabelText("administrators.email"), "other@example.test");
  await user.click(screen.getByRole("button", { name: "administrators.add" }));
  await screen.findByText("other@example.test");
  expect(changes).toEqual([{ email: "other@example.test", enabled: true }]);
  const row = screen.getByText("other@example.test").closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "administrators.remove" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(changes).toHaveLength(1);
  await user.click(within(dialog).getByRole("button", { name: "administrators.remove" }));
  await waitFor(() => expect(screen.queryByText("other@example.test")).toBeNull());
  expect(changes[1]).toEqual({ email: "other@example.test", enabled: false });
  expect((screen.getByRole("button", { name: "administrators.remove" }) as HTMLButtonElement).disabled).toBe(true);
});
it("keeps a failed removal visible in the confirmation dialog", async () => {
  admins.push({ id: "other", email: "other@example.test", name: null }); denyRemoval = true;
  mount(); const user = userEvent.setup();
  const row = (await screen.findByText("other@example.test")).closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "administrators.remove" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "administrators.remove" }));
  await within(dialog).findByText("The last platform administrator cannot be removed.");
  expect(screen.getByText("other@example.test")).toBeTruthy();
});
