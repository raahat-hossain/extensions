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
import {
  fetchMadaraChapters,
  fetchMadaraContent,
  fetchMadaraPages,
  fetchListing,
  fetchSearch,
  resolveMadara,
} from "../_shared/madara";

const cfg = resolveMadara({
  baseUrl: "https://novelcrow.com",
  mangaSubString: "comic",
  useNewChapterEndpoint: true,
  chapterUrlSuffix: "",
  listViaSearch: true,
  popularOrderBy: "trending",
  latestOrderBy: "latest",
});

export default class Target {
  static info: SourceInfo = {
    id: "en.novelcrow",
    name: "NovelCrow",
    version: 1.2,
    website: cfg.baseUrl,
    thumbnail: "novelcrow.png",
    languages: ["en"],
    rating: ContentRating.MATURE,
  };

  getConfiguration = (): SourceConfiguration => ({
    imageReferer: `${cfg.baseUrl}/`,
  });

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
      request.key === "latest" ? cfg.latestOrderBy : cfg.popularOrderBy;
    return fetchListing(cfg, page, orderBy);
  };

  getSearchResults = async (
    request: SearchRequest,
    page: number,
  ): Promise<PagedItemList> =>
    fetchSearch(cfg, page, request.query?.trim() ?? "", request.sort?.key);

  getContent = async (contentId: string): Promise<Content> =>
    fetchMadaraContent(cfg, contentId);

  getChapters = async (contentId: string): Promise<Chapter[]> =>
    fetchMadaraChapters(cfg, contentId);

  getChapterPages = async (
    contentId: string,
    chapterId: string,
  ): Promise<ChapterPage[]> => fetchMadaraPages(cfg, contentId, chapterId);
}
