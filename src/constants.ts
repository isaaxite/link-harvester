/**
 * Set of file extensions that are considered resource files (non-page files)
 * Includes images, documents, videos, audio, archives, and fonts
 */
export const RESOURCE_EXTENSIONS = new Set([
  // Common image formats
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif',
  // Common document formats
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  // Common video formats
  'mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv',
  // Common audio formats
  'mp3', 'wav', 'flac', 'aac', 'm4a',
  // Common archive formats
  'zip', 'tar', 'gz', 'rar', '7z', 'dmg', 'exe', 'apk',
  // Common font formats
  'woff', 'woff2', 'ttf', 'otf',
]);

/**
 * Special key used in classification buckets to capture all unmatched items
 */
export const REST_KEY = 'rest' as const;
