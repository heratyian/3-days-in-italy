import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { getPreferredMapProvider, setPreferredMapProvider } from "../lib/maps";
import { MapsPreference, MapsProviderSelect } from "../app/components/MapsPreference";
import PlaceDetails from "../app/components/PlaceDetails";
import ItineraryDays from "../app/components/ItineraryDays";
import { usePlaces } from "../lib/use-places";
import { museum, neighborhood, places } from "./place-fixtures";

function setPlatform(dom: JSDOM, userAgent: string, platform: string) {
  Object.defineProperty(dom.window.navigator, "userAgent", { configurable: true, value: userAgent });
  Object.defineProperty(dom.window.navigator, "platform", { configurable: true, value: platform });
}

test("saved provider overrides platform defaults, including iPads, and storage is optional", () => {
  const dom = new JSDOM("", { url: "http://localhost" });
  const previousWindow = globalThis.window;
  Object.assign(globalThis, { window: dom.window });
  try {
    for (const [agent, platform] of [["iPhone", "iPhone"], ["iPad", "iPad"], ["Macintosh", "MacIntel"]]) {
      setPlatform(dom, agent, platform);
      assert.equal(getPreferredMapProvider(), "apple");
    }
    setPreferredMapProvider("google");
    assert.equal(getPreferredMapProvider(), "google");
    setPlatform(dom, "Android", "Linux");
    setPreferredMapProvider("apple");
    assert.equal(getPreferredMapProvider(), "apple");
    dom.window.localStorage.clear();
    assert.equal(getPreferredMapProvider(), "google");
    dom.window.localStorage.setItem("preferred-map-provider", "invalid");
    assert.equal(getPreferredMapProvider(), "google");
    Object.defineProperty(dom.window, "localStorage", { configurable: true, get() { throw new Error("Blocked storage"); } });
    assert.doesNotThrow(() => setPreferredMapProvider("apple"));
    setPlatform(dom, "iPhone", "iPhone");
    assert.equal(getPreferredMapProvider(), "apple");
    Object.defineProperty(dom.window, "navigator", { configurable: true, get() { throw new Error("Unavailable platform"); } });
    assert.equal(getPreferredMapProvider(), "google");
  } finally {
    Object.assign(globalThis, { window: previousWindow });
    dom.window.close();
  }
});

test("place and structured day actions hydrate safely, share preference, and persist overrides", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  setPlatform(dom, "Macintosh", "MacIntel");
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const requests: string[] = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    const place = places[String(url).split("/").at(-1)!];
    return place ? Response.json(place) : new Response(null, { status: 404 });
  };
  const itinerary = { days: [{ day: 1, title: "Rome", stops: [
    { place_id: museum.id }, { place_id: "place_999" }, { place_id: neighborhood.id },
  ] }] };
  function App() {
    const data = usePlaces("Your trip is saved.", itinerary.days.flatMap((day) => day.stops.map((stop) => stop.place_id)));
    return createElement(MapsPreference, null,
      createElement(MapsProviderSelect),
      createElement(PlaceDetails, { place: museum, onClose() {} }),
      createElement(ItineraryDays, { itinerary, places: data.places }),
    );
  }
  const container = document.getElementById("root")!;
  container.innerHTML = renderToString(createElement(App));
  assert.match(container.textContent!, /Open in Google Maps/);
  const hydrationErrors: unknown[] = [];
  let root: ReturnType<typeof createRoot> | undefined;
  try {
    await act(async () => { root = hydrateRoot(container, createElement(App), { onRecoverableError: (error) => hydrationErrors.push(error) }); });
    assert.deepEqual(hydrationErrors, []);
    assert.deepEqual(requests.sort(), ["/api/places/place_002", "/api/places/place_010", "/api/places/place_999"]);
    assert.equal(document.querySelectorAll(".maps-link").length, 2);
    for (const link of document.querySelectorAll<HTMLAnchorElement>(".maps-link")) {
      assert.equal(new URL(link.href).hostname, "maps.apple.com");
      assert.equal(link.target, "_blank");
      assert.equal(link.rel, "noopener noreferrer");
    }
    const dayLink = document.querySelector<HTMLAnchorElement>(".itinerary-days a")!;
    assert.match(dayLink.textContent!, /Open day in Apple Maps/);
    assert.match(document.querySelector(".itinerary-days")!.textContent!, /Unavailable stops are omitted/);
    assert.equal(document.querySelectorAll("select").length, 1, "one global provider selector");
    assert.equal(document.querySelectorAll("dialog select, .itinerary-days select").length, 0);
    const selector = document.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      selector.value = "google";
      selector.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(dom.window.localStorage.getItem("preferred-map-provider"), "google");
    for (const link of document.querySelectorAll<HTMLAnchorElement>(".maps-link")) assert.equal(new URL(link.href).hostname, "www.google.com");
    await act(async () => root!.unmount());
    root = createRoot(container);
    await act(async () => root!.render(createElement(App)));
    assert.match(document.querySelector(".itinerary-days a")!.textContent!, /Open day in Google Maps/);
    const globalSelector = document.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      globalSelector.value = "apple";
      globalSelector.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.match(document.querySelector("dialog a")!.textContent!, /Open in Apple Maps/);
    assert.equal(dom.window.localStorage.getItem("preferred-map-provider"), "apple");
  } finally {
    await act(async () => root?.unmount());
    globalThis.fetch = previousFetch;
    Object.assign(globalThis, { window: previousWindow, document: previousDocument, IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  }
});
