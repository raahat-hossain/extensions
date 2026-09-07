import assert from "node:assert/strict";
import { zipSync } from "fflate";
import {
  dataUrlForPage,
  openArchiveSession,
  parsePageUrl,
} from "../src/sources/r2-library/pages.ts";

const archive = zipSync({
  "page-02.png": new Uint8Array([137, 80, 78, 71, 2]),
  "page-01.png": new Uint8Array([137, 80, 78, 71, 1]),
  "__MACOSX/._page-01.png": new Uint8Array([1, 2, 3]),
});

const { sessionId, urls } = openArchiveSession(archive);
assert.equal(urls.length, 2);
assert.ok(urls[0]?.includes(sessionId));
assert.deepEqual(parsePageUrl(urls[0]!), { sessionId, index: 0 });

const data0 = dataUrlForPage(urls[0]!);
const data1 = dataUrlForPage(urls[1]!);
assert.ok(data0?.startsWith("data:image/png;base64,"));
assert.ok(data1?.startsWith("data:image/png;base64,"));
assert.notEqual(data0, data1);

console.log("r2 page session ok", sessionId, urls.length);
