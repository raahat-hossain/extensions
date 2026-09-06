import {
  ContentRating,
  ContentStatus,
  ContentType,
  ReadingMode,
  TrackStatus,
  type Chapter,
  type ChapterPage,
  type Content,
  type Item,
} from "@suwatte/toolchain/types";

export type StaticChapter = Chapter & {
  pages: ChapterPage[];
};

export type StaticManga = {
  id: string;
  item: Item;
  content: Content;
  chapters: StaticChapter[];
};

const cover = (label: string) =>
  `https://placehold.co/600x900/1b1f2a/f4f1ea/png?text=${encodeURIComponent(label)}`;

const banner = (label: string) =>
  `https://placehold.co/1200x675/243044/f4f1ea/png?text=${encodeURIComponent(label)}`;

const page = (label: string, tone: string) =>
  `https://placehold.co/900x1400/${tone}/f8f5ef/png?text=${encodeURIComponent(label)}`;

export const MANGA: StaticManga[] = [
  {
    id: "static-signal",
    item: {
      id: "static-signal",
      title: "The Static Signal",
      subtitle: "Vol. 1 · Completed",
      coverImage: cover("Static Signal"),
      bannerImage: banner("The Static Signal"),
      webUrl: "https://example.org/titles/static-signal",
      rating: ContentRating.EVERYONE,
      trackStatus: TrackStatus.COMPLETED,
      statistics: {
        rating: 4.7,
        favorites: 1284,
        bookmarks: 512,
        views: 98210,
      },
    },
    content: {
      title: "The Static Signal",
      coverImage: cover("Static Signal"),
      bannerImage: banner("The Static Signal"),
      artworks: [
        cover("Signal Art A"),
        cover("Signal Art B"),
      ],
      webUrl: "https://example.org/titles/static-signal",
      rating: ContentRating.EVERYONE,
      status: ContentStatus.COMPLETED,
      contentType: ContentType.MANGA,
      readingMode: ReadingMode.PAGED_MANGA,
      summary:
        "A short demo series about a radio operator who hears tomorrow's weather in yesterday's static. Built entirely from static fixture data so Suwatte wiring can be verified end-to-end.",
      additionalTitles: ["静電信号", "Static Signal Demo"],
      additionalDetails: {
        Serialization: "Weekly Demo",
        Magazine: "Toolchain Monthly",
        Demographic: "Seinen",
        Pages: "2",
        Chapters: "1",
      },
      statistics: {
        rating: 4.7,
        favorites: 1284,
        bookmarks: 512,
        views: 98210,
      },
      credits: [
        {
          name: "Aoi Mantton",
          role: "Story",
          image: cover("Aoi"),
        },
        {
          name: "Rin Circuit",
          role: "Art",
          image: cover("Rin"),
        },
        {
          name: "Harbor Press",
          role: "Publisher",
        },
      ],
      genres: [
        { id: "sci-fi", title: "Sci-Fi", rating: ContentRating.EVERYONE },
        { id: "mystery", title: "Mystery", rating: ContentRating.EVERYONE },
        { id: "slice-of-life", title: "Slice of Life" },
      ],
      properties: [
        {
          id: "themes",
          title: "Themes",
          subtitle: "Mood tags for the demo catalog",
          tags: [
            { id: "radio", title: "Radio" },
            { id: "time", title: "Time Loop" },
            { id: "city", title: "City" },
          ],
        },
        {
          id: "format",
          title: "Format",
          tags: [
            { id: "oneshot-feel", title: "One-shot Feel" },
            { id: "black-white", title: "Black & White" },
          ],
        },
      ],
      collections: [
        {
          id: "related",
          title: "Related in this source",
          subtitle: "Other static fixtures",
          items: [
            {
              id: "harbor-lights",
              title: "Harbor Lights",
              subtitle: "Ongoing · Vertical",
              coverImage: cover("Harbor Lights"),
              rating: ContentRating.SUGGESTIVE,
            },
          ],
        },
      ],
      links: [
        { title: "Official site", url: "https://example.org/titles/static-signal" },
        { title: "Suwatte docs", url: "https://suwatte.mantton.com/developers/introduction/" },
      ],
      characters: [
        {
          name: "Niko Vale",
          role: "Protagonist",
          image: cover("Niko"),
        },
        {
          name: "Station 7",
          role: "Supporting",
          image: cover("Station 7"),
        },
      ],
      endpoints: {
        anilist: "900001",
        mal: "900001",
      },
      trackStatus: TrackStatus.COMPLETED,
      context: {
        fixture: true,
        catalogSlot: 1,
      },
    },
    chapters: [
      {
        id: "static-signal-c1",
        index: 0,
        number: 1,
        volume: 1,
        language: "en",
        title: "Tuning In",
        date: new Date("2024-01-12T18:00:00.000Z"),
        webUrl: "https://example.org/titles/static-signal/1",
        coverImage: cover("Ch. 1"),
        providers: [
          {
            id: "demo-scans",
            name: "Demo Scans",
            links: [
              { title: "Website", url: "https://example.org/groups/demo-scans" },
              { title: "Discord", url: "https://example.org/discord" },
            ],
          },
        ],
        pages: [
          { url: page("Static Signal\nPage 1", "1b1f2a") },
          { url: page("Static Signal\nPage 2", "243044") },
        ],
      },
    ],
  },
  {
    id: "harbor-lights",
    item: {
      id: "harbor-lights",
      title: "Harbor Lights",
      subtitle: "Ongoing · Manhwa",
      coverImage: cover("Harbor Lights"),
      bannerImage: banner("Harbor Lights"),
      webUrl: "https://example.org/titles/harbor-lights",
      rating: ContentRating.SUGGESTIVE,
      trackStatus: TrackStatus.READING,
      statistics: {
        rating: 4.3,
        favorites: 842,
        bookmarks: 301,
        views: 55120,
      },
    },
    content: {
      title: "Harbor Lights",
      coverImage: cover("Harbor Lights"),
      bannerImage: banner("Harbor Lights"),
      artworks: [
        cover("Harbor Art A"),
        banner("Harbor Banner Art"),
      ],
      webUrl: "https://example.org/titles/harbor-lights",
      rating: ContentRating.SUGGESTIVE,
      status: ContentStatus.ONGOING,
      contentType: ContentType.MANHWA,
      readingMode: ReadingMode.VERTICAL,
      summary:
        "Night ferries, neon docks, and a courier who delivers sealed letters that rewrite the harbor map. Second static fixture used to exercise suggestive rating, vertical reading, and ongoing status.",
      additionalTitles: ["항구의 불빛", "Harbour Lights"],
      additionalDetails: {
        Serialization: "Web Demo",
        Origin: "Korea",
        Demographic: "Drama",
        Pages: "2",
        Chapters: "1",
      },
      statistics: {
        rating: 4.3,
        favorites: 842,
        bookmarks: 301,
        views: 55120,
      },
      credits: [
        {
          name: "Sora Park",
          role: "Story & Art",
          image: cover("Sora"),
        },
        {
          name: "Lampblack Studio",
          role: "Lettering",
        },
      ],
      genres: [
        { id: "drama", title: "Drama", rating: ContentRating.SUGGESTIVE },
        { id: "romance", title: "Romance" },
        { id: "supernatural", title: "Supernatural" },
      ],
      properties: [
        {
          id: "themes",
          title: "Themes",
          tags: [
            { id: "night", title: "Night City" },
            { id: "letters", title: "Letters" },
            { id: "found-family", title: "Found Family" },
          ],
        },
        {
          id: "format",
          title: "Format",
          tags: [
            { id: "full-color", title: "Full Color" },
            { id: "vertical", title: "Vertical Scroll" },
          ],
        },
      ],
      collections: [
        {
          id: "related",
          title: "Related in this source",
          items: [
            {
              id: "static-signal",
              title: "The Static Signal",
              subtitle: "Completed · Manga",
              coverImage: cover("Static Signal"),
              rating: ContentRating.EVERYONE,
            },
          ],
        },
      ],
      links: [
        { title: "Official site", url: "https://example.org/titles/harbor-lights" },
        {
          title: "Content model docs",
          url: "https://suwatte.mantton.com/developers/content/",
        },
      ],
      characters: [
        {
          name: "Haejin",
          role: "Protagonist",
          image: cover("Haejin"),
        },
        {
          name: "Captain Iro",
          role: "Supporting",
          image: cover("Iro"),
        },
      ],
      endpoints: {
        anilist: "900002",
        mal: "900002",
      },
      trackStatus: TrackStatus.READING,
      context: {
        fixture: true,
        catalogSlot: 2,
      },
    },
    chapters: [
      {
        id: "harbor-lights-c1",
        index: 0,
        number: 1,
        language: "en",
        title: "Dock 14",
        date: new Date("2025-06-01T12:00:00.000Z"),
        webUrl: "https://example.org/titles/harbor-lights/1",
        coverImage: cover("Ep. 1"),
        isSpecial: false,
        providers: [
          {
            id: "lampblack",
            name: "Lampblack Official",
            links: [{ title: "Website", url: "https://example.org/groups/lampblack" }],
          },
        ],
        pages: [
          { url: page("Harbor Lights\nPage 1", "2a1f24") },
          { url: page("Harbor Lights\nPage 2", "3a2a33") },
        ],
      },
    ],
  },
];

export const byId = Object.fromEntries(MANGA.map((entry) => [entry.id, entry]));

export const allItems = (): Item[] => MANGA.map((entry) => entry.item);
