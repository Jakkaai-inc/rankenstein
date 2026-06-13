import { test } from 'node:test';
import assert from 'node:assert/strict';
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
} from '../html.ts';

test('stripTags + decodeEntities flatten merchant HTML', () => {
  const html = '<p>Width: 58"/60"<br>100&nbsp;% Polyester</p>';
  assert.equal(stripTags(html), 'Width: 58"/60" 100 % Polyester');
});

test('decodeEntities handles named, decimal, hex', () => {
  assert.equal(decodeEntities('a&amp;b'), 'a&b');
  assert.equal(decodeEntities('&#65;&#x42;'), 'AB');
  assert.equal(decodeEntities('3&nbsp;mm'), '3 mm');
});

test('wordCount counts visible words only', () => {
  assert.equal(wordCount('<p>one two <b>three</b></p>'), 3);
  assert.equal(wordCount('<style>.x{}</style><p>hi there</p>'), 2);
});

test('scanArtifacts catches Claude paste residue', () => {
  const claude = '<p class="font-claude-response-body break-words whitespace-normal leading-[1.7]">x</p>';
  const r = scanArtifacts(claude);
  assert.equal(r.found, true);
  assert.ok(r.hits.includes('claude-css-class'));
});

test('scanArtifacts catches ChatGPT data-start residue', () => {
  const gpt = '<p data-end="918" data-start="590">x</p><ul class="ul1"><li class="li1">y</li></ul>';
  const r = scanArtifacts(gpt);
  assert.equal(r.found, true);
  assert.ok(r.hits.includes('chatgpt-data-attr'));
  assert.ok(r.hits.includes('chat-list-class'));
});

test('scanArtifacts clean body returns false', () => {
  const clean = '<p>Solid Silky Minky Smooth is soft.</p><ul><li>Contents: 100% Polyester</li></ul>';
  assert.equal(scanArtifacts(clean).found, false);
});

test('extractSpecLines pulls key:value from li and text', () => {
  const html =
    '<ul><li>Contents: 100 % Polyester</li><li>Width: 58"/60"</li>' +
    '<li>Care: Machine Wash Cold</li></ul>';
  const lines = extractSpecLines(html);
  const byLabel = Object.fromEntries(lines.map((l) => [l.label.toLowerCase(), l.value]));
  assert.equal(byLabel['contents'], '100 % Polyester');
  assert.equal(byLabel['width'], '58"/60"');
  assert.equal(byLabel['care'], 'Machine Wash Cold');
});

test('em dash detection only flags U+2014', () => {
  assert.equal(findEmDashes('a — b'), true);
  assert.equal(findEmDashes('a - b'), false);
  assert.equal(findEmDashes('extra-wide'), false);
  assert.equal(stripEmDashes('a — b'), 'a - b');
});

test('countH1 and headingsWithEmoji', () => {
  assert.equal(countH1('<h1>a</h1><h2>b</h2><h1>c</h1>'), 2);
  assert.deepEqual(headingsWithEmoji('<h2>Specs 🔥</h2><h2>FAQ</h2>'), ['Specs 🔥']);
});
