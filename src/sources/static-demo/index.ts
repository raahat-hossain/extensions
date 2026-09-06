import {
  ContentDestination,
  ContentRating,
  ContentStatus,
  ContentType,
  PickerFilter,
  SearchFilter,
  SelectFilter,
  type Chapter,
  type ChapterPage,
  type Content,
  type HomePage,
  type Item,
  type ItemListRequest,
  type PagedItemList,
  type SearchRequest,
  type SortOptions,
  type SourceConfiguration,
  type SourceFeed,
  type SourceInfo,
} from "@suwatte/toolchain/types";
import { allItems, byId, MANGA, type StaticManga } from "./data";

const matchesQuery = (entry: StaticManga, query?: string) => {
  if (!query?.trim()) return true;
  const needle = query.trim().toLowerCase();
  const haystack = [
    entry.content.title,
    ...(entry.content.additionalTitles ?? []),
    entry.content.summary ?? "",
    ...(entry.content.genres ?? []).map((genre) => genre.title),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
};

const matchesFilters = (
  entry: StaticManga,
  filters: SearchRequest["filters"] = {},
) => {
  const status = filters.status as string | undefined;
  if (status && status !== "any") {
    const wanted = Number(status);
    if (entry.content.status !== wanted) return false;
  }

  const type = filters.type as string | undefined;
  if (type && type !== "any") {
    const wanted = Number(type);
    if (entry.content.contentType !== wanted) return false;
  }

  const genres = filters.genres as
    | { include?: string[]; exclude?: string[] }
    | undefined;
  const genreIds = new Set((entry.content.genres ?? []).map((genre) => genre.id));
  for (const id of genres?.include ?? []) {
    if (!genreIds.has(id)) return false;
  }
  for (const id of genres?.exclude ?? []) {
    if (genreIds.has(id)) return false;
  }

  return true;
};

const sortItems = (items: Item[], sort?: SearchRequest["sort"]) => {
  const key = sort?.key ?? "title";
  const ascending = sort?.ascending ?? key === "title";
  const copy = [...items];

  copy.sort((left, right) => {
    const leftEntry = byId[left.id];
    const rightEntry = byId[right.id];
    let comparison = 0;

    switch (key) {
      case "rating":
        comparison =
          (leftEntry?.content.statistics?.rating ?? 0) -
          (rightEntry?.content.statistics?.rating ?? 0);
        break;
      case "views":
        comparison =
          (leftEntry?.content.statistics?.views ?? 0) -
          (rightEntry?.content.statistics?.views ?? 0);
        break;
      case "updated": {
        const leftDate = leftEntry?.chapters[0]?.date?.getTime() ?? 0;
        const rightDate = rightEntry?.chapters[0]?.date?.getTime() ?? 0;
        comparison = leftDate - rightDate;
        break;
      }
      case "title":
      default:
        comparison = left.title.localeCompare(right.title);
        break;
    }

    return ascending ? comparison : -comparison;
  });

  return copy;
};

const withRelatedDestinations = (entry: StaticManga): Content => {
  const collections = entry.content.collections?.map((collection) => ({
    ...collection,
    items: collection.items.map((item) => ({
      ...item,
      destination: ContentDestination(item.id),
    })),
  }));

  return {
    ...entry.content,
    collections,
    characters: entry.content.characters?.map((character) => ({
      ...character,
      destination: character.destination ?? ContentDestination(entry.id),
    })),
  };
};

export default class Target {
  static info: SourceInfo = {
    id: "en.static-demo",
    name: "Static Demo",
    version: 1.0,
    website: "https://example.org",
    languages: ["en"],
    rating: ContentRating.EVERYONE,
  };

  getConfiguration = (): SourceConfiguration => ({
    endpoint: ["anilist", "mal"],
    imageReferer: "https://example.org/",
  });

  getHomePage = async (): Promise<HomePage> => ({
    feeds: [
      {
        id: "catalog",
        title: "Demo Catalog",
        content: {
          list: {
            key: "all",
            disableSorting: true,
          },
        },
      },
      {
        id: "completed",
        title: "Completed",
        content: {
          list: {
            key: "completed",
            disableSorting: true,
          },
        },
      },
    ],
  });

  getCustomFeeds = async (): Promise<SourceFeed[]> => [
    {
      id: "manga",
      title: "Manga only",
      content: {
        list: { key: "manga", disableSorting: true },
      },
    },
    {
      id: "manhwa",
      title: "Manhwa only",
      content: {
        list: { key: "manhwa", disableSorting: true },
      },
    },
  ];

  getSortOptions = async (): Promise<SortOptions> => ({
    options: [
      { id: "title", title: "Title" },
      { id: "rating", title: "Rating" },
      { id: "views", title: "Views" },
      { id: "updated", title: "Recently updated" },
    ],
    disableOrdering: false,
  });

  getSearchFilters = async () => [
    SearchFilter(
      "genres",
      "Genres",
      SelectFilter(
        [
          { id: "sci-fi", title: "Sci-Fi" },
          { id: "mystery", title: "Mystery" },
          { id: "slice-of-life", title: "Slice of Life" },
          { id: "drama", title: "Drama" },
          { id: "romance", title: "Romance" },
          { id: "supernatural", title: "Supernatural" },
        ],
        true,
      ),
      "Include or exclude genres",
    ),
    SearchFilter(
      "status",
      "Status",
      PickerFilter([
        { id: "any", title: "Any" },
        { id: "1", title: "Ongoing" },
        { id: "2", title: "Completed" },
        { id: "3", title: "Cancelled" },
        { id: "4", title: "Hiatus" },
      ]),
    ),
    SearchFilter(
      "type",
      "Type",
      PickerFilter([
        { id: "any", title: "Any" },
        { id: "0", title: "Manga" },
        { id: "1", title: "Manhua" },
        { id: "2", title: "Manhwa" },
        { id: "3", title: "Comic" },
      ]),
    ),
  ];

  getSearchResults = async (
    request: SearchRequest,
    page: number,
  ): Promise<PagedItemList> => {
    if (page > 1) {
      return { items: [], isLastPage: true, total: 0 };
    }

    const filtered = MANGA.filter(
      (entry) =>
        matchesQuery(entry, request.query) && matchesFilters(entry, request.filters),
    ).map((entry) => entry.item);

    const items = sortItems(filtered, request.sort);
    return {
      items,
      isLastPage: true,
      total: items.length,
    };
  };

  getItemList = async (
    request: ItemListRequest,
    page: number,
  ): Promise<PagedItemList> => {
    if (page > 1) {
      return { items: [], isLastPage: true, total: 0 };
    }

    let items = allItems();
    switch (request.key) {
      case "completed":
        items = MANGA.filter(
          (entry) => entry.content.status === ContentStatus.COMPLETED,
        ).map((entry) => entry.item);
        break;
      case "manga":
        items = MANGA.filter(
          (entry) => entry.content.contentType === ContentType.MANGA,
        ).map((entry) => entry.item);
        break;
      case "manhwa":
        items = MANGA.filter(
          (entry) => entry.content.contentType === ContentType.MANHWA,
        ).map((entry) => entry.item);
        break;
      case "all":
      default:
        break;
    }

    if (!request.disableSorting) {
      items = sortItems(items, request.sort);
    }

    return {
      items,
      isLastPage: true,
      total: items.length,
    };
  };

  getContent = async (contentId: string): Promise<Content> => {
    const entry = byId[contentId];
    if (!entry) {
      throw new Error(`Unknown content id: ${contentId}`);
    }
    return withRelatedDestinations(entry);
  };

  getChapters = async (contentId: string): Promise<Chapter[]> => {
    const entry = byId[contentId];
    if (!entry) {
      throw new Error(`Unknown content id: ${contentId}`);
    }

    return entry.chapters.map(({ pages: _pages, ...chapter }) => chapter);
  };

  getChapterPages = async (
    contentId: string,
    chapterId: string,
  ): Promise<ChapterPage[]> => {
    const entry = byId[contentId];
    if (!entry) {
      throw new Error(`Unknown content id: ${contentId}`);
    }

    const chapter = entry.chapters.find((item) => item.id === chapterId);
    if (!chapter) {
      throw new Error(`Unknown chapter id: ${chapterId}`);
    }

    return chapter.pages;
  };
}
