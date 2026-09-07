import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { isImageName } from "../src/sources/r2-library/archive.ts";
import {
  dataUrlForPage,
  listImageKeys,
  openArchiveSession,
  parsePageUrl,
} from "../src/sources/r2-library/pages.ts";

assert.equal(isImageName("01.png"), true);
assert.equal(isImageName("cover.jpg"), true);
assert.equal(isImageName("ch1.cbz"), false);

assert.deepEqual(
  listImageKeys([
    "title/ch1/10.png",
    "title/ch1/2.png",
    "title/ch1/cover.jpg",
    "title/ch1/notes.txt",
  ]),
  ["title/ch1/2.png", "title/ch1/10.png", "title/ch1/cover.jpg"],
);

const archive = zipSync({
  "page-02.png": new Uint8Array([137, 80, 78, 71, 2]),
  "page-01.png": new Uint8Array([137, 80, 78, 71, 1]),
});
const { sessionId, urls } = openArchiveSession(archive);
assert.equal(urls.length, 2);
assert.deepEqual(parsePageUrl(urls[0]!), { sessionId, index: 0 });
assert.ok(dataUrlForPage(urls[0]!)?.startsWith("data:image/png;base64,"));

console.log("r2 folder/pages helpers ok");
