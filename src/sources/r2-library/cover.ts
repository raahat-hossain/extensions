import type { R2Config } from "./config";
import {
  chapterNameMatches,
  extractArchivePageDataUrl,
  findArchiveByChapterName,
  parseChapterPageRef,
} from "./archive";
import { imageUrlsOf, pagesForChapterUrl } from "./gallery";
import type { DetailsFile } from "./details";
import { listImageKeys } from "./pages";
import { getObjectBytes, imageUrl, listAll } from "./r2";

export type CoverArchive = {
  key: string;
  name: string;
};

export type CoverFolder = {
  prefix: string;
  name: string;
};

export type CoverRemote = {
  name: string;
  url: string;
};

const coverCache = new Map<string, string>();

/** Tiny neutral PNG so list tiles always have a coverImage. */
export const PLACEHOLDER_COVER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAPElEQVR42mNgYGD4z8DAwMDAyMjI8N/RhD4z8DIyAhlwBRABRkZGf6D5MEKYJJwBTA+AFjpAwB+1Qn6nY5qAAAAAABJRU5ErkJggg==";

const pickImage = (keys: string[], page: string): string | undefined => {
  if (/^\d+$/.test(page)) return keys[Number(page) - 1];
  const target = page.toLowerCase();
  return keys.find((key) => {
    const name = key.split("/").pop()?.toLowerCase() ?? "";
    return name === target || name.replace(/\.[^.]+$/, "") === target.replace(/\.[^.]+$/, "");
  });
};

/**
 * Resolve a title cover, in order:
 * 1. cover.(png|jpg|…) object in the folder
 * 2. details.cover absolute http(s) / data URL
 * 3. details.cover `Chapter 1_1` against folders, zips, or JSON galleries
 * 4. first folder / zip page
 */
export const resolveCoverImage = async (options: {
  config: R2Config;
  contentId: string;
  coverKey?: string;
  details: DetailsFile | null;
  archives: CoverArchive[];
  folders?: CoverFolder[];
  remotes?: CoverRemote[];
  allowArchiveExtract?: boolean;
  fallbackToPlaceholder?: boolean;
}): Promise<string | undefined> => {
  const {
    config,
    contentId,
    coverKey,
    details,
    archives,
    folders = [],
    remotes = [],
    allowArchiveExtract = true,
    fallbackToPlaceholder = false,
  } = options;

  if (coverKey) {
    return imageUrl(config, coverKey, 60 * 60);
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

      const folder = folders.find((entry) => chapterNameMatches(entry.name, ref.chapter));
      if (folder) {
        const listed = await listAll(config, folder.prefix);
        const keys = listImageKeys(listed.objects.map((object) => object.key));
        const key = pickImage(keys, ref.page);
        if (key) {
          const url = imageUrl(config, key, 60 * 60);
          coverCache.set(cacheKey, url);
          return url;
        }
      }

      const archive = findArchiveByChapterName(archives, ref.chapter);
      if (archive) {
        try {
          const bytes = await getObjectBytes(config, archive.key);
          const dataUrl = extractArchivePageDataUrl(bytes, ref.page);
          coverCache.set(cacheKey, dataUrl);
          return dataUrl;
        } catch {
          // try gallery chapters next
        }
      }

      const remote = remotes.find((entry) => chapterNameMatches(entry.name, ref.chapter));
      if (remote) {
        try {
          const pages = await pagesForChapterUrl(remote.url);
          const urls = imageUrlsOf(pages);
          const picked = pickImage(urls, ref.page) ?? urls[0];
          if (picked) {
            coverCache.set(cacheKey, picked);
            return picked;
          }
        } catch {
          // leave cover spec uncached so the next open can retry (CF, etc.)
        }
      }
    }
  }

  if (allowArchiveExtract && folders[0]) {
    try {
      const listed = await listAll(config, folders[0].prefix);
      const key = listImageKeys(listed.objects.map((object) => object.key))[0];
      if (key) return imageUrl(config, key, 60 * 60);
    } catch {
      // ignore
    }
  }

  if (allowArchiveExtract && archives[0]) {
    const cacheKey = `${config.bucket}:${contentId}:__first__`;
    const cached = coverCache.get(cacheKey);
    if (cached) return cached;

    try {
      const bytes = await getObjectBytes(config, archives[0].key);
      for (const guess of ["1", "1.png", "01.png", "001.png", "1.jpg", "01.jpg", "cover.png"]) {
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
