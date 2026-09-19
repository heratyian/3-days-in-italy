"use client";

import { useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import placeReferences from "../../lib/place-references";
import PlaceReference from "./PlaceReference";
import type { Place } from "../../lib/places";

const noPlaces: Record<string, Place | undefined> = {};

export default function Message({
  human,
  content,
  places = noPlaces,
  onSelectPlace = () => {},
}: {
  human: boolean;
  content: string;
  places?: Record<string, Place | undefined>;
  onSelectPlace?: (placeId: string) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      img: () => null,
      button: ({ children, node }) => {
        const place = places[String(node?.properties["data-place-id"] ?? "")];
        return place ? (
          <PlaceReference place={place} onSelect={onSelectPlace}>
            {children}
          </PlaceReference>
        ) : (
          <>{children}</>
        );
      },
      a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ),
    }),
    [onSelectPlace, places],
  );
  return (
    <article
      className={`message card border-0 mb-3 ${human ? "message-user bg-body-tertiary" : "message-assistant"}`}
    >
      <div className="card-body">
        <h2 className="fs-6 fw-semibold mb-2">{human ? "You" : "Assistant"}</h2>
        {human ? (
          <div className="plain-message">{content}</div>
        ) : (
          <div className="markdown">
            {/* Raw HTML stays disabled; external images aren't loaded from model output. */}
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[placeReferences, places]]}
              skipHtml
              components={components}
            >
              {content}
            </Markdown>
          </div>
        )}
      </div>
    </article>
  );
}
