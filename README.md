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

- Extracts Markdown links, Markdown images, HTML `<a>` anchors, and HTML `<img>` tags
- Classifies each link's target: external page, external resource, local resource, in-page anchor, or other
- Fluent pipeline API: `gather → filter / detect → classify`
- Built-in `detect(Accessible)` — checks whether local files actually exist on disk
- Built-in `detect(ExternalRefs)` — finds other Markdown files in the same base directory that reference the same local asset
- Automatic pipeline optimisation: duplicate `detect` ops are deduplicated; consecutive `filter` ops are merged

---

## Requirements

- Node.js ≥ 18.0.0

---

## Installation

```bash
npm install link-harvester
```

---

## Quick Start

```js
import { LinkHarvester, LinkType, LinkTarget, DetectType, REST_KEY } from 'link-harvester';
import { resolve } from 'node:path';

const harvester = new LinkHarvester({
  base: resolve('./docs'),   // absolute path to the root directory
  filePath: 'guide/intro.md' // relative (or absolute) path to the target file
});

// Gather all links from the file
const links = await harvester.gather();
console.log(links);
```

---

## API

### `new LinkHarvester({ base, filePath })`

Creates a harvester instance for a single Markdown file.

| Option | Type | Description |
|---|---|---|
| `base` | `string` | **Absolute** path to the root directory. Used to resolve relative file paths and to scope cross-reference scanning. |
| `filePath` | `string` | Path to the target Markdown file. May be relative to `base` or absolute (must be inside `base`). |

Throws `Error` when:
- `base` is not a string, not an absolute path, or does not exist
- `filePath` is not a string, does not exist, or is outside `base`

---

### `.gather()` → `LinkDataPipeline`

Reads and parses the target file. Must be the first call in every pipeline chain. Returns a `LinkDataPipeline` for further operations.

```js
const links = await harvester.gather();
// → ExtractedLink[]
```

---

### `.filter(predicate)` → `LinkDataPipeline`

Keeps only links for which `predicate(link)` returns `true`. Multiple `.filter()` calls are merged into a single AND check.

```js
const links = await harvester
  .gather()
  .filter(l => l.linkTarget === LinkTarget.LocalResource);
```

Throws `TypeError` if `predicate` is not a function.

---

### `.filterBy(type)` → `LinkDataPipeline`

Shorthand for filtering by a `LinkType` or `LinkTarget` enum value.

```js
// By link type
await harvester.gather().filterBy(LinkType.MarkdownImage);

// By link target
await harvester.gather().filterBy(LinkTarget.ExternalPage);
```

Throws `TypeError` for any unrecognised value.

---

### `.detect(detectType)` → `LinkDataPipeline`

Runs a detection pass that enriches each `ExtractedLink` with additional fields. Only affects `LocalResource` links.

| `detectType` | Effect |
|---|---|
| `DetectType.Accessible` | Sets `link.accessible: boolean` — `true` if the file exists and is readable. |
| `DetectType.ExternalRefs` | Sets `link.externalRefs: string[]` — relative paths of other `.md`/`.markdown` files in `base` that reference the same local asset. |

```js
import { DetectType } from 'link-harvester';

// Check file accessibility
const links = await harvester
  .gather()
  .detect(DetectType.Accessible);

// Find cross-file references
const links = await harvester
  .gather()
  .detect(DetectType.ExternalRefs);
```

Throws `TypeError` for an unrecognised `detectType`.

---

### `.classify(buckets)` → `ThenPipeline`

Partitions links into named buckets. Returns a `ThenPipeline` (thenable, no further chaining).

Each value in `buckets` must be either:
- a predicate function `(link: ExtractedLink) => boolean`, or
- the `REST_KEY` constant (`"rest"`) — collects every link not matched by any named bucket.

At most one bucket may use `REST_KEY`.

```js
import { REST_KEY } from 'link-harvester';

const result = await harvester
  .gather()
  .classify({
    images: l => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
    pages:  l => l.linkTarget === LinkTarget.ExternalPage,
    rest:   REST_KEY,
  });

console.log(result.images); // ExtractedLink[]
console.log(result.pages);  // ExtractedLink[]
console.log(result.rest);   // ExtractedLink[]  (everything else)
```

Throws `TypeError` when:
- `buckets` is not a plain object
- `buckets` is empty
- more than one bucket uses `REST_KEY`
- any bucket value is neither a function nor `REST_KEY`

---

## Pipeline Composition

Operations can be freely composed before `.classify()` terminates the chain.

```
gather()
  → .filter()       zero or more, merged into a single AND predicate
  → .detect()       zero or more, deduplicated automatically
  → .filterBy()     shorthand for .filter() by type or target
  → .classify()     optional terminal — switches result to Record<string, ExtractedLink[]>
```

### Examples

**Filter then classify**

```js
const result = await harvester
  .gather()
  .filter(l => l.type === LinkType.MarkdownImage || l.type === LinkType.MarkdownLink)
  .classify({
    images: l => l.type === LinkType.MarkdownImage,
    rest: REST_KEY,
  });
```

**Detect accessibility then filter broken links**

```js
const broken = await harvester
  .gather()
  .detect(DetectType.Accessible)
  .filter(l => l.linkTarget === LinkTarget.LocalResource && l.accessible === false);
```

**Find shared assets referenced by other files**

```js
const shared = await harvester
  .gather()
  .filter(l => l.linkTarget === LinkTarget.LocalResource)
  .detect(DetectType.ExternalRefs)
  .filter(l => l.externalRefs.length > 0);
```

**Full pipeline: filter → detect → classify**

```js
const result = await harvester
  .gather()
  .filter(l => l.linkTarget === LinkTarget.LocalResource)
  .detect(DetectType.ExternalRefs)
  .classify({
    shared:  l => l.externalRefs.length > 0,
    private: REST_KEY,
  });
```

---

## Data Types

### `ExtractedLink`

All extracted links share these fields:

| Field | Type | Description |
|---|---|---|
| `type` | `LinkType` | Syntax type of the link |
| `linkTarget` | `LinkTarget` | Classified target of the URL |
| `url` | `string` | The raw URL string |
| `syntax` | `string` | The full matched syntax fragment |
| `line` | `number` | 1-based line number in the source file |
| `accessible` | `boolean \| undefined` | Set by `detect(Accessible)` on `LocalResource` links |
| `externalRefs` | `string[] \| undefined` | Set by `detect(ExternalRefs)` on `LocalResource` links |

Markdown-specific subtypes add:

| Subtype | Extra field | Description |
|---|---|---|
| `MarkdownLink` | `text: string` | Link display text |
| `MarkdownImageLink` | `alt: string` | Image alt text |

---

### `LinkType`

| Value | Syntax |
|---|---|
| `LinkType.MarkdownLink` | `[text](url)` |
| `LinkType.MarkdownImage` | `![alt](url)` |
| `LinkType.HtmlImage` | `<img src="url">` |
| `LinkType.HtmlAnchor` | `<a href="url">` |

---

### `LinkTarget`

| Value | Condition |
|---|---|
| `LinkTarget.ExternalPage` | `http(s)://` URL without a resource file extension |
| `LinkTarget.ExternalResource` | `http(s)://` URL with a resource file extension (image, pdf, zip, …) |
| `LinkTarget.LocalResource` | Relative path with no scheme |
| `LinkTarget.InPageAnchor` | Starts with `#` |
| `LinkTarget.Other` | `mailto:`, `ftp:`, empty, or other schemes |

---

### `DetectType`

| Value | Description |
|---|---|
| `DetectType.Accessible` | Check if the local file is readable |
| `DetectType.ExternalRefs` | Find other Markdown files that reference the same local asset |

---

## Low-level API: `extractLinks`

The underlying parser is also exported for direct use:

```js
import { extractLinks } from 'link-harvester';

const links = await extractLinks('/absolute/path/to/file.md');
// → ExtractedLink[]
```

## License

[MIT](https://github.com/isaaxite/link-harvester/blob/main/LICENSE) © [isaaxite](https://github.com/isaaxite)
