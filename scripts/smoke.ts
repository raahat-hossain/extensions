import emulate from "@suwatte/toolchain/emulator";
import {
  ChapterSchema,
  ContentSchema,
  ItemSchema,
} from "@suwatte/toolchain/validate";
import Target from "../src/sources/static-demo/index.ts";

const source = emulate(Target);

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = async () => {
  const search = await source.getSearchResults({}, 1);
  assert(search.items.length === 2, `expected 2 search hits, got ${search.items.length}`);
  for (const item of search.items) ItemSchema.parse(item);

  const filtered = await source.getSearchResults(
    { query: "harbor", sort: { key: "title", ascending: true } },
    1,
  );
  assert(filtered.items.length === 1, "harbor query should return one title");
  assert(filtered.items[0]?.id === "harbor-lights", "harbor query id mismatch");

  const content = await source.getContent("static-signal");
  ContentSchema.parse(content);
  assert(content.title === "The Static Signal", "content title mismatch");
  assert(content.genres?.length, "expected genres");
  assert(content.credits?.length, "expected credits");
  assert(content.characters?.length, "expected characters");
  assert(content.collections?.length, "expected collections");
  assert(content.endpoints?.anilist, "expected anilist endpoint");

  ContentSchema.parse(await source.getContent("harbor-lights"));

  const chapters = await source.getChapters!("static-signal");
  assert(chapters.length === 1, "expected one chapter");
  for (const chapter of chapters) ChapterSchema.parse(chapter);

  const pages = await source.getChapterPages!("static-signal", chapters[0]!.id);
  assert(pages.length === 2, "expected two pages");
  assert(pages.every((page) => !!page.url), "pages should expose urls");

  const harborPages = await source.getChapterPages!(
    "harbor-lights",
    (await source.getChapters!("harbor-lights"))[0]!.id,
  );
  assert(harborPages.length === 2, "harbor should also have two pages");

  const home = await source.getHomePage!();
  assert(home.feeds.length >= 1, "expected homepage feeds");

  const list = await source.getItemList({ key: "all" }, 1);
  assert(list.items.length === 2, "expected full catalog list");

  console.log("smoke ok");
  console.log(
    JSON.stringify(
      {
        titles: search.items.map((item) => item.title),
        chapterPages: pages.length,
        feeds: home.feeds.map((feed) => feed.title),
      },
      null,
      2,
    ),
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
