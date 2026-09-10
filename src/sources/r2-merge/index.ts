"use httpclient";

import {
  ContentRating,
  ContentStatus,
  ContentType,
  UITextField,
  UIWebViewButton,
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
import { createProtectedClient } from "../_shared/client";
import {
  basename,
  folderIdFromPrefix,
  isCoverName,
  isDetailsName,
  naturalCompare,
} from "../r2-library/archive";
import { PLACEHOLDER_COVER, resolveCoverImage } from "../r2-library/cover";
import {
  contentFromDetails,
  parseDetailsJson,
  type DetailsFile,
} from "../r2-library/details";
import { getObjectText, listAll, presignGet } from "../r2-library/r2";
import { pagesForChapter } from "./adapters";
import {
  findChapter,
  isChaptersName,
  parseChaptersJson,
  type ParsedChapter,
} from "./chapters";
import { loadConfig, saveConfig, SETTINGS, type R2Config } from "./config";
import { refererForImage } from "./sites";
import { CF_RESOLVE as HENTAIREAD_CF } from "../hentairead/constants";

type EntryAssets = {
  id: string;
  prefix: string;
  coverKey?: string;
  detailsKey?: string;
  chaptersKey: string;
};

const IMAGE_ACCEPT =
  "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";

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
  coverImage:
    (await resolveCoverImage({
      config,
      contentId: entry.id,
      coverKey: entry.coverKey,
      details,
      archives: [],
      allowArchiveExtract: false,
      fallbackToPlaceholder: true,
    })) ?? PLACEHOLDER_COVER,
  rating: ContentRating.MATURE,
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

    const listed = await listAll(config, prefix, "/");
    const chaptersKey = listed.objects.find((object) =>
      isChaptersName(basename(object.key)),
    )?.key;
    if (!chaptersKey) continue;

    const coverKey = listed.objects.find((object) =>
      isCoverName(basename(object.key)),
    )?.key;
    const detailsKey = listed.objects.find((object) =>
      isDetailsName(basename(object.key)),
    )?.key;

    entries.push({
      id,
      prefix,
      coverKey,
      detailsKey,
      chaptersKey,
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

const loadChapters = async (
  config: R2Config,
  entry: EntryAssets,
): Promise<ParsedChapter[]> =>
  parseChaptersJson(await getObjectText(config, entry.chaptersKey));

const findEntry = async (
  config: R2Config,
  contentId: string,
): Promise<EntryAssets> => {
  const entry = (await listEntries(config)).find((item) => item.id === contentId);
  if (!entry) {
    const root = rootPrefix(config.prefix) || "(bucket root)/";
    throw new Error(
      `Merge folder not found under ${root}${contentId}/ (needs chapters.json)`,
    );
  }
  return entry;
};

export default class Target {
  client = createProtectedClient(HENTAIREAD_CF);

  static info: SourceInfo = {
    id: "en.r2-merge",
    name: "R2 Merge",
    version: 1.0,
    website: "https://developers.cloudflare.com/r2/",
    thumbnail: "r2-merge.png",
    languages: ["en", "all"],
    rating: ContentRating.MATURE,
  };

  getConfiguration = (): SourceConfiguration =>
    ({
      endpoint: ["anilist", "mal"],
      cloudflareResolutionURL: HENTAIREAD_CF,
      useClientForImageRequests: true,
    }) as SourceConfiguration;

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
            "Same bucket layout as R2 Library, but only folders with chapters.json appear here. Each chapter URL is fetched from nhentai / HentaiRead / HentaiNexus / Hentai2Read. Leave Root Prefix empty when title folders sit at the bucket root.",
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
        {
          header: "Site challenges",
          footer:
            "HentaiRead / Hentai2Read sit behind Cloudflare. Open the matching challenge once if a chapter from that site fails to load. nhentai uses the public API and usually does not need this.",
          views: [
            UIWebViewButton({
              title: "HentaiRead challenge",
              url: { url: HENTAIREAD_CF },
            }),
            UIWebViewButton({
              title: "Hentai2Read challenge",
              url: { url: "https://hentai2read.com/" },
            }),
            UIWebViewButton({
              title: "HentaiNexus",
              url: { url: "https://hentainexus.com/" },
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
        title: "Merged Library",
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
    const chapters = await loadChapters(config, entry);

    const coverImage =
      (await resolveCoverImage({
        config,
        contentId,
        coverKey: entry.coverKey,
        details,
        archives: [],
        allowArchiveExtract: false,
        fallbackToPlaceholder: true,
      })) ?? PLACEHOLDER_COVER;

    const sites = [
      ...new Set(
        chapters
          .map((chapter) => chapter.site)
          .filter((site): site is NonNullable<typeof site> => !!site),
      ),
    ];

    if (details) {
      const content = contentFromDetails(
        { ...details, cover: undefined },
        { id: contentId, coverImage },
      );
      return {
        ...content,
        rating:
          details.rating == null ? ContentRating.MATURE : content.rating,
        additionalDetails: {
          ...(content.additionalDetails ?? {}),
          Chapters: String(chapters.length),
          ...(sites.length ? { Sources: sites.join(", ") } : {}),
        },
      };
    }

    return {
      title: contentId,
      coverImage,
      rating: ContentRating.MATURE,
      status: ContentStatus.UNKNOWN,
      contentType: ContentType.MANGA,
      summary: `Merged series from R2 folder ${contentId}/ (${chapters.length} chapters).`,
      additionalDetails: {
        Folder: contentId,
        Chapters: String(chapters.length),
        ...(sites.length ? { Sources: sites.join(", ") } : {}),
      },
    };
  };

  getChapters = async (contentId: string): Promise<Chapter[]> => {
    const config = await loadConfig();
    const entry = await findEntry(config, contentId);
    const chapters = await loadChapters(config, entry);

    return chapters.map((chapter, index) => ({
      id: chapter.key,
      index,
      number: chapter.number,
      volume: chapter.volume,
      language: chapter.language ?? "en",
      title: chapter.title,
      date: chapter.date ?? new Date(),
      webUrl: chapter.url,
      providers: chapter.scanlator
        ? [{ id: chapter.site ?? "group", name: chapter.scanlator, links: [] }]
        : undefined,
    }));
  };

  getChapterPages = async (
    contentId: string,
    chapterId: string,
  ): Promise<ChapterPage[]> => {
    const config = await loadConfig();
    const entry = await findEntry(config, contentId);
    const chapter = findChapter(await loadChapters(config, entry), chapterId);
    const pages = await pagesForChapter({ client: this.client }, chapter);
    if (!pages.length) {
      throw new Error(`No pages for ${chapter.title || chapterId}`);
    }
    return pages;
  };

  willRequestImage = async (
    request: NetworkRequest | string,
  ): Promise<NetworkRequest> => {
    const url = typeof request === "string" ? request : request.url;
    const referer = refererForImage(url);
    const headers: Record<string, string> = {
      ...((typeof request === "string" ? undefined : request.headers) ?? {}),
      Accept: IMAGE_ACCEPT,
    };
    if (referer) headers.Referer = referer;
    return typeof request === "string"
      ? { url: request, headers }
      : { ...request, url, headers };
  };
}
