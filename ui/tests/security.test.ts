import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Message from "../app/components/Message";
import { createSession, readSession, sameOrigin } from "../lib/auth";
import { readJson } from "../lib/http";
import { publicValues, readUserMessage } from "../lib/messages";
import { allowRequest } from "../lib/rate-limit";

test("sessions reject tampering, expiration, missing configuration, and password rotation", () => {
  process.env.TEST_AUTH_PASSWORD = "test-password";
  const token = createSession();
  assert.ok(readSession(token));
  assert.equal(readSession(token + "x"), null);
  const now = Date.now;
  Date.now = () => now() + 13 * 60 * 60 * 1000;
  try { assert.equal(readSession(token), null); } finally { Date.now = now; }
  process.env.TEST_AUTH_PASSWORD = "new-password";
  assert.equal(readSession(token), null);
  delete process.env.TEST_AUTH_PASSWORD;
  assert.equal(readSession(token), null);
});

test("mutations require a matching browser origin", () => {
  assert.equal(sameOrigin(new Request("https://test.example/api/auth", { headers: { origin: "https://evil.example" } })), false);
  assert.equal(sameOrigin(new Request("https://test.example/api/auth")), false);
  assert.equal(sameOrigin(new Request("https://test.example/api/auth", { headers: { origin: "https://test.example" } })), true);
});

test("only one bounded human message is accepted; privileged fields are discarded", () => {
  const message = { type: "human", id: crypto.randomUUID(), content: "Hello" };
  assert.deepEqual(readUserMessage({ input: { messages: [message], preferences: { budget: "luxury" }, itinerary: { days: [] } }, command: {} }, 10), message);
  for (const messages of [[], [message, message], [{ ...message, type: "system" }],
    [{ ...message, content: " " }], [{ ...message, content: "a".repeat(11) }]]) {
    assert.throws(() => readUserMessage({ input: { messages } }, 10));
  }
});

test("tool output, reasoning, and metadata never enter public messages", () => {
  assert.deepEqual(publicValues({ messages: [
    { type: "tool", content: "internal tool output" },
    { type: "system", content: "secret prompt" },
    { type: "ai", content: [{ type: "reasoning", text: "private" }, { type: "text", text: "Hello" }], response_metadata: { secret: "hidden" } },
  ], preferences: { private: true } }), { messages: [{ type: "ai", content: "Hello" }], itinerary: null });
});

test("request size is enforced without trusting Content-Length", async () => {
  const request = new Request("http://localhost", { method: "POST", body: JSON.stringify({ message: "a".repeat(100) }) });
  await assert.rejects(readJson(request, 20), /too large/);
});

test("Markdown formats text without rendering scripts, unsafe links, or remote images", () => {
  const html = renderToStaticMarkup(createElement(Message, {
    human: false,
    content: '**Hello**\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\n![tracking](https://example.com/image.png)\n\n```js\nconst value = 1;\n```',
  }));
  assert.match(html, /<strong>Hello<\/strong>/);
  assert.match(html, /<pre><code/);
  assert.doesNotMatch(html, /<script|javascript:|<img/);
});

test("rate limits apply independently per session and reset after their window", () => {
  const key = crypto.randomUUID();
  assert.equal(allowRequest(key, 1), true);
  assert.equal(allowRequest(key, 1), false);
  assert.equal(allowRequest(crypto.randomUUID(), 1), true);
  const now = Date.now;
  Date.now = () => now() + 60_001;
  try { assert.equal(allowRequest(key, 1), true); } finally { Date.now = now; }
});
