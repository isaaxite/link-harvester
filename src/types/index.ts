import { REST_KEY } from "../constants";

/**
 * Enum representing the syntax type of a link in markdown/HTML
 */
export enum LinkType {
  MarkdownLink = 'markdown_link',
  MarkdownImage = 'markdown_image',
  HtmlImage = 'html_image',
  HtmlAnchor = 'html_anchor',
}

/**
 * Enum representing the target category of a link URL
 */
export enum LinkTarget {
  ExternalPage = 'external_page',
  ExternalResource = 'external_resource',
  LocalResource = 'local_resource',
  InPageAnchor = 'in_page_anchor',
  Other = 'other',
}

/**
 * Union type of all possible extracted link structures
 */
export type ExtractedLink = ExtractedHtmlLink | MarkdownImageLink | MarkdownLink;

/**
 * Base interface for extracted HTML links
 */
export interface ExtractedHtmlLink {
  type: LinkType;
  linkTarget: LinkTarget;
  syntax: string;
  url: string;
  line: number;
  accessible?: boolean;
  externalRefs?: string[];
}

/**
 * Extracted markdown image link with alt text
 */
export type MarkdownImageLink = ExtractedHtmlLink & {
  alt: string; // For markdown images
}

/**
 * Extracted markdown link with link text
 */
export type MarkdownLink = ExtractedHtmlLink & {
  text: string; // For markdown links
}

/**
 * Enum for available detection types
 */
export enum DetectType {
  ExternalRefs = 'external_refs',
  Accessible = 'accessible',
}

/**
 * Enum for operation descriptor types in the pipeline
 */
export enum OpDescriptorType {
  Gather = 'gather',
  Filter = 'filter',
  Classify = 'classify',
  DetectAccessible = 'detect_accessible',
  DetectExternalRefs = 'detect_external_refs',
}

/**
 * Predicate function type for filtering extracted links
 */
export type FilterPredicate = (item: ExtractedLink) => boolean;

/**
 * Operation descriptor for the gather (extraction) operation
 */
export type OpGatherDescriptor = { type: OpDescriptorType.Gather };

/**
 * Operation descriptor for filter operations
 */
export type OpFilterDescriptor = { type: OpDescriptorType.Filter; predicate: FilterPredicate };

/**
 * Configuration type for classification buckets
 * Maps bucket names to either predicate functions or the REST_KEY
 */
export type ClassifyBuckets = Record<string, FilterPredicate | typeof REST_KEY>;

/**
 * Operation descriptor for classification operations
 */
export type OpClassifyDescriptor = { type: OpDescriptorType.Classify; buckets: ClassifyBuckets };

/**
 * Operation descriptor for external references detection
 */
export type OpDetectExternalRefsDescriptor = { type: OpDescriptorType.DetectExternalRefs; keys: string[] | null };

/**
 * Operation descriptor for accessibility detection
 */
export type OpDetectAccessibleDescriptor = { type: OpDescriptorType.DetectAccessible };

/**
 * Union type of all possible operation descriptors
 */
export type OpDescriptor = OpGatherDescriptor | OpFilterDescriptor | OpClassifyDescriptor | OpDetectExternalRefsDescriptor | OpDetectAccessibleDescriptor;

/**
 * Pipeline state type
 */
export type State = 'extractLinks' | 'classifyLinks';

/**
 * Return type for pipeline then method based on current state
 */
export type ThenParam<TState> = TState extends 'extractLinks'
  ? ExtractedLink[]
  : { [key: string]: ExtractedLink[] };

/**
 * Helper type to extract the REST_KEY bucket name from a classification config
 */
type RestKey<T> = {
  [K in keyof T]: T[K] extends typeof REST_KEY ? K : never;
}[keyof T];

/**
 * Helper type to extract non-REST_KEY bucket names from a classification config
 */
type NonRestKeys<T> = {
  [K in keyof T]: T[K] extends typeof REST_KEY ? never : K;
}[keyof T];

/**
 * Infers the result type of a classification operation
 * Maps bucket names to arrays of ExtractedLink
 */
export type InferClassifyResult<T> = Prettify<
  {
    [K in NonRestKeys<T>]: ExtractedLink[];
  } & {
    [K in RestKey<T>]: ExtractedLink[];
  }
>;

/**
 * Utility type to prettify complex type intersections for better IDE display
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Shared state passed between pipeline instances
 */
export interface PipelineShared {
  ops: OpDescriptor[];
  base: string;
  filePath: string;
  _resolve: (value: any) => void;
  _promise: Promise<any>;
  _pending: boolean;
}

/**
 * Configuration properties for creating a LinkHarvester instance
 */
export interface LinkHarvesterProps {
  base: string;
  filePath: string;
}
