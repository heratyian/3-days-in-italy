"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Client, type Message as GraphMessage } from "@langchain/langgraph-sdk";
import { useStream } from "@langchain/langgraph-sdk/react";
import { publicMessage } from "@/lib/messages";
import Message from "./Message";
import PlaceDetails from "./PlaceDetails";
import { usePlaces } from "@/lib/use-places";
import type { Itinerary } from "@/lib/itinerary";
import ItineraryPanel from "./ItineraryPanel";
import { MapsPreference } from "./MapsPreference";
import ChatMenu from "./ChatMenu";

type Submission = { id: string; type: "human"; content: string };

const conversationStarters = [
  "🏛️ Help me plan my first three days in Rome.",
  "🍝 I'd love a three-day trip focused on Italian food and local markets.",
  "🖼️ Plan a relaxed three-day trip with art, history, and time to wander.",
  "🇮🇹 I have three days in Italy. Help me choose where to go.",
];

function errorText(error: unknown): string {
  const { status, name } = error as { status?: number; name?: string };
  if (status === 401) return "Your session has expired. Sign in again to continue.";
  if (status === 404) return "This conversation is no longer available. Start a new conversation.";
  if (status === 429) return "You've reached the message limit. Please wait a minute and try again.";
  if (status === 409) return "A response is already in progress. Please wait, then try again.";
  if (status === 400) return "This message couldn't be sent. Check its length and try again.";
  if (name === "AgentExecutionError") return "The assistant couldn't complete its response. Please try again.";
  return "Unable to connect to the assistant. Check your connection and try again.";
}

export default function Chat({ sessionId, maxMessageLength }: { sessionId: string; maxMessageLength: number }) {
  const storageKey = `langgraph_thread_id:${sessionId}`;
  const [ready, setReady] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [authExpired, setAuthExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const [lastSubmission, setLastSubmission] = useState<Submission | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const followNewest = useRef(true);
  const submitting = useRef(false);
  const failed = useRef(false);

  const client = useMemo(() => new Client({
    apiUrl: typeof window === "undefined" ? "http://localhost/api/chat" : `${window.location.origin}/api/chat`,
    apiKey: null,
    callerOptions: { maxRetries: 0 },
  }), []);

  function rememberThread(id: string | null) {
    setThreadId(id);
    try {
      if (id) localStorage.setItem(storageKey, id);
      else localStorage.removeItem(storageKey);
    } catch { /* Chat still works when browser storage is disabled. */ }
  }

  const stream = useStream<{ messages: GraphMessage[]; itinerary?: Itinerary | null }>({
    client,
    assistantId: "agent", // The server selects the configured assistant; the browser cannot override it.
    threadId,
    onThreadId: rememberThread,
    fetchStateHistory: false,
    reconnectOnMount: false,
    onError(error) {
      failed.current = true;
      setError(errorText(error));
      setAuthExpired((error as { status?: number }).status === 401);
    },
  });
  const busy = pending || stream.isLoading || stream.isThreadLoading;
  const visible = stream.messages.map(publicMessage).filter((message) => message !== null && message.content);
  const itinerary = threadId ? stream.values.itinerary : null;
  const placeData = usePlaces(visible.filter((message) => message!.type !== "human").map((message) => message!.content).join("\n"),
    itinerary?.days.flatMap((day) => day.stops.map((stop) => stop.place_id)));

  useEffect(() => {
    try { setThreadId(localStorage.getItem(storageKey)); } catch { /* Storage is optional. */ }
    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (followNewest.current && messages.current) messages.current.scrollTop = messages.current.scrollHeight;
  }, [stream.messages, busy]);

  async function send(submission?: Submission) {
    if (submitting.current || busy || authExpired || (!submission && !input.trim())) return;
    const message = submission ?? { id: crypto.randomUUID(), type: "human" as const, content: input.trim() };
    if (message.content.length > maxMessageLength) return;
    submitting.current = true;
    failed.current = false;
    followNewest.current = true;
    setPending(true);
    setError("");
    setLastSubmission(message);
    try {
      await stream.submit({ messages: [message] }, {
        // Reuse the message ID on retry so LangGraph replaces it instead of duplicating it.
        optimisticValues: (values) => ({ messages: [
          ...(values.messages ?? []).filter((existing) => existing.id !== message.id), message,
        ] }),
      });
      if (!failed.current) { setInput(""); setLastSubmission(null); }
    } catch (error) {
      setError(errorText(error));
    } finally {
      submitting.current = false;
      setPending(false);
      textarea.current?.focus();
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void send(); }

  function newConversation() {
    if (busy) return;
    rememberThread(null);
    setSelectedPlaceId(null);
    setInput(""); setError(""); setLastSubmission(null);
    followNewest.current = true;
    textarea.current?.focus();
  }

  async function logout() {
    const response = await fetch("/api/auth", { method: "DELETE" }).catch(() => null);
    if (response?.ok) { rememberThread(null); window.location.reload(); }
    else setError("Unable to sign out. Please try again.");
  }

  if (!ready) return <p className="py-4 text-body-secondary" role="status">Loading conversation…</p>;

  return <MapsPreference><section className="chat" aria-label="Conversation">
    <div className="d-flex flex-wrap align-items-center justify-content-between py-3 gap-2">
      <div className="d-flex align-items-center gap-2">
        <button className="btn btn-sm btn-dark" onClick={() => setItineraryOpen(!itineraryOpen)}
          aria-haspopup="dialog" aria-expanded={itineraryOpen} aria-controls="itinerary-panel">{itineraryOpen ? "Hide itinerary" : "View itinerary"}</button>
      </div>
      <ChatMenu busy={busy} onRestart={newConversation} onSignOut={() => void logout()} />
    </div>
    <div className="messages" ref={messages} role="log" aria-label="Messages" aria-live="polite" aria-relevant="additions text" onScroll={() => {
      const element = messages.current!;
      followNewest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    }}>
      {!visible.length && !busy && <div className="py-5 px-3 text-center text-body-secondary">
        <h2 className="h5 text-body">Where would you like to begin?</h2>
        <p>Choose an idea below, or tell me what you have in mind.</p>
        <div className="list-group list-group-flush text-start">
          {conversationStarters.map((prompt) => <div className="col" key={prompt}>
            <button type="button" className="list-group-item w-100 h-100 text-start p-3"
              disabled={authExpired || prompt.length > maxMessageLength}
              onClick={() => void send({ id: crypto.randomUUID(), type: "human", content: prompt })}>
              {prompt}
            </button>
          </div>)}
        </div>
      </div>}
      {visible.map((message, index) => <Message key={message!.id ?? index} human={message!.type === "human"} content={message!.content} onSelectPlace={setSelectedPlaceId} places={placeData.places} />)}
      {busy && <p className="small text-body-secondary px-3" role="status">{stream.isThreadLoading ? "Loading conversation…" : "Responding…"}</p>}
    </div>
    {error && <div className="alert alert-danger mb-2" role="alert">
      <p className="mb-2">{error}</p>
      {authExpired ? <button className="btn btn-sm btn-outline-danger" onClick={() => window.location.reload()}>Sign in</button>
        : <button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => lastSubmission ? void send(lastSubmission) : window.location.reload()}>Try again</button>}
    </div>}
    {placeData.error && <div className="alert alert-warning py-2" role="status">
      {placeData.error} <button className="btn btn-sm btn-link" onClick={placeData.retry}>Retry place details</button>
    </div>}
    <PlaceDetails place={selectedPlaceId ? placeData.places[selectedPlaceId] : undefined} onClose={() => setSelectedPlaceId(null)} />
    <form onSubmit={submit} className="composer border-top pt-3">
      <label className="visually-hidden" htmlFor="message">Message</label>
      <div className="d-flex gap-2 align-items-end">
        <textarea id="message" ref={textarea} className="form-control" rows={2} placeholder="Message…" autoFocus
          value={input} maxLength={maxMessageLength} readOnly={busy || authExpired} aria-describedby="message-help"
          onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault(); void send();
            }
          }} />
        <button type="submit" className="btn btn-dark px-4" disabled={busy || authExpired || !input.trim()}>Send</button>
      </div>
    </form>
    <ItineraryPanel open={itineraryOpen} itinerary={itinerary} places={placeData.places} busy={busy}
      onClose={() => setItineraryOpen(false)} onSelectPlace={setSelectedPlaceId} />
  </section></MapsPreference>;
}
