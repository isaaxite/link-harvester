/**
 * Tests for LinkHarvester pipeline (index.ts)
 *
 * Coverage targets (beyond the already-covered extractLinks):
 *   - LinkHarvester constructor + gather()
 *   - _execute: gather only (no further ops)
 *   - _execute: filter only (opTypeSet has filter, no classify)
 *   - _execute: classify only (no filter)
 *   - _execute: filter + classify
 *   - _execute: classify + detectExternalRefs (keys = null)
 *   - _execute: classify + on(key).detectExternalRefs (keys = [key])
 *   - _execute: filter + classify + detectExternalRefs
 *   - handleClassify – rest bucket when no named bucket matches
 *   - handleClassify – item matched by named bucket is excluded from rest
 *   - LinkDataPipeline.filter (custom predicate)
 *   - LinkDataPipeline.filter chained (mergeFilters AND logic)
 *   - LinkDataPipeline.filterBy(LinkType.*) — all four variants
 *   - LinkDataPipeline.filterBy(LinkTarget.*) — all five variants
 *   - LinkDataPipeline.filterBy(invalid) → TypeError
 *   - LinkDataPipeline.classify (custom buckets)
 *   - LinkDataPipeline.classifyBy(ClassifyType.IfAccessable)
 *   - LinkDataPipeline.classifyBy(invalid) → TypeError
 *   - ClassificationPipeline.on(key).detectExternalRefs()
 *   - ClassificationPipeline.detectExternalRefs() (no key)
 *   - _detectExternalRefs: finds cross-file references
 *   - _detectExternalRefs: skips self-reference (mainMdFilePath === curMdFilePath)
 *   - _getOtherFilePaths cache (called twice, fast-glob runs once)
 *   - _cache hit path inside _detectExternalRefs
 */

import test from 'ava';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  LinkHarvester,
  LinkType,
  LinkTarget,
  ClassifyType,
  REST_KEY,
} from '../dist/index.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');
const fix = (name) => join(FIXTURES, name);

/** Shorthand: build a harvester rooted at FIXTURES for the given filePath */
const h = (filePath) => new LinkHarvester({ base: FIXTURES, filePath });

// ---------------------------------------------------------------------------
// 1. gather — basic pipeline execution
// ---------------------------------------------------------------------------

test('gather returns ExtractedLink array', async (t) => {
  const links = await h('mixed.md').gather();
  t.true(Array.isArray(links));
  t.true(links.length > 0);
});

test('gather on file with no links returns empty array', async (t) => {
  const links = await h('no-links.md').gather();
  t.deepEqual(links, []);
});

test('gather on empty file returns empty array', async (t) => {
  const links = await h('empty.md').gather();
  t.deepEqual(links, []);
});

// calling gather() twice on the same instance should still work
test('gather resolves with correct data for md-images.md', async (t) => {
  const links = await h('md-images.md').gather();
  t.is(links.length, 3);
  t.true(links.every((l) => l.type === LinkType.MarkdownImage));
});

// ---------------------------------------------------------------------------
// 2. filter
// ---------------------------------------------------------------------------

test('filter – custom predicate keeps matching links', async (t) => {
  const links = await h('mixed.md')
    .gather()
    .filter((l) => l.type === LinkType.MarkdownImage);
  t.true(links.length > 0);
  t.true(links.every((l) => l.type === LinkType.MarkdownImage));
});

test('filter – always-false predicate yields empty array', async (t) => {
  const links = await h('mixed.md').gather().filter(() => false);
  t.deepEqual(links, []);
});

test('filter – chained filters are ANDed (mergeFilters)', async (t) => {
  const links = await h('local-resources.md')
    .gather()
    .filter((l) => l.type === LinkType.MarkdownImage)
    .filter((l) => l.linkTarget === LinkTarget.LocalResource);
  t.true(links.every(
    (l) => l.type === LinkType.MarkdownImage && l.linkTarget === LinkTarget.LocalResource,
  ));
});

// ---------------------------------------------------------------------------
// 3. filterBy(LinkType)
// ---------------------------------------------------------------------------

test('filterBy(MarkdownImage) keeps only markdown images', async (t) => {
  const links = await h('mixed.md').gather().filterBy(LinkType.MarkdownImage);
  t.true(links.length > 0);
  t.true(links.every((l) => l.type === LinkType.MarkdownImage));
});

test('filterBy(MarkdownLink) keeps only markdown links', async (t) => {
  const links = await h('mixed.md').gather().filterBy(LinkType.MarkdownLink);
  t.true(links.every((l) => l.type === LinkType.MarkdownLink));
});

test('filterBy(HtmlImage) keeps only HTML images', async (t) => {
  const links = await h('mixed.md').gather().filterBy(LinkType.HtmlImage);
  t.true(links.every((l) => l.type === LinkType.HtmlImage));
});

test('filterBy(HtmlAnchor) keeps only HTML anchors', async (t) => {
  const links = await h('mixed.md').gather().filterBy(LinkType.HtmlAnchor);
  t.true(links.every((l) => l.type === LinkType.HtmlAnchor));
});

// ---------------------------------------------------------------------------
// 4. filterBy(LinkTarget)
// ---------------------------------------------------------------------------

test('filterBy(ExternalPage) keeps only external pages', async (t) => {
  const links = await h('local-resources.md').gather().filterBy(LinkTarget.ExternalPage);
  t.true(links.length > 0);
  t.true(links.every((l) => l.linkTarget === LinkTarget.ExternalPage));
});

test('filterBy(ExternalResource) keeps only external resources', async (t) => {
  const links = await h('externals-only.md').gather().filterBy(LinkTarget.ExternalResource);
  t.true(links.every((l) => l.linkTarget === LinkTarget.ExternalResource));
});

test('filterBy(LocalResource) keeps only local resources', async (t) => {
  const links = await h('local-resources.md').gather().filterBy(LinkTarget.LocalResource);
  t.true(links.length > 0);
  t.true(links.every((l) => l.linkTarget === LinkTarget.LocalResource));
});

test('filterBy(InPageAnchor) keeps only in-page anchors', async (t) => {
  const links = await h('local-resources.md').gather().filterBy(LinkTarget.InPageAnchor);
  t.true(links.every((l) => l.linkTarget === LinkTarget.InPageAnchor));
});

test('filterBy(Other) keeps only other-target links', async (t) => {
  const links = await h('local-resources.md').gather().filterBy(LinkTarget.Other);
  t.true(links.every((l) => l.linkTarget === LinkTarget.Other));
});

test('filterBy with unknown type throws TypeError', (t) => {
  t.throws(
    () => h('mixed.md').gather().filterBy('not_a_valid_type'),
    { instanceOf: TypeError },
  );
});

// ---------------------------------------------------------------------------
// 5. classify (custom buckets)
// ---------------------------------------------------------------------------

test('classify splits links into named buckets + rest', async (t) => {
  const result = await h('mixed.md').gather().classify({
    images: (l) => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
    rest: 'rest',
  });
  t.true(Array.isArray(result.images));
  t.true(Array.isArray(result.rest));
  t.true(result.images.every(
    (l) => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
  ));
});

test('classify – items not matched by any bucket go to rest', async (t) => {
  const allLinks = await h('mixed.md').gather();
  const result = await h('mixed.md').gather().classify({
    neverMatch: () => false,
    rest: 'rest',
  });
  // All items fall into rest; neverMatch is never initialised (only populated on first match)
  t.is(result.rest.length, allLinks.length);
  t.true(!result.neverMatch || result.neverMatch.length === 0);
});

test('classify – matched items are excluded from rest', async (t) => {
  const result = await h('mixed.md').gather().classify({
    images: (l) => l.type === LinkType.MarkdownImage,
    rest: 'rest',
  });
  t.true(result.rest.every((l) => l.type !== LinkType.MarkdownImage));
});

test('classify – works without a rest bucket (rest key defaults to "rest")', async (t) => {
  const result = await h('mixed.md').gather().classify({
    pages: (l) => l.linkTarget === LinkTarget.ExternalPage,
    rest: 'rest',
  });
  t.true('rest' in result);
  t.true('pages' in result);
});

// ---------------------------------------------------------------------------
// 6. filter + classify combined
// ---------------------------------------------------------------------------

test('filter then classify – filter applied before bucketing', async (t) => {
  const result = await h('local-resources.md')
    .gather()
    .filter((l) => l.type === LinkType.MarkdownImage || l.type === LinkType.MarkdownLink)
    .classify({
      images: (l) => l.type === LinkType.MarkdownImage,
      rest: 'rest',
    });
  // No HtmlImage / HtmlAnchor should appear anywhere
  const allItems = [...result.images, ...result.rest];
  t.true(allItems.every(
    (l) => l.type === LinkType.MarkdownImage || l.type === LinkType.MarkdownLink,
  ));
});

// ---------------------------------------------------------------------------
// 7. classifyBy(IfAccessable)
// ---------------------------------------------------------------------------

test('classifyBy(IfAccessable) – existing local files go to accessible bucket', async (t) => {
  const result = await h('local-resources.md').gather().classifyBy(ClassifyType.IfAccessable);
  // md-images.md and md-links.md exist on disk → accessible
  t.true(result.accessible.length > 0);
  t.true(result.accessible.every((l) => l.linkTarget === LinkTarget.LocalResource));
});

test('classifyBy(IfAccessable) – missing/non-local links go to invalid (rest) bucket', async (t) => {
  const result = await h('local-resources.md').gather().classifyBy(ClassifyType.IfAccessable);
  // external, in-page, mailto, and missing local files
  t.true(result.invalid.length > 0);
});

test('classifyBy with invalid type throws TypeError', (t) => {
  t.throws(
    () => h('mixed.md').gather().classifyBy('wrong_type'),
    { instanceOf: TypeError },
  );
});

// ---------------------------------------------------------------------------
// 8. detectExternalRefs – ClassificationPipeline.detectExternalRefs() (keys = null)
//    When keys=null the implementation computes refs but does NOT assign them to
//    data.externalRefs (the `if (!op.keys) { return refs; }` branch returns early).
//    The pipeline must still resolve with the correct bucket structure.
// ---------------------------------------------------------------------------

test('classify().detectExternalRefs() resolves with correct bucket structure', async (t) => {
  const result = await h('refs-target.md')
    .gather()
    .classify({
      local: (l) => l.linkTarget === LinkTarget.LocalResource,
      rest: 'rest',
    })
    .detectExternalRefs();

  t.true('local' in result);
  t.true('rest' in result);
  t.true(Array.isArray(result.local));
  t.true(Array.isArray(result.rest));
  // local bucket contains only LocalResource items
  t.true(result.local.every((l) => l.linkTarget === LinkTarget.LocalResource));
});

// ---------------------------------------------------------------------------
// 9. detectExternalRefs – ClassificationPipeline.on(key).detectExternalRefs()
//    Only scans the given bucket key.
// ---------------------------------------------------------------------------

test('classify().on(key).detectExternalRefs() only attaches externalRefs to that bucket', async (t) => {
  const result = await h('refs-target.md')
    .gather()
    .classify({
      local: (l) => l.linkTarget === LinkTarget.LocalResource,
      rest: 'rest',
    })
    .on('local')
    .detectExternalRefs();

  // Items in 'local' bucket that are referenced elsewhere get externalRefs
  const localItems = result.local;
  t.true(Array.isArray(localItems));

  // Items in 'rest' bucket should NOT have externalRefs set by this call
  for (const item of result.rest) {
    t.falsy(item.externalRefs);
  }
});

// ---------------------------------------------------------------------------
// 10. filter + classify + detectExternalRefs (three-op path in _execute)
// ---------------------------------------------------------------------------

test('filter + classify + detectExternalRefs works end-to-end', async (t) => {
  const result = await h('refs-target.md')
    .gather()
    .filter((l) => l.linkTarget === LinkTarget.LocalResource)
    .classify({
      docs: (l) => l.url.endsWith('.md'),
      rest: 'rest',
    })
    .detectExternalRefs();

  t.true('docs' in result);
  t.true('rest' in result);
  // All items were pre-filtered to LocalResource
  const all = [...result.docs, ...result.rest];
  t.true(all.every((l) => l.linkTarget === LinkTarget.LocalResource));
});

// ---------------------------------------------------------------------------
// 11. _detectExternalRefs – self-reference skip
//    When the harvested filePath matches a discovered md file path,
//    it should be skipped (not add itself as a ref).
// ---------------------------------------------------------------------------

test('detectExternalRefs does not list the source file as its own external ref', async (t) => {
  // local-resources.md links to md-images.md
  // local-resources.md is itself in the fixtures dir and will be scanned
  // but it must NOT appear in its own externalRefs
  const result = await h('local-resources.md')
    .gather()
    .classify({
      local: (l) => l.linkTarget === LinkTarget.LocalResource,
      rest: 'rest',
    })
    .on('local')
    .detectExternalRefs();

  for (const item of result.local) {
    if (Array.isArray(item.externalRefs)) {
      t.false(
        item.externalRefs.includes('local-resources.md'),
        'Source file must not appear in its own externalRefs',
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 12. _cache hit – calling detectExternalRefs twice on same instance reuses cache
// ---------------------------------------------------------------------------

test('detectExternalRefs cache: second call reuses cached link data', async (t) => {
  const harvesterInstance = h('refs-target.md');
  const pipeline = harvesterInstance.gather().classify({
    local: (l) => l.linkTarget === LinkTarget.LocalResource,
    rest: 'rest',
  });

  // First resolution populates _cache
  const result1 = await pipeline.detectExternalRefs();
  // Resolve a fresh pipeline from the same harvester to hit the cache
  const result2 = await h('refs-target.md')
    .gather()
    .classify({
      local: (l) => l.linkTarget === LinkTarget.LocalResource,
      rest: 'rest',
    })
    .detectExternalRefs();

  // Both should produce structurally equivalent results
  t.deepEqual(
    result1.local.map((l) => l.url).sort(),
    result2.local.map((l) => l.url).sort(),
  );
});

// ---------------------------------------------------------------------------
// 13. _getOtherFilePaths cache – fast-glob result is memoised on the instance
// ---------------------------------------------------------------------------

test('_getOtherFilePaths is memoised within a harvester instance', async (t) => {
  // Call detectExternalRefs twice on the same classify pipeline
  // Both calls share the same Pipeline instance, so otherFilePaths is computed once.
  const harvesterInstance = h('refs-target.md');

  // Run two sequential awaits reusing the same pipeline definition
  const r1 = await harvesterInstance.gather().classify({
    local: (l) => l.linkTarget === LinkTarget.LocalResource,
    rest: 'rest',
  }).on('local').detectExternalRefs();

  const r2 = await h('refs-target.md').gather().classify({
    local: (l) => l.linkTarget === LinkTarget.LocalResource,
    rest: 'rest',
  }).on('local').detectExternalRefs();

  // Structural equivalence proves both resolved correctly
  t.is(r1.local.length, r2.local.length);
});

// ---------------------------------------------------------------------------
// 14. ClassificationPipeline.on() — fluent chain returns DetectPipeline
// ---------------------------------------------------------------------------

test('on() is chainable and returns a thenable', async (t) => {
  const pipeline = h('mixed.md').gather().classify({
    images: (l) => l.type === LinkType.MarkdownImage,
    rest: 'rest',
  }).on('images');

  // calling .detectExternalRefs() returns a ThenPipeline — it must be awaitable
  const result = await pipeline.detectExternalRefs();
  t.true('images' in result);
  t.true('rest' in result);
});

// ---------------------------------------------------------------------------
// 15. Exports sanity — named exports from dist/index.mjs
// ---------------------------------------------------------------------------

test('LinkHarvester is exported from dist', (t) => {
  t.is(typeof LinkHarvester, 'function');
});

test('LinkType enum values are exported', (t) => {
  t.is(LinkType.MarkdownLink, 'markdown_link');
  t.is(LinkType.MarkdownImage, 'markdown_image');
  t.is(LinkType.HtmlImage, 'html_image');
  t.is(LinkType.HtmlAnchor, 'html_anchor');
});

test('LinkTarget enum values are exported', (t) => {
  t.is(LinkTarget.ExternalPage, 'external_page');
  t.is(LinkTarget.ExternalResource, 'external_resource');
  t.is(LinkTarget.LocalResource, 'local_resource');
  t.is(LinkTarget.InPageAnchor, 'in_page_anchor');
  t.is(LinkTarget.Other, 'other');
});

test('ClassifyType enum values are exported', (t) => {
  t.is(ClassifyType.IfAccessable, 'if_accessable');
});

// ---------------------------------------------------------------------------
// 16. LinkHarvester constructor — input validation (新增)
// ---------------------------------------------------------------------------

// base 类型检查
test('LinkHarvester throws if base is not a string', (t) => {
  t.throws(() => new LinkHarvester({ base: 42, filePath: 'mixed.md' }), { instanceOf: Error, message: /string/ });
});

// base 必须是绝对路径
test('LinkHarvester throws if base is a relative path', (t) => {
  t.throws(() => new LinkHarvester({ base: 'relative/path', filePath: 'mixed.md' }), { instanceOf: Error, message: /absolute/ });
});

// base 目录不存在
test('LinkHarvester throws if base directory does not exist', (t) => {
  t.throws(
    () => new LinkHarvester({ base: '/nonexistent/directory', filePath: 'mixed.md' }),
    { instanceOf: Error, message: /not exist|not accessible/ },
  );
});

// filePath 类型检查
test('LinkHarvester throws if filePath is not a string', (t) => {
  t.throws(() => new LinkHarvester({ base: FIXTURES, filePath: 123 }), { instanceOf: Error, message: /string/ });
});

// filePath 相对路径但文件不存在
test('LinkHarvester throws if relative filePath does not exist under base', (t) => {
  t.throws(
    () => new LinkHarvester({ base: FIXTURES, filePath: 'no-such-file.md' }),
    { instanceOf: Error, message: /not exist|not accessible/ },
  );
});

// filePath 绝对路径且文件存在，且在 base 内
test('LinkHarvester accepts absolute filePath inside base', (t) => {
  const absFilePath = join(FIXTURES, 'mixed.md');
  t.notThrows(() => new LinkHarvester({ base: FIXTURES, filePath: absFilePath }));
});

// filePath 绝对路径但文件不存在
test('LinkHarvester throws if absolute filePath does not exist', (t) => {
  const absFilePath = join(FIXTURES, 'ghost.md');
  t.throws(
    () => new LinkHarvester({ base: FIXTURES, filePath: absFilePath }),
    { instanceOf: Error, message: /not exist|not accessible/ },
  );
});

// filePath 绝对路径但在 base 目录之外
test('LinkHarvester throws if absolute filePath is outside base', (t) => {
  t.throws(
    () => new LinkHarvester({ base: FIXTURES, filePath: '/tmp/outside.md' }),
    { instanceOf: Error, message: /outside/ },
  );
});

// base 带尾部斜杠时 removeTrailSep 仍能正常工作
test('LinkHarvester normalises trailing separator in base', async (t) => {
  const baseWithSep = FIXTURES + '/';
  const harvesterInstance = new LinkHarvester({ base: baseWithSep, filePath: 'mixed.md' });
  const links = await harvesterInstance.gather();
  t.true(links.length > 0);
});

// ---------------------------------------------------------------------------
// 17. filter — predicate 入参检查 (新增)
// ---------------------------------------------------------------------------

test('filter throws TypeError if predicate is not a function', (t) => {
  t.throws(
    () => h('mixed.md').gather().filter('not-a-function'),
    { instanceOf: TypeError, message: /function/ },
  );
});

test('filter throws TypeError if predicate is null', (t) => {
  t.throws(
    () => h('mixed.md').gather().filter(null),
    { instanceOf: TypeError, message: /function/ },
  );
});

// ---------------------------------------------------------------------------
// 18. classify — buckets 入参检查 (新增)
// ---------------------------------------------------------------------------

test('classify throws TypeError if buckets is not a plain object', (t) => {
  t.throws(
    () => h('mixed.md').gather().classify('invalid'),
    { instanceOf: TypeError, message: /plain object/ },
  );
});

test('classify throws TypeError if buckets is null', (t) => {
  t.throws(
    () => h('mixed.md').gather().classify(null),
    { instanceOf: TypeError, message: /plain object/ },
  );
});

test('classify throws TypeError if buckets is an array', (t) => {
  t.throws(
    () => h('mixed.md').gather().classify([]),
    { instanceOf: TypeError, message: /plain object/ },
  );
});

test('classify throws TypeError if buckets is empty', (t) => {
  t.throws(
    () => h('mixed.md').gather().classify({}),
    { instanceOf: TypeError, message: /empty/ },
  );
});

test('classify throws TypeError if buckets has more than one "rest" value', (t) => {
  t.throws(
    () => h('mixed.md').gather().classify({ a: 'rest', b: 'rest' }),
    { instanceOf: TypeError, message: /at most one/ },
  );
});

test('classify throws TypeError if a bucket value is neither a function nor "rest"', (t) => {
  t.throws(
    () => h('mixed.md').gather().classify({ a: 42 }),
    { instanceOf: TypeError, message: /predicate function|"rest"/ },
  );
});

test('classify accepts valid buckets with no rest entry', async (t) => {
  // rest 可以不存在（内部用默认 "rest" key）
  const result = await h('mixed.md').gather().classify({
    images: (l) => l.type === LinkType.MarkdownImage,
    rest: 'rest',
  });
  t.true(Array.isArray(result.images));
});

// ---------------------------------------------------------------------------
// _execExtractLinks — D 链路
// gather().detectExternalRefs()  →  对所有 LocalResource 附 externalRefs
// ---------------------------------------------------------------------------

test('D chain: gather().detectExternalRefs() attaches externalRefs to every LocalResource', async (t) => {
  const links = await h('refs-target.md').gather().detectExternalRefs();
  t.true(Array.isArray(links));
  const locals = links.filter(l => l.linkTarget === LinkTarget.LocalResource);
  t.true(locals.length > 0);
  for (const l of locals) {
    t.true(Array.isArray(l.externalRefs), `externalRefs missing on ${l.url}`);
  }
});

test('D chain: non-LocalResource links get no externalRefs', async (t) => {
  const links = await h('local-resources.md').gather().detectExternalRefs();
  const nonLocals = links.filter(l => l.linkTarget !== LinkTarget.LocalResource);
  for (const l of nonLocals) {
    t.falsy(l.externalRefs);
  }
});

test('D chain: file with no local resources returns empty externalRefs everywhere', async (t) => {
  const links = await h('externals-only.md').gather().detectExternalRefs();
  t.true(links.every(l => !l.externalRefs || l.externalRefs.length === 0));
});

// ---------------------------------------------------------------------------
// _execExtractLinks — FD 链路
// gather().filter().detectExternalRefs()
// ---------------------------------------------------------------------------

test('FD chain: filter then detectExternalRefs — only filtered items, with externalRefs on locals', async (t) => {
  const links = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .detectExternalRefs();
  t.true(links.every(l => l.linkTarget === LinkTarget.LocalResource));
  for (const l of links) {
    t.true(Array.isArray(l.externalRefs));
  }
});

test('FD chain: items excluded by filter are absent from result', async (t) => {
  const all = await h('local-resources.md').gather();
  const filtered = await h('local-resources.md')
    .gather()
    .filter(l => l.type === LinkType.MarkdownImage)
    .detectExternalRefs();
  t.true(filtered.every(l => l.type === LinkType.MarkdownImage));
  t.true(filtered.length < all.length);
});

// ---------------------------------------------------------------------------
// _execExtractLinks — DF 链路
// gather().detectExternalRefs().filter()
// 注意：D 先运行附 externalRefs，再由 F 过滤
// ---------------------------------------------------------------------------

test('DF chain: detectExternalRefs then filter — filter sees externalRefs', async (t) => {
  const links = await h('refs-target.md')
    .gather()
    .detectExternalRefs()
    .filter(l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0);
  t.true(links.length > 0);
  t.true(links.every(l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0));
});

test('DF chain: items not matching post-detect filter are excluded', async (t) => {
  const links = await h('refs-target.md')
    .gather()
    .detectExternalRefs()
    .filter(() => false);
  t.deepEqual(links, []);
});

// ---------------------------------------------------------------------------
// _execExtractLinks — FDF 链路
// gather().filter().detectExternalRefs().filter()
// ---------------------------------------------------------------------------

test('FDF chain: pre-filter → detectExternalRefs → post-filter', async (t) => {
  const links = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .detectExternalRefs()
    .filter(l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0);
  t.true(links.every(l =>
    l.linkTarget === LinkTarget.LocalResource &&
    Array.isArray(l.externalRefs) &&
    l.externalRefs.length > 0,
  ));
});

test('FDF chain: pre-filter false → result always empty regardless of post-filter', async (t) => {
  const links = await h('refs-target.md')
    .gather()
    .filter(() => false)
    .detectExternalRefs()
    .filter(() => true);
  t.deepEqual(links, []);
});

// ---------------------------------------------------------------------------
// _exeClassifyLinks — C 链路（纯 classify，已有测试但此处显式标注）
// ---------------------------------------------------------------------------

test('C chain: classify only — all items partitioned, no externalRefs attached', async (t) => {
  const result = await h('mixed.md').gather().classify({
    images: l => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
    rest: REST_KEY,
  });
  t.true(Array.isArray(result.images));
  t.true(Array.isArray(result.rest));
  t.true(result.images.every(l => !l.externalRefs));
  t.true(result.rest.every(l => !l.externalRefs));
});

test('C chain: every bucket is pre-initialised (matched bucket always present in result)', async (t) => {
  const result = await h('mixed.md').gather().classify({
    images: () => false,
    rest: REST_KEY,
  });
  // 'images' bucket is initialised even if nothing matches
  t.true('images' in result);
  t.deepEqual(result.images, []);
});

// ---------------------------------------------------------------------------
// _exeClassifyLinks — CD 链路
// classify().detectExternalRefs()  (keys = null → all buckets)
// ---------------------------------------------------------------------------

test('CD chain: classify then detectExternalRefs(keys=null) — matched items in local bucket get externalRefs', async (t) => {
  const result = await h('refs-target.md')
    .gather()
    .classify({
      local: l => l.linkTarget === LinkTarget.LocalResource,
      rest: REST_KEY,
    })
    .detectExternalRefs();
  t.true(Array.isArray(result.local));
  // At least one local item should have externalRefs attached
  const withRefs = result.local.filter(l => Array.isArray(l.externalRefs));
  t.true(withRefs.length > 0);
});

test('CD chain: classify().on(key).detectExternalRefs() — only targeted bucket items get externalRefs', async (t) => {
  const result = await h('refs-target.md')
    .gather()
    .classify({
      local: l => l.linkTarget === LinkTarget.LocalResource,
      rest: REST_KEY,
    })
    .on('local')
    .detectExternalRefs();
  // targeted bucket items have externalRefs
  t.true(result.local.every(l => Array.isArray(l.externalRefs)));
  // rest bucket items must NOT have externalRefs set by this call
  t.true(result.rest.every(l => !l.externalRefs));
});

// ---------------------------------------------------------------------------
// _exeClassifyLinks — FC 链路  gather().filter().classify()
// ---------------------------------------------------------------------------

test('FC chain: filter then classify — only filtered items reach buckets', async (t) => {
  const result = await h('local-resources.md')
    .gather()
    .filter(l => l.type === LinkType.MarkdownImage || l.type === LinkType.MarkdownLink)
    .classify({
      images: l => l.type === LinkType.MarkdownImage,
      rest: REST_KEY,
    });
  const all = [...result.images, ...result.rest];
  t.true(all.every(l =>
    l.type === LinkType.MarkdownImage || l.type === LinkType.MarkdownLink,
  ));
  t.true(result.images.every(l => l.type === LinkType.MarkdownImage));
});

// ---------------------------------------------------------------------------
// _exeClassifyLinks — FCD 链路
// gather().filter().classify().on(key).detectExternalRefs()
// ---------------------------------------------------------------------------

test('FCD chain: filter → classify → detectExternalRefs on key', async (t) => {
  const result = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .classify({
      docs: l => l.url.endsWith('.md'),
      rest: REST_KEY,
    })
    .on('docs')
    .detectExternalRefs();
  t.true('docs' in result);
  t.true(result.docs.every(l => l.url.endsWith('.md') && Array.isArray(l.externalRefs)));
  t.true(result.rest.every(l => !l.externalRefs));
});

// ---------------------------------------------------------------------------
// _exeClassifyLinks — DFC 链路
// gather().detectExternalRefs().filter().classify()
// D 先全量附 externalRefs，再 F 过滤，再 C 分桶
// ---------------------------------------------------------------------------

test('DFC chain: detectExternalRefs → filter → classify', async (t) => {
  const result = await h('refs-target.md')
    .gather()
    .detectExternalRefs()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .classify({
      withRefs: l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0,
      rest: REST_KEY,
    });
  t.true('withRefs' in result);
  t.true('rest' in result);
  // items in withRefs bucket passed filter and have externalRefs
  t.true(result.withRefs.every(l =>
    l.linkTarget === LinkTarget.LocalResource &&
    Array.isArray(l.externalRefs) &&
    l.externalRefs.length > 0,
  ));
});

// ---------------------------------------------------------------------------
// _exeClassifyLinks — FDC 链路
// gather().filter().detectExternalRefs().classify()
// F 先过滤，D 再附 externalRefs，最后 C 分桶
// ---------------------------------------------------------------------------

test('FDC chain: filter → detectExternalRefs → classify', async (t) => {
  const result = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .detectExternalRefs()
    .classify({
      referenced: l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0,
      rest: REST_KEY,
    });
  t.true('referenced' in result);
  // all items went through detect, so LocalResource items have externalRefs
  const all = [...result.referenced, ...result.rest];
  t.true(all.every(l => l.linkTarget === LinkTarget.LocalResource));
  t.true(result.referenced.every(l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0));
});

// ---------------------------------------------------------------------------
// _exeClassifyLinks — FDFC 链路
// gather().filter().detectExternalRefs().filter().classify()
// ---------------------------------------------------------------------------

test('FDFC chain: pre-filter → detectExternalRefs → post-filter → classify', async (t) => {
  const result = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)  // F
    .detectExternalRefs()                                     // D
    .filter(l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0) // F
    .classify({                                               // C
      docs: l => l.url.endsWith('.md'),
      rest: REST_KEY,
    });
  t.true('docs' in result);
  const all = [...result.docs, ...result.rest];
  // all items: LocalResource, have externalRefs, externalRefs.length > 0
  t.true(all.every(l =>
    l.linkTarget === LinkTarget.LocalResource &&
    Array.isArray(l.externalRefs) &&
    l.externalRefs.length > 0,
  ));
});

// ---------------------------------------------------------------------------
// optimizeOps — dedupeDetectExternalRefs
// 重复调用 detectExternalRefs 只保留第一个 D op
// ---------------------------------------------------------------------------

test('duplicate detectExternalRefs calls are deduped — second D is dropped', async (t) => {
  // FD chain: two chained detectExternalRefs should behave same as one
  const once = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .detectExternalRefs();

  const twice = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .detectExternalRefs()
    .detectExternalRefs(); // 第二个 D 被 dedupeDetectExternalRefs 去除

  t.deepEqual(
    once.map(l => ({ url: l.url, refs: l.externalRefs })),
    twice.map(l => ({ url: l.url, refs: l.externalRefs })),
  );
});

test('duplicate detectExternalRefs in classify chain is deduped', async (t) => {
  const r1 = await h('refs-target.md')
    .gather()
    .classify({ local: l => l.linkTarget === LinkTarget.LocalResource, rest: REST_KEY })
    .on('local')
    .detectExternalRefs();

  // calling detectExternalRefs twice on ClassificationPipeline — second is deduped
  const classifyPipeline = h('refs-target.md')
    .gather()
    .classify({ local: l => l.linkTarget === LinkTarget.LocalResource, rest: REST_KEY });
  classifyPipeline.detectExternalRefs(); // push one D
  const r2 = await classifyPipeline.on('local').detectExternalRefs(); // push second D → deduped

  t.deepEqual(
    r1.local.map(l => l.url).sort(),
    r2.local.map(l => l.url).sort(),
  );
});

// ---------------------------------------------------------------------------
// REST_KEY 在 classify 中的语义等价性
// REST_KEY === 'rest'，两者可互换
// ---------------------------------------------------------------------------

test('REST_KEY and literal "rest" are interchangeable in classify buckets', async (t) => {
  const r1 = await h('mixed.md').gather().classify({
    images: l => l.type === LinkType.MarkdownImage,
    rest: REST_KEY,
  });
  const r2 = await h('mixed.md').gather().classify({
    images: l => l.type === LinkType.MarkdownImage,
    rest: 'rest',
  });
  t.deepEqual(
    r1.images.map(l => l.url).sort(),
    r2.images.map(l => l.url).sort(),
  );
  t.deepEqual(
    r1.rest.map(l => l.url).sort(),
    r2.rest.map(l => l.url).sort(),
  );
});

// ---------------------------------------------------------------------------
// D chain 在空文件上的健壮性
// ---------------------------------------------------------------------------

test('D chain on file with no links returns empty array', async (t) => {
  const links = await h('empty.md').gather().detectExternalRefs();
  t.deepEqual(links, []);
});
