"use client";

import { isValidElement, memo, useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { TriangleAlert } from "lucide-react";
import type { ChatMessage as Msg } from "@/lib/types";
import { buildMarkdown, CITE_HREF } from "@/lib/citations/markdown";
import CitationChip from "./CitationChip";

// A cell that opens with a sign or a digit is a measurement, not a label.
const NUMERIC = /^[±+\-−–]?\s*\d/;
const NUMERIC_HEADER = /^(min|typ|typ\.|typical|max|maks|unit|birim|değer)\.?$/i;

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    return textOf((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function ChatMessage({ message, multiDoc }: { message: Msg; multiDoc: boolean }) {
  const isUser = message.role === "user";
  const { markdown, citations } = useMemo(
    () => buildMarkdown(message.segments),
    [message.segments],
  );

  const components = useMemo<Components>(
    () => ({
      a({ href, children, ...rest }) {
        const match = CITE_HREF.exec(href ?? "");
        if (match) {
          const citation = citations[Number(match[1])];
          return citation ? (
            <CitationChip citation={citation} showDoc={multiDoc} />
          ) : null;
        }
        return (
          <a
            {...rest}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-2"
          >
            {children}
          </a>
        );
      },
      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
      ul: ({ children }) => (
        <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">
          {children}
        </ol>
      ),
      strong: ({ children }) => (
        <strong className="font-semibold">{children}</strong>
      ),
      code: ({ children }) => (
        <code className="rounded-inner bg-accent-soft px-1.5 py-0.5 font-mono text-[0.9em] text-accent">
          {children}
        </code>
      ),
      pre: ({ children }) => (
        <pre className="well mb-3 overflow-x-auto rounded-control p-3.5 font-mono text-meta last:mb-0">
          {children}
        </pre>
      ),
      blockquote: ({ children }) => (
        <blockquote className="mb-3 border-l-2 border-accent/50 pl-3 text-ink-muted last:mb-0">
          {children}
        </blockquote>
      ),
      h1: ({ children }) => (
        <h1 className="mt-4 mb-2 text-title font-semibold first:mt-0">
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="mt-4 mb-2 text-title font-semibold first:mt-0">
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="mt-3 mb-1.5 font-semibold first:mt-0">{children}</h3>
      ),
      hr: () => <hr className="my-4 border-hairline" />,
      table: ({ children }) => (
        <div className="card mb-3 overflow-x-auto rounded-control last:mb-0">
          <table className="w-full border-collapse text-meta">{children}</table>
        </div>
      ),
      thead: ({ children }) => (
        <thead className="bg-card-2 text-ink">{children}</thead>
      ),
      th: ({ children, style }) => {
        const numeric = NUMERIC_HEADER.test(textOf(children).trim());
        return (
          <th
            style={style}
            className={`border-b border-hairline px-3 py-2 font-medium ${numeric ? "text-right" : "text-left"}`}
          >
            {children}
          </th>
        );
      },
      td: ({ children, style }) => {
        const numeric = NUMERIC.test(textOf(children).trim());
        return (
          <td
            style={style}
            className={`border-b border-hairline px-3 py-2 ${numeric ? "text-right font-mono" : ""}`}
          >
            {children}
          </td>
        );
      },
    }),
    [citations, multiDoc],
  );

  if (isUser) {
    return (
      <div className="msg-enter flex justify-end">
        <div className="card max-w-[85%] rounded-card rounded-br-inner px-4 py-2.5 text-body whitespace-pre-wrap text-ink">
          {markdown}
        </div>
      </div>
    );
  }

  const hasText = markdown.trim().length > 0;

  return (
    <div className="msg-enter max-w-measure text-body leading-relaxed text-ink [&_pre_code]:bg-transparent [&_pre_code]:p-0">
      {hasText && (
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {markdown}
        </Markdown>
      )}
      {message.error && (
        <p
          className={`flex items-start gap-1.5 text-meta text-danger ${hasText ? "mt-2" : ""}`}
        >
          <TriangleAlert size={16} className="mt-px shrink-0" aria-hidden="true" />
          <span>{message.error}</span>
        </p>
      )}
    </div>
  );
}

// Only the streaming message changes identity between flushes; the rest of the
// transcript keeps its object reference and skips re-parsing its markdown.
export default memo(ChatMessage);
