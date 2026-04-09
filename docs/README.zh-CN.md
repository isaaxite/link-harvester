# link-harvester

> 📖 [English README](https://github.com/isaaxite/link-harvester/blob/main/README.md)

<div align="left">
  <p>一个用于从 Markdown 文件中提取、过滤和分类链接的 Node.js 库。基于流式 Pipeline API 设计，支持所有常见的 Markdown 与 HTML 链接语法，并可检测本地资源在其他 Markdown 文件中的跨文件引用关系。</p>
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

## 特性

- 提取 Markdown 链接、Markdown 图片、HTML `<a>` 锚点、HTML `<img>` 标签
- 自动分类链接目标：外部页面、外部资源、本地资源、页内锚点、其他
- 流式管道 API：`gather → filter / detect → classify`
- 内置 `detect(Accessible)` — 检测本地文件是否真实存在且可读
- 内置 `detect(ExternalRefs)` — 扫描同一 `base` 目录下其他 Markdown 文件，找出引用了相同本地资源的文件列表
- 自动管道优化：重复的 `detect` 操作会被去重，连续的 `filter` 操作会被合并为单次 AND 检查

---

## 运行环境

- Node.js ≥ 18.0.0

---

## 安装

```bash
npm install link-harvester
```

---

## 快速上手

```js
import { LinkHarvester, LinkType, LinkTarget, DetectType, REST_KEY } from 'link-harvester';
import { resolve } from 'node:path';

const harvester = new LinkHarvester({
  base: resolve('./docs'),   // 根目录的绝对路径
  filePath: 'guide/intro.md' // 目标文件的相对路径（或绝对路径）
});

// 提取文件中的所有链接
const links = await harvester.gather();
console.log(links);
```

---

## API

### `new LinkHarvester({ base, filePath })`

创建一个针对单个 Markdown 文件的 harvester 实例。

| 参数 | 类型 | 说明 |
|---|---|---|
| `base` | `string` | 根目录的**绝对路径**。用于解析相对文件路径，以及限定跨引用扫描的范围。 |
| `filePath` | `string` | 目标 Markdown 文件的路径，可以是相对于 `base` 的相对路径，也可以是绝对路径（必须位于 `base` 内部）。 |

以下情况会抛出 `Error`：
- `base` 不是字符串、不是绝对路径或目录不存在
- `filePath` 不是字符串、文件不存在或位于 `base` 之外

---

### `.gather()` → `LinkDataPipeline`

读取并解析目标文件，必须是管道链的第一个调用。返回 `LinkDataPipeline` 供后续操作使用。

```js
const links = await harvester.gather();
// → ExtractedLink[]
```

---

### `.filter(predicate)` → `LinkDataPipeline`

只保留 `predicate(link)` 返回 `true` 的链接。多次调用 `.filter()` 会被合并为单次 AND 检查。

```js
const links = await harvester
  .gather()
  .filter(l => l.linkTarget === LinkTarget.LocalResource);
```

`predicate` 不是函数时抛出 `TypeError`。

---

### `.filterBy(type)` → `LinkDataPipeline`

按 `LinkType` 或 `LinkTarget` 枚举值过滤的快捷方式。

```js
// 按链接类型
await harvester.gather().filterBy(LinkType.MarkdownImage);

// 按链接目标
await harvester.gather().filterBy(LinkTarget.ExternalPage);
```

传入未知值时抛出 `TypeError`。

---

### `.detect(detectType)` → `LinkDataPipeline`

对每条 `ExtractedLink` 运行检测，写入额外字段。仅对 `LocalResource` 类型的链接生效。

| `detectType` | 效果 |
|---|---|
| `DetectType.Accessible` | 设置 `link.accessible: boolean`，`true` 表示文件存在且可读。 |
| `DetectType.ExternalRefs` | 设置 `link.externalRefs: string[]`，内容为 `base` 目录下引用了同一本地资源的其他 `.md`/`.markdown` 文件的相对路径列表。 |

```js
import { DetectType } from 'link-harvester';

// 检测文件是否可访问
const links = await harvester
  .gather()
  .detect(DetectType.Accessible);

// 查找跨文件引用
const links = await harvester
  .gather()
  .detect(DetectType.ExternalRefs);
```

传入未知 `detectType` 时抛出 `TypeError`。

---

### `.classify(buckets)` → `ThenPipeline`

将链接按规则分配到具名桶中。返回 `ThenPipeline`（可 `await`，不可继续链式调用）。

`buckets` 中每个值必须是：
- 谓词函数 `(link: ExtractedLink) => boolean`，或
- `REST_KEY` 常量（值为字符串 `"rest"`）——收集所有未被其他桶匹配的链接。

最多只能有一个桶使用 `REST_KEY`。

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
console.log(result.rest);   // ExtractedLink[]（其余所有链接）
```

以下情况抛出 `TypeError`：
- `buckets` 不是普通对象
- `buckets` 为空对象
- 超过一个桶使用了 `REST_KEY`
- 某个桶的值既不是函数也不是 `REST_KEY`

---

## 管道组合

操作可以在 `.classify()` 终结链之前自由组合。

```
gather()
  → .filter()       任意次，自动合并为单次 AND 谓词
  → .detect()       任意次，重复调用自动去重
  → .filterBy()     .filter() 的枚举值快捷方式
  → .classify()     可选终结操作，结果切换为 Record<string, ExtractedLink[]>
```

### 示例

**先过滤再分类**

```js
const result = await harvester
  .gather()
  .filter(l => l.type === LinkType.MarkdownImage || l.type === LinkType.MarkdownLink)
  .classify({
    images: l => l.type === LinkType.MarkdownImage,
    rest: REST_KEY,
  });
```

**检测可访问性，再过滤出失效链接**

```js
const broken = await harvester
  .gather()
  .detect(DetectType.Accessible)
  .filter(l => l.linkTarget === LinkTarget.LocalResource && l.accessible === false);
```

**找出被其他文件引用的共享资源**

```js
const shared = await harvester
  .gather()
  .filter(l => l.linkTarget === LinkTarget.LocalResource)
  .detect(DetectType.ExternalRefs)
  .filter(l => l.externalRefs.length > 0);
```

**完整管道：过滤 → 检测 → 分类**

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

## 数据类型

### `ExtractedLink`

所有提取到的链接均包含以下字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `LinkType` | 链接的语法类型 |
| `linkTarget` | `LinkTarget` | URL 目标分类 |
| `url` | `string` | 原始 URL 字符串 |
| `syntax` | `string` | 完整的匹配语法片段 |
| `line` | `number` | 在源文件中的行号（从 1 开始） |
| `accessible` | `boolean \| undefined` | 由 `detect(Accessible)` 设置，仅限 `LocalResource` 链接 |
| `externalRefs` | `string[] \| undefined` | 由 `detect(ExternalRefs)` 设置，仅限 `LocalResource` 链接 |

Markdown 专属子类型额外包含：

| 子类型 | 额外字段 | 说明 |
|---|---|---|
| `MarkdownLink` | `text: string` | 链接显示文本 |
| `MarkdownImageLink` | `alt: string` | 图片 alt 文本 |

---

### `LinkType`

| 值 | 对应语法 |
|---|---|
| `LinkType.MarkdownLink` | `[text](url)` |
| `LinkType.MarkdownImage` | `![alt](url)` |
| `LinkType.HtmlImage` | `<img src="url">` |
| `LinkType.HtmlAnchor` | `<a href="url">` |

---

### `LinkTarget`

| 值 | 判断条件 |
|---|---|
| `LinkTarget.ExternalPage` | `http(s)://` 开头，且扩展名不属于资源类型 |
| `LinkTarget.ExternalResource` | `http(s)://` 开头，且扩展名属于资源类型（图片、pdf、zip 等） |
| `LinkTarget.LocalResource` | 无协议的相对路径 |
| `LinkTarget.InPageAnchor` | 以 `#` 开头 |
| `LinkTarget.Other` | `mailto:`、`ftp:`、空字符串或其他协议 |

---

### `DetectType`

| 值 | 说明 |
|---|---|
| `DetectType.Accessible` | 检测本地文件是否可读 |
| `DetectType.ExternalRefs` | 查找引用了同一本地资源的其他 Markdown 文件 |

---

## 底层 API：`extractLinks`

底层解析器也对外导出，可直接使用：

```js
import { extractLinks } from 'link-harvester';

const links = await extractLinks('/absolute/path/to/file.md');
// → ExtractedLink[]
```

---

## 许可证

[MIT](https://github.com/isaaxite/link-harvester/blob/main/LICENSE) © [isaaxite](https://github.com/isaaxite)
