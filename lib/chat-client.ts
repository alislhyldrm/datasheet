import type { ChatStreamEvent, HistoryTurn } from "./types";

interface StreamArgs {
  fileIds: string[];
  fileNames: string[];
  question: string;
  history: HistoryTurn[];
  onEvent: (e: ChatStreamEvent) => void;
  signal?: AbortSignal;
}

// POST /api/chat and parse the SSE stream, invoking onEvent per event.
export async function streamChat({
  fileIds,
  fileNames,
  question,
  history,
  onEvent,
  signal,
}: StreamArgs): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileIds, fileNames, question, history }),
    signal,
  });

  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => "");
    onEvent({ type: "error", message: msg || `Hata ${res.status}` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        onEvent(JSON.parse(json) as ChatStreamEvent);
      } catch {
        // ignore malformed frame
      }
    }
  }
}
