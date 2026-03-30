export enum LinkType {
  MarkdownLink = 'markdown_link',
  MarkdownImage = 'markdown_image',
  HtmlImage = 'html_image',
  HtmlAnchor = 'html_anchor',
}

export enum LinkTarget {
  ExternalPage = 'external_page',
  ExternalResource = 'external_resource',
  LocalResource = 'local_resource',
  InPageAnchor = 'in_page_anchor',
  Other = 'other',
}

export interface ExtractedLink {
  type: LinkType;
  syntax: string;
  url: string;
  line: number;
  alt?: string; // For markdown images
  text?: string; // For markdown links
}

export type AccessibleLinkData = ExtractedLink & { absolute: string };

export type AccessibleLinkDataWithRef = AccessibleLinkData & { externalRefs: string[] };

export type ClassifyLinkData = ExtractedLink & { linkTarget: LinkTarget };
