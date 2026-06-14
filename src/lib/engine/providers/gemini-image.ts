// Gemini image provider ("Nano Banana").
//
// Calls the Gemini generateContent REST endpoint with an IMAGE response
// modality and returns the first inline image. No SDK — plain fetch, so it runs
// in any Node/Next runtime. Auth is the standard x-goog-api-key header.
//
// The model id defaults to Nano Banana but is overridable via GEMINI_IMAGE_MODEL
// in case Google renames the preview.

import type { GeneratedImage, ImageGenProvider } from '../layers/image-gen';

const DEFAULT_MODEL = 'gemini-2.5-flash-image-preview';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

interface InlineDataPart {
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
  text?: string;
}
interface GenerateContentResponse {
  candidates?: { content?: { parts?: InlineDataPart[] } }[];
  promptFeedback?: { blockReason?: string };
}

export class GeminiImageProvider implements ImageGenProvider {
  readonly id: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts?: { apiKey?: string; model?: string }) {
    const apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY ?? '';
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    this.apiKey = apiKey;
    this.model = opts?.model ?? process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;
    this.id = `gemini-image:${this.model}`;
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    const url = `${ENDPOINT}/${this.model}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gemini image API ${res.status}: ${detail.slice(0, 300)}`);
    }

    const body = (await res.json()) as GenerateContentResponse;
    if (body.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the prompt: ${body.promptFeedback.blockReason}`);
    }

    const parts = body.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData ?? part.inline_data;
      const data = inline?.data;
      const mime = (inline as { mimeType?: string; mime_type?: string } | undefined)?.mimeType
        ?? (inline as { mime_type?: string } | undefined)?.mime_type;
      if (data) return { base64: data, mime: mime ?? 'image/png' };
    }
    throw new Error('Gemini returned no inline image data');
  }
}
