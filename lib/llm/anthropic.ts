// Anthropic adapter. The Messages API reads the complete PDF inline, and
// citations come back structured
// (page_location) with a verbatim quote — no prompt contract needed.

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import type {
  ProviderAdapter,
  ProviderDocumentRef,
  StreamChatArgs,
  UploadArgs,
} from "./types";
import { ProviderConfigError } from "./types";

const MAX_TOKENS = 64000;
const INLINE_DOCUMENT_TTL_MS = 2 * 60 * 60 * 1000;
// `xhigh` is the recommended level for the hardest work on Sonnet 5; `max`
// costs more and can overthink a lookup like this one.
const EFFORT = "xhigh" as const;

function client(apiKey: string): Anthropic {
  if (!apiKey) throw new ProviderConfigError("Anthropic API anahtarı gerekli");
  return new Anthropic({ apiKey });
}

// Anthropic's Messages API accepts a complete PDF inline. This avoids a Files
// API dependency, which is unavailable (404) for some Anthropic accounts.
// The documents remain only in this local Node process and expire automatically.
interface InlineDocument {
  bytes: Buffer;
  expiresAt: number;
}

type InlineDocumentStore = Map<string, InlineDocument>;

// Route handlers are bundled as separate modules in development. `globalThis`
// is shared by those modules in the same Node process, unlike module scope.
const documentStore = globalThis as typeof globalThis & {
  __datasheetAnthropicDocuments?: InlineDocumentStore;
};
const inlineDocuments =
  documentStore.__datasheetAnthropicDocuments ??=
  new Map<string, InlineDocument>();

function pruneInlineDocuments(now = Date.now()) {
  for (const [id, document] of inlineDocuments) {
    if (document.expiresAt <= now) inlineDocuments.delete(id);
  }
}

function getInlineDocument(id: string): InlineDocument {
  pruneInlineDocuments();
  const document = inlineDocuments.get(id);
  if (!document) {
    throw new ProviderConfigError(
      "Anthropic oturumu yeniden baÅŸlatÄ±lmÄ±ÅŸ veya sÃ¼resi dolmuÅŸ. PDF'i tekrar yÃ¼kleyin.",
    );
  }
  return document;
}

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  capabilities: {
    nativePdf: true,
    nativeCitations: true,
    pageCitations: true,
    exactQuoteCitations: true,
  },

  async uploadDocument({ apiKey, fileName, bytes }: UploadArgs): Promise<ProviderDocumentRef> {
    client(apiKey);
    const id = `local-${randomUUID()}`;
    pruneInlineDocuments();
    inlineDocuments.set(id, {
      bytes,
      expiresAt: Date.now() + INLINE_DOCUMENT_TTL_MS,
    });
    return {
      provider: "anthropic",
      id,
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
    const docBlocks: Anthropic.ContentBlockParam[] = documents.map((doc, i) => {
      const document = getInlineDocument(doc.id);
      return {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: document.bytes.toString("base64"),
        },
        title: doc.fileName.slice(0, 200) || `datasheet-${i + 1}.pdf`,
        citations: { enabled: true },
        ...(i === documents.length - 1
          ? { cache_control: { type: "ephemeral" as const } }
          : {}),
      };
    });

    const turns = [...history, { role: "user" as const, text: question }];
    const messages: Anthropic.MessageParam[] = turns.map((turn, i) =>
      i === 0
        ? {
            role: "user",
            content: [
              ...docBlocks,
              { type: "text", text: turn.text },
            ] as Anthropic.ContentBlockParam[],
          }
        : { role: turn.role, content: turn.text },
    );

    const stream = client(apiKey).messages.stream(
      {
        model,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
        system: SYSTEM_PROMPT,
        messages,
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
