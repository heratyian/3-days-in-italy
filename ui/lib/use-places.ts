"use client";

import { useEffect, useState } from "react";
import { getPlace, type Place } from "./places";

/** Fetch referenced and saved itinerary places once per chat, including negative (404) results. */
export function usePlaces(content: string, itineraryPlaceIds: string[] = []) {
  const [places, setPlaces] = useState<Record<string, Place | undefined>>({});
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // A stable dependency avoids restarting requests for every streamed token.
  const messagePlaceIds = [...content.matchAll(/\bplace_\d+\b/g)].map((match) => match[0]);
  const referenceIds = [...new Set([...messagePlaceIds, ...itineraryPlaceIds])].sort().join(",");

  useEffect(() => {
    const missing = referenceIds.split(",").filter((id) => id && !Object.hasOwn(places, id));
    if (!missing.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear errors from the previous external lookup when the requested places change.
      setError("");
      return;
    }
    const controller = new AbortController();
    setError("");
    Promise.all(missing.map(async (id) => [id, await getPlace(id, controller.signal)] as const))
      .then((entries) => {
        if (!controller.signal.aborted)
          setPlaces((current) => ({ ...current, ...Object.fromEntries(entries) }));
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [referenceIds, places, attempt]);

  return { places, error, retry: () => setAttempt((value) => value + 1) };
}
