import type { Place } from "./places";

/** Read-only traveler-facing projection of the saved itinerary. */
export type ItineraryStop = {
  place_id: string;
  start_time?: string;
  end_time?: string;
  reason?: string;
  warnings?: string[];
};
export type ItineraryDay = { day: number; title: string | null; stops: ItineraryStop[] };
export type Itinerary = { days: ItineraryDay[] };

export function publicItinerary(value: unknown): Itinerary | null {
  if (!value || typeof value !== "object" || !("days" in value) || !Array.isArray(value.days))
    return null;
  const days: ItineraryDay[] = [];
  for (const day of value.days) {
    if (
      !day ||
      !Number.isInteger(day.day) ||
      day.day < 1 ||
      day.day > 3 ||
      !Array.isArray(day.stops)
    )
      return null;
    days.push({
      day: day.day,
      title: typeof day.title === "string" ? day.title : null,
      stops: day.stops.flatMap((stop: Record<string, unknown> | null) => {
        if (!stop || typeof stop.place_id !== "string" || !/^place_\d+$/.test(stop.place_id))
          return [];
        return [
          {
            place_id: stop.place_id,
            ...(typeof stop.start_time === "string" ? { start_time: stop.start_time } : {}),
            ...(typeof stop.end_time === "string" ? { end_time: stop.end_time } : {}),
            ...(typeof stop.reason === "string" ? { reason: stop.reason } : {}),
            ...(Array.isArray(stop.warnings)
              ? {
                  warnings: stop.warnings.filter(
                    (warning): warning is string => typeof warning === "string",
                  ),
                }
              : {}),
          },
        ];
      }),
    });
  }
  return { days };
}

export function resolveDayPlaces(
  day: ItineraryDay,
  places: Record<string, Place | undefined>,
): Place[] {
  return day.stops.flatMap((stop) => (places[stop.place_id] ? [places[stop.place_id]!] : []));
}
