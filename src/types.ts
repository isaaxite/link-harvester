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

export function isLinkType(type: LinkType): type is LinkType {
  return [
    LinkType.HtmlAnchor,
    LinkType.HtmlImage,
    LinkType.MarkdownImage,
    LinkType.MarkdownLink,
  ].includes(type);
}

export function isLinkTarget(type: LinkTarget): type is LinkTarget {
  return [
    LinkTarget.ExternalPage,
    LinkTarget.ExternalResource,
    LinkTarget.InPageAnchor,
    LinkTarget.LocalResource,
    LinkTarget.Other,
  ].includes(type);
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

export enum OpDescriptorType {
  Gather = 'gather',
  Filfer = 'filter',
  Classify = 'classify',
  DetectExternalRefs = 'detectExternalRefs',
}

export type FilterPredicate = (item: ExtractedLink) => boolean;

export type OpGatherDescriptor = { type: OpDescriptorType.Gather };

export type OpFilterDescriptor = { type: OpDescriptorType.Filfer; predicate: FilterPredicate };

export type ClassifyBuckets = Record<string, FilterPredicate | 'rest'>;

export type OpClassifyDescriptor = { type: OpDescriptorType.Classify; buckets: ClassifyBuckets };

export type OpDetectExternalRefsDescriptor = { type: OpDescriptorType.DetectExternalRefs; keys: string[] | null };

export type OpDescriptor = OpGatherDescriptor | OpFilterDescriptor | OpClassifyDescriptor | OpDetectExternalRefsDescriptor;

export function isOpGatherDescriptor(op: OpDescriptor): op is OpGatherDescriptor {
  return op.type === OpDescriptorType.Gather;
}

export function isOpFilterDescriptor(op: OpDescriptor): op is OpFilterDescriptor {
  return op.type === OpDescriptorType.Filfer;
}

export function isOpClassifyDescriptor(op: OpDescriptor): op is OpClassifyDescriptor {
  return op.type === OpDescriptorType.Classify;
}

export function isOpDetectExternalRefsDescriptor(op: OpDescriptor): op is OpDetectExternalRefsDescriptor {
  return op.type === OpDescriptorType.DetectExternalRefs;
}

export type State = 'extractLinks' | 'classifyLinks';

export type ThenParam<TState> = TState extends 'extractLinks'
  ? ExtractedLink[]
  : { [key: string]: ExtractedLink[] };

export type RestKey<T> = {
  [K in keyof T]: T[K] extends 'rest' ? K : never;
}[keyof T];

export type NonRestKeys<T> = {
  [K in keyof T]: T[K] extends 'rest' ? never : K;
}[keyof T];

export type InferClassifyResult<T> = Prettify<
  {
    [K in NonRestKeys<T>]: ExtractedLink[];
  } & {
    [K in RestKey<T>]: ExtractedLink[];
  }
>;

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export interface PipelineShared {
  ops: OpDescriptor[];
  base: string;
  filePath: string;
  _resolve: (value: any) => void;
  _promise: Promise<any>;
  _pending: boolean;
}

export interface LinkHarvesterProps {
  base: string;
  filePath: string;
}
