import {
  ContentRating,
  ContentStatus,
  ContentType,
  ReadingMode,
  type Content,
  type Tag,
} from "@suwatte/toolchain/types";

/**
 * Shape of manga/<id>/details.json in the R2 bucket.
 * Only `title` is required. Everything else is optional.
 */
export type DetailsFile = {
  title: string;
  summary?: string;
  additionalTitles?: string[];
  /**
   * Cover image. Prefer a `cover.*` file in the folder.
   * Alternatives:
   * - absolute http(s) URL
   * - chapter page ref: `"[chapter name]_[page name]"`
   *   e.g. `"chapter 4_24.png"` → page `24.png` inside `chapter 4.cbz`
   */
  cover?: string;
  banner?: string;
  artworks?: string[];
  webUrl?: string;
  /** everyone | suggestive | mature | unknown | 0-3 */
  rating?: string | number;
  /** unknown | ongoing | completed | cancelled | hiatus | 0-4 */
  status?: string | number;
  /** manga | manhua | manhwa | comic | novel | 0-4 */
  contentType?: string | number;
  /** paged_manga | paged_comic | paged_vertical | vertical | 0-3 */
  readingMode?: string | number;
  statistics?: {
    rating?: number;
    /** Maps to Content.statistics.favorites */
    favorites?: number;
    bookmarks?: number;
    views?: number;
  };
  credits?: {
    name: string;
    role?: string;
    image?: string;
  }[];
  additionalDetails?: Record<string, string>;
  genres?: { id?: string; title: string; rating?: string | number }[];
  properties?: {
    id?: string;
    title: string;
    subtitle?: string;
    tags: { id?: string; title: string; rating?: string | number }[];
  }[];
  links?: { title: string; url: string }[];
  characters?: {
    name: string;
    role?: string;
    image?: string;
  }[];
  /** Tracker IDs, e.g. { anilist: "123", mal: "456" } */
  endpoints?: Record<string, string>;
};

const asEnum = <T extends Record<string, number>>(
  table: T,
  value: string | number | undefined,
  fallback: T[keyof T],
): T[keyof T] => {
  if (value == null) return fallback;
  if (typeof value === "number") {
    const matched = Object.values(table).find((entry) => entry === value);
    return (matched as T[keyof T]) ?? fallback;
  }

  const normalized = value.trim().replace(/[\s-]+/g, "_").toUpperCase();
  if (normalized in table) {
    return table[normalized as keyof T] as T[keyof T];
  }

  for (const [name, entry] of Object.entries(table)) {
    if (name.replace(/_/g, "") === normalized.replace(/_/g, "")) {
      return entry as T[keyof T];
    }
  }

  return fallback;
};

const RATING = {
  EVERYONE: ContentRating.EVERYONE,
  SUGGESTIVE: ContentRating.SUGGESTIVE,
  MATURE: ContentRating.MATURE,
  UNKNOWN: ContentRating.UNKNOWN,
} as const;

const STATUS = {
  UNKNOWN: ContentStatus.UNKNOWN,
  ONGOING: ContentStatus.ONGOING,
  COMPLETED: ContentStatus.COMPLETED,
  CANCELLED: ContentStatus.CANCELLED,
  HIATUS: ContentStatus.HIATUS,
} as const;

const TYPE = {
  MANGA: ContentType.MANGA,
  MANHUA: ContentType.MANHUA,
  MANHWA: ContentType.MANHWA,
  COMIC: ContentType.COMIC,
  NOVEL: ContentType.NOVEL,
} as const;

const MODE = {
  PAGED_MANGA: ReadingMode.PAGED_MANGA,
  PAGED_COMIC: ReadingMode.PAGED_COMIC,
  PAGED_VERTICAL: ReadingMode.PAGED_VERTICAL,
  VERTICAL: ReadingMode.VERTICAL,
} as const;

const tagOf = (entry: {
  id?: string;
  title: string;
  rating?: string | number;
}): Tag => ({
  id: entry.id ?? entry.title.toLowerCase().replace(/\s+/g, "-"),
  title: entry.title,
  rating:
    entry.rating == null
      ? undefined
      : asEnum(RATING, entry.rating, ContentRating.EVERYONE),
});

export const contentFromDetails = (
  details: DetailsFile,
  fallback: {
    id: string;
    coverImage: string;
    bannerImage?: string;
  },
): Content => ({
  title: details.title || fallback.id,
  coverImage: details.cover || fallback.coverImage,
  bannerImage: details.banner || fallback.bannerImage,
  artworks: details.artworks,
  webUrl: details.webUrl,
  rating: asEnum(RATING, details.rating, ContentRating.EVERYONE),
  status: asEnum(STATUS, details.status, ContentStatus.UNKNOWN),
  contentType: asEnum(TYPE, details.contentType, ContentType.MANGA),
  readingMode:
    details.readingMode == null
      ? undefined
      : asEnum(MODE, details.readingMode, ReadingMode.PAGED_MANGA),
  summary: details.summary,
  additionalTitles: details.additionalTitles,
  additionalDetails: details.additionalDetails,
  statistics: details.statistics
    ? {
        rating: details.statistics.rating,
        favorites: details.statistics.favorites,
        bookmarks: details.statistics.bookmarks,
        views: details.statistics.views,
      }
    : undefined,
  credits: details.credits?.map((credit) => ({
    name: credit.name,
    role: credit.role,
    image: credit.image,
  })),
  genres: details.genres?.map(tagOf),
  properties: details.properties?.map((section, index) => ({
    id: section.id ?? `property-${index}`,
    title: section.title,
    subtitle: section.subtitle,
    tags: section.tags.map(tagOf),
  })),
  links: details.links,
  characters: details.characters?.map((character) => ({
    name: character.name,
    role: character.role,
    image: character.image,
  })),
  endpoints: details.endpoints,
});

export const parseDetailsJson = (raw: string): DetailsFile => {
  const parsed = JSON.parse(raw) as DetailsFile;
  if (!parsed?.title || typeof parsed.title !== "string") {
    throw new Error("details.json must include a string title");
  }
  return parsed;
};
