import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { installEmulatorGlobals } from "@suwatte/toolchain/emulator";
import {
  extractArchivePageDataUrl,
  findArchiveByChapterName,
  parseChapterPageRef,
} from "../src/sources/r2-library/archive.ts";

installEmulatorGlobals();

assert.deepEqual(parseChapterPageRef("chapter 4_24.png"), {
  chapter: "chapter 4",
  page: "24.png",
});
assert.deepEqual(parseChapterPageRef("Prologue_001.jpg"), {
  chapter: "Prologue",
  page: "001.jpg",
});
assert.equal(parseChapterPageRef("https://example.org/cover.jpg"), null);
assert.equal(parseChapterPageRef("cover.png"), null);

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

console.log("chapter cover ref tests ok");
