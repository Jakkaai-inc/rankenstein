// Preview renderer — turns an EngineRunResult into a standalone HTML page that
// mirrors inputs/reference-output-minky-preview.html (keyword map, before/after,
// meta + JSON-LD, guardrail flags). Pure string building, no DOM.
//
// NOTE: preview chrome is in scope for the em-dash rule, so this template uses
// hyphens only. Lane A/D can reuse renderPreview() to render in the app.

import type { EngineRunResult } from './pipeline';
import type { NormalizedProduct, SelectedKeyword } from './types';
import { escapeHtml } from './html';

const STYLE = `
:root{--ink:#1a1a1a;--mut:#6b6b6b;--line:#e6e3dd;--bg:#faf9f6;--card:#fff;
--accent:#b5651d;--good:#2e7d32;--warn:#b26a00;--bad:#b3261e;--chip:#f1ede5;}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:32px 22px 80px}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:19px;margin:34px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--line)}
h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);margin:20px 0 8px}
.sub{color:var(--mut);margin:0 0 8px}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}
.chip{background:var(--chip);border:1px solid var(--line);border-radius:999px;padding:4px 11px;font-size:13px;color:#4a4a4a}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:760px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}
.card.before{border-top:4px solid #c9c4ba}.card.after{border-top:4px solid var(--accent)}
.tag{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);margin-bottom:8px}
.after .tag{color:var(--accent)}
table{width:100%;border-collapse:collapse;font-size:14px;margin:6px 0 0;background:var(--card)}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:var(--mut)}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.kd{display:inline-block;min-width:26px;text-align:center;border-radius:5px;padding:1px 6px;font-size:12px;font-weight:700;background:#e6f4e6;color:var(--good)}
.pill{font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;text-transform:uppercase;letter-spacing:.03em}
.pri{background:var(--accent);color:#fff}.sec{background:#ede7dc;color:#6b5836}.var{background:#e9eef5;color:#33506e}.faq{background:#ede7f5;color:#553b6e}
.flag{border-left:4px solid;padding:10px 14px;border-radius:0 8px 8px 0;margin:10px 0;background:var(--card);font-size:14px}
.flag.warn{border-color:var(--warn)}.flag.bad{border-color:var(--bad)}.flag.good{border-color:var(--good)}
.flag b{display:block;margin-bottom:2px}
.small{font-size:13px;color:var(--mut)}
pre{background:#1f1d1a;color:#eae3d6;border-radius:10px;padding:16px;overflow:auto;font-size:12.5px;line-height:1.5}
.status{font-weight:700}.status.ok{color:var(--good)}.status.flag{color:var(--bad)}
`;

function priceRange(p: NormalizedProduct): string {
  const prices = p.variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
  if (!prices.length) return 'no prices';
  return `$${Math.min(...prices).toFixed(2)} - $${Math.max(...prices).toFixed(2)}`;
}

function rolePill(role: SelectedKeyword['role']): string {
  const cls = role === 'primary' ? 'pri' : role === 'faq' ? 'faq' : 'sec';
  return `<span class="pill ${cls}">${role}</span>`;
}

function kwRows(keys: SelectedKeyword[]): string {
  return keys
    .map(
      (k) =>
        `<tr><td>${escapeHtml(k.candidate.keyword)}</td>` +
        `<td class="num">${k.candidate.volume ?? 'n/a'}</td>` +
        `<td class="num"><span class="kd">${k.candidate.kd ?? '?'}</span></td>` +
        `<td>${escapeHtml(k.candidate.intent)}</td>` +
        `<td>${rolePill(k.role)}</td>` +
        `<td>${k.serp ? escapeHtml(k.serp.winnable) : 'n/a'}</td></tr>`,
    )
    .join('');
}

function flagClass(sev: string): string {
  return sev === 'BAD' ? 'bad' : sev === 'GOOD' ? 'good' : 'warn';
}

export function renderPreview(
  run: EngineRunResult,
  opts: { originalBodyHtml: string; productGid?: string | number; storeDomain?: string },
): string {
  const r = run.result;
  const p = run.ground.product;
  const sel = run.selection;
  const statusOk = r.status === 'pending_review';

  const keywordTable = sel
    ? `<table><thead><tr><th>Keyword</th><th class="num">Vol/mo</th><th class="num">KD</th><th>Intent</th><th>Role</th><th>Winnable</th></tr></thead>` +
      `<tbody>${kwRows([sel.primary, ...sel.secondaries])}</tbody></table>`
    : '<p class="small">No keyword selection (run self-flagged before select).</p>';

  const variantTable =
    sel && sel.variantMap.length
      ? `<h3>Variant mapping (color terms -> real shades)</h3><table><thead><tr><th>Keyword</th><th class="num">Vol</th><th class="num">KD</th><th>Maps to</th></tr></thead><tbody>` +
        sel.variantMap
          .map((v) => `<tr><td>${escapeHtml(v.keyword)}</td><td class="num">${v.volume ?? 'n/a'}</td><td class="num"><span class="kd">${v.kd ?? '?'}</span></td><td><span class="pill var">${escapeHtml(v.variantValue)}</span></td></tr>`)
          .join('') +
        '</tbody></table>'
      : '';

  const exclusions =
    sel && sel.exclusions.length
      ? `<h3>Excluded by design (cannibalization control)</h3><p class="small">` +
        sel.exclusions.map((e) => `<b>${escapeHtml(e.keyword)}</b> -> ${escapeHtml(e.routedTo)}`).join(' &middot; ') +
        '</p>'
      : '';

  const flags = run.guardrailFlags
    .map((f) => `<div class="flag ${flagClass(f.severity)}"><b>${escapeHtml(f.type)} (${escapeHtml(f.severity)})</b>${escapeHtml(f.note)}</div>`)
    .join('');

  const jsonldPre = escapeHtml(JSON.stringify(r.jsonld, null, 2));

  const afterCard = r.html
    ? `<div class="card after"><span class="tag">After (AEO rewrite, grounded)</span>${r.html}<p class="small"><b>Every claim above traces to a T1/T2 source fact.</b> Nothing invented.</p></div>`
    : `<div class="card after"><span class="tag">After</span><p class="small">No rewrite produced - piece self-flagged: ${escapeHtml(run.haltReason ?? 'see flags')}.</p></div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rankenstein Preview - ${escapeHtml(p.title)}</title><style>${STYLE}</style></head>
<body><div class="wrap">
<div style="font-size:26px;font-weight:700;margin:0 0 4px">Product Rewrite Preview</div>
<p class="sub">${escapeHtml(p.title)} &middot; ${escapeHtml(p.vendor)}</p>
<div class="meta">
<span class="chip">Store: ${escapeHtml(opts.storeDomain ?? run.ground.store.primaryDomain ?? '')}</span>
<span class="chip">GID: ${escapeHtml(String(opts.productGid ?? p.id))}</span>
<span class="chip">${p.variants.length} variants</span>
<span class="chip">${priceRange(p)}</span>
<span class="chip">Status: <span class="status ${statusOk ? 'ok' : 'flag'}">${escapeHtml(r.status)}</span></span>
<span class="chip">Verifier: ${escapeHtml(r.verdict.verdict)} (${r.verdict.isSelfCheck ? 'self-check' : 'independent'})</span>
</div>

<h2>1. Keyword map (research-driven, SERP-ownership winnability)</h2>
${keywordTable}
${variantTable}
${exclusions}

<h2>2. Before -&gt; After</h2>
<div class="grid">
<div class="card before"><span class="tag">Before (live)</span>${opts.originalBodyHtml || '<p class="small">(empty)</p>'}</div>
${afterCard}
</div>

<h2>3. Meta + structured data</h2>
<table>
<tr><td style="width:34%;font-weight:600">Title (${r.metaTitle.length} chars)</td><td>${escapeHtml(r.metaTitle)}</td></tr>
<tr><td style="font-weight:600">Meta description (${r.metaDescription.length} chars)</td><td>${escapeHtml(r.metaDescription)}</td></tr>
<tr><td style="font-weight:600">Slug</td><td>${escapeHtml(r.slug)}</td></tr>
</table>
<h3>JSON-LD</h3>
<pre>${jsonldPre}</pre>

<h2>4. Guardrail flags + gaps</h2>
${flags || '<p class="small">No flags.</p>'}

<p class="small" style="margin-top:30px">Generated by the Rankenstein engine (Lane C) &middot; brief word count ${r.brief.wordCount} (target up to ${r.brief.wordTarget}) &middot; history: ${escapeHtml(r.brief.historyDecision)} &middot; preview only, nothing written to Shopify.</p>
</div></body></html>`;
}
