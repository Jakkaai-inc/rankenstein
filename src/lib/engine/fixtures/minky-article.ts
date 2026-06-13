// Offline fixture for the ARTICLE path: topic "how to choose minky fabric for
// baby blankets". Mirrors what live research/angle/outline/citation providers
// would return, so the article workflow runs end-to-end with no network.

import type { AngleSet, CitationVerdict, KeywordCandidate, Outline, SerpOwnership } from '../types';
import type { ArticleSource } from '../providers';

export const ARTICLE_TOPIC = 'how to choose minky fabric for baby blankets';

const P = 'minky fabric for blankets';

export const ARTICLE_RESEARCH: KeywordCandidate[] = [
  { keyword: 'how to choose minky fabric', volume: 480, kd: 4, intent: 'informational', parentTopic: P, source: 'provider-verified' },
  { keyword: 'minky fabric for baby blankets', volume: 720, kd: 8, intent: 'commercial', parentTopic: P, source: 'provider-verified' },
  { keyword: 'is minky fabric safe for babies', volume: 390, kd: 6, intent: 'informational', parentTopic: P, source: 'provider-verified' },
  { keyword: 'best minky fabric for blankets', volume: 260, kd: 9, intent: 'commercial', parentTopic: P, source: 'provider-verified' },
  { keyword: 'minky fabric weight for blankets', volume: 90, kd: 3, intent: 'informational', parentTopic: P, source: 'web-estimate' },
  { keyword: 'how much minky fabric for a baby blanket', volume: 170, kd: 2, intent: 'informational', parentTopic: P, source: 'provider-verified' },
  // these should be dropped by the article-mode filter
  { keyword: 'minky fabric near me', volume: 110, kd: 5, intent: 'local', parentTopic: P, source: 'provider-verified' },
  { keyword: 'joann minky fabric', volume: 300, kd: 7, intent: 'transactional', parentTopic: P, source: 'provider-verified' },
];

export const ARTICLE_SERP: Record<string, Partial<SerpOwnership>> = {
  'how to choose minky fabric': { avgDR: 31, owners: ['shannonfabrics.com', 'sewcanshe.com'], winnable: 'yes' },
  'minky fabric for baby blankets': { avgDR: 44, owners: ['joann.com', 'etsy.com'], winnable: 'stretch' },
  'is minky fabric safe for babies': { avgDR: 38, owners: ['healthline.com', 'shannonfabrics.com'], winnable: 'stretch' },
};

export const ARTICLE_ANGLE_SET: AngleSet = {
  angles: [
    { lens: 'contrarian', headline: 'Why softest is the wrong first question for baby minky', why: 'Challenges the default buying instinct.' },
    { lens: 'data-led', headline: 'Pile height and wash durability decide a baby minky blanket', why: 'Leads with measurable attributes.' },
    { lens: 'buyer-decision', headline: 'How to choose minky fabric for a baby blanket that lasts', why: 'Maps directly to the buyer decision.' },
    { lens: 'maker-pain', headline: 'Stop fighting stretchy minky: pick the right baby blanket fabric', why: 'Speaks to the sewing pain point.' },
  ],
  chosen: { lens: 'buyer-decision', headline: 'How to choose minky fabric for a baby blanket that lasts', why: 'Highest intent match and subject-line ready.' },
  why: 'Buyer-decision lens matches the high-intent informational query and reads as a subject line.',
};

export const ARTICLE_OUTLINE: Outline = {
  title: 'How to Choose Minky Fabric for a Baby Blanket That Lasts',
  slug: 'choose-minky-baby-blanket',
  metaTitle: 'How to Choose Minky Fabric for a Baby Blanket',
  metaDesc: 'A maker-friendly guide to picking minky for baby blankets: pile height, weight, safe care, and how much yardage you need for each size.',
  hook: 'Picking minky fabric for a baby blanket is less about the softest swatch and more about how it sews, washes, and holds up. This guide walks through the few attributes that actually matter for baby gear. You will leave knowing what to check before you buy a single yard.',
  sections: [
    { h2: 'Pile height and why it matters for babies', reason: 'Pile drives feel, sewing behavior, and lint, which parents care about most.', bullets: ['Smooth low pile is easier to sew and cut', 'Longer pile feels plush but sheds more', 'Match pile to the blanket use'] },
    { h2: 'Weight and warmth for a nursery', reason: 'Weight affects warmth and drape, which matters in a crib.', bullets: ['Lighter minky drapes better for swaddles', 'Heavier minky suits cooler nurseries'] },
    { h2: 'Is minky safe for babies and how to care for it', reason: 'Safety and washability are the top parent concerns and a common search.', bullets: ['Polyester pile is durable through frequent washing', 'Wash cold and skip high heat to protect the pile'] },
    { h2: 'How much minky you need by blanket size', reason: 'Yardage planning prevents costly reorders mid-project.', bullets: ['Lovey, crib, and throw sizes need different cuts', 'Buy a little extra for backing seams'] },
  ],
  faqs: [
    { q: 'Is minky fabric safe for newborns?', a: 'Minky is a polyester pile fabric commonly used for baby blankets; follow safe-sleep guidance and avoid loose blankets in the crib for newborns.' },
    { q: 'How do I wash a minky baby blanket?', a: 'Machine wash cold on a gentle cycle and air or tumble dry low; high heat can flatten the pile.' },
    { q: 'What pile height is best for a baby blanket?', a: 'A smooth, low pile is easy to sew and stays tidy through frequent washing, which suits baby blankets well.' },
  ],
};

// Sources the drafter may cite. Each carries the specific claim it supports
// (with a number, so the article verifier can trace it). One is a health claim
// and must come from a high-authority source.
export const ARTICLE_SOURCES: ArticleSource[] = [
  { url: 'https://www.shannonfabrics.com/blog/minky-pile-guide', title: 'Shannon Fabrics pile guide', topic: 'general', claim: 'Smooth minky styles use a 3 mm flat pile that is easier to sew than longer 5 mm dimple pile' },
  { url: 'https://www.consumerreports.org/textiles/fabric-weight', title: 'Consumer Reports on fabric weight', topic: 'general', claim: 'Lighter blanket fabrics around 220 to 260 gsm drape more easily for infant swaddles' },
  { url: 'https://www.healthychildren.org/safe-sleep', title: 'American Academy of Pediatrics safe sleep', topic: 'health', claim: 'Pediatric safe-sleep guidance recommends keeping loose blankets out of the crib for the first 12 months' },
];

/** All citations pass (the happy path). */
export const ARTICLE_CITATION_OK: Record<string, Partial<CitationVerdict>> = {
  'https://www.shannonfabrics.com/blog/minky-pile-guide': { loads: true, supportsClaim: true, authorityOk: true },
  'https://www.consumerreports.org/textiles/fabric-weight': { loads: true, supportsClaim: true, authorityOk: true },
  'https://www.healthychildren.org/safe-sleep': { loads: true, supportsClaim: true, authorityOk: true },
};

/** One source fails to support its claim (the blocking path). */
export const ARTICLE_CITATION_BAD: Record<string, Partial<CitationVerdict>> = {
  ...ARTICLE_CITATION_OK,
  'https://www.consumerreports.org/textiles/fabric-weight': { loads: true, supportsClaim: false, authorityOk: true },
};
