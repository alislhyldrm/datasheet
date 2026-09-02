import { NextRequest } from "next/server";
import { rateLimit } from "@/lib/api-guard";
import { resolveProvider } from "@/lib/llm/registry";
import { mapProviderError } from "@/lib/llm/errors";
import { ProviderConfigError, type ProviderDocumentRef } from "@/lib/llm/types";
import type { ChatStreamEvent, HistoryTurn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ChatBody {
  fileIds: string[];
  fileNames: string[];
  question: string;
  history: HistoryTurn[];
  provider?: string;
  model?: string;
  apiKey?: string;
}

// Opaque provider file handle: "file_..." (Anthropic), "file-..." (OpenAI),
// "files/..." (Gemini). Never parsed here — only echoed back to its provider —
// so the check is just "plausible token", not a provider-specific shape.
const FILE_ID = /^[A-Za-z0-9_/.:-]{1,256}$/;
const MAX_FILES = 5;
const MAX_QUESTION_CHARS = 4000;
const MAX_HISTORY_TURNS = 50;
const MAX_TURN_CHARS = 60_000;

function validHistory(history: unknown): history is HistoryTurn[] {
  if (!Array.isArray(history) || history.length > MAX_HISTORY_TURNS) return false;
  return history.every((turn) => {
    if (!turn || typeof turn !== "object") return false;
    const { role, text } = turn as { role?: unknown; text?: unknown };
    return (
      (role === "user" || role === "assistant") &&
      typeof text === "string" &&
      text.length <= MAX_TURN_CHARS
    );
  });
}

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: NextRequest) {
  if (!rateLimit(req, "chat", 20)) {
    return new Response("Çok fazla istek. Bir dakika sonra tekrar deneyin.", {
      status: 429,
    });
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response("Geçersiz istek", { status: 400 });
  }

  const { fileIds, fileNames, question, history } = body;
  if (
    !Array.isArray(fileIds) ||
    fileIds.length === 0 ||
    fileIds.length > MAX_FILES ||
    !fileIds.every((id) => typeof id === "string" && FILE_ID.test(id))
  ) {
    return new Response("En az bir geçerli datasheet gerekli", { status: 400 });
  }
  if (
    !question ||
    typeof question !== "string" ||
    question.length > MAX_QUESTION_CHARS
  ) {
    return new Response("Soru gerekli (en fazla 4000 karakter)", { status: 400 });
  }
  if (history !== undefined && !validHistory(history)) {
    return new Response("Geçersiz sohbet geçmişi", { status: 400 });
  }

  let resolved;
  try {
    resolved = resolveProvider(body.provider, body.model, body.apiKey);
  } catch (err) {
    if (err instanceof ProviderConfigError) {
      return new Response(err.message, { status: 400 });
    }
    throw err;
  }
  const { adapter, apiKey, model } = resolved;

  const documents: ProviderDocumentRef[] = fileIds.map((id, i) => ({
    provider: adapter.id,
    id,
    fileName:
      (Array.isArray(fileNames) && typeof fileNames[i] === "string"
        ? fileNames[i].slice(0, 200)
        : "") || `datasheet-${i + 1}.pdf`,
    sizeBytes: 0,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(sse(obj)));
      try {
        await adapter.streamChat({
          apiKey,
          model,
          documents,
          question,
          history: Array.isArray(history) ? history : [],
          signal: req.signal,
          emit: send,
        });
        send({ type: "done" });
      } catch (err) {
        // Client went away: nothing to report to, and enqueue would throw.
        if (req.signal.aborted) return;
        console.error("[chat]", err);
        send({ type: "error", message: mapProviderError(adapter.id, err) });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by an aborted stream.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
