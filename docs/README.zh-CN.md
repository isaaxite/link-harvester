# link-harvester

一个用于从 Markdown 文件中提取、过滤和分类链接的 Node.js 库。基于流式 Pipeline API 设计，支持所有常见的 Markdown 与 HTML 链接语法，并可检测本地资源在其他 Markdown 文件中的跨文件引用关系。

[English](../README.md)

---

## 特性

- 提取全部四种链接类型：Markdown 链接、Markdown 图片、HTML `<a>` 标签、HTML `<img>` 标签
- 对每条链接的目标进行分类：外部页面、外部资源、本地资源、页内锚点、其他
- 流畅的链式 Pipeline：`gather → filter / filterBy → classify / classifyBy → detectExternalRefs`
- 跨文件引用检测——找出哪些其他 Markdown 文件引用了同一个本地资源
- filter 与 classify 合并为单次循环执行，无中间数组，减少不必要的遍历
- ESM + CJS 双格式输出，附完整 TypeScript 类型声明
- 要求 Node.js ≥ 18

---

## 安装

```bash
npm install link-harvester
```

---

## 快速开始

```js
import { LinkHarvester, LinkType, LinkTarget } from 'link-harvester';

const harvester = new LinkHarvester({
  base: '/项目的绝对路径',
  filePath: 'docs/guide.md',   // 相对于 base 的路径，或绝对路径
});

// 获取全部链接
const links = await harvester.gather();

// 只保留本地资源链接
const localLinks = await harvester.gather().filterBy(LinkTarget.LocalResource);

// 按图片 / 其他分类
const { images, rest } = await harvester.gather().classify({
  images: (l) => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
  rest: 'rest',
});

// 检测哪些其他文件也引用了相同的本地资源
const result = await harvester
  .gather()
  .filterBy(LinkTarget.LocalResource)
  .classify({ docs: (l) => l.url.endsWith('.md'), rest: 'rest' })
  .on('docs')
  .detectExternalRefs();

for (const item of result.docs) {
  console.log(item.url, '← 被以下文件引用：', item.externalRefs);
}
```

---

## API

### `new LinkHarvester(props)`

创建一个新的 Harvester 实例。

| 参数 | 类型 | 说明 |
|---|---|---|
| `props.base` | `string` | 项目根目录的**绝对**路径 |
| `props.filePath` | `string` | 目标 Markdown 文件路径——相对于 `base` 的相对路径，或绝对路径（必须位于 `base` 内部） |

以下情况会抛出 `Error`：`base` 不是绝对路径、目录不存在、`filePath` 无法在 `base` 下解析。

---

### `.gather()` → `LinkDataPipeline`

读取目标文件并提取所有链接。每条 Pipeline 链的第一个调用必须是 `gather()`。执行被异步调度——对返回的 Pipeline 进行 `await` 时结果才会被 resolve。

```js
const links = await harvester.gather();
// links: ExtractedLink[]
```

---

### `.filter(predicate)` → `LinkDataPipeline`

保留使 `predicate(link)` 返回 `true` 的链接。多个 `.filter()` 调用会被合并为一次 AND 过滤。

```js
const links = await harvester.gather().filter((l) => l.line > 10);
```

若 `predicate` 不是函数，抛出 `TypeError`。

---

### `.filterBy(type)` → `LinkDataPipeline`

按 `LinkType` 或 `LinkTarget` 枚举值进行快捷过滤。

```js
import { LinkType, LinkTarget } from 'link-harvester';

await harvester.gather().filterBy(LinkType.MarkdownImage);
await harvester.gather().filterBy(LinkTarget.ExternalPage);
```

若 `type` 不是合法的 `LinkType` 或 `LinkTarget`，抛出 `TypeError`。

**`LinkType` 取值**

| 值 | 说明 |
|---|---|
| `LinkType.MarkdownLink` | `[文字](url)` |
| `LinkType.MarkdownImage` | `![alt](url)` |
| `LinkType.HtmlImage` | `<img src="…">` |
| `LinkType.HtmlAnchor` | `<a href="…">` |

**`LinkTarget` 取值**

| 值 | 说明 |
|---|---|
| `LinkTarget.ExternalPage` | `https://…` 且不带已知资源后缀 |
| `LinkTarget.ExternalResource` | `https://…` 且带资源后缀（`.png`、`.pdf` 等） |
| `LinkTarget.LocalResource` | 无 scheme 的相对路径或根相对路径 |
| `LinkTarget.InPageAnchor` | 以 `#` 开头 |
| `LinkTarget.Other` | `mailto:`、`ftp:`、空 URL 等 |

---

### `.classify(buckets)` → `ClassificationPipeline`

将链接分组到命名桶中。每个 key 对应一个断言函数，或特殊字符串 `'rest'`。不匹配任何断言的链接会落入 `rest` 桶。

```js
const { images, links, rest } = await harvester.gather().classify({
  images: (l) => l.type === LinkType.MarkdownImage || l.type === LinkType.HtmlImage,
  links:  (l) => l.type === LinkType.MarkdownLink  || l.type === LinkType.HtmlAnchor,
  rest: 'rest',
});
```

**入参校验**——以下情况抛出 `TypeError`：
- `buckets` 不是普通对象
- `buckets` 为空对象
- 超过一个值为字符串 `'rest'`
- 某个值既不是函数也不是 `'rest'`

---

### `.classifyBy(ClassifyType.IfAccessable)` → `ClassificationPipeline`

内置分类：检测每条本地资源链接所指向的文件是否在磁盘上实际存在且可读。

```js
import { ClassifyType } from 'link-harvester';

const { accessible, invalid } = await harvester
  .gather()
  .classifyBy(ClassifyType.IfAccessable);
```

结果桶：`accessible`（磁盘上可读的本地文件）和 `invalid`（文件不存在，以及所有非本地链接）。

---

### `.on(key).detectExternalRefs()` → `ThenPipeline`

在 `.classify()` 之后，先调用 `.on(bucketKey)` 选择一个桶，再调用 `.detectExternalRefs()`——它会扫描 `base` 下所有其他 Markdown 文件，并为每条匹配项附上 `externalRefs: string[]` 字段，列出引用了同一本地资源的所有其他文件路径。

```js
const result = await harvester
  .gather()
  .classify({ assets: (l) => l.linkTarget === LinkTarget.LocalResource, rest: 'rest' })
  .on('assets')
  .detectExternalRefs();

for (const item of result.assets) {
  console.log(item.url, '同样被以下文件引用：', item.externalRefs);
}
```

---

### `.detectExternalRefs()`（在 `ClassificationPipeline` 上）→ `ThenPipeline`

与上方相同，但会对所有桶进行扫描。此形式下跨文件引用计算照常运行，但结果不会附加到 `data.externalRefs`——如需将引用结果附加到数据，请使用 `.on(key).detectExternalRefs()`。

---

### `extractLinks(filePath)` → `Promise<ExtractedLink[]>`

底层函数，同样直接导出。解析单个 Markdown 文件并返回全部提取到的链接，不经过任何 Pipeline。

```js
import { extractLinks } from 'link-harvester';

const links = await extractLinks('/绝对路径/file.md');
```

---

## `ExtractedLink` 结构

```ts
interface ExtractedLink {
  type:        LinkType;      // 链接的语法类型
  linkTarget:  LinkTarget;    // 链接目标的语义分类
  syntax:      string;        // 完整匹配文本，如 "![alt](./img.png)"
  url:         string;        // 提取出的 URL 或路径
  line:        number;        // 在源文件中的行号（从 1 开始）
  alt?:        string;        // 仅 MarkdownImage 有此字段
  text?:       string;        // 仅 MarkdownLink 有此字段
  externalRefs?: string[];    // 由 detectExternalRefs() 填充
}
```

---

## 许可证

MIT © [isaaxite](https://github.com/isaaxite)
