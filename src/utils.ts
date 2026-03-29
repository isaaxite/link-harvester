import { accessSync, constants } from "node:fs";
import { RESOURCE_EXTENSIONS } from "./constants";
import { LinkTarget } from "./types";
import { sep } from "node:path";

export function isResourceUrl(url: string) {
  try {
    const cleanPath = url.split('?')[0].split('#')[0];
    const ext = (cleanPath.split('.').pop() || '').toLowerCase();
    return RESOURCE_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

/** Check if a local file is accessible (exists and is readable) */
export  function isAccessible(path: string) {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Classify a single URL into one of the LinkTarget categories.
 * @param url The URL to classify.
 * @returns The LinkTarget category for the given URL.
 */
export function classifyLink(url: string) {
  const trimmed = (url || '').trim();

  // Empty or whitespace-only URLs are classified as 'other'
  if (!trimmed) {
    return LinkTarget.OTHER;
  }
  
  // In-page anchors start with '#'
  if (trimmed.startsWith('#')) {
    return LinkTarget.IN_PAGE_ANCHOR;
  }

  // External URLs start with http:// or https://
  if (/^https?:\/\//i.test(trimmed)) {
    if (isResourceUrl(trimmed)) {
      return LinkTarget.EXTERNAL_RESOURCE;
    } else {
      return LinkTarget.EXTERNAL_PAGE;
    }
  }

  // URLs with a scheme (e.g., mailto:, ftp:) are classified as 'other'
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    return LinkTarget.OTHER;
  }

  // All other URLs are treated as local resources
  return LinkTarget.LOCAL_RESOURCE;
}

/** Remove trailing path separators from a file path */
export function noTrailSep(pathStr: string) {
  return pathStr.replace(new RegExp(`${sep}+$`), '');
}
