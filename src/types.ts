export enum LinkType {
  MarkdownLink = 'markdown-link',
  MarkdownImage = 'markdown-image',
  HtmlImage = 'html-img',
  HtmlAnchor = 'html-anchor',
}

export interface ExtractedLink {
  type: LinkType;
  syntax: string;
  url: string;
  line: number;
  alt?: string; // For markdown images
  text?: string; // For markdown links
}

export enum LinkTarget {
  EXTERNAL_PAGE = 'external_page',
  EXTERNAL_RESOURCE = 'external_resource',
  LOCAL_RESOURCE = 'local_resource',
  IN_PAGE_ANCHOR = 'in_page_anchor',
  OTHER = 'other',
}

export type AccessibleLinkData = ExtractedLink & { absolute: string };

export type AccessibleLinkDataWithRef = AccessibleLinkData & { externalRefs: string[] };

export type ClassifyLinkData = ExtractedLink & { linkTarget: LinkTarget };
