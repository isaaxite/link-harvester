import { accessSync, constants } from "node:fs";
import { RESOURCE_EXTENSIONS } from "./constants";
import { FilterPredicate, LinkTarget, OpDescriptor, OpDescriptorType, OpFilterDescriptor } from "./types";
import { isOpFilterDescriptor } from "./types/assert";
import { sep } from "node:path";

/**
 * Checks if a URL points to a resource file based on its file extension
 * @param url - The URL to check
 * @returns True if the URL has a resource file extension
 */
export function isResourceUrl(url: string) {
  try {
    const cleanPath = url.split('?')[0].split('#')[0];
    const ext = (cleanPath.split('.').pop() || '').toLowerCase();
    return RESOURCE_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

/**
 * Checks if a local file is accessible (exists and is readable)
 * @param path - The file path to check
 * @returns True if the file is accessible
 */
export function isAccessible(path: string) {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Classifies a single URL into one of the LinkTarget categories.
 * @param url - The URL to classify.
 * @returns The LinkTarget category for the given URL.
 */
export function classifyLink(url: string) {
  const trimmed = (url || '').trim();

  // Empty or whitespace-only URLs are classified as 'other'
  if (!trimmed) {
    return LinkTarget.Other;
  }
  
  // In-page anchors start with '#'
  if (trimmed.startsWith('#')) {
    return LinkTarget.InPageAnchor;
  }

  // External URLs start with http:// or https://
  if (/^https?:\/\//i.test(trimmed)) {
    if (isResourceUrl(trimmed)) {
      return LinkTarget.ExternalResource;
    } else {
      return LinkTarget.ExternalPage;
    }
  }

  // URLs with a scheme (e.g., mailto:, ftp:) are classified as 'other'
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    return LinkTarget.Other;
  }

  // All other URLs are treated as local resources
  return LinkTarget.LocalResource;
}

/**
 * Removes trailing path separators from a file path
 * @param pathStr - The path string to clean
 * @returns The path without trailing separators
 */
export function removeTrailSep(pathStr: string) {
  return pathStr.replace(new RegExp(`${sep}+$`), '');
}

/**
 * Merges consecutive filter operations into a single filter with combined predicate
 * @param ops - Array of operation descriptors
 * @returns Optimized array with merged filters
 */
function mergeFilters(ops: OpDescriptor[]) {
  const result: OpDescriptor[] = [];
  let i = 0;

  while (i < ops.length) {
    if (!isOpFilterDescriptor(ops[i])) {
      result.push(ops[i++]);
      continue; 
    }

    const predicates: Array<FilterPredicate> = [];

    while (i < ops.length && isOpFilterDescriptor(ops[i])) {
      const op = ops[i++] as OpFilterDescriptor;
      predicates.push(op.predicate);
    }

    result.push({
      type: OpDescriptorType.Filter,
      predicate: x => [...predicates].every(p => p(x)),
    });
  }
  return result;
}

/**
 * Removes duplicate detection operations, keeping only the first occurrence of each type
 * @param opArr - Array of operation descriptors
 * @returns Optimized array with deduplicated detection operations
 */
function dedupeDetect(opArr: OpDescriptor[]) {
  const dedupe: string[] = [];
  const result: OpDescriptor[] = [];
  const rest = [];

  for (const op of opArr) {
    if ([
      OpDescriptorType.DetectExternalRefs,
      OpDescriptorType.DetectAccessible,
    ].includes(op.type)) {

      if (dedupe.includes(op.type)) {
        continue;
      }
      dedupe.push(op.type);
      result.push(op);
      continue;
    }

    rest.push(op);
  }
  dedupe.length = 0;

  result.push(...rest);

  return result;
}

/**
 * Optimizes a list of operation descriptors by:
 * 1. Deduplicating detection operations
 * 2. Merging consecutive filter operations
 * @param ops - Array of operation descriptors to optimize
 * @returns Optimized array of operation descriptors
 */
export function optimizeOps(ops: OpDescriptor[]) {
  let opArr = dedupeDetect([...ops]);

  opArr = mergeFilters(opArr);
  
  return opArr;
}
