import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import ChatMenu from "../app/components/ChatMenu";

test("chat settings dismiss on outside click, Escape, and actions", async () => {
  const dom = new JSDOM('<div id="root"></div><button id="outside">Outside</button>', { url: "http://localhost" });
  const previous = {
    window: globalThis.window, document: globalThis.document, Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement, Node: globalThis.Node, Event: globalThis.Event,
    getComputedStyle: globalThis.getComputedStyle,
  };
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  await import("bootstrap/js/dist/dropdown");
  const root = createRoot(document.getElementById("root")!);
  let restarts = 0;
  let signOuts = 0;
  async function render(busy = false) {
    await act(async () => root.render(createElement(ChatMenu, {
      busy, onRestart: () => { restarts++; }, onSignOut: () => { signOuts++; },
    })));
  }
  try {
    await render();
    const toggle = document.querySelector<HTMLButtonElement>('[aria-label="Chat settings"]')!;
    const actions = document.querySelectorAll<HTMLButtonElement>(".dropdown-item");
    const click = async (element: HTMLElement) => act(async () => element.click());
    await click(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    await click(document.querySelector("select")!);
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    await click(document.getElementById("outside")!);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    await click(toggle);
    await act(async () => { toggle.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, toggle);
    await click(toggle);
    await click(actions[0]);
    assert.equal(restarts, 1);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    await click(toggle);
    await click(actions[1]);
    assert.equal(signOuts, 1);
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    await render(true);
    assert.ok(actions[0].disabled && actions[1].disabled);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, previous);
  }
});
