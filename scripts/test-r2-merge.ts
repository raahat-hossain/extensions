import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { installEmulatorGlobals } from "@suwatte/toolchain/emulator";
import { parseChapterPages } from "../src/sources/hentairead/parse.ts";
import {
  findChapter,
  parseChapterEntry,
  parseChaptersJson,
} from "../src/sources/r2-merge/chapters.ts";
import {
  canonicalUrl,
  extractRemoteId,
  hentaiReadLanguageFromUrl,
  hostOf,
  identifySite,
  refererForImage,
  siteFromHost,
} from "../src/sources/r2-merge/sites.ts";
import R2Merge from "../src/sources/r2-merge/index.ts";
import { pagesForChapter } from "../src/sources/r2-merge/adapters.ts";

installEmulatorGlobals();

const main = async () => {
  assert.equal(identifySite("https://nhentai.net/g/289857/"), "nhentai");
  assert.equal(identifySite("https://www.nhentai.net/g/1/"), "nhentai");
  assert.equal(
    identifySite("https://hentairead.com/hentai/foo-bar/english/p/1/"),
    "hentairead",
  );
  assert.equal(identifySite("https://hentainexus.com/view/21161"), "hentainexus");
  assert.equal(identifySite("https://hentainexus.com/read/21161"), "hentainexus");
  assert.equal(
    identifySite("https://hentai2read.com/some-title/12/"),
    "hentai2read",
  );
  assert.equal(identifySite("https://example.org/x", "nh"), "nhentai");
  assert.equal(identifySite("https://example.org/x", "Hentai-Read"), "hentairead");
  assert.equal(siteFromHost("i2.nhentai.net"), "nhentai");
  assert.equal(siteFromHost("hencover.xyz"), "hentairead");
  assert.equal(hostOf("https://NHENTAI.NET/g/1/?q=1"), "nhentai.net");

  assert.equal(
    extractRemoteId("nhentai", "https://nhentai.net/g/289857/1/"),
    "289857",
  );
  assert.equal(
    extractRemoteId(
      "hentairead",
      "https://hentairead.com/hentai/foo-bar/english/p/1/",
    ),
    "foo-bar",
  );
  assert.equal(
    extractRemoteId("hentainexus", "https://hentainexus.com/read/21161"),
    "21161",
  );
  assert.equal(
    extractRemoteId("hentai2read", "https://hentai2read.com/some-title/12/"),
    "some-title/12",
  );
  assert.equal(
    hentaiReadLanguageFromUrl("https://hentairead.com/hentai/foo/english/p/1/"),
    "english",
  );
  assert.equal(canonicalUrl("nhentai", "289857"), "https://nhentai.net/g/289857/");
  assert.equal(
    refererForImage("https://i3.nhentai.net/galleries/1/2.webp"),
    "https://nhentai.net/",
  );
  assert.equal(
    refererForImage("https://henread.xyz/manga/1/page.webp"),
    "https://hentairead.com/",
  );
  assert.equal(
    refererForImage("https://images.hentainexus.com/v2/x.jpg"),
    "https://hentainexus.com/",
  );
  assert.equal(
    refererForImage("https://static.hentaicdn.com/hentai/abc.jpg"),
    "https://hentai2read.com/",
  );
  assert.equal(
    refererForImage("https://bucket.r2.cloudflarestorage.com/cover.webp"),
    undefined,
  );

  assert.throws(
    () => identifySite("https://hitomi.la/galleries/1.html"),
    /Unknown chapter host/,
  );

  const fromString = parseChaptersJson(
    JSON.stringify(["https://nhentai.net/g/289857/"]),
  );
  assert.equal(fromString.length, 1);
  assert.equal(fromString[0]?.key, "nhentai:289857");
  assert.equal(fromString[0]?.number, 1);
  assert.equal(fromString[0]?.site, "nhentai");

  const mixed = parseChaptersJson(
    readFileSync(
      resolve("examples/r2-merge-layout/manga/torokase-orgasm/chapters.json"),
      "utf8",
    ),
  );
  assert.equal(mixed.length, 3);
  assert.equal(mixed[0]?.key, "nhentai:289857");
  assert.equal(mixed[1]?.key, "hentairead:example-slug");
  assert.equal(mixed[2]?.key, "hentainexus:21161");
  assert.equal(mixed[2]?.url, "https://hentainexus.com/view/21161");
  assert.equal(mixed[0]?.title, "Chapter 1");
  assert.equal(findChapter(mixed, "hentairead:example-slug").number, 2);

  const numberedTitle = parseChapterEntry(
    { title: "Chapter 12 - Extra", url: "https://nhentai.net/g/1/" },
    0,
  );
  assert.equal(numberedTitle.number, 12);

  const noFalseNumber = parseChapterEntry(
    { url: "https://nhentai.net/g/289857/" },
    4,
  );
  assert.equal(noFalseNumber.number, 5);
  assert.equal(noFalseNumber.title, "nhentai 289857");

  const staticPages = parseChaptersJson(
    JSON.stringify({
      chapters: [
        {
          title: "Local",
          pages: ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
        },
      ],
    }),
  );
  assert.equal(staticPages[0]?.key, "pages:0");
  const staticResolved = await pagesForChapter(
    { client: {} as never },
    staticPages[0]!,
  );
  assert.equal(staticResolved.length, 2);
  assert.equal(staticResolved[0]?.url, "https://cdn.example/1.jpg");

  const dupes = parseChaptersJson(
    JSON.stringify(["https://nhentai.net/g/1/", "https://nhentai.net/g/1/"]),
  );
  assert.equal(dupes[0]?.key, "nhentai:1");
  assert.equal(dupes[1]?.key, "nhentai:1#2");

  const reader = readFileSync(
    resolve("src/sources/hentairead/fixtures/reader.html"),
    "utf8",
  );
  const hrPages = parseChapterPages(reader);
  assert.ok(hrPages.length >= 3, `expected HR pages, got ${hrPages.length}`);

  assert.equal(R2Merge.info.id, "en.r2-merge");
  assert.equal(R2Merge.info.name, "R2 Merge");
  const source = new R2Merge();
  const home = await source.getHomePage();
  assert.equal(home.feeds[0]?.id, "library");
  const config = source.getConfiguration() as {
    useClientForImageRequests?: boolean;
    cloudflareResolutionURL?: string;
  };
  assert.equal(config.useClientForImageRequests, true);
  assert.ok(config.cloudflareResolutionURL?.includes("hentairead.com"));

  const imageReq = await source.willRequestImage({
    url: "https://i2.nhentai.net/galleries/1/1.webp",
  });
  assert.equal(imageReq.headers?.Referer, "https://nhentai.net/");

  const stt = "dist/sources/r2-merge.stt";
  if (existsSync(stt)) {
    const head = readFileSync(stt).subarray(0, 512).toString("utf8");
    assert(
      head.startsWith('"use httpclient"') || head.includes('"use httpclient"'),
      `stt missing httpclient directive: ${head.slice(0, 80)}`,
    );
  }

  console.log("r2-merge tests OK");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
