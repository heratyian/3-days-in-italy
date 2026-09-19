"use client";

import { useEffect, useRef } from "react";
import type Dropdown from "bootstrap/js/dist/dropdown";
import { MapsProviderSelect } from "./MapsPreference";

export default function ChatMenu({ busy, onRestart, onSignOut }: {
  busy: boolean; onRestart: () => void; onSignOut: () => void;
}) {
  const toggle = useRef<HTMLButtonElement>(null);
  const dropdown = useRef<Dropdown | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Bootstrap reads the DOM at import time.
    void import("bootstrap/js/dist/dropdown").then(({ default: Dropdown }) => {
      if (!cancelled) dropdown.current = new Dropdown(toggle.current!, { autoClose: "outside" });
    });
    return () => {
      cancelled = true;
      dropdown.current?.dispose();
      dropdown.current = null;
    };
  }, []);

  function choose(action: () => void) {
    dropdown.current?.hide();
    toggle.current?.focus();
    action();
  }

  return <div className="dropdown">
    <button ref={toggle} type="button" className="btn btn-sm btn-outline-secondary"
      data-bs-toggle="dropdown" aria-expanded="false" aria-label="Chat settings">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <div className="dropdown-menu dropdown-menu-end shadow-sm">
      <div className="px-3 py-2"><MapsProviderSelect /></div>
      <hr className="dropdown-divider" />
      <button type="button" className="dropdown-item text-danger" disabled={busy} onClick={() => choose(onRestart)}>Restart</button>
      <button type="button" className="dropdown-item" disabled={busy} onClick={() => choose(onSignOut)}>Sign out</button>
    </div>
  </div>;
}
