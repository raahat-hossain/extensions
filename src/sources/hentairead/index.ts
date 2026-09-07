import {
  ContentRating,
  ContentStatus,
  SearchFilter,
  SelectFilter,
  TextFilter,
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
  allMatches,
  attr,
  base64Decode,
  collectBlocks,
  firstMatch,
  imageFromTag,
  metaContent,
  stripTags,
} from "../_shared/html";
import {
  absoluteUrl,
  joinUrl,
  withQuery,
} from "../_shared/http";
import { matureItem } from "../_shared/item";
import {
  assertNetworkCloudflareCleared,
  createNetworkClient,
  netGetJson,
  netGetText,
} from "../_shared/network";

const BASE = "https://hentairead.com";
const MANGA = "hentai";
/**
 * Nested listing URL for CF Resolve WebView.
 * Root `/` often paints a blank Turnstile shell in Suwatte's WKWebView;
 * `/hentai/` is the real Madara listing Keiyoushi hits and completes better.
 */
const CF_RESOLVE = `${BASE}/hentai/?sortby=new`;
const CF_PROBES = [
  `${BASE}/hentai/?sortby=new`,
  `${BASE}/hentai/`,
  `${BASE}/`,
];

type PagesDto = {
  data: { chapter: { images: { src: string }[] } };
};

type ImageBaseUrlDto = { baseUrl: string };

type TermResult = { results: { id: number; text: string }[] };

const chapterExtraDataRegex = /= (\{[^;]+)/;
const pagesDataRegex = /.(ey\S+).\s/;

const capitalizeEach = (value: string): string =>
  value
    .split(" ")
    .map((word) =>
      word ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(" ");

const eachLinkTexts = (html: string, hrefNeedle: string): string[] => {
  const pattern = new RegExp(
    `<a\\b[^>]*href=["'][^"']*${hrefNeedle}[^"']*["'][^>]*>\\s*<span\\b[^>]*>([\\s\\S]*?)<\\/span>`,
    "gi",
  );
  return allMatches(html, pattern).map(stripTags).filter(Boolean);
};

const parseMangaId = (href: string): string => {
  const cleaned = href.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const match = cleaned.match(/\/hentai\/([^/]+)/i);
  if (match?.[1]) return match[1];
  return cleaned.split("/").filter(Boolean).pop() ?? cleaned;
};

const parseListing = (html: string) => {
  const blocks = collectBlocks(
    html,
    /<div\b[^>]*class=["'][^"']*\bmanga-item\b[^"']*["'][^>]*>/gi,
    "div",
  );
  const items = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const link =
      /<a\b([^>]*class=["'][^"']*manga-item__link[^"']*["'][^>]*)>([\s\S]*?)<\/a>/i.exec(
        block,
      ) ?? /<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(block);
    if (!link) continue;
    const href = attr(`<a ${link[1]}>`, "href") ?? "";
    const title =
      stripTags(link[2] ?? "") || attr(`<a ${link[1]}>`, "title") || "";
    if (!href || !title) continue;
    const id = parseMangaId(href);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const img = firstMatch(block, /(<img\b[^>]*>)/i);
    const cover = img
      ? absoluteUrl(BASE, imageFromTag(img))
      : undefined;
    items.push(
      matureItem({
        id,
        title,
        coverImage: cover,
        webUrl: absoluteUrl(BASE, href),
      }),
    );
  }
  return items;
};

const hasNext = (html: string): boolean =>
  /<a\b[^>]*rel=["']next["']/i.test(html);

const listingUrl = (page: number, sortby: string): string => {
  const path =
    page <= 1
      ? joinUrl(BASE, MANGA) + "/"
      : joinUrl(BASE, MANGA, "page", String(page)) + "/";
  return withQuery(path, { sortby });
};

const parsePageRange = (
  query: string,
  minPages = 1,
  maxPages = 9999,
): [number, number] => {
  const num = Number.parseInt(query.replace(/\D/g, ""), 10);
  const limited = (n = num) => Math.min(maxPages, Math.max(minPages, n));
  if (Number.isNaN(num) || num < 0) return [minPages, maxPages];
  switch (query[0]) {
    case "<":
      return [1, query[1] === "=" ? limited() : limited(num + 1)];
    case ">":
      return [limited(query[1] === "=" ? num : num + 1), maxPages];
    case "=":
      if (query[1] === ">") return [limited(), maxPages];
      if (query[1] === "<") return [1, limited()];
      return [limited(), limited()];
    default:
      return [limited(), limited()];
  }
};

/**
 * HentaiRead uses NetworkClient (no "use httpclient").
 * Suwatte CF Resolve writes cookies into HTTPCookieStorage.shared / AF —
 * same jar NetworkClient uses. Resolve URL is the nested `/hentai/` listing
 * (root `/` blacks out the challenge WebView).
 */
export default class Target {
  client = createNetworkClient();

  static info: SourceInfo = {
    id: "en.hentairead",
    name: "HentaiRead",
    version: 1.7,
    website: BASE,
    thumbnail: "hentairead.png",
    languages: ["en"],
    rating: ContentRating.MATURE,
  };

  getConfiguration = (): SourceConfiguration =>
    ({
      imageReferer: `${BASE}/`,
      // Nested path — Suwatte reads this when CloudflareError has no URL.
      cloudflareResolutionURL: CF_RESOLVE,
    }) as SourceConfiguration;

  private get = (url: string, referer = `${BASE}/`) =>
    netGetText(this.client, url, {
      referer,
      cloudflareResolutionURL: CF_RESOLVE,
    });

  private getJson = <T>(url: string) =>
    netGetJson<T>(this.client, url, {
      referer: `${BASE}/`,
      cloudflareResolutionURL: CF_RESOLVE,
    });

  getHomePage = async (): Promise<HomePage> => {
    // Probe nested listing first, then root — always Resolve on nested URL.
    await assertNetworkCloudflareCleared(this.client, CF_RESOLVE, CF_PROBES);
    return {
      feeds: [
        {
          id: "latest",
          title: "Latest",
          content: { list: { key: "latest", disableSorting: true } },
        },
        {
          id: "popular",
          title: "Popular",
          content: { list: { key: "popular", disableSorting: true } },
        },
      ],
    };
  };

  getSortOptions = async (): Promise<SortOptions> => ({
    options: [
      { id: "new", title: "Latest" },
      { id: "alphabet", title: "A-Z" },
      { id: "rating", title: "Rating" },
      { id: "views", title: "Views" },
    ],
    disableOrdering: false,
  });

  getSearchFilters = async () => [
    SearchFilter(
      "types",
      "Types",
      SelectFilter(
        [
          { id: "4", title: "Doujinshi" },
          { id: "52", title: "Manga" },
          { id: "4798", title: "Artist CG" },
          { id: "36278", title: "Western" },
        ],
        false,
      ),
    ),
    SearchFilter(
      "tags",
      "Tags",
      TextFilter(),
      "Comma-separated. Prefix with - to exclude.",
    ),
    SearchFilter("artists", "Artists", TextFilter(), "Comma-separated"),
    SearchFilter("circles", "Circles", TextFilter(), "Comma-separated"),
    SearchFilter("characters", "Characters", TextFilter(), "Comma-separated"),
    SearchFilter("collections", "Collections", TextFilter(), "Comma-separated"),
    SearchFilter("scanlators", "Scanlators", TextFilter(), "Comma-separated"),
    SearchFilter("conventions", "Conventions", TextFilter(), "Comma-separated"),
    SearchFilter(
      "uploaded",
      "Uploaded",
      TextFilter(),
      "Year filter, e.g. >2024",
    ),
    SearchFilter(
      "pages",
      "Pages",
      TextFilter(),
      "Page count filter, e.g. >20",
    ),
  ];

  getItemList = async (
    request: ItemListRequest,
    page: number,
  ): Promise<PagedItemList> => {
    const sortby = request.key === "popular" ? "views" : "new";
    const html = await this.get(listingUrl(page, sortby));
    const items = parseListing(html);
    return { items, isLastPage: !hasNext(html) || items.length === 0 };
  };

  getSearchResults = async (
    request: SearchRequest,
    page: number,
  ): Promise<PagedItemList> => {
    const filters = request.filters ?? {};
    const params: Record<string, string> = {
      s: request.query?.trim() ?? "",
      "title-type": "contains",
    };

    const sortKey = request.sort?.key ?? "new";
    params.sortby = sortKey;
    params.order = request.sort?.ascending ? "asc" : "desc";

    const types = filters.types as { include?: string[] } | undefined;
    for (const value of types?.include ?? []) {
      params[`__cat_${value}`] = value;
    }

    const appendTagFilter = async (
      filterKey: string,
      type: string,
      paramName: string,
    ) => {
      const raw = (filters[filterKey] as string | undefined)?.trim();
      if (!raw) return;
      for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
        const exclude = part.startsWith("-");
        const name = exclude ? part.slice(1).trim() : part;
        const id = await this.getTagId(name, type);
        if (id == null) {
          throw new Error(
            `${type.replace(/^manga_/, "").replace(/_/g, " ")} not found: ${name}`,
          );
        }
        if (type === "manga_tag") {
          params[exclude ? `__exc_${id}` : `__inc_${id}`] = String(id);
        } else {
          params[`__${paramName}_${id}`] = String(id);
        }
      }
    };

    await appendTagFilter("tags", "manga_tag", "tag");
    await appendTagFilter("artists", "artist", "artists");
    await appendTagFilter("circles", "circle", "circles");
    await appendTagFilter("characters", "character", "characters");
    await appendTagFilter("collections", "collection", "collections");
    await appendTagFilter("scanlators", "scanlator", "scanlators");
    await appendTagFilter("conventions", "convention", "conventions");

    const uploaded = (filters.uploaded as string | undefined)?.trim();
    if (uploaded) {
      const kind =
        uploaded[0] === ">" ? "after" : uploaded[0] === "<" ? "before" : "in";
      params["release-type"] = kind;
      params.release = uploaded.replace(/\D/g, "");
    }

    const pages = (filters.pages as string | undefined)?.trim();
    if (pages) {
      const [min, max] = parsePageRange(pages);
      params.pages = `${min}-${max}`;
    }

    const path =
      page <= 1 ? `${BASE}/` : joinUrl(BASE, "page", String(page)) + "/";
    const pairs: [string, string][] = [];
    for (const [key, value] of Object.entries(params)) {
      if (key.startsWith("__cat_")) {
        pairs.push(["categories[]", value]);
      } else if (key.startsWith("__exc_")) {
        pairs.push(["excluding[]", value]);
      } else if (key.startsWith("__inc_")) {
        pairs.push(["including[]", value]);
      } else if (key.startsWith("__artists_")) {
        pairs.push(["artists[]", value]);
      } else if (key.startsWith("__circles_")) {
        pairs.push(["circles[]", value]);
      } else if (key.startsWith("__characters_")) {
        pairs.push(["characters[]", value]);
      } else if (key.startsWith("__collections_")) {
        pairs.push(["collections[]", value]);
      } else if (key.startsWith("__scanlators_")) {
        pairs.push(["scanlators[]", value]);
      } else if (key.startsWith("__conventions_")) {
        pairs.push(["conventions[]", value]);
      } else if (!key.startsWith("__")) {
        pairs.push([key, value]);
      }
    }
    const query = pairs
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
      )
      .join("&");
    const url = query ? `${path}?${query}` : path;
    const html = await this.get(url);
    const items = parseListing(html);
    return { items, isLastPage: !hasNext(html) || items.length === 0 };
  };

  getContent = async (contentId: string): Promise<Content> => {
    const url = joinUrl(BASE, MANGA, contentId) + "/";
    const html = await this.get(url);

    const title =
      stripTags(
        firstMatch(
          html,
          /<div[^>]*class=["'][^"']*manga-titles[^"']*["'][^>]*>[\s\S]*?<h1\b[^>]*>([\s\S]*?)<\/h1>/i,
        ) ??
          firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ??
          "",
      ) || contentId;

    const authors = eachLinkTexts(html, "/circle/");
    const artists = eachLinkTexts(html, "/artist/");
    const genres = eachLinkTexts(html, "/tag/");
    const characters = eachLinkTexts(html, "/characters/");
    const parodies = eachLinkTexts(html, "/parody/");
    const circles = eachLinkTexts(html, "/circle/");
    const conventions = eachLinkTexts(html, "/convention/");
    const scanlators = eachLinkTexts(html, "/scanlator/");

    const parts: string[] = [];
    if (characters.length) {
      parts.push(`Characters: ${capitalizeEach(characters.join(", "))}`);
    }
    if (parodies.length) {
      parts.push(`Parodies: ${capitalizeEach(parodies.join(", "))}`);
    }
    if (circles.length) {
      parts.push(`Circles: ${capitalizeEach(circles.join(", "))}`);
    }
    if (conventions.length) {
      parts.push(`Convention: ${capitalizeEach(conventions.join(", "))}`);
    }
    if (scanlators.length) {
      parts.push(`Scanlators: ${capitalizeEach(scanlators.join(", "))}`);
    }

    const altRaw =
      stripTags(
        firstMatch(
          html,
          /<div[^>]*class=["'][^"']*manga-titles[^"']*["'][^>]*>[\s\S]*?<h2\b[^>]*>([\s\S]*?)<\/h2>/i,
        ) ?? "",
      ) || "";
    const additionalTitles = altRaw
      ? altRaw
          .split("|")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    if (additionalTitles.length) {
      parts.push(
        `Alternative Titles: \n${additionalTitles.map((t) => `- ${t}`).join("\n")}`,
      );
    }

    const pagesLine =
      stripTags(
        firstMatch(
          html,
          /(<[^>]*class=["'][^"']*items-center[^"']*["'][^>]*>[\s\S]*?pages:[\s\S]*?<\/[^>]+>)/i,
        ) ?? "",
      ) || "";
    if (pagesLine) parts.push(pagesLine);

    let cover =
      metaContent(html, "og:image") ||
      metaContent(html, "twitter:image") ||
      "";
    if (!cover) {
      const hover = firstMatch(
        html,
        /(<a\b[^>]*class=["'][^"']*image--hover[^"']*["'][^>]*>[\s\S]*?<\/a>)/i,
      );
      if (hover) {
        const img = firstMatch(hover, /(<img\b[^>]*>)/i);
        if (img) cover = absoluteUrl(BASE, imageFromTag(img));
      }
    }

    const author = authors.join(", ") || artists.join(", ") || undefined;
    const artist = artists.join(", ") || authors.join(", ") || undefined;

    return {
      title,
      coverImage: cover,
      webUrl: url,
      rating: ContentRating.MATURE,
      status: ContentStatus.COMPLETED,
      summary: parts.join("\n\n"),
      additionalTitles: additionalTitles.length ? additionalTitles : undefined,
      genres: genres.map((g) => ({
        id: g.toLowerCase().replace(/\s+/g, "-"),
        title: g,
      })),
      credits: [
        ...(author ? [{ name: author, role: "Author" }] : []),
        ...(artist && artist !== author
          ? [{ name: artist, role: "Artist" }]
          : []),
      ],
      context: scanlators.length
        ? { scanlator: scanlators.join(", ") }
        : undefined,
    };
  };

  getChapters = async (contentId: string): Promise<Chapter[]> => {
    const content = await this.getContent(contentId);
    const scanlator =
      (content.context?.scanlator as string | undefined) ||
      content.summary
        ?.split("Scanlators: ")[1]
        ?.split("\n")[0]
        ?.trim();

    return [
      {
        id: contentId,
        index: 0,
        number: 1,
        title: scanlator || "Chapter",
        language: "en",
        date: new Date(),
        webUrl: joinUrl(BASE, MANGA, contentId) + "/",
      },
    ];
  };

  getChapterPages = async (
    contentId: string,
    _chapterId: string,
  ): Promise<ChapterPage[]> => {
    const url = joinUrl(BASE, MANGA, contentId, "english", "p", "1") + "/";
    const html = await this.get(url, joinUrl(BASE, MANGA, contentId) + "/");

    const extra =
      firstMatch(
        html,
        /<script\b[^>]*id=["']single-chapter-js-extra["'][^>]*>([\s\S]*?)<\/script>/i,
      ) ?? "";
    const baseMatch = chapterExtraDataRegex.exec(extra);
    let pageBaseUrl = "";
    if (baseMatch?.[1]) {
      const dto = JSON.parse(baseMatch[1]) as ImageBaseUrlDto;
      pageBaseUrl = dto.baseUrl;
    }

    const before =
      firstMatch(
        html,
        /<script\b[^>]*id=["']single-chapter-js-before["'][^>]*>([\s\S]*?)<\/script>/i,
      ) ?? "";
    const pagesMatch = pagesDataRegex.exec(before);
    if (!pagesMatch?.[1]) {
      throw new Error(
        "Failed to find page list. Non-English entries are not supported.",
      );
    }
    const pagesDto = JSON.parse(base64Decode(pagesMatch[1])) as PagesDto;
    return pagesDto.data.chapter.images.map((image) => ({
      url: `${pageBaseUrl}/${image.src}`,
    }));
  };

  private getTagId = async (
    tag: string,
    type: string,
  ): Promise<number | undefined> => {
    const taxonomy = type === "artist" ? "manga_artist" : type;
    const url = withQuery(`${BASE}/wp-admin/admin-ajax.php`, {
      action: "search_manga_terms",
      search: tag,
      taxonomy,
    });
    const data = await this.getJson<TermResult>(url);
    const hit = data.results.find(
      (item) => item.text.toLowerCase() === tag.toLowerCase(),
    );
    return hit?.id;
  };
}
