"use client";

import { useMemo, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import placeReferences from "../../lib/place-references";
import PlaceReference from "./PlaceReference";
import type { Place } from "../../lib/places";

const noPlaces: Record<string, Place | undefined> = {};

export default function Message({ human, content, places = noPlaces, onSelectPlace = () => {} }: {
  human: boolean; content: string; places?: Record<string, Place | undefined>; onSelectPlace?: (placeId: string) => void;
}) {
  const [copyStatus, setCopyStatus] = useState("Copy");
  const components = useMemo<Components>(() => ({
    img: () => null,
    button: ({ children, node }) => {
      const place = places[String(node?.properties["data-place-id"] ?? "")];
      return place ? <PlaceReference place={place} onSelect={onSelectPlace}>{children}</PlaceReference> : <>{children}</>;
    },
    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  }), [onSelectPlace, places]);
  async function copy() {
    try { await navigator.clipboard.writeText(content); setCopyStatus("Copied"); }
    catch { setCopyStatus("Could not copy"); }
  }
  return <article className={`message card border-0 mb-3 ${human ? "message-user bg-body-tertiary" : "message-assistant"}`}>
    <div className="card-body">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h2 className="fs-6 fw-semibold mb-0">{human ? "You" : "Assistant"}</h2>
        {!human && <button className="btn btn-sm btn-link text-body-secondary p-0" onClick={copy} aria-label="Copy assistant response">{copyStatus}</button>}
      </div>
      {human ? <div className="plain-message">{content}</div> : <div className="markdown">
        {/* Raw HTML stays disabled; external images aren't loaded from model output. */}
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[[placeReferences, places]]} skipHtml components={components}>{content}</Markdown>
      </div>}
    </div>
  </article>;
}
