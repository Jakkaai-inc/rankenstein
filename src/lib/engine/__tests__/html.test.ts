import { describe, it, expect } from 'vitest';
import {
  stripTags,
  decodeEntities,
  wordCount,
  scanArtifacts,
  extractSpecLines,
  findEmDashes,
  stripEmDashes,
  countH1,
  headingsWithEmoji,
} from '../html';

describe('html utils', () => {
  it('stripTags + decodeEntities flatten merchant HTML', () => {
    const html = '<p>Width: 58"/60"<br>100&nbsp;% Polyester</p>';
    expect(stripTags(html)).toBe('Width: 58"/60" 100 % Polyester');
  });

  it('decodeEntities handles named, decimal, hex', () => {
    expect(decodeEntities('a&amp;b')).toBe('a&b');
    expect(decodeEntities('&#65;&#x42;')).toBe('AB');
    expect(decodeEntities('3&nbsp;mm')).toBe('3 mm');
  });

  it('wordCount counts visible words only', () => {
    expect(wordCount('<p>one two <b>three</b></p>')).toBe(3);
    expect(wordCount('<style>.x{}</style><p>hi there</p>')).toBe(2);
  });

  it('scanArtifacts catches Claude paste residue', () => {
    const claude =
      '<p class="font-claude-response-body break-words whitespace-normal leading-[1.7]">x</p>';
    const r = scanArtifacts(claude);
    expect(r.found).toBe(true);
    expect(r.hits).toContain('claude-css-class');
  });

  it('scanArtifacts catches ChatGPT data-start residue', () => {
    const gpt =
      '<p data-end="918" data-start="590">x</p><ul class="ul1"><li class="li1">y</li></ul>';
    const r = scanArtifacts(gpt);
    expect(r.found).toBe(true);
    expect(r.hits).toContain('chatgpt-data-attr');
    expect(r.hits).toContain('chat-list-class');
  });

  it('scanArtifacts clean body returns false', () => {
    const clean =
      '<p>Solid Silky Minky Smooth is soft.</p><ul><li>Contents: 100% Polyester</li></ul>';
    expect(scanArtifacts(clean).found).toBe(false);
  });

  it('extractSpecLines pulls key:value from li and text', () => {
    const html =
      '<ul><li>Contents: 100 % Polyester</li><li>Width: 58"/60"</li>' +
      '<li>Care: Machine Wash Cold</li></ul>';
    const lines = extractSpecLines(html);
    const byLabel = Object.fromEntries(lines.map((l) => [l.label.toLowerCase(), l.value]));
    expect(byLabel['contents']).toBe('100 % Polyester');
    expect(byLabel['width']).toBe('58"/60"');
    expect(byLabel['care']).toBe('Machine Wash Cold');
  });

  it('em dash detection only flags U+2014', () => {
    expect(findEmDashes('a — b')).toBe(true);
    expect(findEmDashes('a - b')).toBe(false);
    expect(findEmDashes('extra-wide')).toBe(false);
    expect(stripEmDashes('a — b')).toBe('a - b');
  });

  it('countH1 and headingsWithEmoji', () => {
    expect(countH1('<h1>a</h1><h2>b</h2><h1>c</h1>')).toBe(2);
    expect(headingsWithEmoji('<h2>Specs 🔥</h2><h2>FAQ</h2>')).toEqual(['Specs 🔥']);
  });
});
