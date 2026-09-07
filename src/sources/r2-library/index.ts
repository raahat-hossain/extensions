"use httpclient";

import {
  ContentRating,
  ContentStatus,
  ContentType,
  UITextField,
  type Chapter,
  type ChapterPage,
  type Content,
  type HomePage,
  type Item,
  type ItemListRequest,
  type NetworkRequest,
  type PagedItemList,
  type PopulatedForm,
  type SearchRequest,
  type SourceConfiguration,
  type SourceInfo,
  type UIForm,
} from "@suwatte/toolchain/types";
import {
  basename,
  folderIdFromPrefix,
  isArchiveName,
  isCoverName,
  isDetailsName,
  isImageName,
  naturalCompare,
  parseChapterNumber,
} from "./archive";
import { loadConfig, saveConfig, SETTINGS, type R2Config } from "./config";
import { resolveCoverImage } from "./cover";
import {
  contentFromDetails,
  parseDetailsJson,
  type DetailsFile,
} from "./details";
import { dataUrlForPage, listImageKeys, openArchiveSession } from "./pages";
import { getObjectBytes, getObjectText, listAll, presignGet } from "./r2";

type ChapterRef =
  | { kind: "zip"; key: string; name: string }
  | { kind: "dir"; prefix: string; name: string }
  | { kind: "loose"; prefix: string; name: string };

type EntryAssets = {
  id: string;
  prefix: string;
  coverKey?: string;
  detailsKey?: string;
  /** Zip/cbz archives kept for cover extraction fallbacks. */
  archives: { key: string; name: string }[];
  chapters: ChapterRef[];
};

const encodeChapterId = (chapter: ChapterRef): string => {
  if (chapter.kind === "zip") return `zip:${encodeURIComponent(chapter.key)}`;
  if (chapter.kind === "dir") return `dir:${encodeURIComponent(chapter.prefix)}`;
  return `loose:${encodeURIComponent(chapter.prefix)}`;
};

const decodeChapterId = (
  chapterId: string,
): { kind: ChapterRef["kind"]; value: string } => {
  if (chapterId.startsWith("zip:")) {
    return { kind: "zip", value: decodeURIComponent(chapterId.slice(4)) };
  }
  if (chapterId.startsWith("dir:")) {
    return { kind: "dir", value: decodeURIComponent(chapterId.slice(4)) };
  }
  if (chapterId.startsWith("loose:")) {
    return { kind: "loose", value: decodeURIComponent(chapterId.slice(6)) };
  }
  // Legacy ids were bare encodeURIComponent(archiveKey).
  return { kind: "zip", value: decodeURIComponent(chapterId) };
};

/** Empty prefix = bucket root. Never emit a bare "/" list prefix. */
const rootPrefix = (prefix: string): string => {
  const value = prefix.replace(/^\/+|\/+$/g, "");
  return value ? `${value}/` : "";
};

const toItem = async (
  config: R2Config,
  entry: EntryAssets,
  details: DetailsFile | null,
  title?: string,
): Promise<Item> => ({
  id: entry.id,
  title: title ?? details?.title ?? entry.id,
  coverImage: await resolveCoverImage({
    config,
    contentId: entry.id,
    coverKey: entry.coverKey,
    details,
    archives: entry.archives,
    allowArchiveExtract: false,
    fallbackToPlaceholder: true,
  }),
  rating: ContentRating.EVERYONE,
});

const buildEntries = async (
  config: R2Config,
  folderPrefixes: string[],
  root: string,
): Promise<EntryAssets[]> => {
  const entries: EntryAssets[] = [];
  const rootId = root.replace(/\/+$/, "");

  for (const prefix of folderPrefixes) {
    const id = folderIdFromPrefix(prefix, rootId);
    if (!id || id.includes("/")) continue;

    // Delimiter listing: chapter subfolders as common prefixes + files at this level.
    const listed = await listAll(config, prefix, "/");
    const coverKey = listed.objects.find((object) =>
      isCoverName(basename(object.key)),
    )?.key;
    const detailsKey = listed.objects.find((object) =>
      isDetailsName(basename(object.key)),
    )?.key;
    const archives = listed.objects
      .filter((object) => isArchiveName(basename(object.key)))
      .map((object) => ({
        key: object.key,
        name: basename(object.key),
      }))
      .sort((left, right) => naturalCompare(left.name, right.name));

    const folders: ChapterRef[] = listed.prefixes
      .map((childPrefix) => {
        const name = folderIdFromPrefix(childPrefix, prefix.replace(/\/+$/, ""));
        if (!name || name.includes("/")) return null;
        return {
          kind: "dir" as const,
          prefix: childPrefix.endsWith("/") ? childPrefix : `${childPrefix}/`,
          name,
        };
      })
      .filter((value): value is ChapterRef & { kind: "dir" } => !!value)
      .sort((left, right) => naturalCompare(left.name, right.name));

    const looseImages = listed.objects.filter((object) => {
      const name = basename(object.key);
      return isImageName(name) && !isCoverName(name);
    });

    const chapters: ChapterRef[] = [
      ...folders,
      ...archives.map((archive) => ({
        kind: "zip" as const,
        key: archive.key,
        name: archive.name,
      })),
    ];

    // Images directly under the title folder = single loose chapter.
    if (looseImages.length && !folders.length) {
      chapters.unshift({
        kind: "loose",
        prefix,
        name: "Chapter",
      });
    } else if (looseImages.length && folders.length) {
      // Mixed layout: keep loose images as their own chapter at the end.
      chapters.push({
        kind: "loose",
        prefix,
        name: "Root",
      });
    }

    chapters.sort((left, right) => naturalCompare(left.name, right.name));

    // Prefer explicit cover; else first loose image at title root.
    const inferredCover =
      coverKey ??
      looseImages.sort((a, b) =>
        naturalCompare(basename(a.key), basename(b.key)),
      )[0]?.key;

    if (!chapters.length && !detailsKey && !inferredCover) continue;

    entries.push({
      id,
      prefix,
      coverKey: inferredCover,
      detailsKey,
      archives,
      chapters,
    });
  }

  return entries.sort((left, right) => naturalCompare(left.id, right.id));
};

const listEntriesAtRoot = async (
  config: R2Config,
  root: string,
): Promise<EntryAssets[]> => {
  const listed = await listAll(config, root, "/");
  let folderPrefixes = listed.prefixes;

  if (!folderPrefixes.length) {
    const flat = await listAll(config, root);
    const ids = new Set<string>();
    for (const object of flat.objects) {
      const rest =
        root && object.key.startsWith(root)
          ? object.key.slice(root.length)
          : object.key;
      const id = rest.split("/").find((part) => part.length > 0);
      if (id) ids.add(id);
    }
    folderPrefixes = [...ids].map((id) => `${root}${id}/`);
  }

  return buildEntries(config, folderPrefixes, root);
};

const listEntries = async (config: R2Config): Promise<EntryAssets[]> => {
  const configuredRoot = rootPrefix(config.prefix);
  let entries = await listEntriesAtRoot(config, configuredRoot);

  // If Root Prefix is still "manga" but titles sit at bucket root, fall back.
  if (!entries.length && configuredRoot) {
    entries = await listEntriesAtRoot(config, "");
  }

  return entries;
};

const loadDetails = async (
  config: R2Config,
  entry: EntryAssets,
): Promise<DetailsFile | null> => {
  if (!entry.detailsKey) return null;
  try {
    return parseDetailsJson(await getObjectText(config, entry.detailsKey));
  } catch (error) {
    console.log(`Failed to parse details for ${entry.id}: ${String(error)}`);
    return null;
  }
};

const findEntry = async (
  config: R2Config,
  contentId: string,
): Promise<EntryAssets> => {
  const entry = (await listEntries(config)).find((item) => item.id === contentId);
  if (!entry) {
    const root = rootPrefix(config.prefix) || "(bucket root)/";
    throw new Error(`Manga folder not found under ${root}${contentId}/`);
  }
  return entry;
};

export default class Target {
  static info: SourceInfo = {
    id: "en.r2-library",
    name: "R2 Library",
    version: 1.6,
    website: "https://developers.cloudflare.com/r2/",
    thumbnail: "r2-library.png",
    languages: ["en"],
    rating: ContentRating.EVERYONE,
  };

  getConfiguration = (): SourceConfiguration => ({
    endpoint: ["anilist", "mal"],
  });

  getSettingsPage = async (): Promise<UIForm> => {
    const accountId = (await ObjectStore.string(SETTINGS.accountId)) ?? "";
    const accessKeyId = (await ObjectStore.string(SETTINGS.accessKeyId)) ?? "";
    const bucket = (await ObjectStore.string(SETTINGS.bucket)) ?? "";
    const endpoint = (await ObjectStore.string(SETTINGS.endpoint)) ?? "";
    const prefix = (await ObjectStore.string(SETTINGS.prefix)) ?? "";
    const hasSecret = !!(await ObjectStore.string(SETTINGS.secretAccessKey));

    return {
      sections: [
        {
          header: "Cloudflare R2",
          footer:
            "Object Read API token required. Leave Endpoint blank for the default R2 S3 URL. Leave Root Prefix empty when title folders sit at the bucket root. Chapters can be .cbz/.zip OR folders of images (preferred for large chapters).",
          views: [
            UITextField({
              id: SETTINGS.accountId,
              title: "Account ID",
              currentValue: accountId,
              placeholder: "Cloudflare account id",
            }),
            UITextField({
              id: SETTINGS.accessKeyId,
              title: "Access Key ID",
              currentValue: accessKeyId,
            }),
            UITextField({
              id: SETTINGS.secretAccessKey,
              title: "Secret Access Key",
              placeholder: hasSecret
                ? "Leave blank to keep the saved secret"
                : "R2 secret access key",
              isSecure: true,
            }),
            UITextField({
              id: SETTINGS.bucket,
              title: "Bucket",
              currentValue: bucket,
              placeholder: "manga",
            }),
            UITextField({
              id: SETTINGS.endpoint,
              title: "S3 Endpoint (optional)",
              currentValue: endpoint,
              placeholder: "https://<accountId>.r2.cloudflarestorage.com",
            }),
            UITextField({
              id: SETTINGS.prefix,
              title: "Root Prefix",
              currentValue: prefix,
              placeholder: "(empty = bucket root)",
            }),
          ],
        },
      ],
    };
  };

  onFormSubmitted = async (_id: string, data: PopulatedForm): Promise<void> => {
    await saveConfig(data as Record<string, unknown>);
  };

  getHomePage = async (): Promise<HomePage> => ({
    feeds: [
      {
        id: "library",
        title: "Library",
        content: {
          list: {
            key: "all",
            disableSorting: true,
          },
        },
      },
    ],
  });

  getSearchResults = async (
    request: SearchRequest,
    page: number,
  ): Promise<PagedItemList> => {
    if (page > 1) {
      return { items: [], isLastPage: true, total: 0 };
    }

    const config = await loadConfig();
    const entries = await listEntries(config);
    const query = request.query?.trim().toLowerCase();

    const items: Item[] = [];
    for (const entry of entries) {
      const details = await loadDetails(config, entry);
      const title = details?.title ?? entry.id;
      if (query) {
        const haystack = [
          title,
          entry.id,
          ...(details?.additionalTitles ?? []),
          details?.summary ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      items.push(await toItem(config, entry, details, title));
    }

    return { items, isLastPage: true, total: items.length };
  };

  getItemList = async (
    _request: ItemListRequest,
    page: number,
  ): Promise<PagedItemList> => {
    if (page > 1) {
      return { items: [], isLastPage: true, total: 0 };
    }

    const config = await loadConfig();
    const entries = await listEntries(config);
    const items: Item[] = [];
    for (const entry of entries) {
      const details = await loadDetails(config, entry);
      items.push(
        await toItem(config, entry, details, details?.title ?? entry.id),
      );
    }

    return { items, isLastPage: true, total: items.length };
  };

  getContent = async (contentId: string): Promise<Content> => {
    const config = await loadConfig();
    const entry = await findEntry(config, contentId);
    const details = await loadDetails(config, entry);

    let coverKey = entry.coverKey;
    if (!coverKey) {
      // Fall back to first page of the first folder chapter.
      const firstDir = entry.chapters.find((chapter) => chapter.kind === "dir");
      if (firstDir && firstDir.kind === "dir") {
        const listed = await listAll(config, firstDir.prefix);
        coverKey = listImageKeys(listed.objects.map((object) => object.key))[0];
      }
    }

    const coverImage = await resolveCoverImage({
      config,
      contentId,
      coverKey,
      details,
      archives: entry.archives,
      allowArchiveExtract: true,
      fallbackToPlaceholder: true,
    });

    if (!coverImage) {
      throw new Error(
        `Missing cover for ${contentId}. Add cover.(png|jpg|webp), put images in a chapter folder, or set details.cover.`,
      );
    }

    if (details) {
      return contentFromDetails(
        { ...details, cover: undefined },
        { id: contentId, coverImage: coverImage },
      );
    }

    return {
      title: contentId,
      coverImage: coverImage,
      rating: ContentRating.EVERYONE,
      status: ContentStatus.UNKNOWN,
      contentType: ContentType.MANGA,
      summary: `Imported from R2 folder ${contentId}/`,
      additionalDetails: {
        Folder: contentId,
        Chapters: String(entry.chapters.length),
      },
    };
  };

  getChapters = async (contentId: string): Promise<Chapter[]> => {
    const config = await loadConfig();
    const entry = await findEntry(config, contentId);

    return entry.chapters.map((chapter, index) => ({
      id: encodeChapterId(chapter),
      index,
      number: parseChapterNumber(chapter.name, index + 1),
      language: "en",
      title: chapter.name.replace(/\.(cbz|zip)$/i, ""),
      date: new Date(),
    }));
  };

  getChapterPages = async (
    _contentId: string,
    chapterId: string,
  ): Promise<ChapterPage[]> => {
    const config = await loadConfig();
    const decoded = decodeChapterId(chapterId);

    if (decoded.kind === "dir" || decoded.kind === "loose") {
      const prefix = decoded.value.endsWith("/")
        ? decoded.value
        : `${decoded.value}/`;
      // Folder chapters: list image objects and return presigned URLs.
      // No unzip / no 80 MiB cap — Suwatte loads pages like any remote source.
      const listed =
        decoded.kind === "loose"
          ? await listAll(config, prefix, "/")
          : await listAll(config, prefix);
      const keys =
        decoded.kind === "loose"
          ? listImageKeys(
              listed.objects
                .filter((object) => {
                  const name = basename(object.key);
                  return isImageName(name) && !isCoverName(name);
                })
                .map((object) => object.key),
            )
          : listImageKeys(listed.objects.map((object) => object.key));
      if (!keys.length) {
        throw new Error(`No images found under ${prefix}`);
      }
      return keys.map((key) => ({
        url: presignGet(config, key, 60 * 60 * 6),
      }));
    }

    const bytes = await getObjectBytes(config, decoded.value);
    // Keep image bytes in a JSC session; only return tiny URLs across the bridge.
    const { urls } = openArchiveSession(bytes);
    return urls.map((url) => ({ url }));
  };

  /**
   * Resolve session page URLs to data: URIs so Nuke never hits a fake host.
   * Presigned R2 URLs pass through unchanged.
   */
  willRequestImage = async (
    request: NetworkRequest | string,
  ): Promise<NetworkRequest> => {
    const url = typeof request === "string" ? request : request.url;
    const dataUrl = dataUrlForPage(url);
    if (!dataUrl) {
      return typeof request === "string" ? { url: request } : request;
    }
    return typeof request === "string"
      ? { url: dataUrl }
      : { ...request, url: dataUrl };
  };
}
