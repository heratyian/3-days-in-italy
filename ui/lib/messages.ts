import { publicItinerary } from "./itinerary";

/** Only traveler-visible messages and saved route fields cross the proxy; tool results and reasoning stay in Studio. */
export function publicMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  const type = message.type;
  if (type !== "human" && type !== "ai" && type !== "AIMessageChunk") return null;
  const content = typeof message.content === "string" ? message.content
    : Array.isArray(message.content) ? message.content.flatMap((block) =>
      block && block.type === "text" && typeof block.text === "string" ? [block.text] : []
    ).join("") : "";
  return { type: type === "human" ? "human" as const : "ai" as const, content,
    ...(typeof message.id === "string" ? { id: message.id } : {}) };
}

export function publicValues(value: unknown) {
  const messages = value && typeof value === "object" && "messages" in value ? value.messages : [];
  const itinerary = value && typeof value === "object" && "itinerary" in value ? publicItinerary(value.itinerary) : null;
  return { messages: Array.isArray(messages) ? messages.map(publicMessage).filter((message) => message !== null) : [], itinerary };
}

export function readUserMessage(body: unknown, maxLength: number) {
  const messages = (body as { input?: { messages?: unknown } } | null)?.input?.messages;
  if (!Array.isArray(messages) || messages.length !== 1) throw new Error("Supply one message.");
  const message = messages[0];
  if (!message || message.type !== "human" || typeof message.content !== "string"
    || !message.content.trim() || message.content.length > maxLength
    || typeof message.id !== "string" || !/^[a-f0-9-]{36}$/i.test(message.id)) {
    throw new Error("Invalid message.");
  }
  // Ignore client-supplied state, tool calls, config, commands, and assistant IDs.
  return { type: "human" as const, content: message.content.trim(), id: message.id };
}
