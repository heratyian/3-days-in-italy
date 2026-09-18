import type { Place } from "../lib/places";

// Minimal API response fixtures, not a runtime source of place data.
export const museum: Place = {
  id: "place_010", name: "Vatican Museums", type: "museum", city: "Rome", region: "Lazio",
  neighborhood: "Borgo", description: "Museum description from the server.", tags: [], rating: null,
  price_range: "€€", latitude: 41.9065, longitude: 12.4536, typical_duration_minutes: 240,
  opening_hours: "Mon-Sat 9:00-18:00", seasonal_notes: "Closed Sundays except last Sunday of the month.",
  booking_required: true,
};
export const neighborhood: Place = {
  ...museum, id: "place_002", name: "Trastevere Neighborhood", type: "neighborhood",
  neighborhood: "Trastevere", booking_required: false,
};
export const places = { [museum.id]: museum, [neighborhood.id]: neighborhood };
