// HTML utilities — zero-dependency, no DOM parser.
//
// We only ever read merchant HTML and write our own, so regex-level handling is
// sufficient and keeps the engine dependency-free (Lane A: no parser dep needed).

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  middot: '·',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  reg: '®',
  trade: '™',
  copy: '©',
  deg: '°',
  rarr: '→',
};

/** Decode the handful of HTML entities that appear in merchant copy. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : m,
    );
}

/** Strip all tags and collapse whitespace; entities decoded to plain text. */
export function stripTags(html: string): string {
  const noTags = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return collapseWs(decodeEntities(noTags));
}

export function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Word count on visible text (used for computed body word target). */
export function wordCount(html: string): number {
  const text = stripTags(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Detect pasted AI-chat artifacts in merchant HTML. Any hit demotes the WHOLE
 * body_html to T3 (per LAYER ground). Broad on purpose — covers Claude and
 * ChatGPT paste residue plus generic chat-assistant phrasing.
 */
const ARTIFACT_PATTERNS: { id: string; rx: RegExp }[] = [
  { id: 'claude-css-class', rx: /class="[^"]*font-claude[^"]*"/i },
  { id: 'tailwind-chat-class', rx: /class="[^"]*(?:whitespace-normal|break-words|leading-\[)[^"]*"/i },
  { id: 'chatgpt-data-attr', rx: /data-(?:start|end)="\d+"/i },
  { id: 'chat-list-class', rx: /class="(?:ul1|li1|s1|p1)"/i },
  { id: 'assistant-preamble', rx: /\b(?:as an ai|here(?:'|’)s (?:a|the|your)|certainly!|sure!|i(?:'|’)d be happy to|i cannot|i can(?:'|’)t help)\b/i },
];

export type ArtifactScan = {
  found: boolean;
  hits: string[];
};

export function scanArtifacts(html: string): ArtifactScan {
  const hits: string[] = [];
  for (const p of ARTIFACT_PATTERNS) {
    if (p.rx.test(html)) hits.push(p.id);
  }
  return { found: hits.length > 0, hits };
}

/**
 * Extract spec-formatted "key: value" lines from a body (T2 candidates).
 * Looks inside <li> items and standalone "Label: value" lines. Returns the
 * label/value verbatim (trimmed, entity-decoded).
 */
export type SpecLine = { label: string; value: string };

export function extractSpecLines(html: string): SpecLine[] {
  const out: SpecLine[] = [];
  const seenLabels = new Set<string>();
  // candidate text blocks: each <li>, then leaf text segments split on <br>/<p>.
  const blocks: string[] = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html))) blocks.push(m[1]);
  // top-level text split on <br>/paragraph boundaries, but skip any segment that
  // still contains list markup (those are merged multi-key blocks → not a spec).
  for (const seg of html.split(/<br\s*\/?>|<\/p>|<\/h[1-6]>/i)) {
    if (/<\/?(?:li|ul|ol)\b/i.test(seg)) continue;
    blocks.push(seg);
  }

  // second embedded "Label:" key ⇒ the block is a merged run, not one spec line.
  const embeddedSecondKey = /\b[A-Za-z][A-Za-z /&]{1,28}?:\s/;

  for (const block of blocks) {
    const text = collapseWs(decodeEntities(block.replace(/<[^>]+>/g, ' ')));
    const km = text.match(/^([A-Za-z][A-Za-z /&]{1,28}?)\s*[:–-]\s*(.+)$/);
    if (!km) continue;
    const label = collapseWs(km[1]);
    const value = collapseWs(km[2]);
    if (!label || !value || value.length > 200) continue;
    if (embeddedSecondKey.test(value)) continue;
    const labelKey = label.toLowerCase();
    if (seenLabels.has(labelKey)) continue; // first occurrence wins
    seenLabels.add(labelKey);
    out.push({ label, value });
  }
  return out;
}

/** Escape text for safe insertion into HTML body/attributes. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Em dash detection. The ONLY dash we forbid is U+2014; hyphen-minus is fine. */
export function findEmDashes(s: string): boolean {
  return /—/.test(s);
}

/** Replace em dashes with a hyphen-with-spaces (gates repair round). */
export function stripEmDashes(s: string): string {
  return s.replace(/\s*—\s*/g, ' - ');
}

/** Count <h1> tags. */
export function countH1(html: string): number {
  const m = html.match(/<h1[\s>]/gi);
  return m ? m.length : 0;
}

/** Emoji detection (used for emoji-in-headings gate). */
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

export function headingsWithEmoji(html: string): string[] {
  const out: string[] = [];
  const re = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = stripTags(m[1]);
    if (EMOJI_RE.test(text)) out.push(text);
  }
  return out;
}
