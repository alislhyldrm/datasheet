"use client";

import { useCallback, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import UploadZone from "@/components/UploadZone";
import DocCard from "@/components/DocCard";
import ChatMessageView from "@/components/ChatMessage";
import { streamChat } from "@/lib/chat-client";
import type {
  ChatMessage,
  MessageSegment,
  UploadedDoc,
  HistoryTurn,
} from "@/lib/types";

const SUGGESTIONS = [
  "Absolute maximum ratings nedir?",
  "Besleme gerilimi aralığı (min/typ/max)?",
  "3.3V lojik ile uyumlu mu?",
  "Pinout / bacak bağlantıları?",
  "Çalışma sıcaklığı aralığı?",
];

export default function Home() {
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const multiDoc = docs.length > 1;

  function scrollToBottom() {
    requestAnimationFrame(() => {
      // A JS scroll ignores the reduced-motion CSS override, so ask directly.
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches;
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    });
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || streaming || docs.length === 0) return;

    const history: HistoryTurn[] = messages.map((m) => ({
      role: m.role,
      text: m.segments.map((s) => s.text).join(""),
    }));

    const userMsg: ChatMessage = {
      role: "user",
      segments: [{ text: q, citations: [] }],
    };
    const assistantSegs: MessageSegment[] = [{ text: "", citations: [] }];

    setInput("");
    setMessages((prev) => [
      ...prev,
      userMsg,
      { role: "assistant", segments: [{ text: "", citations: [] }] },
    ]);
    setStreaming(true);
    scrollToBottom();

    // assistantSegs is a local accumulator: it never enters state, only
    // snapshots of it do. Keeps the streaming mutations off React's values.
    const failure: { message?: string } = {};
    const flush = () => {
      const segments: MessageSegment[] = assistantSegs.map((s) => ({
        text: s.text,
        citations: [...s.citations],
      }));
      const error = failure.message;
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", segments, error };
        return copy;
      });
    };

    try {
      await streamChat({
        fileIds: docs.map((d) => d.fileId),
        fileNames: docs.map((d) => d.fileName),
        question: q,
        history,
        onEvent: (e) => {
          if (e.type === "text") {
            const last = assistantSegs[assistantSegs.length - 1];
            if (last.citations.length > 0) {
              assistantSegs.push({ text: e.text, citations: [] });
            } else {
              last.text += e.text;
            }
            flush();
          } else if (e.type === "citation") {
            assistantSegs[assistantSegs.length - 1].citations.push(e.citation);
            flush();
          } else if (e.type === "error") {
            failure.message = e.message;
            flush();
          }
          scrollToBottom();
        },
      });
    } catch (err) {
      failure.message =
        "Bağlantı hatası: " +
        (err instanceof Error ? err.message : "bilinmeyen");
      flush();
    } finally {
      setStreaming(false);
      scrollToBottom();
    }
  }

  function removeDoc(fileId: string) {
    const gone = docs.find((d) => d.fileId === fileId);
    if (gone?.objectUrl) URL.revokeObjectURL(gone.objectUrl);
    setDocs((prev) => prev.filter((d) => d.fileId !== fileId));
  }

  const handlePageCount = useCallback((fileId: string, pageCount: number) => {
    setDocs((prev) =>
      prev.some((d) => d.fileId === fileId && d.pageCount !== pageCount)
        ? prev.map((d) => (d.fileId === fileId ? { ...d, pageCount } : d))
        : prev,
    );
  }, []);

  const hasDocs = docs.length > 0;

  return (
    <AppShell docs={docs} onPageCount={handlePageCount}>
      {/* Uploaded docs bar */}
      {hasDocs && (
        <div className="shrink-0 border-b border-border px-4 py-2">
          <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2">
            {docs.map((d, i) => (
              <DocCard
                key={d.fileId}
                doc={d}
                index={i}
                onRemove={removeDoc}
              />
            ))}
            {docs.length < 2 && (
              <span className="w-52">
                <UploadZone
                  compact
                  label="Karşılaştır: 2. datasheet"
                  onUploaded={(doc) =>
                    setDocs((prev) => (prev.length < 2 ? [...prev, doc] : prev))
                  }
                />
              </span>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-4">
          {!hasDocs && (
            <div className="mx-auto mt-6 max-w-md space-y-5">
              <UploadZone
                label="Datasheet PDF'i yükle (sürükle-bırak veya seç)"
                onUploaded={(doc) => setDocs([doc])}
              />
              <ul className="list-disc space-y-2 pl-5 text-meta text-ink-muted marker:text-border-strong">
                <li>Her cevap sayfa referansı ve alıntıyla gelir.</li>
                <li>Dokümanda olmayan bilgi uydurulmaz.</li>
                <li>İki datasheet&apos;i yan yana karşılaştırabilirsin.</li>
              </ul>
            </div>
          )}

          {hasDocs && messages.length === 0 && (
            <div className="mt-2">
              <p className="mb-2 text-meta text-ink-muted">Örnek sorular:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="flex min-h-11 items-center rounded-full border border-border bg-surface px-4 text-meta text-ink transition-colors duration-150 ease-out hover:border-accent hover:text-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <ChatMessageView key={i} message={m} multiDoc={multiDoc} />
          ))}

          {streaming && (
            <p
              role="status"
              className="flex items-center gap-2 font-mono text-micro text-ink-muted"
            >
              <span className="caret" aria-hidden="true" />
              analiz ediliyor
            </p>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-bg px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="mx-auto flex w-full max-w-2xl items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder={
              hasDocs ? "Datasheet hakkında sor…" : "Önce bir datasheet yükle"
            }
            disabled={!hasDocs || streaming}
            rows={1}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-body text-ink transition-colors duration-150 ease-out placeholder:text-ink-muted focus:border-accent disabled:bg-surface-2"
          />
          <button
            type="submit"
            disabled={!hasDocs || streaming || !input.trim()}
            className="min-h-11 shrink-0 rounded-xl bg-accent px-4 font-medium text-accent-ink transition-colors duration-150 ease-out hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-muted"
          >
            Sor
          </button>
        </form>
      </div>
    </AppShell>
  );
}
