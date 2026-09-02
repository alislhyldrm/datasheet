// OpenAI adapter. The Responses API reads the PDF whole through an `input_file`
// part (no vector store, no retrieval — File Search would chunk the document
// and lose the tables and figures this tool exists to read). OpenAI has no
// structured citation channel for that path, so citations come from the prompt
// contract and are verified client-side against the real page text.

import OpenAI, { toFile } from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { assembleSystemPrompt } from "@/lib/prompts";
import { CitationContractParser } from "./citation-contract";
import type {
  ProviderAdapter,
  ProviderDocumentRef,
  StreamChatArgs,
  UploadArgs,
} from "./types";
import { ProviderConfigError } from "./types";

const EFFORT = "high" as const;
const MAX_OUTPUT_TOKENS = 32000;

function client(apiKey: string): OpenAI {
  if (!apiKey) throw new ProviderConfigError("OpenAI API anahtarı gerekli");
  return new OpenAI({ apiKey });
}

export const openaiAdapter: ProviderAdapter = {
  id: "openai",
  capabilities: {
    nativePdf: true,
    nativeCitations: false,
    pageCitations: false,
    exactQuoteCitations: false,
  },

  async uploadDocument({
    apiKey,
    fileName,
    bytes,
  }: UploadArgs): Promise<ProviderDocumentRef> {
    const uploaded = await client(apiKey).files.create({
      file: await toFile(bytes, fileName, { type: "application/pdf" }),
      purpose: "user_data",
    });
    return {
      provider: "openai",
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
    const multiDoc = documents.length > 1;
    const parser = new CitationContractParser(multiDoc);

    const docParts: ResponseInputItem.Message["content"] = documents.map(
      (doc) => ({
        type: "input_file" as const,
        file_id: doc.id,
        filename: doc.fileName,
      }),
    );

    const turns = [...history, { role: "user" as const, text: question }];
    const input: ResponseInputItem[] = turns.map((turn, i) => {
      if (i === 0) {
        return {
          role: "user",
          content: [
            ...docParts,
            { type: "input_text" as const, text: turn.text },
          ],
        };
      }
      return { role: turn.role, content: turn.text };
    });

    // Reasoning params only apply to the reasoning models; sending them to a
    // gpt-4.x model is a 400.
    const reasons = /^(gpt-5|o[0-9])/i.test(model);

    const stream = await client(apiKey).responses.create(
      {
        model,
        instructions: assembleSystemPrompt("openai", multiDoc),
        input,
        ...(reasons ? { reasoning: { effort: EFFORT } } : {}),
        max_output_tokens: MAX_OUTPUT_TOKENS,
        stream: true,
      },
      { signal },
    );

    let refusal = "";
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        for (const ev of parser.push(event.delta)) emit(ev);
      } else if (event.type === "response.refusal.delta") {
        refusal += event.delta;
      } else if (event.type === "error") {
        emit({
          type: "error",
          message: event.message || "OpenAI akışı hata verdi.",
        });
      }
    }
    for (const ev of parser.flush()) emit(ev);

    if (refusal.trim()) {
      emit({
        type: "error",
        message:
          "Model bu isteği yanıtlamayı reddetti. Soruyu yeniden ifade edin.",
      });
    }
  },

  async deleteDocument({ apiKey, document }) {
    await client(apiKey)
      .files.delete(document.id)
      .catch(() => {});
  },
};
