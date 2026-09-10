import type { R2Config } from "./config";
import {
  basename,
  chapterNameMatches,
  extractArchivePageDataUrl,
  findArchiveByChapterName,
  isImageName,
  parseChapterPageRef,
  type ChapterPageRef,
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

export type CoverSpec =
  | { kind: "direct"; value: string }
  | { kind: "ref"; ref: ChapterPageRef }
  | { kind: "key"; key: string };

const coverCache = new Map<string, string>();

/** Tiny neutral PNG so list tiles always have a coverImage. */
export const PLACEHOLDER_COVER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAPElEQVR42mNgYGD4z8DAwMDAyMjI8N/RhD4z8DIyAhlwBRABRkZGf6D5MEKYJJwBTA+AFjpAwB+1Qn6nY5qAAAAAABJRU5ErkJggg==";

const pickImage = (keys: string[], page: string): string | undefined => {
  if (/^\d+$/.test(page)) return keys[Number(page) - 1];
  const target = page.toLowerCase();
  return keys.find((key) => {
    const name = key.split("/").pop()?.toLowerCase() ?? "";
    return (
      name === target ||
      name.replace(/\.[^.]+$/, "") === target.replace(/\.[^.]+$/, "")
    );
  });
};

export const relativeCoverKey = (
  cover: string,
  seriesPrefix: string,
): string | null => {
  const prefix = seriesPrefix.replace(/\/+$/, "");
  const trimmed = cover.replace(/^\/+/, "");
  const alreadyUnder =
    !!prefix &&
    (cover === prefix ||
      cover.startsWith(`${prefix}/`) ||
      trimmed.startsWith(`${prefix}/`));
  const key = alreadyUnder
    ? trimmed
    : prefix
      ? `${prefix}/${trimmed}`
      : trimmed;
  return isImageName(basename(key)) ? key : null;
};

/**
 * Same order as Mihon `resolveDetailsCover`:
 * absolute URL / data URI → `Chapter 1_1` → relative image key.
 */
export const classifyCoverSpec = (
  cover: string,
  seriesPrefix: string,
): CoverSpec | null => {
  const trimmed = cover.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return { kind: "direct", value: trimmed };
  }
  const ref = parseChapterPageRef(trimmed);
  if (ref) return { kind: "ref", ref };
  const key = relativeCoverKey(trimmed, seriesPrefix);
  return key ? { kind: "key", key } : null;
};

const coverCacheKey = (
  config: R2Config,
  contentId: string,
  coverSpec: string | undefined,
): string => `${config.bucket}:${contentId}\u0000${coverSpec ?? ""}`;

const resolveCoverRef = async (options: {
  config: R2Config;
  ref: ChapterPageRef;
  archives: CoverArchive[];
  folders: CoverFolder[];
  remotes: CoverRemote[];
  allowArchiveExtract: boolean;
}): Promise<string | undefined> => {
  const { config, ref, archives, folders, remotes, allowArchiveExtract } =
    options;

  const folder = folders.find((entry) =>
    chapterNameMatches(entry.name, ref.chapter),
  );
  if (folder) {
    const listed = await listAll(config, folder.prefix);
    const keys = listImageKeys(listed.objects.map((object) => object.key));
    const key = pickImage(keys, ref.page);
    if (key) return imageUrl(config, key, 60 * 60);
  }

  if (allowArchiveExtract) {
    const archive = findArchiveByChapterName(archives, ref.chapter);
    if (archive) {
      try {
        const bytes = await getObjectBytes(config, archive.key);
        return extractArchivePageDataUrl(bytes, ref.page);
      } catch {
        // try gallery chapters next
      }
    }
  }

  const remote = remotes.find((entry) =>
    chapterNameMatches(entry.name, ref.chapter),
  );
  if (remote) {
    try {
      const pages = await pagesForChapterUrl(remote.url);
      const urls = imageUrlsOf(pages);
      return pickImage(urls, ref.page);
    } catch {
      // leave cover spec uncached so the next open can retry (CF, etc.)
    }
  }

  return undefined;
};

/**
 * Resolve a title cover, matching Mihon:
 * 1. details.cover (absolute / data / `Chapter 1_1` / relative image)
 * 2. cover.(png|jpg|…) object in the folder
 * 3. first folder page, then first zip page
 *
 * A failed cover spec is not cached — retry next open.
 */
export const resolveCoverImage = async (options: {
  config: R2Config;
  contentId: string;
  seriesPrefix?: string;
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
    seriesPrefix = "",
    coverKey,
    details,
    archives,
    folders = [],
    remotes = [],
    allowArchiveExtract = true,
    fallbackToPlaceholder = false,
  } = options;

  const coverValue = details?.cover?.trim() || undefined;
  const cacheKey = coverCacheKey(config, contentId, coverValue);
  const cached = coverCache.get(cacheKey);
  if (cached) return cached;

  if (coverValue) {
    const spec = classifyCoverSpec(coverValue, seriesPrefix);
    let resolved: string | undefined;
    if (spec?.kind === "direct") resolved = spec.value;
    else if (spec?.kind === "key") resolved = imageUrl(config, spec.key, 60 * 60);
    else if (spec?.kind === "ref") {
      resolved = await resolveCoverRef({
        config,
        ref: spec.ref,
        archives,
        folders,
        remotes,
        allowArchiveExtract,
      });
    }
    if (resolved) {
      coverCache.set(cacheKey, resolved);
      return resolved;
    }
  }

  const fallback = async (): Promise<string | undefined> => {
    if (coverKey) return imageUrl(config, coverKey, 60 * 60);

    if (folders[0]) {
      try {
        const listed = await listAll(config, folders[0].prefix);
        const key = listImageKeys(listed.objects.map((object) => object.key))[0];
        if (key) return imageUrl(config, key, 60 * 60);
      } catch {
        // ignore
      }
    }

    if (allowArchiveExtract && archives[0]) {
      try {
        const bytes = await getObjectBytes(config, archives[0].key);
        for (const guess of [
          "1",
          "1.png",
          "01.png",
          "001.png",
          "1.jpg",
          "01.jpg",
          "cover.png",
        ]) {
          try {
            return extractArchivePageDataUrl(bytes, guess);
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

  const url = await fallback();
  // Don't pin a fallback while a cover ref is set — retry until the chapter resolves.
  if (url && !coverValue) coverCache.set(cacheKey, url);
  return url;
};
