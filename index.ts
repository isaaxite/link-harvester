import { extractResourceLinks } from './src/extractor';
import { AccessibleLinkData, AccessibleLinkDataWithRef, ClassifyLinkData, ExtractedLink, LinkTarget } from './src/types';
import { classifyLink, isAccessible, noTrailSep } from './src/utils';
import { dirname, join } from 'node:path';
import fg from 'fast-glob';

export { LinkType, LinkTarget } from './src/types';
export { extractResourceLinks } from './src/extractor';
export class LinkHarvester {
  /** The base directory for markdown files and assets.absolute path */
  private base: string;
  // List of markdown files detected in the base directory and its subdirectories.relative to the base directory
  private mdFiles: string[] = [];
  // Cache to store processed markdown files and their link data to optimize reference checking
  private _cache: any = {};

  constructor(base: string) {
    this.base = noTrailSep(base);
    this.mdFiles = this.detectFiles();
  }

  /** Detect markdown files in the base directory and its subdirectories. */
  private detectFiles() {
    return fg.sync(`**/*.{md,markdown}`, {
      onlyFiles: true,
      cwd: this.base,
    });
  }

  /**
   * Retrieve link data from a markdown file.
   * @param filepath The path to the markdown file relative to the base directory.
   * @returns A promise resolving to an array of link data.
   */
  private async getLinkDatas(filepath: string) {
    const resources = await extractResourceLinks(filepath);
    const resourceLinks: Array<ClassifyLinkData> = [];
    for (const item of resources) {
      resourceLinks.push({
        ...item,
        linkTarget: classifyLink(item.url)
      });
    }
    return resourceLinks;
  }

  /**
   * Check the accessibility of local assets in a markdown file.
   * @param realtive The path to the markdown file relative to the base directory.
   * @param opt Options for handling invalid and accessible links.
   * @param opt.invalidHandler A callback function to handle invalid links.
   * @param opt.accessibleHandler A callback function to handle accessible links, receiving the link data with absolute path.
   * @returns A promise that resolves when the accessibility check is complete.
   */
  private async localAssetAccessibility(realtive: string, opt: {
    invalidHandler?: (linkData: ExtractedLink) => void;
    accessibleHandler?: (linkData: AccessibleLinkData) => Promise<any>;
  }) {
    const filePath = join(this.base, realtive);
    const links = await this.getLinkDatas(filePath);
    const accessible: Array<AccessibleLinkData> = [];

    for (const item of links) {
      if (item.linkTarget !== LinkTarget.LOCAL_RESOURCE) {
        continue;
      }
      
      const absolute = join(dirname(filePath), item.url);

      if (!isAccessible(absolute)) {
        opt.invalidHandler?.(item);
        continue;
      }

      await opt.accessibleHandler?.({
        ...item,
        absolute,
      });
    }
  }

  /**
   * Retrieve accessible local assets from a markdown file.
   * @param realtive The path to the markdown file relative to the base directory.
   * @returns A promise resolving to an array of accessible link data. 
   */
  private async getLocalAccessibleAssetsOf(realtive: string) {
    const accessible: Array<AccessibleLinkData> = [];
    const accessibleHandler = async (it: AccessibleLinkData) => accessible.push(it);
    await this.localAssetAccessibility(realtive, { accessibleHandler });

    return accessible;
  }

  /**
   * Retrieve external references to a local asset.
   * @param mdFilePath The path to the markdown file relative to the base directory.
   * @param assetAbsPath The absolute path to the local asset.
   * @returns A promise resolving to an array of markdown file paths that reference the asset.
   */
  private async getExternalRefs(mdFilePath: string, assetAbsPath: string) {
    return Promise.allSettled(this.mdFiles.map((curMdFilePath) => {
      if (mdFilePath === curMdFilePath) {
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

      return this.getLocalAccessibleAssetsOf(curMdFilePath)
        .then((linkDataArr) => {
          this._cache[curMdFilePath] = linkDataArr;
          return getRef(linkDataArr);
        });
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

  /**
   * Retrieve local assets from a markdown file.
   * @param realtive The path to the markdown file relative to the base directory.
   * @returns A promise resolving to an object containing accessible and invalid link data.
   */
  public async localAssets(realtive: string) {
    const accessible: Array<AccessibleLinkDataWithRef> = [];
    const invalid: ExtractedLink[] = [];
    const invalidHandler = (it: ExtractedLink) => invalid.push(it);
    const accessibleHandler = async (data: AccessibleLinkData) => {
      const refs = await this.getExternalRefs(realtive, data.absolute);

      accessible.push({
        ...data,
        externalRefs: refs || [],
      });
    };

    await this.localAssetAccessibility(realtive, {
      invalidHandler,
      accessibleHandler,
    });

    // Clear cache after processing to free up memory
    this._cache = {};

    return { accessible, invalid };
  }
}
