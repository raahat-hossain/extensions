import { signRequest } from "./aws4";
import type { R2Config } from "./config";

export type R2Object = {
  key: string;
  size: number;
  lastModified?: string;
};

export type ListResult = {
  prefixes: string[];
  objects: R2Object[];
};

const client = new HttpClient({
  timeout: 60_000,
  validateStatus: () => true,
});

const decodeXml = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const xmlValues = (xml: string, tag: string): string[] => {
  const values: string[] = [];
  const pattern = new RegExp(`<${tag}>([^<]*)</${tag}>`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    values.push(decodeXml(match[1] ?? ""));
  }
  return values;
};

const firstXml = (xml: string, tag: string): string | undefined =>
  xmlValues(xml, tag)[0];

const listPage = async (
  config: R2Config,
  prefix: string,
  options: { delimiter?: string; continuationToken?: string } = {},
): Promise<ListResult & { continuationToken?: string }> => {
  const query: Record<string, string> = {
    "list-type": "2",
    prefix,
  };
  if (options.delimiter) query.delimiter = options.delimiter;
  if (options.continuationToken) {
    query["continuation-token"] = options.continuationToken;
  }

  const signed = signRequest({
    method: "GET",
    endpoint: config.endpoint,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    query,
  });

  const response = await client.request({
    url: signed.url,
    method: signed.method,
    headers: signed.headers,
  });

  if (!response.ok) {
    throw new Error(
      `R2 list failed (${response.status}): ${(await response.text()).slice(0, 240)}`,
    );
  }

  const xml = await response.text();
  const commonBlocks =
    xml.match(/<CommonPrefixes>[\s\S]*?<\/CommonPrefixes>/g) ?? [];
  const prefixes = commonBlocks
    .map((block) => firstXml(block, "Prefix"))
    .filter((value): value is string => !!value);

  const contentBlocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? [];
  const objects: R2Object[] = [];
  for (const block of contentBlocks) {
    const key = firstXml(block, "Key");
    if (!key || key.endsWith("/")) continue;
    objects.push({
      key,
      size: Number(firstXml(block, "Size") ?? "0"),
      lastModified: firstXml(block, "LastModified"),
    });
  }

  return {
    prefixes,
    objects,
    continuationToken:
      firstXml(xml, "IsTruncated") === "true"
        ? firstXml(xml, "NextContinuationToken")
        : undefined,
  };
};

export const listAll = async (
  config: R2Config,
  prefix: string,
  delimiter?: string,
): Promise<ListResult> => {
  const prefixes: string[] = [];
  const objects: R2Object[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await listPage(config, prefix, { delimiter, continuationToken });
    prefixes.push(...page.prefixes);
    objects.push(...page.objects);
    continuationToken = page.continuationToken;
  } while (continuationToken);

  return { prefixes, objects };
};

export const getObjectBytes = async (
  config: R2Config,
  key: string,
): Promise<Uint8Array> => {
  const signed = signRequest({
    method: "GET",
    endpoint: config.endpoint,
    bucket: config.bucket,
    key,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });

  const response = await client.request({
    url: signed.url,
    method: signed.method,
    headers: signed.headers,
  });

  if (!response.ok) {
    throw new Error(
      `R2 get failed (${response.status}) for ${key}: ${(await response.text()).slice(0, 240)}`,
    );
  }

  return response.bytes();
};

export const getObjectText = async (
  config: R2Config,
  key: string,
): Promise<string> =>
  new TextDecoder().decode(await getObjectBytes(config, key));

export const presignGet = (
  config: R2Config,
  key: string,
  expiresSeconds = 60 * 60,
): string =>
  signRequest({
    method: "GET",
    endpoint: config.endpoint,
    bucket: config.bucket,
    key,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresSeconds,
  }).url;
