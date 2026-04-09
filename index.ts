import { extractLinks } from "./src/extractor";
import { dirname, isAbsolute, join, relative } from "node:path";
import { ClassifyBuckets, ExtractedLink, FilterPredicate, LinkTarget, LinkType, OpClassifyDescriptor, OpDescriptor, OpDescriptorType, State, ThenParam, InferClassifyResult, Prettify, PipelineShared, LinkHarvesterProps, DetectType } from "./src/types";
import { isOpGatherDescriptor, isLinkTarget, isLinkType } from "./src/types/assert";
import { isAccessible, optimizeOps, removeTrailSep } from "./src/utils";
import fg from 'fast-glob';
import { REST_KEY } from "./src/constants";

// Re-export public APIs
export { REST_KEY } from "./src/constants";
export { extractLinks } from './src/extractor';
export { LinkTarget, LinkType, DetectType, ExtractedLink, LinkHarvesterProps, ExtractedHtmlLink, MarkdownImageLink, MarkdownLink } from './src/types';

/**
 * Base pipeline class that handles link extraction, filtering, classification, and detection operations.
 * Manages the asynchronous processing flow and maintains shared state across pipeline stages.
 * @template TState - Current pipeline state ('extractLinks' or 'classifyLinks')
 */
class Pipeline<TState extends State = 'classifyLinks'> {
  private _resourceRefsCache: Record<string, string[]> = {};
  private dataList: ExtractedLink[] = [];
  private otherFilePaths: string[] | null = null;
  protected base!: string;
  protected filePath!: string;
  private _resolve!: (value: any) => void;
  protected _promise!: Promise<any>;
  private ops: any[] = [];
  private _pending: boolean = false;

  /**
   * Gets the shared pipeline state
   * @returns The shared pipeline properties
   */
  protected get _shared(): PipelineShared {
    return {
      ops: this.ops,
      base: this.base,
      filePath: this.filePath,
      _resolve: this._resolve,
      _promise: this._promise,
      _pending: this._pending,
    };
  }

  /**
   * Sets the shared pipeline state
   * @param props - The shared pipeline properties to set
   */
  protected set _shared(props: PipelineShared) {
    this.ops = props.ops;
    this.base = props.base;
    this.filePath = props.filePath;
    this._promise = props._promise;
    this._resolve = props._resolve;
    this._pending = props._pending;
  }

  /**
   * Lazy loads all markdown files in the base directory using fast-glob
   * @returns Array of markdown file paths relative to base directory
   */
  private _getOtherFilePaths() {
    if (!this.otherFilePaths) {
      this.otherFilePaths = fg.sync(`**/*.{md,markdown}`, {
        onlyFiles: true,
        cwd: this.base,
      });
    }
    return this.otherFilePaths;
  }

  /**
   * Adds an operation to the pipeline queue
   * @param op - The operation descriptor to add
   */
  protected _push(op: any) {
    this.ops.push(op);
  }

  /**
   * Schedules the pipeline processing to run in the next microtask tick
   * Prevents multiple concurrent schedules
   */
  protected _schedule() {
    if (this._pending) return;
    this._pending = true;
    Promise.resolve().then(() => {
      this._pending = false;
      this._flush();
    });
  }

  /**
   * Executes all queued operations and resolves the promise
   */
  private async _flush() {
    const result = await this._execute();
    this._resolve(result);
  }

  /**
   * Core execution logic that processes all pipeline operations in sequence
   * Handles link extraction, filtering, detection, and classification
   * @returns Processed results (either array or classified object)
   */
  private async _execute() {
    const gatherOp = this.ops[0];

    if (isOpGatherDescriptor(gatherOp)) {
      const absolute = join(this.base, this.filePath);
      this.dataList = await extractLinks(absolute);
    }
    if (this.ops.length === 1) {
      return this.dataList;
    }

    const ops = optimizeOps(this.ops.slice(1));
    const classifyIdx = ops.findIndex(op => op.type === OpDescriptorType.Classify);
    const hasExternalRefsDetect = () => ops.find(op => op.type === OpDescriptorType.DetectExternalRefs);
    let linearOps = ops;
    let result: ExtractedLink[] | Record<string, ExtractedLink[]> = [];
    let classifier: ((item: ExtractedLink) => string[]) | null = null;

    if (classifyIdx !== -1) {
      const classify = this._parseClassifyOps(ops.slice(classifyIdx));
      result = classify.init();
      classifier = classify.processor;
      linearOps = ops.slice(0, classifyIdx);
    }

    const {
      detectAccessible,
      detectExternalRefs,
      filter
    } = this._parseLinerOps(linearOps);

    if (hasExternalRefsDetect()) {
      await this._setResourceRefsCache();
    }

    for (let i = 0; i < this.dataList.length; i++) {
      const item = { ...this.dataList[i] };

      detectExternalRefs && detectExternalRefs(item);
      detectAccessible && detectAccessible(item);

      if (filter && !filter(item)) { continue; }

      if (classifier) {
        classifier(item).forEach(key => {
          (result as Record<string, ExtractedLink[]>)[key].push(item);
        });
      } else {
        (result as ExtractedLink[]).push(item);
      }
    }

    return result;
  }

  /**
   * Parses linear operations (detection and filtering) into executable functions
   * @param ops - Array of operation descriptors
   * @returns Object containing executable detection and filter functions
   */
  private _parseLinerOps(ops: OpDescriptor[]) {
    const dirPath = dirname(join(this.base, this.filePath));
    const result: {
      detectAccessible: ((it: ExtractedLink) => void) | null
      detectExternalRefs: ((it: ExtractedLink) => void) | null
      filter: FilterPredicate | null;
    } = {
      detectAccessible: null,
      detectExternalRefs: null,
      filter: null,
    };

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];

      if (op.type === OpDescriptorType.DetectAccessible) {
        /**
         * Detects if a local resource is accessible
         * @param it - The extracted link to check
         */
        result.detectAccessible = (it: ExtractedLink) => {
          if (it.linkTarget !== LinkTarget.LocalResource) {
            return;
          }

          const abs = join(dirPath, it.url);
          it.accessible = isAccessible(abs);
        };
      }

      if (op.type === OpDescriptorType.DetectExternalRefs) {
        /**
         * Detects external references to a local resource from other markdown files
         * @param it - The extracted link to check
         */
        result.detectExternalRefs = (it: ExtractedLink) => {
          if (it.linkTarget !== LinkTarget.LocalResource) {
            return;
          }

          it.externalRefs = this._detectExternalRefs(join(dirPath, it.url)) || [];
        }
      }

      if (op.type === OpDescriptorType.Filter) {
        result.filter = op.predicate;
      }
    }

    return result;
  }

  /**
   * Parses classification operations into initializer and processor functions
   * @param ops - Array of operation descriptors containing the classification
   * @returns Object with init function to create buckets and processor to classify items
   */
  private _parseClassifyOps(ops: OpDescriptor[]) {
    const { buckets } = (ops[0] as OpClassifyDescriptor);
    const keys = Object.keys(buckets);
    const restKeyIdx = keys.findIndex(key => buckets[key] === REST_KEY);
    let restKey: string;
    if (restKeyIdx !== -1) {
      restKey = keys[restKeyIdx];
      keys.splice(restKeyIdx, 1);
    }

    /**
     * Initializes empty buckets for each classification category
     * @returns Object with empty arrays for each bucket
     */
    const init = () => {
      const result: Record<string, ExtractedLink[]> = {}
      keys.reduce((result, key) => {
        result[key] = [];
        return result;
      }, result);

      if (restKey) {
        result[restKey] = [];
      }
      return result;
    };

    /**
     * Classifies a single link item into appropriate bucket(s)
     * @param item - The extracted link to classify
     * @returns Array of bucket keys the item belongs to
     */
    const processor = (item: ExtractedLink) => {
      let hasRest = true;
      const result: string[] = [];
      for (const key of keys) {
        const classifyFilter = buckets[key] as FilterPredicate;
        if (!classifyFilter(item)) { continue; }

        result.push(key);
        hasRest = false;
      }
      if (restKey && hasRest) {
        result.push(restKey);
      }
      return result;
    };

    return { init, processor };
  }

  /**
   * Detects which markdown files reference a given asset
   * @param assetAbsPath - Absolute path of the asset file
   * @returns Array of markdown file paths (relative to base) that reference this asset
   */
  private _detectExternalRefs(assetAbsPath: string) {
    const mainMdFilePath = this.filePath;
    const otherFilePaths = this._getOtherFilePaths();

    const refs: string[] = [];
    for (let i = 0; i < otherFilePaths.length; i++) {
      const curMdFilePath = otherFilePaths[i];
      if (mainMdFilePath === curMdFilePath) { continue; }

      if ((this._resourceRefsCache[curMdFilePath] || []).includes(assetAbsPath)) {
        refs.push(curMdFilePath);
      }
    }

    return refs;
  }

  /**
   * Builds a cache mapping each markdown file to the absolute paths of resources it references
   * This is used for external reference detection across files
   * @returns Promise that resolves when all files have been processed
   */
  private _setResourceRefsCache() {
    const filePaths = this._getOtherFilePaths();
    return Promise.allSettled(filePaths.map(async (relative) => {
      const filePath = join(this.base, relative);
      const links = await extractLinks(filePath);
      const absArr = [];
      for (const item of links) {
        if (item.linkTarget !== LinkTarget.LocalResource) { continue; }
        const absolute = join(dirname(filePath), item.url);
        absArr.push(absolute);
      }
      this._resourceRefsCache[relative] = absArr;
    }));
  }

  /**
   * Promise-like then method for the pipeline
   * @param onFulfilled - Callback for successful completion
   * @param onRejected - Callback for rejection
   * @returns Promise with the transformed result
   */
  protected then<TResult1 = ThenParam<TState>, TResult2 = never>(
    onFulfilled?: (value: ThenParam<TState>) => TResult1 | PromiseLike<TResult1>,
    onRejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onFulfilled, onRejected);
  }
}

/**
 * Pipeline class that represents the state after classification operations
 * Provides a typed then method that returns the classified result structure
 * @template TConfig - Configuration type for classification buckets
 */
class ThenPipeline<TConfig extends Record<string, any> = any> extends Pipeline<'classifyLinks'> {
  constructor(shared: PipelineShared) {
    super();
    this._shared = shared;
  }

  /**
   * Promise-like then method with typed classification result
   * @param onFulfilled - Callback receiving the classified result object
   * @param onRejected - Callback for rejection
   * @returns Promise with the transformed result
   */
  then<TResult>(
    onFulfilled?: (value: Prettify<InferClassifyResult<TConfig>>) => TResult | PromiseLike<TResult>,
    onRejected?: (reason: any) => never
  ): Promise<TResult> {
    return this._promise.then(onFulfilled, onRejected);
  }
}

/**
 * Pipeline class for the link extraction and processing phase
 * Provides fluent API for filtering, detection, and classification operations
 * @template TState - Current pipeline state
 */
class LinkDataPipeline<TState extends State = 'extractLinks'> extends Pipeline<TState> {
  constructor(shared: PipelineShared) {
    super();
    this._shared = shared;
  }

  /**
   * Adds a filter operation to the pipeline
   * @param predicate - Function that determines whether a link should be included
   * @returns A new LinkDataPipeline instance with the filter added
   * @throws {TypeError} If predicate is not a function
   */
  filter(predicate: FilterPredicate): LinkDataPipeline<'extractLinks'> {
    if (typeof predicate !== 'function') {
      throw new TypeError('The predicate must be a function.');
    }
    this._push({ type: OpDescriptorType.Filter, predicate });
    return new LinkDataPipeline(this._shared);
  }

  /**
   * Adds a filter operation by link type or link target
   * @param type - LinkType or LinkTarget to filter by
   * @returns A new LinkDataPipeline instance with the filter added
   * @throws {TypeError} If type is not a valid LinkType or LinkTarget
   */
  filterBy(type: LinkType): LinkDataPipeline<'extractLinks'>;
  filterBy(type: LinkTarget): LinkDataPipeline<'extractLinks'>;
  filterBy(type: any): LinkDataPipeline<'extractLinks'> {
    if (isLinkType(type)) {
      return this.filter((data) => data.type === type);
    }

    if (isLinkTarget(type)) {
      return this.filter((data) => data.linkTarget === type);
    }

    throw new TypeError('The type is not a LinkType or LinkTarget');
  }

  /**
   * Adds a classification operation to the pipeline
   * @param buckets - Object mapping category names to predicate functions or the REST_KEY
   * @returns A new ThenPipeline instance for the classification phase
   * @throws {TypeError} If buckets is invalid or contains invalid values
   */
  classify<TConfig extends ClassifyBuckets>(buckets: TConfig): ThenPipeline<TConfig> {
    if (typeof buckets !== 'object' || buckets === null || Array.isArray(buckets)) {
      throw new TypeError('The buckets must be a plain object.');
    }
    if (Object.keys(buckets).length === 0) {
      throw new TypeError('The buckets must not be empty.');
    }
    const values = Object.values(buckets);
    const restCount = values.filter(v => v === REST_KEY).length;
    if (restCount > 1) {
      throw new TypeError('The buckets must have at most one "rest" value.');
    }
    const invalidEntry = values.find(v => v !== REST_KEY && typeof v !== 'function');
    if (invalidEntry !== undefined) {
      throw new TypeError('Each bucket value must be a predicate function or the string "rest".');
    }
    this._push({ type: OpDescriptorType.Classify, buckets });
    return new ThenPipeline<TConfig>(this._shared);
  }

  /**
   * Adds a detection operation to the pipeline
   * @param detectType - Type of detection to perform (ExternalRefs or Accessible)
   * @returns A new LinkDataPipeline instance with the detection added
   * @throws {TypeError} If detectType is not a valid DetectType
   */
  detect(detectType: DetectType): LinkDataPipeline<'extractLinks'> {
    if (detectType === DetectType.ExternalRefs) {
      this._push({ type: OpDescriptorType.DetectExternalRefs, keys: null });
      return new LinkDataPipeline(this._shared);
    }

    if (detectType === DetectType.Accessible) {
      this._push({ type: OpDescriptorType.DetectAccessible });
      return new LinkDataPipeline(this._shared);
    }
    throw new TypeError('The type must be a DetectType.');
  }

  /**
   * Promise-like then method for the pipeline
   * @param onFulfilled - Callback for successful completion
   * @param onRejected - Callback for rejection
   * @returns Promise with the transformed result
   */
  then<TResult1 = ThenParam<TState>, TResult2 = never>(
    onFulfilled?: (value: ThenParam<TState>) => TResult1 | PromiseLike<TResult1>,
    onRejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onFulfilled, onRejected);
  }
}

/**
 * Main entry point for the link harvesting pipeline
 * Handles initialization with base directory and file path validation
 */
export class LinkHarvester extends Pipeline {
  /**
   * Creates a new LinkHarvester instance
   * @param props - Configuration properties containing base directory and file path
   * @throws {Error} If base directory or file path is invalid or inaccessible
   */
  constructor({ base, filePath }: LinkHarvesterProps) {
    super();

    if (typeof base !== 'string') {
      throw new Error('Base directory must be a string');
    }

    if (!isAbsolute(base)) {
      throw new Error('Base directory must be an absolute path');
    }

    if (!isAccessible(base)) {
      throw new Error(`Base directory "${base}" does not exist or is not accessible.`);
    }

    const shared = this._shared;
    shared.base = removeTrailSep(base);

    if (typeof filePath !== 'string') {
      throw new Error('The path must be a string.');
    }

    if (isAbsolute(filePath)) {
      if (!isAccessible(filePath)) {
        throw new Error(`The file "${filePath}" does not exist or is not accessible.`);
      }

      if (!filePath.startsWith(shared.base)) {
        throw new Error(`The file "${filePath}" is outside the base directory.`);
      }

      shared.filePath = relative(shared.base, filePath);
    } else if (isAccessible(join(shared.base, filePath))) {
      shared.filePath = removeTrailSep(filePath);
    } else {
      throw new Error(`The file "${filePath}" does not exist or is not accessible.`);
    }

    shared._promise = new Promise(resolve => { shared._resolve = resolve; });
    this._shared = shared;
  }

  /**
   * Initiates the link gathering process
   * @returns A LinkDataPipeline instance for further processing
   */
  gather(): LinkDataPipeline<'extractLinks'> {
    this._push({ type: OpDescriptorType.Gather });
    this._schedule();
    return new LinkDataPipeline(this._shared);
  }
}
