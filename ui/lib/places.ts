/** The agent's normalized Place response; null means the source doesn't say. */
export type Place = {
  id: string;
  name: string;
  type: string | null;
  city: string | null;
  region: string | null;
  neighborhood: string | null;
  description: string | null;
  tags: string[];
  rating: number | null;
  price_range: string | null;
  latitude: number | null;
  longitude: number | null;
  typical_duration_minutes: number | null;
  opening_hours: string | null;
  seasonal_notes: string | null;
  booking_required: boolean | null;
};

/** Resolve one place through the authenticated server; missing records stay unknown. */
export async function getPlace(placeId: string, signal?: AbortSignal): Promise<Place | undefined> {
  const response = await fetch(`/api/places/${encodeURIComponent(placeId)}`, { signal });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(response.status === 401
    ? "Sign in again to load place details."
    : "Unable to load place details. Please try again.");
  return response.json();
}

const icons: Record<string, string> = {
  museum: "🏛️", historic_site: "🏛️", restaurant: "🍝", market: "🍝",
  cafe: "🍝", park: "🌳", neighborhood: "🏘️", viewpoint: "👀",
};

export function getPlaceIcon(place: Place): string | undefined {
  return place.type ? icons[place.type] : undefined;
}
