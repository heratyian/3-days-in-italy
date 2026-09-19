"use client";

import { createContext, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { getPreferredMapProvider, setPreferredMapProvider, type MapProvider } from "../../lib/maps";

const MapsContext = createContext<{
  provider: MapProvider;
  setProvider: (provider: MapProvider) => void;
}>({
  provider: "google",
  setProvider: () => {},
});

export function MapsPreference({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<MapProvider>("google");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Read browser preference after hydration to preserve matching server/client output.
    setProvider(getPreferredMapProvider());
  }, []);
  function chooseProvider(value: MapProvider) {
    setProvider(value);
    setPreferredMapProvider(value);
  }
  return (
    <MapsContext.Provider value={{ provider, setProvider: chooseProvider }}>
      {children}
    </MapsContext.Provider>
  );
}

export function useMapsPreference() {
  return useContext(MapsContext);
}

export function MapsProviderSelect() {
  const { provider, setProvider } = useMapsPreference();
  const id = useId();
  return (
    <div className="mb-3">
      <label className="small text-body-secondary form-label" htmlFor={id}>
        Map Provider
      </label>
      <select
        id={id}
        className="form-select form-select-sm maps-provider"
        value={provider}
        onChange={(event) => setProvider(event.target.value === "apple" ? "apple" : "google")}
      >
        <option value="apple">Apple Maps</option>
        <option value="google">Google Maps</option>
      </select>
    </div>
  );
}
