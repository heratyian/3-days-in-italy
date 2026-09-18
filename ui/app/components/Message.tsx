"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Message({ human, content }: { human: boolean; content: string }) {
  const [copyStatus, setCopyStatus] = useState("Copy");
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
        <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
          img: () => null,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        }}>{content}</Markdown>
      </div>}
    </div>
  </article>;
}
