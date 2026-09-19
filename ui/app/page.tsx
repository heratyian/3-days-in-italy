import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { positiveInteger } from "@/lib/rate-limit";
import Chat from "./components/Chat";
import Login from "./components/Login";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  const name = process.env.NEXT_PUBLIC_APP_NAME || "Agent Test";
  const description = process.env.NEXT_PUBLIC_APP_DESCRIPTION;
  return (
    <main className="app-shell container px-3 px-sm-4">
      <header className="py-4 border-bottom">
        <h1 className="h4 mb-1">{name}</h1>
        {description && <p className="text-body-secondary mb-0">{description}</p>}
      </header>
      {session ? (
        <Chat
          sessionId={session.id}
          maxMessageLength={positiveInteger(process.env.MAX_MESSAGE_LENGTH, 10000)}
        />
      ) : (
        <Login
          usernameRequired={Boolean(process.env.TEST_AUTH_USERNAME)}
          configured={Boolean(process.env.TEST_AUTH_PASSWORD)}
        />
      )}
    </main>
  );
}
