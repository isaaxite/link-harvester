# link-harvester

> 📖 [中文文档 (Chinese README)](https://github.com/isaaxite/link-harvester/blob/main/docs/README.zh-CN.md)

<div align="left">
  <p>A Node.js library for extracting, filtering, and classifying links from Markdown files. Built around a fluent pipeline API, it supports all common Markdown and HTML link syntaxes and can detect cross-file external references for local assets. </p>
</div>

<div align="left">
  <a href="https://www.npmjs.com/package/link-harvester">
    <img alt="NPM Version" src="https://img.shields.io/npm/v/link-harvester">
  </a>
  <a href="https://nodejs.org">
    <img alt="node" src="https://img.shields.io/node/v/link-harvester">
  </a>
  <a href="https://github.com/isaaxite/link-harvester/blob/main/CHANGELOG.md">
    <img alt="CHANGELOG" src="https://img.shields.io/badge/changelog-maintained-brightgreen">
  </a>
  <a href="https://github.com/isaaxite/link-harvester/blob/main/LICENSE">
    <img alt="GitHub License" src="https://img.shields.io/github/license/isaaxite/link-harvester">
  </a>
  <a href="https://github.com/isaaxite/link-harvester">
    <img alt="GitHub Created At" src="https://img.shields.io/github/created-at/isaaxite/link-harvester">
  </a>
  <a href="https://github.com/isaaxite/link-harvester">
    <img alt="NPM Unpacked Size" src="https://img.shields.io/npm/unpacked-size/link-harvester">
  </a>
  <a href="https://github.com/isaaxite/link-harvester/commits/main/">
    <img alt="GitHub commit activity" src="https://img.shields.io/github/commit-activity/m/isaaxite/link-harvester">
  </a>
  <a href="https://github.com/isaaxite/link-harvester/commits/main/">
    <img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/isaaxite/link-harvester">
  </a>
  <a href='https://github.com/isaaxite/link-harvester/actions/workflows/unittests.yml'>
    <img src='https://github.com/isaaxite/link-harvester/actions/workflows/unittests.yml/badge.svg' alt='Test CI Status' />
  </a>
  <a href='https://coveralls.io/github/isaaxite/link-harvester'>
    <img src='https://coveralls.io/repos/github/isaaxite/link-harvester/badge.svg' alt='Coverage Status' />
  </a>
</div>

---

## Features

- Extracts all four link types: Markdown links, Markdown images, HTML `<a>` tags, HTML `<img>` tags
- Classifies each link's target: external page, external resource, local resource, in-page anchor, or other
- Fluent chainable pipeline: `gather → filter / filterBy → classify / classifyBy → detectExternalRefs`
- Cross-file reference detection — find which other Markdown files reference the same local asset
- Filter and classify operations are merged into a single iteration — no intermediate arrays
- ESM + CJS dual output, full TypeScript type declarations
- Node.js ≥ 18

---

## Installation

```bash
npm install link-harvester
```

---

## Quick Start

```js
import { LinkHarvester, LinkType, LinkTarget } from 'link-harvester';

const harvester = new LinkHarvester({
  base: '/absolute/path/to/project',
  filePath: 'docs/guide.md',        // relative to base, or absolute
});

// Gather all links
const links = await harvester.gather();

// Filter to local resources only
const localLinks = await harvester.gather().filterBy(LinkTarget.LocalResource);

// Classify into images vs everything else
const { images, rest } = await harvester.gather().classify({
  images: (l) => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
  rest: 'rest',
});

// Find which other markdown files reference the same local assets
const result = await harvester
  .gather()
  .filterBy(LinkTarget.LocalResource)
  .classify({ docs: (l) => l.url.endsWith('.md'), rest: 'rest' })
  .on('docs')
  .detectExternalRefs();

for (const item of result.docs) {
  console.log(item.url, '← referenced by:', item.externalRefs);
}
```

---

## API

### `new LinkHarvester(props)`

Creates a new harvester instance.

| Param | Type | Description |
|---|---|---|
| `props.base` | `string` | **Absolute** path to the project root directory |
| `props.filePath` | `string` | Path to the target Markdown file — relative to `base`, or absolute (must be inside `base`) |

Throws `Error` if `base` is not an absolute path, does not exist, or `filePath` cannot be resolved within `base`.

---

### `.gather()` → `LinkDataPipeline`

Reads the target file and extracts all links. Must be the first call in every pipeline chain. Schedules execution asynchronously — the result is resolved when the returned pipeline is awaited.

```js
const links = await harvester.gather();
// links: ExtractedLink[]
```

---

### `.filter(predicate)` → `LinkDataPipeline`

Keeps only links for which `predicate(link)` returns `true`. Multiple `.filter()` calls are merged into a single AND pass.

```js
const links = await harvester.gather().filter((l) => l.line > 10);
```

Throws `TypeError` if `predicate` is not a function.

---

### `.filterBy(type)` → `LinkDataPipeline`

Shorthand filter by a `LinkType` or `LinkTarget` enum value.

```js
import { LinkType, LinkTarget } from 'link-harvester';

await harvester.gather().filterBy(LinkType.MarkdownImage);
await harvester.gather().filterBy(LinkTarget.ExternalPage);
```

Throws `TypeError` if `type` is not a valid `LinkType` or `LinkTarget`.

**`LinkType` values**

| Value | Description |
|---|---|
| `LinkType.MarkdownLink` | `[text](url)` |
| `LinkType.MarkdownImage` | `![alt](url)` |
| `LinkType.HtmlImage` | `<img src="…">` |
| `LinkType.HtmlAnchor` | `<a href="…">` |

**`LinkTarget` values**

| Value | Description |
|---|---|
| `LinkTarget.ExternalPage` | `https://…` URL without a known resource extension |
| `LinkTarget.ExternalResource` | `https://…` URL with a resource extension (`.png`, `.pdf`, …) |
| `LinkTarget.LocalResource` | Relative or root-relative path without a scheme |
| `LinkTarget.InPageAnchor` | Starts with `#` |
| `LinkTarget.Other` | `mailto:`, `ftp:`, empty URL, etc. |

---

### `.classify(buckets)` → `ClassificationPipeline`

Splits links into named buckets. Each key maps to a predicate function or the special string `'rest'`. Items that do not match any named predicate fall into the `rest` bucket.

```js
const { images, links, rest } = await harvester.gather().classify({
  images: (l) => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
  links:  (l) => l.type === LinkType.MarkdownLink  || l.type === LinkType.HtmlAnchor,
  rest: 'rest',
});
```

**Validation** — throws `TypeError` if:
- `buckets` is not a plain object
- `buckets` is empty
- More than one value is the string `'rest'`
- Any value is neither a function nor `'rest'`

---

### `.classifyBy(ClassifyType.IfAccessable)` → `ClassificationPipeline`

Built-in classification that checks whether each local-resource link points to a file that actually exists and is readable on disk.

```js
import { ClassifyType } from 'link-harvester';

const { accessible, invalid } = await harvester
  .gather()
  .classifyBy(ClassifyType.IfAccessable);
```

Result buckets: `accessible` (readable local files) and `invalid` (missing files plus all non-local links).

---

### `.on(key).detectExternalRefs()` → `ThenPipeline`

After `.classify()`, call `.on(bucketKey)` to select a bucket, then `.detectExternalRefs()` to scan all other Markdown files under `base` and attach an `externalRefs: string[]` field to each item — listing every other file that references the same local asset.

```js
const result = await harvester
  .gather()
  .classify({ assets: (l) => l.linkTarget === LinkTarget.LocalResource, rest: 'rest' })
  .on('assets')
  .detectExternalRefs();

for (const item of result.assets) {
  console.log(item.url, 'also referenced in:', item.externalRefs);
}
```

---

### `.detectExternalRefs()` (on `ClassificationPipeline`) → `ThenPipeline`

Same as above but scans all buckets. The `externalRefs` computation runs for every matched item across all buckets; results are not attached to `data.externalRefs` in this form — use `.on(key).detectExternalRefs()` when you need the refs attached.

---

### `extractLinks(filePath)` → `Promise<ExtractedLink[]>`

Low-level function, also exported directly. Parses a single Markdown file and returns all extracted links without any pipeline.

```js
import { extractLinks } from 'link-harvester';

const links = await extractLinks('/absolute/path/to/file.md');
```

---

## `ExtractedLink` Shape

```ts
interface ExtractedLink {
  type:        LinkType;      // syntax variant
  linkTarget:  LinkTarget;    // semantic target category
  syntax:      string;        // full matched text, e.g. "![alt](./img.png)"
  url:         string;        // extracted URL / path
  line:        number;        // 1-based line number in the source file
  alt?:        string;        // present on MarkdownImage
  text?:       string;        // present on MarkdownLink
  externalRefs?: string[];    // populated by detectExternalRefs()
}
```

---

## License

[MIT](https://github.com/isaaxite/link-harvester/blob/main/LICENSE) © [isaaxite](https://github.com/isaaxite)
