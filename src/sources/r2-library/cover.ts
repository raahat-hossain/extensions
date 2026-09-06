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

/** Tiny neutral PNG so list tiles always have a coverImage. */
export const PLACEHOLDER_COVER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAPElEQVR42mNgYGD4z8DAwMgABXAGJAEY6AAjAwMDAyMjI8N/RhD4z8DIyAhlwBRABRkZGf6D5MEKYJJwBTA+AFjpAwB+1Qn6nY5qAAAAAABJRU5ErkJggg==";

/**
 * Resolve a title cover, in order:
 * 1. cover.(png|jpg|jpeg|webp|…) object in the folder
 * 2. details.cover absolute http(s) URL
 * 3. details.cover chapter-page ref: "[chapter name]_[page name]"
 * 4. (optional) first page of the first chapter archive
 */
export const resolveCoverImage = async (options: {
  config: R2Config;
  contentId: string;
  coverKey?: string;
  details: DetailsFile | null;
  archives: CoverArchive[];
  allowArchiveExtract?: boolean;
  fallbackToPlaceholder?: boolean;
}): Promise<string | undefined> => {
  const {
    config,
    contentId,
    coverKey,
    details,
    archives,
    allowArchiveExtract = true,
    fallbackToPlaceholder = false,
  } = options;

  if (coverKey) {
    return presignGet(config, coverKey, 60 * 60);
  }

  const coverValue = details?.cover?.trim();
  if (coverValue) {
    if (/^https?:\/\//i.test(coverValue) || coverValue.startsWith("data:")) {
      return coverValue;
    }

    const ref = parseChapterPageRef(coverValue);
    if (ref && allowArchiveExtract) {
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
    }
  }

  if (allowArchiveExtract && archives[0]) {
    const cacheKey = `${config.bucket}:${contentId}:__first__`;
    const cached = coverCache.get(cacheKey);
    if (cached) return cached;

    try {
      const bytes = await getObjectBytes(config, archives[0].key);
      for (const guess of ["1.png", "01.png", "001.png", "1.jpg", "01.jpg", "cover.png"]) {
        try {
          const dataUrl = extractArchivePageDataUrl(bytes, guess);
          coverCache.set(cacheKey, dataUrl);
          return dataUrl;
        } catch {
          // try next guess
        }
      }
    } catch {
      // ignore
    }
  }

  return fallbackToPlaceholder ? PLACEHOLDER_COVER : undefined;
};
