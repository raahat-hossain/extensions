"use httpclient";

import {
  ContentRating,
  type Chapter,
  type ChapterPage,
  type Content,
  type HomePage,
  type ItemListRequest,
  type PagedItemList,
  type SearchRequest,
  type SortOptions,
  type SourceConfiguration,
  type SourceInfo,
} from "@suwatte/toolchain/types";
import { createProtectedClient } from "../_shared/client";
import {
  fetchMadaraChapters,
  fetchMadaraContent,
  fetchMadaraPages,
  fetchListing,
  fetchSearch,
  resolveMadara,
} from "../_shared/madara";

const BASE = "https://novelcrow.com";

export default class Target {
  client = createProtectedClient(`${BASE}/`);

  #cfg = resolveMadara({
    baseUrl: BASE,
    mangaSubString: "comic",
    useNewChapterEndpoint: true,
    chapterUrlSuffix: "",
    listViaSearch: true,
    popularOrderBy: "trending",
    latestOrderBy: "latest",
    client: this.client,
  });

  static info: SourceInfo = {
    id: "en.novelcrow",
    name: "NovelCrow",
    version: 1.4,
    website: BASE,
    thumbnail: "novelcrow.png",
    languages: ["en"],
    rating: ContentRating.MATURE,
  };

  getConfiguration = (): SourceConfiguration =>
    ({
      imageReferer: `${BASE}/`,
      cloudflareResolutionURL: `${BASE}/`,
      useClientForImageRequests: true,
    }) as SourceConfiguration;

  getHomePage = async (): Promise<HomePage> => ({
    feeds: [
      {
        id: "trending",
        title: "Trending",
        content: { list: { key: "trending", disableSorting: true } },
      },
      {
        id: "latest",
        title: "Latest",
        content: { list: { key: "latest", disableSorting: true } },
      },
    ],
  });

  getSortOptions = async (): Promise<SortOptions> => ({
    options: [
      { id: "latest", title: "Latest" },
      { id: "alphabet", title: "A-Z" },
      { id: "rating", title: "Rating" },
      { id: "trending", title: "Trending" },
      { id: "views", title: "Most Views" },
      { id: "new-manga", title: "New" },
    ],
  });

  getItemList = async (
    request: ItemListRequest,
    page: number,
  ): Promise<PagedItemList> => {
    const orderBy =
      request.key === "latest"
        ? this.#cfg.latestOrderBy
        : this.#cfg.popularOrderBy;
    return fetchListing(this.#cfg, page, orderBy);
  };

  getSearchResults = async (
    request: SearchRequest,
    page: number,
  ): Promise<PagedItemList> =>
    fetchSearch(
      this.#cfg,
      page,
      request.query?.trim() ?? "",
      request.sort?.key,
    );

  getContent = async (contentId: string): Promise<Content> =>
    fetchMadaraContent(this.#cfg, contentId);

  getChapters = async (contentId: string): Promise<Chapter[]> =>
    fetchMadaraChapters(this.#cfg, contentId);

  getChapterPages = async (
    contentId: string,
    chapterId: string,
  ): Promise<ChapterPage[]> =>
    fetchMadaraPages(this.#cfg, contentId, chapterId);
}
