/**
 * NetworkClient helpers — uses AF + HTTPCookieStorage.shared, same jar as
 * Suwatte's Cloudflare Resolve WebView. Prefer this over HttpClient for
 * CF-protected sites; HttpClient keeps a separate jar and `validateStatus: () => true`
 * disables native CF detection.
 */

import {
  cloudflareFromHeaders,
  looksLikeCloudflare,
  originOf,
  throwCloudflare,
} from "./cloudflare";
import { browserHeaders } from "./client";

export type NetFetchOptions = {
  headers?: Record<string, string>;
  referer?: string;
  timeout?: number;
  cloudflareResolutionURL?: string;
};

const headerGet = (
  headers: Record<string, unknown> | undefined,
  name: string,
): string | null => {
  if (!headers) return null;
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === want) {
      return value == null ? null : String(value);
    }
  }
  return null;
};

const asHeaderBag = (headers: Record<string, unknown> | undefined) => ({
  get: (name: string) => headerGet(headers, name),
});

const rethrowCloudflare = (error: unknown, resolutionURL: string): never => {
  const message = String((error as { message?: string })?.message ?? error);
  const name = String(
    (error as { name?: string })?.name ??
      (error as { constructor?: { name?: string } })?.constructor?.name ??
      "",
  );
  if (
    name.includes("Cloudflare") ||
    message.includes("Cloudflare") ||
    message.includes("cloudflare")
  ) {
    throwCloudflare(resolutionURL);
  }
  throw error;
};

export const createNetworkClient = (): InstanceType<typeof NetworkClient> =>
  new NetworkClient();

/** GET text via NetworkClient; always rethrows CloudflareError with resolution URL. */
export const netGetText = async (
  client: InstanceType<typeof NetworkClient>,
  url: string,
  options?: NetFetchOptions,
): Promise<string> => {
  const resolution = options?.cloudflareResolutionURL ?? originOf(url);
  try {
    const response = await client.get(url, {
      timeout: options?.timeout ?? 45_000,
      headers: browserHeaders({
        ...(options?.referer ? { Referer: options.referer } : {}),
        ...(options?.headers ?? {}),
      }),
    });
    const headers = asHeaderBag(response.headers as Record<string, unknown>);
    if (cloudflareFromHeaders(response.status, headers)) {
      throwCloudflare(resolution);
    }
    const body = response.data ?? "";
    if (looksLikeCloudflare(body)) {
      throwCloudflare(resolution);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `GET ${url} failed (${response.status}): ${body.slice(0, 180)}`,
      );
    }
    return body;
  } catch (error) {
    return rethrowCloudflare(error, resolution);
  }
};

export const netGetJson = async <T>(
  client: InstanceType<typeof NetworkClient>,
  url: string,
  options?: NetFetchOptions,
): Promise<T> => JSON.parse(await netGetText(client, url, options)) as T;

/**
 * Probe site root so CF Resolve appears before parallel homepage work.
 * NetworkClient auto-throws on 403/503+cloudflare; we attach the Resolve URL.
 */
export const assertNetworkCloudflareCleared = async (
  client: InstanceType<typeof NetworkClient>,
  resolutionURL: string,
): Promise<void> => {
  await netGetText(client, resolutionURL, {
    cloudflareResolutionURL: resolutionURL,
    timeout: 20_000,
  });
};
