// LAYER image-gen (agent, toggle, default off)
//
// Turns the drafter's image PROMPTS into real images. The drafter emits
// ImageSlot[] (prompt + alt + title, src = placeholder); this layer asks an
// injected provider (Nano Banana / Gemini in prod) to render each prompt, then
// stores the bytes and fills `src`. Same refuse-and-flag discipline as the rest
// of the engine: if generation fails we KEEP the placeholder and raise a WARN
// gap flag — we never ship a broken <img> and never fabricate a stock URL.
//
// The provider + store are injected so the pipeline stays deterministic and the
// layer is unit-testable with fakes (no network, no AWS).

import type { GuardrailFlag, ImageSlot } from '../types';

/** Raw bytes a provider returns. */
export interface GeneratedImage {
  base64: string;
  mime: string;
}

export interface ImageGenProvider {
  readonly id: string;
  generate(prompt: string): Promise<GeneratedImage>;
}

/** Persists image bytes somewhere servable; returns the public URL. */
export interface ImageStore {
  put(bytes: Uint8Array, mime: string, keyHint: string): Promise<string>;
}

// Must match draft.ts PLACEHOLDER_SRC — the value the drafter embeds before this
// layer runs.
const PLACEHOLDER_SRC = '/rankenstein-placeholder.svg';

function dataUrl(img: GeneratedImage): string {
  return `data:${img.mime};base64,${img.base64}`;
}

function truncate(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export interface FillImagesInput {
  html: string;
  images: ImageSlot[];
  provider: ImageGenProvider;
  /** optional host; without it the image is inlined as a data: URL. */
  store?: ImageStore;
  /** stable hint for storage keys (e.g. the piece slug). */
  keyHint?: string;
}

export interface FillImagesResult {
  html: string;
  images: ImageSlot[];
  flags: GuardrailFlag[];
}

/** Generate every slot's image, fill `src`, and swap the placeholder in the
 *  HTML. Failures degrade to the placeholder + a WARN flag (never throw). */
export async function fillImages(input: FillImagesInput): Promise<FillImagesResult> {
  const flags: GuardrailFlag[] = [];
  const out: ImageSlot[] = [];
  let html = input.html;

  for (let i = 0; i < input.images.length; i++) {
    const slot = input.images[i];
    if (!slot.prompt?.trim()) {
      out.push(slot);
      continue;
    }
    try {
      const gen = await input.provider.generate(slot.prompt);
      let src: string;
      if (input.store) {
        const bytes = Uint8Array.from(Buffer.from(gen.base64, 'base64'));
        src = await input.store.put(bytes, gen.mime, `${input.keyHint ?? 'image'}-${i}`);
      } else {
        src = dataUrl(gen);
      }
      out.push({ ...slot, src });
      // Replace the first remaining placeholder src with this slot's real src.
      // Use a function replacer so `$` in the URL is never treated as a
      // back-reference, and so only the first occurrence is swapped.
      html = html.replace(`src="${PLACEHOLDER_SRC}"`, () => `src="${src}"`);
      flags.push({
        type: 'provenance',
        severity: 'GOOD',
        note: `Generated image for "${truncate(slot.prompt)}" via ${input.provider.id}.`,
      });
    } catch (err) {
      out.push({ ...slot, src: PLACEHOLDER_SRC });
      flags.push({
        type: 'gap',
        severity: 'WARN',
        note: `Image generation failed for "${truncate(slot.prompt)}"; kept placeholder. ${(err as Error).message}`,
      });
    }
  }

  return { html, images: out, flags };
}
