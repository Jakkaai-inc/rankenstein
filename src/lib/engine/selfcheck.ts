// Demo / dry-run driver for the Lane C engine. No DB, no network.
//
//   npx tsx src/lib/engine/selfcheck.ts [snapshotPath]
//
// Runs the product-rewrite workflow on the local EZ Fabric snapshot and prints a
// demo narrative:
//   1. grounded run on the solid minky product  -> passes the verifier
//   2. naive (ungrounded) rewriter on the same  -> verifier CATCHES it
//   3. artifact product (Spotted Dove)          -> body demoted, self-flags
// Writes preview HTML for each to /tmp so it can be screenshotted/recorded.

import { writeFileSync } from 'node:fs';
import { loadSnapshot, findRaw, normalizeProduct } from './snapshot';
import { buildCatalogIndex } from './catalog';
import { runProductRewrite, runArticle, type EngineRunResult } from './pipeline';
import { offlineMinkyDeps, DEFAULT_RUN_CONFIG, offlineArticleDeps, DEFAULT_ARTICLE_RUN_CONFIG } from './offline';
import { renderPreview } from './preview';
import { EZ_FABRIC_BRAND } from './brand';
import { ARTICLE_TOPIC, ARTICLE_SOURCES } from './fixtures/minky-article';

const SNAPSHOT = process.argv[2] ?? '/Users/gevbalyan/Claude/ez-fabric-public-snapshot.json';
const SOLID_MINKY_ID = 9345778286829;
const SPOTTED_DOVE_ID = 9370119438573;

function hr(title: string) {
  console.log('\n' + '='.repeat(72) + '\n' + title + '\n' + '='.repeat(72));
}

function printRun(run: EngineRunResult) {
  const r = run.result;
  console.log(`  status            : ${r.status}`);
  console.log(`  primary keyword   : ${r.primaryKeyword || '(none)'} [${r.brief.keywordDataSource}]`);
  console.log(`  verifier verdict  : ${r.verdict.verdict} (${r.verdict.isSelfCheck ? 'self-check' : 'independent'})`);
  if (run.selection) console.log(`  history decision  : ${run.selection.historyDecision}`);
  console.log(`  body word count   : ${r.brief.wordCount} (target up to ${r.brief.wordTarget})`);
  console.log(`  meta title (${r.metaTitle.length}c)  : ${r.metaTitle}`);
  if (run.variantMap.length) console.log(`  variant map       : ${run.variantMap.map((v) => `${v.keyword}->${v.variantValue}`).join(', ')}`);
  if (run.selection?.exclusions.length) console.log(`  exclusions        : ${run.selection.exclusions.map((e) => e.keyword).join(', ')}`);
  if (run.gaps.length) console.log(`  gaps flagged      : ${run.gaps.length} (${run.gaps.map((g) => g.split(':')[0]).join(', ')})`);
  console.log(`  guardrail flags   : ${run.guardrailFlags.map((f) => `${f.severity}:${f.type}`).join(', ') || 'none'}`);
  if (r.verdict.failures.length) console.log(`  verifier failures : ${r.verdict.failures.join(' | ')}`);
  console.log(`  pipeline log      :`);
  for (const s of run.log) console.log(`     ${s.ok ? 'OK ' : 'XX '} ${s.layer.padEnd(14)} ${s.note}`);
}

async function main() {
  const snap = loadSnapshot(SNAPSHOT);
  const index = buildCatalogIndex(snap.products.map(normalizeProduct));
  const solid = normalizeProduct(findRaw(snap, SOLID_MINKY_ID)!);
  const dove = normalizeProduct(findRaw(snap, SPOTTED_DOVE_ID)!);

  hr('1) GROUNDED RUN  -  Solid Silky Minky Smooth (verifier should PASS)');
  const grounded = await runProductRewrite({
    product: solid, brand: EZ_FABRIC_BRAND, catalogIndex: index,
    runConfig: DEFAULT_RUN_CONFIG, deps: offlineMinkyDeps(),
  });
  printRun(grounded);
  writeFileSync('/tmp/rankenstein-preview-grounded.html', renderPreview(grounded, { originalBodyHtml: solid.bodyHtml, productGid: solid.id, storeDomain: 'ezfabricinc.com' }));
  console.log('  preview written   : /tmp/rankenstein-preview-grounded.html');

  hr('2) NAIVE RUN  -  same product, careless rewriter (verifier should CATCH it)');
  const naive = await runProductRewrite({
    product: solid, brand: EZ_FABRIC_BRAND, catalogIndex: index,
    runConfig: DEFAULT_RUN_CONFIG, deps: offlineMinkyDeps({ naive: true }),
  });
  printRun(naive);
  writeFileSync('/tmp/rankenstein-preview-naive.html', renderPreview(naive, { originalBodyHtml: solid.bodyHtml, productGid: solid.id, storeDomain: 'ezfabricinc.com' }));
  console.log('  preview written   : /tmp/rankenstein-preview-naive.html');
  console.log('\n  >>> The verifier traced every claim to the FactsTable and rejected the');
  console.log('  >>> fabricated ones (GSM, certification, review count). Nothing ships.');

  hr('3) ARTIFACT PRODUCT  -  Spotted Dove (pasted AI-chat body -> demoted to T3)');
  const artifact = await runProductRewrite({
    product: dove, brand: EZ_FABRIC_BRAND, catalogIndex: index,
    runConfig: DEFAULT_RUN_CONFIG, deps: offlineMinkyDeps(),
  });
  printRun(artifact);
  writeFileSync('/tmp/rankenstein-preview-artifact.html', renderPreview(artifact, { originalBodyHtml: dove.bodyHtml, productGid: dove.id, storeDomain: 'ezfabricinc.com' }));
  console.log('  preview written   : /tmp/rankenstein-preview-artifact.html');

  hr('4) ARTICLE RUN  -  "how to choose minky for baby blankets" (verifier should PASS)');
  const article = await runArticle({
    topic: ARTICLE_TOPIC, brand: EZ_FABRIC_BRAND, catalogIndex: index,
    runConfig: DEFAULT_ARTICLE_RUN_CONFIG, deps: offlineArticleDeps(), sources: ARTICLE_SOURCES,
  });
  printRun(article);
  writeFileSync('/tmp/rankenstein-preview-article.html', renderPreview(article, { originalBodyHtml: '', storeDomain: 'ezfabricinc.com' }));
  console.log('  preview written   : /tmp/rankenstein-preview-article.html');

  hr('5) ARTICLE NAIVE  -  uncited statistic (verifier should CATCH it)');
  const articleNaive = await runArticle({
    topic: ARTICLE_TOPIC, brand: EZ_FABRIC_BRAND, catalogIndex: index,
    runConfig: DEFAULT_ARTICLE_RUN_CONFIG, deps: offlineArticleDeps({ naive: true }), sources: ARTICLE_SOURCES,
  });
  printRun(articleNaive);
  console.log('\n  >>> The article verifier rejected the uncited "73%" statistic. Nothing ships.');

  hr('SUMMARY');
  console.log(`  product grounded : ${grounded.result.status}  (verifier ${grounded.result.verdict.verdict})`);
  console.log(`  product naive    : ${naive.result.status}  (verifier ${naive.result.verdict.verdict})  <- caught`);
  console.log(`  product artifact : ${artifact.result.status}  (${artifact.haltReason ? 'hard stop: ' + artifact.haltReason.slice(0, 50) : ''})`);
  console.log(`  article grounded : ${article.result.status}  (verifier ${article.result.verdict.verdict})`);
  console.log(`  article naive    : ${articleNaive.result.status}  (verifier ${articleNaive.result.verdict.verdict})  <- caught`);
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
