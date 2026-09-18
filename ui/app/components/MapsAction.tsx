"use client";

import { mapProviderNames } from "../../lib/maps";
import { useMapsPreference } from "./MapsPreference";

export default function MapsAction({ href, label = "Open", context }: { href: string; label?: string; context: string }) {
  const { provider } = useMapsPreference();
  return <a className="maps-link" href={href} target="_blank" rel="noopener noreferrer">
    {label} in {mapProviderNames[provider]} ↗<span className="visually-hidden"> — {context} (opens in a new tab)</span>
  </a>;
}
