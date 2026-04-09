import { extractLinks } from "./src/extractor";
import { dirname, isAbsolute, join, relative } from "node:path";
import { ClassifyBuckets, ClassifyType, ExtractedLink, FilterPredicate, LinkTarget, LinkType, OpClassifyDescriptor, OpDescriptor, OpDescriptorType, OpDetectExternalRefsDescriptor, State, ThenParam, InferClassifyResult, Prettify, PipelineShared, LinkHarvesterProps, OpFilterDescriptor } from "./src/types";
import { isOpGatherDescriptor, isLinkTarget, isLinkType } from "./src/types/assert";
import { isAccessible, optimizeOps, removeTrailSep } from "./src/utils";
import fg from 'fast-glob';
import { REST_KEY } from "./src/constants";

export { REST_KEY } from "./src/constants";
export { extractLinks } from './src/extractor';
export { LinkTarget, LinkType, ClassifyType, ExtractedLink, LinkHarvesterProps } from './src/types';

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

  protected set _shared(props: PipelineShared) {
    this.ops = props.ops;
    this.base = props.base;
    this.filePath = props.filePath;
    this._promise = props._promise;
    this._resolve = props._resolve;
    this._pending = props._pending;
  }

  private _getOtherFilePaths() {
    if (!this.otherFilePaths) {
      this.otherFilePaths = fg.sync(`**/*.{md,markdown}`, {
        onlyFiles: true,
        cwd: this.base,
      });
    }
    return this.otherFilePaths;
  }

  protected _push(op: any) {
    this.ops.push(op);
  }

  protected _schedule() {
    if (this._pending) return;
    this._pending = true;
    Promise.resolve().then(() => {
      this._pending = false;
      this._flush();
    });
  }

  private async _flush() {
    const result = await this._execute();
    this._resolve(result);
  }

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
    const dirPath = dirname(join(this.base, this.filePath));
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

    const { preFilter, detect, postFilter } = this._parseLinerOps(linearOps);

    if (hasExternalRefsDetect()) {
      await this._setResourceRefsCache();
    }

    for (let i = 0; i < this.dataList.length; i++) {
      const item = { ...this.dataList[i] };
      if (preFilter && !preFilter(item)) { continue; }
      if (detect && item.linkTarget === LinkTarget.LocalResource) {
        const abs = join(dirPath, item.url);
        item.externalRefs = this._detectExternalRefs(abs) || [];
      }
      if (postFilter && !postFilter(item)) { continue; }

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

  private _parseLinerOps(ops: OpDescriptor[]) {
    const result: {
      preFilter: FilterPredicate | null;
      detect: OpDetectExternalRefsDescriptor | null;
      postFilter: FilterPredicate | null;
    } = {
      preFilter: null,
      detect: null,
      postFilter: null,
    };

    if (!ops.length) {
      return result;
    }

    const detectIdx = ops.findIndex(op => op.type === OpDescriptorType.DetectExternalRefs);

    if (detectIdx === -1) {
      result.preFilter = (ops[0] as OpFilterDescriptor).predicate;
      return result;
    }

    result.detect = ops[detectIdx] as OpDetectExternalRefsDescriptor;

    if (detectIdx > 0) {
      result.preFilter = (ops[0] as OpFilterDescriptor).predicate;
    }

    if (detectIdx + 1 < ops.length) {
      result.postFilter = (ops[detectIdx + 1] as OpFilterDescriptor).predicate;
    }

    return result;
  }

  private _parseClassifyOps(ops: OpDescriptor[]) {
    const dirPath = dirname(join(this.base, this.filePath));
    const { buckets } = (ops[0] as OpClassifyDescriptor);
    const keys = Object.keys(buckets);
    const restKeyIdx = keys.findIndex(key => buckets[key] === REST_KEY);
    let restKey: string = REST_KEY;
    if (restKeyIdx !== -1) {
      restKey = keys[restKeyIdx];
      keys.splice(restKeyIdx, 1);
    }

    const attactExternalRefs = (item: ExtractedLink) => {
      if (item.linkTarget === LinkTarget.LocalResource) {
        item.externalRefs = this._detectExternalRefs(join(dirPath, item.url)) || [];
      }
    };

    let detector: ((item: ExtractedLink, key?: string) => void) | null = null;

    if (ops.length > 1) {
      const detect = ops[1] as OpDetectExternalRefsDescriptor;
      detector = detect.keys?.length ? (it, key) => {
        if (!detect.keys!.includes(key!)) { return; }
        attactExternalRefs(it);
      } : (it) => attactExternalRefs(it);
    }

    const init = () => {
      const result: Record<string, ExtractedLink[]> = {}
      keys.reduce((result, key) => {
        result[key] = [];
        return result;
      }, result);

      result[restKey] = [];
      return result;
    };

    const processor = (item: ExtractedLink) => {
      let hasRest = true;
      const result: string[] = [];
      for (const key of keys) {
        const classifyFilter = buckets[key] as FilterPredicate;
        if (!classifyFilter(item)) { continue; }

        detector && detector(item, key);
        result.push(key);
        hasRest = false;
      }
      if (hasRest) {
        result.push(restKey);
      }
      return result;
    };

    return { init, processor };
  }

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

  protected then<TResult1 = ThenParam<TState>, TResult2 = never>(
    onFulfilled?: (value: ThenParam<TState>) => TResult1 | PromiseLike<TResult1>,
    onRejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onFulfilled, onRejected);
  }
}

class ThenPipeline<TConfig extends Record<string, any> = any> extends Pipeline<'classifyLinks'> {
  constructor(shared: PipelineShared) {
    super();
    this._shared = shared;
  }

  then<TResult>(
    onFulfilled?: (value: Prettify<InferClassifyResult<TConfig>>) => TResult | PromiseLike<TResult>,
    onRejected?: (reason: any) => never
  ): Promise<TResult> {
    return this._promise.then(onFulfilled, onRejected);
  }
}

class DetectPipeline<TResultType extends Record<string, ExtractedLink[]> = any> extends Pipeline<'classifyLinks'> {
  protected keys: string[] = [];

  constructor(props: { key: string; shared: PipelineShared }) {
    super();
    this.keys.push(props.key);
    this._shared = props.shared;
  }

  detectExternalRefs(): ThenPipeline<TResultType> {
    this._push({ type: OpDescriptorType.DetectExternalRefs, keys: this.keys });
    return new ThenPipeline(this._shared);
  }
}

class ClassificationPipeline<TConfig extends Record<string, any> = any> extends Pipeline<'classifyLinks'> {
  constructor(shared: PipelineShared) {
    super();
    this._shared = shared;
  }

  on<K extends keyof InferClassifyResult<TConfig>>(prop: K): DetectPipeline<InferClassifyResult<TConfig>> {
    return new DetectPipeline<InferClassifyResult<TConfig>>({
      key: prop as string,
      shared: this._shared,
    });
  }

  detectExternalRefs(): ThenPipeline<InferClassifyResult<TConfig>> {
    this._push({ type: OpDescriptorType.DetectExternalRefs, keys: null });
    return new ThenPipeline(this._shared);
  }

  then<TResult>(
    onFulfilled?: (value: Prettify<InferClassifyResult<TConfig>>) => TResult | PromiseLike<TResult>,
    onRejected?: (reason: any) => never
  ): Promise<TResult> {
    return this._promise.then(onFulfilled, onRejected);
  }
}

class LinkDataPipeline<TState extends State = 'extractLinks'> extends Pipeline<TState> {
  constructor(shared: PipelineShared) {
    super();
    this._shared = shared;
  }

  filter(predicate: FilterPredicate): LinkDataPipeline<'extractLinks'> {
    if (typeof predicate !== 'function') {
      throw new TypeError('The predicate must be a function.');
    }
    this._push({ type: OpDescriptorType.Filfer, predicate });
    return new LinkDataPipeline(this._shared);
  }

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

  classify<TConfig extends ClassifyBuckets>(buckets: TConfig): ClassificationPipeline<TConfig> {
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
    return new ClassificationPipeline<TConfig>(this._shared);
  }

  classifyBy(type: ClassifyType): ClassificationPipeline<{
    accessible: FilterPredicate;
    invalid: typeof REST_KEY;
  }> {
    if (type !== ClassifyType.IfAccessable) {
      throw new TypeError(`The type must be a ${ClassifyType.IfAccessable}.`);
    }

    return this.classify({
      accessible: (data) => {
        if (data.linkTarget !== LinkTarget.LocalResource) {
          return false;
        }
        const dirPath = dirname(join(this.base, this.filePath));
        return isAccessible(join(dirPath, data.url));
      },
      invalid: REST_KEY,
    });
  }

  detectExternalRefs(): LinkDataPipeline<'extractLinks'> {
    this._push({ type: OpDescriptorType.DetectExternalRefs, keys: null });
    return new LinkDataPipeline(this._shared);
  }

  then<TResult1 = ThenParam<TState>, TResult2 = never>(
    onFulfilled?: (value: ThenParam<TState>) => TResult1 | PromiseLike<TResult1>,
    onRejected?: (reason: any) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    return this._promise.then(onFulfilled, onRejected);
  }
}

export class LinkHarvester extends Pipeline {
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

  gather(): LinkDataPipeline<'extractLinks'> {
    this._push({ type: OpDescriptorType.Gather });
    this._schedule();
    return new LinkDataPipeline(this._shared);
  }
}
