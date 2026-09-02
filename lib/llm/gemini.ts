// Gemini adapter. `generateContent` reads the PDF whole (native document
// vision — tables and figures included) from a Files API URI. File Search would
// give page-numbered citations but only by chunking the document first, so this
// path stays on direct input and uses the prompt contract, verified
// client-side, for citations.

import { GoogleGenAI, FinishReason, FileState } from "@google/genai";
import type { Content } from "@google/genai";
import { assembleSystemPrompt } from "@/lib/prompts";
import { CitationContractParser } from "./citation-contract";
import type {
  ProviderAdapter,
  ProviderDocumentRef,
  StreamChatArgs,
  UploadArgs,
} from "./types";
import { ProviderConfigError } from "./types";

const MAX_OUTPUT_TOKENS = 32000;
const UPLOAD_POLL_MS = 1500;
const UPLOAD_TIMEOUT_MS = 90_000;

function client(apiKey: string): GoogleGenAI {
  if (!apiKey) throw new ProviderConfigError("Gemini API anahtarı gerekli");
  return new GoogleGenAI({ apiKey });
}

const BLOCKED: ReadonlySet<FinishReason> = new Set([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",
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
    const ai = client(apiKey);
    // Node's files.upload accepts a Blob; mimeType comes from the Blob's type.
    // Copy into a plain Uint8Array — Buffer's ArrayBufferLike backing is not a
    // valid BlobPart under strict lib types.
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    let file = await ai.files.upload({
      file: blob,
      config: { mimeType: "application/pdf", displayName: fileName },
    });

    // The PDF is not usable until it finishes server-side processing.
    const deadline = Date.now() + UPLOAD_TIMEOUT_MS;
    while (file.state === FileState.PROCESSING) {
      if (Date.now() > deadline) {
        throw new Error("Gemini dosya işleme zaman aşımına uğradı");
      }
      await new Promise((r) => setTimeout(r, UPLOAD_POLL_MS));
      file = await ai.files.get({ name: file.name ?? "" });
    }
    if (file.state !== FileState.ACTIVE || !file.name) {
      throw new Error("Gemini dosyayı işleyemedi");
    }

    return {
      provider: "gemini",
      id: file.name,
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
    const ai = client(apiKey);
    const multiDoc = documents.length > 1;
    const parser = new CitationContractParser(multiDoc);

    // Re-fetch each file to get a live URI and confirm it is still ACTIVE
    // (Gemini files expire after 48h, which a long session can outlive).
    const fileParts = await Promise.all(
      documents.map(async (doc) => {
        const file = await ai.files.get({ name: doc.id });
        if (file.state !== FileState.ACTIVE || !file.uri) {
          throw new Error(
            "Datasheet dosyası bulunamadı veya süresi doldu. PDF'i tekrar yükleyin.",
          );
        }
        return {
          fileData: { fileUri: file.uri, mimeType: "application/pdf" },
        };
      }),
    );

    const turns = [...history, { role: "user" as const, text: question }];
    const contents: Content[] = turns.map((turn, i) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts:
        i === 0
          ? [...fileParts, { text: turn.text }]
          : [{ text: turn.text }],
    }));

    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: assembleSystemPrompt("gemini", multiDoc),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: signal,
      },
    });

    let blocked = false;
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) for (const ev of parser.push(text)) emit(ev);
      const reason = chunk.candidates?.[0]?.finishReason;
      if (reason && BLOCKED.has(reason)) blocked = true;
    }
    for (const ev of parser.flush()) emit(ev);

    if (blocked) {
      emit({
        type: "error",
        message:
          "Model yanıtı güvenlik filtresine takıldı. Soruyu yeniden ifade edin.",
      });
    }
  },

  async deleteDocument({ apiKey, document }) {
    await client(apiKey)
      .files.delete({ name: document.id })
      .catch(() => {});
  },
};
