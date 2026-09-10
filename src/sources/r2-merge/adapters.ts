import type { ChapterPage } from "@suwatte/toolchain/types";
import type { SourceHttpClient } from "../_shared/http";
import { fetchText } from "../_shared/http";
import {
  CF_RESOLVE as HENTAIREAD_CF,
  BASE as HENTAIREAD_BASE,
} from "../hentairead/constants";
import {
  contentUrl,
  parseChapterPages,
  readerLanguageOrder,
  readerUrl,
} from "../hentairead/parse";
import {
  BASE_URL as HENTAINEXUS_BASE,
  pagesFromReaderHtml,
} from "../hentainexus/parse";
import { galleryById, imageServer } from "../nhentai/api";
import type { ParsedChapter } from "./chapters";
import { hentaiReadLanguageFromUrl, type SiteId } from "./sites";

const H2R_BASE = "https://hentai2read.com";
const H2R_IMAGE_BASE = "https://static.hentaicdn.com/hentai";
const H2R_PAGES = /'images'\s*:\s*\["(.*?),?"]/;

export type AdapterContext = {
  client: SourceHttpClient;
};

const html = async (
  ctx: AdapterContext,
  url: string,
  referer: string,
  cloudflareResolutionURL: string,
): Promise<string> =>
  fetchText(url, {
    client: ctx.client,
    referer,
    cloudflareResolutionURL,
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });

const pagesNhentai = async (id: string): Promise<ChapterPage[]> => {
  const data = await galleryById(id);
  const server = await imageServer();
  return data.pages.map((page) => ({ url: `${server}/${page.path}` }));
};

const pagesHentaiRead = async (
  ctx: AdapterContext,
  slug: string,
  preferredLanguage?: string,
): Promise<ChapterPage[]> => {
  const detailsHtml = await html(
    ctx,
    contentUrl(slug),
    `${HENTAIREAD_BASE}/`,
    HENTAIREAD_CF,
  );
  const order = [
    ...(preferredLanguage ? [preferredLanguage] : []),
    ...readerLanguageOrder(detailsHtml),
  ].filter((lang, index, all) => all.indexOf(lang) === index);

  let lastError: unknown;
  for (const language of order) {
    try {
      const readerHtml = await html(
        ctx,
        readerUrl(slug, language),
        contentUrl(slug),
        HENTAIREAD_CF,
      );
      const pages = parseChapterPages(readerHtml);
      if (pages.length) return pages;
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ??
    new Error(`HentaiRead: no page list for ${slug}`)
  );
};

const pagesHentaiNexus = async (
  ctx: AdapterContext,
  id: string,
): Promise<ChapterPage[]> => {
  const body = await html(
    ctx,
    `${HENTAINEXUS_BASE}/read/${id}`,
    `${HENTAINEXUS_BASE}/`,
    `${HENTAINEXUS_BASE}/`,
  );
  return pagesFromReaderHtml(body).map((url) => ({ url }));
};

const pagesHentai2Read = async (
  ctx: AdapterContext,
  path: string,
): Promise<ChapterPage[]> => {
  const chapterPath = path.includes("/") ? path : `${path}/1`;
  const url = `${H2R_BASE}/${chapterPath.replace(/^\/+/, "")}/`;
  const body = await html(ctx, url, `${H2R_BASE}/`, `${H2R_BASE}/`);
  const pages: ChapterPage[] = [];
  const global = new RegExp(H2R_PAGES.source, "g");
  let match: RegExpExecArray | null;
  while ((match = global.exec(body))) {
    const blob = match[1] ?? "";
    for (const part of blob.split(",")) {
      const imagePath = part
        .trim()
        .replace(/^"|"$/g, "")
        .replace(/\\\//g, "/");
      if (!imagePath) continue;
      pages.push({ url: H2R_IMAGE_BASE + imagePath });
    }
  }
  if (!pages.length) {
    throw new Error(`Hentai2Read: no pages at ${url}`);
  }
  return pages;
};

const fetchSitePages = async (
  ctx: AdapterContext,
  site: SiteId,
  remoteId: string,
  url?: string,
): Promise<ChapterPage[]> => {
  switch (site) {
    case "nhentai":
      return pagesNhentai(remoteId);
    case "hentairead":
      return pagesHentaiRead(
        ctx,
        remoteId,
        url ? hentaiReadLanguageFromUrl(url) : undefined,
      );
    case "hentainexus":
      return pagesHentaiNexus(ctx, remoteId);
    case "hentai2read":
      return pagesHentai2Read(ctx, remoteId);
  }
};

export const pagesForChapter = async (
  ctx: AdapterContext,
  chapter: ParsedChapter,
): Promise<ChapterPage[]> => {
  if (chapter.pages?.length) {
    return chapter.pages.map((url) => ({ url }));
  }
  if (!chapter.site || !chapter.remoteId) {
    throw new Error(`Chapter ${chapter.key} has no site id and no pages array`);
  }
  return fetchSitePages(ctx, chapter.site, chapter.remoteId, chapter.url);
};
