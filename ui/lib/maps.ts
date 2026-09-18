import type { Place } from "./places";

export type MapProvider = "google" | "apple";
export const mapProviderNames = { google: "Google Maps", apple: "Apple Maps" };
// Google mobile URLs allow three waypoints. Use the same small parts for both providers.
// https://developers.google.com/maps/documentation/urls/get-started
export const MAX_ROUTE_STOPS = 5;
const MAX_MAP_URL_LENGTH = 2048;
const PREFERENCE_KEY = "preferred-map-provider";

export function buildPlaceQuery(place: Place): string {
  const location = [place.neighborhood, place.city, place.region].filter(Boolean);
  if (!location.length && place.latitude !== null && place.longitude !== null) {
    location.push(`${place.latitude},${place.longitude}`);
  }
  return [...new Set([place.name, ...location].filter(Boolean))].join(", ");
}

export function getPlaceMapUrl(place: Place, provider: MapProvider): string {
  if (provider === "apple") {
    const params = new URLSearchParams({ q: buildPlaceQuery(place) });
    if (place.latitude !== null && place.longitude !== null) {
      params.set("ll", `${place.latitude},${place.longitude}`);
    }
    return `https://maps.apple.com/?${params}`;
  }
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: buildPlaceQuery(place) })}`;
}

/** Ordered directions; null means the stops cannot fit in one reliable URL. */
export function getDayRouteMapUrl(places: Place[], provider: MapProvider): string | null {
  if (places.length < 2 || places.length > MAX_ROUTE_STOPS) return null;
  const locations = places.map(buildPlaceQuery);
  let url: string;
  if (provider === "apple") {
    // Use driving for Apple because walking routes do not reliably retain all stops.
    // https://developer.apple.com/documentation/mapkit/unified-map-urls
    const params = new URLSearchParams({ source: locations[0], destination: locations.at(-1)!, mode: "driving" });
    for (const location of locations.slice(1, -1)) params.append("waypoint", location);
    url = `https://maps.apple.com/directions?${params}`;
  } else {
    const params = new URLSearchParams({ api: "1", origin: locations[0], destination: locations.at(-1)!, travelmode: "walking" });
    if (locations.length > 2) params.set("waypoints", locations.slice(1, -1).join("|"));
    url = `https://www.google.com/maps/dir/?${params}`;
  }
  return url.length <= MAX_MAP_URL_LENGTH ? url : null;
}

/** Adjacent parts share their boundary stop so no leg is dropped. */
export function splitDayRoute(places: Place[], provider: MapProvider): Place[][] {
  const parts: Place[][] = [];
  for (let start = 0; start < places.length - 1;) {
    let end = Math.min(start + MAX_ROUTE_STOPS, places.length);
    while (end > start + 1 && !getDayRouteMapUrl(places.slice(start, end), provider)) end--;
    if (end <= start + 1) return [];
    parts.push(places.slice(start, end));
    start = end - 1;
  }
  return parts;
}

/** Call after mounting. Storage and browser detection are optional. */
export function getPreferredMapProvider(): MapProvider {
  if (typeof window === "undefined") return "google";
  try {
    const saved = window.localStorage.getItem(PREFERENCE_KEY);
    if (saved === "apple" || saved === "google") return saved;
  } catch { /* Private browsing may disable storage. */ }
  try {
    if (/iPhone|iPad|iPod|Macintosh|MacIntel/i.test(`${window.navigator.userAgent} ${window.navigator.platform}`)) return "apple";
  } catch { /* Google remains the fallback when platform detection is unavailable. */ }
  return "google";
}

export function setPreferredMapProvider(provider: MapProvider): void {
  try { window.localStorage.setItem(PREFERENCE_KEY, provider); }
  catch { /* The in-memory preference still works. */ }
}
