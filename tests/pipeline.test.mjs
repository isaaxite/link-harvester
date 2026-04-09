/**
 * Tests for LinkHarvester pipeline (index.ts)
 *
 * Coverage targets:
 *   - LinkHarvester constructor (all validation branches)
 *   - Pipeline._schedule / _flush / _execute
 *   - _execute: gather only (ops.length === 1)
 *   - _execute: linear ops (filter / detect), no classify
 *   - _execute: classify path (classifyIdx !== -1)
 *   - _execute: filter + classify combined
 *   - _execute: detect + classify combined
 *   - _parseLinerOps: DetectAccessible branch
 *   - _parseLinerOps: DetectExternalRefs branch
 *   - _parseLinerOps: Filter branch
 *   - _parseClassifyOps: restKey present / absent
 *   - _parseClassifyOps: processor – matched / not matched / rest
 *   - _detectExternalRefs: skips self, finds cross-file refs
 *   - _setResourceRefsCache: builds cache correctly
 *   - _getOtherFilePaths: memoised
 *   - LinkDataPipeline.filter – type guard, valid, chained
 *   - LinkDataPipeline.filterBy – all LinkType / LinkTarget variants, invalid
 *   - LinkDataPipeline.classify – all validation branches, valid call
 *   - LinkDataPipeline.detect – DetectType.ExternalRefs, DetectType.Accessible, invalid
 *   - optimizeOps deduplication via duplicate detect calls
 *   - REST_KEY semantics
 *   - Exports sanity
 */

import test from 'ava';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  LinkHarvester,
  LinkType,
  LinkTarget,
  DetectType,
  REST_KEY,
} from '../dist/index.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

/** Shorthand: build a harvester rooted at FIXTURES for the given filePath */
const h = (filePath) => new LinkHarvester({ base: FIXTURES, filePath });

// ---------------------------------------------------------------------------
// 1. gather — basic pipeline execution (_execute: ops.length === 1 path)
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

test('gather resolves with correct types for md-images.md', async (t) => {
  const links = await h('md-images.md').gather();
  t.true(links.length > 0);
  t.true(links.every((l) => l.type === LinkType.MarkdownImage));
});

// ---------------------------------------------------------------------------
// 2. filter — _parseLinerOps: Filter branch
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
// 5. classify — validation branches
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

test('classify throws TypeError if buckets has more than one rest value', (t) => {
  t.throws(
    () => h('mixed.md').gather().classify({ a: REST_KEY, b: REST_KEY }),
    { instanceOf: TypeError, message: /at most one/ },
  );
});

test('classify throws TypeError if a bucket value is neither function nor rest', (t) => {
  t.throws(
    () => h('mixed.md').gather().classify({ a: 42 }),
    { instanceOf: TypeError, message: /predicate function|"rest"/ },
  );
});

// ---------------------------------------------------------------------------
// 6. classify — _parseClassifyOps functional behaviour
// ---------------------------------------------------------------------------

test('classify splits links into named buckets + rest', async (t) => {
  const result = await h('mixed.md').gather().classify({
    images: (l) => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
    rest: REST_KEY,
  });
  t.true(Array.isArray(result.images));
  t.true(Array.isArray(result.rest));
  t.true(result.images.every(
    (l) => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
  ));
});

test('classify – items not matched by any named bucket go to rest', async (t) => {
  const allLinks = await h('mixed.md').gather();
  const result = await h('mixed.md').gather().classify({
    neverMatch: () => false,
    rest: REST_KEY,
  });
  t.is(result.rest.length, allLinks.length);
  t.deepEqual(result.neverMatch, []);
});

test('classify – matched items are excluded from rest', async (t) => {
  const result = await h('mixed.md').gather().classify({
    images: (l) => l.type === LinkType.MarkdownImage,
    rest: REST_KEY,
  });
  t.true(result.rest.every((l) => l.type !== LinkType.MarkdownImage));
});

test('classify – bucket pre-initialised even when nothing matches', async (t) => {
  const result = await h('mixed.md').gather().classify({
    images: () => false,
    rest: REST_KEY,
  });
  t.true('images' in result);
  t.deepEqual(result.images, []);
});

test('classify – works without a rest bucket (only named buckets)', async (t) => {
  const result = await h('mixed.md').gather().classify({
    images: (l) => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
    links: (l) => l.type === LinkType.MarkdownLink || l.type === LinkType.HtmlAnchor,
  });
  t.true('images' in result);
  t.true('links' in result);
  t.false('rest' in result);
});

test('REST_KEY and literal "rest" string are interchangeable', async (t) => {
  const r1 = await h('mixed.md').gather().classify({
    images: (l) => l.type === LinkType.MarkdownImage,
    rest: REST_KEY,
  });
  const r2 = await h('mixed.md').gather().classify({
    images: (l) => l.type === LinkType.MarkdownImage,
    rest: 'rest',
  });
  t.deepEqual(r1.images.map(l => l.url).sort(), r2.images.map(l => l.url).sort());
  t.deepEqual(r1.rest.map(l => l.url).sort(), r2.rest.map(l => l.url).sort());
});

// ---------------------------------------------------------------------------
// 7. filter + classify — combined linear + classify path
// ---------------------------------------------------------------------------

test('filter then classify – filter applied before bucketing', async (t) => {
  const result = await h('local-resources.md')
    .gather()
    .filter((l) => l.type === LinkType.MarkdownImage || l.type === LinkType.MarkdownLink)
    .classify({
      images: (l) => l.type === LinkType.MarkdownImage,
      rest: REST_KEY,
    });
  const allItems = [...result.images, ...result.rest];
  t.true(allItems.every(
    (l) => l.type === LinkType.MarkdownImage || l.type === LinkType.MarkdownLink,
  ));
  t.true(result.images.every((l) => l.type === LinkType.MarkdownImage));
});

// ---------------------------------------------------------------------------
// 8. detect(ExternalRefs) — _parseLinerOps: DetectExternalRefs branch
// ---------------------------------------------------------------------------

test('detect(ExternalRefs) attaches externalRefs array to every LocalResource', async (t) => {
  const links = await h('refs-target.md').gather().detect(DetectType.ExternalRefs);
  t.true(Array.isArray(links));
  const locals = links.filter(l => l.linkTarget === LinkTarget.LocalResource);
  t.true(locals.length > 0);
  for (const l of locals) {
    t.true(Array.isArray(l.externalRefs), `externalRefs missing on ${l.url}`);
  }
});

test('detect(ExternalRefs) – non-LocalResource links get no externalRefs', async (t) => {
  const links = await h('local-resources.md').gather().detect(DetectType.ExternalRefs);
  const nonLocals = links.filter(l => l.linkTarget !== LinkTarget.LocalResource);
  for (const l of nonLocals) {
    t.falsy(l.externalRefs);
  }
});

test('detect(ExternalRefs) on file with no local links – no externalRefs set', async (t) => {
  const links = await h('externals-only.md').gather().detect(DetectType.ExternalRefs);
  t.true(links.every(l => !l.externalRefs || l.externalRefs.length === 0));
});

test('detect(ExternalRefs) on empty file returns empty array', async (t) => {
  const links = await h('empty.md').gather().detect(DetectType.ExternalRefs);
  t.deepEqual(links, []);
});

test('detect(ExternalRefs) – source file does not appear in its own externalRefs', async (t) => {
  const links = await h('local-resources.md').gather().detect(DetectType.ExternalRefs);
  for (const item of links) {
    if (Array.isArray(item.externalRefs)) {
      t.false(
        item.externalRefs.includes('local-resources.md'),
        'Source file must not appear in its own externalRefs',
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 9. detect(Accessible) — _parseLinerOps: DetectAccessible branch
// ---------------------------------------------------------------------------

test('detect(Accessible) sets accessible=true on existing local files', async (t) => {
  const links = await h('local-resources.md').gather().detect(DetectType.Accessible);
  const locals = links.filter(l => l.linkTarget === LinkTarget.LocalResource);
  t.true(locals.length > 0);
  t.true(locals.some(l => l.accessible === true));
});

test('detect(Accessible) sets accessible=false on missing local files', async (t) => {
  const links = await h('local-resources.md').gather().detect(DetectType.Accessible);
  const missing = links.filter(
    l => l.linkTarget === LinkTarget.LocalResource && l.url.includes('nonexistent'),
  );
  t.true(missing.length > 0);
  t.true(missing.every(l => l.accessible === false));
});

test('detect(Accessible) does not touch accessible on non-local links', async (t) => {
  const links = await h('local-resources.md').gather().detect(DetectType.Accessible);
  const nonLocals = links.filter(l => l.linkTarget !== LinkTarget.LocalResource);
  for (const l of nonLocals) {
    t.is(l.accessible, undefined);
  }
});

test('detect throws TypeError for invalid DetectType', (t) => {
  t.throws(
    () => h('mixed.md').gather().detect('invalid_detect_type'),
    { instanceOf: TypeError },
  );
});

// ---------------------------------------------------------------------------
// 10. filter + detect combined
// ---------------------------------------------------------------------------

test('filter then detect(ExternalRefs) – only filtered items, externalRefs on locals', async (t) => {
  const links = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .detect(DetectType.ExternalRefs);
  t.true(links.every(l => l.linkTarget === LinkTarget.LocalResource));
  for (const l of links) {
    t.true(Array.isArray(l.externalRefs));
  }
});

test('filter then detect – items excluded by filter are absent', async (t) => {
  const all = await h('local-resources.md').gather();
  const filtered = await h('local-resources.md')
    .gather()
    .filter(l => l.type === LinkType.MarkdownImage)
    .detect(DetectType.ExternalRefs);
  t.true(filtered.every(l => l.type === LinkType.MarkdownImage));
  t.true(filtered.length < all.length);
});

test('detect then filter – filter can see externalRefs set by detect', async (t) => {
  const links = await h('refs-target.md')
    .gather()
    .detect(DetectType.ExternalRefs)
    .filter(l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0);
  t.true(links.length > 0);
  t.true(links.every(l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0));
});

test('detect then filter – always-false post-detect filter yields empty array', async (t) => {
  const links = await h('refs-target.md')
    .gather()
    .detect(DetectType.ExternalRefs)
    .filter(() => false);
  t.deepEqual(links, []);
});

test('filter + detect + filter (FDF) – pre/post filters both applied', async (t) => {
  const links = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .detect(DetectType.ExternalRefs)
    .filter(l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0);
  t.true(links.every(l =>
    l.linkTarget === LinkTarget.LocalResource &&
    Array.isArray(l.externalRefs) &&
    l.externalRefs.length > 0,
  ));
});

test('FDF chain – pre-filter false means result always empty', async (t) => {
  const links = await h('refs-target.md')
    .gather()
    .filter(() => false)
    .detect(DetectType.ExternalRefs)
    .filter(() => true);
  t.deepEqual(links, []);
});

// ---------------------------------------------------------------------------
// 11. detect + classify combined
// ---------------------------------------------------------------------------

test('detect(ExternalRefs) + filter + classify – externalRefs visible in buckets', async (t) => {
  const result = await h('refs-target.md')
    .gather()
    .detect(DetectType.ExternalRefs)
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .classify({
      withRefs: l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0,
      rest: REST_KEY,
    });
  t.true('withRefs' in result);
  t.true('rest' in result);
  t.true(result.withRefs.every(l =>
    l.linkTarget === LinkTarget.LocalResource &&
    Array.isArray(l.externalRefs) &&
    l.externalRefs.length > 0,
  ));
});

test('filter + detect(ExternalRefs) + classify (FDC) – correct pipeline order', async (t) => {
  const result = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .detect(DetectType.ExternalRefs)
    .classify({
      referenced: l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0,
      rest: REST_KEY,
    });
  t.true('referenced' in result);
  const all = [...result.referenced, ...result.rest];
  t.true(all.every(l => l.linkTarget === LinkTarget.LocalResource));
  t.true(result.referenced.every(
    l => Array.isArray(l.externalRefs) && l.externalRefs.length > 0,
  ));
});

test('filter + classify + no detect – no externalRefs attached in classify buckets', async (t) => {
  const result = await h('mixed.md').gather().classify({
    images: l => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
    rest: REST_KEY,
  });
  t.true(result.images.every(l => l.externalRefs === undefined));
  t.true(result.rest.every(l => l.externalRefs === undefined));
});

// ---------------------------------------------------------------------------
// 12. optimizeOps – deduplication of repeated detect ops
// ---------------------------------------------------------------------------

test('duplicate detect(ExternalRefs) calls are deduped – result equals single call', async (t) => {
  const once = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .detect(DetectType.ExternalRefs);

  const twice = await h('refs-target.md')
    .gather()
    .filter(l => l.linkTarget === LinkTarget.LocalResource)
    .detect(DetectType.ExternalRefs)
    .detect(DetectType.ExternalRefs); // second D deduped by optimizeOps

  t.deepEqual(
    once.map(l => ({ url: l.url, refs: l.externalRefs })),
    twice.map(l => ({ url: l.url, refs: l.externalRefs })),
  );
});

test('duplicate detect(Accessible) calls are deduped – result equals single call', async (t) => {
  const once = await h('local-resources.md')
    .gather()
    .detect(DetectType.Accessible);

  const twice = await h('local-resources.md')
    .gather()
    .detect(DetectType.Accessible)
    .detect(DetectType.Accessible); // second deduped

  t.deepEqual(
    once.map(l => ({ url: l.url, accessible: l.accessible })),
    twice.map(l => ({ url: l.url, accessible: l.accessible })),
  );
});

// ---------------------------------------------------------------------------
// 13. _getOtherFilePaths memoisation
// ---------------------------------------------------------------------------

test('_getOtherFilePaths is memoised: two independent detect runs are consistent', async (t) => {
  const r1 = await h('refs-target.md').gather().detect(DetectType.ExternalRefs);
  const r2 = await h('refs-target.md').gather().detect(DetectType.ExternalRefs);

  t.deepEqual(
    r1.filter(l => l.linkTarget === LinkTarget.LocalResource).map(l => l.url).sort(),
    r2.filter(l => l.linkTarget === LinkTarget.LocalResource).map(l => l.url).sort(),
  );
});

// ---------------------------------------------------------------------------
// 14. LinkHarvester constructor — all validation branches
// ---------------------------------------------------------------------------

test('constructor throws if base is not a string', (t) => {
  t.throws(
    () => new LinkHarvester({ base: 42, filePath: 'mixed.md' }),
    { instanceOf: Error, message: /string/ },
  );
});

test('constructor throws if base is a relative path', (t) => {
  t.throws(
    () => new LinkHarvester({ base: 'relative/path', filePath: 'mixed.md' }),
    { instanceOf: Error, message: /absolute/ },
  );
});

test('constructor throws if base directory does not exist', (t) => {
  t.throws(
    () => new LinkHarvester({ base: '/nonexistent/directory', filePath: 'mixed.md' }),
    { instanceOf: Error, message: /not exist|not accessible/ },
  );
});

test('constructor throws if filePath is not a string', (t) => {
  t.throws(
    () => new LinkHarvester({ base: FIXTURES, filePath: 123 }),
    { instanceOf: Error, message: /string/ },
  );
});

test('constructor throws if relative filePath does not exist under base', (t) => {
  t.throws(
    () => new LinkHarvester({ base: FIXTURES, filePath: 'no-such-file.md' }),
    { instanceOf: Error, message: /not exist|not accessible/ },
  );
});

test('constructor accepts absolute filePath inside base', (t) => {
  const absFilePath = join(FIXTURES, 'mixed.md');
  t.notThrows(() => new LinkHarvester({ base: FIXTURES, filePath: absFilePath }));
});

test('constructor throws if absolute filePath does not exist', (t) => {
  const absFilePath = join(FIXTURES, 'ghost.md');
  t.throws(
    () => new LinkHarvester({ base: FIXTURES, filePath: absFilePath }),
    { instanceOf: Error, message: /not exist|not accessible/ },
  );
});

test('constructor throws if absolute filePath is outside base', (t) => {
  t.throws(
    () => new LinkHarvester({ base: FIXTURES, filePath: '/tmp/outside.md' }),
    { instanceOf: Error, message: /outside/ },
  );
});

test('constructor normalises trailing separator in base', async (t) => {
  const baseWithSep = FIXTURES + '/';
  const links = await new LinkHarvester({ base: baseWithSep, filePath: 'mixed.md' }).gather();
  t.true(links.length > 0);
});

// ---------------------------------------------------------------------------
// 15. Exports sanity
// ---------------------------------------------------------------------------

test('LinkHarvester is a constructor function', (t) => {
  t.is(typeof LinkHarvester, 'function');
});

test('LinkType enum values are correct', (t) => {
  t.is(LinkType.MarkdownLink, 'markdown_link');
  t.is(LinkType.MarkdownImage, 'markdown_image');
  t.is(LinkType.HtmlImage, 'html_image');
  t.is(LinkType.HtmlAnchor, 'html_anchor');
});

test('LinkTarget enum values are correct', (t) => {
  t.is(LinkTarget.ExternalPage, 'external_page');
  t.is(LinkTarget.ExternalResource, 'external_resource');
  t.is(LinkTarget.LocalResource, 'local_resource');
  t.is(LinkTarget.InPageAnchor, 'in_page_anchor');
  t.is(LinkTarget.Other, 'other');
});

test('DetectType enum values are correct', (t) => {
  t.is(DetectType.ExternalRefs, 'external_refs');
  t.is(DetectType.Accessible, 'accessible');
});

test('REST_KEY equals the string "rest"', (t) => {
  t.is(REST_KEY, 'rest');
});
