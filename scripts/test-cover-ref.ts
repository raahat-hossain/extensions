import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { installEmulatorGlobals } from "@suwatte/toolchain/emulator";
import {
  chapterNameMatches,
  extractArchivePageDataUrl,
  findArchiveByChapterName,
  parseChapterPageRef,
} from "../src/sources/r2-library/archive.ts";
import {
  encodePagesChapter,
  parseChaptersJson,
} from "../src/sources/r2-library/chapters.ts";
import { tryIdentifySite } from "../src/sources/r2-library/sites.ts";

installEmulatorGlobals();

assert.deepEqual(parseChapterPageRef("chapter 4_24.png"), {
  chapter: "chapter 4",
  page: "24.png",
});
assert.deepEqual(parseChapterPageRef("Chapter 1_1"), {
  chapter: "Chapter 1",
  page: "1",
});
assert.deepEqual(parseChapterPageRef("Prologue_001.jpg"), {
  chapter: "Prologue",
  page: "001.jpg",
});
assert.equal(parseChapterPageRef("https://example.org/cover.jpg"), null);
assert.equal(parseChapterPageRef("cover.png"), null);

assert.equal(chapterNameMatches("Chapter 001", "Chapter 1"), true);
assert.equal(chapterNameMatches("001 - Chapter 1.cbz", "Chapter 1"), true);

const archives = [
  { key: "manga/demo/001 - prologue.cbz", name: "001 - prologue.cbz" },
  { key: "manga/demo/chapter 4.cbz", name: "chapter 4.cbz" },
];
assert.equal(
  findArchiveByChapterName(archives, "chapter 4")?.name,
  "chapter 4.cbz",
);
assert.equal(
  findArchiveByChapterName(archives, "prologue")?.name,
  "001 - prologue.cbz",
);

const archiveBytes = zipSync({
  "pages/23.png": new Uint8Array([1, 2, 3]),
  "pages/24.png": new Uint8Array([9, 8, 7]),
});
const dataUrl = extractArchivePageDataUrl(archiveBytes, "24.png");
assert.match(dataUrl, /^data:image\/png;base64,/);
assert.ok(dataUrl.endsWith(Buffer.from([9, 8, 7]).toString("base64")));
assert.ok(extractArchivePageDataUrl(archiveBytes, "2").endsWith(Buffer.from([9, 8, 7]).toString("base64")));

assert.equal(tryIdentifySite("https://nhentai.net/g/289857/"), "nhentai");
assert.equal(tryIdentifySite("https://hentairead.com/hentai/foo/"), "hentairead");
assert.equal(tryIdentifySite("https://hitomi.la/galleries/123.html"), "hitomi");
assert.equal(tryIdentifySite("https://cdn.example.com/ch.cbz"), null);

const fromDetails = parseChaptersJson(
  JSON.stringify({
    title: "Demo",
    chapters: [
      { title: "Chapter 1", number: 1, url: "https://nhentai.net/g/289857/" },
      { title: "Chapter 2", url: "https://hitomi.la/galleries/123.html" },
      { title: "Chapter 3", url: "Chapter 003.cbz" },
    ],
  }),
  "series/demo",
);
assert.equal(fromDetails.length, 3);
assert.equal(fromDetails[0]?.url, "https://nhentai.net/g/289857/");
assert.equal(fromDetails[2]?.url, "series/demo/Chapter 003.cbz");

const fromArray = parseChaptersJson(
  JSON.stringify(["https://nhentai.net/g/1/", { pages: ["https://a/1.jpg", "https://a/2.jpg"] }]),
);
assert.equal(fromArray.length, 2);
assert.ok(fromArray[1]?.url.startsWith("pages:"));
assert.equal(encodePagesChapter(["https://a/1.jpg"]).startsWith("pages:"), true);

console.log("r2 library chapter + cover tests ok");
