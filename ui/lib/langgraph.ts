import "server-only";
import { Client } from "@langchain/langgraph-sdk";

export function langgraphClient() {
  if (!process.env.LANGGRAPH_ASSISTANT_ID)
    throw new Error("LangGraph assistant must be configured.");
  return new Client({
    apiUrl: getLangGraphApiUrl(),
    apiKey: process.env.LANGGRAPH_API_KEY || undefined,
    // Retrying a run automatically after a network failure can incur duplicate usage.
    callerOptions: { maxRetries: 0 },
  });
}

export function getLangGraphApiUrl(): string {
  if (process.env.LANGGRAPH_API_URL) {
    return process.env.LANGGRAPH_API_URL;
  }

  if (process.env.LANGGRAPH_HOSTPORT) {
    return `http://${process.env.LANGGRAPH_HOSTPORT}`;
  }

  throw new Error("LANGGRAPH_API_URL or LANGGRAPH_HOSTPORT must be configured");
}
