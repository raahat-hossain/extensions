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
  type PagedItemList,
  type PopulatedForm,
  type SearchRequest,
  type SourceConfiguration,
  type SourceInfo,
  type UIForm,
} from "@suwatte/toolchain/types";
import {
  basename,
  extractArchivePages,
  folderIdFromPrefix,
  isArchiveName,
  isCoverName,
  isDetailsName,
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
import { getObjectBytes, getObjectText, listAll } from "./r2";

type EntryAssets = {
  id: string;
  prefix: string;
  coverKey?: string;
  detailsKey?: string;
  archives: { key: string; name: string }[];
};

const rootPrefix = (config: R2Config) => `${config.prefix}/`;

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
  }),
  rating: ContentRating.EVERYONE,
});

const listEntries = async (config: R2Config): Promise<EntryAssets[]> => {
  const listed = await listAll(config, rootPrefix(config), "/");
  const entries: EntryAssets[] = [];

  for (const prefix of listed.prefixes) {
    const id = folderIdFromPrefix(prefix, config.prefix);
    if (!id) continue;

    const children = await listAll(config, prefix);
    const coverKey = children.objects.find((object) =>
      isCoverName(basename(object.key)),
    )?.key;
    const detailsKey = children.objects.find((object) =>
      isDetailsName(basename(object.key)),
    )?.key;
    const archives = children.objects
      .filter((object) => isArchiveName(basename(object.key)))
      .map((object) => ({
        key: object.key,
        name: basename(object.key),
      }))
      .sort((left, right) => naturalCompare(left.name, right.name));

    entries.push({ id, prefix, coverKey, detailsKey, archives });
  }

  return entries.sort((left, right) => naturalCompare(left.id, right.id));
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
    throw new Error(
      `Manga folder not found under ${config.prefix}/${contentId}/`,
    );
  }
  return entry;
};

export default class Target {
  static info: SourceInfo = {
    id: "en.r2-library",
    name: "R2 Library",
    version: 1.0,
    website: "https://developers.cloudflare.com/r2/",
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
    const prefix = (await ObjectStore.string(SETTINGS.prefix)) ?? "manga";
    const hasSecret = !!(await ObjectStore.string(SETTINGS.secretAccessKey));

    return {
      sections: [
        {
          header: "Cloudflare R2",
          footer:
            "Create an R2 API token with Object Read. Leave Endpoint blank to use https://<accountId>.r2.cloudflarestorage.com",
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
              placeholder: "manga",
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
    const coverImage = await resolveCoverImage({
      config,
      contentId,
      coverKey: entry.coverKey,
      details,
      archives: entry.archives,
    });

    if (!coverImage) {
      throw new Error(
        `Missing cover for ${config.prefix}/${contentId}/. Add cover.(png|jpg|webp), or set details.cover to an http(s) URL or a chapter page ref like "chapter 4_24.png".`,
      );
    }

    if (details) {
      // Don't let a chapter-page ref / relative cover leak through as coverImage.
      return contentFromDetails(
        { ...details, cover: undefined },
        {
          id: contentId,
          coverImage,
        },
      );
    }

    return {
      title: contentId,
      coverImage,
      rating: ContentRating.EVERYONE,
      status: ContentStatus.UNKNOWN,
      contentType: ContentType.MANGA,
      summary: `Imported from R2 folder ${config.prefix}/${contentId}/`,
      additionalDetails: {
        Folder: contentId,
        Chapters: String(entry.archives.length),
      },
    };
  };

  getChapters = async (contentId: string): Promise<Chapter[]> => {
    const config = await loadConfig();
    const entry = await findEntry(config, contentId);

    return entry.archives.map((archive, index) => ({
      id: encodeURIComponent(archive.key),
      index,
      number: parseChapterNumber(archive.name, index + 1),
      language: "en",
      title: archive.name.replace(/\.(cbz|zip)$/i, ""),
      date: new Date(),
    }));
  };

  getChapterPages = async (
    _contentId: string,
    chapterId: string,
  ): Promise<ChapterPage[]> => {
    const config = await loadConfig();
    const key = decodeURIComponent(chapterId);
    const bytes = await getObjectBytes(config, key);
    return extractArchivePages(bytes).map((page) => ({ b64: page.b64 }));
  };
}
