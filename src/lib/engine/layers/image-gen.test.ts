import { describe, expect, it } from 'vitest';

import { fillImages, type ImageGenProvider, type ImageStore } from './image-gen';
import type { ImageSlot } from '../types';

const PLACEHOLDER = '/rankenstein-placeholder.svg';

function slot(prompt = 'a hero image'): ImageSlot {
  return { prompt, alt: 'alt text', title: 'title', src: PLACEHOLDER };
}

function htmlWith(n: number): string {
  return Array.from({ length: n }, () => `<figure><img src="${PLACEHOLDER}" alt="x"></figure>`).join('');
}

const okProvider: ImageGenProvider = {
  id: 'fake',
  async generate() {
    return { base64: 'QUJD', mime: 'image/png' };
  },
};

describe('fillImages', () => {
  it('inlines a data URL and swaps the placeholder when there is no store', async () => {
    const res = await fillImages({ html: htmlWith(1), images: [slot()], provider: okProvider });
    expect(res.images[0].src).toBe('data:image/png;base64,QUJD');
    expect(res.html).toContain('data:image/png;base64,QUJD');
    expect(res.html).not.toContain(PLACEHOLDER);
    expect(res.flags).toHaveLength(1);
    expect(res.flags[0].severity).toBe('GOOD');
  });

  it('uses the store URL when a store is provided', async () => {
    const store: ImageStore = {
      async put(bytes, mime) {
        expect(bytes.length).toBeGreaterThan(0);
        expect(mime).toBe('image/png');
        return 'https://cdn.example.com/img-0.png';
      },
    };
    const res = await fillImages({ html: htmlWith(1), images: [slot()], provider: okProvider, store });
    expect(res.images[0].src).toBe('https://cdn.example.com/img-0.png');
    expect(res.html).toContain('https://cdn.example.com/img-0.png');
  });

  it('keeps the placeholder and raises a WARN flag on failure (never throws)', async () => {
    const failing: ImageGenProvider = {
      id: 'fail',
      async generate() {
        throw new Error('quota exceeded');
      },
    };
    const res = await fillImages({ html: htmlWith(1), images: [slot()], provider: failing });
    expect(res.images[0].src).toBe(PLACEHOLDER);
    expect(res.html).toContain(PLACEHOLDER);
    expect(res.flags[0].severity).toBe('WARN');
    expect(res.flags[0].note).toContain('quota exceeded');
  });

  it('swaps one placeholder per slot in order', async () => {
    let n = 0;
    const counting: ImageGenProvider = {
      id: 'count',
      async generate() {
        n += 1;
        return { base64: Buffer.from(`img${n}`).toString('base64'), mime: 'image/png' };
      },
    };
    const store: ImageStore = { async put(_b, _m, hint) { return `https://cdn/${hint}.png`; } };
    const res = await fillImages({ html: htmlWith(2), images: [slot('a'), slot('b')], provider: counting, store, keyHint: 'piece' });
    expect(res.html).toContain('https://cdn/piece-0.png');
    expect(res.html).toContain('https://cdn/piece-1.png');
    expect(res.html).not.toContain(PLACEHOLDER);
  });

  it('skips slots without a prompt', async () => {
    const res = await fillImages({ html: htmlWith(1), images: [{ ...slot(), prompt: '' }], provider: okProvider });
    expect(res.images[0].src).toBe(PLACEHOLDER);
    expect(res.flags).toHaveLength(0);
  });
});
