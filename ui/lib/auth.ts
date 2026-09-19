import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "testing_session";
const SESSION_LIFETIME = 12 * 60 * 60 * 1000;

export type Session = { id: string; expires: number };

function signature(payload: string): string {
  const password = process.env.TEST_AUTH_PASSWORD;
  if (!password) throw new Error("TEST_AUTH_PASSWORD must be configured.");
  // A password change invalidates all sessions; no database or second secret needed.
  return createHmac("sha256", password)
    .update(`testing-session:${process.env.TEST_AUTH_USERNAME ?? ""}:${payload}`)
    .digest("base64url");
}

export function equalSecrets(left: string, right: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(left).digest(),
    createHash("sha256").update(right).digest(),
  );
}

export function createSession(): string {
  const payload = Buffer.from(
    JSON.stringify({ id: randomUUID(), expires: Date.now() + SESSION_LIFETIME }),
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function readSession(token: string | undefined): Session | null {
  if (!token || !process.env.TEST_AUTH_PASSWORD) return null;
  const [payload, signed, extra] = token.split(".");
  if (!payload || !signed || extra || !equalSecrets(signed, signature(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof session.id === "string" &&
      typeof session.expires === "number" &&
      session.expires > Date.now()
      ? session
      : null;
  } catch {
    return null;
  }
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const allowedOrigin = process.env.APP_URL;

  if (allowedOrigin) {
    try {
      return new URL(origin).origin === new URL(allowedOrigin).origin;
    } catch {
      return false;
    }
  }

  // Local development
  return new URL(origin).origin === new URL(request.url).origin;
}
