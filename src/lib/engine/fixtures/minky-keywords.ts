// Offline keyword fixture for the Solid Silky Minky Smooth product.
//
// Mirrors the research/SERP picture in inputs/reference-output-minky-preview.html
// (pulled live from Ahrefs, US). Used by the fixture ResearchProvider and
// SerpProvider so the engine runs end-to-end with no network. Numbers are the
// reference's; a couple of rows are intentionally source:'web-estimate' with
// null volume/kd to exercise the "never fabricate numbers" path.

import type { KeywordCandidate, SerpOwnership } from '../types';

const P = 'minky fabric'; // shared parent topic

export const MINKY_RESEARCH: KeywordCandidate[] = [
  // cluster
  { keyword: 'minky fabric by the yard', volume: 1300, kd: 1, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'minky fabric', volume: 5900, kd: 1, intent: 'commercial', parentTopic: P, source: 'provider-verified' },
  { keyword: 'what is minky fabric', volume: 1200, kd: 1, intent: 'informational', parentTopic: P, source: 'provider-verified' },
  { keyword: 'solid minky fabric', volume: 20, kd: 1, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'smooth minky fabric', volume: 50, kd: 2, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'minky cuddle fabric', volume: 70, kd: 1, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'extra wide minky fabric', volume: 80, kd: 0, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'minky fabric for plushies', volume: 80, kd: 0, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'soft minky fabric', volume: 70, kd: 2, intent: 'commercial', parentTopic: P, source: 'provider-verified' },
  { keyword: 'plush minky fabric', volume: 60, kd: 3, intent: 'commercial', parentTopic: P, source: 'provider-verified' },
  { keyword: 'buy minky fabric', volume: 80, kd: 0, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'minky fabric for sale', volume: 60, kd: 1, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'can you iron minky fabric', volume: 60, kd: 1, intent: 'informational', parentTopic: P, source: 'provider-verified' },
  // variant color terms (map to real shades)
  { keyword: 'black minky fabric', volume: 150, kd: 0, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'white minky fabric', volume: 80, kd: 0, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'brown minky fabric', volume: 90, kd: 0, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'gray minky fabric', volume: 90, kd: 0, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  { keyword: 'silver minky fabric', volume: 40, kd: 0, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
  // a web-estimate row (no provider numbers) — must never be fabricated into a number
  { keyword: 'minky fabric for baby blankets', volume: null, kd: null, intent: 'commercial', parentTopic: P, source: 'web-estimate' },
  // sibling-SKU terms (belong to other listings) — filter must route these away
  { keyword: 'printed minky fabric by the yard', volume: 70, kd: 1, intent: 'transactional', parentTopic: 'printed minky', source: 'provider-verified' },
  { keyword: 'minky dot fabric', volume: 400, kd: 2, intent: 'commercial', parentTopic: 'minky dot', source: 'provider-verified' },
  { keyword: 'dinosaur minky fabric', volume: 60, kd: 1, intent: 'transactional', parentTopic: 'dinosaur minky', source: 'provider-verified' },
];

/** Per-keyword SERP ownership facts (reference: low-DR niche, this site can win). */
export const MINKY_SERP: Record<string, Partial<SerpOwnership>> = {
  'minky fabric by the yard': { avgDR: 28, owners: ['fabric.com', 'shannonfabrics.com', 'etsy.com'], winnable: 'yes', topUrls: ['https://www.fabric.com/...', 'https://shannonfabrics.com/...'] },
  'minky fabric': { avgDR: 52, owners: ['shannonfabrics.com', 'joann.com', 'amazon.com'], winnable: 'stretch' },
  'solid minky fabric': { avgDR: 19, owners: ['etsy.com', 'fabric.com'], winnable: 'yes' },
  'smooth minky fabric': { avgDR: 21, owners: ['shannonfabrics.com', 'etsy.com'], winnable: 'yes' },
  'what is minky fabric': { avgDR: 24, owners: ['shannonfabrics.com', 'wikipedia.org'], winnable: 'yes' },
  'black minky fabric': { avgDR: 17, owners: ['etsy.com', 'amazon.com'], winnable: 'yes' },
};
