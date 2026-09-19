"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import type Modal from "bootstrap/js/dist/modal";
import type { Itinerary } from "../../lib/itinerary";
import type { Place } from "../../lib/places";
import ItineraryDays from "./ItineraryDays";

export default function ItineraryPanel({
  open,
  itinerary,
  places,
  busy,
  onClose,
  onSelectPlace,
  children,
}: {
  open: boolean;
  itinerary: Itinerary | null | undefined;
  places: Record<string, Place | undefined>;
  busy: boolean;
  onClose: () => void;
  onSelectPlace: (placeId: string) => void;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const notifyClosed = useEffectEvent(onClose);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const opener = document.activeElement as HTMLElement | null;
    let modal: Modal | undefined;
    let cancelled = false;
    function hidden() {
      if (opener?.isConnected) opener.focus();
      notifyClosed();
    }
    element.addEventListener("hidden.bs.modal", hidden);
    // Bootstrap accesses the DOM at import time, so load it only on the client.
    void import("bootstrap/js/dist/modal").then(({ default: Modal }) => {
      if (cancelled) return;
      modal = new Modal(element);
      modal.show();
    });
    return () => {
      cancelled = true;
      element.removeEventListener("hidden.bs.modal", hidden);
      const restoreFocus = element.contains(document.activeElement);
      modal?.hide();
      modal?.dispose();
      if (restoreFocus && opener?.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <div
      ref={dialog}
      id="itinerary-panel"
      className="modal"
      tabIndex={-1}
      aria-labelledby="itinerary-title"
      aria-hidden="true"
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h2 id="itinerary-title" className="modal-title fs-5">
              Your itinerary
            </h2>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close itinerary"
            />
          </div>
          <div className="modal-body">
            <div className="container">
              <p className="small text-body-secondary" role="status">
                {busy
                  ? itinerary
                    ? "Planning… Your latest saved plan is shown below."
                    : "Planning your trip…"
                  : itinerary
                    ? "Updates here as we refine your trip."
                    : "Your plan will take shape here as we chat."}
              </p>
              <ItineraryDays
                itinerary={
                  itinerary ?? { days: [1, 2, 3].map((day) => ({ day, title: null, stops: [] })) }
                }
                places={places}
                onSelectPlace={onSelectPlace}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Native place dialogs enter the top layer while remaining inside Bootstrap's focus boundary. */}
      {children}
    </div>
  );
}
