import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type CatalogSource = {
  id: string;
  name: string;
  version: number;
  website?: string;
  thumbnail?: string;
  languages?: string[];
  rating?: number;
  path: string;
  minSupportedAppVersion?: string;
  environment?: string;
};

type Catalog = {
  catalogVersion?: number;
  generatedAt?: string;
  listName?: string | null;
  sources?: CatalogSource[];
  runners?: unknown;
};

const dist = "dist";
const catalog: Catalog = JSON.parse(readFileSync(join(dist, "sources.json"), "utf8"));
const sources = catalog.sources ?? [];

const runners = sources.map((source) => ({
  id: source.id,
  name: source.name,
  version: source.version,
  website: source.website,
  supportedLanguages: source.languages ?? [],
  path: source.path,
  rating: source.rating ?? 2,
  environment: "source",
  thumbnail: source.thumbnail,
  ...(source.minSupportedAppVersion
    ? { minSupportedAppVersion: source.minSupportedAppVersion }
    : {}),
}));

const legacy = {
  listName: catalog.listName ?? "Dev Extensions",
  runners,
};

writeFileSync(join(dist, "runners.json"), JSON.stringify(legacy));

catalog.runners = runners;
writeFileSync(join(dist, "sources.json"), JSON.stringify(catalog));

const srcDir = join(dist, "sources");
const dstDir = join(dist, "runners");
mkdirSync(dstDir, { recursive: true });
for (const file of readdirSync(srcDir)) {
  if (!file.endsWith(".stt")) continue;
  copyFileSync(join(srcDir, file), join(dstDir, file));
}

console.log(`emit-runners-list: ${runners.length} runners (${runners.map((r) => r.id).join(", ")})`);
