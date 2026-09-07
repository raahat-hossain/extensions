/** Throw Suwatte's CloudflareError so the app auto-opens the challenge WebView. */

export const throwCloudflare = (resolutionURL: string): never => {
  throw new CloudflareError(resolutionURL);
};

export const looksLikeCloudflare = (body: string): boolean =>
  /just a moment|cf-mitigated|challenge-platform|cdn-cgi\/challenge|cf-chl|cf-turnstile|challenges\.cloudflare\.com|attention required|verify you are human|checking your browser/i.test(
    body,
  );

export const originOf = (url: string): string => {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return match?.[1] ? `${match[1]}/` : url;
};
