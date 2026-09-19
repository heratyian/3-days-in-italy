"use client";

import { useEffect, useState } from "react";

export default function ChatProgress({ loadingHistory = false }: { loadingHistory?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const duration = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  return <div className="chat-progress rounded-3 bg-body-tertiary p-3 mx-3 mb-3">
    <div className="d-flex align-items-center gap-2">
      <span className="spinner-border spinner-border-sm flex-shrink-0" aria-hidden="true" />
      <p className="small fw-semibold mb-0" role="status">
        {loadingHistory ? "Opening your conversation…" : "Working on your reply…"}
      </p>
      <span className="small text-body-secondary ms-auto text-nowrap" aria-live="off" aria-label={`${duration} elapsed`}>{duration}</span>
    </div>
  </div>;
}
