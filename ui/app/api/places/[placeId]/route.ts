import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { getLangGraphApiUrl } from "@/lib/langgraph";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ placeId: string }> }) {
  if (!readSession((await cookies()).get(SESSION_COOKIE)?.value)) {
    return errorResponse("Sign in to continue.", 401);
  }
  const { placeId } = await context.params;
  if (!/^place_\d+$/.test(placeId)) return errorResponse("Place not found.", 404);
  try {
    const response = await fetch(`${getLangGraphApiUrl().replace(/\/$/, "")}/places/${placeId}`, {
      headers: process.env.LANGGRAPH_API_KEY ? { "x-api-key": process.env.LANGGRAPH_API_KEY } : {},
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    if (response.status === 404) {
      const body = await response.json();
      if (body.code === "place_not_found") return errorResponse("Place not found.", 404);
      // A missing backend route is a service failure, not a missing dataset record.
      throw new Error("The agent's place endpoint is unavailable. Restart the agent to load its route configuration.");
    }
    if (!response.ok) throw new Error(`Place lookup returned ${response.status}`);
    return Response.json(await response.json(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Place lookup failed", error);
    return errorResponse("Unable to load place details. Please try again.", 502);
  }
}
