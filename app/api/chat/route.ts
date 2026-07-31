import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient, MODEL, MAX_TOKENS, EFFORT, FILES_BETA } from "@/lib/anthropic";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { rateLimit } from "@/lib/api-guard";
import type { HistoryTurn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ChatBody {
  fileIds: string[];
  fileNames: string[];
  question: string;
  history: HistoryTurn[];
}

// Anthropic Files API ids: "file_" + base62-ish tail. Anything else is junk
// or a probe and never reaches the API.
const FILE_ID = /^file_[A-Za-z0-9_-]{1,64}$/;
const MAX_FILES = 5;
const MAX_QUESTION_CHARS = 4000;
// Bounds the request body without clipping real conversations: MAX_TOKENS of
// output is roughly 50k characters, and 50 turns is a very long session.
const MAX_HISTORY_TURNS = 50;
const MAX_TURN_CHARS = 60_000;

function validHistory(history: unknown): history is HistoryTurn[] {
  if (!Array.isArray(history) || history.length > MAX_HISTORY_TURNS) {
    return false;
  }
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
    return new Response("Soru gerekli (en fazla 4000 karakter)", {
      status: 400,
    });
  }
  if (history !== undefined && !validHistory(history)) {
    return new Response("Geçersiz sohbet geçmişi", { status: 400 });
  }

  const client = getClient();

  // Document blocks attached to the FIRST user turn. Citations on for every
  // block; cache_control on the last one so the datasheet(s) + system prompt
  // are cached as a prefix and reused (~90% cheaper) on later questions.
  const docBlocks: Anthropic.Beta.BetaContentBlockParam[] = fileIds.map(
    (fileId, i) => ({
      type: "document",
      source: { type: "file", file_id: fileId },
      title:
        (Array.isArray(fileNames) && typeof fileNames[i] === "string"
          ? fileNames[i].slice(0, 200)
          : "") || `datasheet-${i + 1}.pdf`,
      citations: { enabled: true },
      ...(i === fileIds.length - 1
        ? { cache_control: { type: "ephemeral" as const } }
        : {}),
    })
  );

  // Full turn sequence = prior history + new question. Docs go on turn 0.
  const turns: HistoryTurn[] = [
    ...(Array.isArray(history) ? history : []),
    { role: "user", text: question },
  ];

  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((turn, i) => {
    if (i === 0) {
      return {
        role: "user",
        content: [
          ...docBlocks,
          { type: "text", text: turn.text },
        ] as Anthropic.Beta.BetaContentBlockParam[],
      };
    }
    return { role: turn.role, content: turn.text };
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(sse(obj)));
      try {
        const anthropicStream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          thinking: { type: "adaptive" },
          output_config: { effort: EFFORT },
          system: SYSTEM_PROMPT,
          messages,
          betas: [FILES_BETA],
        });

        for await (const event of anthropicStream) {
          if (event.type === "content_block_delta") {
            const delta = event.delta;
            if (delta.type === "text_delta") {
              send({ type: "text", text: delta.text });
            } else if (delta.type === "citations_delta") {
              const c = delta.citation;
              if (c.type === "page_location") {
                send({
                  type: "citation",
                  citation: {
                    citedText: c.cited_text,
                    documentIndex: c.document_index,
                    documentTitle: c.document_title ?? null,
                    startPage: c.start_page_number ?? null,
                    endPage: c.end_page_number ?? null,
                  },
                });
              }
            }
          }
        }

        const final = await anthropicStream.finalMessage();
        if (final.stop_reason === "refusal") {
          send({
            type: "error",
            message:
              "Model bu isteği güvenlik nedeniyle yanıtlamadı. Soruyu yeniden ifade edin.",
          });
        }
        send({ type: "done" });
      } catch (err) {
        let message = "Bir hata oluştu";
        if (err instanceof Anthropic.RateLimitError) {
          message = "Hız sınırı aşıldı, birkaç saniye sonra tekrar deneyin.";
        } else if (
          err instanceof Anthropic.APIError &&
          typeof err.status === "number" &&
          err.status >= 500
        ) {
          message = "Sunucu meşgul (Anthropic). Tekrar deneyin.";
        } else if (err instanceof Anthropic.APIError && err.status === 404) {
          message =
            "Datasheet dosyası bulunamadı veya süresi doldu. PDF'i tekrar yükleyin.";
        }
        // Unmapped errors keep the generic message; details stay server-side.
        console.error("[chat]", err);
        send({ type: "error", message });
      } finally {
        controller.close();
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
