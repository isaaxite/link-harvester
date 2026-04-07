import { extractLinks } from "./src/extractor";
import { dirname, isAbsolute, join, relative } from "node:path";
import { ClassifyBuckets, ClassifyType, ExtractedLink, FilterPredicate, LinkTarget, LinkType, OpClassifyDescriptor, OpDescriptor, OpDescriptorType, OpDetectExternalRefsDescriptor, State, ThenParam, InferClassifyResult, Prettify, PipelineShared, LinkHarvesterProps, InvokedChain } from "./src/types";
import { isOpGatherDescriptor, isLinkTarget, isLinkType, InvokedChainAssert } from "./src/types/assert";
import { getInvokedChainStr, isAccessible, optimizeOps, removeTrailSep } from "./src/utils";
import fg from 'fast-glob';
import { REST_KEY } from "./src/constants";

export { REST_KEY } from "./src/constants";
export { extractLinks } from './src/extractor';
export { LinkTarget, LinkType, ClassifyType, ExtractedLink, LinkHarvesterProps } from './src/types';

class Pipeline<TState extends State = 'classifyLinks'> {
  private _cache: any = {};
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

    let ops = this.ops.slice(1);

    if (!ops.length) {
      return this.dataList;
    }

    ops = optimizeOps([...ops]);

    const invokedChainStr = getInvokedChainStr(ops);
    const assert = new InvokedChainAssert(invokedChainStr);

    if (invokedChainStr.includes(InvokedChain.C)) {
      return await this._exeClassifyLinks({ ops, assert });
    }

    return await this._execExtractLinks({ ops, assert });
  }

  private async _execExtractLinks({ ops, assert }: {
    ops: OpDescriptor[];
    assert: InvokedChainAssert;
  }) {
    const result: ExtractedLink[] = [];
    const dirPath = dirname(join(this.base, this.filePath));

    if (assert.isFInvokeChain(ops)) {
      const [filter] = ops;
      for (const data of this.dataList) {
        if (!filter.predicate(data)) { continue; }
        result.push({ ...data });
      }
      return result;
    }

    if (assert.isDInvokeChain(ops)) {
      for (const data of this.dataList) {
        const item = { ...data };
        if (data.linkTarget === LinkTarget.LocalResource) {
          const abs = join(dirPath, data.url);
          item.externalRefs = await this._detectExternalRefs(abs) || [];
        }

        result.push(item);
      }
      return result;
    }

    if (assert.isDFInvokeChain(ops)) {
      const filter = ops[1];
      for (const data of this.dataList) {
        const item = { ...data };
        if (data.linkTarget === LinkTarget.LocalResource) {
          const abs = join(dirPath, data.url);
          item.externalRefs = await this._detectExternalRefs(abs) || [];
        }

        if (!filter.predicate(item)) { continue; }
        result.push(item);
      }

      return result;
    }

    if (assert.isFDInvokeChain(ops)) {
      const [filter] = ops;
      for (const data of this.dataList) {
        if (!filter.predicate(data)) { continue; }
        if (data.linkTarget === LinkTarget.LocalResource) {
          const abs = join(dirPath, data.url);
          data.externalRefs = await this._detectExternalRefs(abs) || [];
        }
        result.push({ ...data });
      }

      return result;
    }

    if (assert.isFDFInvokeChain(ops)) {
      const filter = ops[0];
      const subFilter = ops[2];
      for (const data of this.dataList) {
        const item = { ...data };
        if (!filter.predicate(item)) { continue; }
        if (data.linkTarget === LinkTarget.LocalResource) {
          const abs = join(dirPath, data.url);
          item.externalRefs = await this._detectExternalRefs(abs) || [];
        }
        if (!subFilter.predicate(item)) { continue; }
        result.push(item);
      }

      return result;
    }
  }

  private async _exeClassifyLinks({ ops, assert }: {
    ops: OpDescriptor[];
    assert: InvokedChainAssert;
  }) {
    const result: { [key: string]: ExtractedLink[] } = {};
    const dirPath = dirname(join(this.base, this.filePath));
    const { buckets } = ops.find(it => it.type === OpDescriptorType.Classify) as OpClassifyDescriptor;
    const keys = Object.keys(buckets);
    const restKeyIdx = keys.findIndex(key => buckets[key] === REST_KEY);
    let restKey: string = REST_KEY;

    const attactExternalRefs = async (item: ExtractedLink) => {
      if (item.linkTarget === LinkTarget.LocalResource) {
        item.externalRefs = await this._detectExternalRefs(join(dirPath, item.url)) || [];
      }
    };

    const detectExternalRefsFactory = (detectExternalRefs: OpDetectExternalRefsDescriptor) => {
      return detectExternalRefs.keys?.length ? async (...rest: any) => {
        const [it, key] = rest as [ExtractedLink, string];
        if (!detectExternalRefs.keys!.includes(key)) { return; }
        await attactExternalRefs(it);
      } : async (...rest: any) => {
        const [it] = rest as [ExtractedLink];
        await attactExternalRefs(it);
      };
    };

    if (restKeyIdx !== -1) {
      restKey = keys[restKeyIdx];
      keys.splice(restKeyIdx, 1);
    }
    result[restKey] = [];
    keys.reduce((result, key) => {
      result[key] = [];
      return result;
    }, result);

    if (assert.isCInvokeChain(ops)) {
      for (const data of this.dataList) {
        let hasRest = true;
        for (const key of keys) {
          const classifyFilter = buckets[key] as FilterPredicate;
          if (!classifyFilter(data)) { continue; }

          hasRest = false;
          result[key].push(data);
        }
        if (hasRest) {
          result[restKey].push(data);
        }
      }
      return result;
    }

    if (assert.isCDInvokeChain(ops)) {
      const detectExternalRefs = ops[1];
      const detectExternalRefsAttacher = detectExternalRefsFactory(detectExternalRefs);

      for (const data of this.dataList) {
        let hasRest = true;
        const item = { ...data };
        for (const key of keys) {
          const classifyFilter = buckets[key] as FilterPredicate;
          if (!classifyFilter(item)) { continue; }

          await detectExternalRefsAttacher(item, key);
          result[key].push(item);
          hasRest = false;
        }
        if (hasRest) {
          result[restKey].push(data);
        }
      }
      return result;
    }

    if (assert.isFCInvokeChain(ops)) {
      const filter = ops[0];
      for (const data of this.dataList) {
        let hasRest = true;
        if (!filter.predicate(data)) { continue; }
        for (const key of keys) {
          const classifyFilter = buckets[key] as FilterPredicate;
          if (!classifyFilter(data)) { continue; }
          hasRest = false;
          result[key].push(data);
        }
        if (hasRest) {
          result[restKey].push(data);
        }
      }
      return result;
    }

    if (assert.isDFCInvokeChain(ops)) {
      const filter = ops[1];
      for (const data of this.dataList) {
        let hasRest = true;
        const item = { ...data };

        await attactExternalRefs(item);

        if (!filter.predicate(item)) { continue; }

        for (const key of keys) {
          const classifyFilter = buckets[key] as FilterPredicate;
          if (!classifyFilter(item)) { continue; }
          hasRest = false;
          result[key].push(item);
        }
        if (hasRest) {
          result[restKey].push(item);
        }
      }
      return result;
    }

    if (assert.isFCDInvokeChain(ops)) {
      const filter = ops[0];
      const detectExternalRefs = ops[2];
      const detectExternalRefsAttacher = detectExternalRefsFactory(detectExternalRefs);

      for (const data of this.dataList) {
        let hasRest = true;
        const item = { ...data };

        if (!filter.predicate(item)) { continue; }

        for (const key of keys) {
          const classifyFilter = buckets[key] as FilterPredicate;
          if (!classifyFilter(item)) { continue; }

          await detectExternalRefsAttacher(item, key);
          
          hasRest = false;
          result[key].push(item);
        }
        if (hasRest) {
          result[restKey].push(item);
        }
      }
      return result;
    }

    if (assert.isFDCInvokeChain(ops)) {
      const filter = ops[0];

      for (const data of this.dataList) {
        let hasRest = true;
        const item = { ...data };

        if (!filter.predicate(item)) { continue; }

        await attactExternalRefs(item);

        for (const key of keys) {
          const classifyFilter = buckets[key] as FilterPredicate;
          if (!classifyFilter(item)) { continue; }
          
          hasRest = false;
          result[key].push(item);
        }
        if (hasRest) {
          result[restKey].push(item);
        }
      }
      return result;
    }

    if (assert.isFDFCInvokeChain(ops)) {
      const filter = ops[0];
      const subFilter = ops[2];

      for (const data of this.dataList) {
        let hasRest = true;
        const item = { ...data };

        if (!filter.predicate(item)) { continue; }

        await attactExternalRefs(item);

        if (!subFilter.predicate(item)) { continue; }

        for (const key of keys) {
          const classifyFilter = buckets[key] as FilterPredicate;
          if (!classifyFilter(item)) { continue; }
          
          hasRest = false;
          result[key].push(item);
        }
        if (hasRest) {
          result[restKey].push(item);
        }
      }
      return result;
    }
  }

  private async _detectExternalRefs(assetAbsPath: string) {
    const mainMdFilePath = this.filePath;
    return Promise.allSettled(this._getOtherFilePaths().map(async (curMdFilePath) => {
      if (mainMdFilePath === curMdFilePath) {
        return Promise.resolve();
      }

      const getRef = (linkDataArr: any) => {
        const ref: string[] = [];
        linkDataArr.reduce((ref: string[], linkData: any) => {
          if (linkData.absolute === assetAbsPath) {
            ref.push(curMdFilePath);
          }
          return ref;
        }, ref);
        return ref;
      };

      if (this._cache[curMdFilePath]) {
        return Promise.resolve(getRef(this._cache[curMdFilePath]));
      }

      const filePath = join(this.base, curMdFilePath);
      const links = await extractLinks(filePath);
      const linkDataArr = [];
      for (const item of links) {
        if (item.linkTarget !== LinkTarget.LocalResource) { continue; }
        const absolute = join(dirname(filePath), item.url);
        linkDataArr.push({ ...item, absolute });
      }
      this._cache[curMdFilePath] = linkDataArr;
      return Promise.resolve(getRef(linkDataArr));
    })).then((ret) => {
      const last: string[] = [];
      for (const item of ret) {
        if (item.status === 'fulfilled' && item.value?.length) {
          last.push(...item.value);
        }
      }
      return last;
    }).catch((err) => {
      console.error('Error checking references:', err);
    });
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
