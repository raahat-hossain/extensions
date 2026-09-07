import { base64Decode, bytesToBase64 } from "../src/sources/_shared/base64.ts";
import emulate from "@suwatte/toolchain/emulator";
import NH from "../src/sources/nhentai/index.ts";

const run = async () => {
  const sample = JSON.stringify({
    data: { chapter: { images: [{ src: "a.jpg" }] } },
  });
  const enc = bytesToBase64(new TextEncoder().encode(sample));
  const dec = base64Decode(enc);
  if (dec !== sample) throw new Error("base64 roundtrip failed");
  console.log("base64 OK");

  const s = emulate(NH);
  const popular = await s.getItemList({ key: "popular" }, 1);
  if (!popular.items.length) throw new Error("nh popular empty");
  console.log("nh popular", popular.items.length, popular.items[0]?.title);

  const latest = await s.getItemList({ key: "latest" }, 1);
  if (!latest.items.length) throw new Error("nh latest empty");
  console.log("nh latest", latest.items.length);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
