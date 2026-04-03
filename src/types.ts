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
  linkTarget: LinkTarget;
  syntax: string;
  url: string;
  line: number;
  alt?: string; // For markdown images
  text?: string; // For markdown links
  externalRefs?: string[];
}

export type AccessibleLinkData = ExtractedLink & { absolute: string };

export type AccessibleLinkDataWithRef = AccessibleLinkData & { externalRefs: string[] };

export type CategorizedLinkedData = ExtractedLink & { linkTarget: LinkTarget };

export enum ClassifyType {
  IfAccessable = 'if_accessable',
}

export type FilterPredicate = (item: ExtractedLink) => boolean;

export type OpFilterDescriptor = { type: 'filter';   predicate: FilterPredicate };

export type OpClassifyDescriptor = { type: 'classify'; buckets: Record<string, FilterPredicate | 'rest'> };

export type OpDetectExternalRefsDescriptor = { type: 'detectExternalRefs'; keys: string[] | null };

export type OpDescriptor = OpFilterDescriptor | OpClassifyDescriptor | OpDetectExternalRefsDescriptor;

export type State = 'array' | 'object';

export type ThenParam<TState> = TState extends 'array'
  ? ExtractedLink[]
  : { [key: string]: ExtractedLink[] };
