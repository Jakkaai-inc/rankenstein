// Brand profile fixture — EZ Fabric / Touch Textiles.
//
// In production this is read from the DB (CONFIRMED brand profile only). Here it
// is a confirmed fixture so the engine runs offline. `confirmed: true` is what
// lets the ground layer proceed; flip it to false to exercise the HARD STOP
// (A6 / brand-guidelines gate: generation blocked pre-confirmation).

import type { BrandProfile } from './types';

export const EZ_FABRIC_BRAND: BrandProfile = {
  name: 'EZ Fabric',
  confirmed: true,
  vendorName: 'Touch Textiles by EZ Fabric',
  primaryDomain: 'ezfabricinc.com',
  trademarks: [
    // "Cuddle" is a registered Shannon Fabrics mark for minky-type fabric.
    // Lowercase descriptive use ("cuddle-soft") is tolerated but flagged; using
    // it as a product type ("Cuddle fabric") is a BAD trademark-as-generic flag.
    { mark: 'Cuddle', owner: 'Shannon Fabrics', descriptiveUseTolerated: true },
    { mark: 'Minky', owner: 'genericized (originally Minkee)', descriptiveUseTolerated: true },
  ],
  // Vague AEO-killers + hard-sell words the brand voice forbids. Kept lowercase;
  // gate matching is case-insensitive and word-boundaried.
  bannedWords: [
    'best-in-class',
    'world-class',
    'cutting-edge',
    'revolutionary',
    'game-changer',
    'game-changing',
    'unparalleled',
    'premium',
    'luxurious',
    'ultimate',
    'amazing',
    'incredible',
    'best ever',
  ],
  seedTerms: ['minky fabric', 'silky minky', 'solid minky', 'minky by the yard'],
  voiceNote:
    'One honest peer among makers. Specificity persuades; never hard-sell. ' +
    'Educate (what it is, who it is for, how it differs) before asking for the sale.',
};

/** An unconfirmed clone, for testing the HARD STOP path. */
export const EZ_FABRIC_BRAND_UNCONFIRMED: BrandProfile = {
  ...EZ_FABRIC_BRAND,
  confirmed: false,
};

/**
 * Regulated-claim patterns (guardrails layer). Generic across brands; for a
 * fabric store the live risks are flammability/safety and unverifiable
 * eco/health claims.
 */
export const REGULATED_CLAIM_PATTERNS: { id: string; rx: RegExp; note: string }[] = [
  { id: 'flame', rx: /\b(?:flame[- ]?retardant|fire[- ]?proof|fire[- ]?resistant|non[- ]?flammable)\b/i, note: 'Flammability claim — needs a cited standard (e.g. CPSC 16 CFR 1610).' },
  { id: 'hypoallergenic', rx: /\bhypoallergenic\b/i, note: 'Hypoallergenic is a regulated/contestable claim — needs substantiation.' },
  { id: 'organic-cert', rx: /\b(?:GOTS|OEKO-?TEX|organic certified|certified organic)\b/i, note: 'Certification claim — only assert with a real certificate number in source.' },
  { id: 'health', rx: /\b(?:antibacterial|antimicrobial|medical[- ]?grade|FDA[- ]?approved)\b/i, note: 'Health/efficacy claim — not assertable without substantiation.' },
  { id: 'eco', rx: /\b(?:eco[- ]?friendly|sustainable|biodegradable|non[- ]?toxic)\b/i, note: 'Eco claim — vague/regulated (FTC Green Guides); needs proof or omit.' },
];
