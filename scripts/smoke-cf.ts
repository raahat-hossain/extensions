import { installEmulatorGlobals, CloudflareError } from "@suwatte/toolchain/emulator";
import {
  looksLikeCloudflare,
  originOf,
  throwCloudflare,
} from "../src/sources/_shared/cloudflare.ts";
import HentaiRead from "../src/sources/hentairead/index.ts";

installEmulatorGlobals();

if (!looksLikeCloudflare("Just a moment... cf-chl")) throw new Error("detect fail");
if (originOf("https://hentairead.com/hentai/?x=1") !== "https://hentairead.com/") {
  throw new Error("origin fail");
}

try {
  throwCloudflare("https://hentairead.com/");
} catch (error) {
  if (!(error instanceof CloudflareError)) throw error;
  if (error.resolutionURL !== "https://hentairead.com/") throw new Error("url");
  console.log("CloudflareError OK", error.resolutionURL);
}

const cfg = new HentaiRead().getConfiguration() as {
  cloudflareResolutionURL?: string;
};
if (cfg.cloudflareResolutionURL !== "https://hentairead.com/") {
  throw new Error(`missing resolution url: ${JSON.stringify(cfg)}`);
}
console.log("hentairead config OK", cfg.cloudflareResolutionURL);
