import { unzipSync } from "fflate";
import { bytesToBase64 } from "./crypto";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".bmp",
]);

export const isArchiveName = (name: string): boolean => {
  const lower = name.toLowerCase();
  return lower.endsWith(".cbz") || lower.endsWith(".zip");
};

export const isCoverName = (name: string): boolean =>
  /^cover\.(png|jpe?g|webp|gif|avif)$/i.test(name);

export const isDetailsName = (name: string): boolean =>
  /^(details|info|metadata|series)\.json$/i.test(name);

export type ChapterPageRef = {
  chapter: string;
  page: string;
};

/**
 * Parse `"[chapter name]_[page name]"` cover refs.
 * Example: `chapter 4_24.png` → { chapter: "chapter 4", page: "24.png" }
 */
export const parseChapterPageRef = (
  value: string,
): ChapterPageRef | null => {
  const trimmed = value.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed) || isCoverName(trimmed)) {
    return null;
  }

  const separator = trimmed.lastIndexOf("_");
  if (separator <= 0 || separator === trimmed.length - 1) return null;

  const chapter = trimmed.slice(0, separator).trim();
  const page = trimmed.slice(separator + 1).trim();
  if (!chapter || !page) return null;

  const lower = page.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return null;
  if (!IMAGE_EXTENSIONS.has(lower.slice(dot))) return null;

  return { chapter, page };
};

export const archiveStem = (name: string): string =>
  name.replace(/\.(cbz|zip)$/i, "").trim();

export const findArchiveByChapterName = <T extends { name: string }>(
  archives: T[],
  chapterName: string,
): T | undefined => {
  const needle = chapterName.trim().toLowerCase();
  if (!needle) return undefined;

  const exact = archives.find(
    (archive) => archiveStem(archive.name).toLowerCase() === needle,
  );
  if (exact) return exact;

  // Allow "004 - chapter 4.cbz" to match "chapter 4"
  return archives.find((archive) => {
    const stem = archiveStem(archive.name).toLowerCase();
    const stripped = stem.replace(/^\d+(\.\d+)?\s*[-._:)\]\s]+/, "").trim();
    return stripped === needle || stem.endsWith(needle);
  });
};

const mimeForPage = (pageName: string): string => {
  const lower = pageName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
};

/** Pull one page out of a cbz/zip and return a data URL usable as coverImage. */
export const extractArchivePageDataUrl = (
  archiveBytes: Uint8Array,
  pageName: string,
): string => {
  const files = unzipSync(archiveBytes);
  const target = pageName.toLowerCase();
  const entry = Object.entries(files).find(([name, data]) => {
    if (!data?.length || name.endsWith("/")) return false;
    if (name.startsWith("__MACOSX/")) return false;
    return basename(name).toLowerCase() === target;
  });

  if (!entry) {
    throw new Error(`Page "${pageName}" not found inside archive`);
  }

  const [, data] = entry;
  return `data:${mimeForPage(pageName)};base64,${bytesToBase64(data as Uint8Array)}`;
};

export const basename = (key: string): string => {
  const parts = key.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] ?? key;
};

export const folderIdFromPrefix = (
  prefix: string,
  rootPrefix: string,
): string => {
  const root = `${rootPrefix.replace(/^\/+|\/+$/g, "")}/`;
  const normalized = prefix.replace(/^\/+/, "");
  const relative = normalized.startsWith(root)
    ? normalized.slice(root.length)
    : normalized;
  return relative.replace(/\/+$/, "");
};

export const naturalCompare = (left: string, right: string): number =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

export const parseChapterNumber = (name: string, fallback: number): number => {
  const stem = name.replace(/\.(cbz|zip)$/i, "");
  const match = stem.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : fallback;
};

export const extractArchivePages = (
  archiveBytes: Uint8Array,
): { name: string; b64: string }[] => {
  const files = unzipSync(archiveBytes);
  const pages = Object.entries(files)
    .filter(([name, data]) => {
      if (!data?.length) return false;
      if (name.endsWith("/")) return false;
      if (name.startsWith("__MACOSX/")) return false;
      if (name.split("/").some((part) => part.startsWith("."))) return false;
      const lower = name.toLowerCase();
      const dot = lower.lastIndexOf(".");
      if (dot < 0) return false;
      return IMAGE_EXTENSIONS.has(lower.slice(dot));
    })
    .map(([name, data]) => ({ name, data: data as Uint8Array }))
    .sort((left, right) => naturalCompare(left.name, right.name))
    .map(({ name, data }) => ({
      name,
      b64: bytesToBase64(data),
    }));

  if (!pages.length) {
    throw new Error("Archive contained no readable image pages");
  }

  return pages;
};
