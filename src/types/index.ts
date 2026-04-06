import { REST_KEY } from "../constants";

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

export enum OpDescriptorType {
  Gather = 'gather',
  Filfer = 'filter',
  Classify = 'classify',
  DetectExternalRefs = 'detectExternalRefs',
}

export type FilterPredicate = (item: ExtractedLink) => boolean;

export type OpGatherDescriptor = { type: OpDescriptorType.Gather };

export type OpFilterDescriptor = { type: OpDescriptorType.Filfer; predicate: FilterPredicate };

export type ClassifyBuckets = Record<string, FilterPredicate | typeof REST_KEY>;

export type OpClassifyDescriptor = { type: OpDescriptorType.Classify; buckets: ClassifyBuckets };

export type OpDetectExternalRefsDescriptor = { type: OpDescriptorType.DetectExternalRefs; keys: string[] | null };

export type OpDescriptor = OpGatherDescriptor | OpFilterDescriptor | OpClassifyDescriptor | OpDetectExternalRefsDescriptor;

export type State = 'extractLinks' | 'classifyLinks';

export type ThenParam<TState> = TState extends 'extractLinks'
  ? ExtractedLink[]
  : { [key: string]: ExtractedLink[] };

export type RestKey<T> = {
  [K in keyof T]: T[K] extends  typeof REST_KEY ? K : never;
}[keyof T];

export type NonRestKeys<T> = {
  [K in keyof T]: T[K] extends  typeof REST_KEY ? never : K;
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
