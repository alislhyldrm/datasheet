// Anthropic adapter. This is the reference path: the Files API holds the PDF,
// the Messages API reads it whole, and citations come back structured
// (page_location) with a verbatim quote — no prompt contract needed.

import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type {
  ProviderAdapter,
  ProviderDocumentRef,
  StreamChatArgs,
  UploadArgs,
} from "./types";
import { ProviderConfigError } from "./types";

const FILES_BETA = "files-api-2025-04-14";
const MAX_TOKENS = 64000;
// `xhigh` is the recommended level for the hardest work on Sonnet 5; `max`
// costs more and can overthink a lookup like this one.
const EFFORT = "xhigh" as const;

function client(apiKey: string): Anthropic {
  if (!apiKey) throw new ProviderConfigError("Anthropic API anahtarı gerekli");
  return new Anthropic({ apiKey });
}

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  capabilities: {
    nativePdf: true,
    nativeCitations: true,
    pageCitations: true,
    exactQuoteCitations: true,
  },

  async uploadDocument({
    apiKey,
    fileName,
    bytes,
  }: UploadArgs): Promise<ProviderDocumentRef> {
    const uploaded = await client(apiKey).beta.files.upload({
      file: await toFile(bytes, fileName, { type: "application/pdf" }),
      betas: [FILES_BETA],
    });
    return {
      provider: "anthropic",
      id: uploaded.id,
      fileName,
      sizeBytes: bytes.length,
    };
  },

  async streamChat({
    apiKey,
    model,
    documents,
    question,
    history,
    signal,
    emit,
  }: StreamChatArgs): Promise<void> {
    // Document blocks ride on the first user turn. Citations on for every
    // block; cache_control on the last so the datasheet(s) + system prompt are
    // cached as a prefix and reused (~90% cheaper) on later questions.
    const docBlocks: Anthropic.Beta.BetaContentBlockParam[] = documents.map(
      (doc, i) => ({
        type: "document",
        source: { type: "file", file_id: doc.id },
        title: doc.fileName.slice(0, 200) || `datasheet-${i + 1}.pdf`,
        citations: { enabled: true },
        ...(i === documents.length - 1
          ? { cache_control: { type: "ephemeral" as const } }
          : {}),
      }),
    );

    const turns = [...history, { role: "user" as const, text: question }];
    const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((turn, i) =>
      i === 0
        ? {
            role: "user",
            content: [
              ...docBlocks,
              { type: "text", text: turn.text },
            ] as Anthropic.Beta.BetaContentBlockParam[],
          }
        : { role: turn.role, content: turn.text },
    );

    const stream = client(apiKey).beta.messages.stream(
      {
        model,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
        system: SYSTEM_PROMPT,
        messages,
        betas: [FILES_BETA],
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type !== "content_block_delta") continue;
      const delta = event.delta;
      if (delta.type === "text_delta") {
        emit({ type: "text", text: delta.text });
      } else if (delta.type === "citations_delta") {
        const c = delta.citation;
        if (c.type === "page_location") {
          emit({
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

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      emit({
        type: "error",
        message:
          "Model bu isteği güvenlik nedeniyle yanıtlamadı. Soruyu yeniden ifade edin.",
      });
    }
  },
};
