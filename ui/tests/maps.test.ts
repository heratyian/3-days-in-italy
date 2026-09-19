import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  buildPlaceQuery,
  getDayRouteMapUrl,
  getPlaceMapUrl,
  getPreferredMapProvider,
  splitDayRoute,
} from "../lib/maps";
import { publicValues } from "../lib/messages";
import { publicItinerary, resolveDayPlaces, type Itinerary } from "../lib/itinerary";
import ItineraryDays from "../app/components/ItineraryDays";
import { museum, neighborhood } from "./place-fixtures";

const stops = ["Colosseum", "Roman Forum", "Campo de' Fiori", "Trastevere"].map((name, index) => ({
  ...museum,
  id: `place_00${index + 1}`,
  name,
  neighborhood: null,
}));
const itinerary: Itinerary = {
  days: [{ day: 1, title: "Ancient Rome", stops: stops.map((place) => ({ place_id: place.id })) }],
};

test("named place queries use source location fields and coordinates only as fallback", () => {
  assert.equal(buildPlaceQuery(museum), "Vatican Museums, Borgo, Rome, Lazio");
  const google = new URL(getPlaceMapUrl(museum, "google"));
  assert.equal(google.searchParams.get("query"), buildPlaceQuery(museum));
  assert.equal(google.searchParams.get("api"), "1");
  const apple = new URL(getPlaceMapUrl(museum, "apple"));
  assert.equal(apple.searchParams.get("q"), buildPlaceQuery(museum));
  assert.equal(apple.searchParams.get("ll"), "41.9065,12.4536");
  const missingCoordinates = { ...museum, latitude: null, longitude: null };
  const appleText = new URL(getPlaceMapUrl(missingCoordinates, "apple"));
  assert.equal(appleText.searchParams.get("q"), buildPlaceQuery(museum));
  assert.equal(appleText.searchParams.has("ll"), false);
  const noLocation = { ...museum, neighborhood: null, city: null, region: null };
  assert.equal(buildPlaceQuery(noLocation), "Vatican Museums, 41.9065,12.4536");
  assert.equal(buildPlaceQuery({ ...noLocation, name: "" }), "41.9065,12.4536");
  assert.equal(
    buildPlaceQuery({ ...museum, name: "A & B / café?" }),
    "A & B / café?, Borgo, Rome, Lazio",
  );
});

test("Google routes preserve endpoints and ordered waypoints, with walking mode", () => {
  const two = new URL(getDayRouteMapUrl(stops.slice(0, 2), "google")!);
  assert.equal(two.searchParams.get("origin"), buildPlaceQuery(stops[0]));
  assert.equal(two.searchParams.get("destination"), buildPlaceQuery(stops[1]));
  assert.equal(two.searchParams.has("waypoints"), false);
  const four = new URL(getDayRouteMapUrl(stops, "google")!);
  assert.equal(four.searchParams.get("origin"), buildPlaceQuery(stops[0]));
  assert.equal(four.searchParams.get("destination"), buildPlaceQuery(stops[3]));
  assert.deepEqual(
    four.searchParams.get("waypoints")!.split("|"),
    stops.slice(1, 3).map(buildPlaceQuery),
  );
  assert.equal(four.searchParams.get("travelmode"), "walking");
});

test("Apple unified directions preserve ordered repeated waypoints in driving mode", () => {
  const url = new URL(getDayRouteMapUrl(stops, "apple")!);
  assert.equal(url.pathname, "/directions");
  assert.equal(url.searchParams.get("source"), buildPlaceQuery(stops[0]));
  assert.equal(url.searchParams.get("destination"), buildPlaceQuery(stops[3]));
  assert.deepEqual(url.searchParams.getAll("waypoint"), stops.slice(1, 3).map(buildPlaceQuery));
  assert.equal(url.searchParams.get("mode"), "driving");
  assert.equal(
    new URL(getDayRouteMapUrl(stops.slice(0, 2), "apple")!).searchParams.has("waypoint"),
    false,
  );
});

test("routes skip unknown records, preserve repeated stops, and hide insufficient days", () => {
  const day = {
    day: 1,
    title: null,
    stops: [
      { place_id: museum.id },
      { place_id: "place_999" },
      { place_id: neighborhood.id },
      { place_id: museum.id },
    ],
  };
  const resolved = resolveDayPlaces(day, { [museum.id]: museum, [neighborhood.id]: neighborhood });
  assert.deepEqual(resolved, [museum, neighborhood, museum]);
  for (const provider of ["apple", "google"] as const) {
    assert.equal(getDayRouteMapUrl([], provider), null);
    assert.equal(getDayRouteMapUrl([museum], provider), null);
    assert.deepEqual(splitDayRoute([museum], provider), []);
  }
  const html = renderToStaticMarkup(
    createElement(ItineraryDays, {
      itinerary: { days: [day] },
      places: { [museum.id]: museum, [neighborhood.id]: undefined, place_999: undefined },
    }),
  );
  // The repeated museum is deliberately preserved, so this day still has two stops.
  assert.match(html, /Open day in Google Maps/);
  const empty = renderToStaticMarkup(
    createElement(ItineraryDays, {
      itinerary: { days: [{ ...day, stops: [{ place_id: museum.id }] }] },
      places: { [museum.id]: museum },
    }),
  );
  assert.doesNotMatch(empty, /maps-link/);
});

test("long days split into connected parts without exceeding mobile or URL limits", () => {
  const longDay = Array.from({ length: 10 }, (_, i) => ({ ...museum, name: `Stop ${i}` }));
  for (const provider of ["apple", "google"] as const) {
    assert.equal(getDayRouteMapUrl(longDay, provider), null);
    const parts = splitDayRoute(longDay, provider);
    assert.deepEqual(
      parts.map((part) => part.length),
      [5, 5, 2],
    );
    assert.deepEqual(
      parts.flatMap((part, i) => (i ? part.slice(1) : part)),
      longDay,
    );
    for (const part of parts) assert.ok(getDayRouteMapUrl(part, provider)!.length <= 2048);
    const verbose = longDay.map((place) => ({ ...place, name: place.name.repeat(100) }));
    const shortParts = splitDayRoute(verbose, provider);
    assert.ok(shortParts.length > 3);
    assert.deepEqual(
      shortParts.flatMap((part, i) => (i ? part.slice(1) : part)),
      verbose,
    );
    assert.deepEqual(splitDayRoute([{ ...museum, name: "x".repeat(3000) }, museum], provider), []);
  }
});

test("public state exposes only the saved route projection on streaming and history paths", () => {
  const source = {
    ...itinerary,
    secret: "hidden",
    days: itinerary.days.map((day) => ({
      ...day,
      private: "hidden",
      stops: day.stops.map((stop) => ({ ...stop, secret: "hidden" })),
    })),
  };
  assert.deepEqual(
    publicValues({ messages: [], itinerary: source, preferences: { private: true } }),
    { messages: [], itinerary },
  );
  assert.equal(publicItinerary({ days: [{ day: 1, stops: "invalid" }] }), null);
  assert.equal(publicItinerary(null), null);
  assert.deepEqual(
    publicItinerary({
      days: [{ day: 1, stops: [null, {}, { place_id: "invalid" }, { place_id: "place_999" }] }],
    }),
    { days: [{ day: 1, title: null, stops: [{ place_id: "place_999" }] }] },
  );
});

test("day links show authoritative stop order, wait for data, and name split parts", () => {
  const places = Object.fromEntries(stops.map((place) => [place.id, place]));
  const html = renderToStaticMarkup(createElement(ItineraryDays, { itinerary, places }));
  assert.ok(html.indexOf("Colosseum") < html.indexOf("Roman Forum"));
  assert.ok(html.indexOf("Roman Forum") < html.indexOf("Campo de"));
  assert.ok(html.indexOf("Campo de") < html.indexOf("Trastevere"));
  assert.match(html, /Open day in Google Maps/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  const loading = renderToStaticMarkup(createElement(ItineraryDays, { itinerary, places: {} }));
  assert.match(loading, /Loading Day 1/);
  assert.doesNotMatch(loading, /maps-link/);
  const long = {
    days: [
      { ...itinerary.days[0], stops: [...itinerary.days[0].stops, ...itinerary.days[0].stops] },
    ],
  };
  const split = renderToStaticMarkup(createElement(ItineraryDays, { itinerary: long, places }));
  assert.match(split, /Open day part 1 of 2/);
  assert.match(split, /Open day part 2 of 2/);
});

test("server rendering falls back to Google without browser access", () => {
  assert.equal(getPreferredMapProvider(), "google");
});
