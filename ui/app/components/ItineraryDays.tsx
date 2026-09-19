"use client";

import type { Place } from "../../lib/places";
import { resolveDayPlaces, type Itinerary } from "../../lib/itinerary";
import { getDayRouteMapUrl, splitDayRoute } from "../../lib/maps";
import MapsAction from "./MapsAction";
import PlaceReference from "./PlaceReference";
import { useMapsPreference } from "./MapsPreference";

export default function ItineraryDays({
  itinerary,
  places,
  onSelectPlace = () => {},
}: {
  itinerary: Itinerary;
  places: Record<string, Place | undefined>;
  onSelectPlace?: (placeId: string) => void;
}) {
  const { provider } = useMapsPreference();
  return (
    <div className="itinerary-days">
      {itinerary.days.map((day) => {
        const stops = resolveDayPlaces(day, places);
        const pending = day.stops.some((stop) => !Object.hasOwn(places, stop.place_id));
        const parts = pending ? [] : splitDayRoute(stops, provider);
        return (
          <section key={day.day} className="itinerary-day" aria-label={`Day ${day.day}`}>
            <h3 className="h6 mb-3">
              Day {day.day}
              {day.title ? ` — ${day.title}` : ""}
            </h3>
            {!day.stops.length && (
              <p className="small text-body-secondary mb-0">No stops planned yet.</p>
            )}
            <ol className="itinerary-stops">
              {day.stops.map((stop, index) => {
                const place = places[stop.place_id];
                return (
                  <li key={`${stop.place_id}:${index}`}>
                    {stop.start_time && (
                      <div className="small text-body-secondary">
                        {stop.start_time}
                        {stop.end_time ? `–${stop.end_time}` : ""}
                      </div>
                    )}
                    {place ? (
                      <PlaceReference place={place} onSelect={onSelectPlace}>
                        {place.name}
                      </PlaceReference>
                    ) : (
                      <span className="text-body-secondary">
                        {Object.hasOwn(places, stop.place_id)
                          ? "Place details unavailable"
                          : "Loading place…"}
                      </span>
                    )}
                    {stop.reason && <p className="small mb-1 mt-1">{stop.reason}</p>}
                    {stop.warnings?.map((warning, index) => (
                      <p key={index} className="small text-body-secondary mb-1">
                        ⚠️ {warning}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ol>
            {pending && (
              <p className="small text-body-secondary" role="status">
                Loading Day {day.day} places…
              </p>
            )}
            {!pending && stops.length >= 2 && (
              <div className="itinerary-day-maps">
                {stops.length < day.stops.length && (
                  <p className="small text-body-secondary mb-1">
                    Unavailable stops are omitted from this route.
                  </p>
                )}
                {!parts.length && (
                  <p className="small">
                    This route is too long to link. Open each stop in Maps from its place details.
                  </p>
                )}
                {parts.map((part, index) => (
                  <div key={index} className="my-3">
                    {parts.length > 1 && (
                      <p className="small text-body-secondary mb-1">
                        {part.map((place) => place.name).join(" → ")}
                      </p>
                    )}
                    <MapsAction
                      href={getDayRouteMapUrl(part, provider)!}
                      context={`Day ${day.day}${parts.length > 1 ? `, part ${index + 1} of ${parts.length}` : ""}`}
                      label={
                        parts.length > 1
                          ? `🗺️ Open day part ${index + 1} of ${parts.length}`
                          : "🗺️ Open day"
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
