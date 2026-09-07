"use httpclient";

import {
  ContentRating,
  PickerFilter,
  SearchFilter,
  TextFilter,
  type Chapter,
  type ChapterPage,
  type Content,
  type HomePage,
  type ItemListRequest,
  type PagedItemList,
  type SearchRequest,
  type SourceConfiguration,
  type SourceInfo,
} from "@suwatte/toolchain/types";
import {
  galleryById,
  imageServer,
  isLastPage,
  latestGalleries,
  searchGalleries,
  thumbServer,
} from "./api";
import { chapterFromHentai, contentFromHentai, itemFromGallery } from "./map";

const PREFIX_ID_SEARCH = "id:";

const extractGalleryId = (query: string): string | undefined => {
  const trimmed = query.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith(PREFIX_ID_SEARCH)) {
    return trimmed.slice(PREFIX_ID_SEARCH.length).trim();
  }

  if (/^\d+$/.test(trimmed)) return trimmed;

  const urlMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?nhentai\.net\/g\/(\d+)/i,
  );
  return urlMatch?.[1];
};

const pagedFromSearch = async (
  response: Awaited<ReturnType<typeof searchGalleries>>,
  page: number,
): Promise<PagedItemList> => {
  const thumb = await thumbServer();
  const items = response.result.map((entry) => itemFromGallery(entry, thumb));
  return {
    items,
    isLastPage: isLastPage(response, page),
    total: response.total ?? undefined,
  };
};

export default class Target {
  static info: SourceInfo = {
    id: "all.nhentai",
    name: "NHentai",
    version: 1.0,
    website: "https://nhentai.net",
    languages: ["all", "en", "ja", "zh"],
    rating: ContentRating.MATURE,
  };

  getConfiguration = (): SourceConfiguration => ({
    imageReferer: "https://nhentai.net/",
  });

  getHomePage = async (): Promise<HomePage> => ({
    feeds: [
      {
        id: "popular",
        title: "Popular",
        content: { list: { key: "popular", disableSorting: true } },
      },
      {
        id: "latest",
        title: "Latest",
        content: { list: { key: "latest", disableSorting: true } },
      },
    ],
  });

  getSearchFilters = async () => [
    SearchFilter(
      "sort",
      "Sort By",
      PickerFilter([
        { id: "popular", title: "Popular: All Time" },
        { id: "popular-month", title: "Popular: Month" },
        { id: "popular-week", title: "Popular: Week" },
        { id: "popular-today", title: "Popular: Today" },
        { id: "date", title: "Recent" },
      ]),
    ),
    SearchFilter(
      "tags",
      "Tags",
      TextFilter(),
      "Comma-separated. Prepend - to exclude.",
    ),
    SearchFilter("artists", "Artists", TextFilter()),
    SearchFilter("groups", "Groups", TextFilter()),
    SearchFilter("parodies", "Parodies", TextFilter()),
    SearchFilter("characters", "Characters", TextFilter()),
    SearchFilter("categories", "Categories", TextFilter()),
  ];

  getSearchResults = async (
    request: SearchRequest,
    page: number,
  ): Promise<PagedItemList> => {
    const query = request.query?.trim() ?? "";
    const id = extractGalleryId(query);
    if (id) {
      if (page > 1) return { items: [], isLastPage: true, total: 0 };
      const data = await galleryById(id);
      const thumb = await thumbServer();
      return {
        items: [
          itemFromGallery(
            {
              id: data.id,
              thumbnail: data.thumbnail.path,
              english_title: data.title.english,
              japanese_title: data.title.japanese,
            },
            thumb,
          ),
        ],
        isLastPage: true,
        total: 1,
      };
    }

    const filters = request.filters ?? {};
    const sort =
      (typeof filters.sort === "string" && filters.sort) || "popular";

    const advParts: string[] = [];
    const appendAdv = (key: string, value: unknown) => {
      if (typeof value !== "string" || !value.trim()) return;
      for (const raw of value.split(",")) {
        const tag = raw.trim();
        if (!tag) continue;
        const exclude = tag.startsWith("-");
        const body = tag.replace(/^-/, "");
        advParts.push(`${exclude ? "-" : ""}${key}:"${body}"`);
      }
    };

    appendAdv("tag", filters.tags);
    appendAdv("artist", filters.artists);
    appendAdv("group", filters.groups);
    appendAdv("parody", filters.parodies);
    appendAdv("character", filters.characters);
    appendAdv("category", filters.categories);

    const combined = [query, ...advParts].filter(Boolean).join(" ").trim();
    const response = await searchGalleries({
      query: combined || '""',
      page,
      sort,
    });
    return pagedFromSearch(response, page);
  };

  getItemList = async (
    request: ItemListRequest,
    page: number,
  ): Promise<PagedItemList> => {
    if (request.key === "latest") {
      const response = await latestGalleries(page);
      const thumb = await thumbServer();
      return {
        items: response.result.map((entry) => itemFromGallery(entry, thumb)),
        isLastPage: isLastPage(response, page),
        total: response.total ?? undefined,
      };
    }

    const response = await searchGalleries({
      query: '""',
      page,
      sort: "popular",
    });
    return pagedFromSearch(response, page);
  };

  getContent = async (contentId: string): Promise<Content> => {
    const data = await galleryById(contentId);
    const thumb = await thumbServer();
    return contentFromHentai(data, thumb);
  };

  getChapters = async (contentId: string): Promise<Chapter[]> => {
    const data = await galleryById(contentId);
    return [chapterFromHentai(data)];
  };

  getChapterPages = async (
    contentId: string,
    _chapterId: string,
  ): Promise<ChapterPage[]> => {
    const data = await galleryById(contentId);
    const server = await imageServer();
    return data.pages.map((page) => ({
      url: `${server}/${page.path}`,
    }));
  };
}
