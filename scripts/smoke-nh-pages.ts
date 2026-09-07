import emulate from "@suwatte/toolchain/emulator";
import NH from "../src/sources/nhentai/index.ts";

const run = async () => {
  const s = emulate(NH);
  const list = await s.getItemList({ key: "popular" }, 1);
  const id = list.items[0]!.id;
  const ch = await s.getChapters!(id);
  const pages = await s.getChapterPages!(id, ch[0]!.id);
  console.log("nh popular first", list.items[0]?.title);
  console.log("nh pages", pages.length, pages[0]?.url?.slice(0, 80));
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
