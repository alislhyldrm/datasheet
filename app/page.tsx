"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GitCompare, MessageSquareText, Settings2, Upload } from "lucide-react";
import AppShell from "@/components/AppShell";
import UploadZone from "@/components/UploadZone";
import DocCard from "@/components/DocCard";
import ChatMessageView from "@/components/ChatMessage";
import { extractPageTexts } from "@/components/pdf/runtime";
import { streamChat } from "@/lib/chat-client";
import { useLlmSettings, type LlmSettings } from "@/lib/llm-settings";
import { PROVIDER_META } from "@/lib/llm/providers-meta";
import { verifyCitation } from "@/lib/citations/verify";
import { useServerConfig } from "@/lib/server-config";
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

const FEATURES = [
  {
    icon: Upload,
    title: "Datasheet yükle",
    detail: "PDF'i sürükle-bırak ya da seç; tamamı sayfa sayfa okunur.",
  },
  {
    icon: MessageSquareText,
    title: "Soru sor, yanıt al",
    detail: "Her değer sayfa referansı ve alıntıyla gelir.",
  },
  {
    icon: GitCompare,
    title: "Datasheet'leri karşılaştır",
    detail: "İki dokümanı aynı soruyla yan yana koy.",
  },
];

export default function Home() {
  // `settings.chosen` = the panel has been saved at least once in this
  // browser; that choice is the default from then on. Until then the server's
  // env config decides, and /api/config reports it.
  const { settings, save } = useLlmSettings();
  const server = useServerConfig();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Reading while the answer streams beats watching it: once the reader
  // scrolls away from the bottom, stop dragging them back down.
  const pinnedRef = useRef(true);
  // Compacted text per page, per doc — warmed on upload, read when verifying
  // prompt-contract citations against the real PDF.
  const pageTextRef = useRef<Map<string, string[]>>(new Map());

  // What the app runs with: this browser's saved choice, or — before there is
  // one — whatever the server is configured for.
  const active: LlmSettings =
    !settings.chosen && server?.provider
      ? { provider: server.provider, model: server.model, apiKey: "" }
      : settings;
  // A key for the chosen provider exists: typed here, or held by the server.
  const configured =
    active.apiKey.trim().length > 0 ||
    (server?.providers.includes(active.provider) ?? false);
  // Waiting on /api/config: don't flash "connect a model" at someone whose key
  // is already in .env.local.
  const resolving = !configured && server === null;

  const multiDoc = docs.length > 1;
  const nativeCitations = PROVIDER_META[active.provider].nativeCitations;

  // Keep the page-text cache in step with the open documents.
  useEffect(() => {
    const live = new Set(docs.map((d) => d.fileId));
    for (const key of pageTextRef.current.keys()) {
      if (!live.has(key)) pageTextRef.current.delete(key);
    }
    for (const doc of docs) {
      if (!doc.objectUrl || pageTextRef.current.has(doc.fileId)) continue;
      pageTextRef.current.set(doc.fileId, []);
      extractPageTexts(doc.objectUrl)
        .then((texts) => pageTextRef.current.set(doc.fileId, texts))
        .catch(() => pageTextRef.current.delete(doc.fileId));
    }
  }, [docs]);

  function dropAllDocs() {
    setDocs((prev) => {
      prev.forEach((d) => d.objectUrl && URL.revokeObjectURL(d.objectUrl));
      return [];
    });
    pageTextRef.current.clear();
    setMessages([]);
  }

  function handleSaveSettings(next: LlmSettings) {
    // A PDF uploaded to one provider is useless to another — start clean.
    if (next.provider !== active.provider) dropAllDocs();
    save(next);
    setSettingsOpen(false);
  }

  // Growing content pushes the bottom edge away by a token's worth of height
  // at a time, so "at the bottom" has to be a band rather than an equality.
  const PIN_SLACK = 64;

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= PIN_SLACK;
  }

  function scrollToBottom() {
    if (!pinnedRef.current) return;
    requestAnimationFrame(() => {
      // Instant, not smooth: an in-flight smooth scroll reports a position far
      // from the bottom, which would unpin us on its own scroll events.
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "auto",
      });
    });
  }

  function resolveCitation(citation: MessageSegment["citations"][number]) {
    if (nativeCitations) return citation;
    const doc = docs[citation.documentIndex] ?? docs[0];
    const texts = doc ? pageTextRef.current.get(doc.fileId) : undefined;
    return texts && texts.length ? verifyCitation(texts, citation) : citation;
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || streaming || docs.length === 0 || !configured) return;

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
    // Sending is an explicit request to look at the bottom again.
    pinnedRef.current = true;
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
        settings: active,
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
            assistantSegs[assistantSegs.length - 1].citations.push(
              resolveCitation(e.citation),
            );
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
    pageTextRef.current.delete(fileId);
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
    <AppShell
      docs={docs}
      onPageCount={handlePageCount}
      settings={active}
      server={server}
      settingsOpen={settingsOpen}
      onSettingsOpenChange={setSettingsOpen}
      onSaveSettings={handleSaveSettings}
    >
      {/* Uploaded docs bar */}
      {hasDocs && (
        <div className="chrome shrink-0 border-b border-hairline px-4 py-2.5">
          <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2">
            {docs.map((d, i) => (
              <DocCard key={d.fileId} doc={d} index={i} onRemove={removeDoc} />
            ))}
            {docs.length < 2 && configured && (
              <span className="w-52">
                <UploadZone
                  compact
                  label="Karşılaştır: 2. datasheet"
                  settings={active}
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
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-4">
          {!hasDocs && !configured && !resolving && (
            <div className="mx-auto mt-4 max-w-md space-y-4 text-center">
              <span
                aria-hidden="true"
                className="well mx-auto flex size-16 items-center justify-center rounded-full text-accent"
              >
                <Settings2 size={26} strokeWidth={1.75} />
              </span>
              <h2 className="text-display font-semibold tracking-tight text-ink">
                Önce bir model bağla
              </h2>
              <p className="text-body text-ink-muted">
                Sağlayıcını seç (Anthropic, OpenAI veya Google Gemini), model
                kimliğini ve kendi API anahtarını gir. Anahtar bu tarayıcıda
                kalır. Anahtarı <code>.env.local</code> dosyasına yazdıysan bu
                adıma hiç gerek yok.
              </p>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="btn-accent press mx-auto min-h-11 rounded-control px-5 font-medium"
              >
                Ayarları aç
              </button>
            </div>
          )}

          {!hasDocs && configured && (
            /* The dropzone is the whole hero; the feature notes sit beneath it
               as a quiet three-up strip that stacks below sm. */
            <div className="mx-auto mt-4 max-w-3xl space-y-4">
              <UploadZone
                label="Datasheet PDF'i yükle"
                settings={active}
                onUploaded={(doc) => setDocs([doc])}
              />

              {/* Caption, not cards: no surface, no border, nothing that reads
                  as a hit target. These only describe what the dropzone does. */}
              <ul className="grid gap-x-6 gap-y-2.5 px-1 sm:grid-cols-3">
                {FEATURES.map(({ icon: Icon, title, detail }) => (
                  <li key={title} className="flex items-start gap-2">
                    <Icon
                      size={13}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-ink-muted"
                    />
                    <span className="min-w-0 text-micro leading-relaxed text-ink-muted">
                      <span className="font-medium text-ink">{title}</span>
                      {" — "}
                      {detail}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="px-1 text-micro text-ink-muted">
                Dokümanda olmayan bilgi uydurulmaz. Bir değer yazılıyorsa,
                kaynağı o datasheet&apos;in bir sayfasıdır.
              </p>
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
                    className="card press flex min-h-11 items-center rounded-full px-4 text-meta text-ink transition-all duration-200 ease-fluid hover:border-accent-ring hover:text-accent"
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
              className="card inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 font-mono text-micro text-ink-muted"
            >
              <span className="caret" aria-hidden="true" />
              Analiz ediliyor
            </p>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="chrome shrink-0 border-t border-hairline px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
              !configured
                ? "Önce ayarlardan bir model bağla"
                : hasDocs
                  ? "Datasheet hakkında sor…"
                  : "Önce bir datasheet yükle"
            }
            disabled={!hasDocs || streaming || !configured}
            rows={1}
            className="well max-h-32 min-h-11 flex-1 resize-none rounded-control px-4 py-2.5 text-body text-ink transition-all duration-200 ease-fluid placeholder:text-ink-muted focus:border-accent-ring disabled:opacity-70"
          />
          <button
            type="submit"
            disabled={!hasDocs || streaming || !input.trim() || !configured}
            className="btn-accent press min-h-11 shrink-0 rounded-control px-5 font-medium transition-all duration-200 ease-fluid disabled:cursor-not-allowed disabled:text-ink-muted"
          >
            Sor
          </button>
        </form>
      </div>
    </AppShell>
  );
}
