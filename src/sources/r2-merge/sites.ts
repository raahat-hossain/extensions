/**
 * Site detection for merged chapter URLs.
 * Parsers match Yūzōnō (nhentai API v2) then Keiyoushi (HentaiRead / HentaiNexus).
 */

export const SITE_IDS = [
  "nhentai",
  "hentairead",
  "hentainexus",
  "hentai2read",
] as const;

export type SiteId = (typeof SITE_IDS)[number];

const ALIASES: Record<string, SiteId> = {
  nhentai: "nhentai",
  nh: "nhentai",
  "n-hentai": "nhentai",
  "nhentai.net": "nhentai",
  hentairead: "hentairead",
  hr: "hentairead",
  "hentai-read": "hentairead",
  "hentairead.com": "hentairead",
  hentainexus: "hentainexus",
  hn: "hentainexus",
  nexus: "hentainexus",
  "hentai-nexus": "hentainexus",
  "hentainexus.com": "hentainexus",
  hentai2read: "hentai2read",
  h2r: "hentai2read",
  "hentai-2-read": "hentai2read",
  "hentai2read.com": "hentai2read",
};

export const hostOf = (url: string): string => {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url.trim());
  return (match?.[1] ?? "").toLowerCase().replace(/^www\./, "");
};

export const originOf = (url: string): string => {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(url.trim());
  return match?.[1] ? `${match[1]}/` : url;
};

export const normalizeSite = (value: string | undefined): SiteId | undefined => {
  if (!value) return undefined;
  const key = value.trim().toLowerCase().replace(/\s+/g, "-");
  return ALIASES[key];
};

export const siteFromHost = (host: string): SiteId | undefined => {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h === "nhentai.net" || h.endsWith(".nhentai.net")) return "nhentai";
  if (h === "hentairead.com" || h.endsWith(".hentairead.com")) return "hentairead";
  if (h === "hencover.xyz" || h === "henread.xyz") return "hentairead";
  if (h === "hentainexus.com" || h.endsWith(".hentainexus.com")) {
    return "hentainexus";
  }
  if (h === "hentai2read.com" || h.endsWith(".hentai2read.com")) {
    return "hentai2read";
  }
  if (h === "static.hentaicdn.com" || h.endsWith(".hentaicdn.com")) {
    return "hentai2read";
  }
  return undefined;
};

export const identifySite = (
  url: string,
  explicit?: string,
): SiteId => {
  const fromExplicit = normalizeSite(explicit);
  if (fromExplicit) return fromExplicit;
  const fromHost = siteFromHost(hostOf(url));
  if (fromHost) return fromHost;
  throw new Error(
    `Unknown chapter host "${hostOf(url) || url}". Set "source" to one of: ${SITE_IDS.join(", ")} — or provide a "pages" array of image URLs.`,
  );
};

const lastPathSegment = (url: string): string => {
  const cleaned = url.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cleaned;
};

export const extractRemoteId = (site: SiteId, url: string): string => {
  const trimmed = url.trim();
  switch (site) {
    case "nhentai": {
      const match = trimmed.match(/\/g\/(\d+)/i) ?? trimmed.match(/\b(\d{4,})\b/);
      if (!match?.[1]) {
        throw new Error(`Could not parse nhentai gallery id from ${trimmed}`);
      }
      return match[1];
    }
    case "hentairead": {
      const match = trimmed.match(/\/hentai\/([^/?#]+)/i);
      if (match?.[1]) return decodeURIComponent(match[1]);
      return decodeURIComponent(lastPathSegment(trimmed));
    }
    case "hentainexus": {
      const match =
        trimmed.match(/\/(?:view|read)\/(\d+)/i) ?? trimmed.match(/\b(\d+)\b/);
      if (!match?.[1]) {
        throw new Error(`Could not parse hentainexus id from ${trimmed}`);
      }
      return match[1];
    }
    case "hentai2read": {
      const cleaned = trimmed
        .replace(/[?#].*$/, "")
        .replace(/\/+$/, "")
        .replace(/^https?:\/\/[^/]+/i, "")
        .replace(/^\/+/, "");
      if (!cleaned) {
        throw new Error(`Could not parse hentai2read path from ${trimmed}`);
      }
      return cleaned;
    }
  }
};

export const canonicalUrl = (site: SiteId, remoteId: string): string => {
  switch (site) {
    case "nhentai":
      return `https://nhentai.net/g/${remoteId}/`;
    case "hentairead":
      return `https://hentairead.com/hentai/${encodeURI(remoteId).replace(/%2F/gi, "/")}/`;
    case "hentainexus":
      return `https://hentainexus.com/view/${remoteId}`;
    case "hentai2read":
      return `https://hentai2read.com/${remoteId.replace(/^\/+/, "")}/`;
  }
};

/** Image Referer for mixed-host chapter pages. */
export const refererForImage = (url: string): string | undefined => {
  const host = hostOf(url);
  const site = siteFromHost(host);
  switch (site) {
    case "nhentai":
      return "https://nhentai.net/";
    case "hentairead":
      return "https://hentairead.com/";
    case "hentainexus":
      return "https://hentainexus.com/";
    case "hentai2read":
      return "https://hentai2read.com/";
    default:
      return undefined;
  }
};

export const hentaiReadLanguageFromUrl = (url: string): string | undefined => {
  const match = url.match(/\/hentai\/[^/]+\/([^/?#]+)\/(?:p\/\d+)?\/?$/i);
  const lang = match?.[1]?.toLowerCase();
  if (!lang || lang === "p" || /^\d+$/.test(lang)) return undefined;
  return lang;
};
