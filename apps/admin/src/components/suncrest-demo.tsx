"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, GraduationCap, MessageCircle, Mic, ShieldCheck } from "lucide-react";
import { AuraVoiceDemo } from "./web-voice/AuraVoiceDemo";
import styles from "./suncrest-demo.module.css";

type Session = { token: string; visitorId: string; expiresAt: string; businessSlug: string };
const suggestions = [
  { icon: GraduationCap, label: "Find my next step", question: "Who should I contact about admission to Suncrest College?" },
  { icon: BookOpen, label: "Explore a course", question: "What does the 1072 Awareness course cover?" },
  { icon: ShieldCheck, label: "Understand requirements", question: "Can I take ACCUPLACER before applying for a program?" },
];

/** A presentation of the real, origin-restricted widget, using its existing APIs. */
export function SuncrestDemo({ widgetKey }: { widgetKey: string }) {
  const [mode, setMode] = useState<"voice" | "chat">("voice");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const pendingQuestion = useRef<string | null>(null);
  const voiceControls = useRef<{ forceEndCall: () => Promise<void> } | null>(null);
  const visitor = useRef<string>("");

  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    visitor.current ||= crypto.randomUUID();
    const load = async () => {
      setError(false);
      try {
        const response = await fetch("/api/widget/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ widgetKey, visitorId: visitor.current }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw new Error("Session unavailable");
        const issued = await response.json() as { token: string; expiresAt: string };
        const configResponse = await fetch("/api/widget/config", { headers: { authorization: `Bearer ${issued.token}`, "x-widget-parent-origin": window.location.origin }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) });
        if (!configResponse.ok) throw new Error("Configuration unavailable");
        const config = await configResponse.json() as { businessSlug: string; snapshotPresent: boolean; billing: { chatAllowed: boolean; voiceAllowed: boolean } };
        if (!config.snapshotPresent || !config.businessSlug || !config.billing.chatAllowed || !config.billing.voiceAllowed) throw new Error("Receptionist unavailable");
        setSession({ ...issued, visitorId: visitor.current, businessSlug: config.businessSlug });
        timer = setTimeout(() => void load(), Math.max(30000, Date.parse(issued.expiresAt) - Date.now() - 60000));
      } catch {
        if (!abort.signal.aborted) { setSession(null); setError(true); }
      }
    };
    void load();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [widgetKey, retry]);

  const syncFrame = useCallback(() => {
    if (!session) return;
    frame.current?.contentWindow?.postMessage({ type: "session", token: session.token, expiresAt: session.expiresAt, visitorId: session.visitorId, parentOrigin: window.location.origin }, window.location.origin);
  }, [session]);
  useEffect(() => {
    syncFrame();
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === frame.current?.contentWindow && event.data?.type === "ready") {
        syncFrame();
        if (pendingQuestion.current) {
          frame.current?.contentWindow?.postMessage({ type: "suggested-question", question: pendingQuestion.current }, window.location.origin);
          pendingQuestion.current = null;
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [syncFrame, mode]);

  const getHeaders = useCallback(() => ({ authorization: `Bearer ${session?.token ?? ""}`, "x-widget-parent-origin": window.location.origin }), [session]);
  const getStartPayload = useCallback(async () => ({ visitorId: visitor.current }), []);
  const registerControls = useCallback((controls: { forceEndCall: () => Promise<void> }) => { voiceControls.current = controls; }, []);
  const switchMode = async (next: "voice" | "chat") => {
    if (mode === next) return;
    await voiceControls.current?.forceEndCall();
    setMode(next);
  };

  return <main className={styles.page}>
    <header className={styles.header}>
      <img src="/brand/suncrest/logo.svg" alt="Suncrest College" width={180} height={72} />
      <span className={styles.preview}>AI receptionist preview</span>
      <a href="https://suncrestcollege.ca/" target="_blank" rel="noopener noreferrer">College website <ArrowUpRight size={15} /></a>
    </header>
    <section className={styles.hero}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}><span /> A welcoming first conversation</p>
        <h1>Your next chapter.<br /><span>Let’s talk about it.</span></h1>
        <p className={styles.description}>Meet Suncrest’s AI receptionist. Ask about programs, admissions, and student life—in your own words.</p>
        <div className={styles.suggestions}>
          <p>Start with something you’re curious about</p>
          {suggestions.map(({ icon: Icon, label, question }) => <button key={label} type="button" onClick={() => { if (mode === "chat") frame.current?.contentWindow?.postMessage({ type: "suggested-question", question }, window.location.origin); else { pendingQuestion.current = question; void switchMode("chat"); } }} className={styles.suggestion}>
            <Icon size={20} /><span><strong>{label}</strong><span>{question}</span></span><ArrowUpRight size={16} />
          </button>)}
        </div>
        <div className={styles.trust}><ShieldCheck size={18} /><p>Answers grounded in the college’s published information. When a detail can’t be confirmed, we’ll say so.</p></div>
      </div>
      <div className={styles.experience}>
        <div className={styles.modeSwitch} role="group" aria-label="Choose how to talk">
          <button type="button" aria-pressed={mode === "voice"} onClick={() => void switchMode("voice")}><Mic size={16} /> Talk naturally</button>
          <button type="button" aria-pressed={mode === "chat"} onClick={() => void switchMode("chat")}><MessageCircle size={16} /> Type a question</button>
        </div>
        {error ? <div className={styles.waiting} role="alert"><h2>Let’s reconnect.</h2><p>The receptionist couldn’t connect. Please try again.</p><button onClick={() => setRetry(value => value + 1)}>Try again</button></div> : !session ? <div className={styles.waiting} role="status"><span className={styles.loading} /><p>Getting your receptionist ready…</p></div> : mode === "voice" ? <div className={styles.voice}>
          <p className={styles.voiceLabel}>SUNCREST COLLEGE</p>
          <AuraVoiceDemo businessSlug={session.businessSlug} endpoint="/api/voice/livekit/session" widgetId="lobbystack-widget" getHeaders={getHeaders} getStartPayload={getStartPayload} onRegisterControls={registerControls} auraTone="light" />
          <p className={styles.voiceHint}>Click to start, allow your microphone, and say hello.<br />You can interrupt or ask a follow-up, just like a conversation.<br />Preview calls last up to 5 minutes. Each connection can start 5 calls per hour and 10 per day.</p>
        </div> : <iframe ref={frame} title="Chat with Suncrest College" className={styles.chat} src={`/embed/${encodeURIComponent(widgetKey)}`} allow="microphone" onLoad={syncFrame} />}
        <div className={styles.disclosure}><span /> AI receptionist · Voice and chat</div>
      </div>
    </section>
    <footer className={styles.footer}><span>Built for Suncrest College</span><span>Programs. People. Possibilities.</span><span>Demonstration · October 2026</span></footer>
  </main>;
}
