import type { ReactNode } from "react";
import { getPlaceIcon, type Place } from "../../lib/places";

export default function PlaceReference({ place, children, onSelect }: {
  place: Place; children: ReactNode; onSelect: (placeId: string) => void;
}) {
  const icon = getPlaceIcon(place);
  return <button type="button" className="place-reference" onClick={() => onSelect(place.id)}
    aria-label={`View ${place.name} details`} aria-haspopup="dialog">
    {icon && <><span aria-hidden="true">{icon}</span>{" "}</>}{children}
  </button>;
}
