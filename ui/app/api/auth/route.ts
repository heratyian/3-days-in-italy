import { cookies } from "next/headers";
import { createSession, equalSecrets, sameOrigin, SESSION_COOKIE } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http";
import { allowRequest } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Request not allowed.", 403);
  const password = process.env.TEST_AUTH_PASSWORD;
  if (!password) return errorResponse("Testing access is not configured yet.", 503);
  // Forwarded IPs should be supplied/overwritten by the trusted deployment proxy.
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowRequest(`login:${address}`, 10))
    return errorResponse("Too many attempts. Try again in a minute.", 429);
  let body;
  try {
    body = (await readJson(request, 4096)) as { username?: unknown; password?: unknown };
  } catch {
    return errorResponse("Invalid login request.", 400);
  }
  const username = process.env.TEST_AUTH_USERNAME;
  if (
    !body ||
    typeof body.password !== "string" ||
    !equalSecrets(body.password, password) ||
    (username && (typeof body.username !== "string" || !equalSecrets(body.username, username)))
  ) {
    return errorResponse("Incorrect credentials.", 401);
  }
  (await cookies()).set(SESSION_COOKIE, createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Request not allowed.", 403);
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
