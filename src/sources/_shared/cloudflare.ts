/** Throw Suwatte's CloudflareError so the app auto-opens the challenge WebView. */

export const throwCloudflare = (resolutionURL: string): never => {
  throw new CloudflareError(resolutionURL);
};

export const looksLikeCloudflare = (body: string): boolean =>
  /just a moment|cf-mitigated|challenge-platform|cdn-cgi\/challenge|cf-chl|cf-turnstile|challenges\.cloudflare\.com|attention required|verify you are human|checking your browser|enable javascript and cookies/i.test(
    body,
  );

export const originOf = (url: string): string => {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return match?.[1] ? `${match[1]}/` : url;
};

const header = (
  headers: { get(name: string): string | null },
  name: string,
): string => (headers.get(name) ?? "").toLowerCase();

/** Prefer header signals so we can throw before waiting on a huge body. */
export const cloudflareFromHeaders = (
  status: number,
  headers: { get(name: string): string | null },
): boolean => {
  if (header(headers, "cf-mitigated").includes("challenge")) return true;
  if (header(headers, "server").includes("cloudflare") && [403, 503].includes(status)) {
    return true;
  }
  const location = header(headers, "location");
  if (location.includes("cdn-cgi/challenge")) return true;
  return false;
};

/**
 * Hit the site root once so Suwatte surfaces the CF modal before homepage
 * feeds fan out in parallel (which can strand the UI on a spinner).
 */
export const assertCloudflareCleared = async (
  client: InstanceType<typeof HttpClient>,
  resolutionURL: string,
): Promise<void> => {
  const response = await client.request({
    url: resolutionURL,
    method: "GET",
    timeout: 20_000,
  });
  if (cloudflareFromHeaders(response.status, response.headers)) {
    throwCloudflare(resolutionURL);
  }
  const body = await response.text();
  if (looksLikeCloudflare(body) || cloudflareFromHeaders(response.status, response.headers)) {
    throwCloudflare(resolutionURL);
  }
  if (!response.ok && header(response.headers, "server").includes("cloudflare")) {
    throwCloudflare(resolutionURL);
  }
};
