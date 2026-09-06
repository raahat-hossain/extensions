import type { R2Config } from "./config";
import {
  extractArchivePageDataUrl,
  findArchiveByChapterName,
  parseChapterPageRef,
} from "./archive";
import type { DetailsFile } from "./details";
import { getObjectBytes, presignGet } from "./r2";

export type CoverArchive = {
  key: string;
  name: string;
};

const coverCache = new Map<string, string>();

/**
 * Resolve a title cover, in order:
 * 1. cover.(png|jpg|jpeg|webp|…) object in the folder
 * 2. details.cover absolute http(s) URL
 * 3. details.cover chapter-page ref: "[chapter name]_[page name]"
 *    e.g. "chapter 4_24.png" → page 24.png inside chapter 4.cbz
 */
export const resolveCoverImage = async (options: {
  config: R2Config;
  contentId: string;
  coverKey?: string;
  details: DetailsFile | null;
  archives: CoverArchive[];
}): Promise<string | undefined> => {
  const { config, contentId, coverKey, details, archives } = options;

  if (coverKey) {
    return presignGet(config, coverKey, 60 * 60);
  }

  const coverValue = details?.cover?.trim();
  if (!coverValue) return undefined;

  if (/^https?:\/\//i.test(coverValue) || coverValue.startsWith("data:")) {
    return coverValue;
  }

  const ref = parseChapterPageRef(coverValue);
  if (!ref) return undefined;

  const cacheKey = `${config.bucket}:${contentId}:${ref.chapter}:${ref.page}`;
  const cached = coverCache.get(cacheKey);
  if (cached) return cached;

  const archive = findArchiveByChapterName(archives, ref.chapter);
  if (!archive) {
    throw new Error(
      `Cover ref "${coverValue}" points at chapter "${ref.chapter}", but no matching .cbz/.zip was found in ${config.prefix}/${contentId}/`,
    );
  }

  const bytes = await getObjectBytes(config, archive.key);
  const dataUrl = extractArchivePageDataUrl(bytes, ref.page);
  coverCache.set(cacheKey, dataUrl);
  return dataUrl;
};
