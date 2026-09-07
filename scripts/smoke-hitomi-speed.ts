import emulate from "@suwatte/toolchain/emulator";
import Hitomi from "../src/sources/hitomi/index.ts";
import { base64Decode, bytesToBase64 } from "../src/sources/_shared/base64.ts";

const run = async () => {
  const sample = JSON.stringify({
    data: { chapter: { images: [{ src: "x.webp" }] } },
  });
  const enc = bytesToBase64(new TextEncoder().encode(sample));
  if (base64Decode(enc) !== sample) throw new Error("b64 fail");
  console.log("b64 OK");

  const hit = emulate(Hitomi);
  const home = await hit.getHomePage!();
  const key = home.feeds[0]!.content.list!.key;
  const list = await hit.getItemList({ key }, 1);
  const id = list.items[0]!.id;
  const ch = await hit.getChapters!(id);
  const t1 = Date.now();
  const pages = await hit.getChapterPages!(id, ch[0]!.id);
  console.log("hitomi pages", pages.length, "ms", Date.now() - t1);
  console.log("first", pages[0]?.url?.slice(0, 80));
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
