import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import Message from "../app/components/Message";
import PlaceDetails from "../app/components/PlaceDetails";
import { usePlaces } from "../lib/use-places";
import { places } from "./place-fixtures";

test("selecting places updates one sheet; close, Escape, and outside clicks clear the selection", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const previousFetch = globalThis.fetch;
  const requests: string[] = [];
  let failLookup = false;
  let content = "**Vatican Museums** (place_010), then Trastevere (place_002), Mystery (place_999).";
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    if (failLookup) throw new Error("Lookup unavailable");
    const place = places[String(url).split("/").at(-1)!];
    return place ? Response.json(place) : new Response(null, { status: 404 });
  };
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  // JSDOM has no top layer. Only emulate the native open/close methods; the
  // component's selection, effects, rendering, and event handlers run normally.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  function Conversation() {
    const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
    const { places, error, retry } = usePlaces(content);
    return createElement("div", null,
      createElement(Message, { human: false, content, places, onSelectPlace: setSelectedPlaceId }),
      error && createElement("button", { onClick: retry, id: "retry" }, error),
      createElement(PlaceDetails, { place: selectedPlaceId ? places[selectedPlaceId] : undefined, onClose: () => setSelectedPlaceId(null) }),
    );
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(createElement(Conversation)));
    assert.deepEqual(requests.sort(), ["/api/places/place_002", "/api/places/place_010", "/api/places/place_999"]);
    const dialog = document.querySelector("dialog")!;
    const references = document.querySelectorAll<HTMLButtonElement>(".place-reference");
    assert.equal(dialog.open, false);
    await act(async () => references[0].click());
    assert.equal(dialog.open, true);
    assert.match(dialog.textContent!, /Vatican Museums/);
    assert.match(dialog.textContent!, /Booking required/);
    assert.equal(dialog.querySelector("a")!.href, "https://www.google.com/maps/search/?api=1&query=41.9065%2C12.4536");
    await act(async () => dialog.querySelector<HTMLButtonElement>("button")!.click());
    assert.equal(dialog.open, false);
    await act(async () => references[1].click());
    assert.match(dialog.textContent!, /Trastevere Neighborhood/);
    assert.match(dialog.textContent!, /Booking not required/);
    assert.equal(document.querySelectorAll("dialog").length, 1);
    // Browsers dispatch cancel when Escape is pressed in a modal dialog.
    await act(async () => { dialog.dispatchEvent(new dom.window.Event("cancel", { cancelable: true })); });
    assert.equal(dialog.open, false);
    assert.equal(dialog.textContent, "");
    // JSDOM has no layout; supply sheet bounds to distinguish padding from backdrop.
    dialog.getBoundingClientRect = () => new dom.window.DOMRect(400, 100, 400, 600);
    await act(async () => references[0].click());
    await act(async () => dialog.querySelector("h2")!.click());
    assert.equal(dialog.open, true, "clicking content keeps the sheet open");
    await act(async () => {
      dialog.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, clientX: 410, clientY: 110 }));
    });
    assert.equal(dialog.open, true, "clicking sheet padding keeps it open");
    for (const [clientX, clientY] of [[200, 200], [900, 200], [500, 50], [500, 750]]) {
      await act(async () => references[0].click());
      await act(async () => {
        dialog.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, clientX, clientY }));
      });
      assert.equal(dialog.open, false, "clicking outside closes the sheet");
      assert.equal(dialog.textContent, "");
    }
    assert.equal(requests.length, 3, "reopening places reuses fetched records and cached 404s");
    failLookup = true;
    content += " Another place (place_123).";
    await act(async () => root.render(createElement(Conversation)));
    assert.equal(requests.at(-1), "/api/places/place_123");
    assert.equal(requests.length, 4, "new references don't refetch previously resolved IDs");
    assert.equal(document.getElementById("retry")!.textContent, "Lookup unavailable");
    failLookup = false;
    await act(async () => document.getElementById("retry")!.click());
    assert.equal(document.getElementById("retry"), null);
    assert.equal(requests.length, 5, "retry requests only the failed reference");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    dom.window.close();
    Object.assign(globalThis, { window: previousWindow, document: previousDocument, IS_REACT_ACT_ENVIRONMENT: false });
  }
});
