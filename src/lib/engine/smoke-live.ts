// LIVE smoke test for the Anthropic-backed engine providers. Makes REAL API
// calls (costs tokens). Requires ANTHROPIC_API_KEY in the env.
//
//   ANTHROPIC_API_KEY=sk-ant-... npx tsx src/lib/engine/smoke-live.ts [snapshotPath]
//
// Runs the full product-rewrite workflow on the solid-minky product with the
// LIVE rewriter + independent verifier (deterministic backstop merged in) and
// prints the result. Writes a preview to /tmp.

import { writeFileSync } from 'node:fs';
import { loadSnapshot, findRaw, normalizeProduct } from './snapshot';
import { buildCatalogIndex } from './catalog';
import { runProductRewrite } from './pipeline';
import { liveDeps } from './providers/live';
import { DEFAULT_RUN_CONFIG } from './offline';
import { renderPreview } from './preview';
import { EZ_FABRIC_BRAND } from './brand';
import { stripTags } from './html';

const SNAPSHOT = process.argv[2] ?? '/Users/gevbalyan/Claude/ez-fabric-public-snapshot.json';
const SOLID_MINKY_ID = 9345778286829;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Run: ANTHROPIC_API_KEY=sk-ant-... npx tsx src/lib/engine/smoke-live.ts');
    process.exit(2);
  }

  const snap = loadSnapshot(SNAPSHOT);
  const index = buildCatalogIndex(snap.products.map(normalizeProduct));
  const product = normalizeProduct(findRaw(snap, SOLID_MINKY_ID)!);

  console.log('LIVE smoke: running product-rewrite workflow with Anthropic providers...');
  const t0 = Date.now();
  const run = await runProductRewrite({
    product,
    brand: EZ_FABRIC_BRAND,
    catalogIndex: index,
    runConfig: DEFAULT_RUN_CONFIG,
    deps: liveDeps(),
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const r = run.result;
  console.log('\n' + '='.repeat(70));
  console.log(`LIVE RESULT  (${secs}s)`);
  console.log('='.repeat(70));
  console.log(`status            : ${r.status}`);
  console.log(`primary keyword   : ${r.primaryKeyword} [${r.brief.keywordDataSource}]`);
  console.log(`verifier verdict  : ${r.verdict.verdict} (${r.verdict.isSelfCheck ? 'self-check' : 'independent'})`);
  console.log(`body word count   : ${r.brief.wordCount}`);
  console.log(`meta title (${r.metaTitle.length}c)  : ${r.metaTitle}`);
  console.log(`meta desc (${r.metaDescription.length}c) : ${r.metaDescription}`);
  console.log(`slug              : ${r.slug}`);
  console.log(`variant map       : ${run.variantMap.map((v) => `${v.keyword}->${v.variantValue}`).join(', ') || '(none)'}`);
  console.log(`guardrail flags   : ${run.guardrailFlags.map((f) => `${f.severity}:${f.type}`).join(', ') || 'none'}`);
  if (r.verdict.failures.length) console.log(`verifier failures : ${r.verdict.failures.join(' | ')}`);
  console.log(`per-gate          : ${Object.entries(r.verdict.perGate).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log('\npipeline log:');
  for (const s of run.log) console.log(`  ${s.ok ? 'OK ' : 'XX '} ${s.layer.padEnd(14)} ${s.note}`);

  console.log('\n--- body (text preview) ---');
  console.log(stripTags(r.html).slice(0, 600) + '...');

  writeFileSync('/tmp/rankenstein-smoke-live.html', renderPreview(run, { originalBodyHtml: product.bodyHtml, productGid: product.id, storeDomain: 'ezfabricinc.com' }));
  console.log('\npreview written: /tmp/rankenstein-smoke-live.html');

  // exit non-zero if the live run did not produce a shippable, grounded piece
  if (r.status !== 'pending_review' || r.verdict.verdict !== 'pass') {
    console.error(`\nSMOKE WARNING: live run did not pass (status=${r.status}, verdict=${r.verdict.verdict}). See failures above.`);
    process.exit(1);
  }
  console.log('\nSMOKE OK: live run produced a grounded, verifier-passed piece.');
}

main().catch((e) => {
  console.error('SMOKE ERROR:', e?.message ?? e);
  process.exit(1);
});
