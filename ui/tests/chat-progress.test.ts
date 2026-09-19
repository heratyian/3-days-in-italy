import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import ChatProgress from "../app/components/ChatProgress";
import { hasNewAssistantText } from "../lib/messages";

test("loading timer starts fresh for the next reply without extra waiting messages", async (context) => {
  const dom = new JSDOM('<div id="root"></div>');
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  context.mock.timers.enable({ apis: ["setInterval", "Date"], now: 0 });
  const { createRoot } = await import("react-dom/client");
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(ChatProgress)));
    assert.match(container.textContent!, /Working on your reply/);
    await act(async () => context.mock.timers.tick(8000));
    assert.equal(container.querySelector('[aria-label="8s elapsed"]')?.textContent, "8s");
    await act(async () => context.mock.timers.tick(22000));
    assert.equal(container.querySelectorAll("p").length, 1);
    await act(async () => context.mock.timers.tick(31000));
    assert.equal(container.querySelector('[aria-label="1m 1s elapsed"]')?.textContent, "1m 1s");
    await act(async () => root.render(null));
    await act(async () => context.mock.timers.tick(10000));
    assert.equal(container.textContent, "");
    await act(async () => root.render(createElement(ChatProgress, { loadingHistory: true })));
    assert.match(container.textContent!, /Opening your conversation/);
    assert.equal(container.querySelector('[aria-label="0s elapsed"]')?.textContent, "0s");
    assert.doesNotMatch(container.textContent!, /taking a little longer/);
  } finally {
    await act(async () => root.unmount());
    context.mock.timers.reset();
    dom.window.close();
    Object.assign(globalThis, { ...previous, IS_REACT_ACT_ENVIRONMENT: false });
  }
});

test("only new assistant text hides progress, including when retrying a partial reply", () => {
  const previous = [{ id: "old", type: "ai", content: "Previous reply" }];
  assert.equal(hasNewAssistantText(previous, previous), false);
  assert.equal(hasNewAssistantText([...previous, { type: "human", content: "Next question" }], previous), false);
  assert.equal(hasNewAssistantText([...previous, { type: "tool", content: "Found places" }], previous), false);
  assert.equal(hasNewAssistantText([...previous, { type: "ai", content: " " }], previous), false);
  assert.equal(hasNewAssistantText([...previous, { id: "new", type: "AIMessageChunk", content: "H" }], previous), true);
  assert.equal(hasNewAssistantText([{ id: "old", type: "ai", content: "Previous reply continued" }], previous), true);
  assert.equal(hasNewAssistantText([{ type: "ai", content: [{ type: "text", text: "Hello" }] }], []), true);
});
