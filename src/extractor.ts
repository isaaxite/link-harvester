import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { ExtractedLink, LinkType } from "./types";

/**
 * Extracts resource links from a markdown file.
 * Supports markdown links, markdown images, HTML img tags, and HTML anchor tags.
 * @param filePath - The path to the markdown file to extract links from.
 * @returns An array of extracted links with their type, syntax, URL, line number, and optional alt/text.
 */
export async function extractResourceLinks(filePath: string) {
  const links: Array<ExtractedLink> = [];
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  let lineNumber = 0;
  
  for await (const line of rl) {
    lineNumber++;
    
    // Check markdown image syntax: ![]()
    let match;
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    while ((match = imgRegex.exec(line)) !== null) {
      links.push({
        type: LinkType.MarkdownImage,
        syntax: match[0],
        alt: match[1],
        url: match[2],
        line: lineNumber,
      });
    }
    
    // Check markdown link syntax: []()
    const linkRegex = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
    while ((match = linkRegex.exec(line)) !== null) {
      links.push({
        type: LinkType.MarkdownLink,
        syntax: match[0],
        text: match[1],
        url: match[2],
        line: lineNumber,
      });
    }
    
    // Check HTML img tag
    const imgHtmlRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((match = imgHtmlRegex.exec(line)) !== null) {
      links.push({
        type: LinkType.HtmlImage,
        syntax: match[0],
        url: match[1],
        line: lineNumber,
      });
    }
    
    // Check HTML a tag
    const aHtmlRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    while ((match = aHtmlRegex.exec(line)) !== null) {
      links.push({
        type: LinkType.HtmlAnchor,
        syntax: match[0],
        url: match[1],
        line: lineNumber,
      });
    }
  }
  
  return links;
}
