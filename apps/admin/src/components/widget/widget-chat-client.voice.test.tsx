// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { WidgetChatClient } from "./widget-chat-client";

const mocks = vi.hoisted(() => ({ errorKey: "rateLimited", changeLanguage: vi.fn(), setMessages: vi.fn() }));
vi.mock("@ai-sdk/react", () => ({ useChat: () => ({ messages: [], setMessages: mocks.setMessages, status: "ready", sendMessage: vi.fn(), clearError: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en", changeLanguage: mocks.changeLanguage } }) }));
vi.mock("@/components/web-voice/useWebVoiceCall", () => ({ useWebVoiceCall: () => ({ status: "error", errorKey: mocks.errorKey, remoteAudioRef: { current: null }, startCall: vi.fn(), endCall: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, "scrollTo"); });
it.each([
 ["rateLimited", "chat.voiceRateLimited", "chat.voiceUnavailable"],
 ["unavailable", "chat.voiceUnavailable", "chat.voiceRateLimited"],
])("displays the correct widget message for %s", async (errorKey, expected, absent) => {
 Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
 vi.stubGlobal("ResizeObserver", class { observe = vi.fn(); disconnect = vi.fn(); });
 mocks.errorKey = errorKey;
 vi.stubGlobal("fetch", vi.fn(async (url: URL) => new Response(JSON.stringify(url.pathname.includes("config") ? {
  business: { id: "certnova", name: "CertNova", defaultLocale: "en" }, config: {}, billing: { chatAllowed: true, plan: "self_host" }, snapshotPresent: true, voiceEnabled: true, businessSlug: "certnova",
 } : { messages: [] }), { headers: { "content-type": "application/json" } })));
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
 render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="test" /></QueryClientProvider>);
 act(() => window.dispatchEvent(new MessageEvent("message", { source: window.parent, origin: window.location.origin, data: { type: "session", token: "test", parentOrigin: window.location.origin, visitorId: crypto.randomUUID() } })));
 await waitFor(() => expect(screen.getByText(expected)).toBeTruthy());
 expect(screen.queryByText(absent)).toBeNull();
 client.clear();
});
