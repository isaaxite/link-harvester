import test from "ava";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractResourceLinks } from "../dist/extractor/index.mjs";
import { LinkType } from "../dist/extractor/types.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixtures = join(__dirname, "fixtures");
const fix = (name) => join(fixtures, name);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function withTempFile(content, fn) {
  const path = join(fixtures, `_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.md`);
  await writeFile(path, content, "utf8");
  try {
    return await fn(path);
  } finally {
    await unlink(path).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// 1. Empty / no-link files
// ---------------------------------------------------------------------------
test("returns empty array for an empty file", async (t) => {
  const result = await extractResourceLinks(fix("empty.md"));
  t.deepEqual(result, []);
});

test("returns empty array when file has no links", async (t) => {
  const result = await extractResourceLinks(fix("no-links.md"));
  t.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// 2. Markdown images  ![]()
// ---------------------------------------------------------------------------
test("extracts markdown image with alt text", async (t) => {
  const result = await extractResourceLinks(fix("md-images.md"));
  const first = result.find((l) => l.url === "https://example.com/image.png");
  t.truthy(first);
  t.is(first.type, LinkType.MarkdownImage);
  t.is(first.alt, "Alt text");
  t.is(first.syntax, "![Alt text](https://example.com/image.png)");
  t.is(first.line, 1);
});

test("extracts markdown image with empty alt text", async (t) => {
  const result = await extractResourceLinks(fix("md-images.md"));
  const noAlt = result.find((l) => l.url === "https://example.com/no-alt.jpg");
  t.truthy(noAlt);
  t.is(noAlt.alt, "");
  t.is(noAlt.line, 2);
});

test("extracts markdown image with relative path", async (t) => {
  const result = await extractResourceLinks(fix("md-images.md"));
  const local = result.find((l) => l.url === "./local/logo.svg");
  t.truthy(local);
  t.is(local.type, LinkType.MarkdownImage);
  t.is(local.alt, "Logo");
  t.is(local.line, 3);
});

test("does not set text field on markdown images", async (t) => {
  const result = await extractResourceLinks(fix("md-images.md"));
  const imgs = result.filter((l) => l.type === LinkType.MarkdownImage);
  t.true(imgs.length > 0);
  imgs.forEach((img) => t.false("text" in img));
});

// ---------------------------------------------------------------------------
// 3. Markdown links  []()
// ---------------------------------------------------------------------------
test("extracts markdown link with text", async (t) => {
  const result = await extractResourceLinks(fix("md-links.md"));
  const link = result.find((l) => l.url === "https://example.com");
  t.truthy(link);
  t.is(link.type, LinkType.MarkdownLink);
  t.is(link.text, "Click here");
  t.is(link.syntax, "[Click here](https://example.com)");
  t.is(link.line, 1);
});

test("extracts markdown link with root-relative url", async (t) => {
  const result = await extractResourceLinks(fix("md-links.md"));
  const home = result.find((l) => l.url === "/");
  t.truthy(home);
  t.is(home.type, LinkType.MarkdownLink);
  t.is(home.text, "Home");
  t.is(home.line, 2);
});

test("extracts markdown link with relative file path", async (t) => {
  const result = await extractResourceLinks(fix("md-links.md"));
  const docs = result.find((l) => l.url === "./docs/index.md");
  t.truthy(docs);
  t.is(docs.type, LinkType.MarkdownLink);
  t.is(docs.line, 3);
});

test("does not set alt field on markdown links", async (t) => {
  const result = await extractResourceLinks(fix("md-links.md"));
  const mdLinks = result.filter((l) => l.type === LinkType.MarkdownLink);
  t.true(mdLinks.length > 0);
  mdLinks.forEach((l) => t.false("alt" in l));
});

// ---------------------------------------------------------------------------
// 4. Markdown image is NOT also classified as a markdown link
// ---------------------------------------------------------------------------
test("markdown image syntax is not duplicated as a markdown link", async (t) => {
  const result = await extractResourceLinks(fix("img-and-link.md"));
  const images = result.filter((l) => l.type === LinkType.MarkdownImage);
  const links = result.filter((l) => l.type === LinkType.MarkdownLink);
  t.is(images.length, 1);
  t.is(links.length, 1);
  t.is(images[0].url, "https://example.com/img.png");
  t.is(links[0].url, "https://example.com/page");
});

// ---------------------------------------------------------------------------
// 5. HTML <img> tags
// ---------------------------------------------------------------------------
test("extracts HTML img with double-quoted src", async (t) => {
  const result = await extractResourceLinks(fix("html-images.md"));
  const img = result.find((l) => l.url === "https://example.com/photo.jpg");
  t.truthy(img);
  t.is(img.type, LinkType.HtmlImage);
  t.is(img.line, 1);
  t.true(img.syntax.startsWith("<img"));
});

test("extracts HTML img with single-quoted src", async (t) => {
  const result = await extractResourceLinks(fix("html-images.md"));
  const img = result.find((l) => l.url === "./local/pic.png");
  t.truthy(img);
  t.is(img.type, LinkType.HtmlImage);
  t.is(img.line, 2);
});

test("extracts HTML img with uppercase tag (case-insensitive)", async (t) => {
  const result = await extractResourceLinks(fix("html-images.md"));
  const img = result.find((l) => l.url === "https://example.com/upper.gif");
  t.truthy(img);
  t.is(img.type, LinkType.HtmlImage);
  t.is(img.line, 3);
});

// ---------------------------------------------------------------------------
// 6. HTML <a> tags
// ---------------------------------------------------------------------------
test("extracts HTML anchor with double-quoted href", async (t) => {
  const result = await extractResourceLinks(fix("html-anchors.md"));
  const a = result.find((l) => l.url === "https://example.com");
  t.truthy(a);
  t.is(a.type, LinkType.HtmlAnchor);
  t.is(a.line, 1);
  t.true(a.syntax.startsWith("<a"));
});

test("extracts HTML anchor with single-quoted href", async (t) => {
  const result = await extractResourceLinks(fix("html-anchors.md"));
  const a = result.find((l) => l.url === "./page.html");
  t.truthy(a);
  t.is(a.type, LinkType.HtmlAnchor);
  t.is(a.line, 2);
});

test("extracts HTML anchor with uppercase tag (case-insensitive)", async (t) => {
  const result = await extractResourceLinks(fix("html-anchors.md"));
  const a = result.find((l) => l.url === "https://example.com/upper");
  t.truthy(a);
  t.is(a.type, LinkType.HtmlAnchor);
  t.is(a.line, 3);
});

// ---------------------------------------------------------------------------
// 7. Mixed link types in one file
// ---------------------------------------------------------------------------
test("extracts all four link types from a mixed file", async (t) => {
  const result = await extractResourceLinks(fix("mixed.md"));
  const types = result.map((l) => l.type);
  t.true(types.includes(LinkType.MarkdownImage));
  t.true(types.includes(LinkType.MarkdownLink));
  t.true(types.includes(LinkType.HtmlImage));
  t.true(types.includes(LinkType.HtmlAnchor));
});

test("preserves insertion order (MarkdownImage before MarkdownLink on same pass)", async (t) => {
  const result = await extractResourceLinks(fix("mixed.md"));
  const mdImg = result.findIndex((l) => l.type === LinkType.MarkdownImage);
  const mdLink = result.findIndex((l) => l.type === LinkType.MarkdownLink);
  t.true(mdImg < mdLink);
});

// ---------------------------------------------------------------------------
// 8. Multiple links on the same line
// ---------------------------------------------------------------------------
test("extracts multiple markdown images on same line", async (t) => {
  const result = await extractResourceLinks(fix("multiple-same-line.md"));
  const imgs = result.filter((l) => l.type === LinkType.MarkdownImage && l.line === 1);
  t.is(imgs.length, 2);
  const urls = imgs.map((l) => l.url);
  t.true(urls.includes("https://a.com/1.png"));
  t.true(urls.includes("https://b.com/2.png"));
});

test("extracts multiple markdown links on same line", async (t) => {
  const result = await extractResourceLinks(fix("multiple-same-line.md"));
  const links = result.filter((l) => l.type === LinkType.MarkdownLink && l.line === 2);
  t.is(links.length, 2);
  const urls = links.map((l) => l.url);
  t.true(urls.includes("https://a.com"));
  t.true(urls.includes("https://b.com"));
});

test("extracts multiple HTML img tags on same line", async (t) => {
  const result = await extractResourceLinks(fix("multiple-same-line.md"));
  const imgs = result.filter((l) => l.type === LinkType.HtmlImage && l.line === 3);
  t.is(imgs.length, 2);
  const urls = imgs.map((l) => l.url);
  t.true(urls.includes("https://a.com/a.jpg"));
  t.true(urls.includes("https://b.com/b.jpg"));
});

test("extracts multiple HTML anchors on same line", async (t) => {
  const result = await extractResourceLinks(fix("multiple-same-line.md"));
  const anchors = result.filter((l) => l.type === LinkType.HtmlAnchor && l.line === 4);
  t.is(anchors.length, 2);
  const urls = anchors.map((l) => l.url);
  t.true(urls.includes("https://a.com"));
  t.true(urls.includes("https://b.com"));
});

// ---------------------------------------------------------------------------
// 9. Line number accuracy
// ---------------------------------------------------------------------------
test("line numbers are 1-based and accurate across multiple lines", async (t) => {
  const result = await extractResourceLinks(fix("md-images.md"));
  const lines = result.map((l) => l.line);
  t.deepEqual(lines, [1, 2, 3]);
});

test("line numbers reflect actual line position in mixed file", async (t) => {
  // mixed.md: line1=heading, line2=empty, line3=md-img, line4=empty, line5=md-link, line6=empty, line7=html-img, line8=empty, line9=html-anchor
  const result = await extractResourceLinks(fix("mixed.md"));
  const mdImg = result.find((l) => l.type === LinkType.MarkdownImage);
  const mdLink = result.find((l) => l.type === LinkType.MarkdownLink);
  const htmlImg = result.find((l) => l.type === LinkType.HtmlImage);
  const htmlA = result.find((l) => l.type === LinkType.HtmlAnchor);
  t.is(mdImg.line, 3);
  t.is(mdLink.line, 5);
  t.is(htmlImg.line, 7);
  t.is(htmlA.line, 9);
});

// ---------------------------------------------------------------------------
// 10. CRLF line endings
// ---------------------------------------------------------------------------
test("handles CRLF line endings correctly", async (t) => {
  const result = await extractResourceLinks(fix("crlf.md"));
  t.is(result.length, 2);
  t.is(result[0].type, LinkType.MarkdownImage);
  t.is(result[0].url, "https://example.com/img.png");
  t.is(result[0].line, 1);
  t.is(result[1].type, LinkType.MarkdownLink);
  t.is(result[1].url, "https://example.com");
  t.is(result[1].line, 2);
});

// ---------------------------------------------------------------------------
// 11. Result shape — required fields present on every link
// ---------------------------------------------------------------------------
test("every result has type, syntax, url, and line fields", async (t) => {
  const result = await extractResourceLinks(fix("mixed.md"));
  t.true(result.length > 0);
  for (const link of result) {
    t.truthy(link.type, `type missing on: ${JSON.stringify(link)}`);
    t.truthy(link.syntax, `syntax missing on: ${JSON.stringify(link)}`);
    t.truthy(link.url, `url missing on: ${JSON.stringify(link)}`);
    t.true(typeof link.line === "number" && link.line > 0, `bad line on: ${JSON.stringify(link)}`);
  }
});

test("syntax field matches the exact matched text in the source line", async (t) => {
  const result = await extractResourceLinks(fix("md-links.md"));
  const link = result.find((l) => l.url === "https://example.com");
  t.is(link.syntax, "[Click here](https://example.com)");
});

// ---------------------------------------------------------------------------
// 12. Edge cases via temp files
// ---------------------------------------------------------------------------
test("handles file with only whitespace lines (no links)", async (t) => {
  await withTempFile("   \n\t\n  \n", async (path) => {
    const result = await extractResourceLinks(path);
    t.deepEqual(result, []);
  });
});

test("does not extract reference-style links (not supported syntax)", async (t) => {
  await withTempFile("[link][ref]\n\n[ref]: https://example.com\n", async (path) => {
    const result = await extractResourceLinks(path);
    // reference-style links are not matched by the inline regex
    const mdLinks = result.filter((l) => l.type === LinkType.MarkdownLink);
    t.is(mdLinks.length, 0);
  });
});

test("extracts link with URL containing query string and hash", async (t) => {
  await withTempFile("[Search](https://example.com/search?q=test&page=2#results)\n", async (path) => {
    const result = await extractResourceLinks(path);
    t.is(result.length, 1);
    t.is(result[0].url, "https://example.com/search?q=test&page=2#results");
  });
});

test("extracts markdown image inline with surrounding text", async (t) => {
  await withTempFile("Before ![Icon](./icon.png) after text\n", async (path) => {
    const result = await extractResourceLinks(path);
    t.is(result.length, 1);
    t.is(result[0].type, LinkType.MarkdownImage);
    t.is(result[0].url, "./icon.png");
  });
});

test("extracts HTML img with additional attributes", async (t) => {
  await withTempFile('<img class="hero" src="https://example.com/hero.jpg" alt="Hero" loading="lazy">\n', async (path) => {
    const result = await extractResourceLinks(path);
    t.is(result.length, 1);
    t.is(result[0].type, LinkType.HtmlImage);
    t.is(result[0].url, "https://example.com/hero.jpg");
  });
});

test("extracts HTML anchor with additional attributes", async (t) => {
  await withTempFile('<a class="btn" href="https://example.com/cta" target="_blank" rel="noopener">CTA</a>\n', async (path) => {
    const result = await extractResourceLinks(path);
    t.is(result.length, 1);
    t.is(result[0].type, LinkType.HtmlAnchor);
    t.is(result[0].url, "https://example.com/cta");
  });
});

test("large file with many lines returns links on correct line numbers", async (t) => {
  const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`);
  lines[49] = "[Link at 50](https://example.com/50)";
  lines[149] = "![Image at 150](https://example.com/150.png)";
  await withTempFile(lines.join("\n") + "\n", async (path) => {
    const result = await extractResourceLinks(path);
    t.is(result.length, 2);
    const link = result.find((l) => l.type === LinkType.MarkdownLink);
    const img = result.find((l) => l.type === LinkType.MarkdownImage);
    t.is(link.line, 50);
    t.is(img.line, 150);
  });
});

test("single-line file with no newline is handled", async (t) => {
  await withTempFile("[No newline](https://example.com)", async (path) => {
    const result = await extractResourceLinks(path);
    t.is(result.length, 1);
    t.is(result[0].url, "https://example.com");
    t.is(result[0].line, 1);
  });
});

// ---------------------------------------------------------------------------
// 13. Error handling
// ---------------------------------------------------------------------------
test("rejects with an error when file does not exist", async (t) => {
  await t.throwsAsync(() => extractResourceLinks("/non/existent/path/file.md"));
});
