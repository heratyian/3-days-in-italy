"use client";

import { useEffect, useRef } from "react";
import { getPlaceIcon, type Place } from "../../lib/places";
import { getPlaceMapUrl } from "../../lib/maps";
import MapsAction from "./MapsAction";
import { useMapsPreference } from "./MapsPreference";

export default function PlaceDetails({
  place,
  onClose,
}: {
  place: Place | undefined;
  onClose: () => void;
}) {
  const { provider } = useMapsPreference();
  const dialog = useRef<HTMLDialogElement>(null);
  const open = Boolean(place);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const opener = document.activeElement as HTMLElement | null;
    // Keep Escape from reaching the underlying Bootstrap itinerary modal.
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") event.stopPropagation();
    }
    element.addEventListener("keydown", keydown);
    element.showModal();
    return () => {
      element.removeEventListener("keydown", keydown);
      element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="place-details"
      aria-labelledby="place-title"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        // Backdrop clicks target the dialog too; exclude its padding and content.
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {place && (
        <>
          <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
            <div>
              <h2 id="place-title" className="h4">
                <span aria-hidden="true">{getPlaceIcon(place)}</span> {place.name}
              </h2>
              {place.type && (
                <p className="text-body-secondary mb-0 text-capitalize">
                  {place.type.replaceAll("_", " ")}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn-close flex-shrink-0"
              aria-label="Close place details"
              onClick={onClose}
            />
          </div>
          <p className="text-body-secondary">
            {[place.neighborhood, place.city, place.region].filter(Boolean).join(" · ")}
          </p>
          {place.description && <p>{place.description}</p>}
          <dl className="place-facts">
            {place.price_range && (
              <>
                <dt>Price range</dt>
                <dd>{place.price_range}</dd>
              </>
            )}
            {place.booking_required !== null && (
              <>
                <dt>Booking</dt>
                <dd>{place.booking_required ? "Booking required" : "Booking not required"}</dd>
              </>
            )}
            {place.typical_duration_minutes !== null && (
              <>
                <dt>Typical visit</dt>
                <dd>{place.typical_duration_minutes} minutes</dd>
              </>
            )}
            {place.opening_hours && (
              <>
                <dt>Listed hours</dt>
                <dd>{place.opening_hours}</dd>
              </>
            )}
          </dl>
          {place.seasonal_notes && (
            <div className="place-notes">
              <h3 className="h6">Useful notes</h3>
              <p>{place.seasonal_notes}</p>
            </div>
          )}
          <MapsAction href={getPlaceMapUrl(place, provider)} context={place.name} />
        </>
      )}
    </dialog>
  );
}
