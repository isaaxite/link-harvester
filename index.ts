import { extractLinks } from "./src/extractor";
import { dirname, join } from "node:path";
import { ClassifyType, ExtractedLink, FilterPredicate, LinkTarget, LinkType, OpClassifyDescriptor, OpDescriptor, OpDetectExternalRefsDescriptor, OpFilterDescriptor } from "./src/types";
import { isAccessible, mergeFilters } from "./src/utils";
import fg from 'fast-glob';

class Pipeline {
  private _cache: any = {};
  private dataList: ExtractedLink[] = [];
  private otherFilePaths: string[] | null = null;
  protected base!: string;
  protected filePath!: string;
  protected _resolve!: (value: any) => void;
  protected _promise!: Promise<any>;
  protected ops: any[] = [];
  protected _pending: boolean = false;

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

    if (gatherOp.type === 'gather') {
      const absolute = join(this.base, this.filePath);
      this.dataList = await extractLinks(absolute);
    }

    let ops = this.ops.slice(1);

    if (!ops.length) {
      return this.dataList;
    }

    ops = mergeFilters([...ops]);
    const opTypeSet = ops.reduce((set, it) => {
      set.add(it.type);
      return set;
    }, new Set() as Set<string>);

    if (opTypeSet.has('filter') && !opTypeSet.has('classify')) {
      const result: ExtractedLink[] = [];
      const [filter] = ops as [OpFilterDescriptor];
      for (const data of this.dataList) {
        if (!filter.predicate(data)) { continue; }
        result.push(data);
      }
      return result;
    }

    const detectExternalRefs = async (key: string, data: ExtractedLink, op: OpDescriptor) => {
      if (op.type !== 'detectExternalRefs') {
        return;
      }

      const dirPath = dirname(join(this.base, this.filePath));
      const abs = join(dirPath, data.url);

      if (!op.keys) {
        const refs = await this._detectExternalRefs(abs);
        return refs;
      }

      if (op.keys && !op.keys.includes(key)) {
        return;
      }

      const refs = await this._detectExternalRefs(abs) || [];
      data.externalRefs = refs;
      return refs;
    };

    const handleClassify = async (
      dataList: ExtractedLink[],
      buckets: Record<string, string | FilterPredicate>,
      opt?: {
        filter?: FilterPredicate;
        detectExternalRefs?: OpDescriptor;
      },
    ) => {
      const result: { [key: string]: ExtractedLink[] } = {};

      const keys = Object.keys(buckets);
      let restKey = 'rest';
      const restKeyIdx = keys.findIndex(key => key === 'rest');
      if (restKeyIdx !== -1) {
        restKey = buckets.rest as string;
        keys.splice(restKeyIdx, 1);
      }
      result[restKey] = [];

      for (const data of dataList) {
        if (opt?.filter && !opt.filter(data)) {
          continue;
        }

        let hasRest = true;
        for (const key of keys) {
          const filter = buckets[key] as FilterPredicate;
          if (filter(data)) {
            if (!result[key]) { result[key] = []; }
            hasRest = false;
            
            if (opt?.detectExternalRefs) {
              await detectExternalRefs(key, data, opt.detectExternalRefs);
            }
            result[key].push(data);
          }
        }
        if (hasRest) {
          result[restKey].push(data);
        }
      }

      return result;
    }

    if (!opTypeSet.has('filter') && opTypeSet.has('classify')) {
      const [classify, detectExternalRefs] = ops as [OpClassifyDescriptor, OpDetectExternalRefsDescriptor];
      const buckets: Record<string, string | FilterPredicate> = (classify as any).buckets;
      return await handleClassify(this.dataList, buckets, {
        detectExternalRefs,
      });
    }

    const [
      filter,
      classify,
      itDetectExternalRefs,
    ] = ops as [
      OpFilterDescriptor,
      OpClassifyDescriptor,
      OpDetectExternalRefsDescriptor,
    ];

    return await handleClassify(this.dataList, classify.buckets, {
      filter: filter.predicate,
      detectExternalRefs: itDetectExternalRefs,
    });
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

      // Check cache first to avoid redundant file processing
      if (this._cache[curMdFilePath]) {
        return Promise.resolve(getRef(this._cache[curMdFilePath]));
      }

      const filePath = join(this.base, curMdFilePath);
      const links = await extractLinks(filePath);
      const linkDataArr = [];
      for (const item of links) {
        if (item.linkTarget !== LinkTarget.LocalResource) { continue; }
        const absolute = join(dirname(filePath), item.url);
        linkDataArr.push({
          ...item,
          absolute,
        })
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

  protected then(
    onFulfilled?: (_value: any) => any,
    onRejected?: (_reason: any) => never
  ): Promise<any> {
    return this._promise.then(onFulfilled, onRejected);
  }
}

class DetectPipeline extends Pipeline {
  protected keys: string[] = [];

  constructor(props: any) {
    super();
    this.keys.push(props.key);
    this.ops = props.ops;
    this.base = props.base;
    this.filePath = props.filePath;
    this._promise = props._promise;
    this._resolve = props._resolve;
    this._pending = props._pending;
  }

  detectExternalRefs() {
    this._push({ type: 'detectExternalRefs', keys: this.keys });
    return { then: this.then.bind(this) };
  }
}

class ClassificationPipeline extends DetectPipeline {
  constructor(props: any) {
    super({
      ops: props.ops,
      base: props.base,
      filePath: props.filePath,
      _resolve: props._resolve,
      _promise: props._promise,
      _pending: props._pending,
    });
    this.ops = props.ops;
    this.base = props.base;
    this.filePath = props.filePath;
    this._promise = props._promise;
    this._resolve = props._resolve;
    this._pending = props._pending;
  }

  on(prop: string) {
    return new DetectPipeline({
      key: prop,
      ops: this.ops,
      base: this.base,
      filePath: this.filePath,
      _resolve: this._resolve,
      _promise: this._promise,
      _pending: this._pending,
    });
  }

  then(...rest: Parameters<typeof this._promise.then>): ReturnType<typeof this._promise.then> {
    return this._promise.then(...rest);
  }
}

class LinkDataPipeline extends Pipeline {
  constructor(props: any) {
    super();
    this.ops = props.ops;
    this.base = props.base;
    this.filePath = props.filePath;
    this._promise = props._promise;
    this._resolve = props._resolve;
    this._pending = props._pending;    
  }

  filter(predicate: FilterPredicate) {
    this._push({ type: 'filter', predicate });
    return new LinkDataPipeline({
      ops: this.ops,
      base: this.base,
      filePath: this.filePath,
      _resolve: this._resolve,
      _promise: this._promise,
      _pending: this._pending,
    });
  }

  filterBy(type: LinkType): LinkDataPipeline;
  filterBy(type: LinkTarget): LinkDataPipeline;
  filterBy(type: any) {
    if ([
      LinkType.HtmlAnchor,
      LinkType.HtmlImage,
      LinkType.MarkdownImage,
      LinkType.MarkdownLink,
    ].includes(type)) {
      return this.filter((data) => data.type === type);
    }
    
    if ([
      LinkTarget.ExternalPage,
      LinkTarget.ExternalResource,
      LinkTarget.InPageAnchor,
      LinkTarget.LocalResource,
      LinkTarget.Other,
    ].includes(type)) {
      return this.filter((data) => data.linkTarget === type);
    }
    
    throw TypeError('The type is not a LinkType or LinkTarget');
  }

  classify(buckets: Record<string, FilterPredicate | string>) {
    this._push({ type: 'classify', buckets });
    return new ClassificationPipeline({
      ops: this.ops,
      base: this.base,
      filePath: this.filePath,
      _resolve: this._resolve,
      _promise: this._promise,
      _pending: this._pending,
    });
  }

  classifyBy(type: ClassifyType) {
    if (type !== ClassifyType.IfAccessable) {
      throw TypeError(`The type must be a ${ClassifyType.IfAccessable}.`)
    }

    return this.classify({
      accessible: (data) => {
        if (data.linkTarget !== LinkTarget.LocalResource) {
          return false;
        }

        const dirPath = dirname(join(this.base, this.filePath));
        return isAccessible(join(dirPath, data.url))
      },
      rest: 'invalid',
    });
  }

  then(...rest: Parameters<typeof this._promise.then>): ReturnType<typeof this._promise.then> {
    return this._promise.then(...rest);
  }
}

export class LinkHarvester extends Pipeline {
  constructor({ base, filePath }: any) {
    super();
    this.base = base;
    this.filePath = filePath;
    this._promise = new Promise(resolve => { this._resolve = resolve; });
  }

  gather() {
    this._push({ type: 'gather' })
    this._schedule();

    return new LinkDataPipeline({
      ops: this.ops,
      base: this.base,
      filePath: this.filePath,
      _resolve: this._resolve,
      _promise: this._promise,
      _pending: this._pending,
    });
  }
}
