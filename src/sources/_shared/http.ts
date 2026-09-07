/** Shared HTTP helpers for Suwatte JSC sources. */

import {
  looksLikeCloudflare,
  originOf,
  throwCloudflare,
} from "./cloudflare";

let client: InstanceType<typeof HttpClient> | undefined;

export const http = (): InstanceType<typeof HttpClient> => {
  if (!client) {
    client = new HttpClient({
      timeout: 45_000,
      validateStatus: () => true,
    });
  }
  return client;
};

export type FetchOptions = {
  headers?: Record<string, string>;
  referer?: string;
  timeout?: number;
};

const mergeHeaders = (
  options?: FetchOptions,
): Record<string, string> | undefined => {
  const headers: Record<string, string> = { ...(options?.headers ?? {}) };
  if (options?.referer) headers.Referer = options.referer;
  return Object.keys(headers).length ? headers : undefined;
};

export const fetchText = async (
  url: string,
  options?: FetchOptions,
): Promise<string> => {
  const response = await http().request({
    url,
    method: "GET",
    headers: mergeHeaders(options),
    timeout: options?.timeout,
  });
  const body = await response.text();
  // Prefer CloudflareError so Suwatte auto-opens the challenge WebView.
  if (looksLikeCloudflare(body) || response.headers.get("cf-mitigated")) {
    throwCloudflare(originOf(url));
  }
  if ([403, 503].includes(response.status)) {
    const server = (response.headers.get("server") ?? "").toLowerCase();
    if (server.includes("cloudflare")) throwCloudflare(originOf(url));
  }
  if (!response.ok) {
    throw new Error(
      `GET ${url} failed (${response.status}): ${body.slice(0, 180)}`,
    );
  }
  return body;
};

export const postForm = async (
  url: string,
  fields: Record<string, string> | [string, string][],
  options?: FetchOptions,
): Promise<string> => {
  const entries = Array.isArray(fields) ? fields : Object.entries(fields);
  const body = entries
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  const response = await http().request({
    url,
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...mergeHeaders(options),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `POST ${url} failed (${response.status}): ${text.slice(0, 180)}`,
    );
  }
  return text;
};

/** POST without a body (Madara `/ajax/chapters`). */
export const postEmpty = async (
  url: string,
  options?: FetchOptions,
): Promise<string> => {
  const response = await http().request({
    url,
    method: "POST",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      ...mergeHeaders(options),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `POST ${url} failed (${response.status}): ${text.slice(0, 180)}`,
    );
  }
  return text;
};

export const fetchJson = async <T>(
  url: string,
  options?: FetchOptions,
): Promise<T> => JSON.parse(await fetchText(url, options)) as T;

export const fetchBytes = async (
  url: string,
  options?: FetchOptions,
): Promise<Uint8Array> => {
  const response = await http().request({
    url,
    method: "GET",
    headers: mergeHeaders(options),
    timeout: options?.timeout,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GET ${url} failed (${response.status}): ${body.slice(0, 180)}`,
    );
  }
  return response.bytes();
};

/** GET with optional `Range` header (Hitomi nozomi / index slices). */
export const fetchBytesRange = async (
  url: string,
  range: { start: number; end: number } | undefined,
  options?: FetchOptions,
): Promise<Uint8Array> => {
  const headers = { ...(mergeHeaders(options) ?? {}) };
  if (range) {
    headers.Range = `bytes=${range.start}-${range.end}`;
  }
  const response = await http().request({
    url,
    method: "GET",
    headers,
    timeout: options?.timeout,
  });
  if (!(response.ok || response.status === 206)) {
    const body = await response.text();
    throw new Error(
      `GET ${url} failed (${response.status}): ${body.slice(0, 180)}`,
    );
  }
  return response.bytes();
};

/** Aliases matching common port naming. */
export const getText = fetchText;
export const getJson = fetchJson;

export const absoluteUrl = (base: string, maybeRelative: string): string => {
  const value = maybeRelative.trim();
  if (!value) return value;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  if (value.startsWith("//")) {
    const protocol = base.startsWith("https") ? "https:" : "http:";
    return `${protocol}${value}`;
  }
  const origin = base.match(/^(https?:\/\/[^/?#]+)/i)?.[1] ?? base;
  if (value.startsWith("/")) return `${origin}${value}`;
  return `${origin}/${value}`;
};

export const joinUrl = (base: string, ...parts: string[]): string => {
  let url = base.replace(/\/+$/, "");
  for (const part of parts) {
    const cleaned = part.replace(/^\/+|\/+$/g, "");
    if (!cleaned) continue;
    url += `/${cleaned}`;
  }
  return url;
};

export const withQuery = (
  url: string,
  params: Record<string, string | undefined | null>,
): string => {
  const pairs = Object.entries(params).filter(
    (entry): entry is [string, string] => entry[1] != null,
  );
  if (!pairs.length) return url;
  const query = pairs
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
  return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
};
