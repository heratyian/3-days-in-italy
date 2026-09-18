import { cookies } from "next/headers";
import { readSession, sameOrigin, SESSION_COOKIE } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http";
import { langgraphClient } from "@/lib/langgraph";
import { publicMessage, publicValues, readUserMessage } from "@/lib/messages";
import { allowRequest, positiveInteger } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return errorResponse("Sign in to continue.", 401);
  if (request.method === "POST" && !sameOrigin(request)) return errorResponse("Request not allowed.", 403);
  const { path } = await context.params;
  const route = path.join("/");
  const create = route === "threads" && request.method === "POST";
  const state = /^threads\/[a-f0-9-]{36}\/state$/i.test(route) && request.method === "GET";
  const run = /^threads\/[a-f0-9-]{36}\/runs\/stream$/i.test(route) && request.method === "POST";
  if (!create && !state && !run) return errorResponse("Not found.", 404);

  try {
    const client = langgraphClient();
    if (create) {
      if (!allowRequest(`threads:${session.id}`, 20)) return errorResponse("Please wait a minute before starting another conversation.", 429);
      const thread = await client.threads.create({ metadata: { testing_session: session.id } });
      return Response.json({ thread_id: thread.thread_id }, { headers: { "Cache-Control": "no-store" } });
    }

    const threadId = path[1];
    const thread = await client.threads.get(threadId);
    if (thread.metadata?.testing_session !== session.id) return errorResponse("Conversation not found.", 404);

    if (state) {
      const saved = await client.threads.getState(threadId);
      // The hook only needs the current checkpoint and visible messages, not graph internals.
      return Response.json({ values: publicValues(saved.values), checkpoint: saved.checkpoint,
        next: [], tasks: [], created_at: saved.created_at, parent_checkpoint: null,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const maxLength = positiveInteger(process.env.MAX_MESSAGE_LENGTH, 10000);
    let message;
    try {
      message = readUserMessage(await readJson(request, maxLength * 6 + 4096), maxLength);
    } catch {
      return errorResponse(`Send one nonempty message of at most ${maxLength} characters.`, 400);
    }
    if (!allowRequest(`runs:${session.id}`, positiveInteger(process.env.RATE_LIMIT_PER_MINUTE, 20))) {
      return errorResponse("Message limit reached. Try again in a minute.", 429);
    }
    if (!allowRequest(`duplicate:${session.id}:${message.id}`, 1, 3000)) {
      return errorResponse("This message was already submitted. Please wait.", 409);
    }

    const abort = new AbortController();
    const events = client.runs.stream(threadId, process.env.LANGGRAPH_ASSISTANT_ID!, {
      input: { messages: [message] },
      streamMode: ["messages-tuple", "values"],
      config: { recursion_limit: 60 },
      multitaskStrategy: "reject", // LangGraph also rejects concurrent runs across app replicas.
      onDisconnect: "cancel",
      signal: AbortSignal.any([request.signal, abort.signal]),
    });
    // Start the SDK request before sending HTTP 200 so API failures retain their status.
    const first = await events.next();
    const encoder = new TextEncoder();
    let next = first;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          while (!next.done) {
            const { event, data } = next.value;
            let safeData: unknown;
            if (event === "values") safeData = publicValues(data);
            if (event === "messages") {
              const message = publicMessage((data as unknown[])[0]);
              if (message) safeData = [message, {}];
            }
            if (event === "error") {
              console.error("LangGraph run failed", data);
              safeData = { error: "AgentExecutionError", message: "The assistant could not complete its response." };
            }
            // SDK handles upstream streaming; this boundary forwards only public chat events.
            if (safeData !== undefined) {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(safeData)}\n\n`));
              next = await events.next();
              return;
            }
            next = await events.next();
          }
          controller.close();
        } catch (error) {
          console.error("LangGraph stream failed", error);
          if (!abort.signal.aborted && !request.signal.aborted) {
            controller.enqueue(encoder.encode('event: error\ndata: {"error":"ConnectionError","message":"The connection was interrupted."}\n\n'));
            controller.close();
          }
        }
      },
      async cancel() { abort.abort(); await events.return(undefined); },
    });
    return new Response(body, { headers: {
      "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
    } });
  } catch (error) {
    console.error("LangGraph request failed", error);
    const status = (error as { status?: number }).status;
    if (status === 404) return errorResponse("Conversation not found. Start a new conversation.", 404);
    if (status === 409) return errorResponse("The assistant is already responding. Please wait.", 409);
    return errorResponse("Unable to connect to the assistant. Please try again.", 502);
  }
}

export { handle as GET, handle as POST };
