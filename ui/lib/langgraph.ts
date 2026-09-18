import "server-only";
import { Client } from "@langchain/langgraph-sdk";

export function langgraphClient() {
  const apiUrl = process.env.LANGGRAPH_API_URL;
  if (!apiUrl || !process.env.LANGGRAPH_ASSISTANT_ID) throw new Error("LangGraph endpoint and assistant must be configured.");
  return new Client({
    apiUrl,
    apiKey: process.env.LANGGRAPH_API_KEY || undefined,
    // Retrying a run automatically after a network failure can incur duplicate usage.
    callerOptions: { maxRetries: 0 },
  });
}
