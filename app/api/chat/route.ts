import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getClient, MODEL, MAX_TOKENS, FILES_BETA } from "@/lib/anthropic";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type { HistoryTurn } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ChatBody {
  fileIds: string[];
  fileNames: string[];
  question: string;
  history: HistoryTurn[];
}

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response("Geçersiz istek", { status: 400 });
  }

  const { fileIds, fileNames, question, history } = body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return new Response("En az bir datasheet gerekli", { status: 400 });
  }
  if (!question || typeof question !== "string") {
    return new Response("Soru gerekli", { status: 400 });
  }

  const client = getClient();

  // Document blocks attached to the FIRST user turn. Citations on for every
  // block; cache_control on the last one so the datasheet(s) + system prompt
  // are cached as a prefix and reused (~90% cheaper) on later questions.
  const docBlocks: Anthropic.Beta.BetaContentBlockParam[] = fileIds.map(
    (fileId, i) => ({
      type: "document",
      source: { type: "file", file_id: fileId },
      title: fileNames?.[i] || `datasheet-${i + 1}.pdf`,
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
        } else if (err instanceof Error) {
          message = err.message;
        }
        console.error("[chat]", message);
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
