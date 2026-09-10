import {
  canonicalUrl,
  extractRemoteId,
  identifySite,
  type SiteId,
} from "./sites";

export const isChaptersName = (name: string): boolean =>
  /^(chapters|chapter-list|chapter_list)\.json$/i.test(name);

export type RawChapter = {
  title?: string;
  name?: string;
  number?: number | string;
  index?: number;
  volume?: number | string;
  url?: string;
  href?: string;
  link?: string;
  source?: string;
  site?: string;
  host?: string;
  id?: string | number;
  date?: string | number;
  language?: string;
  lang?: string;
  scanlator?: string;
  group?: string;
  pages?: string[];
};

export type ParsedChapter = {
  key: string;
  title: string;
  number: number;
  index: number;
  volume?: number;
  date?: Date;
  language?: string;
  scanlator?: string;
  url?: string;
  site?: SiteId;
  remoteId?: string;
  pages?: string[];
};

const asNumber = (value: number | string | undefined): number | undefined => {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const pages = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return pages.length ? pages : undefined;
};

const coerceRaw = (entry: unknown, index: number): RawChapter => {
  if (typeof entry === "string") return { url: entry };
  if (!entry || typeof entry !== "object") {
    throw new Error(`chapters.json entry ${index} must be a URL string or object`);
  }
  return entry as RawChapter;
};

const chapterUrl = (raw: RawChapter): string | undefined => {
  const value = raw.url ?? raw.href ?? raw.link;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const parseDate = (value: string | number | undefined): Date | undefined => {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const parseChapterEntry = (
  entry: unknown,
  index: number,
): ParsedChapter => {
  const raw = coerceRaw(entry, index);
  const pages = asStringArray(raw.pages);
  const url = chapterUrl(raw);
  const explicitSite = raw.source ?? raw.site ?? raw.host;
  const rawId = raw.id != null ? String(raw.id).trim() : "";

  let site: SiteId | undefined;
  let remoteId: string | undefined;
  let resolvedUrl = url;

  if (!pages?.length) {
    if (url) {
      site = identifySite(url, explicitSite);
      remoteId = rawId || extractRemoteId(site, url);
    } else if (rawId && explicitSite) {
      site = identifySite("", explicitSite);
      remoteId = rawId;
      resolvedUrl = canonicalUrl(site, remoteId);
    } else {
      throw new Error(
        `chapters.json entry ${index} needs a url, or id+source, or a pages array`,
      );
    }
  }

  const title =
    (raw.title || raw.name || "").trim() ||
    (site && remoteId ? `${site} ${remoteId}` : `Chapter ${index + 1}`);
  const fromTitle =
    title.match(/(?:ch(?:apter)?|ep(?:isode)?|#)\s*(\d+(?:\.\d+)?)/i)?.[1] ??
    title.match(/^\s*(\d+(?:\.\d+)?)/)?.[1];
  const number =
    asNumber(raw.number) ??
    (fromTitle ? Number(fromTitle) : index + 1);

  return {
    key: "",
    title,
    number,
    index: asNumber(raw.index) ?? index,
    volume: asNumber(raw.volume),
    date: parseDate(raw.date),
    language: (raw.language || raw.lang)?.trim() || undefined,
    scanlator: (raw.scanlator || raw.group)?.trim() || undefined,
    url: resolvedUrl,
    site,
    remoteId,
    pages,
  };
};

const assignKeys = (chapters: ParsedChapter[]): ParsedChapter[] => {
  const seen = new Map<string, number>();
  return chapters.map((chapter, index) => {
    const base =
      chapter.pages?.length
        ? `pages:${index}`
        : `${chapter.site}:${chapter.remoteId}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const key = count === 1 ? base : `${base}#${count}`;
    return { ...chapter, key, index };
  });
};

export const parseChaptersJson = (raw: string): ParsedChapter[] => {
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
  const list = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { chapters?: unknown }).chapters)
      ? (parsed as { chapters: unknown[] }).chapters
      : null;

  if (!list) {
    throw new Error(
      'chapters.json must be an array of chapter URLs/objects, or { "chapters": [...] }',
    );
  }

  if (!list.length) {
    throw new Error("chapters.json has no chapters");
  }

  return assignKeys(list.map((entry, index) => parseChapterEntry(entry, index)));
};

export const findChapter = (
  chapters: ParsedChapter[],
  chapterId: string,
): ParsedChapter => {
  const hit =
    chapters.find((chapter) => chapter.key === chapterId) ??
    chapters.find((chapter) => chapter.url === chapterId);
  if (!hit) {
    throw new Error(`Chapter not found: ${chapterId}`);
  }
  return hit;
};
