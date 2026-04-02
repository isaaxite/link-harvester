import { dirname, isAbsolute, join, relative } from "node:path";
import { extractLinks } from "./src/extractor";
import { ClassifyType, ExtractedLink, FilterPredicate, LinkTarget, LinkType, OpClassifyDescriptor, OpDescriptor, OpDetectExternalRefsDescriptor, OpFilterDescriptor } from "./src/types";
import { isAccessible, mergeFilters, removeTrailSep } from "./src/utils";
import fg from 'fast-glob';

export { LinkType, LinkTarget, ClassifyType } from './src/types';
export { extractLinks } from './src/extractor';
export class LinkHarvester {
  private base: string;
  private filePath: string;
  private otherFilePaths: string[] | null = null;
  private ops:      OpDescriptor[] = [];
  private _pending: boolean        = false;
  private _resolve!: (value: any) => void;
  private _promise:  Promise<any>;
  private _cache: any = {};
  private dataList: ExtractedLink[] | null = null;

  constructor(props: { base: string; filePath: string }) {
    const { base, filePath } = props;

    if (typeof base !== 'string') {
      throw new Error('Base directory must be a string');
    }

    if (!isAbsolute(base)) {
      throw new Error('Base directory must be an absolute path');
    }

    if (!isAccessible(base)) {
      throw new Error(`Base directory "${base}" does not exist or is not accessible.`);
    }

    this.base = removeTrailSep(base);

    if (typeof filePath !== 'string') {
      throw new Error('The path must be a string.');
    }

    if (isAbsolute(filePath)) {
      if (!isAccessible(filePath)) {
        throw new Error(`The file "${filePath}" does not exist or is not accessible.`);
      }

      if (!filePath.startsWith(this.base)) {
        throw new Error(`The file "${filePath}" is outside the base directory.`);
      }

      this.filePath = relative(this.base, filePath);
    } else if (isAccessible(join(this.base, filePath))) {
      this.filePath = removeTrailSep(filePath);
    } else {
      throw new Error(`The file "${filePath}" does not exist or is not accessible.`);
    }

    this._promise = new Promise(resolve => { this._resolve = resolve; });
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

  private _push(op: OpDescriptor) {
    this.ops.push(op);
  }

  private _schedule() {
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
    if (!this.dataList) {
      const absolute = join(this.base, this.filePath);
      this.dataList = await extractLinks(absolute);
    }

    if (!this.ops.length) {
      return this.dataList;
    }

    const ops = mergeFilters([...this.ops]);
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

  gather(): this {
    this._schedule();
    return this;
  }

  filter(predicate: FilterPredicate): this {
    this._push({ type: 'filter', predicate });
    return this;
  }

  filterBy(type: LinkType): this;
  filterBy(type: LinkTarget): this;
  filterBy(type: any): this {
    if ([
      LinkType.HtmlAnchor,
      LinkType.HtmlImage,
      LinkType.MarkdownImage,
      LinkType.MarkdownLink,
    ].includes(type)) {
      this._push({ type: 'filter', predicate: (data) => data.type === type });
    } else if ([
      LinkTarget.ExternalPage,
      LinkTarget.ExternalResource,
      LinkTarget.InPageAnchor,
      LinkTarget.LocalResource,
      LinkTarget.Other,
    ].includes(type)) {
      this._push({ type: 'filter', predicate: (data) => data.linkTarget === type });
    } else {
      throw TypeError('The type is not a LinkType or LinkTarget');
    }
    return this;
  }

  on(key: string): OnProxy {
    return new OnProxy(this, key);
  }

  detectExternalRefs(): this {
    this._push({ type: 'detectExternalRefs', keys: null });
    return this;
  }

  classify(buckets: Record<string, FilterPredicate | string>) {
    this._push({ type: 'classify', buckets });
    return {
      then: this.then.bind(this),
      on: this.on.bind(this),
      detectExternalRefs: this.detectExternalRefs.bind(this),
    };
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

  // Thenable
  then(onFulfilled: (v: any) => any, onRejected?: (e: any) => any) {
    return this._promise.then(onFulfilled, onRejected);
  }
}

class OnProxy {
  constructor(
    private pipeline: LinkHarvester,
    private key:      string,
  ) {}

  detectExternalRefs(): LinkHarvester {
    (this.pipeline as any)._push({
      type: 'detectExternalRefs',
      keys: [this.key],
    } satisfies OpDescriptor);
    return this.pipeline;
  }
}
